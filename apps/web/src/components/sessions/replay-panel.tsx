"use client";

import { useState } from "react";
import { Copy, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useReplaySession } from "@/lib/queries";
import type { ReplayManifest } from "@rosbag2-cloud-offload/shared";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Clipboard blocked by the browser");
  }
}

function playbackScript(manifest: ReplayManifest): string {
  const dir = manifest.session_id;
  const downloads = manifest.urls
    .map((u) => `curl -L -o "${dir}/${u.filename}" "${u.url}"`)
    .join("\n");
  return [
    `mkdir -p ${dir}`,
    downloads,
    `# then replay the offloaded bag with rosbag2`,
    `ros2 bag play ${dir} --storage ${manifest.storage_id_hint}`,
  ].join("\n");
}

export function ReplayPanel({ robot, session }: { robot: string; session: string }) {
  const [manifest, setManifest] = useState<ReplayManifest | null>(null);
  const replay = useReplaySession(robot, session);

  const onPrepare = () =>
    replay.mutate(undefined, {
      onSuccess: (data) => setManifest(data),
      onError: (err) => toast.error("Could not prepare replay", { description: err.message }),
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-4 px-5">
        <CardTitle className="card-title">Replay via presigned URL</CardTitle>
        <Button variant="outline" size="sm" onClick={onPrepare} disabled={replay.isPending}>
          <Play className="h-3.5 w-3.5" />
          {replay.isPending ? "Preparing…" : "Prepare replay"}
        </Button>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {!manifest ? (
          <p className="text-sm text-muted-foreground">
            Generates short-lived presigned GET URLs for each split so{" "}
            <code>ros2 bag play</code> can stream this session straight from Backblaze B2.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{manifest.ros_distro}</Badge>
              <Badge variant="outline">storage: {manifest.storage_id_hint}</Badge>
              <Badge variant="ghost">expires in {manifest.expires_in}s</Badge>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Download &amp; replay
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => copy(playbackScript(manifest))}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy commands
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
                <code>{playbackScript(manifest)}</code>
              </pre>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Presigned split URLs ({manifest.urls.length})
              </p>
              {manifest.urls.map((u) => (
                <div
                  key={u.key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <span className="truncate font-mono text-xs">{u.filename}</span>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => copy(u.url)}>
                    <Copy className="h-3.5 w-3.5" />
                    Copy URL
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
