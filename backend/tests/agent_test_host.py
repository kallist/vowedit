"""Explicit isolated Mock host for stdio acceptance only."""
import os
from pathlib import Path

from backend.api import create_app
from backend.services import ImageEditService

root = Path(os.environ["VOWEDIT_DATA_DIR"]).resolve()
if "v03-validation-data" not in root.parts:
    raise RuntimeError("Agent validation must use isolated fixture storage")
app = create_app(ImageEditService(root))
