# Blue Jacket Proof — bounded real case attempt

**SUCCESS CASE 01 FAILED. Successful real showcase: NO. Portfolio-ready: NO.**

Both authorized rounds completed the engineering loop. The project user reviewed all six real
outputs and marked every candidate **FAIL**: the jacket did not become navy blue. No third round,
replacement candidate, extra smoke, model change or successful showcase claim.

## Inputs and scope

- Original: [original.png](original.png), byte-identical to public/fixtures/original.png,
  SHA-256 7efc7b005d8989d21561a87a9dba5a8e8058eebc7a8b7c1870a68cd8936ccef2, 640×704.
- [CHANGE](change.png): complete jacket body, sleeves, collar/front, seams and fasteners,
  **67,406 pixels**. Deterministic jacket geometry intersected with its original exact colors;
  visible neck/skin/hair excluded.
- [KEEP](keep.png): complement, **383,154 pixels**; face, hair, neck/skin, pants, pose structure,
  background and ground shadow. **Zero overlap**; KEEP/outside thresholds remain **98**.
- [Mask audit](mask-audit.json). Only this case's masks changed. Original public demo fixtures,
  previous failure evidence and previous product run remain intact.

Provider: **real RunningHub CN**, https://www.runninghub.cn.
Workflow ID **2106824243966201857**, graph semantic SHA-256
6dd44944a664e6c6ae97e83562bc50bc66dcaa9465b45dd274da034fcb074e69.
UNET z_image_turbo_bf16.safetensors / CLIP qwen_3_4b.safetensors / VAE ae.safetensors.
Only input node 16, prompt node 8 and seed node 4 vary; output node 11 retained, preview 17 discarded.
Sampler, guidance, denoise and mask blur unchanged. No product source/API/schema/evaluation/ranking/
Ghost/receipt/provider-abstraction changes. No merge/tag/release.

## Exact prompts and all results

Round 1, [prompt.txt](round-1/prompt.txt):

> Replace the entire orange-brown jacket with a solid cool navy blue color. Keep the jacket shape, sleeves, seams, fasteners, face, hair, pants, body pose, and background unchanged. Remove all orange and brown tones from the jacket. Preserve the original flat illustration style.

Round 2, [prompt.txt](round-2/prompt.txt), executed only after the user's explicit all-fail round-1 review:

> Remove the dark blotchy markings from the jacket and replace the entire jacket with a clean solid navy blue. Keep the face, hair, pants, pose, and background unchanged. Preserve the original flat illustration style. No orange or brown should remain on the jacket.

Both rounds start from the same original and corrected masks. No failed candidate was fed back.

| Round | Candidate | Seed | Task ID | KEEP / outside % | CHANGE % | Drift % | Pixel rank | Human |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [A](round-1/candidate-a.png) | 5100 | 2106980091358834690 | 99.115615 | 3.754601 | 0.884385 | 1 | FAIL |
| 1 | [B](round-1/candidate-b.png) | 5101 | 2106980249148547073 | 99.094330 | 3.102598 | 0.905670 | 3 | FAIL |
| 1 | [C](round-1/candidate-c.png) | 5102 | 2106980955549036546 | 99.104304 | 3.670473 | 0.895696 | 2 | FAIL |
| 2 | [A](round-2/candidate-a.png) | 5200 | 2106982224019812353 | 99.106180 | 4.299394 | 0.893820 | 3 | FAIL |
| 2 | [B](round-2/candidate-b.png) | 5201 | 2106982408279785474 | 99.117343 | 10.233864 | 0.882657 | 2 | FAIL |
| 2 | [C](round-2/candidate-c.png) | 5202 | 2106982457474768897 | 99.183736 | 4.081882 | 0.816264 | 1 | FAIL |

All six are pixel-eligible with no hard-threshold violations. KEEP equals outside preservation here
because KEEP is the whole complement of CHANGE. The formula is unchanged.
Round 1: **A → C → B**, system suggested **A**, human showcase **none**.
Round 2: **C → B → A**, system suggested **C**, human showcase **none**.

