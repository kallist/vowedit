"""Explicit owner setup/rotate/revoke. Never loads .env or emits credentials."""

import argparse
import json
import secrets
from pathlib import Path
from uuid import UUID, uuid4

from backend.agent_auth import register
from backend.agent_credentials import verify_private, write_private
from backend.persistence import Repository


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["setup", "rotate", "revoke"])
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--credential", required=True, type=Path)
    parser.add_argument("--api-port", type=int, default=8000)
    args = parser.parse_args()
    if not args.data_dir.is_absolute() or not args.credential.is_absolute():
        parser.error("Use explicit absolute owner-controlled paths")
    if not 1024 <= args.api_port <= 65535:
        parser.error("Use an unprivileged numeric loopback port")
    args.data_dir.mkdir(parents=True, exist_ok=True)
    repo = Repository(args.data_dir / "vowedit.sqlite3")
    if args.operation == "setup":
        if args.credential.exists():
            parser.error("Credential exists; explicitly rotate it")
        client_id = str(uuid4())
    else:
        verify_private(args.credential)
        client_id = str(UUID(json.loads(args.credential.read_text())["client_id"]))
    if args.operation == "revoke":
        with repo.transaction() as db:
            db.execute("UPDATE agent_credentials SET revoked=1 WHERE id=?", (client_id,))
        return
    token = secrets.token_hex(32)
    # Fail closed if file write fails. A failed registry write leaves an unusable file.
    write_private(
        args.credential, {"token": token, "client_id": client_id, "api_port": args.api_port}
    )
    register(repo, token, client_id)
    print(f"Local Agent client {client_id} configured. Credential value is never displayed.")


if __name__ == "__main__":
    main()
