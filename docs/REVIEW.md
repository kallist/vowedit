# V0.1 independent second-pass review

Review method: the implementing agent reread the finished source and tests separately from the
implementation pass, then examined actual browser evidence and delivery files. This is a self-review
performed as a second pass, **not an external human review or a separate agent approval**.

Scope: application/provider boundaries, upload and output trust, secrets, SQLite transactions, file/DB
failure boundaries, request idempotency, restart recovery, evaluator math, state ownership, user-visible
failures, responsive layout, clean-install validation order and documentation claims.

## Findings fixed before delivery

Ten IMPORTANT findings were fixed across implementation QA and the final review:

1. Mobile comparison grid overflowed at 390 px. Constrain grid children/image widths; E2E checks all
   nine stages at all three widths and captures replacement screenshots.
2. Going back from contract confirmation discarded masks. Keep stroke history in the parent draft;
   browser acceptance exercises returning to the editor.
3. Initial Generate response loss could lose its key on refresh. Persist the submitted body in session
   storage, replay the same key, and block new work while recovery is ambiguous. Browser regression.
4. Retry Generation response loss could lose its key on refresh. Persist retry keys per run and retry
   kind; clear after an acknowledged response or definitive rejection. Browser regression.
5. Navigating to a retried run could briefly display the previous run's completed state. Key the result
   component by run ID; verify the new run and actual terminal state in E2E.
6. Restart after all metrics were saved but before final ranking could leave evaluation unretryable.
   Permit finalization of saved metrics after recovery. Backend regression preserves provider call count.
7. Content-Length alone did not bound chunked request bodies. Bound bytes at the ASGI boundary before
   multipart parsing. Backend regression sends oversized input without Content-Length.
8. Rate-limit errors while polling an accepted cloud task could imply a safe generation retry.
   Treat unconfirmed accepted jobs as ambiguous; HTTP/body rate-limit regression tests.
9. Fresh-checkout type checking depended on generated route declarations. Generate Next route types
   inside the typecheck command before TypeScript; used by local checks and CI.
10. Missing result IDs repeatedly showed a reconnecting state. Stop polling on a definitive 404 and
    report that the edit was not found. Typechecked and reviewed; no dedicated browser case for 404.

Blocking findings at completion: **0**. Fixed findings: **10**. Remaining substantive findings: **0**
within the trusted-machine Mock P0 acceptance scope. This count does not turn untested environments
or real-provider model behavior into verified capabilities.

## Explicit residual boundaries

- Local single-user prototype with no authentication; do not expose publicly.
- File atomic rename and DB transactions prevent partial referenced images, but a crash between file
  save and DB commit can leave an orphan file. Automatic cleanup is deferred and documented.
- Bounded local queue and one process-owned lock; distributed operation is not supported.
- Unknown real-provider submissions are not automatically reconciled or resubmitted. Task console
  inspection is required. Polling deadlines and HTTP inactivity timeouts are not a cloud cancellation.
- Average RGB similarity is sensitive to alignment and may conceal localized damage. Semantic adherence,
  identity and artifact quality remain explicit human-review fields, not invented metric scores.
- Test fixtures, scripted review notes and offline HTTP tests establish product mechanics only.
- No remote or real credentials/model discovered; hosted CI, actual model compatibility and real human
  demo review remain unverified. No claim of external security certification or third-party approval.

See [validation evidence](VALIDATION.md) and [architecture/failure boundaries](ADR-001-VOWEDIT-ARCHITECTURE.md).
