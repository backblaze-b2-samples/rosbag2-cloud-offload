"use client";

import Link from "next/link";
import { Boxes } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { humanizeBytes } from "@/lib/utils";
import type { CatalogRow } from "@rosbag2-cloud-offload/shared";

function sessionHref(row: CatalogRow) {
  return `/catalog/${encodeURIComponent(row.robot)}/${encodeURIComponent(row.session_id)}`;
}

export function SessionsTable({ rows }: { rows: CatalogRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="No sessions yet"
        description="Start a session and offload a rosbag2 recording to see it here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Robot / Session
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Date
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Distro
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Topics
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Splits
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Stored
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Compression
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.prefix} className="table-row-hover">
            <TableCell className="font-medium">
              <Link
                href={sessionHref(row)}
                className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="font-mono text-xs text-muted-foreground">{row.robot}</span>
                <span className="mx-1 text-muted-foreground">/</span>
                {row.session_id}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground whitespace-nowrap">{row.date}</TableCell>
            <TableCell>
              <Badge variant="secondary">{row.ros_distro}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{row.topic_count}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{row.split_count}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {row.compressed_size_bytes !== null ? humanizeBytes(row.compressed_size_bytes) : "—"}
            </TableCell>
            <TableCell>
              {row.compression_format ? (
                <Badge variant="outline">{row.compression_format}</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
