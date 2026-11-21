"""Build-time hero art for Grid Down. Run: uv run scripts/generate_images.py"""

import os

from google import genai
from google.genai import types

client = genai.Client(
    api_key=os.environ.get("GEMINI_WORKSHOP_API_KEY"),
    http_options={
        "api_version": "v1alpha",
        "base_url": os.environ.get("GEMINI_WORKSHOP_BASE_URL"),
    },
)

PROMPTS = {
    "hero.png": (
        "Cinematic wide photograph, dusk on an American interstate during a total power "
        "outage. Three lanes of stopped cars and trucks, headlights off, silhouettes of "
        "people standing on the shoulder with bags. No streetlights, no lit signs. Deep "
        "amber and charcoal sky, low sun behind a treeline, faint haze. Muted desaturated "
        "palette, heavy grain, 35mm film, shallow depth of field, no text, no logos."
    ),
    "road.png": (
        "Cinematic photograph of an empty two-lane rural highway at night, seen from the "
        "shoulder. Dark fields on both sides, a single distant farmhouse window glowing "
        "warm amber, cold blue moonlight on wet asphalt. Grainy 35mm film, desaturated, "
        "quiet and lonely, no text, no people."
    ),
}


def generate(prompt: str, filename: str) -> None:
    response = client.models.generate_content(
        model="gemini-3.1-flash-image",
        contents=prompt,
        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
    )
    for part in response.parts:
        if part.inline_data is not None:
            image = part.as_image()
            os.makedirs("public/images", exist_ok=True)
            image.save(f"public/images/{filename}")
            print(f"Saved: public/images/{filename}")
            return
    print(f"No image returned for {filename}")


if __name__ == "__main__":
    for name, prompt in PROMPTS.items():
        generate(prompt, name)
