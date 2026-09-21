"use client";

import { FileSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useDescribeSession } from "@/lib/queries";
import { humanizeBytes } from "@/lib/utils";
import type { DescribeSummary } from "@rosbag2-cloud-offload/shared";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-right tabular-nums">{value}</span>
    </div>
  );
}

export function DescribeCard({
  robot,
  session,
  describe,
}: {
  robot: string;
  session: string;
  describe: DescribeSummary | null;
}) {
  const run = useDescribeSession(robot, session);

  const onDescribe = () =>
    run.mutate(undefined, {
      onSuccess: (detail) =>
        toast.success("Described from rosbag2", {
          description: `Source: ${detail.describe?.describe_source ?? "unknown"}`,
        }),
      onError: (err) => toast.error("Describe failed", { description: err.message }),
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-4 px-5">
        <CardTitle className="card-title">Bag Describe (rosbag2)</CardTitle>
        <Button variant="outline" size="sm" onClick={onDescribe} disabled={run.isPending}>
          <FileSearch className="h-3.5 w-3.5" />
          {run.isPending ? "Describing…" : "Run describe"}
        </Button>
      </CardHeader>
      <CardContent className="p-5">
        {!describe ? (
          <EmptyState
            icon={FileSearch}
            title="Not described yet"
            description="Run describe to read the recording from rosbag2's own metadata.yaml (or ros2 bag info on-device)."
          />
        ) : (
          <div className="space-y-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">source: {describe.describe_source}</Badge>
              {describe.compression_format && (
                <Badge variant="outline">{describe.compression_format}</Badge>
              )}
              {describe.storage_identifier && (
                <Badge variant="outline">{describe.storage_identifier}</Badge>
              )}
              {describe.ros2_available && <Badge variant="ghost">ros2 on PATH</Badge>}
            </div>
            {describe.message_count !== null && (
              <Row label="Messages" value={describe.message_count.toLocaleString()} />
            )}
            {describe.duration_seconds !== null && (
              <Row label="Duration" value={`${describe.duration_seconds.toFixed(2)} s`} />
            )}
            <Row label="Topics" value={String(describe.topics.length)} />
            {describe.serialization_format && (
              <Row label="Serialization" value={describe.serialization_format} />
            )}
            {describe.compressed_size_bytes !== null && (
              <Row label="Compressed on B2" value={humanizeBytes(describe.compressed_size_bytes)} />
            )}
            {describe.original_size_bytes !== null && (
              <Row label="Original size" value={humanizeBytes(describe.original_size_bytes)} />
            )}
            {describe.compression_ratio !== null && (
              <Row label="Ratio" value={`${describe.compression_ratio.toFixed(2)}×`} />
            )}
            {describe.topics.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Topics
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {describe.topics.map((topic) => (
                    <Badge key={topic} variant="outline" className="font-mono">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
