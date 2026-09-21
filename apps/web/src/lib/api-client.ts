import type {
  CatalogRows,
  CatalogSummary,
  DailyUploadCount,
  DeleteFileResponse,
  DeleteResult,
  FileMetadata,
  FileMetadataDetail,
  FileUploadResponse,
  FileUrlResponse,
  HealthStatus,
  OffloadPlan,
  OffloadRequest,
  PresignUploadResponse,
  PresignedUrl,
  ReplayManifest,
  ReplayRequest,
  Session,
  SessionCreate,
  SessionDetail,
  SessionList,
  SessionUpdate,
  UploadStats,
} from "@rosbag2-cloud-offload/shared";

import { API_CLIENT_ROUTES } from "./generated/api-routes";

// The route registry is GENERATED from the API contract (`pnpm gen:api`), so
// it cannot drift from FastAPI. Re-exported from here because this module is
// the frontend's API surface: consumers and the contract test import it from
// `lib/api-client`, and that import path should not change just because the
// registry moved behind a generator.
//
// Everything else in this file is hand-written on purpose — error policy, base
// URL resolution, the legacy-route fallback, the CORS diagnostics and the XHR
// upload transport are per-app judgement the contract does not describe. See
// `scripts/gen/api-gen.config.json` (`escapeHatch`).
export { API_CLIENT_ROUTES };

// Single-origin deploys (Vercel `services`: one project serving web + API) put
// the API under /api on the same origin, so no NEXT_PUBLIC_API_URL is needed —
// a production build with it unset defaults to the relative "/api". An explicit
// NEXT_PUBLIC_API_URL still wins (two-project / separate-origin deploys). Local
// dev (NODE_ENV !== "production") falls back to the dev API port.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000");

/** Typed API error with HTTP status code for caller-side branching. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True for 408, 429, 500, 502, 503, 504 — worth retrying. */
  get isRetryable(): boolean {
    return [408, 429, 500, 502, 503, 504].includes(this.status);
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

/**
 * Build the right status-0 ApiError for a thrown fetch().
 *
 * fetch() rejects with a TypeError for genuinely-offline/DNS failures AND for
 * responses the browser refused to expose — most notably a cross-origin 500
 * that shipped without `Access-Control-Allow-Origin`. We can't tell those apart
 * from the error object, but `navigator.onLine === false` reliably means the
 * device has no connectivity. Anything else reached the network, so the most
 * likely cause is the server erroring with a CORS-blocked response — point the
 * developer at the API logs instead of blaming their connection.
 */
function networkError(): ApiError {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new ApiError("You appear to be offline — check your connection", 0);
  }
  return new ApiError(
    "Couldn't reach the API, or the server returned an error the browser blocked (CORS). Check the API logs.",
    0,
  );
}

/**
 * Build the status-0 ApiError for a failed browser→B2 PUT.
 *
 * Deliberately not `networkError()`: these bytes never touch the API, so
 * "check the API logs" sends the developer to the one place that looks fine —
 * the presign that produced this URL succeeded and logged a clean 200.
 *
 * On a deployed origin the overwhelmingly likely cause is that the *bucket's*
 * CORS does not allow that origin, so the browser blocks the PUT before it
 * leaves and XHR reports only a contentless `error` event. Local dev rarely
 * trips it because localhost origins are usually already allowed — which is
 * exactly why it first appears immediately after a deploy. Name the cause and
 * the remedy instead of leaving a mystery.
 */
function storageNetworkError(): ApiError {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new ApiError("You appear to be offline — check your connection", 0);
  }
  return new ApiError(
    "Couldn't upload to B2 storage. If this app is deployed, the bucket's CORS " +
      "must allow this origin — run services/api/scripts/setup_b2_cors.py " +
      "--origin <your origin>.",
    0,
  );
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw networkError();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.detail || `API error: ${res.status}`,
      res.status,
    );
  }
  return res.json();
}

