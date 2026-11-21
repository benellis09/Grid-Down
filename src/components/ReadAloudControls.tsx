import { Volume2, VolumeX } from "lucide-react";
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
}

export function ReadAloudControls({
  supported,
  enabled,
  onEnabledChange,
  gender,
  onGenderChange,
}: ReadAloudControlsProps) {
  if (!supported) {
    return (
      <span className="text-[11px] text-muted-foreground">
        Read aloud is not supported in this browser.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2.5">
        {enabled ? (
          <Volume2 className="h-3.5 w-3.5 text-primary" />
        ) : (
          <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Label
          htmlFor="read-aloud"
          className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
        >
          Read aloud
        </Label>
        <Switch id="read-aloud" checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      <Select value={gender} onValueChange={(v) => onGenderChange(v as VoiceGender)}>
        <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Narrator voice">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="female">Calm female voice</SelectItem>
          <SelectItem value="male">Calm male voice</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
