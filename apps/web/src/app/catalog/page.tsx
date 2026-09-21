"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingNotice } from "@/components/common/loading-notice";
import { CreateSessionDialog } from "@/components/sessions/create-session-dialog";
import { SessionsTable } from "@/components/sessions/sessions-table";
import { getCatalogDownloadUrl } from "@/lib/api-client";
import { useCatalog, useRebuildCatalog } from "@/lib/queries";

export default function CatalogPage() {
  const [query, setQuery] = useState("");
  const [downloading, setDownloading] = useState(false);
  const { data, isLoading, error, refetch } = useCatalog();
  const rebuild = useRebuildCatalog();

  const q = query.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter(
    (r) =>
      !q ||
      r.robot.toLowerCase().includes(q) ||
      r.session_id.toLowerCase().includes(q) ||
      r.ros_distro.toLowerCase().includes(q) ||
      r.topic_set.some((t) => t.toLowerCase().includes(q)),
  );

  const onDownload = async () => {
    setDownloading(true);
    try {
      const { url } = await getCatalogDownloadUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not get the catalog download URL");
    } finally {
      setDownloading(false);
    }
  };

  const onRebuild = () =>
    rebuild.mutate(undefined, {
      onSuccess: (summary) =>
        toast.success("Catalog rebuilt", {
          description: `${summary.rows} session(s) → ${summary.parquet_key}`,
        }),
      onError: (err) => toast.error("Rebuild failed", { description: err.message }),
    });

  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Session Catalog</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
            Every rosbag2 recording offloaded under the <code>bags/</code> namespace,
            searchable by robot, session, ROS distro, or topic. Rolled into a Parquet
            catalog you can download and query.
          </p>
        </div>
        <CreateSessionDialog />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search robot, session, distro, or topic…"
          className="max-w-sm"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onRebuild}
            disabled={rebuild.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {rebuild.isPending ? "Rebuilding…" : "Rebuild catalog"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onDownload}
            disabled={downloading}
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? "Preparing…" : "Download .parquet"}
          </Button>
        </div>
      </div>

      <Card className="animate-fade-in-up stagger-2">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingNotice subject="the session catalog" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : (
            <SessionsTable rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
