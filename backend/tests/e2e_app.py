"""Isolated browser-test host. Fault injection is never enabled in the production app."""

import tempfile
import time
from pathlib import Path

from backend.api import create_app
from backend.providers import MockImageEditProvider
from backend.schemas import AppError
from backend.services import ImageEditService


class BrowserMock(MockImageEditProvider):
    def __init__(self):
        self.failed = False

    def generate(self, request):
        time.sleep(0.7)
        if request.instruction == "Test no qualifying edit":
            return request.source.copy()
        if request.instruction == "Test provider recovery" and not self.failed:
            self.failed = True
            raise AppError("PROVIDER_UNAVAILABLE", "Controlled provider outage. Retry this edit.")
        return super().generate(request)


local = Path(".local")
local.mkdir(exist_ok=True)
root = Path(tempfile.mkdtemp(prefix="browser-test-", dir=local))
app = create_app(ImageEditService(root, {"mock": BrowserMock()}))
