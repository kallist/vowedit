# Real provider validation — 2026-10-05

| Evidence | Status |
| --- | --- |
| Manual RunningHub web workflow | **TESTED**, user-reported, not replayed here |
| Supplied Z-Image API graph | **VALIDATED**, fixed fingerprint and mapping |
| RunningHub adapter | **IMPLEMENTED / REAL API TESTED / DOWNLOAD FAILED** |
| Real CN upload → create → poll → generated node 11 | **PASS** |
| Complete one-candidate smoke | **FAIL** at download allowlist |
| Three-candidate real product run | **NOT TESTED**, gated on smoke |
| Real evaluation / Ghost View / product receipt | **NOT TESTED**, no real image persisted |
| Creative human review | **NOT TESTED** |
| Mock product | **TESTED**; offline/browser evidence |
| Local ComfyUI real generation | **NOT TESTED** |

## Executed task

Workflow ID: 2106824243966201857. Requested stack: UNET z_image_turbo_bf16.safetensors,
CLIP qwen_3_4b.safetensors (qwen_image), VAE ae.safetensors. Origin: https://www.runninghub.cn.
Credentials came from ignored server .env; user corrected configuration before the first request.
No earlier paid API attempt occurred in this session. Checkpoint override is no longer required.

Authorized deterministic source: public/fixtures/original.png; CHANGE change.png; KEEP keep.png.
Instruction: **Change the jacket to cool blue.** Seed: **671807066932685**.
Exactly **one** create was sent. Upload/create returned HTTP 200/code 0; polls returned 804 then 0.
Task: **2106831486408949762**. Started: **2026-10-04T19:38:58.082949Z**, ended:
**2026-10-04T19:39:32.077081Z** (2026-10-05 local). Attempt duration: **34.000 seconds**.

Results were ordered **17 (original), 11 (generated)**, both PNG, both from
**rh-images-tos.xiaoyaoyou.com**. Adapter chose 11 and discarded 17. Download failed safely with
PROVIDER_RESPONSE_INVALID. Result dimensions, visual quality, local persistence and real metrics are
not yet established. Remote task completion is not complete adapter PASS.

## Current boundary

[CN outputs](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749004) and the
[integration example](https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287339) still name the old
rh-images.xiaoyaoyou.com. Reviewed official sources did not confirm the exact -tos host. Authenticated
API output establishes the observed host, not a documented CDN contract. An exact-host exception is
awaiting user approval under the requested unfamiliar-CDN boundary.

The task and safe evidence are retained locally. Query that **same task** after resolving the host;
never create another smoke job. Only after complete smoke success run one normal three-candidate
product API request with seeds 4100/4101/4102 and unchanged evaluation/ranking/Ghost/receipt logic.
Retain all candidates and failures. Human verdicts remain pending; do not tune or cherry-pick.

No key, signed URL or raw provider body is included. Manual web success is not API success.
Blank-area creation, actual mask application and subjective image quality are unverified here.
The three full creative demo cases remain outside this task.

See [audit](Z_IMAGE_VALIDATION_AUDIT.md), [setup](RUNNINGHUB_INTEGRATION.md)
and [model observations](MODEL_BOUNDARIES.md).
