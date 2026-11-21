# Grid Down

An AI-written survival adventure. The power in the United States has been shut off. You
are 190 miles from home, and everyone you love is on the other side of that distance.

Every scene is generated live by Gemini from your current state — health, energy,
supplies, morale, the items you carry, and the choices you have already made. Nothing is
scripted twice.

## How it plays

- Name yourself, your home town, and who is waiting for you.
- Each scene offers three genuinely different strategies. Every choice costs something.
- Health, energy, supplies and morale are tracked. Health at zero ends the run. So does
  running out of morale. Reaching zero miles ends it the other way.
- Runs are saved to Postgres, so you can close the tab and come back.

## Stack

- React + TypeScript + Tailwind + shadcn/ui (Vite)
- FastAPI backend (`routes.py`) with the story engine in `story.py`
- Neon Postgres for run and scene persistence (`db.py`)
- Gemini via the Workshop connector for scene generation

## Run it

```bash
bash start.sh
```

Vite serves the frontend on `$APP_PORT`; FastAPI runs on `$APP_PORT + 100` and is proxied
under `/api`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/runs` | List saved journeys |
| `POST` | `/api/runs` | Start a new journey (generates the opening scene) |
| `GET` | `/api/runs/{id}` | Load a journey with all its scenes |
| `POST` | `/api/runs/{id}/choose` | Take a choice, apply effects, generate the next scene |
| `DELETE` | `/api/runs/{id}` | Delete a journey |

## Hero art

`scripts/generate_images.py` regenerates `public/images/hero.jpg` and `road.jpg` with
Nano Banana. Run `uv run scripts/generate_images.py`.
