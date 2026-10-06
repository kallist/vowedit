# Object Replacement Proof — one bounded real round

**SUCCESS CASE 02 FAILED. REAL SUCCESS CASE: NO. PORTFOLIO-READY: NO.**

The user reviewed all real A/B/C and marked every candidate **FAIL**. The original white teapot
was not replaced with a clear red ceramic mug. KEEP basically held, but added/overlaid artifacts
remained. The only authorized round is complete; no second round or replacement create.
The [Blue Jacket real failed case](../2026-10-05-blue-jacket-proof) remains intact and unchanged.

## User-confirmed case change and authorized source

The initial request proposed **mug → white porcelain teapot**. Repository asset audit found only
project-owned person/portrait/bottle fixtures, so no paid generation was submitted. The user then
supplied a perfume reference followed by this [original](original.png), explicitly saying to use it.
It already depicts a white porcelain teapot. After that fact was explained, the user confirmed
the new target **红色陶瓷马克杯** (red ceramic mug).

Actual experiment: **white porcelain teapot → red ceramic mug**. Neither a same-object result nor
the original/reference is counted as model success. Only the original/target nouns in the prompt
were adjusted for this explicit clarification; scene preservation wording stayed the same.

Source: user-supplied **378×378 PNG**. Stored original retains the exact decoded RGB pixels and
upper-left lettering while stripping metadata. Pixel SHA-256:
03bffaf5ebc96564f743be2e8d9d93b693f21f56b616cc9ae1b465cb54d7bac2.
No private directory scan or external image search. [Input provenance](input-provenance.json).

[CHANGE](change.png): manually traced teapot body, lid/knob, spout and handle, **27,756 pixels**;
the handle opening is excluded. [KEEP](keep.png): complementary **115,128 pixels**, covering
table, background, composition, lighting context, ground shadow and original lettering.
Zero overlap; existing KEEP/outside thresholds **98**, formula/ranking unchanged.
KEEP is a pixel constraint; camera angle, lighting and object identity are not automatically inferred.
The preparation overlay was a mask visualization, not model output.

## Exact executed prompt and fixed configuration

[prompt.txt](prompt.txt):

> Replace the white porcelain teapot inside the masked area with a red ceramic mug. Keep the table, background, lighting, surrounding objects, camera angle and composition unchanged. The mug should fit naturally in the same position and scale.

Provider: **RunningHub CN**, https://www.runninghub.cn. Workflow **2106824243966201857**.
Fixed graph semantic SHA-256:
6dd44944a664e6c6ae97e83562bc50bc66dcaa9465b45dd274da034fcb074e69.
UNET z_image_turbo_bf16.safetensors, CLIP qwen_3_4b.safetensors, VAE ae.safetensors.
Input node 16 / prompt 8 / seed 4 vary; generated node 11 retained, original preview 17 excluded.
All model, sampler, guidance, denoise and mask-blur settings unchanged.

## All A/B/C, scores and human verdicts

| Candidate | Seed | Accepted task | KEEP / outside % | CHANGE % | Drift % | Rank | Human |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [A](candidate-a.png) | 6100 | 2106990652846989313 | 98.808074 | 10.474966 | 1.191926 | 3 | FAIL |
| [B](candidate-b.png) | 6101 | 2106990813476257793 | 98.867260 | 14.867897 | 1.132740 | 1 | FAIL |
| [C](candidate-c.png) | 6102 | 2106990993160241153 | 98.814214 | 6.964001 | 1.185786 | 2 | FAIL |

All are eligible under the unchanged pixel constraints. KEEP and outside scores are equal because
KEEP is the full complement. Existing rank **B → C → A**, **system suggested B**.
No human preference was stated and no successful showcase candidate was chosen.

Agent observations, separate from human evidence: A adds a red band near the lid while retaining the
teapot. B places a larger red cup shape in front of the body; C places a smaller red cup shape on
the body. The original spout, lid and teapot body remain. These are additions/hybrid structures,
not a verified replacement. The [actual user review](human-review.md) records for all A/B/C:
object replaced **NO**, target recognizable **NO**, KEEP basically preserved **YES**,
added/overlaid artifacts, semantic **FAIL**. No semantic classifier or formula was added.

## Engineering evidence and boundaries

Run **6152efdd-2342-4384-affa-731be6beed6c**, completed. **Exactly three creates**, one per seed,
no failed submission, read-only recovery or automatic generation retry in this run. Measured service
generation wall time **89.484 seconds** includes transport/polling/download; not model-only timing.
The original 378×378 input is padded to 384×384 by the unchanged provider; node 11 output dimensions
are validated and cropped back to 378×378. All three results and Ghosts decode, persist as clean PNGs
and contain no metadata.

The public API fixes seeds 4100–4102. A local opt-in case harness passed 6100–6102 directly to the
**unchanged provider**, then used existing AssetStore/Repository and ImageEditService evaluation,
ranking, Ghost and receipt. Existing product GET run/assets/receipt routes read back all three
candidates and complete v1 receipt, simulation=false. SQLite reopened and matched. Existing PUT review
routes persisted all three actual user FAIL verdicts and fetched them back into the receipt.
This is explicit-seed case execution plus complete product readback, not a new public seed API.

Production frontend QA displayed these actual saved assets at **1440/390**, with no paid provider
registered: A/B/C selection, ranking, Before/After, decoded **378×378 Ghost**, product Receipt and
persisted FAIL notes, no overflow/page errors. See four UI screenshots and [browser-qa](browser-qa.json).
[Receipt](edit-receipt.json), [safe validation record](validation.json), [human review](human-review.json)
and all candidate/Ghost PNGs are retained; no cherry-picking.

No product source, provider abstraction, public API, DB schema, scoring/ranking, Ghost/Receipt,
dependencies, workflow settings or CI gates changed. The strict exact-host HTTPS/no-redirect/
unauthenticated-CDN/MAX_BYTES/decode/metadata persistence boundary remains in effect.
No key, authorization header, signed output URL, raw provider body or private absolute path is public.
No V0.2, model download, merge/tag/release. Docker, Local ComfyUI and universal replacement capability
remain **NOT TESTED**. See [delivery checks](delivery-checks.json) and [consistency review](consistency-review.json).
Artifact hashes use Git blobs (LF-normalized text) in [manifest](manifest.json).

## Product insight

The highest-ranked B has 98.87% preservation and 14.87% CHANGE difference, yet the human rejects
its actual replacement semantics. Preserved surroundings and large local changes do not prove
that the requested old object disappeared or the target object became correct. This bounded test
demonstrates addition/hybrid failure and complements Blue Jacket's recolor failure.
VowEdit retains failures and treats pixel evaluation and human semantic review as complementary.
The cause of non-adherence was not isolated; this does not establish a universal model limitation.
