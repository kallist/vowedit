# VowEdit Agent Control — agent-api-v1

## Architecture and scope

MCP stdio → bounded authenticated loopback HTTP → FastAPI → AgentService → existing
ImageEditService → provider/SQLite/PNG/single worker. The adapter does not import the
database, construct a service, start a worker, load dotenv, or read provider keys.
No separate queue, model transport, collaboration system or second editor is introduced.

An editing draft is mutable until its one submitted_run_id is recorded. It contains UUID,
revision, source, instruction, canonical masks/rules, provider and bounded strokes.
Source replacement forks a new draft. Existing /api/drafts/{id} continuation starters retain
their immutable semantics. Continue copies adopted final pixels into a new original and
starts an empty-boundary editing draft; no review verdict is inherited.

## Owner setup and local host

Install locked dependencies, including official mcp==1.30.0. Start the normal loopback API
and Next Web app as in README. Mock needs no provider account or dotenv file. Setup must
name the same absolute data directory used by the API:

~~~text
python -m backend.agent_setup setup --data-dir <absolute-data-directory> --credential <absolute-private-credential.json> --api-port 8000
python -m backend.mcp_server --credential <absolute-private-credential.json>
~~~

Keep the credential in an ignored owner-controlled directory, such as .local. Never commit
it or put it in frontend state, URLs or host config. Setup prints only the client UUID.
The raw 256-bit bearer exists in this private file; SQLite stores only SHA-256 digest,
client ID, revocation bit and grants. POSIX requires current owner and no group/other
permissions. Windows verifies current owner and an owner-only DACL using PowerShell 7
(pwsh.exe). Failed permission verification stops startup.

Configure a local stdio host with command pointing to virtualenv Python, args containing
-m backend.mcp_server --credential and the absolute private filename, and cwd pointing to
the repository. This task used process-local Codex configuration, without editing global
user configuration. Normally create/open requests the fixed OS opener. Use --no-open only
when the owner prefers visible exact links. Requested does not prove page visibility;
failure returns UI_OPEN_FAILED and retains the exact ui_url for manual opening.

~~~text
python -m backend.agent_setup rotate --data-dir <absolute-data-directory> --credential <absolute-private-credential.json> --api-port 8000
python -m backend.agent_setup revoke --data-dir <absolute-data-directory> --credential <absolute-private-credential.json>
~~~

Restart stdio after rotation because its bearer is cached. Rotation preserves grants.
Revocation rejects subsequent calls and stales undecided requests; it does not cancel an
already approved job or revoke sent data. Registry failure after private-file replacement
leaves an unusable file; repeat explicit rotate to repair. This single-user localhost
design does not isolate arbitrary processes running as the same OS user, which can access
the owner's runtime and are inside the trust boundary.

## Permission boundary

Browser bootstrap establishes an HttpOnly SameSite=Strict 12-hour session from the trusted
local app. Mutations require its CSRF header and trusted Origin/Fetch Metadata. Sessions
are memory-only, limited to 64, with concurrent bootstrap protected. Reload reestablishes
the session after API restart. Only loopback hosts are accepted; Web port defaults to 3000.

| Caller | Read | Write | Human decisions |
| --- | --- | --- | --- |
| No session/bearer | Minimal config/capabilities | Trusted browser bootstrap only | No |
| Scoped bearer | Granted draft/Run/report/activity | Create draft, proposal, pending action | No |
| Browser session + CSRF + trusted origin | Local UI contexts | Existing UI, draft CAS, grants | Yes |

Invalid/revoked bearer never falls back to a browser session. Bearer calls to legacy upload,
generation, review, selection, continuation, retry, draft writes, grants and human decisions
are rejected. UUID knowledge does not grant access. Resource reads use the same scope checks,
including referenced canonical assets and raw/locked provenance. Share a context explicitly
in the Activity panel using its client UUID. Agent cannot enumerate history or supply URLs,
file paths, base64 images, arbitrary ports, shell, SQL or generic HTTP.

Instructions, labels, reports and tool/provider output are untrusted. React renders text
without HTML injection. Agent summaries never modify ranking, evaluation, recommendation
or manual review. Keys remain in existing server runtime mechanisms, outside approval
fingerprints and public records. OS process access is not an isolation guarantee.

## Shared editing and confirmations

1. Create an awaiting-image draft, open its exact URL, upload an authorized image.
2. Propose bounded half-open integer source-pixel rectangles or a granted mask UUID.
   Deterministic rasterization validates dimensions, bounds, counts, overlap and empty CHANGE.
   Preview and accepted contract use the same persisted mask assets.
3. Review saved/proposed intent and boundaries. Accept saves a revision; reject queues nothing.
   Refine using the existing seeded MaskEditor, intent, KEEP and background controls.
4. Read three-slot strategy-v1 plan and request generation. The Web Review generation button
   uses the same pending/confirmation path. A pending request queues no job.
5. Confirm the card showing source/boundaries/intent/strategies, provider, three-candidate
   budget, outgoing data, recipient and unknown external cost. Current images must be loaded.
6. Applied means local Run/job submission, not provider success. Existing progress, candidates,
   effective instructions, slider, Ghost, raw/locked views and receipt remain available.
