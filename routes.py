import os
import uuid

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import db
import story

STARTING_MILES = 190


class NewRun(BaseModel):
    player_name: str = Field(default="Alex", max_length=40)
    home_town: str = Field(default="Marlowe, Ohio", max_length=60)
    waiting_for: str = Field(default="your daughter, June", max_length=80)


class Choice(BaseModel):
    index: int


class SaveName(BaseModel):
    name: str = Field(default="Save point", max_length=60)


def _clamp(value: int, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, value))


def _apply_effects(run: dict, choice: dict) -> dict:
    effects = choice.get("effects") or {}
    inventory = list(run.get("inventory") or [])
    for item in choice.get("remove_items") or []:
        if item in inventory:
            inventory.remove(item)
    for item in choice.get("add_items") or []:
        if item not in inventory:
            inventory.append(item)

    flags = list(run.get("flags") or [])
    for flag in choice.get("flags") or []:
        if flag not in flags:
            flags.append(flag)

    hour = run["hour"] + int(effects.get("hours", 0) or 0)
    day = run["day"]
    while hour >= 24:
        hour -= 24
        day += 1

    hours = int(effects.get("hours", 0) or 0)
    energy = _clamp(run["energy"] + int(effects.get("energy", 0) or 0))
    health = _clamp(run["health"] + int(effects.get("health", 0) or 0))
    morale = _clamp(run["morale"] + int(effects.get("morale", 0) or 0))
    # Time on the road burns food and water.
    supplies = _clamp(run["supplies"] + int(effects.get("supplies", 0) or 0) - hours)
    # Running on empty grinds you down.
    if energy == 0:
        health = _clamp(health - 8)
        morale = _clamp(morale - 5)
    # So does going without food and water.
    if supplies == 0:
        health = _clamp(health - 6)
        morale = _clamp(morale - 4)

    return {
        "health": health,
        "energy": energy,
        "supplies": supplies,
        "morale": morale,
        "distance_miles": max(0, run["distance_miles"] - int(effects.get("miles", 0) or 0)),
        "day": day,
        "hour": hour,
        "inventory": inventory[:12],
        "flags": flags[-24:],
    }


def _outcome(run: dict) -> str | None:
    if run["distance_miles"] <= 0:
        return "home"
    if run["health"] <= 0:
        return "dead"
    if run["morale"] <= 0:
        return "giveup"
    return None


def _bundle(run_id: str) -> dict:
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run": run, "scenes": db.get_scenes(run_id)}


def create_app(static_dir: str) -> FastAPI:
    db.init_db()

    api = APIRouter()

    @api.get("/health")
    def health():
        return {"ok": True}

    @api.get("/runs")
    def list_runs():
        return {"runs": db.list_runs()}

    @api.post("/runs")
    def new_run(payload: NewRun):
        run_id = uuid.uuid4().hex[:12]
        run = db.create_run(
            {
                "id": run_id,
                "player_name": payload.player_name.strip() or "Alex",
                "home_town": payload.home_town.strip() or "Marlowe, Ohio",
                "waiting_for": payload.waiting_for.strip() or "your family",
                "health": 100,
                "energy": 100,
                "supplies": 100,
                "morale": 100,
                "distance_miles": STARTING_MILES,
                "day": 1,
                "hour": 18,
                "inventory": ["a canvas bag", "a dead phone", "half a granola bar"],
                "flags": [],
            }
        )
        try:
            scene = story.opening_scene(run)
        except Exception:
            scene = story.fallback_scene(run)
        db.add_scene(run_id, 1, scene)
        return _bundle(run_id)

    @api.get("/runs/{run_id}")
    def get_run(run_id: str):
        return _bundle(run_id)

    @api.delete("/runs/{run_id}")
    def remove_run(run_id: str):
        if not db.get_run(run_id):
            raise HTTPException(status_code=404, detail="Run not found")
        db.delete_run(run_id)
        return {"ok": True}

    @api.get("/saves")
    def list_all_saves():
        return {"saves": db.list_all_save_points()}

    @api.get("/runs/{run_id}/saves")
    def list_saves(run_id: str):
        if not db.get_run(run_id):
            raise HTTPException(status_code=404, detail="Run not found")
        return {"saves": db.list_save_points(run_id)}

    @api.post("/runs/{run_id}/saves")
    def create_save(run_id: str, payload: SaveName):
        name = payload.name.strip() or "Save point"
        save = db.create_save_point(run_id, name[:60])
        if not save:
            raise HTTPException(status_code=404, detail="Run not found")
        return save

    @api.delete("/saves/{save_id}")
    def remove_save(save_id: int):
        db.delete_save_point(save_id)
        return {"ok": True}

    @api.post("/saves/{save_id}/resume")
    def resume_save(save_id: int):
        new_run_id = uuid.uuid4().hex[:12]
        if not db.resume_save_point(save_id, new_run_id):
            raise HTTPException(status_code=404, detail="Save point not found")
        return _bundle(new_run_id)

    @api.post("/runs/{run_id}/choose")
    def choose(run_id: str, payload: Choice):
        run = db.get_run(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        if run["status"] != "active":
            raise HTTPException(status_code=409, detail="This run has already ended")

        scenes = db.get_scenes(run_id)
        if not scenes:
            raise HTTPException(status_code=409, detail="Run has no scenes")
        current = scenes[-1]
        choices = current.get("choices") or []
        if not 0 <= payload.index < len(choices):
            raise HTTPException(status_code=400, detail="Invalid choice")

        choice = choices[payload.index]
        db.record_choice(run_id, current["seq"], payload.index, choice["label"])

        updated = db.update_run(run_id, _apply_effects(run, choice))
        outcome = _outcome(updated)

        if outcome:
            try:
                final = story.ending_scene(updated, scenes, outcome)
            except Exception:
                final = {
                    "title": "The End of the Road",
                    "narrative": "The road ends here, one way or another.",
                    "choices": [],
                }
            db.add_scene(run_id, current["seq"] + 1, final)
            db.update_run(
                run_id,
                {
                    "status": "ended",
                    "ending_title": final["title"],
                    "ending_text": final["narrative"],
                },
            )
        else:
            try:
                nxt = story.next_scene(updated, scenes, choice)
            except Exception:
                nxt = story.fallback_scene(updated)
            db.add_scene(run_id, current["seq"] + 1, nxt)

        return _bundle(run_id)

    app = FastAPI()
    app.include_router(api, prefix="/api")

    if os.path.isdir(static_dir):
        assets_dir = os.path.join(static_dir, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{path:path}")
        async def spa_fallback(request: Request, path: str):
            file_path = os.path.join(static_dir, path)
            if path and os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(
                os.path.join(static_dir, "index.html"),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )

    return app
