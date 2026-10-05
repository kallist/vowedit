# Real provider validation — 2026-10-05

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
