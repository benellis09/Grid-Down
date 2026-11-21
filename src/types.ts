export interface Effects {
  health?: number;
  energy?: number;
  supplies?: number;
  morale?: number;
  miles?: number;
  hours?: number;
}

export interface Choice {
  label: string;
  detail: string;
  effects: Effects;
  add_items: string[];
  remove_items: string[];
  flags: string[];
}

export interface Scene {
  id: number;
  run_id: string;
  seq: number;
  title: string;
  narrative: string;
  choices: Choice[];
  chosen_index: number | null;
  chosen_text: string | null;
  created_at: string;
}

export interface Run {
  id: string;
  created_at: string;
  updated_at: string;
  player_name: string;
  home_town: string;
  waiting_for: string;
  status: "active" | "ended";
  health: number;
  energy: number;
  supplies: number;
  morale: number;
  distance_miles: number;
  day: number;
  hour: number;
  inventory: string[];
  flags: string[];
  ending_title: string | null;
  ending_text: string | null;
}

export interface RunBundle {
  run: Run;
  scenes: Scene[];
}

export type VoiceGender = "female" | "male";

export interface SavePoint {
  id: number;
  run_id: string;
  name: string;
  created_at: string;
  distance_miles: number;
  day: number;
  player_name?: string;
}

export interface NewRunPayload {
  player_name: string;
  home_town: string;
  waiting_for: string;
}
