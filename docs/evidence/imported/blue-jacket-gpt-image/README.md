# External Blue Jacket edits — genuine generation, rejected import

Generation source: **Codex built-in imagegen** (`image_gen.imagegen`). Model/version not exposed.
Generation mode: **External to VowEdit**. Three separate calls, same project-owned orange-brown-jacket
original, classic/richer/darker navy variants. No exposed seeds, all null. Tool accepted an image path;
no explicit binary-mask parameter was available. Jacket constraints were described in the prompt.
Full actual [prompt set](prompt.txt). No post-generation image editing, resizing or cherry-picking.

**This is NOT a direct OpenAI API integration inside VowEdit.** VowEdit's responsibility is safe import,
evaluation, ranking, Ghost View, receipt and human-review storage. It did not generate these candidates.
Public directory naming follows the requested case name, not a claim about the tool's hidden model.

## Actual outcome

| Step | Result |
| --- | --- |
| Actual external A/B/C generation | PASS, all original outputs retained |
| User visual semantic review | PASS for A/B/C, preferred A |
| Safe candidate upload/decode/metadata stripping/local persistence/readback | PASS for all three |
| Create imported run | REJECTED: CANDIDATE_SIZE_MISMATCH |
| Real external evaluation / ranking / Ghost / Receipt | NOT TESTED, no run was created |
| Provider calls during import | 0 |
| Controlled external visual success | YES |
| Controlled external evaluated success case | NO |
| Portfolio-ready / interview-ready complete success case | NO |

Original and masks are **640×704**. Every untouched generated image is **1195×1316**. VowEdit correctly
rejects the mismatch, without automatically resizing either original, masks or candidate images.
No score, selected candidate, receipt or Ghost is invented for this rejected case. The required
ghost-a/b/c.png, receipt.json, result-page.png, ghost-view.png and candidate-comparison.png therefore
do not exist for these external outputs. A rejection screenshot is stored instead. Complete successful
offline import UI QA lives in `docs/screenshots/imported/`; those are deterministic fixtures, not
these imagegen candidates. Their automated test verdicts are not the user's reviews.

## Provenance and reviews

[Original](original.png), [CHANGE](change-mask.png) and [KEEP](keep-mask.png) are byte-identical to the
existing corrected Blue Jacket experiment inputs. [A](candidate-a.png), [B](candidate-b.png) and
[C](candidate-c.png) are byte-identical to the three preceding built-in tool outputs. Hashes and
dimensions: [manifest](image-manifest.json). [API attempt/readback](validation.json).
[Actual user review and separate agent observations](human-review.md).

Agent observation: clearly blue jackets, retained closed silhouette/collar/seam/button arrangement,
same visible face/hair/pants/pose/background. The tool added subtle texture and upscaled/rerendered
the illustration; non-jacket pixels are not proven identical. No quality/generalization claim.

[Real RunningHub failure case](../../runninghub/2026-10-05-blue-jacket-proof) remains unchanged,
including six outputs and explicit all-FAIL human reviews. This new visual approval does not overwrite
those verdicts. No RunningHub call, paid retry, model change, merge, tag or release in this delivery.
