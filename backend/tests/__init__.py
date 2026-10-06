"""All test imports use isolated data and never load owner provider configuration."""
import os
from pathlib import Path

os.environ["PYTHON_DOTENV_DISABLED"] = "1"
os.environ.setdefault("VOWEDIT_DATA_DIR", str(Path(".local/v03-validation-data/import").resolve()))
for key in list(os.environ):
    if key.startswith(("COMFYUI_", "RUNNINGHUB_")):
        os.environ.pop(key)
os.environ["VOWEDIT_PROVIDER"] = "mock"
