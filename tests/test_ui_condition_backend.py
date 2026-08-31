"""Focused backend contract tests for structured step conditions."""

from pathlib import Path

import yaml

from api_chain_runner.runner import ChainRunner
from api_chain_runner.ui import server


CONDITIONS = [
    {"step": "source-a", "key_path": "status.value", "operator": "equals", "expected_value": "READY"},
    {"step": "source-b", "key_path": "data.count", "operator": "contains", "expected_value": "2"},
]


def write_flow(directory: Path, condition=None) -> Path:
    step = {
        "name": "dependent",
        "url": "https://example.test/dependent",
        "method": "GET",
    }
    if condition is not None:
        step["condition"] = condition
    flow = directory / "conditions.yaml"
    flow.write_text(yaml.safe_dump({"chain": [step]}, sort_keys=False), encoding="utf-8")
    return flow


def update(client, payload):
    return client.post(
        "/api/flow/conditions.yaml/step/0", json={"updates": payload}
    )


def test_parse_normalizes_absent_legacy_single_and_multi_forms(tmp_path):
    absent = write_flow(tmp_path)
    assert server._parse_chain(str(absent))["steps"][0]["condition"] == []

    single = write_flow(tmp_path, {"step": "source", "key_path": "value", "expected_value": 7})
    parsed_single = server._parse_chain(str(single))["steps"][0]
    assert parsed_single["condition"] == [
        {"step": "source", "key_path": "value", "expected_value": "7"}
    ]
    assert parsed_single["has_condition"] is True

    multiple = write_flow(tmp_path, CONDITIONS)
    assert server._parse_chain(str(multiple))["steps"][0]["condition"] == CONDITIONS


def test_update_edits_and_reorders_conditions_with_loader_compatible_values(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    monkeypatch.setattr(server, "_flow_dir", str(tmp_path))
    client = server.app.test_client()
    edited = [CONDITIONS[1], {"step": "source-c", "key_path": "ok", "expected_value": 200}]

    response = update(client, {"condition": edited})

    assert response.status_code == 200
    assert yaml.safe_load(flow.read_text(encoding="utf-8"))["chain"][0]["condition"] == [
        CONDITIONS[1],
        {"step": "source-c", "key_path": "ok", "expected_value": "200"},
    ]
    loaded = ChainRunner(str(flow)).steps[0].condition
    assert [(c.step, c.key_path, c.operator, c.expected_value) for c in loaded] == [
        ("source-b", "data.count", "contains", "2"),
        ("source-c", "ok", "equals", "200"),
    ]


def test_malformed_condition_does_not_partially_save_other_updates(tmp_path, monkeypatch):
    flow = write_flow(tmp_path, CONDITIONS)
    monkeypatch.setattr(server, "_flow_dir", str(tmp_path))
    before = flow.read_text(encoding="utf-8")

    response = update(
        server.app.test_client(),
        {"url": "https://example.test/changed", "condition": [{"step": "source"}]},
    )

    assert 400 <= response.status_code < 500
    assert flow.read_text(encoding="utf-8") == before


def test_empty_condition_update_clears_stored_conditions(tmp_path, monkeypatch):
    flow = write_flow(tmp_path, CONDITIONS)
    monkeypatch.setattr(server, "_flow_dir", str(tmp_path))

    response = update(server.app.test_client(), {"condition": []})

    assert response.status_code == 200
    parsed = server._parse_chain(str(flow))["steps"][0]
    assert parsed["condition"] == []
    assert parsed["has_condition"] is False
    assert "condition" not in yaml.safe_load(flow.read_text(encoding="utf-8"))["chain"][0]


def test_operator_is_normalized_and_persisted(tmp_path, monkeypatch):
    flow = write_flow(tmp_path)
    monkeypatch.setattr(server, "_flow_dir", str(tmp_path))

    response = update(server.app.test_client(), {
        "condition": [{
            "step": "source",
            "key_path": "lead_status",
            "operator": "contains",
            "expected_value": "okyc",
        }]
    })

    assert response.status_code == 200
    stored = yaml.safe_load(flow.read_text(encoding="utf-8"))["chain"][0]["condition"][0]
    assert stored == {
        "step": "source",
        "key_path": "lead_status",
        "operator": "contains",
        "expected_value": "okyc",
    }
