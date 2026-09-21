"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateSession } from "@/lib/queries";

// Finite-value fields use selectors, and the create form carries safe defaults
// as hints (never an autofill button) — the settings-form.tsx exemplar the kit
// mandates for create/edit forms.
const ROS_DISTROS = ["jazzy", "humble", "iron", "rolling"] as const;
const COMPRESSIONS = ["zstd", "lz4", "none"] as const;

const schema = z.object({
  robot: z
    .string()
    .min(1, "Robot id is required")
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Letters, digits, dot, dash, underscore only"),
  session_id: z
    .string()
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Letters, digits, dot, dash, underscore only")
    .optional()
    .or(z.literal("")),
  ros_distro: z.enum(ROS_DISTROS),
  topics: z.string().optional(),
  compression: z.enum(COMPRESSIONS),
});

type Values = z.infer<typeof schema>;

const defaultValues: Values = {
  robot: "",
  session_id: "",
  ros_distro: "jazzy",
  topics: "",
  compression: "zstd",
};

export function CreateSessionDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const createSession = useCreateSession();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues });

  const onSubmit = (values: Values) => {
    const topic_set = (values.topics ?? "")
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    createSession.mutate(
      {
        robot: values.robot,
        session_id: values.session_id ? values.session_id : undefined,
        ros_distro: values.ros_distro,
        topic_set,
        compression: values.compression,
      },
      {
        onSuccess: (session) => {
          toast.success(`Session ${session.robot}/${session.session_id} started`);
          setOpen(false);
          form.reset(defaultValues);
          router.push(
            `/catalog/${encodeURIComponent(session.robot)}/${encodeURIComponent(session.session_id)}`,
          );
        },
        onError: (error) => toast.error("Could not start session", { description: error.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus className="h-3.5 w-3.5" />
          Start session
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a recording session</DialogTitle>
          <DialogDescription>
            Creates the session record under <code>bags/&lt;robot&gt;/&lt;session&gt;/</code>.
            Splits are offloaded from the Offload page or the on-device watcher.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="robot"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Robot</FormLabel>
                  <FormControl>
                    <Input placeholder="robot-07" {...field} />
                  </FormControl>
                  <FormDescription>The vehicle or robot id this run belongs to.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="session_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session id</FormLabel>
                  <FormControl>
                    <Input placeholder="Auto from timestamp (e.g. 20260921T101500Z)" {...field} />
                  </FormControl>
                  <FormDescription>
                    Optional. Left blank, it defaults to the current UTC timestamp.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ros_distro"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ROS distro</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROS_DISTROS.map((distro) => (
                        <SelectItem key={distro} value={distro}>
                          {distro}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Default: jazzy.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="compression"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Compression</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMPRESSIONS.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The compression rosbag2 wrote the splits with. Default: zstd.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="topics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topics</FormLabel>
                  <FormControl>
                    <Input placeholder="/camera/image, /imu, /tf" {...field} />
                  </FormControl>
                  <FormDescription>
                    Optional. Comma- or space-separated; the actual topics come from
                    rosbag2 metadata on describe.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" disabled={createSession.isPending}>
                {createSession.isPending ? "Starting..." : "Start session"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
