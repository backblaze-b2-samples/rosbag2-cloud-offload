// GENERATED FILE — DO NOT EDIT.
//
// Written by `pnpm gen:api` from:
//   docs/api/openapi.json
//
// Hand edits are discarded by the next `pnpm gen:api`. `pnpm gen:check`
// (part of `pnpm verify:web`) fails while this file disagrees with the
// contract. To change what is here, change the FastAPI route or Pydantic
// model and re-run `pnpm contract:export && pnpm gen:api`.

/**
 * One session as the searchable Parquet catalog records it. Keyed by
 * robot, date, topic set and ROS distro — the axes a fleet asks a
 * recording catalog to answer ("every /camera bag from robot-07 on the
 * 3rd").
 */
export interface CatalogRow {
  /** Bytes actually stored in B2 for this session's splits. */
  compressed_size_bytes: number | null;
  /** rosbag2 compression format (e.g. "zstd"), or null. */
  compression_format: string | null;
  /** original_size_bytes / compressed_size_bytes when both are known. */
  compression_ratio: number | null;
  /** UTC recording date (YYYY-MM-DD), from created_at. */
  date: string;
  /** Recording duration, from rosbag2 metadata. */
  duration_seconds: number | null;
  /** Total messages across the bag, from rosbag2 metadata. */
  message_count: number | null;
  /** Uncompressed size from rosbag2 metadata, when recorded. */
  original_size_bytes: number | null;
  /** B2 key prefix: bags/<robot>/<session>/. */
  prefix: string;
  robot: string;
  ros_distro: string;
  session_id: string;
  split_count: number;
  topic_count: number;
  topic_set: string[];
}

/** The catalog as a filtered list of rows. */
export interface CatalogRows {
  count: number;
  rows: CatalogRow[];
}

/** Result of rolling every session into catalog/catalog.parquet. */
export interface CatalogSummary {
  bytes: number;
  parquet_key: string;
  rows: number;
}

/** One day's upload count, for the dashboard activity chart. */
export interface DailyUploadCount {
  date: string;
  uploads: number;
}

/** Acknowledgement that one object was removed from the bucket. */
export interface DeleteFileResponse {
  deleted: boolean;
  key: string;
}

/** Acknowledgement of a prefix-scoped session delete. */
export interface DeleteResult {
  /** Number of objects removed under the prefix. */
  deleted: number;
  prefix: string;
}

/**
 * What rosbag2 says about a recording. Produced by `ros2 bag info` when a
 * ROS 2 environment is on PATH (the on-device watcher path), otherwise by
 * parsing the `metadata.yaml` rosbag2 itself writes beside every bag.
 * Never a third-party bag reader — the source is always rosbag2's own CLI
 * or its own metadata file.
 */
export interface DescribeSummary {
  /** Bytes actually stored in B2 for the session's splits. */
  compressed_size_bytes: number | null;
  compression_format: string | null;
  compression_mode: string | null;
  compression_ratio: number | null;
  /** "ros2 bag info", "metadata.yaml", or "unavailable". */
  describe_source: string;
  duration_seconds: number | null;
  message_count: number | null;
  /** Uncompressed size from rosbag2 metadata, when recorded. */
  original_size_bytes: number | null;
  /** True when the `ros2` CLI was found on PATH where describe ran. */
  ros2_available: boolean;
  ros_distro: string | null;
  serialization_format: string | null;
  /** rosbag2 storage plugin id, e.g. "mcap" or "sqlite3". */
  storage_identifier: string | null;
  topic_types: Record<string, string>;
  topics: string[];
}

/** One stored object as the file list and the by-key metadata route see it. */
export interface FileMetadata {
  content_type: string;
  filename: string;
  folder: string;
  key: string;
  size_bytes: number;
  size_human: string;
  uploaded_at: string;
  /**
   * Public object URL, set only when B2_PUBLIC_URL_BASE is configured and
   * the bucket is public. Null otherwise — the UI asks for a presigned URL
   * instead.
   */
  url: string | null;
}

/** Rich metadata recomputed on demand by re-reading the stored object. */
export interface FileMetadataDetail {
  /** Audio/video: bits per second. */
  bitrate: number | null;
  /** Audio/video: codec name. */
  codec: string | null;
  /** Audio/video: duration in seconds. */
  duration_seconds: number | null;
  /**
   * Image-specific: EXIF tags, values stringified. Null for non-images or
   * when no EXIF block was present.
   */
  exif: Record<string, string> | null;
  extension: string;
  filename: string;
  /** Image-specific: pixel height. Null for non-images. */
  image_height: number | null;
  /** Image-specific: pixel width. Null for non-images. */
  image_width: number | null;
  md5: string;
  /**
   * Set when a format-specific extractor was skipped or failed (e.g. an
   * image above Pillow's decompression-bomb limit). The core fields are
   * always exact, so the UI shows this instead of silently dropping the
   * Image / PDF section.
   */
  metadata_warning: string | null;
  mime_type: string;
  /** PDF-specific: author. */
  pdf_author: string | null;
  /** PDF-specific: page count. Null for non-PDFs. */
  pdf_pages: number | null;
  /** PDF-specific: title. */
  pdf_title: string | null;
  sha256: string;
  size_bytes: number;
  size_human: string;
  uploaded_at: string;
}

