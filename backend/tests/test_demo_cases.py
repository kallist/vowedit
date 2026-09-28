import json
from pathlib import Path
from uuid import uuid4

import pytest

from backend.tests.test_integration import wait_run

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / "demo-assets" / "manifest.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["slot"] for case in CASES])
def test_three_demo_contracts_complete_with_mock(client, case):
    ids = []
    for key in ("source", "change", "keep"):
        content = (ROOT / "public" / "fixtures" / case[key]).read_bytes()
        response = client.post(
            f"/api/assets?kind={'original' if key == 'source' else 'mask'}",
            files={"file": (case[key], content, "image/png")},
        )
        assert response.status_code == 201
        ids.append(response.json()["id"])
    response = client.post(
        "/api/runs",
        json={
            "source_image": ids[0],
            "request_key": str(uuid4()),
            "provider": "mock",
            "contract": {
                "change": {"instruction": case["instruction"], "mask": ids[1]},
                "keep": [
                    {
                        "type": "manual_region",
                        "label": case["keep_label"],
                        "mask": ids[2],
                        "threshold": 98,
                    }
                ],
                "background_threshold": 98,
            },
        },
    )
    assert response.status_code == 202
    run = wait_run(client, response.json()["id"])
    assert run["status"] == "completed"
    assert run["candidates"][0]["index"] == 1
    assert run["candidates"][0]["evaluation"]["protected_similarity"] == 100
    assert run["candidates"][0]["manual_review"]["verdict"] == "pending"
    assert len(run["candidates"][1]["evaluation"]["violations"]) >= 1
