import { useState } from "react";
import { ArrowRight, Loader2, Play, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { NewRunPayload, Run, SavePoint } from "@/types";

interface LandingProps {
  runs: Run[];
  saves: SavePoint[];
  loadingRuns: boolean;
  creating: boolean;
  onCreate: (payload: NewRunPayload) => void;
  onResume: (id: string) => void;
  onResumeSave: (saveId: number) => void;
  onDelete: (id: string) => void;
  onDeleteSave: (saveId: number) => void;
}

function milesLabel(run: Run) {
  if (run.status === "ended") return run.ending_title ?? "Journey ended";
  return `${run.distance_miles} mi from home`;
}

export function Landing({
  runs,
  saves,
  loadingRuns,
  creating,
  onCreate,
  onResume,
  onResumeSave,
  onDelete,
  onDeleteSave,
}: LandingProps) {
  const [playerName, setPlayerName] = useState("");
  const [homeTown, setHomeTown] = useState("");
  const [waitingFor, setWaitingFor] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      player_name: playerName.trim() || "Alex",
      home_town: homeTown.trim() || "Marlowe, Ohio",
      waiting_for: waitingFor.trim() || "your daughter, June",
    });
  };

  return (
    <div className="min-h-screen">
      <div className="relative h-[46vh] min-h-[300px] w-full overflow-hidden">
        <img
          src="/images/hero.jpg"
          alt="Stopped traffic on a dark interstate at dusk"
          className="h-full w-full object-cover object-center opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/45 to-background" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-3xl px-6 pb-8">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-primary">
              <Zap className="h-3.5 w-3.5" />
              <span>A survival story</span>
            </div>
            <h1 className="font-display mt-4 text-6xl leading-[0.92] tracking-tight sm:text-7xl">
              Grid Down
            </h1>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-8 sm:pb-24">
        <header className="fade-up">
          <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            The power went out at noon and never came back. No phones, no pumps, no
            cards, no trains. You are one hundred and ninety miles from your own front
            door, and everyone you love is on the other side of that distance.
          </p>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Walk it. Every choice costs something.
          </p>
        </header>

        <form
          onSubmit={submit}
          className="fade-up mt-12 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
          style={{ animationDelay: "80ms" }}
        >
          <h2 className="font-display text-xl">Who are you out there?</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="player" className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Your name
              </Label>
              <Input
                id="player"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Alex"
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="town" className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Home town
              </Label>
              <Input
                id="town"
                value={homeTown}
                onChange={(e) => setHomeTown(e.target.value)}
                placeholder="Marlowe, Ohio"
                maxLength={60}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="waiting" className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Who is waiting for you
              </Label>
              <Input
                id="waiting"
                value={waitingFor}
                onChange={(e) => setWaitingFor(e.target.value)}
                placeholder="your daughter, June"
                maxLength={80}
              />
            </div>
          </div>
          <Button type="submit" size="lg" className="mt-7 w-full gap-2" disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                The lights are going out…
              </>
            ) : (
              <>
                Begin the walk home
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <section className="fade-up mt-14" style={{ animationDelay: "120ms" }}>
          {saves.length > 0 && (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Chapters
                </h2>
                <span className="font-mono-tight text-[11px] text-muted-foreground/70">
                  {saves.length} saved
                </span>
              </div>
              <ol className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
                {saves.map((save, index) => (
                  <li key={save.id} className="group flex items-center gap-4 bg-card/40 px-4 py-3.5">
                    <div className="font-display w-14 shrink-0 text-[11px] uppercase tracking-[0.18em] text-primary/80">
                      Chapter
                      <div className="text-2xl normal-case leading-none tracking-normal">{index + 1}</div>
                    </div>
                    <button
                      onClick={() => onResumeSave(save.id)}
                      className="min-w-0 flex-1 text-left"
                      title="Start a new journey from this chapter"
                    >
                      <div className="font-display truncate text-[15px]">{save.name}</div>
                      <div className="mt-0.5 truncate font-mono-tight text-[11px] text-muted-foreground">
                        {save.player_name ? `${save.player_name} · ` : ""}Day {save.day} · {save.distance_miles} mi from home
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => onResumeSave(save.id)}
                      aria-label={`Resume ${save.name}`}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      onClick={() => onDeleteSave(save.id)}
                      aria-label={`Delete ${save.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        <section className="fade-up mt-14" style={{ animationDelay: "160ms" }}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Saved journeys
            </h2>
            {runs.length > 0 && (
              <span className="font-mono-tight text-[11px] text-muted-foreground">
                {runs.length}
              </span>
            )}
          </div>

          {loadingRuns ? (
            <div className="mt-4 space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-secondary/60" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">
              No journeys yet. The first one starts above.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {runs.map((run) => (
                <li key={run.id} className="group flex items-center gap-3 bg-card/40 px-4 py-3.5">
                  <button
                    onClick={() => onResume(run.id)}
                    className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  >
                    <div
                      className={cn(
                        "h-8 w-1 shrink-0 rounded-full",
                        run.status === "ended" ? "bg-muted-foreground/40" : "bg-primary"
                      )}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {run.player_name}
                        <span className="text-muted-foreground"> · {run.home_town}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono-tight text-[11px] text-muted-foreground">
                        Day {run.day} · {milesLabel(run)}
                      </div>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    onClick={() => onDelete(run.id)}
                    aria-label="Delete journey"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-16 text-[11px] leading-relaxed text-muted-foreground/70">
          Every scene is written as you play. Nothing is scripted twice.
        </footer>
      </div>
    </div>
  );
}
