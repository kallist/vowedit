# V0.1 hardening — fresh read-only review

Method: the implementing agent reread the completed diff separately from implementation, assuming
it needed independent justification, and inspected current browser/screenshots. This is a fresh
second-pass self-review, **not a separate agent, external reviewer or human creative acceptance**.

## Findings fixed in this hardening

1. IMPORTANT: terminal no-good-candidate UI was asserted before async job completion under the default
   five-second deadline. Wait for bounded durable completion; retain and strengthen original assertions.
2. IMPORTANT: a pending Demo upload could overwrite a newly edited instruction. Disable contract
   fields during preparation; the evaluation-recovery browser regression fails before this fix.
3. IMPORTANT presentation gap: the demo required manual setup of masks/instruction. Load the original
   and editable fixture boundaries together, keep Mock explicit, and require contract confirmation.
4. NIT: receipt lacked visible metric version/CHANGE reference and selected warnings; expose them.
   Essential notes and mobile controls were adjusted only within existing styling.

Remaining code BLOCKING: **0**. Remaining code IMPORTANT: **0**. Fixed IMPORTANT: **3**; NIT: **1**.
Required external acceptance gaps: **2** — real-provider compatibility and real creative human review.
Portfolio readiness remains withheld; these are evidence gaps, not silently passed code findings.

## Review coverage and decisions

- Product: landing explains unintended change; summary asks before Generate; result distinguishes
  inspecting A from suggested B; receipt describes the selected candidate. Mock is visibly disclosed.
- Architecture: UI → service → provider protocol unchanged; evaluator remains independent. No API,
  DB schema, framework or workflow migration. Test fault instrumentation stays outside production.
- Correctness: seed mask polarity/export, brush edits, back-navigation and resize alignment reviewed
  against browser counts/pixels. No weights, thresholds or selection policy were tuned.
- Persistence/concurrency: BEGIN IMMEDIATE, unique key/hash, guarded job ownership and final-state
  transaction remain unchanged. API concurrency, double click, response loss, refresh, restart and
  evaluation retry have behavioral evidence. One worker lock remains an explicit limitation.
- Failures: saved images remain accessible after evaluation failure; retry does not call generation.
  Unknown accepted cloud tasks do not permit automatic duplicate submissions.
- Security: UUID paths, actual decode/body limits, metadata stripping, Origin/Host checks, safe errors,
  server-only settings, unauthenticated allowlisted output download and no redirects reviewed. Existing
  security regressions and secret-pattern scan pass; no new SDK or credential path was introduced.
- UI: five widths, current warnings/receipt/Ghost legend, labelled forms, visible focus, keyboard painting
  alternative and reduced-motion rules reviewed. No accessibility certification or physical-device claim.
- Documentation: initial audit/validation/review are historical; README links current hardening evidence.
  Model findings, real cases, reviewer identities and hosted status are never inferred from fixtures.

## Residual boundaries

No auth/public-service deployment, multi-worker operation, asset cleanup, PNG receipt, automated semantic
or identity scoring, cloud reconciliation, Docker or video. A crash between PNG save and DB reference
can leave an orphan file. Mean RGB scores can dilute small damage or penalize harmless misalignment.
Real-provider calls, human case verdicts, screen readers and physical devices remain NOT TESTED.
Hosted CI is a separate exact-head gate; its actual URL/SHA/conclusion belong in the delivery report.
