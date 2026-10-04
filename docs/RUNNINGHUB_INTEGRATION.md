# RunningHub integration — fixed Z-Image API export

Adapter: **IMPLEMENTED**. Offline HTTP tests: **TESTED WITH MOCK TRANSPORT**.
Real CN upload/create/poll: **TESTED**. First generated-result download: **FAILED** at the CDN boundary.
Full real product flow is pending; see [execution evidence](REAL_PROVIDER_VALIDATION.md).
Manual web success is user-reported and separate from API acceptance.

## Fixed workflow

The supplied export is preserved as `workflows/z-image-inpaint-api.json`, with only node 16's old
input reference sanitized. Semantic SHA-256 validation runs before upload; the browser cannot supply
graphs or mappings. See [provenance and audit](Z_IMAGE_VALIDATION_AUDIT.md).

| Purpose | Node / field |
| --- | --- |
| UNET | 1: z_image_turbo_bf16.safetensors |
| CLIP | 2: qwen_3_4b.safetensors, qwen_image |
| VAE | 3: ae.safetensors |
| Runtime image | 16: image |
| Runtime instruction | 8: text |
| Runtime seed | 4: seed |
| Generated candidate | 11: SaveImage from VAEDecode 10 |
| Original preview, discarded | 17: SaveImage from LoadImage 16 |
| CHANGE path | 16 MASK → MaskBlur+ 13 → InpaintModelConditioning 7 |

Other inputs remain fixed: steps 10, CFG 1, Euler/simple, exported denoise 0.8500000000000002,
DifferentialDiffusion strength 1, FluxGuidance 50 and blur amount 70. These are supplied settings,
not quality recommendations. Local ComfyUI retains its separate graph/checkpoint configuration.

The [official LoadImage implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/nodes.py)
returns MASK = 1 - alpha. VowEdit preserves source RGB and writes alpha = 255 - CHANGE.
Opaque padding aligns dimensions to eight; results are cropped back. Tests verify black/gray/white
mask values, RGB, padding and multipart contents. Blur and reconstruction can still produce drift.

## Server configuration and CN contract

Configure RUNNINGHUB_API_KEY, RUNNINGHUB_WORKFLOW_ID, RUNNINGHUB_API_ORIGIN and optional
RUNNINGHUB_TIMEOUT_SECONDS using `.env.example`. Default origin: https://www.runninghub.cn.
Only that exact origin and explicit https://www.runninghub.ai are accepted; international real
generation is NOT TESTED. No path, alternate port, userinfo, query, fragment or arbitrary origin.
RUNNINGHUB_CHECKPOINT is obsolete here; the model stack is fixed in the graph.

Official CN documentation actually retrieved on 2026-10-05:

| Operation | Contract | Source |
| --- | --- | --- |
| Upload | POST /task/openapi/upload; multipart apiKey, fileType=input, PNG file; read data.fileName | [CN upload](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749008) |
| Submit | POST /task/openapi/create; fixed workflow JSON string, workflowId, apiKey, addMetadata=false, three nodeInfoList overrides | [CN advanced create](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749013) |
| Poll/results | POST /task/openapi/outputs; apiKey/taskId; 804/813 wait; select image node 11, never first output/17 | [CN outputs](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749004) |
| Status | POST /task/openapi/status; documented but unused by this adapter | [CN status](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749003) |

Legacy upload/outputs are marked deprecated but still documented. The real request confirmed these
endpoints work for this account. The documentation says full workflow overrides the saved workflow.
Seeds are explicitly supplied in the graph and nodeInfoList. Bearer/body key follow the examples.
KEEP masks, local paths, scores and human notes are not sent.

## Download and retry boundary

Downloads accept only HTTPS rh-images.xiaoyaoyou.com, without redirects, userinfo, fragments or
non-443 ports. A separate unauthenticated client sends no key, ignores proxy environment, bounds
bytes to 10 MB and decodes before local metadata-stripped persistence.

The first CN result used **rh-images-tos.xiaoyaoyou.com** and was safely rejected. Reviewed official
documentation did not confirm that exact host. An exact-host exception is awaiting user approval;
no wildcard or automatic trust expansion. Query/download the retained task after resolving that
boundary rather than submitting another generation.

Task IDs persist on acceptance. No provider idempotency/cancellation guarantee is assumed. Unknown
submit/poll states and restarts cannot authorize automatic generation retry. Safe errors omit raw
bodies and exception strings. Cloud execution is opt-in and paid; normal product requests submit
three sequential tasks. One-candidate adapter smoke is separate from the public API contract.
Normal tests and hosted CI remain Mock-only, with no credentials or paid calls.
