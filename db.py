"""Postgres persistence for Grid Down runs and scenes."""

import json
import os

from sqlalchemy import create_engine, text

_engine = None

SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        player_name TEXT NOT NULL,
        home_town TEXT NOT NULL,
        waiting_for TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        health INT NOT NULL DEFAULT 100,
        energy INT NOT NULL DEFAULT 100,
        supplies INT NOT NULL DEFAULT 100,
        morale INT NOT NULL DEFAULT 100,
        distance_miles INT NOT NULL DEFAULT 190,
        day INT NOT NULL DEFAULT 1,
        hour INT NOT NULL DEFAULT 18,
        inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
        flags JSONB NOT NULL DEFAULT '[]'::jsonb,
        ending_title TEXT,
        ending_text TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS scenes (
        id BIGSERIAL PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        seq INT NOT NULL,
        title TEXT NOT NULL,
        narrative TEXT NOT NULL,
        choices JSONB NOT NULL DEFAULT '[]'::jsonb,
        chosen_index INT,
        chosen_text TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (run_id, seq)
    )
    """,
    "CREATE INDEX IF NOT EXISTS scenes_run_idx ON scenes (run_id, seq)",
    """
    CREATE TABLE IF NOT EXISTS save_points (
        id BIGSERIAL PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS save_points_run_idx ON save_points (run_id, created_at)",
]


def get_engine():
    global _engine
    if _engine is None:
        url = os.environ.get("DB2BCC54CB_DATABASE_URL")
        if not url:
            raise RuntimeError("DB2BCC54CB_DATABASE_URL is not set")
        _engine = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)
    return _engine


def init_db() -> None:
    with get_engine().begin() as conn:
        for stmt in SCHEMA:
            conn.execute(text(stmt))


RUN_COLUMNS = (
    "id, created_at, updated_at, player_name, home_town, waiting_for, status, "
    "health, energy, supplies, morale, distance_miles, day, hour, inventory, "
    "flags, ending_title, ending_text"
)


def _row_to_run(row) -> dict:
    d = dict(row._mapping)
    d["inventory"] = d.get("inventory") or []
    d["flags"] = d.get("flags") or []
    for key in ("created_at", "updated_at"):
        if d.get(key) is not None:
            d[key] = d[key].isoformat()
    return d


def _row_to_scene(row) -> dict:
    d = dict(row._mapping)
    d["choices"] = d.get("choices") or []
    if d.get("created_at") is not None:
        d["created_at"] = d["created_at"].isoformat()
    return d


def create_run(run: dict) -> dict:
    with get_engine().begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO runs (id, player_name, home_town, waiting_for, status,
                    health, energy, supplies, morale, distance_miles, day, hour,
                    inventory, flags)
                VALUES (:id, :player_name, :home_town, :waiting_for, 'active',
                    :health, :energy, :supplies, :morale, :distance_miles, :day, :hour,
                    CAST(:inventory AS jsonb), CAST(:flags AS jsonb))
                """
            ),
            {
                **run,
                "inventory": json.dumps(run.get("inventory", [])),
                "flags": json.dumps(run.get("flags", [])),
            },
        )
    return get_run(run["id"])


def get_run(run_id: str) -> dict | None:
    with get_engine().connect() as conn:
        row = conn.execute(
            text(f"SELECT {RUN_COLUMNS} FROM runs WHERE id = :id"), {"id": run_id}
        ).first()
    return _row_to_run(row) if row else None


def list_runs(limit: int = 30) -> list[dict]:
    with get_engine().connect() as conn:
        rows = conn.execute(
            text(
                f"SELECT {RUN_COLUMNS} FROM runs ORDER BY updated_at DESC LIMIT :limit"
            ),
            {"limit": limit},
        ).fetchall()
    return [_row_to_run(r) for r in rows]


def update_run(run_id: str, fields: dict) -> dict:
    if not fields:
        return get_run(run_id)
    sets = []
    params = {"id": run_id}
    for key, value in fields.items():
        if key in ("inventory", "flags"):
            sets.append(f"{key} = CAST(:{key} AS jsonb)")
            params[key] = json.dumps(value)
        else:
            sets.append(f"{key} = :{key}")
            params[key] = value
    sets.append("updated_at = now()")
    with get_engine().begin() as conn:
        conn.execute(
            text(f"UPDATE runs SET {', '.join(sets)} WHERE id = :id"), params
        )
    return get_run(run_id)


def delete_run(run_id: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM runs WHERE id = :id"), {"id": run_id})


def add_scene(run_id: str, seq: int, scene: dict) -> dict:
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO scenes (run_id, seq, title, narrative, choices)
                VALUES (:run_id, :seq, :title, :narrative, CAST(:choices AS jsonb))
                RETURNING id, run_id, seq, title, narrative, choices,
                    chosen_index, chosen_text, created_at
                """
            ),
            {
                "run_id": run_id,
                "seq": seq,
                "title": scene["title"],
                "narrative": scene["narrative"],
                "choices": json.dumps(scene["choices"]),
            },
        ).first()
    return _row_to_scene(row)