Agent observations, distinct from user verdicts: round 1 modifies collar/seams/pockets/fasteners,
but retains orange-brown. Round-2 A adds dark spots, B opens the front with an undershirt and brown
jacket, C changes collar/fasteners/pockets while remaining orange-brown. B's larger pixel difference
is not navy recoloring. [Round-1 human review](round-1/human-review.md) and
[round-2 human review](round-2/human-review.md) retain the user's actual replies. Criteria 1/2 fail;
criteria 3–8 were not separately assessed by the user, so none receives an overall PASS.

## Execution and failure boundary

The public product API fixes generation seeds at 4100–4102. A local, opt-in case harness supplied
the authorized explicit seeds to the **unchanged RunningHub provider**. Existing AssetStore and
Repository saved the exact seeds/candidates, and existing ImageEditService evaluated, ranked,
created Ghosts and produced v1 receipts. No new seed selector or public API was introduced.
This is a real case harness plus complete product readback, distinct from the earlier normal
POST /api/runs / worker experiment.

Run IDs: round 1 **8f136243-4dc3-48b5-8378-5574bfef90d6**;
round 2 **cfaf84e4-d0a5-4f1a-93db-5df04b83fdea**. Both persisted completed.

Round-1 B was accepted, then polling encountered a connection failure. The runner stopped before C.
[Interrupted validation](round-1/interrupted-validation.json) retains the original partial result
and PROVIDER_STATE_UNKNOWN. A fresh outputs query retrieved **the same B task**, then only previously
unattempted C was submitted. **Exactly three creates per round / six total**, zero replacements or
automatic generation retries. B's historical interruption remains in the validation journal;
the final run's transient failure is resolved. Round-1 elapsed generation field includes the
interruption/recovery interval; it is not a model inference benchmark.

All candidate/Ghost PNGs were decoded, dimension checked at 640×704, metadata stripped and persisted.
Existing GET run/assets/receipt routes read back both complete cases. SQLite reopened and matched.
All six user verdicts were saved via existing PUT review routes and fetched in the receipts.
Credentials, signed URLs, authorization headers and raw provider bodies are absent from public evidence.
The exact-host HTTPS/download/metadata security boundary is unchanged.

Production frontend browser QA read these saved real assets with **no paid provider registered**:
A/B/C selection, ranking, Before/After, 640×704 Ghost, reviewed Receipt, 1440/390 layouts, no horizontal
overflow or page errors. Each round retains four screenshots and browser-qa.json. The QA harness was
corrected to open Receipt before testing review fields and to await image decoding before dimensions;
no product change or weakened assertion was needed. See validation.json and edit-receipt.json in each round.

## User-approved visual reference — not a real output

The user subsequently attached [this reference](target-reference-mask-preview.png) and said
“这张图是对的”. Pixel comparison found it identical to the earlier mask visualization: original
composited with RGB #21a1ff over CHANGE at alpha 100/255. **It is not a RunningHub output.**
[Provenance](target-reference-provenance.json) records this distinction. The user's approval is
retained as target appearance feedback; it does not override the six real-candidate FAIL verdicts
or establish a successful inference case.

## Comparison and product insight

The [previous short-prompt failure](../2026-10-05) is preserved. This attempt improves case input
coverage and explicit prompt constraints; it **does not** improve the outcome to semantic success.
CHANGE percentages across the old and corrected mask areas are not directly comparable.
Even round-2 B's 10.23% difference and >99% preservation did not satisfy the instruction.

Pixel evaluation measures preservation; it is not equivalent to semantic success. Real requests
can preserve pixels while failing the edit. These retained failures demonstrate the boundary,
not a successful creative showcase. A future genuine success can be shown beside them, but none
was obtained within this authorized experiment. Human review remains necessary in V0.1.
The exact cause of the model's color non-adherence was not isolated; no universal model claim.
Local ComfyUI generation, Docker execution and broader creative/identity assessment: **NOT TESTED**.

Local validation and hosted Mock CI are tracked separately in [delivery checks](delivery-checks.json).
The [consistency self-review](consistency-review.json) verifies all six public images against persisted
assets, recomputes unchanged metrics/Ghosts/ranks, and checks receipts/reviews and execution bounds.
Public artifact hashes are listed in [manifest](manifest.json), computed from Git's versioned blobs.
Text uses Git-normalized LF; a Windows checkout may present CRLF locally.
