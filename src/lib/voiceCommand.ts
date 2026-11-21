export type VoiceCommand =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "choose"; index: number };

const NUMBER_WORDS: Record<string, number> = {
  one: 0,
  first: 0,
  "1": 0,
  two: 1,
  second: 1,
  "2": 1,
  three: 2,
  third: 2,
  "3": 2,
};

const NUMBER_PATTERN = Object.keys(NUMBER_WORDS).join("|");
const CHOOSE_WITH_PREFIX = new RegExp(`\\b(?:option|choice|number)\\s+(${NUMBER_PATTERN})\\b`);
const CHOOSE_BARE = new RegExp(`^(${NUMBER_PATTERN})$`);

// Turns a finished speech transcript into a story command, or null when it means nothing to the game.
export function parseVoiceCommand(raw: string): VoiceCommand | null {
  const text = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  if (/\bpause\b/.test(text)) return { kind: "pause" };
  if (/\b(resume|continue)\b/.test(text)) return { kind: "resume" };

  const prefixed = text.match(CHOOSE_WITH_PREFIX);
  if (prefixed) return { kind: "choose", index: NUMBER_WORDS[prefixed[1]] };

  const bare = text.match(CHOOSE_BARE);
  if (bare) return { kind: "choose", index: NUMBER_WORDS[bare[1]] };

  return null;
}
