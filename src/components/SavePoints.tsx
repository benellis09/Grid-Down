import { useCallback, useEffect, useState } from "react";
import { Bookmark, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SavePoint } from "@/types";

interface SavePointsProps {
  runId: string;
  defaultName: string;
  onResume: (saveId: number) => void;
}

// Named save points for a run. Resuming copies the save into a new journey, so the current run stays as it is.
export function SavePoints({ runId, defaultName, onResume }: SavePointsProps) {
  const [saves, setSaves] = useState<SavePoint[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSaves = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/saves`);
      if (res.ok) setSaves((await res.json()).saves ?? []);
    } catch {
      // Keep the list as it was if the server is unreachable.
    }
  }, [runId]);

  useEffect(() => {
    loadSaves();
  }, [loadSaves]);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/runs/${runId}/saves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || defaultName }),
      });
      if (!res.ok) throw new Error("save failed");
      setOpen(false);
      setMessage("Saved");
      await loadSaves();
    } catch {
      setMessage("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setSaves((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch(`/api/saves/${id}`, { method: "DELETE" });
    } finally {
      loadSaves();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Save points</div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-[11px]"
          onClick={() => {
            setName(defaultName);
            setMessage(null);
            setOpen(true);
          }}
        >
          <Bookmark className="h-3 w-3" />
          Save state
        </Button>
      </div>

      {message && <p className="mt-2 text-[11px] text-muted-foreground">{message}</p>}

      {saves.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground/70">No saves yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {saves.map((save) => (
            <li
              key={save.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{save.name}</div>
                <div className="font-mono-tight text-[10px] text-muted-foreground">
                  Day {save.day} · {save.distance_miles} mi
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onResume(save.id)}
                aria-label={`Resume ${save.name}`}
                title="Resume from this save"
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => remove(save.id)}
                aria-label={`Delete ${save.name}`}
                title="Delete save"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this point</DialogTitle>
            <DialogDescription>
              Name it so you can find it again. Resuming opens a new journey from here.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            aria-label="Save name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