function isEndpointUnavailable(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    (error.message === "Not Found" || error.message === "API error: 404")
  );
}

async function apiFetchWithLegacyFallback<T>(
  path: string,
  legacyPath: () => string,
  init?: RequestInit
): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if (isEndpointUnavailable(error)) {
      return apiFetch<T>(legacyPath(), init);
    }
    throw error;
  }
}

function fileKeyQuery(key: string): string {
  if (key.length === 0) {
    throw new ApiError("File key is required", 400);
  }
  return new URLSearchParams({ key }).toString();
}

function legacyFileKeyPath(
  key: string,
  options: { blockRouteCollisions?: boolean } = {}
): string {
  if (!isLegacyPathFallbackSafe(key, options)) {
    throw new ApiError("Current API version required for this file key", 404);
  }
  return encodeURIComponent(key);
}

/**
 * Substitute a file key into a legacy `{key}` path template. The parameter type
 * requires the literal `{key}` placeholder, so passing a registry path that has
 * no placeholder is a compile error rather than a silent no-op that would send
 * the request to a keyless URL.
 */
function legacyFileKeyRoute(
  path: `${string}{key}${string}`,
  key: string,
  options: { blockRouteCollisions?: boolean } = {}
): string {
  return path.replace("{key}", legacyFileKeyPath(key, options));
}

function isLegacyPathFallbackSafe(
  key: string,
  { blockRouteCollisions = false }: { blockRouteCollisions?: boolean } = {}
): boolean {
  if (/(\.\.\/|\/\.\.|\\|%2e%2e|%00|\x00)/i.test(key)) return false;
  if (!blockRouteCollisions) return true;

  const lowerKey = key.toLowerCase();
  if (lowerKey === "stats" || lowerKey === "stats/activity") return false;
  if (lowerKey.endsWith("/download") || lowerKey.endsWith("/preview")) return false;
  return true;
}

export async function getHealth() {
  return apiFetch<HealthStatus>(API_CLIENT_ROUTES.health.path);
}

export async function getFiles(prefix = "", limit = 100) {
  return apiFetch<FileMetadata[]>(
    `${API_CLIENT_ROUTES.files.path}?prefix=${encodeURIComponent(prefix)}&limit=${limit}`
  );
}

export async function getFileStats() {
  return apiFetch<UploadStats>(API_CLIENT_ROUTES.fileStats.path);
}

export async function getUploadActivity(days = 7) {
  return apiFetch<DailyUploadCount[]>(
    `${API_CLIENT_ROUTES.uploadActivity.path}?days=${days}`
  );
}

export async function getFile(key: string) {
  return apiFetchWithLegacyFallback<FileMetadata>(
    `${API_CLIENT_ROUTES.fileByKeyMetadata.path}?${fileKeyQuery(key)}`,
    () =>
      legacyFileKeyRoute(API_CLIENT_ROUTES.legacyFileMetadata.path, key, {
        blockRouteCollisions: true,
      })
  );
}

/**
 * Rich metadata (checksums, image/PDF fields) for an already-stored file.
 * The server recomputes this on demand by downloading the object, so it's a
 * heavier call than getFile — fetch it lazily (only when the user asks to see
 * details). No legacy path fallback: this endpoint is new, so an older backend
 * wouldn't serve it under any route.
 */
export async function getFileDetail(key: string) {
  return apiFetch<FileMetadataDetail>(
    `${API_CLIENT_ROUTES.fileByKeyDetail.path}?${fileKeyQuery(key)}`
  );
}

export async function getDownloadUrl(key: string) {
  return apiFetchWithLegacyFallback<FileUrlResponse>(
    `${API_CLIENT_ROUTES.fileByKeyDownload.path}?${fileKeyQuery(key)}`,
    () => legacyFileKeyRoute(API_CLIENT_ROUTES.legacyFileDownload.path, key)
  );
}

