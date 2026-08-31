"""Preservation tests for the unfixed condition/detail UI baseline.

These tests intentionally cover behavior outside the condition-editing and
long-content fixes.  They establish the regression oracle before production
changes are made.
"""

from pathlib import Path

import pytest
import yaml

from api_chain_runner.models import StepResult
from api_chain_runner.runner import ChainRunner
from api_chain_runner.ui import server


FLOW_JS = Path(__file__).parents[1] / "api_chain_runner/ui/static/flow.js"
STYLE_CSS = Path(__file__).parents[1] / "api_chain_runner/ui/static/style.css"
FLOW_HTML = Path(__file__).parents[1] / "api_chain_runner/ui/templates/flow.html"


CONDITIONS = [
    {"step": "source-a", "key_path": "status.value", "expected_value": "READY"},
    {"step": "source-b", "key_path": "data.count", "expected_value": "2"},
]


def write_runner_flow(directory: Path, condition=None) -> Path:
    condition_yaml = ""
    if condition is not None:
        condition_yaml = yaml.safe_dump({"condition": condition}, sort_keys=False)
        condition_yaml = "".join(f"    {line}" for line in condition_yaml.splitlines(True))
    flow = directory / "runtime.yaml"
    flow.write_text(
        "chain:\n"
        "  - name: dependent\n"
        "    url: https://example.test/dependent\n"
        "    method: GET\n"
        f"{condition_yaml}",
        encoding="utf-8",
    )
    return flow


def run_dependent_case(tmp_path, monkeypatch, condition, stored):
    """Run one condition case with a recorder in place of HTTP execution."""
    runner = ChainRunner(str(write_runner_flow(tmp_path, condition)))
    runner.logger.finalize = lambda: None
    for step_name, response in stored.items():
        runner.store.save(step_name, response)

    executed = []

    def execute(step):
        executed.append(step.name)
        return StepResult(
            step_name=step.name,
            status_code=200,
            response_body={"ok": True},
            duration_ms=1.0,
            success=True,
        )

    monkeypatch.setattr(runner.executor, "execute", execute)
    result = runner.run()
    return executed, result


@pytest.mark.parametrize(
    ("condition", "stored", "should_execute"),
    [
        pytest.param(
            CONDITIONS,
            {"source-a": {"status": {"value": "READY"}}, "source-b": {"data": {"count": 2}}},
            True,
            id="all-conditions-match-in-order",
        ),
        pytest.param(
            CONDITIONS,
            {"source-a": {"status": {"value": "READY"}}, "source-b": {"data": {"count": 3}}},
            False,
            id="nested-mismatch-skips",
        ),
        pytest.param(
            CONDITIONS,
            {"source-a": {"status": {"value": "READY"}}},
            False,
            id="missing-source-skips",
        ),
        pytest.param(None, {}, True, id="no-condition-retains-execution"),
    ],
)
def test_runtime_condition_semantics_are_preserved(
    tmp_path, monkeypatch, condition, stored, should_execute
):
    """**Validates: Requirements 3.1, 3.4**"""
    executed, result = run_dependent_case(tmp_path, monkeypatch, condition, stored)

    assert (executed == ["dependent"]) is should_execute
    assert len(result.results) == (1 if should_execute else 0)


def test_step_update_preserves_unrelated_fields_when_conditions_are_untouched(
    tmp_path, monkeypatch
):
    """**Validates: Requirements 3.2**"""
    flow = tmp_path / "preserve.yaml"
    original = {
        "chain": [
            {
                "name": "dependent",
                "url": "https://example.test/original",
                "method": "POST",
                "headers": {"X-Test": "header"},
                "payload": {"nested": {"value": "payload"}},
                "files": {"document": "doc.txt"},
                "unique_fields": {"customer.id": "mobile"},
                "print_keys": ["data.id"],
                "polling": {"interval": 2, "max_timeout": 10, "key_path": "state", "expected_values": ["DONE"]},
                "retry": {"max_attempts": 4, "delay": 1, "on": ["5xx"]},
                "eval_keys": {"score": "data.score"},
                "eval_condition": "score > 0",
                "success_message": "accepted",
                "failure_message": "rejected",
                "delay": 3,
                "continue_on_error": False,
                "condition": CONDITIONS,
            }
        ]
    }
    flow.write_text(yaml.safe_dump(original, sort_keys=False), encoding="utf-8")
    monkeypatch.setattr(server, "_flow_dir", str(tmp_path))

    response = server.app.test_client().post(
        "/api/flow/preserve.yaml/step/0",
        json={"updates": {"url": "https://example.test/changed"}},
    )

    assert response.status_code == 200
    saved = yaml.safe_load(flow.read_text(encoding="utf-8"))["chain"][0]
    assert saved["url"] == "https://example.test/changed"
    expected_unchanged = dict(original["chain"][0])
    expected_unchanged.pop("url")
    actual_unchanged = dict(saved)
    actual_unchanged.pop("url")
    assert actual_unchanged == expected_unchanged


@pytest.mark.parametrize(
    "source_fragment",
    [
        "const bodyText = responseDisplayText(r);",
        "tdStatus.textContent = r.status_code > 0 ? r.status_code : (r.skipped ? \"SKIP\" : \"ERR\");",
        "tdTime.textContent = r.duration_ms > 0 ? r.duration_ms + \"ms\" : \"—\";",
        'responseClose.addEventListener("click", () => responsePanel.classList.add("hidden"));',
    ],
)
def test_short_response_rendering_and_existing_controls_remain_intact(source_fragment):
    """**Validates: Requirements 3.3, 3.4, 3.5**"""
    source = FLOW_JS.read_text(encoding="utf-8")
    assert source_fragment in source

    for state_class in ("state-skipped", "state-passed", "state-failed"):
        assert state_class in source
    assert 'renderBoundedValue(bodyText, { className: "response-value response-pre-wrap", label: "response" })' in source
    assert 'region.textContent = rawValue;' in source
    assert 'copyButton.type = "button"' in source
    assert 'navigator.clipboard' in source
    assert 'id="response-close"' in FLOW_HTML.read_text(encoding="utf-8")


def test_themes_and_narrow_layout_keep_existing_controls_reachable():
    """**Validates: Requirements 3.6**"""
    css = STYLE_CSS.read_text(encoding="utf-8")
    html = FLOW_HTML.read_text(encoding="utf-8")

    # Both supported theme selectors remain available to the existing theme.js.
    assert ':root, [data-theme="dark"]' in css
    assert '[data-theme="light"]' in css
    # Existing containment/scroll owners preserve reachability on narrow views.
    assert 'meta name="viewport" content="width=device-width, initial-scale=1.0"' in html
    assert ".step-detail-panel" in css and "max-width: 92vw" in css
    assert ".detail-body" in css and "overflow-y: auto" in css
    assert ".response-list" in css and "overflow-x: auto" in css
    source = FLOW_JS.read_text(encoding="utf-8")
    assert "detailClose.addEventListener" in source or 'id="detail-close"' in html
    assert "runBtn.addEventListener" in source or 'id="run-btn"' in html
    assert "pauseBtn.addEventListener" in source or 'id="pause-btn"' in html
    assert "resumeBtn.addEventListener" in source or 'id="resume-btn"' in html
