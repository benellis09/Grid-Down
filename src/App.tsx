import { useCallback, useEffect, useState } from "react";
import { Landing } from "@/components/Landing";
import { Game } from "@/components/Game";
import type { NewRunPayload, Run, RunBundle } from "@/types";

function App() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bundle, setBundle] = useState<RunBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const res = await fetch("/api/runs");
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("run");
    if (id) resumeRun(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRun = async (payload: NewRunPayload) => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("create failed");
      const data: RunBundle = await res.json();
      setBundle(data);
      window.history.replaceState({}, "", `?run=${data.run.id}`);
      loadRuns();
    } catch {
      setError("The story could not start. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const resumeRun = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/runs/${id}`);
      if (!res.ok) throw new Error("not found");
      const data: RunBundle = await res.json();
      setBundle(data);
      window.history.replaceState({}, "", `?run=${data.run.id}`);
    } catch {
      setError("That journey could not be loaded.");
    }
  };

  const deleteRun = async (id: string) => {
    setRuns((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch(`/api/runs/${id}`, { method: "DELETE" });
    } catch {
      setError("Could not delete that journey.");
    }
    loadRuns();
  };

  const resumeSave = async (saveId: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/resume`, { method: "POST" });
      if (!res.ok) throw new Error("resume failed");
      const data: RunBundle = await res.json();
      setBundle(data);
      window.history.replaceState({}, "", `?run=${data.run.id}`);
      loadRuns();
    } catch {
      setError("That save could not be opened.");
    }
  };

  const choose = async (index: number) => {
    if (!bundle) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${bundle.run.id}/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      if (!res.ok) throw new Error("choose failed");
      setBundle(await res.json());
    } catch {
      setError("The road stalled. Try that choice again.");
    } finally {
      setBusy(false);
    }
  };

  const exit = () => {
    setBundle(null);
    window.history.replaceState({}, "", window.location.pathname);
    loadRuns();
  };

  return (
    <>
      {bundle ? (
        <Game
          run={bundle.run}
          scenes={bundle.scenes}
          busy={busy}
          onChoose={choose}
          onExit={exit}
          onRestart={exit}
          onResumeSave={resumeSave}
        />
      ) : (
        <Landing
          runs={runs}
          loadingRuns={loadingRuns}
          creating={creating}
          onCreate={createRun}
          onResume={resumeRun}
          onDelete={deleteRun}
        />
      )}

      {error && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-destructive/40 bg-card px-4 py-2 text-[12px] text-destructive shadow-lg">
          {error}
        </div>
      )}
    </>
  );
}

export default App;
