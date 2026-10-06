"""All test imports use isolated data and never load owner provider configuration."""
import os
from pathlib import Path

os.environ["PYTHON_DOTENV_DISABLED"] = "1"
default_root = Path(__file__).resolve().parents[2] / ".local/v03-validation-data/import"
configured_root = Path(os.environ.get("VOWEDIT_DATA_DIR", str(default_root)))
# Only explicitly isolated host/CI fixture roots can override the test-import default.
if not configured_root.is_absolute() or not (
    {"v03-validation-data", "v03-ci-data"} & set(configured_root.resolve().parts)
):
    configured_root = default_root
os.environ["VOWEDIT_DATA_DIR"] = str(configured_root.resolve())
for key in list(os.environ):
    if key.startswith(("COMFYUI_", "RUNNINGHUB_")):
        os.environ.pop(key)
os.environ["VOWEDIT_PROVIDER"] = "mock"
