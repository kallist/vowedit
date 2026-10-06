import io
import os
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

# Set isolation before backend.api's module-level dotenv import, including plain pytest runs.
os.environ["PYTHON_DOTENV_DISABLED"] = "1"
os.environ["VOWEDIT_DATA_DIR"] = str(Path(".local/v021-test-startup").resolve())
for variable in (
    "RUNNINGHUB_API_KEY",
    "RUNNINGHUB_WORKFLOW_ID",
    "COMFYUI_BASE_URL",
    "COMFYUI_CHECKPOINT",
):
    os.environ.pop(variable, None)

from backend.api import create_app  # noqa: E402
from backend.services import ImageEditService  # noqa: E402


def png(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def images():
    source = Image.new("RGB", (64, 64), (150, 120, 90))
    change = Image.new("L", source.size)
    ImageDraw.Draw(change).rectangle((24, 24, 47, 47), fill=255)
    keep = Image.new("L", source.size)
    ImageDraw.Draw(keep).rectangle((0, 0, 15, 15), fill=255)
    return source, change, keep


@pytest.fixture
def service(tmp_path):
    return ImageEditService(tmp_path)


@pytest.fixture
def client(service):
    with TestClient(create_app(service), headers={"Origin": "http://127.0.0.1:3000"}) as client:
        yield client


def payload(client, images):
    ids = []
    for index, image in enumerate(images):
        response = client.post(
            f"/api/assets?kind={'original' if index == 0 else 'mask'}",
            files={"file": ("fixture.png", png(image), "image/png")},
        )
        assert response.status_code == 201, response.text
        ids.append(response.json()["id"])
    return {
        "source_image": ids[0],
        "request_key": str(uuid4()),
        "provider": "mock",
        "contract": {
            "change": {"instruction": "Change jacket to blue", "mask": ids[1]},
            "keep": [{"type": "manual_region", "label": "Face", "mask": ids[2], "threshold": 98}],
            "background_threshold": 98,
        },
    }
