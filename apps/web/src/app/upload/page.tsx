"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingNotice } from "@/components/common/loading-notice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateSessionDialog } from "@/components/sessions/create-session-dialog";
import { OffloadPanel } from "@/components/sessions/offload-panel";
import { useSessions } from "@/lib/queries";

export default function OffloadPage() {
  const { data, isLoading, error, refetch } = useSessions();
  const [selected, setSelected] = useState("");
  const sessions = data?.sessions ?? [];
  const chosen = sessions.find((s) => `${s.robot}/${s.session_id}` === selected);

  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Offload</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
            Stream closed rosbag2 splits off the robot into Backblaze B2. Each split is
            presigned and uploaded directly to <code>bags/&lt;robot&gt;/&lt;session&gt;/</code>,
            so the bytes never pass through the API. For continuous, on-device offload use{" "}
            <code>services/api/scripts/offload_watcher.py</code>.
          </p>
        </div>
        <CreateSessionDialog />
      </div>

      <Card className="animate-fade-in-up stagger-2">
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Target session</CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-3">
          {isLoading ? (
            <LoadingNotice subject="sessions" />
          ) : error ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No sessions yet"
              description="Start a session first, then offload its splits here."
            />
          ) : (
            <>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Select a session to offload into" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem
                      key={`${s.robot}/${s.session_id}`}
                      value={`${s.robot}/${s.session_id}`}
                    >
                      {s.robot} / {s.session_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose where the splits land, or start a new session above.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {chosen && (
        <div className="animate-fade-in-up space-y-4">
          <OffloadPanel robot={chosen.robot} session={chosen.session_id} />
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/catalog/${encodeURIComponent(chosen.robot)}/${encodeURIComponent(chosen.session_id)}`}
              >
                Open session
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
