# External Blue Jacket edits — raw rejection and explicit Boundary Lock

## Boundary Lock follow-up — 2026-10-06

The raw generation/refusal below remain historical evidence. The user subsequently authorized explicit
deterministic preparation. All raw A/B/C are unchanged; `locked-a/b/c.png` are separate new outputs.
Every pixel outside the 67,406-pixel CHANGE mask is exactly original; original and masks are not resized.
Center crop `[0,0.75,1195,1315.25]`, Lanczos 640×704, binary composite, no feather. Preservation comes
from VowEdit's spatial enforcement, not the external model independently preserving these pixels.

One run `e5f59ad7-066d-4138-aa55-5fa9ba97b32f`. All A/B/C evaluated/persisted; provider calls 0, seeds
null, model/version unavailable. Unchanged rgb-mae-v1: KEEP/outside 100%, drift 0%, CHANGE differences
A 27.600803%, B 29.078432%, C 28.000647%, score 100 each. All eligible. Rank A → B → C, suggested A;
original index breaks the tie. Agent inspection finds all clearly navy with closed jacket, preserved
surroundings and no major boundary artifacts. Raw user approval/preference A remains historical;
the user separately reviewed the new locked results and replied **“A/B/C 均 PASS，偏好 A”**.
All three candidate verdicts are now persisted as PASS through the existing review API, with ranking
unchanged. Controlled constraint-enforced success YES; human-approved final YES; portfolio/interview
YES for this one explicitly attributed example. [Actual new human review](locked-human-review.json).

New evidence: [normalization](normalization.json), [API preparation/provenance](boundary-lock.json),
[evaluated run](evaluation.json), [receipt](receipt.json), [derived hashes](boundary-image-manifest.json),
[before/after](before-after.png), [raw vs locked](raw-vs-locked.png).
Locked [A](locked-a.png), [B](locked-b.png), [C](locked-c.png); Ghosts
[A](ghost-a.png), [B](ghost-b.png), [C](ghost-c.png). Transparent Ghosts accurately reflect zero drift,
not disabled evaluation. Product screenshots are recorded in the Boundary Lock validation. Initial
browser QA captured pending review before the user's reply; the separate reviewed-receipt screenshot
shows final persisted PASS. Raw reviews and rejection artifacts remain unchanged.

## Historical raw generation and refusal

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
No score, selected candidate, receipt or Ghost is invented for the rejected raw case. Later Ghosts and
receipt belong to separately prepared locked outputs, never direct evaluation of raw candidates.
The raw rejection screenshots remain unchanged. Complete successful
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
