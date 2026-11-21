import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
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
  voiceInputSupported: boolean;
  voiceInputEnabled: boolean;
  onVoiceInputChange: (value: boolean) => void;
  voiceInputError: string | null;
}

// A small button pinned to the top-right corner. Tapping it drops a compact panel down from the top.
export function ReadAloudControls({
  supported,
  enabled,
  onEnabledChange,
  gender,
  onGenderChange,
  voiceInputSupported,
  voiceInputEnabled,
  onVoiceInputChange,
  voiceInputError,
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

  return (
    <div className="fixed right-4 top-4 z-40 flex flex-col items-end gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-10 w-10 rounded-full border-border bg-card/80 backdrop-blur"
        onClick={() => setOpen((v) => !v)}
        disabled={!supported}
        title={supported ? "Read aloud" : "Read aloud is not supported in this browser"}
        aria-label="Read aloud settings"
        aria-expanded={open}
      >
        {enabled ? (
          <Volume2 className="h-4 w-4 text-primary" />
        ) : (
          <VolumeX className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

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