/** The stored object as `POST /upload/verify` reports it back. */
export interface FileUploadResponse {
  content_type: string;
  filename: string;
  key: string;
  /** Rich metadata, when extraction succeeded for this type. */
  metadata: FileMetadataDetail | null;
  size_bytes: number;
  size_human: string;
  uploaded_at: string;
  /** Public object URL when the bucket is public, else null. */
  url: string | null;
}

/** A short-lived presigned GET for downloading or previewing one object. */
export interface FileUrlResponse {
  /**
   * Presigned GET URL. Download URLs force an attachment disposition;
   * preview URLs are signed inline so a PDF renders in place.
   */
  url: string;
}

export interface HTTPValidationError {
  detail?: ValidationError[];
}

/**
 * Liveness plus B2 reachability. The route answers HTTP 200 even when B2
 * is unreachable, so a caller must read `b2_connected` rather than
 * trusting the status code.
 */
export interface HealthStatus {
  /** True when the bucket answered a cheap head request. */
  b2_connected: boolean;
  /** "healthy" when B2 answered, else "degraded". */
  status: string;
}

/** The presigned-PUT plan for a session's splits, all under its own prefix. */
export interface OffloadPlan {
  prefix: string;
  robot: string;
  session_id: string;
  splits: OffloadPresignedSplit[];
}

/** A presigned PUT for one split, plus the headers the client must send. */
export interface OffloadPresignedSplit {
  expires_in: number;
  filename: string;
  headers: Record<string, string>;
  key: string;
  method: string;
  url: string;
}

/** The set of closed splits to offload for a session. */
export interface OffloadRequest {
  splits: OffloadSplit[];
}

/** One closed split the robot/browser wants to offload. */
export interface OffloadSplit {
  filename: string;
  /** Exact byte size; signed into the presigned PUT. */
  size: number;
}

/** What the browser declares before uploading directly to B2. */
export interface PresignUploadRequest {
  content_type: string;
  filename: string;
  size_bytes: number;
}

/**
 * A short-lived presigned PUT the browser uploads to, plus the exact
 * headers it must send. `Content-Length` and `content-type` are signed
 * into the URL, so B2 rejects a body of any other size or type.
 */
export interface PresignUploadResponse {
  content_type: string;
  expires_in: number;
  /**
   * Signed into the URL, so the browser must send them verbatim — B2
   * answers a mismatch with 403.
   */
  headers: Record<string, string>;
  key: string;
  method: string;
  url: string;
}

/** A short-lived presigned GET URL (used to download the Parquet catalog). */
export interface PresignedUrl {
  url: string;
}

/** Everything `ros2 bag play` needs to replay a session straight from B2. */
export interface ReplayManifest {
  expires_in: number;
  robot: string;
  ros_distro: string;
  session_id: string;
  /** rosbag2 storage plugin to replay with, e.g. "mcap" or "sqlite3". */
  storage_id_hint: string;
  topic_set: string[];
  urls: ReplayUrl[];
}

/** Prepare a replay manifest; expiry is optional. */
export interface ReplayRequest {
  /** Presigned-URL lifetime in seconds (default 3600). */
  expiry_seconds?: number | null;
}

/** A presigned GET for one split, for `ros2 bag play` to stream from B2. */
export interface ReplayUrl {
  filename: string;
  key: string;
  url: string;
}

/**
 * A single rosbag2 recording session — the primary entity. One session is
 * the set of splits a robot's rosbag2 writes during one run, stored under
 * `bags/<robot>/<session>/`, plus the `metadata.json` record this API
 * keeps beside them.
 */
export interface Session {
  /** Requested compression, e.g. "zstd" or "none". */
  compression: string;
  created_at: string;
  /** Set once the session has been described. */
  describe_source: string | null;
  description: string | null;
  /** B2 key prefix: bags/<robot>/<session>/. */
  prefix: string;
  robot: string;
  ros_distro: string;
  session_id: string;
  split_count: number;
  tags: string[];
  topic_set: string[];
  total_size_bytes: number;
  total_size_human: string;
}

/** Start a new session (the record; splits arrive via the offload flow). */
export interface SessionCreate {
  /** Compression rosbag2 used: "zstd", "lz4", or "none". */
  compression?: string;
  /** Robot / vehicle id, e.g. robot-07. */
  robot: string;
  /** ROS 2 distribution, e.g. "jazzy". */
  ros_distro: string;
  /** Optional session id. Generated from the timestamp when omitted. */
  session_id?: string | null;
  /** Topics this run is expected to record. */
  topic_set?: string[];
}

/**
 * A session plus its splits, its rosbag2 describe summary, and its catalog
 * row.
 */
export interface SessionDetail {
  catalog_row: CatalogRow | null;
  describe: DescribeSummary | null;
  session: Session;
  splits: SplitInfo[];
}

/** A filtered list of sessions. */
export interface SessionList {
  count: number;
  sessions: Session[];
}

/**
 * Edit a session's human-owned fields. Both are optional; omit to leave
 * as-is.
 */
export interface SessionUpdate {
  description?: string | null;
  tags?: string[] | null;
}

/** One closed rosbag2 split as stored in B2. */
export interface SplitInfo {
  filename: string;
  key: string;
  size_bytes: number;
  size_human: string;
}

/** Aggregate bucket figures behind the dashboard stat cards. */
export interface UploadStats {
  total_downloads: number;
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
}

export interface ValidationError {
  ctx?: Record<string, unknown>;
  input?: unknown;
  loc: (string | number)[];
  msg: string;
  type: string;
}

/** Sent after the direct PUT so the API can inspect the stored object. */
export interface VerifyUploadRequest {
  key: string;
}
