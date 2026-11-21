"""Gemini-driven story engine for Grid Down."""

import json
import os
import random
import re

from google import genai
from google.genai import types

MODEL = "gemini-3.8-flash"

_client = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(
            api_key=os.environ.get("GEMINI_WORKSHOP_API_KEY"),
            http_options={
                "api_version": "v1alpha",
                "base_url": os.environ.get("GEMINI_WORKSHOP_BASE_URL"),
            },
        )
    return _client


SYSTEM = """You are the narrator of GRID DOWN, a grounded, realistic survival story.

PREMISE: A coordinated attack has collapsed the electrical grid of the United States.
No power, no phones, no internet, no fuel pumps, no card payments, no running water in
most places. It is not the apocalypse — it is a slow, grinding emergency. Most people are
frightened but not hostile. Some are dangerous. Institutions are stretched thin.

The player is a single ordinary person trying to walk/ride/drive roughly 190 miles home
to their family. They are not a soldier or a prepper. They are tired, hungry, and scared.

VOICE:
- Second person, present tense ("You step over the fallen line...").
- Lean, concrete, sensory prose. No purple prose, no fantasy, no sci-fi gadgets.
- 2 to 4 short paragraphs, 120-220 words total.
- Ground every scene in a specific place and a specific problem: water, weather, a
  locked door, a stranger, a bridge, a dog, a wound, a decision about a car.
- Consequences are real and physical. Injuries persist. Kindness and cruelty both echo.
- Never resolve the journey for the player. Never write their dialogue for them beyond
  a line or two of reported speech.

MECHANICS:
- Each scene offers exactly 3 choices. They must be genuinely different strategies
  (e.g. cautious / bold / humane), not three flavors of the same action.
- Effects are integers. Typical ranges: health -25..+10, energy -25..+15,
  supplies -30..+25, morale -20..+15, miles 0..25 (miles = progress toward home),
  hours 1..8 (time that passes).
- Pacing: the whole journey should take roughly 12-18 scenes. A choice that involves
  travelling should usually cover 8-20 miles. Do not let the player crawl.
- Only include an effect key when it changes. Never give a choice all-positive effects.
- At least one choice must move the player forward (miles > 0). The journey must always
  be able to progress; never offer three choices that all keep them in place.
- At least one choice per scene must offer real recovery (energy > 0 or supplies > 0 or
  health > 0). The player must always have a way to stop and rest, eat, or drink.
- Supplies are consumed by time on the road, so scenes should sometimes offer food,
  water, or a place to resupply.
- add_items / remove_items are short item names ("half-full water bottle").
- flags are short memory tags ("helped the stranded nurse", "took the rifle").

Return ONLY valid JSON matching the requested shape. No markdown fences."""


SCENE_SHAPE = """{
  "title": "3-6 word scene title",
  "narrative": "the scene prose",
  "choices": [
    {
      "label": "short imperative action, max 8 words",
      "detail": "one sentence of what this costs or risks",
      "effects": {"health": 0, "energy": -10, "supplies": 0, "morale": 0, "miles": 8, "hours": 3},
      "add_items": [],
      "remove_items": [],
      "flags": []
    }
  ]
}"""


def _state_block(run: dict) -> str:
    inv = ", ".join(run.get("inventory") or []) or "nothing but the clothes on their back"
    flags = "; ".join(run.get("flags") or []) or "none yet"
    return f"""PLAYER: {run['player_name']}
HOME: {run['home_town']}
WAITING AT HOME: {run['waiting_for']}
DAY {run['day']}, {run['hour']:02d}:00
MILES FROM HOME: {run['distance_miles']}
HEALTH {run['health']}/100 | ENERGY {run['energy']}/100 | SUPPLIES {run['supplies']}/100 | MORALE {run['morale']}/100
CARRYING: {inv}
STORY MEMORY: {flags}"""


def _history_block(scenes: list[dict], limit: int = 6) -> str:
    if not scenes:
        return "This is the opening scene."
    lines = []
    for s in scenes[-limit:]:
        line = f"- [{s['title']}] {s['narrative'][:280]}"
        if s.get("chosen_text"):
            line += f"  >> Player chose: {s['chosen_text']}"
        lines.append(line)
    return "\n".join(lines)


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            return json.loads(raw[start : end + 1])
        raise


def _normalize(scene: dict) -> dict:
    choices = []
    for c in (scene.get("choices") or [])[:3]:
        effects = {}
        for key in ("health", "energy", "supplies", "morale", "miles", "hours"):
            try:
                effects[key] = int(c.get("effects", {}).get(key, 0) or 0)
            except (TypeError, ValueError):
                effects[key] = 0
        choices.append(
            {
                "label": str(c.get("label", "Keep moving"))[:90],
                "detail": str(c.get("detail", ""))[:200],
                "effects": effects,
                "add_items": [str(i)[:60] for i in (c.get("add_items") or [])][:3],
                "remove_items": [str(i)[:60] for i in (c.get("remove_items") or [])][:3],
                "flags": [str(f)[:80] for f in (c.get("flags") or [])][:3],
            }
        )
    while len(choices) < 3:
        choices.append(
            {
                "label": "Push on regardless",
                "detail": "You have no better idea, so you keep moving.",
                "effects": {"energy": -12, "miles": 6, "hours": 3},
                "add_items": [],
                "remove_items": [],
                "flags": [],
            }
        )
    if not any(c["effects"].get("miles", 0) > 0 for c in choices):
        choices[0]["effects"]["miles"] = 6
        choices[0]["effects"].setdefault("hours", 3)
    if not any(
        c["effects"].get(k, 0) > 0 for c in choices for k in ("energy", "supplies", "health")
    ):
        choices[-1]["effects"]["energy"] = 15
        choices[-1]["effects"].setdefault("hours", 4)
    return {
        "title": str(scene.get("title", "The Road"))[:80],
        "narrative": str(scene.get("narrative", "")).strip(),
        "choices": choices,
    }


