import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Footprints,
  Loader2,
  Mic,
  MapPin,
  Package,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatBar } from "@/components/StatBar";
import { SavePoints } from "@/components/SavePoints";
import { ReadAloudControls } from "@/components/ReadAloudControls";
import { useReadAloud } from "@/hooks/useReadAloud";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { parseVoiceCommand } from "@/lib/voiceCommand";
import { cn } from "@/lib/utils";
import type { Choice, Effects, Run, Scene } from "@/types";

interface GameProps {
  run: Run;
  scenes: Scene[];
  busy: boolean;
  onChoose: (index: number) => void;
  onExit: () => void;
  onRestart: () => void;
  onResumeSave: (saveId: number) => void;
}

const OPTION_WORDS = ["Option one", "Option two", "Option three"];

// What the narrator says: the scene, then the options, then silence until the player picks.
function sceneSpeech(scene: Scene): string {
  const parts = [`${scene.title}.`, scene.narrative];
  if (scene.choices.length > 0) {
    parts.push("What do you do?");
    scene.choices.forEach((choice, i) => {
      parts.push(`${OPTION_WORDS[i] ?? `Option ${i + 1}`}: ${choice.label}.`);
    });
  }
  return parts.join(" ");
}

const effectMeta: { key: keyof Effects; label: string; invert?: boolean }[] = [
  { key: "miles", label: "mi" },
  { key: "hours", label: "h" },
  { key: "health", label: "HP" },
  { key: "energy", label: "EN" },
  { key: "supplies", label: "SUP" },
  { key: "morale", label: "MO" },
];

function EffectChips({ effects }: { effects: Effects }) {
  const chips = effectMeta
    .map(({ key, label }) => ({ label, value: effects[key] ?? 0, key }))
    .filter((c) => c.value !== 0);
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map(({ key, label, value }) => {
        const neutral = key === "hours";
        const good = value > 0;
        return (
          <span
            key={key}
            className={cn(
              "font-mono-tight rounded px-1.5 py-0.5 text-[10px] tracking-wide",
              neutral
                ? "bg-secondary text-muted-foreground"
                : good
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive"
            )}
          >
            {value > 0 ? "+" : ""}
            {value} {label}
          </span>
        );
      })}
    </div>
  );
}

function ChoiceButton({
  choice,
  index,
  disabled,
  onSelect,
}: {
  choice: Choice;
  index: number;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "group w-full rounded-xl border border-border bg-card/50 px-5 py-4 text-left transition-all",
        "hover:border-primary/50 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-40"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="font-mono-tight mt-0.5 text-[11px] text-muted-foreground transition-colors group-hover:text-primary">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium leading-snug">{choice.label}</div>
          {choice.detail && (
            <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {choice.detail}
            </div>
          )}
          <EffectChips effects={choice.effects} />
        </div>
      </div>
    </button>
  );
}