def get_scenes(run_id: str) -> list[dict]:
    with get_engine().connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, run_id, seq, title, narrative, choices,
                    chosen_index, chosen_text, created_at
                FROM scenes WHERE run_id = :run_id ORDER BY seq ASC
                """
            ),
            {"run_id": run_id},
        ).fetchall()
    return [_row_to_scene(r) for r in rows]


def record_choice(run_id: str, seq: int, index: int, text_value: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(
            text(
                """
                UPDATE scenes SET chosen_index = :index, chosen_text = :text_value
                WHERE run_id = :run_id AND seq = :seq
                """
            ),
            {"run_id": run_id, "seq": seq, "index": index, "text_value": text_value},
        )


SNAPSHOT_RUN_FIELDS = (
    "player_name",
    "home_town",
    "waiting_for",
    "health",
    "energy",
    "supplies",
    "morale",
    "distance_miles",
    "day",
    "hour",
    "inventory",
    "flags",
)


def _row_to_save(row) -> dict:
    d = dict(row._mapping)
    if d.get("created_at") is not None:
        d["created_at"] = d["created_at"].isoformat()
    d.pop("snapshot", None)
    return d


def create_save_point(run_id: str, name: str) -> dict | None:
    run = get_run(run_id)
    if not run:
        return None
    scenes = get_scenes(run_id)
    snapshot = {
        "run": {key: run[key] for key in SNAPSHOT_RUN_FIELDS},
        "scenes": [
            {
                "seq": s["seq"],
                "title": s["title"],
                "narrative": s["narrative"],
                "choices": s["choices"],
                "chosen_index": s["chosen_index"],
                "chosen_text": s["chosen_text"],
            }
            for s in scenes
        ],
    }
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO save_points (run_id, name, snapshot)
                VALUES (:run_id, :name, CAST(:snapshot AS jsonb))
                RETURNING id, run_id, name, created_at
                """
            ),
            {"run_id": run_id, "name": name, "snapshot": json.dumps(snapshot)},
        ).first()
    return _row_to_save(row)


def list_save_points(run_id: str) -> list[dict]:
    with get_engine().connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, run_id, name, created_at,
                    snapshot->'run'->>'distance_miles' AS distance_miles,
                    snapshot->'run'->>'day' AS day
                FROM save_points WHERE run_id = :run_id
                ORDER BY created_at DESC
                """
            ),
            {"run_id": run_id},
        ).fetchall()
    out = []
    for r in rows:
        d = _row_to_save(r)
        d["distance_miles"] = int(d["distance_miles"] or 0)
        d["day"] = int(d["day"] or 1)
        out.append(d)
    return out


def delete_save_point(save_id: int) -> None:
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM save_points WHERE id = :id"), {"id": save_id})


def resume_save_point(save_id: int, new_run_id: str) -> str | None:
    """Copy a save point into a new independent run. The original run is left untouched."""
    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT snapshot FROM save_points WHERE id = :id"), {"id": save_id}
        ).first()
    if not row:
        return None
    snapshot = row[0]
    run = {key: snapshot["run"][key] for key in SNAPSHOT_RUN_FIELDS}
    create_run({"id": new_run_id, **run})
    for s in snapshot["scenes"]:
        add_scene(new_run_id, s["seq"], s)
        if s["chosen_index"] is not None:
            record_choice(new_run_id, s["seq"], s["chosen_index"], s["chosen_text"])
    return new_run_id
