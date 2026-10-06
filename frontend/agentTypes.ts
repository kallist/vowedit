import type { CandidatePlan, Contract } from './types';
import type { Stroke } from './masks';

export type AgentAction = {
  request_actor?: 'user' | 'agent';
  id: string; action: string; state: string; expires_at: string;
  draft_id?: string; run_id?: string; result_ids: { run_id?: string; draft_id?: string };
  frozen: { contract?: Contract; plan?: CandidatePlan; provider?: string;
    recipient?: string; cost?: string; outbound?: string[]; required_confirmations?: string[];
    candidate_id?: string; candidate_asset?: string; candidate_index?: number; manual_review?: {verdict: string}; evaluation?: {eligible:boolean} };
};
export type EditingDraft = {
  id: string; parent_run_id?: string; instruction: string; revision: number; status: string; source_asset_id: string | null;
  source_dimensions: { width: number; height: number } | null;
  contract: Contract | null; provider: string; strokes: Stroke[];
  submitted_run_id: string | null; plan: CandidatePlan | null;
  pending_requests: AgentAction[];
};
