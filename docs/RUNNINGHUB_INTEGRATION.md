# RunningHub integration — evidence boundary

Adapter: IMPLEMENTED. HTTP contract/error tests: offline simulation. Real cloud inference: NOT TESTED.
No API credential, actual account workflow ID, exported account workflow or exact model was provided
or found in the inspected environment. No paid call was made. The repository template is authored
here and HTTP-tested; it is **not** a tested RunningHub export or proof of model compatibility.

## Official contract inspected on 2026-09-28

The implementation targets the documented international origin `https://www.runninghub.ai`.
It does not assume the Chinese and international API families are interchangeable.

| Operation | Implemented contract | Official source |
| --- | --- | --- |
| Upload | POST `/task/openapi/upload`; multipart `apiKey`, `fileType=input`, `file`; read `data.fileName` | [Upload Resource](https://www.runninghub.ai/runninghub-api-doc-en/api-425761099) |
| Submit | POST `/task/openapi/create`; `apiKey`, `workflowId`, fixed `workflow` JSON string, seed override in `nodeInfoList`, `addMetadata=false`; read `data.taskId` | [Start ComfyUI Task — Advanced](https://www.runninghub.ai/runninghub-api-doc-en/api-425761093) |
| Status | The documented standalone status endpoint is POST `/task/openapi/status`; VowEdit instead polls outputs to avoid a second round trip | [Check Task Status](https://www.runninghub.ai/runninghub-api-doc-en/api-425761033) |
| Results | POST `/task/openapi/outputs` with `apiKey`, `taskId`; inspect output node 8, image file type and `fileUrl` | [Check Task Output](https://www.runninghub.ai/runninghub-api-doc-en/api-425761034) |
| Waiting/failure | 804 running and 813 queued keep polling. Auth, balance, rate limits, workflow rejection and confirmed task failures get distinct safe categories | [Error reference](https://www.runninghub.ai/runninghub-api-doc-en/doc-8287467) |

The examples specify Bearer authorization as well as the body/form API key. The adapter follows those
documented examples. Node IDs come from the repository-owned graph, not guessed account exports.
The seed is explicitly supplied because the [nodeInfoList guide](https://www.runninghub.ai/runninghub-api-doc-en/doc-8287464)
describes seed reset behavior. Only source pixels with CHANGE encoded in alpha and instruction/seed
leave the app; KEEP masks, local paths, scores and human notes are not sent.

## Fixed workflow setup and real-test procedure

1. In the account, inspect and manually run a compatible core-node SD/SDXL latent inpainting workflow.
   Compare it to `workflows/inpaint-api.json`. No custom nodes or arbitrary client graph editing.
2. Supply `RUNNINGHUB_API_KEY`, `RUNNINGHUB_WORKFLOW_ID`, `RUNNINGHUB_CHECKPOINT` server-side.
   Use the actual saved workflow ID and exact available model name, never an example ID.
3. The advanced create endpoint supports a full workflow override; VowEdit sends only its fixed graph.
   Verify the account/model accepts that override in a controlled real test before claiming support.
4. Start in Mock, then explicitly select RunningHub in the studio and review the disclosure and contract.
   Pressing Generate submits up to three sequential tasks and may incur charges. No CI cloud calls.
5. Record actual model, workflow, timestamps, candidate count, execution duration, errors and human notes
   in MODEL_BOUNDARIES. Until done, keep REAL CLOUD TEST marked NOT TESTED.

## Retry and secret boundary

Accepted task IDs persist. There is no documented idempotency guarantee relied upon for provider create.
Submission timeouts, malformed accepted responses, lost polls and app restarts are conservative unknown
states; the product does not blindly resubmit them. Inspect the task console before a new edit.
Known, confirmed failure can be explicitly retried through a new linked local run. No callback endpoint.

API keys live only in server configuration and outbound authenticated requests. Do not log provider
response bodies or exception strings. Output download is limited to HTTPS `rh-images.xiaoyaoyou.com`,
the image host in the inspected documentation, without redirects or authentication headers. An unexpected
CDN is rejected until deliberately reviewed; it is not silently trusted. Files are bounded, decoded and
metadata-stripped before persistence. This is an intentionally conservative V0.1 integration boundary.
