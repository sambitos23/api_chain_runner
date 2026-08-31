"""Bug-condition exploration tests for the unfixed flow UI.

These assertions intentionally describe the required fixed behavior.  They are
run before implementation; failures are evidence that the bug condition is
present, not invitations to weaken the assertions.
"""

from pathlib import Path

import pytest
import yaml

from api_chain_runner.ui import server


CONDITION = {
    "step": "check-status",
    "key_path": "status.value",
    "expected_value": "SUCCESS",
}
SECOND_CONDITION = {
    "step": "check-status",
    "key_path": "status.form_filled",
    "expected_value": "SUCCESS",
}


@pytest.fixture
def flow_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "_flow_dir", str(tmp_path))
    return tmp_path


def write_flow(directory: Path, condition_marker: str = "") -> Path:
    flow = directory / "exploration.yaml"
    flow.write_text(
        "chain:\n"
        "  - name: check-status\n"
        "    url: https://example.test/status\n"
        "    method: GET\n"
        f"{condition_marker}"
        "  - name: dependent\n"
        "    url: https://example.test/dependent\n"
        "    method: GET\n",
        encoding="utf-8",
    )
    return flow


@pytest.mark.parametrize(
    ("condition_yaml", "expected"),
    [
        ("", []),
        ("    condition:\n      step: check-status\n      key_path: status.value\n      expected_value: SUCCESS\n", [CONDITION]),
        (
            "    condition:\n"
            "      - step: check-status\n"
            "        key_path: status.value\n"
            "        expected_value: SUCCESS\n"
            "      - step: check-status\n"
            "        key_path: status.form_filled\n"
            "        expected_value: SUCCESS\n",
            [CONDITION, SECOND_CONDITION],
        ),
    ],
)
def test_parse_chain_exposes_absent_single_and_multi_conditions(
    tmp_path, condition_yaml, expected
):
    flow = write_flow(tmp_path, condition_yaml)

    parsed = server._parse_chain(str(flow))

    # The UI contract is always an ordered list, including absent conditions.
    assert parsed["steps"][0]["condition"] == expected


def test_step_update_round_trips_structured_conditions_in_order(flow_dir):
    flow = write_flow(flow_dir)
    client = server.app.test_client()

    response = client.post(
        "/api/flow/exploration.yaml/step/0",
        json={"updates": {"condition": [CONDITION, SECOND_CONDITION]}},
    )

    assert response.status_code == 200
    raw = yaml.safe_load(flow.read_text(encoding="utf-8"))
    assert raw["chain"][0]["condition"] == [CONDITION, SECOND_CONDITION]


def test_step_update_empty_condition_list_clears_stale_data(flow_dir):
    flow = write_flow(
        flow_dir,
        "    condition:\n"
        "      step: check-status\n"
        "      key_path: status.value\n"
        "      expected_value: SUCCESS\n",
    )
    client = server.app.test_client()

    response = client.post(
        "/api/flow/exploration.yaml/step/0", json={"updates": {"condition": []}}
    )

    assert response.status_code == 200
    parsed = server._parse_chain(str(flow))
    assert parsed["steps"][0]["condition"] == []
    assert parsed["steps"][0]["has_condition"] is False


def test_step_update_rejects_malformed_condition_entry(flow_dir):
    write_flow(flow_dir)
    client = server.app.test_client()

    response = client.post(
        "/api/flow/exploration.yaml/step/0",
        json={"updates": {"condition": [{"step": "check-status"}]}},
    )

    assert 400 <= response.status_code < 500


FLOW_JS = Path(__file__).parents[1] / "api_chain_runner/ui/static/flow.js"
STYLE_CSS = Path(__file__).parents[1] / "api_chain_runner/ui/static/style.css"


def test_step_drawer_renders_editable_ordered_condition_entries_and_controls():
    source = FLOW_JS.read_text(encoding="utf-8")

    # Minimized UI counterexample: one stored condition must produce three
    # editable fields, and an empty list must still be explicitly savable.
    assert 'data-condition="step"' in source
    assert 'data-condition="key_path"' in source
    assert 'data-condition="expected_value"' in source
    assert "+ Add Condition" in source
    assert "updates.condition" in source


def test_response_panel_has_bounded_expandable_keyboard_copy_contract():
    source = FLOW_JS.read_text(encoding="utf-8")
    css = STYLE_CSS.read_text(encoding="utf-8")

    # Minimized UI counterexample: a single long response body needs visible
    # expand/collapse semantics and a bounded presentation.
    assert "aria-expanded" in source
    assert "Expand" in source and "Collapse" in source
    assert 'type="button"' in source
    assert "response-value" in css or "response-pre-wrap" in css


def test_copy_contract_handles_success_failure_and_unavailable_clipboard():
    source = FLOW_JS.read_text(encoding="utf-8")

    # Copy must use the untouched raw value and visibly handle every outcome.
    assert "navigator.clipboard" in source
    assert ".catch" in source
    assert "Copy failed" in source or "copy failed" in source
    assert "Clipboard unavailable" in source or "clipboard unavailable" in source
