"""Small repository hygiene gate, not a replacement for a dedicated secret scanner."""

import re
import subprocess
from pathlib import Path

paths = (
    subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .decode()
    .split("\0")
)
patterns = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:sk-proj-|sk-live-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}"),
    re.compile(r"(?im)^[ \t]*(?:RUNNINGHUB_API_KEY|OPENAI_API_KEY)[ \t]*=[ \t]*[^\s#].+$"),
]
failures = []
for name in paths:
    path = Path(name)
    if not name or not path.is_file() or path.suffix.lower() in {".png", ".jpg", ".zip"}:
        continue
    if path.name in {".env", ".env.local"}:
        failures.append(f"{name}: secret configuration is tracked")
        continue
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    if any(pattern.search(text) for pattern in patterns):
        failures.append(f"{name}: potential credential pattern (value withheld)")
if failures:
    raise SystemExit("\n".join(failures))
print("Repository secret-pattern check passed; no matched credentials.")
