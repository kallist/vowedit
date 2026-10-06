# Real provider validation — 2026-10-05

## Explicit Boundary Lock case — 2026-10-06

All three existing externally generated navy edits were prepared through the opt-in server operation,
without a new generation call. Raw 1195×1316 → centered crop `[0,0.75,1195,1315.25]` → Lanczos
640×704 → binary CHANGE-only composite. Original/masks/raw assets and direct-import rejection retained.
Run `e5f59ad7-066d-4138-aa55-5fa9ba97b32f`: all three **TESTED / PASS** for local persistence,
unchanged evaluation, ranking, Ghost and receipt. KEEP/outside 100%, drift 0%, CHANGE differences
27.600803/29.078432/28.000647%, scores 100. Rank A → B → C, suggested A by original-index tie break.
Generation: Codex built-in imagegen; model/version unavailable, seed null. Enforcement: VowEdit
Boundary Lock. Evaluation: VowEdit rgb-mae-v1. Preservation measures the composite, not the raw model.

Raw user semantic approval remains PASS, preferred A. Agent inspection finds all locked candidates
clearly navy with preserved surroundings and no major boundary artifacts. The user subsequently reviewed
the new locked results in VowEdit and replied **“A/B/C 均 PASS，偏好 A”**. All three verdicts were saved
through the existing review API, with scores/ranking unchanged. Controlled constraint-enforced success
**YES**, human-approved final **YES**, portfolio-ready **YES** for this clearly attributed controlled case.
No direct OpenAI integration, new RunningHub
tasks or reclassified failures. [Evidence](evidence/imported/blue-jacket-gpt-image).

## External candidate attempt — 2026-10-06

Codex's built-in `image_gen.imagegen` produced three separate untouched navy-jacket edits from the
same original. Actual label: **Codex built-in imagegen**; tool model/version and seeds are not exposed.
This is **NOT a direct OpenAI API integration inside VowEdit**. User explicitly reviewed A/B/C as
visually satisfying the intent and preferred A. All three raw outputs are retained, without selection
or post-editing. Source 640×704; generated outputs 1195×1316. All safe candidate uploads/readbacks PASS;
`POST /api/imported-runs` correctly rejects `CANDIDATE_SIZE_MISMATCH`, creates no run and makes no
provider calls. Actual external evaluation/ranking/Ghost/Receipt: **NOT TESTED**. The full offline
import flow is tested independently. [Evidence](evidence/imported/blue-jacket-gpt-image).

Controlled external visual success: **YES**. Human-approved visual result: **YES**, preferred A.
Controlled external imported/evaluated success case: **NO**. Portfolio-ready: **NO**.
Prior real RunningHub failures below remain unchanged; external images do not overwrite their verdicts.

## Object Replacement Proof: one-round failed semantic result

**SUCCESS CASE 02 FAILED.** After repository asset audit, the user supplied a white porcelain teapot
image and explicitly chose the target **red ceramic mug**. The original mug-to-teapot case therefore
changed with user clarification; prompt scene-preservation wording was retained. Workflow/model/settings
and pixel evaluation/ranking unchanged. Seeds **6100/6101/6102**, exactly **three creates**, no extra
round or paid retry. Run **6152efdd-2342-4384-affa-731be6beed6c**, all three persisted completed.
Submission/download/decode/378×378 persistence/evaluation/ranking/Ghost/receipt and product API readback
**PASS**. System ranks **B → C → A**, suggested **B**. Human semantic review: **A/B/C all FAIL**;
original teapot not replaced, no clear mug, KEEP basically preserved, added/overlaid artifacts.
No successful showcase. **Portfolio-ready NO**. Blue Jacket failure evidence remains unchanged.

At 98.87% preservation and 14.87% CHANGE difference, B still fails object replacement. Pixel metrics
do not classify the target object or prove removal of the old object. All user verdicts are persisted
through existing review routes and included in the receipt. Production saved-result UI QA at 1440/390
used no paid provider. [Full source, masks, prompt, A/B/C, Ghosts, reviewed receipt and evidence](evidence/runninghub/2026-10-05-object-replacement-proof).

