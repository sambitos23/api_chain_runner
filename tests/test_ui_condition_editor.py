"""Focused source-contract tests for the structured step-drawer condition editor."""

from pathlib import Path


FLOW_JS = Path(__file__).parents[1] / "api_chain_runner/ui/static/flow.js"


def test_condition_editor_renders_ordered_fields_for_api_and_manual_steps():
    source = FLOW_JS.read_text(encoding="utf-8")

    assert 'buildToggleSection("condition", "Conditions"' in source
    assert 'id + "-section"' in source
    assert 'class="condition-param"' in source
    assert 'data-condition="step"' in source
    assert 'data-condition="key_path"' in source
    assert 'data-condition="operator"' in source
    assert 'data-condition="expected_value"' in source
    assert "conditionOperatorOptions" in source
    assert "+ Add Condition" in source
    assert "wireConditionFields();" in source
    # Both drawer branches use the same structured toggle editor.
    assert source.count('buildToggleSection("condition", "Conditions"') == 2


def test_retry_toggle_detects_retry_fields_and_uses_single_dynamic_handler():
    source = FLOW_JS.read_text(encoding="utf-8")

    assert '.polling-param, .retry-param, .eval-param, .condition-param' in source
    assert 'updates.retry = false' in source
    assert 'detailBody.dataset.toggleWired' in source
    assert 'detailBody.addEventListener("click"' in source


def test_condition_editor_collects_live_rows_and_explicit_empty_list():
    source = FLOW_JS.read_text(encoding="utf-8")

    assert 'querySelectorAll(".condition-entry")' in source
    assert "conditions.push(condition);" in source
    assert "updates.condition = conditions;" in source
    assert "updates.condition = [];" in source
    assert 'removeButton.closest(".condition-entry").remove()' in source
    assert "Condition ${field.replace(\"_\", \" \")} is required" in source


def test_condition_editor_escapes_stored_values_and_uses_button_controls():
    source = FLOW_JS.read_text(encoding="utf-8")

    assert 'esc(String(item.step ?? ""))' in source
    assert 'esc(String(item.key_path ?? ""))' in source
    assert 'esc(String(item.expected_value ?? ""))' in source
    assert 'type="button" class="btn btn-ghost btn-sm condition-add"' in source
    assert 'type="button" class="btn-icon-only condition-remove"' in source
