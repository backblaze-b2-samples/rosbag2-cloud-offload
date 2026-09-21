"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, HardDrive } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DescribeCard } from "@/components/sessions/describe-card";
import { ReplayPanel } from "@/components/sessions/replay-panel";
import { OffloadPanel } from "@/components/sessions/offload-panel";
import { SessionEditForm } from "@/components/sessions/session-edit-form";
import { SessionDangerZone } from "@/components/sessions/session-danger-zone";
import { useSessionDetail } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}

export default function SessionDetailPage() {
  const params = useParams<{ robot: string; session: string }>();
  const robot = decodeURIComponent(params.robot);
  const session = decodeURIComponent(params.session);
  const { data, isLoading, error, refetch } = useSessionDetail(robot, session);

  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <nav className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/catalog" className="hover:text-foreground">
            Catalog
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-mono">{robot}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-mono text-foreground">{session}</span>
        </nav>
        <h1 className="page-title break-all">{session}</h1>
        {data && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{data.session.ros_distro}</Badge>
            <Badge variant="outline">{data.session.compression}</Badge>
            <span className="text-sm text-muted-foreground">
              {data.session.split_count} split(s) · {data.session.total_size_human} · created{" "}
              {formatDate(String(data.session.created_at))}
            </span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data ? (
        <EmptyState icon={HardDrive} title="Session not found" />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Card>
                <CardHeader className="border-b border-border py-4 px-5">
                  <CardTitle className="card-title">Session</CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <InfoRow label="Robot" value={<span className="font-mono">{robot}</span>} />
                  <InfoRow label="ROS distro" value={data.session.ros_distro} />
                  <InfoRow label="Compression" value={data.session.compression} />
                  <InfoRow
                    label="Prefix"
                    value={<span className="font-mono text-xs">{data.session.prefix}</span>}
                  />
                  <InfoRow
                    label="Tags"
                    value={
                      data.session.tags.length > 0 ? (
                        <span className="flex flex-wrap justify-end gap-1">
                          {data.session.tags.map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )
                    }
                  />
                  {data.session.description && (
                    <div className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
                      {data.session.description}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b border-border py-4 px-5">
                  <CardTitle className="card-title">Splits ({data.splits.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.splits.length === 0 ? (
                    <EmptyState
                      icon={HardDrive}
                      title="No splits offloaded yet"
                      description="Offload rosbag2 splits below to populate this session."
                    />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            File
                          </TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Size
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.splits.map((split) => (
                          <TableRow key={split.key}>
                            <TableCell className="font-mono text-xs break-all">
                              {split.filename}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                              {split.size_human}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <DescribeCard robot={robot} session={session} describe={data.describe} />
              <ReplayPanel robot={robot} session={session} />
            </div>
          </div>

          <OffloadPanel robot={robot} session={session} />

          <div className="grid gap-6 lg:grid-cols-2">
            <SessionEditForm session={data.session} />
            <SessionDangerZone robot={robot} session={session} />
          </div>
        </>
      )}
    </div>
  );
}
