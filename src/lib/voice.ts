import type { VoiceGender } from "../types";

// Voice names vary by OS and browser. These are matched as substrings, in priority order.
const FEMALE_HINTS = [
  "samantha",
  "karen",
  "serena",
  "fiona",
  "moira",
  "tessa",
  "zira",
  "aria",
  "jenny",
  "google uk english female",
  "google us english",
];

const MALE_HINTS = [
  "daniel",
  "arthur",
  "george",
  "david",
  "mark",
  "alex",
  "fred",
  "ryan",
  "guy",
  "tom",
  "google uk english male",
];

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  gender: VoiceGender
): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (english.length === 0) return null;

  const preferred = gender === "female" ? FEMALE_HINTS : MALE_HINTS;
  const opposite = gender === "female" ? MALE_HINTS : FEMALE_HINTS;

  for (const hint of preferred) {
    const match = english.find((v) => v.name.toLowerCase().includes(hint));
    if (match) return match;
  }

  // No known name matched: take any English voice that isn't tagged as the other gender.
  const neutral = english.find(
    (v) => !opposite.some((hint) => v.name.toLowerCase().includes(hint))
  );
  return neutral ?? english[0];
}
