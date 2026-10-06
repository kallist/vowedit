import io
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient as BaseClient
from PIL import Image, ImageDraw

from backend.api import create_app
from backend.services import ImageEditService


def png(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class TestClient(BaseClient):
    __test__ = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.headers["Origin"] = "http://127.0.0.1:3000"
        response = self.post("/api/browser-session")
        assert response.status_code == 200, response.text
        self.headers["X-Vowedit-CSRF"] = response.json()["csrf"]


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
    with TestClient(create_app(service)) as client:
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
