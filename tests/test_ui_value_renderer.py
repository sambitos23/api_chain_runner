"""Focused source-contract tests for the shared flow value renderer."""
from pathlib import Path


ROOT = Path(__file__).parents[1]
FLOW_JS = (ROOT / "api_chain_runner/ui/static/flow.js").read_text(encoding="utf-8")
FLOW_HTML = (ROOT / "api_chain_runner/ui/templates/flow.html").read_text(encoding="utf-8")


def test_shared_renderer_is_used_for_non_flow_long_value_surfaces():
    """**Validates: Requirements 2.3, 2.4, 2.6**"""
    assert "function renderBoundedValue(value, options = {})" in FLOW_JS
    for surface in (
        'className: "response-value response-pre-wrap"',
        'className: "manual-ref-val manual-ref-value"',
    ):
        assert surface in FLOW_JS
    # Flow side notes retain their original compact text/copy treatment.
    assert 'keyValue.addEventListener("click"' in FLOW_JS
    assert 'msg.textContent = r.eval_message.text;' in FLOW_JS
    assert 'className: "pk-key-val pk-key-value"' not in FLOW_JS
    assert 'className: "eval-message"' not in FLOW_JS
    assert "Object.entries(r.eval_result)" not in FLOW_JS


def test_renderer_preserves_raw_text_and_accessible_expand_controls():
    """**Validates: Requirements 2.3, 2.4, 2.6**"""
    assert "wrapper.dataset.rawValue = rawValue" in FLOW_JS
    assert "region.textContent = rawValue" in FLOW_JS
    assert 'expandButton.type = "button"' in FLOW_JS
    assert 'expandButton.setAttribute("aria-expanded", "false")' in FLOW_JS
    assert 'const action = expanded ? "Collapse" : "Expand"' in FLOW_JS
    assert 'expandButton.setAttribute("data-tooltip", action)' in FLOW_JS


def test_renderer_copies_exact_raw_value_and_reports_all_clipboard_outcomes():
    """**Validates: Requirements 2.5**"""
    assert "clipboard.writeText(rawValue)" in FLOW_JS
    assert 'feedback.textContent = "Copied"' in FLOW_JS
    assert 'feedback.textContent = "Copy failed"' in FLOW_JS
    assert 'feedback.textContent = "Clipboard unavailable"' in FLOW_JS
    assert 'copyButton.setAttribute("aria-label", `Copy ${label}`)' in FLOW_JS


def test_step_responses_offer_csv_download_and_local_execution_time():
    assert 'id="response-download-csv"' in FLOW_HTML
    assert 'id="response-download-excel"' not in FLOW_HTML
    assert 'class="icon icon-sm"><use href="#i-download"' in FLOW_HTML
    assert 'aria-label="Download as CSV"' in FLOW_HTML
    assert 'let currentResponseResults = []' in FLOW_JS
    assert 'function downloadResponsesCsv()' in FLOW_JS
    assert 'function downloadResponsesExcel()' not in FLOW_JS
    assert 'responseDisplayTime(result.executed_at)' in FLOW_JS
    assert 'Executed At' in FLOW_JS
    assert 'downloadResponseFile(`\\uFEFF${csv}`' in FLOW_JS
    assert 'function csvCell(value)' in FLOW_JS
    assert '.response-actions' in STYLE_CSS
    assert '.response-download-btn::after' in STYLE_CSS


def test_response_fallback_and_controls_remain_in_template():
    """**Validates: Requirements 3.3, 3.4, 3.5**"""
    assert 'tdExecuted.className = "col-executed"' in FLOW_JS
    assert 'tdExecuted.textContent = responseDisplayTime(r.executed_at);' in FLOW_JS
    assert 'const bodyText = responseDisplayText(r);' in FLOW_JS
    assert 'tdStatus.textContent = r.status_code > 0 ? r.status_code : (r.skipped ? "SKIP" : "ERR");' in FLOW_JS
    assert 'tdTime.textContent = r.duration_ms > 0 ? r.duration_ms + "ms" : "—";' in FLOW_JS
    assert 'id="response-close" type="button"' in FLOW_HTML
    assert 'aria-live="polite"' in FLOW_HTML


STYLE_CSS = (ROOT / "api_chain_runner/ui/static/style.css").read_text(encoding="utf-8")


def test_manual_reference_rows_reserve_key_value_and_action_columns():
    """**Validates: Requirements 2.2, 2.3, 2.4**"""
    assert ".manual-ref-row {\n    display: grid;" in STYLE_CSS
    assert "grid-template-columns: minmax(0, 1fr);" in STYLE_CSS
    assert ".manual-ref-val" in STYLE_CSS
    assert "grid-template-columns: minmax(0, 1fr) auto;" in STYLE_CSS
    assert ".manual-ref-val .bounded-value-region" in STYLE_CSS
    assert ".manual-ref-val .bounded-value-actions" in STYLE_CSS
    assert "grid-column: 2;" in STYLE_CSS
    assert ".manual-ref-val.bounded-value-wrapper {\n    display: grid;\n    grid-template-columns: minmax(0, 1fr) auto;" in STYLE_CSS
    generic_wrapper = STYLE_CSS.index(".bounded-value-wrapper {\n    display: flex;")
    manual_override = STYLE_CSS.index(".manual-ref-val.bounded-value-wrapper {")
    assert manual_override > generic_wrapper
    assert ".manual-ref-val.bounded-value-wrapper .bounded-value-region" in STYLE_CSS
    assert "grid-column: 1;" in STYLE_CSS
    assert "align-self: center;" in STYLE_CSS
    assert ".manual-ref-val.bounded-value-wrapper .bounded-value-actions {\n    grid-column: 2;\n    flex-shrink: 0;" in STYLE_CSS
    assert "overflow-wrap: anywhere;" in STYLE_CSS
    assert "@media (max-width: 700px)" in STYLE_CSS
    assert ".manual-ref-row { grid-template-columns: minmax(0, 1fr);" in STYLE_CSS
    assert "@media (max-width: 480px)" in STYLE_CSS
    assert ".manual-ref-row { grid-template-columns: minmax(0, 1fr); gap: 0.25rem; }" in STYLE_CSS


