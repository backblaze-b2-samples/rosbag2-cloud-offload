"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ApiError,
  createSession,
  deleteFile,
  deleteSession,
  describeSession,
  getCatalog,
  getDownloadUrl,
  getFileDetail,
  getFiles,
  getFileStats,
  getHealth,
  getPreviewUrl,
  getSessionDetail,
  getUploadActivity,
  listSessions,
  rebuildCatalog,
  replaySession,
  type SessionFilters,
  updateSession,
} from "@/lib/api-client";
import type {
  CatalogRows,
  DeleteResult,
  FileMetadata,
  FileMetadataDetail,
  FileUrlResponse,
  ReplayManifest,
  Session,
  SessionCreate,
  SessionDetail,
  SessionList,
  SessionUpdate,
} from "@rosbag2-cloud-offload/shared";
import { qk } from "@/lib/generated/query-keys";

// Query keys are GENERATED from the API contract (`pnpm gen:api`) and their
// hierarchy is declared in `scripts/gen/api-gen.config.json`, so invalidating
// a parent key still reaches its children and no hook can invent a key the API
// cannot answer. Re-exported here because this module is the data layer's
// public surface: components and tests import `qk` from `@/lib/queries`.
//
// The caching policy below — staleTime, refetchInterval, retry, `enabled`
// gating, the query-vs-mutation choice, and the cache surgery in
// `dropDeletedFileFromCache` — is hand-written on purpose and is never
// generated.
export { qk };

export type Health = Awaited<ReturnType<typeof getHealth>>;

/**
 * Gate a query on something being open/visible. Deliberately the only option we
 * expose, so callers can't drift the caching policy per call site — the ⌘K
 * palette reuses `useFiles`' key (and therefore its cache) instead of fetching
 * its own private, smaller list.
 */
export interface QueryGate {
  enabled?: boolean;
}

export function useFiles(prefix = "", limit = 100, { enabled = true }: QueryGate = {}) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
    enabled,
  });
}