/** Preview-only presigned URL — does NOT increment the download counter. */
export async function getPreviewUrl(key: string) {
  return apiFetchWithLegacyFallback<FileUrlResponse>(
    `${API_CLIENT_ROUTES.fileByKeyPreview.path}?${fileKeyQuery(key)}`,
    () => legacyFileKeyRoute(API_CLIENT_ROUTES.legacyFilePreview.path, key)
  );
}

export async function deleteFile(key: string) {
  return apiFetchWithLegacyFallback<DeleteFileResponse>(
    `${API_CLIENT_ROUTES.fileByKeyDelete.path}?${fileKeyQuery(key)}`,
    () => legacyFileKeyRoute(API_CLIENT_ROUTES.legacyFileDelete.path, key),
    {
      // Derived from the registry so the verb the contract test checks is the
      // verb actually sent — a hardcoded "DELETE" could silently disagree.
      method: API_CLIENT_ROUTES.fileByKeyDelete.method.toUpperCase(),
    }
  );
}

/**
 * Upload a file directly to B2 in three steps: presign (the API validates the
 * declared file and signs a short-lived PUT), a direct browser→B2 PUT, then
 * verify (the API inspects the stored object). The bytes never pass through the
 * API, which is what removes Vercel's ~4.5 MB Function payload ceiling.
 *
 * The `(file, onProgress) => FileUploadResponse` signature is unchanged, so the
 * upload queue and progress UI don't care that the transport changed. Progress
 * tracks the browser→B2 leg; when it reaches 100% the queue enters its
 * server-side phase (see `upload-status`) while `verify` runs.
 */
export async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<FileUploadResponse> {
  const presign = await apiFetch<PresignUploadResponse>(
    API_CLIENT_ROUTES.uploadPresign.path,
    {
      method: API_CLIENT_ROUTES.uploadPresign.method.toUpperCase(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      }),
    }
  );

  await putFileToStorage(presign, file, onProgress);

  return apiFetch<FileUploadResponse>(API_CLIENT_ROUTES.uploadVerify.path, {
    method: API_CLIENT_ROUTES.uploadVerify.method.toUpperCase(),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: presign.key }),
  });
}

/**
 * PUT the raw file bytes to the presigned B2 URL. XHR (not fetch) because only
 * XHR exposes upload progress. The signed URL binds the exact size and
 * content-type, so `presign.headers` must be sent verbatim — B2 answers a
 * mismatch with 403.
 */
function putFileToStorage(
  presign: PresignUploadResponse,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        // B2 errors are XML, not JSON — surface a stable message rather than
        // the raw body (a 403 here means the signed size/type was violated).
        reject(
          new ApiError(`Upload to storage failed (${xhr.status})`, xhr.status)
        );
      }
    });

    xhr.addEventListener("error", () => reject(storageNetworkError()));
    xhr.addEventListener("abort", () =>
      reject(new ApiError("Upload aborted", 0)),
    );

    xhr.open(presign.method.toUpperCase(), presign.url);
    for (const [name, value] of Object.entries(presign.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.send(file);
  });
}

// --- sessions & catalog (rosbag2 offload domain) -------------------------
// Session CRUD + run verbs (offload, describe, replay) and the Parquet catalog.
// Path templates come from the generated registry; `{robot}`/`{session}` are
// substituted here so a request never lands on a keyless URL.

function fillSessionPath(template: string, robot: string, session: string): string {
  return template
    .replace("{robot}", encodeURIComponent(robot))
    .replace("{session}", encodeURIComponent(session));
}

function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export interface SessionFilters {
  robot?: string;
  ros_distro?: string;
  since?: string;
  topic?: string;
  // Index signature so a filter bag is a plain query record (toQuery consumes it).
  [key: string]: string | undefined;
}

export async function listSessions(filters: SessionFilters = {}) {
  return apiFetch<SessionList>(`${API_CLIENT_ROUTES.sessions.path}${toQuery(filters)}`);
}