function HistoryEntry({ scene }: { scene: Scene }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-l border-border pl-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="font-mono-tight text-[10px] text-muted-foreground">
          {String(scene.seq).padStart(2, "0")}
        </span>
        <span className="flex-1 truncate text-[13px] text-foreground/70">
          {scene.title}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="fade-in mt-2 space-y-2 pb-1">
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
            {scene.narrative}
          </p>
          {scene.chosen_text && (
            <p className="text-[12px] italic text-primary/80">→ {scene.chosen_text}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Game({ run, scenes, busy, onChoose, onExit, onRestart, onResumeSave }: GameProps) {
  const current = scenes[scenes.length - 1];
  const history = scenes.slice(0, -1);
  const ended = run.status === "ended";
  const narrativeRef = useRef<HTMLDivElement>(null);
  const readAloud = useReadAloud();
  const { enabled: readEnabled, speak: speakScene, stop: stopSpeaking } = readAloud;

  // Spoken commands: "option two" picks a choice once narration has finished, "pause" and "resume" control the narrator.
  const handleVoice = (text: string) => {
    const command = parseVoiceCommand(text);
    if (!command) return;
    if (command.kind === "pause") {
      readAloud.pause();
      return;
    }
    if (command.kind === "resume") {
      readAloud.resume();
      return;
    }
    const count = current?.choices.length ?? 0;
    if (ended || busy || command.index >= count) return;
    if (readAloud.isNarrating()) return;
    onChoose(command.index);
  };
  const voiceInput = useVoiceInput(handleVoice);

  useEffect(() => {
    narrativeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [current?.seq]);

  // Read each new scene and its options aloud, then wait for the player. Cleanup cancels speech when the scene changes, the toggle goes off, or the screen unmounts.
  useEffect(() => {
    if (!readEnabled || !current) return;
    speakScene(sceneSpeech(current));
    return () => stopSpeaking();
  }, [readEnabled, current, speakScene, stopSpeaking]);

  const narratorState: "off" | "idle" | "playing" | "paused" = !readEnabled
    ? "off"
    : readAloud.paused
      ? "paused"
      : readAloud.speaking
        ? "playing"
        : "idle";

  // Start turns narration on (which reads the current scene). Otherwise it pauses, resumes, or replays the scene.
  const onNarratorPlayPause = () => {
    if (!readEnabled) {
      readAloud.setEnabled(true);
      return;
    }
    if (readAloud.paused) {
      readAloud.resume();
      return;
    }
    if (readAloud.speaking) {
      readAloud.pause();
      return;
    }
    if (current) speakScene(sceneSpeech(current));
  };

  const progress = Math.round(((190 - run.distance_miles) / 190) * 100);

  return (
    <div className="relative min-h-screen">
      <img
        src="/images/road.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-[0.07]"
      />
      <div className="relative mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" onClick={onExit}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Journeys
          </Button>
          <div className="font-mono-tight flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Day {run.day} · {String(run.hour).padStart(2, "0")}:00
            </span>
            <span className="flex items-center gap-1.5">
              <Footprints className="h-3 w-3" />
              {run.distance_miles} mi
            </span>
          </div>
        </div>

        <ReadAloudControls
          supported={readAloud.supported}
          enabled={readEnabled}
          onEnabledChange={readAloud.setEnabled}
          gender={readAloud.gender}
          onGenderChange={readAloud.setGender}
          narratorState={narratorState}
          onPlayPause={onNarratorPlayPause}
          onStop={stopSpeaking}
          voiceInputSupported={voiceInput.supported}
          voiceInputEnabled={voiceInput.enabled}
          onVoiceInputChange={voiceInput.setEnabled}
          voiceInputError={voiceInput.error}
        />

        {voiceInput.enabled && (
          <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-2 text-[12px] shadow-lg backdrop-blur">
            <Mic
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                voiceInput.listening ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span className="truncate">
              {readAloud.paused
                ? "Paused. Say “resume” to continue."
                : voiceInput.listening
                  ? "Listening. Say “option two” or “pause”."
                  : "Starting voice input…"}
            </span>
            {voiceInput.lastHeard && (
              <span className="hidden truncate text-muted-foreground sm:inline">
                · heard “{voiceInput.lastHeard}”
              </span>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-6 lg:sticky lg:top-8 lg:self-start">
            <div>
              <div className="font-display text-lg leading-tight">{run.player_name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {run.home_town}
              </div>
              <div className="mt-1 hidden text-[12px] text-muted-foreground/80 lg:block">
                Waiting: {run.waiting_for}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 lg:grid-cols-1">
              <StatBar label="Health" value={run.health} tone="health" />
              <StatBar label="Energy" value={run.energy} tone="energy" />
              <StatBar label="Supplies" value={run.supplies} tone="supplies" />
              <StatBar label="Morale" value={run.morale} tone="morale" />
            </div>

            <div>
              <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>Distance home</span>
                <span className="font-mono-tight">{progress}%</span>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <Package className="h-3 w-3" />
                Carrying
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 lg:block lg:space-y-1">
                {run.inventory.length === 0 ? (
                  <li className="text-[12px] text-muted-foreground/70">Nothing left.</li>
                ) : (
                  run.inventory.map((item) => (
                    <li key={item} className="text-[12px] leading-relaxed text-foreground/70">
                      · {item}
                    </li>
                  ))
                )}
              </ul>
            </div>

            {!ended && (
              <SavePoints
                runId={run.id}
                defaultName={`Day ${run.day}, ${String(run.hour).padStart(2, "0")}:00 · ${run.distance_miles} mi`}
                onResume={onResumeSave}
              />
            )}
          </aside>

          <main ref={narrativeRef} className="min-w-0">
            {current && (
              <article key={current.seq} className="fade-up">
                <div className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-primary">
                  Scene {String(current.seq).padStart(2, "0")}
                </div>
                <h1 className="font-display mt-2 text-3xl leading-tight tracking-tight sm:text-4xl">
                  {current.title}
                </h1>
                <div className="mt-5 space-y-4 text-[16px] leading-[1.75] text-foreground/85">
                  {current.narrative.split("\n").filter(Boolean).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </article>
            )}

            {ended ? (
              <div className="fade-up mt-10 rounded-2xl border border-border bg-card/60 p-6">
                <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Journey ended
                </div>
                <div className="font-display mt-2 text-2xl">{run.ending_title}</div>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    ["Days out", String(run.day)],
                    ["Miles walked", String(190 - run.distance_miles)],
                    ["Health", String(run.health)],
                    ["Morale", String(run.morale)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="font-mono-tight text-xl">{value}</div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button onClick={onRestart} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Start a new journey
                  </Button>
                  <Button variant="outline" onClick={onExit}>
                    All journeys
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-8 space-y-2.5">
                <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  What do you do?
                </div>
                {current?.choices.map((choice, i) => (
                  <ChoiceButton
                    key={`${current.seq}-${i}`}
                    choice={choice}
                    index={i}
                    disabled={busy}
                    onSelect={() => onChoose(i)}
                  />
                ))}
                {busy && (
                  <div className="flex items-center gap-2 px-1 pt-2 text-[12px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    The road keeps going…
                  </div>
                )}
              </div>
            )}

            {history.length > 0 && (
              <section className="mt-12 border-t border-border pt-6">
                <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  The road behind you
                </div>
                <div className="mt-4 space-y-3">
                  {[...history].reverse().map((scene) => (
                    <HistoryEntry key={scene.id} scene={scene} />
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
