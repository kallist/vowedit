"""Isolated browser-test host. Fault injection is never enabled in the production app."""

import os
import tempfile
import time
from pathlib import Path

import backend.services as service_module
from backend.api import create_app
from backend.providers import MockImageEditProvider
from backend.schemas import AppError
from backend.services import ImageEditService


class BrowserMock(MockImageEditProvider):
    def __init__(self):
        self.failed = False
        self.calls = 0

    def generate(self, request):
        self.calls += 1
        time.sleep(0.7)
        instruction = request.instruction.split("\n\n")[0]
        if instruction == "Test no qualifying edit":
            return request.source.copy()
        if instruction == "Test provider recovery" and not self.failed:
            self.failed = True
            raise AppError("PROVIDER_UNAVAILABLE", "Controlled provider outage. Retry this edit.")
        return super().generate(request)


local = Path(os.environ["VOWEDIT_DATA_DIR"]).resolve()
if local == Path("data").resolve() or Path("data").resolve() in local.parents:
    raise RuntimeError("Browser validation requires isolated data.")
local.mkdir(parents=True, exist_ok=True)
root = Path(tempfile.mkdtemp(prefix="browser-test-", dir=local)).resolve()
original_evaluate = service_module.evaluate
faults_remaining = 0


def controlled_evaluate(*args):
    global faults_remaining
    if faults_remaining:
        faults_remaining -= 1
        raise RuntimeError("Controlled evaluation failure")
    return original_evaluate(*args)


class BrowserService(ImageEditService):
    def process(self, job):
        global faults_remaining
        run = self.repo.get(job["run_id"])
        if (
            job["kind"] == "generation"
            and run["contract"]["change"]["instruction"] == "Test evaluation recovery"
        ):
            faults_remaining = 3
        try:
            super().process(job)
        finally:
            faults_remaining = 0


service_module.evaluate = controlled_evaluate
app = create_app(BrowserService(root, {"mock": BrowserMock()}))


@app.get("/api/test/provider-calls")
def provider_calls():
    return {"count": app.state.service.providers["mock"].calls}