def test_printed_key_entries_use_compact_bounded_rows():
    """Printed keys retain compact typography while using the available width."""
    assert ".pk-box {" in STYLE_CSS
    assert "width: 100%; min-width: 0; max-width: 100%;" in STYLE_CSS
    assert ".pk-entry {\n    display: grid;" in STYLE_CSS
    assert ".pk-header" in STYLE_CSS
    assert ".pk-key-name::after { content: none; }" in STYLE_CSS
    assert "overflow: hidden;" in STYLE_CSS
    assert "white-space: nowrap; text-overflow: ellipsis;" in STYLE_CSS
    assert "overflow-wrap: normal;" in STYLE_CSS
    assert "word-break: normal;" in STYLE_CSS


def test_side_output_is_bounded_and_stacks_at_narrow_widths():
    assert ".step-row {\n    display: flex;\n    align-items: center;" in STYLE_CSS
    assert "width: 280px;" in STYLE_CSS
    assert ".step-box { flex: 0 0 280px; width: 280px;" in STYLE_CSS
    assert "--step-card-height" not in STYLE_CSS
    assert ".side-connector {\n    position: absolute;\n    left: 100%;\n    top: 0;" in STYLE_CSS
    assert "height: 170px;" in STYLE_CSS
    assert "max-height: 170px;" in STYLE_CSS
    assert "overflow-y: auto;" in STYLE_CSS
    assert ".step-row {\n        position: static;\n        flex-direction: column;" in STYLE_CSS
    assert ".side-connector {\n        position: static;\n        width: 100%;\n        max-width: 100%;\n        flex: none;\n        height: auto;\n        max-height: 195px;" in STYLE_CSS


def test_step_drawer_hit_area_is_limited_to_the_step_card():
    """Only the card, not its surrounding flow row, opens the drawer."""
    assert 'box.addEventListener("click", (e) => { e.stopPropagation(); showDetail(step, i); });' in FLOW_JS
    assert 'node.addEventListener("click"' not in FLOW_JS
    assert '.step-node { display: flex;' in STYLE_CSS
    assert 'cursor: pointer;' not in STYLE_CSS.split('.step-box {', 1)[0].split('.step-node {', 1)[1]
    assert '.step-box:hover {' in STYLE_CSS
    assert '.step-node:hover .step-box' not in STYLE_CSS


def test_flow_centerline_spacing_keeps_original_vertical_arrows():
    """The card, label, and arrow use the baseline compact spacing."""
    assert 'margin-top: 0.35rem; font-weight: 500;' in STYLE_CSS
    assert '.step-arrow { display: flex; align-items: center; justify-content: center; min-height: 50px; width: 280px; }' in STYLE_CSS
    assert '.step-arrow svg { width: 20px; height: 50px; }' in STYLE_CSS
    assert '.flow-canvas { display: flex; flex-direction: column; align-items: center;' in STYLE_CSS
    assert '.step-row {\n    display: flex;\n    align-items: center;\n    gap: 0;\n    position: relative;\n    width: 280px;\n}' in STYLE_CSS
    assert '.step-box { flex: 0 0 280px; width: 280px;' in STYLE_CSS


def test_side_output_panel_has_bounded_parameters_and_value_layout():
    assert 'pkHeader.className = "pk-header"' in FLOW_JS
    assert 'pkHeader.innerHTML = "<span>Parameters</span><span>Value</span>"' in FLOW_JS
    assert 'width: 405px;' in STYLE_CSS
    assert 'flex: 0 0 405px;' in STYLE_CSS
    assert 'width: 385px;' in STYLE_CSS
    assert 'min-width: 385px;' in STYLE_CSS
    assert 'max-width: 385px;' in STYLE_CSS
    assert 'height: 195px;' in STYLE_CSS
    assert 'max-height: 195px;' in STYLE_CSS
    assert 'overflow-y: auto;' in STYLE_CSS
    assert 'className = "pk-line"' in FLOW_JS


def test_eval_messages_attach_left_and_printed_values_attach_right():
    assert 'className = "eval-side-connector"' in FLOW_JS
    assert 'className = "eval-side-content"' in FLOW_JS
    assert 'row.insertBefore(evalWrap, box)' in FLOW_JS
    assert 'className = "side-connector"' in FLOW_JS
    assert 'const rawValue = String(v);' in FLOW_JS
    assert 'keyValue.dataset.tooltip = rawValue;' in FLOW_JS
    assert 'keyValue.title = rawValue;' in FLOW_JS
    assert 'clipboard.writeText(rawValue)' in FLOW_JS
    assert 'keyValue.dataset.tooltip = "Copied";' in FLOW_JS
    assert 'keyValue._refreshTooltip();' in FLOW_JS
    assert ".eval-side-connector" in STYLE_CSS
    assert ".eval-side-content" in STYLE_CSS


def test_eval_side_panel_has_connector_line_to_step_card():
    assert 'evalLine.className = "eval-line"' in FLOW_JS
    assert 'evalWrap.appendChild(evalLine)' in FLOW_JS
    assert '.eval-line' in STYLE_CSS
    assert 'background: var(--border-light);' in STYLE_CSS