## Follow-up: Blue Jacket Proof

**SUCCESS CASE 01 FAILED.** Two authorized three-candidate real case rounds completed with
corrected full-jacket CHANGE and complementary KEEP masks, fixed existing workflow and exact prompts.
Seeds **5100/5101/5102** then **5200/5201/5202**; exactly **six creates**, no new smoke/replacements/third
round. Round 2 followed the user's explicit round-1 all-fail review. Both rounds' submission,
download/decode, 640×704 metadata-stripped persistence, unchanged evaluation/ranking/Ghost/receipt
and complete product API readback **PASS**. Human semantic review: **all six FAIL**.
System ranks **A → C → B** then **C → B → A**; no human-selected successful showcase.
Portfolio-ready **NO**; the previous failure is preserved.

The case harness passed explicit seeds to the existing provider and persisted them accurately;
the public API's fixed seeds were not changed. Round-1 B polling was interrupted after acceptance,
then recovered by querying the same task; C was submitted only once afterward. Original interruption
evidence remains. Both completed cases and all reviews were read back through existing product routes.
Two viewport browser checks used saved real images, without a registered paid provider.

The user-approved blue/gray image is pixel-identical to the CHANGE mask visualization, **not**
cloud inference. It is a labelled appearance reference; it does not establish a real successful case.
See [all inputs, prompts, six outputs, metrics, reviewed receipts and provenance](evidence/runninghub/2026-10-05-blue-jacket-proof).
Pixel preservation >99% coexists with semantic failure; even 10.23% CHANGE difference does not prove
navy recoloring. The model's cause was not isolated. V0.1 still needs human review.

## Previous API validation and failure case

| Evidence | Status |
| --- | --- |
| Manual RunningHub web workflow | **TESTED**, user-reported, separate from API execution |
| Supplied Z-Image API graph | **VALIDATED**, fixed fingerprint and mapping |
| VowEdit → RunningHub CN API | **PASS / TESTED WITH REAL RUNNINGHUB** |
| One-candidate adapter smoke | **PASS**, retrieved the same original task; no new smoke create |
| Normal three-candidate product API run | **PASS / TESTED**, all A/B/C retained |
| Real evaluation / Ghost View / product receipt / persistence | **PASS** |
| Human semantic review recording | **PASS**, user preferred A and said A did not meet the cool-blue requirement |
| Selected candidate A's semantic result | **FAIL**, saved through the existing review API |
| Portfolio readiness | **NO**, this fixture did not deliver the requested edit; full creative cases remain untested |
| Mock product regression | **TESTED**, separate offline/browser evidence |
| Local ComfyUI real generation | **NOT TESTED** |

## Fixed workflow and authorized inputs

Workflow: **2106824243966201857**. Stack: UNET z_image_turbo_bf16.safetensors,
CLIP qwen_3_4b.safetensors (qwen_image), VAE ae.safetensors. CN origin: https://www.runninghub.cn.
Only image 16, text 8 and seed 4 change; generated output is 11, original preview 17 is discarded.
Mask path: 16 → 13 → 7. Sampler, guidance and blur settings were not tuned.

Source: project-owned deterministic public/fixtures/original.png, CHANGE change.png, KEEP keep.png.
Instruction: **Change the jacket to cool blue.** KEEP: Face and hair, threshold 98; background 98.
No private images, model downloads or new provider/features. Credentials remain in ignored server .env.
No key, authorization header, signed URL or raw provider body is in committed evidence.

## One-candidate smoke: original failure, then same-task success

Original task **2106831486408949762**, seed **671807066932685**, created once on
2026-10-04T19:38:58.082949Z. Upload/create returned 200/code 0; polls 804 then 0. After **34.000 seconds**
the strict old allowlist rejected the new CDN. This initial failure is retained, not erased.

The user explicitly approved **rh-images-tos.xiaoyaoyou.com** on 2026-10-05. It is an exact-host
exception backed by observed authenticated API output and explicit user authorization, **not** a claim
that the older [official outputs example](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749004)
documents this hostname. Only it and rh-images.xiaoyaoyou.com are allowed. No wildcard.

