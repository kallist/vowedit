# Real provider validation — 2026-10-02

RunningHub adapter: **IMPLEMENTED / NOT TESTED against real generation**.
Local ComfyUI adapter: **IMPLEMENTED / NOT TESTED against real generation**.
Offline transport cases are separate evidence and do not establish account/model compatibility.

## Discovery performed

The project contains `.env.example` only; `.env` and `.env.local` are absent. Current process environment
has none of RUNNINGHUB_API_KEY, RUNNINGHUB_WORKFLOW_ID, RUNNINGHUB_CHECKPOINT, COMFYUI_BASE_URL or
COMFYUI_CHECKPOINT. Existing workflow/setup documentation was inspected. An actual loopback connection
to ComfyUI `/system_stats` failed. No sensitive values were printed, persisted or requested in chat.
This bounded audit does not establish that no installation exists anywhere on the machine.

Supplemental filename/directory discovery covered the workspace and siblings, common AI workspace,
home top-level entries, Downloads, Desktop and Documents, excluding dependency/Git trees. No matching
ComfyUI installation, entrypoint or model checkpoint was identified. Unrelated files were not read or
copied, and no private images were collected. No existing installation or model was modified.

No real provider request was submitted. Workflow ID: **unknown**. Actual real model: **unknown**.
Candidate count, request timestamp, duration, successful outputs and provider errors: **not applicable**
because no real request occurred. An unavailable connection is not a tested generation failure.

## Exact remaining verification

1. Obtain an actual compatible saved workflow ID and model name, and configure server-only settings
   from `.env.example`. Follow [RunningHub setup](RUNNINGHUB_INTEGRATION.md) or [local workflow setup](../workflows/README.md).
   Recheck current official provider documentation before making the first real call.
2. Use only an authorized project image and matching CHANGE mask. Keep KEEP masks, human notes and
   evaluation results local. Confirm the UI disclosure before choosing cloud execution.
3. First validate one candidate by calling the configured adapter's `generate(GenerationRequest(...))`
   from a local Python session if needed to control cost. This is adapter evidence only; the product
   API deliberately accepts exactly three candidates. Record that distinction.
4. Perform one explicitly confirmed three-candidate studio run. Preserve all outputs, including failures.
   Record actual provider, workflow/model identifiers, timestamp, duration, candidate count, safe error
   categories, source/mask provenance and receipt. Do not publish credentials or signed download URLs.
5. Have a human evaluate semantic adherence, protected damage, artifacts and whether ranking was
   reasonable. Complete the three [case slots](../demo-assets/README.md) without cherry-picking.

An ambiguous accepted provider job must be checked in its task console before another submission.
Polling timeouts do not cancel cloud work. CI remains GPU-free and Mock-only.
