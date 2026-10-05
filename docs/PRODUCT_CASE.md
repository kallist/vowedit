# VowEdit — give an edit boundaries

## 1. Problem

A creator asks for a different jacket and receives a different face. The output may look attractive
while quietly breaking the original intention. This project treats unintended change as a visible,
reviewable product problem. It does not claim user research or measured market demand.

## 2. User scenario

A visual creator wants to revise clothing in an illustration while keeping the character and composition.
A product designer changes a backdrop while protecting the package and lettering. A portrait editor
tries glasses while keeping the rest of the face. These are proposed scenarios, not interviewed users.

## 3. Product insight

Editing has two intentions: permission to change and a request to preserve. A prompt alone makes the
second easy to miss. Drawing KEEP turns it into something the creator and the software can both inspect.

## 4. Why generation alone is insufficient

An image is not an explanation. A model's promise to preserve a face does not establish that it did.
VowEdit separates producing candidates from checking them. Its checks are deliberately modest: pixel
changes in explicit regions. The creator still judges whether the request was followed and looks good.

## 5. CHANGE / KEEP model

Orange marks editable pixels. Blue marks protected pixels. Overlap is rejected, not silently resolved.
A label such as “Face & hair” is the user's description, not automatic segmentation or face recognition.
Outside-CHANGE preservation can also be a hard constraint. Multiple brush strokes define each mask.

## 6. Constraint Summary

Before Generate, the creator sees the request, protected label, thresholds, pixel areas, provider and
three-candidate count. Painting never triggers inference. Going back preserves the painted boundaries.

## 7. Generation

The local Mock produces one preserved edit, one drifted edit, and one barely edited/severely drifted
candidate. It is visibly labeled as a simulation. Cloud/local ComfyUI adapters are replaceable and do
not alter the contract or evaluator. Jobs are asynchronous and refresh-safe; partial results remain useful.

## 8. Evaluation

Protected similarity answers “how much did protected pixels change?” Change difference prevents an
unchanged image from winning through perfect preservation. Unexpected drift checks everything outside
CHANGE. Threshold violations precede preference scores. The score's 60/40 preservation weights are
shown, with outside preservation receiving 100% when no manual KEEP exists. Adherence is a human verdict.

This is not a validated quality metric: a small but important change can be diluted by a large mask;
compression, lighting shifts and small misalignments can penalize a reasonable image. The 2% minimum
change gate detects near-noops but does not prove a successful requested edit.

## 9. Ghost View

The candidate stays recognizable while an orange overlay reveals drift outside CHANGE. Hatch overlays
locate the requested and protected areas. The creator can switch to the original, result or a slider.
The product's central demonstration is a visibly altered protected region, not a decorative heatmap.

## 10. Edit Receipt

Each completed evaluation produces a readable receipt with request, KEEP contract, provider, suggested
candidate, all scores/warnings, measured generation duration and human review. Exported JSON includes
all candidates and failures. A receipt can truthfully say “no qualifying candidate.”

## 11. Failure cases

The fixture's candidate A darkens protected pixels and ranks below B. C also barely changes the target.
An unchanged output gets 100 preservation but is ineligible. Tests exercise all-ineligible output,
provider outage, partial candidate loss and failed evaluation. Retry Evaluation reuses saved images;
Retry Generation creates a linked run without redrawing. These are controlled tests, not model findings.

## 12. Limitations

Real RunningHub execution and human semantic review are tested; no successful RunningHub showcase
has been obtained. Blue Jacket and Object Replacement both retain explicit human FAIL results.
No identity model, semantic adherence
model, artifact detector or statistical confidence. One painted KEEP region in the UI; API supports
multiple named masks. Single local worker, no auth, 1536-pixel maximum side, latest 50 edits displayed,
no automatic asset cleanup. Cloud execution needs account-specific workflow/model validation.

## 13. Next experiments

With supplied creative assets, run the same frozen contracts through real generation. Ask a human to
mark semantic adherence, damage and acceptable changes before comparing the heuristic rankings.
Keep rejected candidates and boundary cases. Examine whether smaller KEEP regions expose diluted
failures, whether minimum-change thresholds reject subtle edits, and whether Ghost View saves review time.
These are experiments to run, not results already obtained.

## 14. VowEdit Motion — future direction

Temporal consistency could extend KEEP across frames. Video is outside V0.1: no video model calls,
timeline, MiniMax H3, GPU deployment or implementation promise. First validate the image-editing loop.

## 15. Hardening evidence and reproducible demo

