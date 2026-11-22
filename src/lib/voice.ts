import type { VoiceGender } from "../types";

// Voice names vary by OS and browser. These are matched as substrings, in priority order.
const FEMALE_HINTS = [
  "samantha",
  "zira",
  "aria",
  "jenny",
  "google us english",
];

const MALE_HINTS = [
  "david",
  "mark",
  "alex",
  "fred",
  "guy",
  "tom",
];

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  gender: VoiceGender
): SpeechSynthesisVoice | null {
  // Never substitute a British or other English locale for the requested U.S. accent.
  const english = voices.filter((v) => v.lang.replace(/_/g, "-").toLowerCase() === "en-us");
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
