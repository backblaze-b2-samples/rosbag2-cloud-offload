"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteSession } from "@/lib/queries";

export function SessionDangerZone({ robot, session }: { robot: string; session: string }) {
  const router = useRouter();
  const remove = useDeleteSession();

  const onConfirm = () =>
    remove.mutate(
      { robot, session },
      {
        onSuccess: (result) => {
          toast.success("Session deleted", {
            description: `${result.deleted} object(s) removed from ${result.prefix}`,
          });
          router.push("/catalog");
        },
        onError: (err) => toast.error("Delete failed", { description: err.message }),
      },
    );

  return (
    <Card className="border-destructive/40">
      <CardHeader className="border-b border-destructive/30 py-4 px-5">
        <CardTitle className="card-title text-destructive">Danger Zone</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Deletes this session from B2</AlertTitle>
          <AlertDescription>
            Every object under <code>bags/{robot}/{session}/</code> is permanently
            removed. Scoped strictly to this session&apos;s prefix. There is no undo.
          </AlertDescription>
        </Alert>
        <div className="flex items-center justify-between rounded-md border border-destructive/30 p-3">
          <div>
            <p className="text-sm font-medium">Delete session</p>
            <p className="text-xs text-muted-foreground">Removes the record and all splits.</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={remove.isPending}>
                {remove.isPending ? "Deleting…" : "Delete session"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {robot}/{session}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes every object under
                  <code> bags/{robot}/{session}/</code> from Backblaze B2.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onConfirm}
                  className={buttonVariants({ variant: "destructive" })}
                >
                  Yes, delete it
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
