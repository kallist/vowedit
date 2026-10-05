import type { Asset } from "./types";

export function importReady(candidates: (Asset | null)[], sourceLabel: string) {
  return (
    candidates.length === 3 &&
    candidates.every(Boolean) &&
    sourceLabel.trim().length >= 1 &&
    sourceLabel.trim().length <= 80
  );
}

// Older generated submissions remain recoverable without a storage format migration.
export function submissionPath(request: object) {
  return "candidate_images" in request ? "/imported-runs" : "/runs";
}
