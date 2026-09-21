/**
 * Post-offload follow-up sequencing.
 *
 * The product goal is "offload → described → rolled into the searchable catalog
 * → replay URL". Offloading splits is only the first stage; on its own it leaves
 * a first-time user with an un-described, un-cataloged session and two more
 * buttons to hunt for on two other screens. `chainOffloadFollowUps` carries the
 * session the rest of the way automatically, once per batch, reusing the SAME
 * mutations the manual "Run describe" and "Rebuild catalog" buttons call — no
 * new endpoints.
 *
 * Extracted from `components/sessions/offload-panel.tsx` so the sequencing rule
 * (run describe, then — only on its success — the catalog rebuild; skip the
 * whole chain when nothing landed) is unit-testable without a DOM.
 */
export interface OffloadFollowUpSteps {
  /** Run describe for the session (e.g. `useDescribeSession(...).mutateAsync`). */
  describe: () => Promise<unknown>;
  /** Rebuild the catalog (e.g. `useRebuildCatalog().mutateAsync`). */
  rebuild: () => Promise<unknown>;
}

/**
 * Run describe then the catalog rebuild after an offload batch.
 *
 * - Skips everything (resolves `false`) when no split uploaded successfully, so
 *   a fully failed batch never fires the follow-ups.
 * - Awaits describe first; only runs rebuild if describe resolved. Describe
 *   itself does not throw when there is no `metadata.yaml` yet — the API returns
 *   an "unavailable" summary — so the chain still catalogs the session.
 * - Rejects if a stage fails, so the caller can surface the existing error
 *   state; rebuild never runs after a failed describe.
 *
 * @returns `true` when the chain ran to completion, `false` when it was skipped.
 */
export async function chainOffloadFollowUps(
  successfulUploads: number,
  steps: OffloadFollowUpSteps,
): Promise<boolean> {
  if (successfulUploads <= 0) return false;
  await steps.describe();
  await steps.rebuild();
  return true;
}