The initial hosted run failed while the app was still evaluating saved images: a terminal-result assertion
used the default five-second locator timeout. Browser acceptance now waits for durable job completion
before checking every original no-good-candidate assertion. A new evaluation-retry browser case also
revealed an actual race: editing while Demo was loading let its defaults overwrite the user's instruction.
The form now locks while preparing the source. See [audit](HARDENING_AUDIT.md) and
[current validation](HARDENING_VALIDATION.md) for evidence, counts and environment boundaries.

For a 3–5 minute demonstration: (0:00) explain the jacket/face problem on the landing page;
(0:30) open studio and Use Demo; (1:00) show CHANGE/KEEP and the explicit contract;
(1:30) Generate once and explain the visibly labeled Mock simulation;
(2:00) compare suggested B with rejected A/C; (2:30) inspect A in Ghost View;
(3:00) open the receipt, explain the rgb-mae-v1 formula and manual-review boundary;
(3:30) export JSON and refresh/history to show persistence. Say clearly that inverted pixels do not
establish a semantically correct blue jacket, face identity or real-model performance.

The three broader creative demo slots remain [NOT TESTED](DEMO_CASES.md). Separately, the fixed real
RunningHub workflow and user reviews are documented in [real validation](REAL_PROVIDER_VALIDATION.md):
[Blue Jacket](evidence/runninghub/2026-10-05-blue-jacket-proof) preserved surroundings but failed recolor;
[Object Replacement](evidence/runninghub/2026-10-05-object-replacement-proof) used the user's authorized
teapot input and confirmed red-mug target, but added/overlaid structures instead of replacing the teapot.
All three object candidates are human FAIL despite passing pixel checks; system B → C → A remains intact.
There was no successful real case at this experiment stage. VowEdit does not hide failed generations;
pixel evaluation and human semantic review are complementary. Receipt PNG export remains optional
and unimplemented; there is no added V0.2 scope.

## 16. Cross-source evaluation

The generation model is replaceable. The editing contract is the product. `POST /api/imported-runs`
accepts three existing candidate asset UUIDs and a descriptive source label, with the same original,
CHANGE and KEEP contract. It queues evaluation directly, skipping generation. Both paths use the
unchanged evaluator, ranking, Ghosts and v1 receipt. Seeds are null, provider jobs empty, and receipts
say external-import; VowEdit never claims to have generated those candidates. No DB migration.

Case A remains the real RunningHub integration PASS with semantic FAIL. Its six Blue Jacket outputs
and human FAIL reviews are untouched. Case B has actual external generation using Codex's built-in
imagegen: A/B/C navy edits received explicit user visual PASS, preferred A. However all raw outputs
are 1195×1316 rather than 640×704. The strict import boundary rejects them without resizing or hiding
drift. Thus **external visual success is demonstrated, but an evaluated external success case is
not yet complete**. No GPT Image direct provider integration. Portfolio-ready remains NO.

Offline deterministic fixtures separately prove cross-source import/evaluation/ranking/Ghost/receipt
and per-candidate human-review storage. Those fixtures and automated test verdicts are not model
outputs or human acceptance evidence. See [import architecture and validation](IMPORTED_CANDIDATES.md)
and [actual external outputs and rejection](evidence/imported/blue-jacket-gpt-image).

## 17. Measure the contract, enforce the spatial boundary

The subsequent explicit Boundary Lock experiment separates three responsibilities: external imagegen
creates the navy jacket; VowEdit's opt-in preparation enforces the spatial CHANGE boundary; the
unchanged evaluator measures the prepared result. Raw assets and their rejected direct-import attempt
are preserved alongside the locked outputs. Preservation of a composite is not a model capability claim.

All raw A/B/C were 1195×1316. Center crop `[0,0.75,1195,1315.25]` removes only 1.5 vertical source
pixels in total, then Lanczos maps the isotropic crop to 640×704. Original and masks are unchanged.
Binary CHANGE admits generated pixels; every other pixel is exactly original. All three new assets
entered one real imported run. KEEP/outside preservation 100%, drift 0%, CHANGE difference
27.600803/29.078432/28.000647%, unchanged rank A → B → C. Scores tie at 100 and original index breaks
the tie; the algorithm did not choose a semantic favorite. A is suggested.

Agent inspection finds all three clearly navy with closed jacket structure, original surroundings
and no major boundary artifacts. The raw user review was PASS, preferred A. Locked review is a new
decision and remains **PENDING**. The evaluated constraint-enforced case is complete; human-approved
final success/portfolio showcase is withheld until an actual locked-candidate verdict. No inference
seeds/model versions are invented, no new cloud task, no scoring changes or V0.2 features.

Product insight: measuring preservation exposes failures, but an explicit spatial enforcement layer
can make a successful external edit fit the creator's contract. Provenance must show where preservation
came from. It cannot rescue a semantically failed target inside CHANGE; the retained RunningHub navy
and mug failures still demonstrate why manual review is necessary.