def _generate(prompt: str) -> dict:
    response = get_client().models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM,
            temperature=1.0,
            response_mime_type="application/json",
        ),
    )
    return _normalize(_parse_json(response.text or ""))


def opening_scene(run: dict) -> dict:
    prompt = f"""{_state_block(run)}

Write the OPENING scene. The grid has been down for about six hours. The player is far
from home and has just understood that this is not a local outage. Establish where they
are, what they have, and the first hard choice. Do not mention the miles remaining as a
number — let the distance feel enormous.

Return JSON in this shape:
{SCENE_SHAPE}"""
    return _generate(prompt)


def next_scene(run: dict, scenes: list[dict], chosen: dict) -> dict:
    prompt = f"""{_state_block(run)}

RECENT STORY:
{_history_block(scenes)}

The player just chose: "{chosen['label']}" — {chosen.get('detail', '')}

Write the NEXT scene. Show the immediate consequence of that choice, then put a new
obstacle in front of them. Keep continuity with the story memory and the items they carry.
If they are close to home (under 40 miles), the pressure of the last stretch should show.

Return JSON in this shape:
{SCENE_SHAPE}"""
    return _generate(prompt)


def ending_scene(run: dict, scenes: list[dict], outcome: str) -> dict:
    if outcome == "home":
        instruction = (
            "Write the FINAL scene. The player has reached home. Make the arrival earned and "
            "specific — who is at the door, what the house looks like after days without power, "
            "what it costs to have made it. Do not summarize the whole journey; land on one image."
        )
    elif outcome == "dead":
        instruction = (
            "Write the FINAL scene. The player's body has given out. It is quiet and unsentimental. "
            "Show the last thing they see and the distance they did not close. No melodrama."
        )
    else:
        instruction = (
            "Write the FINAL scene. The player has given up — they stop walking and let the road win. "
            "Show the moment of surrender honestly, without moralizing."
        )

    prompt = f"""{_state_block(run)}

RECENT STORY:
{_history_block(scenes, limit=8)}

{instruction}

Return JSON in this shape, with an empty choices array:
{{"title": "3-6 word title", "narrative": "the final scene prose", "choices": []}}"""
    scene = _generate(prompt)
    scene["choices"] = []
    return scene


def fallback_scene(run: dict) -> dict:
    """Used if the model call fails, so the run never dead-ends."""
    options = [
        {
            "title": "The Shoulder of the Road",
            "narrative": (
                "The traffic has stopped moving entirely. Engines idle and die one by one as "
                "people realize the pumps are dead too. You stand on the shoulder with a bag "
                "over one shoulder and a hundred and ninety miles of dark highway between you "
                "and your own front door.\n\n"
                "A man in a delivery van is handing out bottles of water from the back, no "
                "charge, while it lasts. Across the median, a family is arguing about whether "
                "to abandon their car. The sky is going the color of old iron."
            ),
        },
        {
            "title": "A Door Left Open",
            "narrative": (
                "The subdivision is silent in a way suburbs never are. No compressors, no "
                "televisions, no distant highway. Just wind and a dog barking itself hoarse "
                "three streets over.\n\n"
                "One garage door is up. Inside, a workbench, a bicycle, and a shelf of canned "
                "goods nobody is standing guard over. You have not eaten since morning."
            ),
        },
        {
            "title": "Rain on the Overpass",
            "narrative": (
                "The overpass gives you a view of the whole valley and none of it is lit. "
                "Somewhere down there is the road home. The rain arrives sideways and finds "
                "the gap between your collar and your neck.\n\n"
                "Under the bridge, a small group has made a fire out of a broken pallet. They "
                "have room by it. They also have a clear view of your bag."
            ),
        },
    ]
    pick = random.choice(options)
    return _normalize(
        {
            **pick,
            "choices": [
                {
                    "label": "Keep walking through the night",
                    "detail": "Distance now, at the cost of your legs.",
                    "effects": {"energy": -18, "health": -4, "miles": 11, "hours": 6},
                },
                {
                    "label": "Rest and take stock",
                    "detail": "You lose hours but get your head straight.",
                    "effects": {"energy": 12, "morale": 4, "hours": 4},
                },
                {
                    "label": "Approach the strangers",
                    "detail": "People are the best and worst thing out here.",
                    "effects": {"supplies": 8, "morale": 5, "health": -3, "hours": 2},
                },
            ],
        }
    )
