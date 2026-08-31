"""Source contracts for the Figma-aligned manual-step runtime card."""

from pathlib import Path


ROOT = Path(__file__).parents[1]
FLOW_JS = (ROOT / "api_chain_runner/ui/static/flow.js").read_text(encoding="utf-8")
STYLE_CSS = (ROOT / "api_chain_runner/ui/static/style.css").read_text(encoding="utf-8")


def test_manual_overlay_has_design_system_structure():
    assert 'className = "manual-overlay"' in FLOW_JS
    assert 'className = "manual-card"' in FLOW_JS
    assert 'className = "manual-header"' in FLOW_JS
    assert 'class="manual-status-icon"' in FLOW_JS
    assert 'Manual Step - ${esc(data.manual_step_name)}' in FLOW_JS
    assert 'className = "manual-instruction"' in FLOW_JS
    assert 'className = "manual-refs"' in FLOW_JS
    assert 'btn.className = "btn btn-primary manual-done-btn"' in FLOW_JS


def test_manual_overlay_styles_match_card_and_reference_layout():
    assert ".manual-card" in STYLE_CSS
    assert "max-width: 544px" in STYLE_CSS
    assert "border: 1.5px solid var(--purple)" in STYLE_CSS
    assert "background: var(--bg-card)" in STYLE_CSS
    assert ".manual-status-icon span:nth-child(1)" in STYLE_CSS
    assert ".manual-ref-row {\n    display: grid;" in STYLE_CSS
    assert ".manual-ref-val .value-copy" in STYLE_CSS
    assert ".manual-done-btn" in STYLE_CSS


def test_manual_reference_values_truncate_without_expansion_and_copy_raw_value():
    assert 'truncate: true' in FLOW_JS
    assert 'const expandable = !options.truncate' in FLOW_JS
    assert 'navigator.clipboard' in FLOW_JS
    assert '.manual-ref-val .value-expand { display: none; }' in STYLE_CSS
    assert 'white-space: nowrap;' in STYLE_CSS
    assert 'text-overflow: ellipsis;' in STYLE_CSS


def test_copy_button_exposes_hover_and_copied_tooltips():
    assert 'data-tooltip", "Copy"' in FLOW_JS
    assert 'showCopyTooltip("Copied")' in FLOW_JS
    assert 'copyButton.dataset.tooltipVisible = "true"' in FLOW_JS
    assert '.manual-ref-val .value-copy:hover::after' in STYLE_CSS
    assert 'content: attr(data-tooltip)' in STYLE_CSS
    assert 'data-tooltip-visible="true"' in STYLE_CSS


def test_manual_reference_tooltip_can_escape_field_and_value_is_centered():
    assert 'font-family: \'SF Mono\',\'Fira Code\',monospace; overflow: visible;' in STYLE_CSS
    assert '.manual-ref-val.bounded-value-wrapper .bounded-value-region' in STYLE_CSS
    assert 'align-self: center;' in STYLE_CSS
    assert 'line-height: 1.2;' in STYLE_CSS


def test_bounded_values_use_icon_buttons_and_tooltips_everywhere():
    assert 'copyButton.innerHTML = \'<span class="copy-icon" aria-hidden="true"></span>\'' in FLOW_JS
    assert 'expandButton.innerHTML = \'<span class="expand-icon" aria-hidden="true"></span>\'' in FLOW_JS
    assert 'data-tooltip", "Copy"' in FLOW_JS
    assert 'data-tooltip", "Expand"' in FLOW_JS
    assert 'tdBody.appendChild(renderBoundedValue(bodyText' in FLOW_JS
    assert 'textContent = "Copy"' not in FLOW_JS
    assert 'textContent = "Expand"' not in FLOW_JS
    assert '.bounded-value-actions .value-copy:hover::after' in STYLE_CSS
    assert '.bounded-value-actions .value-expand:hover::after' in STYLE_CSS
    assert '.bounded-value-actions .expand-icon::before' in STYLE_CSS


def test_step_response_controls_use_floating_tooltips_outside_scroll_containers():
    assert 'const isResponseControl = className.includes("response-value");' in FLOW_JS
    assert 'if (!isResponseControl) copyButton.title = "Copy";' in FLOW_JS
    assert 'if (!isResponseControl) expandButton.title = "Expand";' in FLOW_JS
    assert '.response-pre-wrap .bounded-value-actions .value-copy::after' in STYLE_CSS
    assert 'display: none;' in STYLE_CSS
    assert '.response-pre-wrap .bounded-value-actions .value-expand {\n    width: 30px;\n    height: 30px;' in STYLE_CSS


def test_manual_step_uses_theme_tokens_for_light_and_dark_modes():
    assert "background: var(--bg-card)" in STYLE_CSS
    assert "background: var(--bg-input)" in STYLE_CSS
    assert "border: 1px solid var(--border-light)" in STYLE_CSS
    assert "color: var(--text-secondary)" in STYLE_CSS
    assert "background: var(--accent); border-color: var(--accent);" in STYLE_CSS
    assert '[data-theme="light"] .manual-overlay' in STYLE_CSS