7. Human review stays independent. Agent adopt/continue cards show requested final pixels
   and require the same individual issue confirmations as the existing selection validator.

Saves use expected_revision and UUID request_key. Identical replay returns the acknowledged
result; another payload with the same key is a 409. Browser sessionStorage retains an
unacknowledged save for exact retry. Conflicting local edits remain visible with explicit
reload/discard; they are not silently overwritten. Only acknowledged state survives a fresh
browser. Closing with unsaved edits warns.

Pending actions expire in ten minutes, binding source/mask pixel digests, contract, revision,
immutable plan, budget, provider nonsecret configuration and recipient. Source, masks, intent,
rules, provider config, selection, evaluation or review changes stale applicable requests.
Worker checks approved config and pixels before provider invocation. No cancellation of
already sent work is promised. Every generation retry requires a new confirmation;
evaluation-only retry confirms an operation on saved pixels and never regenerates.

## Persistence and failure boundary

Four additive tables: editing_drafts, agent_action_requests (unique principal/request key),
activity_entries (monotonic cursor), agent_credentials. Run activity also includes its
linked approval action entries, so approval provenance stays visible without granting
access to the entire originating draft. Existing assets/runs/jobs remain.
BEGIN IMMEDIATE serializes writers. Reused connections commit approval, Run/job, draft
pointer and required activity atomically. Activity failure rolls everything back. Concurrent
decision keys have one winner. Applied decision replay precedes TTL/stale checks.
Starter/new draft registration is in the same continuation decision transaction.

PNG writes precede metadata. Mask-construction failure removes its own created files. Later
DB/transaction failures may leave unreferenced files, without a visible partial draft/job.
Global orphan collection is not implemented. External batch interruption is not assumed
exactly-once; existing unknown-charge and safe-retry restrictions remain.

Before a real upgrade, stop services and back up SQLite/WAL plus assets consistently.
Do not run old/new binaries on one directory. Rollback restores the stopped backup;
no downgrade migration is provided. Migration/fault/backup restoration were tested only
on isolated legacy fixtures. Real user data was never used for validation.

## API and tools

[Machine-readable tool schemas](agent-api-v1.schema.json) are derived from shared Pydantic
models: forbidden extra fields, typed UUIDs, nonnegative revisions, finite values, at most
100 activity entries/page, 256 strokes and 64 KiB saved-context payload. Adapter timeout
is five seconds, response cap 512 KiB, redirects and environment proxies disabled.
Errors expose stable codes/recovery steps without raw exceptions.

| MCP tool | Operation |
| --- | --- |
| vowedit_get_capabilities | Version, features, limits, available service, web-fallback |
| vowedit_create_edit | Idempotent draft, optional authorized source UUID, exact UI |
| vowedit_get_edit | Acknowledged revision, masks, plan, pending requests, Run pointer |
| vowedit_propose_contract | Independent pending typed intent/mask proposal |
| vowedit_request_action | generate/adopt/continue/retry_generation/retry_evaluation union |
| vowedit_get_run | Job/candidate/evaluation/review/adoption state and fingerprints |
| vowedit_get_report | Existing structured report and provenance |
| vowedit_get_activity | Authorized draft/Run cursor page |
| vowedit_open_ui | Fixed exact opener; requested/failed, visibility unverified |

Agent routes: /api/agent/capabilities; editing-drafts (POST, GET /{id}); proposals (POST);
actions (POST, GET /{id}); runs/{id}, runs/{id}/report, runs/{id}/actions (GET);
{draft|run}/{id}/activity?after_cursor=0&limit=50 (GET).
Human routes: /api/editing-drafts/{id} (PUT), /presented and /generation-request (POST);
/api/agent-actions/{id}/decision and /api/agent-grants (POST).
Existing Run payload semantics remain; browser authentication is now required. Nonbrowser
clients use explicit scoped credentials on the bounded Agent surface. This is an intentional
local authentication change, not backward-compatible anonymous access.

Actions move pending → applied/rejected/expired/stale. Stable errors include UNAUTHORIZED,
FORBIDDEN_RESOURCE, CSRF_REJECTED, REVISION_CONFLICT, IDEMPOTENCY_CONFLICT, ACTION_STALE,
ACTION_EXPIRED, DECISION_ALREADY_APPLIED, UI_REQUIRED, SOURCE_REQUIRED, INVALID_MASK,
MASK_OVERLAP, APPROVAL_CONFIG_CHANGED, STORAGE_FAILED, SERVICE_UNAVAILABLE,
RESPONSE_TOO_LARGE and UI_OPEN_FAILED. Re-read stale state, preserve/reload conflicting
local edits, restore unavailable services. A lost response does not prove no execution:
inspect canonical results and retry the original key, not a new submission.

Authenticated resources are vowedit://drafts/{draft_id} and vowedit://runs/{run_id}/report.
No history enumeration is exposed. These are textual JSON snapshots. MCP Apps HTML resource
and bridge: NOT IMPLEMENTED, NOT TESTED. Selected actual CLI host did not demonstrate an
embedded renderer; complete Web recovery is the delivered path. Generic MCP support is not
evidence of native sidebar support. See the validation document for actual-host evidence.
