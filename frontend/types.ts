export type Asset = { id: string; width: number; height: number; url: string };
export type PreparationMetadata = {
  generation_source_label: string;
  raw_candidate_asset: string;
  prepared_candidate_asset: string;
  preparation: {
    type: "boundary-lock-v1";
    source_size: [number, number];
    target_size: [number, number];
    normalization: { method: string; crop_box: number[]; resampling: string };
    change_mask: string;
  };
};
export type PreparedAsset = Asset & { metadata: PreparationMetadata };
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
  regions: { label: string; type: string; threshold: number; score: number }[];
};
export type PlanSlot = {
  index: number;
  seed: number;
  strategy_id: "safe" | "balanced" | "bold";
  base_instruction: string;
  strategy_directive: string;
  effective_instruction: string;
  template_version: string;
};
export type CandidatePlan = {
  mode: "strategy-v1";
  fingerprint: string;
  template_version: string;
  directive_language: "en";
  slots: PlanSlot[];
};
export type Starter = {
  id: string;
  source_image: string;
  source_size: [number, number];
  parent_run_id: string;
  parent_candidate_id: string;
  artifact_kind: string;
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
  generation_metadata?: Partial<PreparationMetadata>;
  manual_review: { verdict: "pending" | "pass" | "fail"; notes: string };
  candidate_plan?: PlanSlot | null;
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
  candidate_mode?: string;
  candidate_plan?: CandidatePlan | null;
  user_selected_candidate_id?: string | null;
  selection_revision?: number;
  parent_run_id?: string | null;
  parent_candidate_id?: string | null;
  root_run_id?: string;
  derivation_kind?: string | null;
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