export function useFileStats({ enabled = true }: QueryGate = {}) {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
    enabled,
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Rich metadata for an already-stored file. The server recomputes it on demand
// (a full object download), so it's only fetched when `enabled` — i.e. the
// preview dialog is open AND the user expands "Detailed metadata". Kept
// short-lived like the preview URL; cheap correctness under key overwrites.
export function useFileDetail(key: string | undefined, enabled: boolean) {
  return useQuery<FileMetadataDetail, ApiError>({
    queryKey: qk.detail(key ?? ""),
    queryFn: () => getFileDetail(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Health poll for the top-of-app B2 banner. `retry: false` and letting a
// failed fetch leave `data` undefined keeps a down API silent (the
// per-component ErrorState covers that); the banner only reacts to an up API
// reporting b2_connected: false. Polls every 60s and on window focus.
export function useHealth() {
  return useQuery<Health>({
    queryKey: qk.health(),
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Drop a deleted object from every cached file list, plus its own cached
 * preview/detail entries.
 *
 * Invalidation alone is not enough: the refetch re-lists the whole bucket and
 * took 5-6s in practice, so the success toast fired while the row was still
 * listed — and using that stale row's Preview 404'd. Editing the cache makes
 * the row disappear with the toast; the invalidation that follows still
 * reconciles against the server.
 *
 * Exported for tests — the mutation below is its only production caller.
 */
export function dropDeletedFileFromCache(qc: QueryClient, fileKey: string) {
  qc.setQueriesData<FileMetadata[]>(
    // Partial key: matches qk.files(prefix, limit) for every prefix/limit.
    { queryKey: [...qk.all, "files"] },
    (previous) =>
      previous ? previous.filter((file) => file.key !== fileKey) : previous,
  );
  // A presigned URL for a deleted key can only 404 now.
  qc.removeQueries({ queryKey: qk.preview(fileKey) });
  qc.removeQueries({ queryKey: qk.detail(fileKey) });
}

/**
 * Fetch a download URL for one file.
 *
 * A mutation, not a query: it has a server side effect (it bumps the download
 * counter) and it must never be cached or replayed. Being a mutation is also
 * what gives the UI an honest pending state — the old code awaited the presign
 * inside a plain click handler, so a slow round trip left the screen completely
 * unchanged and a user could not tell a working download from a dead button.
 *
 * The caller performs the navigation (see `lib/browser-download.ts`) and gets
 * `isPending` / `variables` for the pending row.
 */
export function useDownloadUrl() {
  const qc = useQueryClient();
  return useMutation<FileUrlResponse, ApiError, FileMetadata>({
    mutationFn: (file) => getDownloadUrl(file.key),
    // The server counted a download, so the dashboard's "Total Downloads" is
    // now stale. Cheap: /files/stats reads a cached bucket listing.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.stats() }),
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    onSuccess: (_data, fileKey) => {
      // Remove the row immediately, then reconcile everything (lists, stats,
      // activity) against the server in the background.
      dropDeletedFileFromCache(qc, fileKey);
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- sessions & catalog (rosbag2 offload domain) -------------------------
// The generated `qk.sessions` / `qk.catalog` cover the two cached list reads.
// Session *detail* is keyed by path params (robot/session), which the contract
// carries as path segments rather than query params, so its key is hand-written
// here — a caching decision the generator does not own.

/** Cache key for a single session's detail, keyed by robot + session id. */
export const sessionDetailKey = (robot: string, session: string) =>
  [...qk.all, "session", robot, session] as const;

export function useSessions(
  filters: SessionFilters = {},
  { enabled = true }: QueryGate = {},
) {
  return useQuery<SessionList, ApiError>({
    queryKey: qk.sessions(filters.robot, filters.ros_distro, filters.since, filters.topic),
    queryFn: () => listSessions(filters),
    enabled,
  });
}

export function useSessionDetail(
  robot: string,
  session: string,
  { enabled = true }: QueryGate = {},
) {
  return useQuery<SessionDetail, ApiError>({
    queryKey: sessionDetailKey(robot, session),
    queryFn: () => getSessionDetail(robot, session),
    enabled: enabled && !!robot && !!session,
  });
}

export function useCatalog(
  filters: SessionFilters & { date?: string } = {},
  { enabled = true }: QueryGate = {},
) {
  return useQuery<CatalogRows, ApiError>({
    queryKey: qk.catalog(filters.robot, filters.date, filters.topic, filters.ros_distro),
    queryFn: () => getCatalog(filters),
    enabled,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation<Session, ApiError, SessionCreate>({
    mutationFn: (payload) => createSession(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}

export function useUpdateSession(robot: string, session: string) {
  const qc = useQueryClient();
  return useMutation<Session, ApiError, SessionUpdate>({
    mutationFn: (payload) => updateSession(robot, session, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionDetailKey(robot, session) });
      qc.invalidateQueries({ queryKey: [...qk.all, "sessions"] });
      qc.invalidateQueries({ queryKey: [...qk.all, "catalog"] });
    },
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation<DeleteResult, ApiError, { robot: string; session: string }>({
    mutationFn: ({ robot, session }) => deleteSession(robot, session),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}

export function useDescribeSession(robot: string, session: string) {
  const qc = useQueryClient();
  return useMutation<SessionDetail, ApiError, void>({
    mutationFn: () => describeSession(robot, session),
    onSuccess: (data) => {
      qc.setQueryData(sessionDetailKey(robot, session), data);
      qc.invalidateQueries({ queryKey: [...qk.all, "catalog"] });
    },
  });
}

export function useReplaySession(robot: string, session: string) {
  return useMutation<ReplayManifest, ApiError, void>({
    mutationFn: () => replaySession(robot, session),
  });
}

export function useRebuildCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rebuildCatalog(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...qk.all, "catalog"] }),
  });
}
