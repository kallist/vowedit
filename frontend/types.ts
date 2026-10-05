export type Asset = { id: string; width: number; height: number; url: string };
export type Contract = {
  change: { instruction: string; mask: string };
  keep: {
    type: "manual_region";
    label: string;
    mask: string;
    threshold: number;
  }[];
  background_threshold: number | null;
};
export type Evaluation = {
  metric_version: string;
  protected_similarity: number | null;
  background_preservation: number;
  change_difference: number;
  unexpected_drift: number;
  overall_score: number;
  eligible: boolean;
  meaningful_change: boolean;
  violations: string[];
  warnings: string[];
  weights: { protected: number; background: number };
  minimum_change: number;
};
export type Candidate = {
  id: string;
  index: number;
  image: string;
  ghost: string | null;
  evaluation: Evaluation | null;
  error: { code: string; message: string } | null;
  rank: number | null;
  seed: number | null;
  manual_review: { verdict: "pending" | "pass" | "fail"; notes: string };
};
export type Run = {
  id: string;
  job_id: string;
  source_image: string;
  status: string;
  provider: string;
  source_label?: string | null;
  contract: Contract;
  candidates: Candidate[];
  selected_candidate_id: string | null;
  no_good_candidate: boolean;
  generation_retry_safe: boolean;
  error: { code: string; message: string } | null;
  failures: { index: number; code: string; message: string }[];
  created_at: string;
  generation_seconds?: number;
};
export const assetUrl = (id: string) => `/api/assets/${id}`;
export const sourceBadge = (run: Pick<Run, "provider" | "source_label">) =>
  run.provider === "imported"
    ? `IMPORTED · ${run.source_label || "External candidates"}`
    : run.provider === "mock"
      ? "MOCK · pixel simulation"
      : run.provider;
export const label = (index: number) => String.fromCharCode(65 + index);
export const terminal = (state: string) =>
  ["completed", "partial", "failed_generation", "failed_evaluation"].includes(
    state,
  );
export const metric = (value: number | null | undefined) =>
  value == null ? "Not defined" : `${value.toFixed(1)}`;
