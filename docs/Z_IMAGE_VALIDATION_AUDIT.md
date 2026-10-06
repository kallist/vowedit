# Z-Image API validation audit — 2026-10-05

## Repository before editing

- Repository: `kallist/vowedit`; branch: `feat/vowedit-v0.1-hardening`.
- Previous HEAD: `3758062bb6f1e391a921339d3053af05c5700e02`.
- Fetch/prune did not advance the branch. PR [#1](https://github.com/kallist/vowedit/pull/1)
  remained open and Draft, based on `feat/vowedit-v0.1`.
- Previous HEAD's push and PR Mock CI runs were successful (36990020220, 36990353446).
- The initial worktree had one untracked user-supplied API export,
  `workflows/Z-image局部重绘_api.json`. It was inspected and preserved.
- Server `.env` is ignored. Credentials are present; origin is `.cn`; workflow ID matches
  `2106824243966201857`. No credential value was printed or committed.
- Manual RunningHub web success is user-reported evidence, separate from these API tests.

## Architecture and bounded plan

UI → FastAPI → ImageEditService → provider protocol remains unchanged. Evaluation and SQLite/PNG
persistence remain independent of inference. Public requests still require exactly three candidates.

Affected files: RunningHub adapter, backend registration, server environment example, fixed graph,
offline transport tests and evidence documentation. Use the supplied export and fixed UNET/CLIP/VAE
stack; override only image 16, text 8 and seed 4. Validate the semantic JSON fingerprint before upload.
Select generated output 11, discard preview 17. Encode CHANGE as inverse alpha at the provider boundary.

Risks: mask polarity, CDN changes, unknown accepted tasks and duplicate charges. First execute one
adapter candidate, then only after successful download/evaluation execute one normal three-candidate
product API run. Retain every output and failure. No automatic paid retry. No tuning of thresholds,
model settings or ranking; no V0.2, new provider, database/API schema change, merge or release.

Tests: deterministic multipart/polarity and fixed-graph tests; node 17 rejection; strict origins and
CDN URLs; safe errors and malformed outputs; existing backend/frontend regression, build, Mock browser
suite and exact-head hosted Mock CI. Real paid calls remain outside normal tests and hosted CI.

## Export provenance

`workflows/z-image-inpaint-api.json` is copied from the supplied export. The only normalization is
node 16's previous clipspace input reference → `vowedit-input.png`; runtime replaces this placeholder.
Sampler values, custom nodes, models, edges and output nodes are unchanged, including the exported
denoise value `0.8500000000000002`. This is not the older local ComfyUI graph.

Semantic JSON SHA-256 (sorted keys, compact separators, ASCII escaping):
`6dd44944a664e6c6ae97e83562bc50bc66dcaa9465b45dd274da034fcb074e69`.
Any graph change requires deliberate review and an updated fingerprint; formatting alone is allowed.

## Official sources inspected

CN pages were retrieved over HTTPS on this date. Browser-search extraction timed out for some CN pages;
direct HTTP retrieval returned 200 and their actual examples were inspected.

- [CN advanced workflow create](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749013)
- [CN upload resource, deprecated but still documented](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749008)
- [CN task outputs](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749004)
- [CN task status](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749003)
- [CN integration example](https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287339)
- [CN V2 query example](https://www.runninghub.cn/runninghub-api-doc-cn/api-425767306)
- [ComfyUI LoadImage source](https://github.com/Comfy-Org/ComfyUI/blob/master/nodes.py):
  MASK is `1 - alpha`; source RGB is retained. This establishes conversion semantics, not edit quality.

The CN outputs/integration examples name `rh-images.xiaoyaoyou.com`; the V2 query example names
`rh-images-1252422369.cos.ap-beijing.myqcloud.com`. Neither establishes that all CDN subdomains are safe.

## First API attempt and CDN boundary

At `2026-10-04T19:38:58Z` (2026-10-05 local), one controlled task was submitted using the project-owned
illustration and its CHANGE/KEEP masks. Seed: `671807066932685`; instruction:
`Change the jacket to cool blue.` Task: `2106831486408949762`.

Upload and create returned HTTP 200/code 0; polls returned 804 before code 0. Results were ordered
node 17 first, node 11 second. Both returned **`rh-images-tos.xiaoyaoyou.com`**. The existing download
allowlist rejected it with `PROVIDER_RESPONSE_INVALID` after 34.000 seconds. No URL, authorization
header, raw response body or credential is included here. This is a real inference attempt, with a
failed download boundary; it is not an end-to-end PASS.

The reviewed official CN documentation and official public client files did not confirm this exact
host. The authenticated response proves the observed host, not a published CDN contract. The user
subsequently explicitly approved this exact host on 2026-10-05. The same task was retrieved, decoded,
saved and evaluated without another smoke create, then one authorized three-candidate API run passed.
This section preserves the initial rejection; [the current record](REAL_PROVIDER_VALIDATION.md) gives
actual successful retrieval times, all metrics, task IDs and the negative human semantic verdict.
