import { useEffect, useState } from "react";
import { Pause, Play, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VoiceGender } from "@/types";

interface ReadAloudControlsProps {
  supported: boolean;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  gender: VoiceGender;
  onGenderChange: (value: VoiceGender) => void;
  narratorState: "off" | "idle" | "playing" | "paused";
  onPlayPause: () => void;
  onStop: () => void;
  voiceInputSupported: boolean;
  voiceInputEnabled: boolean;
  onVoiceInputChange: (value: boolean) => void;
  voiceInputError: string | null;
  narrationError: string | null;
}

// Top-right cluster: narrator play/pause and stop, then the settings button. Settings drop a compact panel down from the top.
export function ReadAloudControls({
  supported,
  enabled,
  onEnabledChange,
  gender,
  onGenderChange,
  narratorState,
  onPlayPause,
  onStop,
  voiceInputSupported,
  voiceInputEnabled,
  onVoiceInputChange,
  voiceInputError,
  narrationError,
}: ReadAloudControlsProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const playLabel =
    narratorState === "off"
      ? "Start narration"
      : narratorState === "paused"
        ? "Resume narration"
        : narratorState === "playing"
          ? "Pause narration"
          : "Replay this scene";
  const showPause = narratorState === "playing";
  const showStop = narratorState === "playing" || narratorState === "paused";

  return (
    <div className="fixed right-4 top-4 z-40 flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {showStop && (
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full border-border bg-card/80 backdrop-blur"
            onClick={onStop}
            disabled={!supported}
            title="Stop narration"
            aria-label="Stop narration"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full border-border bg-card/80 backdrop-blur"
          onClick={onPlayPause}
          disabled={!supported}
          title={playLabel}
          aria-label={playLabel}
        >
          {showPause ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full border-border bg-card/80 backdrop-blur"
          onClick={() => setOpen((v) => !v)}
          disabled={!supported}
          title={supported ? "Narrator settings" : "Read aloud is not supported in this browser"}
          aria-label="Narrator settings"
          aria-expanded={open}
        >
          {enabled ? (
            <Volume2 className="h-4 w-4 text-primary" />
          ) : (
            <VolumeX className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {enabled && narrationError && (
        <p role="alert" className="max-w-[min(320px,90vw)] rounded-xl border border-border bg-card p-3 text-xs text-destructive shadow-lg">
          {narrationError}
        </p>
      )}
      {open && supported && (
        <div className="drop-in w-[230px] space-y-4 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="read-aloud"
              className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              Read aloud
            </Label>
            <Switch id="read-aloud" checked={enabled} onCheckedChange={onEnabledChange} />
          </div>
          <Select value={gender} onValueChange={(v) => onGenderChange(v as VoiceGender)}>
            <SelectTrigger className="h-8 w-full text-xs" aria-label="Narrator voice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="female">Calm female voice</SelectItem>
              <SelectItem value="male">Calm male voice</SelectItem>
            </SelectContent>
          </Select>

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="voice-input"
                className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Voice input
              </Label>
              <Switch
                id="voice-input"
                checked={voiceInputEnabled}
                disabled={!voiceInputSupported}
                onCheckedChange={onVoiceInputChange}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {voiceInputSupported
                ? "Say “option one”, “two” or “three” to choose. Say “pause” to stop the narrator and “resume” to continue."
                : "Voice input needs a browser with speech recognition, such as Chrome, Edge or Safari."}
            </p>
            {voiceInputError && <p className="text-[11px] text-destructive">{voiceInputError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
