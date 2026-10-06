import type { MessageKey } from "./en";
import { en } from "./en";
const codes: Record<string, MessageKey> = {
  INVALID_INPUT: "Check required fields, identifiers and thresholds.",
  INVALID_IMAGE: "This file could not be decoded safely.",
  ASSET_NOT_FOUND: "A saved image is missing or unreadable.",
  RUN_NOT_FOUND:
    "This edit was not found. Open Your edits or start a new edit.",
  JOB_CONFLICT:
    "This request conflicts with a saved operation or current job. Refresh and check history.",
  SELECTION_CONFLICT: "Selection changed. Refresh this edit.",
  CONFIRMATION_REQUIRED: "Confirm each candidate issue first.",
  DRAFT_CONFLICT: "Original does not belong to this starter.",
  DRAFT_NOT_FOUND: "Continuation starter not found.",
  PLAN_CONFLICT: "Preview changed. Review the plan again.",
  PLAN_TOO_LONG: "Effective instruction exceeds 2400 characters.",
  CANDIDATE_MISSING: "Candidate not found.",
  CANDIDATE_SIZE_MISMATCH:
    "Candidate dimensions must match the original. No resizing is performed.",
  KEEP_REQUIRED: "Imported edits require a KEEP mask.",
  PREPARATION_CONFLICT:
    "Prepared candidate belongs to a different source, CHANGE mask or source label.",
  PREPARATION_UNAVAILABLE: "Prepared asset provenance is unavailable.",
  MASK_OVERLAP: "CHANGE and KEEP overlap. Erase the overlap before continuing.",
  MASK_SIZE_MISMATCH: "Masks must match the source image dimensions.",
  EMPTY_CHANGE_MASK: "Paint an area to CHANGE first.",
  EMPTY_KEEP_MASK: "A named KEEP region cannot be empty.",
  EMPTY_BACKGROUND: "Leave an area outside CHANGE for comparison.",
  PROVIDER_UNAVAILABLE: "This provider is not configured or cannot be reached.",
  PROVIDER_STATE_UNKNOWN:
    "Provider state is unknown. Check its queue before creating a new edit; an automatic retry could duplicate work.",
  PROVIDER_FAILED: "Candidate generation failed.",
  PROVIDER_AUTH: "Provider authentication failed.",
  PROVIDER_BALANCE: "Provider balance is insufficient.",
  PROVIDER_RATE_LIMIT: "Provider rate limit reached.",
  PROVIDER_TIMEOUT: "Provider timed out. Check its queue before retrying.",
  MODEL_MISSING: "Configured model is unavailable.",
  EVALUATION_FAILED: "Evaluation failed. The candidate image is preserved.",
  STORAGE_FAILED:
    "Local storage is unavailable. Check disk space and permissions.",
  QUEUE_FULL: "The local queue is full. Wait for an edit to finish.",
  RECEIPT_UNAVAILABLE: "A receipt needs a completed evaluation.",
  GENERATION_NOT_APPLICABLE: "Imported edits only support evaluation retries.",
  PROCESS_INTERRUPTED:
    "The app stopped during this job. Saved candidates are preserved.",
  ORIGIN_REJECTED: "Local access only.",
};
export function safeErrorText(code: string) {
  return en[
    codes[code] ||
      "The local service could not complete this request. Try again."
  ];
}
