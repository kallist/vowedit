"""Owner-only raw credential storage; no service or database imports."""

import json
import os
import stat
import subprocess
import tempfile
from pathlib import Path


def windows_acl(path: Path, *, secure: bool = False) -> None:
    # Fixed script; the path is an environment value, never executable text.
    script = r"""
    $ErrorActionPreference = 'Stop'
    $p = $env:VOWEDIT_ACL_TARGET
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($env:VOWEDIT_ACL_SECURE -eq '1') {
      $acl = [Security.AccessControl.FileSecurity]::new()
      $acl.SetAccessRuleProtection($true, $false)
      $acl.SetOwner($sid)
      $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')
      $acl.AddAccessRule($rule)
      Set-Acl -LiteralPath $p -AclObject $acl
    }
    $acl = Get-Acl -LiteralPath $p
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { exit 2 }
    foreach ($rule in $acl.Access) {
      if ($rule.AccessControlType -eq 'Allow' -and
          $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne
          $sid.Value) { exit 3 }
    }
    """
    env = {
        **os.environ,
        "VOWEDIT_ACL_TARGET": str(path),
        "VOWEDIT_ACL_SECURE": "1" if secure else "0",
    }
    result = subprocess.run(
        ["pwsh.exe", "-NoProfile", "-NonInteractive", "-Command", script],
        env=env,
        capture_output=True,
        timeout=15,
    )
    if result.returncode:
        raise PermissionError("Owner-only credential ACL verification failed")


def verify_private(path: Path) -> None:
    if path.is_symlink() or not path.is_file():
        raise PermissionError("Credential must be an owner-controlled regular file")
    if os.name == "nt":
        windows_acl(path)
    elif (path.stat().st_uid != os.getuid()  # type: ignore[attr-defined]
          or stat.S_IMODE(path.stat().st_mode) & 0o077):
        raise PermissionError("Credential requires owner-only permissions")


def write_private(path: Path, data: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=".agent-")
    temp = Path(temporary)
    try:
        os.close(descriptor)
        if os.name == "nt":
            windows_acl(temp, secure=True)
        else:
            temp.chmod(0o600)
        verify_private(temp)
        with temp.open("w", encoding="utf-8") as handle:
            json.dump(data, handle)
            handle.flush()
            os.fsync(handle.fileno())
        temp.replace(path)
        verify_private(path)
    finally:
        temp.unlink(missing_ok=True)
