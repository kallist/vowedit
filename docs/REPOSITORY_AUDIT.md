# Repository audit — 2026-09-28

- Starting directory: project folder `vowedit`; empty, not a Git repository.
- No existing README, application, manifests, lockfiles, tests, CI, Docker or local instructions file.
- User-provided engineering instructions apply. No unrelated files needed preservation.
- Initialized `feat/vowedit-v0.1`; no initial/base commit and no configured remote.
- Python 3.10 virtual environment and Node 24 used locally. No inherited framework to preserve.
- An initial ADR suggested Vite/rectangle masks; the later specification mandated Next.js/brush masks.
  The decision was revised before application implementation. Current code is the source of truth.

## Reusable capabilities and strategy

Use browser canvas, Pillow/NumPy, stdlib SQLite, a worker thread, HTTPX and a small provider protocol.
No queue service, large mask library, model training, CUDA tuning or external image hosting.
Implement Mock P0 first; real adapter transport tests are a separate layer of evidence.

## Local provider discovery

Read-only, bounded discovery examined the workspace, sibling projects, home top-level directories,
Downloads, Desktop, Documents, configuration directory and likely AI workspace directories.
Names checked included ComfyUI, main.py, checkpoints, workflows and provider environment variables.
One directory named comfyui contained learning notes, not an installation. No compatible checkpoint
or RunningHub credential/workflow setting was found in the inspected scope. No private images were
opened or copied. No model download, installation modification or GPU tuning was performed.
Actual HTTP probe to `127.0.0.1:8188/system_stats` failed to connect. Discovery is bounded, not proof
that no installation exists anywhere on disk.

## Risk areas

Mask coordinate/polarity errors; no-op candidates winning on preservation; average metrics hiding
small damaging edits; duplicate paid work after response loss; partial image/evaluation persistence;
stale job transitions; restart recovery; browser overflow and lost mask state. The targeted tests,
E2E and review report cover these areas. Real model quality and human demo judgments remain unverified.
