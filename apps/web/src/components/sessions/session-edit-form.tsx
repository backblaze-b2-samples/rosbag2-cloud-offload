"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useUpdateSession } from "@/lib/queries";
import type { Session } from "@rosbag2-cloud-offload/shared";

export function SessionEditForm({ session }: { session: Session }) {
  const [tags, setTags] = useState(session.tags.join(", "));
  const [description, setDescription] = useState(session.description ?? "");
  const update = useUpdateSession(session.robot, session.session_id);

  const onSave = () => {
    const tagList = tags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    update.mutate(
      { tags: tagList, description: description.trim() ? description.trim() : null },
      {
        onSuccess: () => toast.success("Session updated"),
        onError: (err) => toast.error("Update failed", { description: err.message }),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Edit</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="session-tags">Tags</Label>
          <Input
            id="session-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="urban, night-drive, sensor-suite-v2"
          />
          <p className="text-xs text-muted-foreground">Comma- or space-separated labels.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="session-description">Description</Label>
          <Textarea
            id="session-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this run captured, conditions, notes…"
            className="resize-none"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