At **2026-10-05T03:42:12.794662Z** a fresh outputs query retrieved the **same** completed task.
Node 11 downloaded, decoded, validated at **640×704**, stripped of metadata and saved locally.
Retrieval/evaluation finished at 03:42:14.282267Z, **1.484 seconds**, with **zero new smoke creates**.
Existing rgb-mae-v1 evaluation and Ghost generation succeeded. A one-candidate
[adapter validation receipt](evidence/runninghub/2026-10-05/smoke-receipt.json) was saved and read back.
It is labelled adapter-smoke-v1, requested/generated 1; it is not a new one-candidate public API.

Smoke: KEEP **99.060603%**, background **99.151574%**, CHANGE difference **2.328717%**,
outside drift **0.848426%**. Pixel-eligible, but not proof of semantic success.

## Normal real three-candidate product run

Executed through the actual FastAPI routes and worker using an in-process TestClient: upload three
fixture assets → POST /api/runs with candidate_count 3 → RunningHub provider → persisted evaluation.
This is real cloud inference; only the local HTTP client is in-process.

Run **33031921-27bc-4d2b-ba16-3572ab9bf130**. Started **2026-10-05T03:42:32.346116Z**,
finished **03:43:31.902184Z**, wall time **59.562 seconds**, service generation time **58.015 seconds**.
Exactly **three** new workflow creates, one per existing seed; no retries, failures or cherry-picking.
Across both phases: **four total creates**, including the original smoke task; no additional inference.

| Candidate | Seed | Cloud task | KEEP % | Background % | CHANGE % | Drift % | Pixel rank |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 4100 | 2106953180922478593 | 99.066707 | 99.164228 | 5.340332 | 0.835772 | 1 |
| B | 4101 | 2106953323830796290 | 99.073665 | 99.162454 | 2.494406 | 0.837546 | 3 |
| C | 4102 | 2106953372212097025 | 99.079709 | 99.163671 | 3.839462 | 0.836329 | 2 |

All images are 640×704; all three are pixel-eligible. **Ranking A → C → B**, selected A.
Outside drift precedes overall score in the existing ranking, so A wins despite C's slightly higher
overall score. Formula/thresholds/ranking unchanged. Ghost PNGs and candidate PNGs were decoded through
the asset API. The normal [product receipt v1](evidence/runninghub/2026-10-05/edit-receipt.json)
reports simulation=false and 3 requested/3 generated. SQLite was reopened independently and matched
the retained completed run; the original run and all outputs remain available.

## Human review and visual findings

The project user explicitly answered **A** as preferred candidate and **未完成冷蓝要求** for its
semantic result. Existing PUT review API saved A verdict **fail** and the matching notes; updated
receipt was fetched and verified. Human review **recording passed**; this does **not** mean the edit
passed. B/C semantic verdicts and specialist identity/artifact human review remain NOT TESTED.

Agent visual observations, separate from human evidence: smoke/A/B/C jackets remain terracotta;
A has blotchy central decorations, C has unusual light fastener details. Visible changes concentrate
in the painted jacket region, and inside CHANGE mean difference exceeds outside in all four outputs.
This is consistent with intended inverse-alpha polarity; outside reconstruction drift is measurable.
It is not proof of strict boundary preservation, face identity or prompt adherence.

Production browser QA loaded the actual saved run with no paid provider registered: A/B/C selection,
640×704 Ghost overlay, reviewed receipt, 1440/390 layouts and no horizontal overflow/page errors passed.
No extra cloud call was made for UI QA. [Evidence directory](evidence/runninghub/2026-10-05) retains
all candidates/ghosts, both receipt kinds, original failure, safe task/HTTP metadata, hashes and UI views.

Blank-area creation and the user's workflow note about existing content were not experimentally
compared; no universal model limitation is claimed. Three full creative demo cases remain outside scope.
See [transport setup](RUNNINGHUB_INTEGRATION.md), [model boundaries](MODEL_BOUNDARIES.md),
[initial audit](Z_IMAGE_VALIDATION_AUDIT.md) and [fresh review](Z_IMAGE_VALIDATION_REVIEW.md).
