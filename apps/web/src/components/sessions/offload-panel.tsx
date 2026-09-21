"use client";

import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudUpload, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ApiError, uploadSplit } from "@/lib/api-client";
import { chainOffloadFollowUps } from "@/lib/offload-chain";
import { qk, sessionDetailKey, useDescribeSession, useRebuildCatalog } from "@/lib/queries";
import { humanizeBytes } from "@/lib/utils";

interface Item {
  id: string;
  name: string;
  size: number;
  percent: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

export function OffloadPanel({ robot, session }: { robot: string; session: string }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const qc = useQueryClient();
  // Same mutations the manual "Run describe" (DescribeCard) and "Rebuild
  // catalog" (/catalog) buttons use — reused here to auto-chain the follow-ups.
  const describe = useDescribeSession(robot, session);
  const rebuild = useRebuildCatalog();

  const patch = (id: string, next: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));

  const offload = async (files: File[]) => {
    let succeeded = 0;
    for (const file of files) {
      const id = `${file.name}-${file.size}-${crypto.randomUUID()}`;
      setItems((prev) => [
        ...prev,
        { id, name: file.name, size: file.size, percent: 0, status: "uploading" },
      ]);
      try {
        await uploadSplit(robot, session, file, (percent) => patch(id, { percent }));
        patch(id, { percent: 100, status: "done" });
        succeeded += 1;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Offload failed";
        patch(id, { status: "error", error: message });
        toast.error(`Could not offload ${file.name}`, { description: message });
      }
    }
    // The bags/ listing (and therefore this session and the catalog) changed.
    qc.invalidateQueries({ queryKey: sessionDetailKey(robot, session) });
    qc.invalidateQueries({ queryKey: [...qk.all, "sessions"] });
    qc.invalidateQueries({ queryKey: [...qk.all, "catalog"] });
    qc.invalidateQueries({ queryKey: [...qk.all, "files"] });

    // Auto-chain the rest of the pipeline once per batch so a first-time user
    // reaches a described, cataloged session without hunting for two more
    // buttons on two more pages. `mutateAsync` still fires each mutation's own
    // cache updates (describe writes the session detail; both invalidate the
    // catalog). The in-progress line below (describe/rebuild `isPending`) is
    // the running feedback. Skipped when nothing landed; guarded so a failed
    // stage surfaces its message instead of crashing.
    try {
      const chained = await chainOffloadFollowUps(succeeded, {
        describe: () => describe.mutateAsync(),
        rebuild: () => rebuild.mutateAsync(),
      });
      if (chained) {
        toast.success("Described and added to the searchable catalog");
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Follow-up step failed";
      toast.error("Offloaded, but cataloging did not finish", { description: message });
    }
  };

  const onPick = (list: FileList | null) => {
    if (list && list.length > 0) {
      void offload(Array.from(list));
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Offload splits</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onPick(e.dataTransfer.files);
          }}
          className={[
            "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-md",
            "border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragging
              ? "border-primary bg-[var(--accent-subtle)]"
              : "border-border hover:border-primary/60 hover:bg-muted/60",
          ].join(" ")}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted">
            <CloudUpload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-semibold">Drop rosbag2 splits here, or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Each split is presigned and uploaded straight to{" "}
              <code>bags/{robot}/{session}/</code>. Include <code>metadata.yaml</code> so describe
              can read the recording.
            </p>
          </div>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs">{item.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {humanizeBytes(item.size)}
                    {item.status === "done" && (
                      <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                    )}
                    {item.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                  </span>
                </div>
                {item.status === "uploading" && (
                  <Progress value={item.percent} className="mt-2 h-1.5" />
                )}
                {item.status === "error" && (
                  <p className="mt-1 text-xs text-destructive">{item.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {(describe.isPending || rebuild.isPending) && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {describe.isPending
              ? "Describing from rosbag2…"
              : "Rolling this session into the catalog…"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
