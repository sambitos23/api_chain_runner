"""Backend contract tests for editable and newly appended flow steps."""

from pathlib import Path

import yaml

from api_chain_runner.runner import ChainRunner
from api_chain_runner.ui import server


def write_flow(directory: Path) -> Path:
    flow = directory / "steps.yaml"
    flow.write_text(
        yaml.safe_dump(
            {
                "variables": {"token": "secret"},
                "chain": [
                    {
                        "name": "first",
                        "url": "https://example.test/first",
                        "method": "GET",
                        "headers": {"X-Test": "yes"},
                    },
                    {
                        "name": "second",
                        "url": "https://example.test/second",
                        "method": "POST",
                    },
                ],
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    return flow


def client_for(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "_flow_dir", str(tmp_path))
    return server.app.test_client()


def test_rename_preserves_other_fields(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    response = client_for(tmp_path, monkeypatch).post(
        "/api/flow/steps.yaml/step/0", json={"updates": {"name": "renamed"}}
    )

    assert response.status_code == 200
    stored = yaml.safe_load(flow.read_text(encoding="utf-8"))
    assert stored["variables"] == {"token": "secret"}
    assert stored["chain"][0]["name"] == "renamed"
    assert stored["chain"][0]["headers"] == {"X-Test": "yes"}
    assert ChainRunner(str(flow)).steps[0].name == "renamed"


def test_invalid_rename_does_not_write(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    before = flow.read_text(encoding="utf-8")
    client = client_for(tmp_path, monkeypatch)

    for name in ("", "second"):
        response = client.post(
            "/api/flow/steps.yaml/step/0", json={"updates": {"name": name}}
        )
        assert 400 <= response.status_code < 500
        assert flow.read_text(encoding="utf-8") == before


def test_append_api_step_validates_and_preserves_flow_metadata(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    response = client_for(tmp_path, monkeypatch).post(
        "/api/flow/steps.yaml/step",
        json={
            "step": {
                "name": "third",
                "url": "https://example.test/third",
                "method": "PATCH",
                "headers": {"Content-Type": "application/json"},
            }
        },
    )

    assert response.status_code == 200
    stored = yaml.safe_load(flow.read_text(encoding="utf-8"))
    assert stored["variables"] == {"token": "secret"}
    assert [step["name"] for step in stored["chain"]] == ["first", "second", "third"]
    assert ChainRunner(str(flow)).steps[-1].method == "PATCH"


def test_append_manual_step_is_supported(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    response = client_for(tmp_path, monkeypatch).post(
        "/api/flow/steps.yaml/step",
        json={
            "step": {
                "name": "manual-check",
                "manual": True,
                "instruction": "Verify the result manually",
            }
        },
    )

    assert response.status_code == 200
    assert yaml.safe_load(flow.read_text(encoding="utf-8"))["chain"][-1]["manual"] is True
    assert ChainRunner(str(flow)).steps[-1].manual is True


def test_invalid_append_does_not_write(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    before = flow.read_text(encoding="utf-8")
    response = client_for(tmp_path, monkeypatch).post(
        "/api/flow/steps.yaml/step",
        json={"step": {"name": "first", "url": "", "method": "INVALID"}},
    )

    assert 400 <= response.status_code < 500
    assert flow.read_text(encoding="utf-8") == before


def test_append_allows_non_name_step_values_without_schema_validation(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    response = client_for(tmp_path, monkeypatch).post(
        "/api/flow/steps.yaml/step",
        json={"step": {"name": "loose-step", "url": "", "method": "INVALID", "polling": False}},
    )

    assert response.status_code == 200
    stored = yaml.safe_load(flow.read_text(encoding="utf-8"))
    assert stored["chain"][-1]["polling"] is False


def test_parse_ignores_non_mapping_polling_for_editor_display(tmp_path):
    flow = tmp_path / "malformed-polling.yaml"
    flow.write_text(
        yaml.safe_dump({"chain": [{"name": "json-response-2", "url": "", "method": "GET", "polling": False}]}),
        encoding="utf-8",
    )

    parsed = server._parse_chain(str(flow))["steps"][0]
    assert parsed["has_polling"] is False
    assert "polling" not in parsed


def test_delete_step_preserves_remaining_flow_metadata(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    response = client_for(tmp_path, monkeypatch).delete("/api/flow/steps.yaml/step/0")

    assert response.status_code == 200
    stored = yaml.safe_load(flow.read_text(encoding="utf-8"))
    assert stored["variables"] == {"token": "secret"}
    assert [step["name"] for step in stored["chain"]] == ["second"]


def test_delete_last_step_is_rejected_without_writing(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    client = client_for(tmp_path, monkeypatch)
    client.delete("/api/flow/steps.yaml/step/0")
    before = flow.read_text(encoding="utf-8")

    response = client.delete("/api/flow/steps.yaml/step/0")

    assert 400 <= response.status_code < 500
    assert flow.read_text(encoding="utf-8") == before


def test_delete_uses_in_app_confirmation_popup():
    root = Path(__file__).resolve().parents[1]
    template = (root / "api_chain_runner/ui/templates/flow.html").read_text(encoding="utf-8")
    script = (root / "api_chain_runner/ui/static/flow.js").read_text(encoding="utf-8")

    assert 'id="delete-confirm-modal"' in template
    assert 'id="delete-confirm-ok"' in template
    assert "window.confirm" not in script
    assert "deleteConfirmModal.classList.remove(\"hidden\")" in script
    assert "method: \"DELETE\"" in script