export async function getSessionDetail(robot: string, session: string) {
  return apiFetch<SessionDetail>(
    fillSessionPath(API_CLIENT_ROUTES.sessionDetail.path, robot, session)
  );
}

export async function createSession(payload: SessionCreate) {
  return apiFetch<Session>(
    API_CLIENT_ROUTES.sessionCreate.path,
    jsonInit(API_CLIENT_ROUTES.sessionCreate.method.toUpperCase(), payload)
  );
}

export async function updateSession(
  robot: string,
  session: string,
  payload: SessionUpdate
) {
  return apiFetch<Session>(
    fillSessionPath(API_CLIENT_ROUTES.sessionUpdate.path, robot, session),
    jsonInit(API_CLIENT_ROUTES.sessionUpdate.method.toUpperCase(), payload)
  );
}

export async function deleteSession(robot: string, session: string) {
  return apiFetch<DeleteResult>(
    fillSessionPath(API_CLIENT_ROUTES.sessionDelete.path, robot, session),
    { method: API_CLIENT_ROUTES.sessionDelete.method.toUpperCase() }
  );
}

export async function offloadSession(
  robot: string,
  session: string,
  payload: OffloadRequest
) {
  return apiFetch<OffloadPlan>(
    fillSessionPath(API_CLIENT_ROUTES.sessionOffload.path, robot, session),
    jsonInit(API_CLIENT_ROUTES.sessionOffload.method.toUpperCase(), payload)
  );
}

export async function describeSession(robot: string, session: string) {
  return apiFetch<SessionDetail>(
    fillSessionPath(API_CLIENT_ROUTES.sessionDescribe.path, robot, session),
    { method: API_CLIENT_ROUTES.sessionDescribe.method.toUpperCase() }
  );
}

export async function replaySession(
  robot: string,
  session: string,
  payload: ReplayRequest = {}
) {
  return apiFetch<ReplayManifest>(
    fillSessionPath(API_CLIENT_ROUTES.sessionReplay.path, robot, session),
    jsonInit(API_CLIENT_ROUTES.sessionReplay.method.toUpperCase(), payload)
  );
}

export async function getCatalog(filters: SessionFilters & { date?: string } = {}) {
  return apiFetch<CatalogRows>(`${API_CLIENT_ROUTES.catalog.path}${toQuery(filters)}`);
}

export async function rebuildCatalog() {
  return apiFetch<CatalogSummary>(API_CLIENT_ROUTES.catalogRebuild.path, {
    method: API_CLIENT_ROUTES.catalogRebuild.method.toUpperCase(),
  });
}

export async function getCatalogDownloadUrl() {
  return apiFetch<PresignedUrl>(API_CLIENT_ROUTES.catalogDownload.path);
}

/**
 * Offload one closed split: presign a PUT for it (scoped to the session's
 * bags/<robot>/<session>/ prefix), then PUT the raw bytes directly to B2. The
 * bytes never traverse the API — the same direct-to-B2 path the upload flow
 * uses, so there is no Function payload ceiling on a multi-GB bag split.
 */
export async function uploadSplit(
  robot: string,
  session: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ key: string; filename: string }> {
  const plan = await offloadSession(robot, session, {
    splits: [{ filename: file.name, size: file.size }],
  });
  const split = plan.splits[0];
  await putToPresignedUrl(split.url, split.method, split.headers, file, onProgress);
  return { key: split.key, filename: split.filename };
}

function putToPresignedUrl(
  url: string,
  method: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new ApiError(`Offload to storage failed (${xhr.status})`, xhr.status));
      }
    });
    xhr.addEventListener("error", () => reject(storageNetworkError()));
    xhr.addEventListener("abort", () => reject(new ApiError("Offload aborted", 0)));
    xhr.open(method.toUpperCase(), url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.send(file);
  });
}
