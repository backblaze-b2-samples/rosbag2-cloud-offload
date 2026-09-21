"use client";

import Link from "next/link";
import { ArrowRight, Boxes, Bot, HardDrive, UploadCloud } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFileStats, useSessions } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  index,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  loading: boolean;
  index: number;
}) {
  return (
    <Card className={`card-hover animate-fade-in-up stagger-${index + 1}`}>
      <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground">{title}</CardTitle>
        <div className="stat-icon-wrap">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="pb-5 px-4">
        {loading ? <Skeleton className="h-8 w-24" /> : <div className="stat-value">{value}</div>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const sessionsQuery = useSessions();
  const statsQuery = useFileStats();

  const sessions = sessionsQuery.data?.sessions ?? [];
  const robots = new Set(sessions.map((s) => s.robot)).size;
  const recent = sessions.slice(0, 8);
  const loading = sessionsQuery.isLoading || statsQuery.isLoading;

  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="page-title">Offload Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            rosbag2 recordings offloaded to Backblaze B2, across your fleet.
          </p>
        </div>
        <Button asChild size="sm" className="h-8">
          <Link href="/upload">
            <UploadCloud className="h-3.5 w-3.5" />
            Offload splits
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Sessions" value={sessions.length} icon={Boxes} loading={loading} index={0} />
        <StatCard title="Robots" value={robots} icon={Bot} loading={loading} index={1} />
        <StatCard
          title="Objects in bucket"
          value={statsQuery.data?.total_files ?? 0}
          icon={Boxes}
          loading={loading}
          index={2}
        />
        <StatCard
          title="Storage used"
          value={statsQuery.data?.total_size_human ?? "0 B"}
          icon={HardDrive}
          loading={loading}
          index={3}
        />
      </div>

      <Card className="animate-fade-in-up stagger-4">
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Recent sessions</CardTitle>
          <CardAction className="self-center">
            <Link
              href="/catalog"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              View catalog
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="p-0">
          {sessionsQuery.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sessionsQuery.error ? (
            <ErrorState error={sessionsQuery.error} onRetry={() => sessionsQuery.refetch()} />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No sessions yet"
              description="Start a session and offload a rosbag2 recording to get going."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Robot / Session
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Distro
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Splits
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Stored
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Created
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((s) => (
                  <TableRow key={s.prefix} className="table-row-hover">
                    <TableCell className="font-medium">
                      <Link
                        href={`/catalog/${encodeURIComponent(s.robot)}/${encodeURIComponent(s.session_id)}`}
                        className="rounded-sm underline-offset-4 hover:underline"
                      >
                        <span className="font-mono text-xs text-muted-foreground">{s.robot}</span>
                        <span className="mx-1 text-muted-foreground">/</span>
                        {s.session_id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{s.ros_distro}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {s.split_count}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {s.total_size_human}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(String(s.created_at))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
