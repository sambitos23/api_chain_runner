/* flow.js — Vertical flow, editable drawer, run execution, response display */
(function () {
    const canvas = document.getElementById("flow-canvas");
    const runBtn = document.getElementById("run-btn");
    const pauseBtn = document.getElementById("pause-btn");
    const resumeBtn = document.getElementById("resume-btn");
    const runStatus = document.getElementById("run-status");
    const detailOverlay = document.getElementById("step-detail");
    const detailName = document.getElementById("detail-name");
    const detailBody = document.getElementById("detail-body");
    const detailClose = document.getElementById("detail-close");
    const detailDelete = document.getElementById("detail-delete");
    const deleteConfirmModal = document.getElementById("delete-confirm-modal");
    const deleteConfirmStepName = document.getElementById("delete-confirm-step-name");
    const deleteConfirmClose = document.getElementById("delete-confirm-close");
    const deleteConfirmCancel = document.getElementById("delete-confirm-cancel");
    const deleteConfirmOk = document.getElementById("delete-confirm-ok");
    const detailSave = document.getElementById("detail-save");
    const detailSaveStatus = document.getElementById("detail-save-status");
    const responsePanel = document.getElementById("response-panel");
    const responseList = document.getElementById("response-list");
    const responseClose = document.getElementById("response-close");
    const responseDownloadCsv = document.getElementById("response-download-csv");
    const addStepBtn = document.getElementById("add-step-btn");

    const steps = CHAIN_DATA.steps;
    const stepBoxes = [];
    let currentStepIndex = -1;
    let isCreatingStep = false;
    let currentResponseResults = [];

    // ── Render VERTICAL flow ─────────────────────────────────
    function renderFlow() {
        canvas.innerHTML = "";
        stepBoxes.length = 0;

        steps.forEach((step, i) => {
            const node = document.createElement("div");
            node.className = "step-node";
            node.dataset.index = i;

            // Keep the original compact row: side output is attached to the
            // same row while the card, label, and arrow remain in the canvas.
            const row = document.createElement("div");
            row.className = "step-row";

            const box = document.createElement("div");
            box.className = `step-box method-${step.method.toUpperCase()}`;

            const tags = [];
            if (step.has_polling) tags.push("polling");
            if (step.has_payload) tags.push("body");
            if (step.has_files) tags.push("files");
            if (step.has_unique_fields) tags.push("unique");
            if (step.has_condition) tags.push("cond");
            if (step.delay > 0) tags.push(`${step.delay}s`);
            if (!step.continue_on_error) tags.push("stop-on-fail");

            box.innerHTML = `
                <span class="method-badge">${esc(step.method.toUpperCase())}</span>
                <div class="step-name">${esc(step.name)}</div>
                ${tags.length ? `<div class="step-tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
            `;

            row.appendChild(box);
            node.appendChild(row);

            const idx = document.createElement("div");
            idx.className = "step-index";
            idx.textContent = `Step ${i + 1}`;
            node.appendChild(idx);

            // Only the step card opens the detail drawer. The row, label,
            // arrow, and side output are deliberately non-interactive.
            box.addEventListener("click", (e) => { e.stopPropagation(); showDetail(step, i); });
            canvas.appendChild(node);
            stepBoxes.push(box);

            // Vertical arrow between steps remains in the original canvas flow.
            if (i < steps.length - 1) {
                const arrow = document.createElement("div");
                arrow.className = "step-arrow";
                arrow.innerHTML = `<svg viewBox="0 0 20 40">
                    <line x1="10" y1="0" x2="10" y2="30" stroke-width="1.5"/>
                    <polygon points="5,30 10,40 15,30"/>
                </svg>`;
                canvas.appendChild(arrow);
            }
        });
    }

    // ── Detail drawer with editable fields ───────────────────
    function showDetail(step, index, isNew = false) {
        currentStepIndex = index;
        isCreatingStep = isNew;
        detailName.textContent = isNew ? "Add Step" : step.name;
        detailDelete.classList.toggle("hidden", isNew);
        detailSave.textContent = isNew ? "Save Step" : "Save Changes";
        detailSaveStatus.textContent = "";
        detailSaveStatus.className = "detail-save-status";

        const isManual = step.manual;
        const curMethod = step.method.toUpperCase();
        let html = "";

        if (isManual) {
            // ── Manual step UI ──
            html += `<div class="detail-row"><div class="detail-label">Type</div><div class="detail-value">Manual Step</div></div>`;
            html += inputRow("name", "Step Name", step.name || "");
            html += editableRow("instruction", "Instruction", step.instruction || "");
            html += buildListField("print_ref", "Print References", step.print_ref || [], "e.g. create-lead.leadId");
            html += buildToggleSection("condition", "Conditions", (step.condition || []).length ? step.condition : null, buildConditionFields);
            html += numberRow("delay", "Delay (seconds)", step.delay || 0);
            html += dropdownRow("continue_on_error", "Continue on Error", step.continue_on_error);
        } else {
            // ── API step UI ──
            html += inputRow("name", "Step Name", step.name || "");
            const methods = ["GET","POST","PUT","DELETE","PATCH","HEAD","OPTIONS"];
            html += `<div class="detail-row"><div class="detail-label">Method</div>
                <select class="detail-select" data-field="method">${methods.map(m => `<option${m===curMethod?" selected":""}>${m}</option>`).join("")}</select></div>`;
            html += inputRow("url", "URL", step.url || "");
            html += numberRow("delay", "Delay (seconds)", step.delay || 0);
            html += dropdownRow("continue_on_error", "Continue on Error", step.continue_on_error);
            html += editableRow("headers", "Headers", step.headers && Object.keys(step.headers).length ? JSON.stringify(step.headers, null, 2) : "{}");

            if (curMethod !== "GET" && curMethod !== "HEAD" && curMethod !== "OPTIONS") {
                html += editableRow("payload", "Payload", step.payload ? JSON.stringify(step.payload, null, 2) : "");
                html += editableRow("unique_fields", "Unique Fields", step.unique_fields ? JSON.stringify(step.unique_fields, null, 2) : "");
                html += editableRow("files", "Files", step.files ? JSON.stringify(step.files, null, 2) : "");
            }

            // Print Keys — structured list
            html += buildListField("print_keys", "Print Keys", step.print_keys || [], "e.g. leadId");
            html += buildToggleSection("condition", "Conditions", (step.condition || []).length ? step.condition : null, buildConditionFields);

            // Polling — structured
            const p = (step.has_polling && step.polling) ? step.polling : null;
            html += buildToggleSection("polling", "Polling", p, buildPollingFields);

            // Retry — structured
            const retryData = step.retry;
            const hasRetry = retryData && retryData !== false && typeof retryData === "object";
            html += buildToggleSection("retry", "Retry", hasRetry ? retryData : null, buildRetryFields);

            // Eval Keys — structured
            const hasEval = step.eval_keys && Object.keys(step.eval_keys).length;
            html += buildToggleSection("eval", "Eval Keys", hasEval ? step : null, buildEvalFields);
        }

        detailBody.innerHTML = html;
        wireToggleSections();
        wireListFields();
        wireConditionFields();
        detailOverlay.classList.remove("hidden");
    }

    // ── Field builders ───────────────────────────────────────
    function inputRow(field, label, value) {
        return `<div class="detail-row"><div class="detail-label">${esc(label)}</div>
            <input class="detail-editable-input" data-field="${esc(field)}" value="${esc(String(value))}" spellcheck="false"></div>`;
    }
    function numberRow(field, label, value) {
        return `<div class="detail-row"><div class="detail-label">${esc(label)}</div>
            <input type="number" class="detail-editable-input" data-field="${esc(field)}" value="${value}" min="0"></div>`;
    }
    function dropdownRow(field, label, currentVal) {
        return `<div class="detail-row"><div class="detail-label">${esc(label)}</div>
            <select class="detail-select" data-field="${esc(field)}">
                <option value="true"${currentVal?" selected":""}>true</option>
                <option value="false"${!currentVal?" selected":""}>false</option>
            </select></div>`;
    }
    function editableRow(field, label, value) {
        return `<div class="detail-row"><div class="detail-label">${esc(label)}</div>
            <textarea class="detail-editable" data-field="${esc(field)}" spellcheck="false">${esc(String(value))}</textarea></div>`;
    }

    // List field — add/remove items
    function buildListField(field, label, items, placeholder) {
        let html = `<div class="detail-row"><div class="detail-label">${esc(label)}</div>
            <div class="list-field" data-list-field="${esc(field)}">`;
        (items || []).forEach(item => {
            html += `<div class="list-item"><input class="detail-editable-input list-input" value="${esc(item)}" placeholder="${esc(placeholder)}"><button class="btn-icon-only list-remove" title="Remove">×</button></div>`;
        });
        html += `<button class="btn btn-ghost btn-sm list-add">+ Add</button></div></div>`;
        return html;
    }

    function wireListFields() {
        detailBody.querySelectorAll(".list-field").forEach(container => {
            container.querySelector(".list-add").addEventListener("click", () => {
                const item = document.createElement("div");
                item.className = "list-item";
                item.innerHTML = `<input class="detail-editable-input list-input" placeholder=""><button class="btn-icon-only list-remove" title="Remove">×</button>`;
                container.insertBefore(item, container.querySelector(".list-add"));
                item.querySelector(".list-remove").addEventListener("click", () => item.remove());
            });
            container.querySelectorAll(".list-remove").forEach(btn => {
                btn.addEventListener("click", () => btn.parentElement.remove());
            });
        });
    }

    function buildConditionFields(conditions) {
        let html = `<div class="condition-param">
            <div class="condition-entries">`;
        (conditions || []).forEach(condition => {
            html += buildConditionEntry(condition);
        });
        return html + `</div><button type="button" class="btn btn-ghost btn-sm condition-add">+ Add Condition</button></div>`;
    }

    function conditionOperatorOptions(current) {
        const options = [
            ["equals", "Equals"],
            ["not_equals", "Not equals"],
            ["contains", "Contains"],
            ["not_contains", "Does not contain"],
            ["greater_than", "Greater than"],
            ["greater_than_or_equal", "Greater than or equal"],
            ["less_than", "Less than"],
            ["less_than_or_equal", "Less than or equal"],
            ["starts_with", "Starts with"],
            ["ends_with", "Ends with"],
            ["is_null", "Is null"],
            ["is_not_null", "Is not null"],
        ];
        const selected = current || "equals";
        return options.map(([value, label]) =>
            `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`
        ).join("");
    }

    function buildConditionEntry(condition) {
        const item = condition || {};
        return `<div class="condition-entry">
            <label class="poll-label">Source Step</label>
            <input class="detail-editable-input condition-input" data-condition="step" value="${esc(String(item.step ?? ""))}" placeholder="e.g. check-status" spellcheck="false">
            <label class="poll-label">Response Key Path</label>
            <input class="detail-editable-input condition-input" data-condition="key_path" value="${esc(String(item.key_path ?? ""))}" placeholder="e.g. status.value" spellcheck="false">
            <label class="poll-label">Operator</label>
            <select class="detail-select condition-input" data-condition="operator">
                ${conditionOperatorOptions(item.operator)}
            </select>
            <label class="poll-label">Expected Value</label>
            <input class="detail-editable-input condition-input" data-condition="expected_value" value="${esc(String(item.expected_value ?? ""))}" placeholder="e.g. SUCCESS" spellcheck="false">
            <button type="button" class="btn-icon-only condition-remove" title="Remove condition" aria-label="Remove condition">×</button>
        </div>`;
    }

    function wireConditionFields() {
        if (detailBody.dataset.conditionWired) return;
        detailBody.dataset.conditionWired = "true";
        detailBody.addEventListener("click", (event) => {
            const addButton = event.target.closest(".condition-add");
            if (addButton && detailBody.contains(addButton)) {
                const entries = addButton.closest(".condition-param").querySelector(".condition-entries");
                const wrapper = document.createElement("div");
                wrapper.innerHTML = buildConditionEntry({});
                const entry = wrapper.firstElementChild;
                entries.appendChild(entry);
                entry.querySelector('[data-condition="step"]').focus();
                return;
            }
            const removeButton = event.target.closest(".condition-remove");
            if (removeButton && detailBody.contains(removeButton)) {
                removeButton.closest(".condition-entry").remove();
            }
        });
    }

    // Toggle section — add/remove structured block
    function buildToggleSection(id, label, data, buildFn) {
        const hasData = data !== null && data !== undefined;
        return `<div class="detail-row"><div class="detail-label">${esc(label)}</div>
            <div class="toggle-section" id="${id}-section">
                ${hasData ? buildFn(data) : `<div class="polling-empty">Not configured</div>`}
                <button type="button" class="btn btn-ghost btn-sm toggle-btn" data-target="${id}" style="margin-top:0.4rem">${hasData ? "Remove" : "+ Add"}</button>
            </div></div>`;
    }

    function wireToggleSections() {
        if (detailBody.dataset.toggleWired) return;
        detailBody.dataset.toggleWired = "true";
        detailBody.addEventListener("click", (event) => {
            const button = event.target.closest(".toggle-btn");
            if (!button || !detailBody.contains(button)) return;
            const id = button.dataset.target;
            const section = document.getElementById(id + "-section");
            const hasParam = section.querySelector(".polling-param, .retry-param, .eval-param, .condition-param");
            if (hasParam) {
                section.innerHTML = `<div class="polling-empty">Not configured</div><button type="button" class="btn btn-ghost btn-sm toggle-btn" data-target="${id}" style="margin-top:0.4rem">+ Add</button>`;
                return;
            }
            const buildFn = id === "polling" ? buildPollingFields
                : id === "retry" ? buildRetryFields
                : id === "condition" ? buildConditionFields
                : buildEvalFields;
            const defaults = id === "polling"
                ? {key_path:"",expected_values:[],interval:10,max_timeout:120}
                : id === "retry"
                ? {max_attempts:3,delay:5,retry_on:["timeout","connection","5xx"]}
                : id === "condition"
                ? []
                : {eval_keys:{},eval_condition:"",success_message:"",failure_message:""};
            section.innerHTML = buildFn(defaults) + `<button type="button" class="btn btn-ghost btn-sm toggle-btn" data-target="${id}" style="margin-top:0.4rem">Remove</button>`;
        });
    }

    function buildPollingFields(p) {
        return `<div class="polling-param">
            <label class="poll-label">Key Path</label>
            <input class="detail-editable-input poll-input" data-poll="key_path" value="${esc(p.key_path || "")}" placeholder="e.g. status or applications.-1.status">
            <label class="poll-label">Expected Values (comma separated)</label>
            <input class="detail-editable-input poll-input" data-poll="expected_values" value="${esc((p.expected_values||[]).join(", "))}" placeholder="e.g. APPROVED, COMPLETED">
            <label class="poll-label">Interval (seconds)</label>
            <input type="number" class="detail-editable-input poll-input" data-poll="interval" value="${p.interval||10}" min="1">
            <label class="poll-label">Max Timeout (seconds)</label>
            <input type="number" class="detail-editable-input poll-input" data-poll="max_timeout" value="${p.max_timeout||120}" min="1">
        </div>`;
    }

    function buildEvalFields(s) {
        const ek = s.eval_keys || {};
        return `<div class="eval-param">
            <label class="poll-label">Eval Keys (JSON: alias → path)</label>
            <textarea class="detail-editable eval-input" data-eval="eval_keys" spellcheck="false">${esc(Object.keys(ek).length ? JSON.stringify(ek, null, 2) : '{\n  "score": "features.SCORE"\n}')}</textarea>
            <label class="poll-label">Condition (Python expression)</label>
            <input class="detail-editable-input eval-input" data-eval="eval_condition" value="${esc(s.eval_condition || "")}" placeholder="e.g. score > 0.55">
            <label class="poll-label">Success Message</label>
            <input class="detail-editable-input eval-input" data-eval="success_message" value="${esc(s.success_message || "")}" placeholder="Scores above threshold">
            <label class="poll-label">Failure Message</label>
            <input class="detail-editable-input eval-input" data-eval="failure_message" value="${esc(s.failure_message || "")}" placeholder="Scores below threshold">
        </div>`;
    }

    function buildRetryFields(r) {
        const retryOn = (r && r.retry_on) || (r && r.on) || ["timeout", "connection", "5xx"];
        const opts = ["timeout", "connection", "5xx", "4xx"];
        return `<div class="retry-param">
            <label class="poll-label">Max Attempts</label>
            <input type="number" class="detail-editable-input poll-input" data-retry="max_attempts" value="${(r && r.max_attempts) || 3}" min="1" max="20">
            <label class="poll-label">Delay Between Retries (seconds)</label>
            <input type="number" class="detail-editable-input poll-input" data-retry="delay" value="${(r && r.delay) || 5}" min="0">
            <label class="poll-label">Retry On</label>
            <div class="retry-checks">${opts.map(o => `<label class="retry-check"><input type="checkbox" data-retry-on="${o}" ${retryOn.includes(o) ? "checked" : ""}> ${o}</label>`).join("")}</div>
        </div>`;
    }

    function readonlyRow(label, value) {
        return `<div class="detail-row"><div class="detail-label">${esc(label)}</div>
            <div class="detail-value readonly-value" data-raw-value="${esc(String(value))}">${esc(String(value))}</div></div>`;
    }

    function attachFloatingTooltip(control) {
        let tooltip = null;

        const hide = () => {
            if (tooltip) {
                tooltip.remove();
                tooltip = null;
            }
        };

        const show = () => {
            hide();
            tooltip = document.createElement("div");
            tooltip.className = "response-floating-tooltip";
            tooltip.textContent = control.dataset.tooltip || control.title || "";
            document.body.appendChild(tooltip);

            const rect = control.getBoundingClientRect();
            const gap = 8;
            const tooltipRect = tooltip.getBoundingClientRect();
            const left = Math.min(
                Math.max(gap, rect.left + (rect.width - tooltipRect.width) / 2),
                window.innerWidth - tooltipRect.width - gap
            );
            const below = rect.bottom + gap;
            const top = below + tooltipRect.height <= window.innerHeight
                ? below
                : rect.top - tooltipRect.height - gap;
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${Math.max(gap, top)}px`;
            requestAnimationFrame(() => tooltip && tooltip.classList.add("visible"));
        };

        control._refreshTooltip = show;
        control.addEventListener("mouseenter", show);
        control.addEventListener("mouseleave", hide);
        control.addEventListener("focus", show);
        control.addEventListener("blur", hide);
    }

    // Shared bounded value renderer. The raw value is retained on the wrapper;
    // the preview is presentation-only and is never used for copy or expansion.
    function renderBoundedValue(value, options = {}) {
        const rawValue = value === undefined || value === null ? "" : String(value);
        const label = options.label || "value";
        const className = options.className || "bounded-value";
        const expandable = !options.truncate && (rawValue.length > 240 || rawValue.split("\\n").length > 8);
        const wrapper = document.createElement("div");
        wrapper.className = `${className} bounded-value-wrapper${expandable ? " is-expandable" : ""}`;
        wrapper.dataset.rawValue = rawValue;

        const region = document.createElement("div");
        region.className = "bounded-value-region";
        region.textContent = rawValue;
        region.setAttribute("aria-label", `${label} content`);
        wrapper.appendChild(region);

        const actions = document.createElement("div");
        actions.className = "bounded-value-actions";
        const isResponseControl = className.includes("response-value");
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "value-copy btn btn-ghost btn-sm";
        copyButton.setAttribute("aria-label", `Copy ${label}`);
        copyButton.setAttribute("data-tooltip", "Copy");
        if (!isResponseControl) copyButton.title = "Copy";
        copyButton.innerHTML = '<span class="copy-icon" aria-hidden="true"></span>';
        if (isResponseControl) attachFloatingTooltip(copyButton);
        const feedback = document.createElement("span");
        feedback.className = "value-copy-feedback";
        feedback.setAttribute("role", "status");
        feedback.setAttribute("aria-live", "polite");

        let tooltipTimer;
        const showCopyTooltip = (text) => {
            copyButton.dataset.tooltip = text;
            if (!isResponseControl) copyButton.title = text;
            copyButton.dataset.tooltipVisible = "true";
            if (copyButton._refreshTooltip) copyButton._refreshTooltip();
            clearTimeout(tooltipTimer);
            tooltipTimer = setTimeout(() => {
                copyButton.dataset.tooltip = "Copy";
                if (!isResponseControl) copyButton.title = "Copy";
                delete copyButton.dataset.tooltipVisible;
            }, 1400);
        };

        copyButton.addEventListener("click", () => {
            const clipboard = navigator.clipboard;
            if (!clipboard || typeof clipboard.writeText !== "function") {
                feedback.textContent = "Clipboard unavailable";
                feedback.className = "value-copy-feedback error";
                showCopyTooltip("Copy failed");
                return;
            }
            Promise.resolve().then(() => clipboard.writeText(rawValue)).then(() => {
                feedback.textContent = "Copied";
                feedback.className = "value-copy-feedback success";
                showCopyTooltip("Copied");
            }).catch(() => {
                feedback.textContent = "Copy failed";
                feedback.className = "value-copy-feedback error";
                showCopyTooltip("Copy failed");
            });
        });
        actions.appendChild(copyButton);

        if (expandable) {
            const expandButton = document.createElement("button");
            expandButton.type = "button";
            expandButton.className = "value-expand btn btn-ghost btn-sm";
            expandButton.setAttribute("aria-label", `Expand ${label}`);
            expandButton.setAttribute("aria-expanded", "false");
            expandButton.setAttribute("data-tooltip", "Expand");
            if (!isResponseControl) expandButton.title = "Expand";
            expandButton.innerHTML = '<span class="expand-icon" aria-hidden="true"></span>';
            if (isResponseControl) attachFloatingTooltip(expandButton);
            expandButton.addEventListener("click", () => {
                const expanded = wrapper.classList.toggle("is-expanded");
                const action = expanded ? "Collapse" : "Expand";
                expandButton.setAttribute("aria-expanded", String(expanded));
                expandButton.setAttribute("aria-label", `${action} ${label}`);
                expandButton.setAttribute("data-tooltip", action);
                if (!isResponseControl) expandButton.title = action;
                if (expandButton._refreshTooltip) expandButton._refreshTooltip();
            });
            actions.appendChild(expandButton);
        }
        actions.appendChild(feedback);
        wrapper.appendChild(actions);
        return wrapper;
    }

    function esc(str) { const d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

    detailClose.addEventListener("click", () => detailOverlay.classList.add("hidden"));
    detailOverlay.addEventListener("click", (e) => {
        if (e.target === detailOverlay || e.target.classList.contains("step-detail-backdrop")) {
            detailOverlay.classList.add("hidden");
        }
    });

    // ── Save step changes from drawer ────────────────────────
    detailSave.addEventListener("click", async () => {
        if (!isCreatingStep && currentStepIndex < 0) return;
        const editables = detailBody.querySelectorAll(".detail-editable, .detail-editable-input, .detail-select");
        const updates = {};

        for (const el of editables) {
            const field = el.dataset.field;
            if (!field) continue;
            const raw = el.value.trim();

            if (!raw && !["method", "url", "delay", "continue_on_error", "instruction"].includes(field)) continue;

            if (["name", "url", "method", "instruction", "eval_condition", "success_message", "failure_message"].includes(field)) {
                updates[field] = raw;
            } else if (field === "delay") {
                updates[field] = parseInt(raw) || 0;
            } else if (field === "continue_on_error") {
                updates[field] = raw === "true";
            } else {
                try {
                    updates[field] = JSON.parse(raw);
                } catch (err) {
                    detailSaveStatus.textContent = `Invalid JSON in ${field}`;
                    detailSaveStatus.className = "detail-save-status error";
                    return;
                }
            }
        }

        if (!updates.name || !updates.name.trim()) {
            detailSaveStatus.textContent = "Step name is required";
            detailSaveStatus.className = "detail-save-status error";
            detailBody.querySelector('[data-field="name"]')?.focus();
            return;
        }
        updates.name = updates.name.trim();

        // Collect list fields (print_keys, print_ref)
        detailBody.querySelectorAll(".list-field").forEach(container => {
            const field = container.dataset.listField;
            const items = [];
            container.querySelectorAll(".list-input").forEach(input => {
                const v = input.value.trim();
                if (v) items.push(v);
            });
            updates[field] = items.length ? items : null;
        });

        // Collect structured conditions in DOM order. Empty rows are invalid;
        // removing the section intentionally submits an explicit empty list.
        const conditionSection = detailBody.querySelector("#condition-section");
        const conditionParam = conditionSection && conditionSection.querySelector(".condition-param");
        if (conditionParam) {
            const conditions = [];
            for (const entry of conditionParam.querySelectorAll(".condition-entry")) {
                const condition = {};
                for (const field of ["step", "key_path", "operator", "expected_value"]) {
                    const input = entry.querySelector(`[data-condition="${field}"]`);
                    condition[field] = input.value;
                    const optionalExpected = ["is_null", "is_not_null"].includes(condition.operator);
                    if (!input.value.trim() && !(field === "expected_value" && optionalExpected)) {
                        detailSaveStatus.textContent = `Condition ${field.replace("_", " ")} is required`;
                        detailSaveStatus.className = "detail-save-status error";
                        input.focus();
                        return;
                    }
                }
                conditions.push(condition);
            }
            updates.condition = conditions;
        } else if (conditionSection) {
            updates.condition = [];
        }

        // Collect polling
        const pollingParam = detailBody.querySelector(".polling-param");
        if (pollingParam) {
            const keyPath = pollingParam.querySelector('[data-poll="key_path"]').value.trim();
            const evRaw = pollingParam.querySelector('[data-poll="expected_values"]').value.trim();
            const interval = parseInt(pollingParam.querySelector('[data-poll="interval"]').value) || 10;
            const maxTimeout = parseInt(pollingParam.querySelector('[data-poll="max_timeout"]').value) || 120;
            const polling = { interval, max_timeout: maxTimeout };
            if (keyPath) {
                polling.key_path = keyPath;
                polling.expected_values = evRaw ? evRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
            }
            updates.polling = polling;
        } else if (detailBody.querySelector("#polling-section .polling-empty")) {
            updates.polling = null;
        }

        // Collect eval fields
        const evalParam = detailBody.querySelector(".eval-param");
        if (evalParam) {
            const ekRaw = evalParam.querySelector('[data-eval="eval_keys"]').value.trim();
            try {
                updates.eval_keys = JSON.parse(ekRaw);
            } catch (err) {
                detailSaveStatus.textContent = "Invalid JSON in Eval Keys";
                detailSaveStatus.className = "detail-save-status error";
                return;
            }
            updates.eval_condition = evalParam.querySelector('[data-eval="eval_condition"]').value.trim();
            updates.success_message = evalParam.querySelector('[data-eval="success_message"]').value.trim();
            updates.failure_message = evalParam.querySelector('[data-eval="failure_message"]').value.trim();
        } else if (detailBody.querySelector("#eval-section .polling-empty")) {
            updates.eval_keys = null;
            updates.eval_condition = null;
            updates.success_message = null;
            updates.failure_message = null;
        }

        // Collect retry fields
        const retryParam = detailBody.querySelector(".retry-param");
        if (retryParam) {
            const maxAttempts = parseInt(retryParam.querySelector('[data-retry="max_attempts"]').value) || 3;
            const retryDelay = parseInt(retryParam.querySelector('[data-retry="delay"]').value) || 5;
            const retryOn = [];
            retryParam.querySelectorAll('[data-retry-on]').forEach(cb => {
                if (cb.checked) retryOn.push(cb.dataset.retryOn);
            });
            updates.retry = { max_attempts: maxAttempts, delay: retryDelay, on: retryOn };
        } else if (detailBody.querySelector("#retry-section .polling-empty")) {
            updates.retry = false;
        }

        detailSaveStatus.textContent = "Saving...";
        detailSaveStatus.className = "detail-save-status";

        try {
            const endpoint = isCreatingStep
                ? `/api/flow/${FLOW_PATH}/step`
                : `/api/flow/${FLOW_PATH}/step/${currentStepIndex}`;
            const body = isCreatingStep ? { step: updates } : { updates };
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.success) {
                detailSaveStatus.textContent = isCreatingStep ? "✓ Step added" : "✓ Saved";
                detailSaveStatus.className = "detail-save-status success";
                setTimeout(() => location.reload(), 1200);
            } else {
                detailSaveStatus.textContent = "✗ " + (data.error || "Failed");
                detailSaveStatus.className = "detail-save-status error";
            }
        } catch (err) {
            detailSaveStatus.textContent = "✗ " + err.message;
            detailSaveStatus.className = "detail-save-status error";
        }
    });

    detailDelete.addEventListener("click", () => {
        if (isCreatingStep || currentStepIndex < 0) return;
        deleteConfirmStepName.textContent = steps[currentStepIndex].name;
        deleteConfirmModal.classList.remove("hidden");
        deleteConfirmOk.focus();
    });

    function closeDeleteConfirmation() {
        deleteConfirmModal.classList.add("hidden");
    }

    deleteConfirmClose.addEventListener("click", closeDeleteConfirmation);
    deleteConfirmCancel.addEventListener("click", closeDeleteConfirmation);
    deleteConfirmModal.addEventListener("click", (event) => {
        if (event.target === deleteConfirmModal) closeDeleteConfirmation();
    });

    deleteConfirmOk.addEventListener("click", async () => {
        if (isCreatingStep || currentStepIndex < 0) return;
        closeDeleteConfirmation();
        detailDelete.disabled = true;
        deleteConfirmOk.disabled = true;
        detailSaveStatus.textContent = "Deleting...";
        detailSaveStatus.className = "detail-save-status";
        try {
            const res = await fetch(`/api/flow/${FLOW_PATH}/step/${currentStepIndex}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Failed to delete step");
            detailSaveStatus.textContent = "✓ Deleted";
            detailSaveStatus.className = "detail-save-status success";
            setTimeout(() => location.reload(), 700);
        } catch (err) {
            detailDelete.disabled = false;
            deleteConfirmOk.disabled = false;
            detailSaveStatus.textContent = "✗ " + err.message;
            detailSaveStatus.className = "detail-save-status error";
        }
    });

    addStepBtn.addEventListener("click", () => {
        showDetail({
            name: "",
            method: "GET",
            url: "",
            manual: false,
            continue_on_error: true,
            delay: 0,
            headers: {},
            print_keys: [],
            condition: [],
            retry: false,
        }, -1, true);
        detailBody.querySelector('[data-field="name"]')?.focus();
    });

    // ── Run chain ────────────────────────────────────────────
    let pollTimer = null;
    let currentRunId = null;

    runBtn.addEventListener("click", async () => {
        runBtn.disabled = true;
        runStatus.textContent = "Starting...";
        runStatus.className = "run-status-badge running";
        pauseBtn.classList.add("hidden");
        resumeBtn.classList.add("hidden");

        stepBoxes.forEach(box => {
            box.className = box.className.replace(/\bstate-\w+/g, "");
            const ind = box.querySelector(".step-result-indicator"); if (ind) ind.remove();
            const sc = box.querySelector(".step-status-code"); if (sc) sc.remove();
            const row = box.parentElement;
            row.querySelectorAll(".side-connector, .eval-side-connector").forEach(panel => panel.remove());
        });
        responsePanel.classList.add("hidden");
        responseList.innerHTML = "";
        currentResponseResults = [];

        try {
            const res = await fetch("/api/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ flow_path: FLOW_PATH }),
            });
            const data = await res.json();
            if (data.error) {
                runStatus.textContent = `Error: ${data.error}`;
                runStatus.className = "run-status-badge error";
                runBtn.disabled = false;
                return;
            }
            currentRunId = data.run_id;
            pauseBtn.classList.remove("hidden");
            pollRunStatus(data.run_id);
        } catch (err) {
            runStatus.textContent = `Error: ${err.message}`;
            runStatus.className = "run-status-badge error";
            runBtn.disabled = false;
        }
    });

    pauseBtn.addEventListener("click", async () => {
        if (!currentRunId) return;
        await fetch(`/api/run/${currentRunId}/pause`, { method: "POST" });
        pauseBtn.classList.add("hidden");
        resumeBtn.classList.remove("hidden");
        runStatus.textContent = "Paused";
        runStatus.className = "run-status-badge running";
    });

    resumeBtn.addEventListener("click", async () => {
        if (!currentRunId) return;
        await fetch(`/api/run/${currentRunId}/resume`, { method: "POST" });
        resumeBtn.classList.add("hidden");
        pauseBtn.classList.remove("hidden");
        runStatus.className = "run-status-badge running";
    });

    function pollRunStatus(runId) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(async () => {
            try {
                const res = await fetch(`/api/run/${runId}`);
                const data = await res.json();
                updateStepStates(data);

                if (data.status === "running") {
                    const done = data.results.length;

                    if (data.waiting_manual) {
                        // Show manual step overlay
                        runStatus.textContent = `Manual Step — waiting`;
                        runStatus.className = "run-status-badge running";
                        pauseBtn.classList.add("hidden");
                        resumeBtn.classList.add("hidden");
                        showManualOverlay(runId, data);
                    } else if (data.paused) {
                        hideManualOverlay();
                        runStatus.textContent = `Paused (${done}/${steps.length})`;
                        pauseBtn.classList.add("hidden");
                        resumeBtn.classList.remove("hidden");
                    } else {
                        hideManualOverlay();
                        runStatus.textContent = `Running ${done}/${steps.length}`;
                        pauseBtn.classList.remove("hidden");
                        resumeBtn.classList.add("hidden");
                    }
                    runStatus.className = "run-status-badge running";
                } else {
                    clearInterval(pollTimer); pollTimer = null; runBtn.disabled = false;
                    currentRunId = null;
                    pauseBtn.classList.add("hidden");
                    resumeBtn.classList.add("hidden");
                    hideManualOverlay();
                    const passed = data.results.filter(r => r.success).length;
                    const failed = data.results.filter(r => !r.success).length;
                    if (data.status === "completed") {
                        runStatus.textContent = `✓ ${passed} passed, ${failed} failed`;
                        runStatus.className = "run-status-badge done";
                    } else {
                        runStatus.textContent = data.error || "Error";
                        runStatus.className = "run-status-badge error";
                    }
                    showResponses(data.results);
                }
            } catch (err) {
                clearInterval(pollTimer); pollTimer = null; runBtn.disabled = false;
                currentRunId = null;
                pauseBtn.classList.add("hidden");
                resumeBtn.classList.add("hidden");
                hideManualOverlay();
                runStatus.textContent = "Poll error";
                runStatus.className = "run-status-badge error";
            }
        }, 1000);
    }

    // ── Manual step overlay ──────────────────────────────────
    let manualOverlayEl = null;

    function showManualOverlay(runId, data) {
        if (manualOverlayEl) return; // already showing

        manualOverlayEl = document.createElement("div");
        manualOverlayEl.className = "manual-overlay";

        const card = document.createElement("div");
        card.className = "manual-card";

        const header = document.createElement("div");
        header.className = "manual-header";
        header.innerHTML = `<span class="manual-status-icon" aria-hidden="true"><span></span><span></span><span></span></span><span class="manual-title">Manual Step - ${esc(data.manual_step_name)}</span>`;
        card.appendChild(header);

        if (data.manual_instruction) {
            const instrBlock = document.createElement("div");
            instrBlock.className = "manual-instruction";
            const lines = data.manual_instruction.split("\n").filter(l => l.trim());
            lines.forEach(line => {
                const p = document.createElement("p");
                p.textContent = line;
                instrBlock.appendChild(p);
            });
            card.appendChild(instrBlock);
        }

        if (data.manual_print_ref && Object.keys(data.manual_print_ref).length) {
            const refBlock = document.createElement("div");
            refBlock.className = "manual-refs";
            for (const [k, v] of Object.entries(data.manual_print_ref)) {
                const row = document.createElement("div");
                row.className = "manual-ref-row";
                const key = document.createElement("div");
                key.className = "manual-ref-key";
                key.textContent = k;
                row.appendChild(key);
                row.appendChild(renderBoundedValue(v, { className: "manual-ref-val manual-ref-value", label: `reference ${k}`, truncate: true }));
                refBlock.appendChild(row);
            }
            card.appendChild(refBlock);
        }

        const btn = document.createElement("button");
        btn.className = "btn btn-primary manual-done-btn";
        btn.innerHTML = `<svg class="icon icon-sm" style="margin-right:0.4rem"><use href="#i-play"/></svg> Mark as Done & Continue`;
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            btn.textContent = "Continuing...";
            try {
                await fetch(`/api/run/${runId}/manual-done`, { method: "POST" });
            } catch (e) { /* poll will pick up the state change */ }
        });
        card.appendChild(btn);

        manualOverlayEl.appendChild(card);
        document.querySelector(".main-content").appendChild(manualOverlayEl);
    }

    function hideManualOverlay() {
        if (manualOverlayEl) {
            manualOverlayEl.remove();
            manualOverlayEl = null;
        }
    }

    function statusClass(code) {
        if (code >= 200 && code < 300) return "2xx";
        if (code >= 300 && code < 400) return "3xx";
        if (code >= 400 && code < 500) return "4xx";
        if (code >= 500) return "5xx";
        return "err";
    }

    function updateStepStates(data) {
        const results = data.results;
        stepBoxes.forEach((box, i) => {
            box.className = box.className.replace(/\bstate-\w+/g, "");
            let el = box.querySelector(".step-result-indicator"); if (el) el.remove();
            el = box.querySelector(".step-status-code"); if (el) el.remove();

            const row = box.parentElement;

            if (i < results.length) {
                const r = results[i];
                if (r.skipped) { box.classList.add("state-skipped"); addIndicator(box, "—", "skipped"); }
                else if (r.success) { box.classList.add("state-passed"); addIndicator(box, "✓", "passed"); }
                else { box.classList.add("state-failed"); addIndicator(box, "✗", "failed"); }
                if (r.status_code && r.status_code > 0) {
                    const sc = document.createElement("span");
                    sc.className = `step-status-code status-${statusClass(r.status_code)}`;
                    sc.textContent = r.status_code;
                    box.appendChild(sc);
                }

                // Render evaluation messages to the left and printed keys to the right.
                // The two surfaces stay independent so each can be bounded and scrolled.
                const hasPK = r.printed_keys && Object.keys(r.printed_keys).some(k => {
                    const v = r.printed_keys[k];
                    return v !== undefined && v !== null && v !== "" && v !== "—" && v !== "null";
                });
                const hasMsg = r.eval_message;

                if (hasMsg && !row.querySelector(".eval-side-connector")) {
                    const evalWrap = document.createElement("div");
                    evalWrap.className = "eval-side-connector";
                    evalWrap.addEventListener("click", (e) => e.stopPropagation());
                    const evalContent = document.createElement("div");
                    evalContent.className = "eval-side-content";
                    const evalBox = document.createElement("div");
                    evalBox.className = "eval-box";
                    const msg = document.createElement("div");
                    msg.className = `eval-msg eval-msg-${r.eval_message.type}`;
                    msg.textContent = r.eval_message.text;
                    evalBox.appendChild(msg);
                    evalContent.appendChild(evalBox);
                    const evalLine = document.createElement("div");
                    evalLine.className = "eval-line";
                    evalWrap.appendChild(evalContent);
                    evalWrap.appendChild(evalLine);
                    row.insertBefore(evalWrap, box);
                }

                if (hasPK && !row.querySelector(".side-connector")) {
                    const wrap = document.createElement("div");
                    wrap.className = "side-connector";
                    wrap.addEventListener("click", (e) => e.stopPropagation());

                    const line = document.createElement("div");
                    line.className = "pk-line";
                    wrap.appendChild(line);

                    const content = document.createElement("div");
                    content.className = "side-content";
                    const pkBox = document.createElement("div");
                    pkBox.className = "pk-box";
                    const pkHeader = document.createElement("div");
                    pkHeader.className = "pk-header";
                    pkHeader.innerHTML = "<span>Parameters</span><span>Value</span>";
                    pkBox.appendChild(pkHeader);

                    for (const [k, v] of Object.entries(r.printed_keys)) {
                        if (v === undefined || v === null || v === "—") continue;
                        const entry = document.createElement("div");
                        entry.className = "pk-entry";
                        entry.innerHTML = `<span class="pk-key-name" title="${esc(k)}">${esc(k)}</span><span class="pk-key-val" title="Copy value">${esc(String(v))}</span>`;
                        const keyValue = entry.querySelector(".pk-key-val");
                        const rawValue = String(v);
                        keyValue.dataset.tooltip = rawValue;
                        keyValue.title = rawValue;
                        attachFloatingTooltip(keyValue);
                        let copyTimer;
                        keyValue.addEventListener("click", function() {
                            const clipboard = navigator.clipboard;
                            if (!clipboard || typeof clipboard.writeText !== "function") {
                                keyValue.dataset.tooltip = "Copy failed";
                                keyValue.title = "Copy failed";
                                keyValue._refreshTooltip();
                                return;
                            }
                            clipboard.writeText(rawValue).then(() => {
                                keyValue.classList.add("pk-copied");
                                keyValue.dataset.tooltip = "Copied";
                                keyValue.title = "Copied";
                                keyValue._refreshTooltip();
                                clearTimeout(copyTimer);
                                copyTimer = setTimeout(() => {
                                    keyValue.classList.remove("pk-copied");
                                    keyValue.dataset.tooltip = rawValue;
                                    keyValue.title = rawValue;
                                    if (keyValue._refreshTooltip) keyValue._refreshTooltip();
                                }, 1400);
                            }).catch(() => {
                                keyValue.dataset.tooltip = "Copy failed";
                                keyValue.title = "Copy failed";
                                keyValue._refreshTooltip();
                            });
                        });
                        pkBox.appendChild(entry);
                    }
                    content.appendChild(pkBox);
                    wrap.appendChild(content);
                    row.appendChild(wrap);
                }
            } else if (data.status === "running" && i === results.length) {
                if (data.waiting_manual) {
                    box.classList.add("state-manual");
                    addIndicator(box, "✋", "manual");
                } else {
                    box.classList.add("state-running");
                }
            }
        });
    }

    function addIndicator(box, text, cls) {
        const el = document.createElement("span");
        el.className = `step-result-indicator ${cls}`;
        el.textContent = text;
        box.appendChild(el);
    }

    // ── Response panel ───────────────────────────────────────
    function responseDisplayText(result) {
        return result.response_body || result.error || (result.manual ? "Manual step" : result.skipped ? "Skipped" : "—");
    }

    function responseDisplayTime(timestamp) {
        if (!timestamp) return "—";
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return String(timestamp);
        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        });
    }

    function responseExportRows(results) {
        return results.map(result => [
            result.step_name || "",
            result.status_code > 0 ? result.status_code : (result.skipped ? "SKIP" : "ERR"),
            responseDisplayTime(result.executed_at),
            result.duration_ms > 0 ? `${result.duration_ms}ms` : "—",
            responseDisplayText(result),
        ]);
    }

    function csvCell(value) {
        return `"${String(value ?? "").replace(/"/g, '""')}"`;
    }

    function safeDownloadName(extension) {
        const name = String(CHAIN_DATA.name || "api-chain-run")
            .trim()
            .replace(/[^a-z0-9._-]+/gi, "-")
            .replace(/^-+|-+$/g, "") || "api-chain-run";
        return `${name}-step-responses.${extension}`;
    }

    function downloadResponseFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function downloadResponsesCsv() {
        const rows = [["Step", "Status", "Executed At", "Duration", "Response"], ...responseExportRows(currentResponseResults)];
        const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
        downloadResponseFile(`\uFEFF${csv}`, safeDownloadName("csv"), "text/csv;charset=utf-8");
    }

    function showResponses(results) {
        currentResponseResults = Array.isArray(results) ? results : [];
        if (!currentResponseResults.length) return;
        responseList.innerHTML = "";
        const table = document.createElement("table");
        table.className = "response-table";
        table.innerHTML = `<thead><tr>
            <th class="col-step">Step</th>
            <th class="col-status">Status</th>
            <th class="col-executed">Executed At</th>
            <th class="col-time">Duration</th>
            <th>Response</th>
        </tr></thead>`;
        const tbody = document.createElement("tbody");
        results.forEach(r => {
            const sc = statusClass(r.status_code || -1);
            const tr = document.createElement("tr");
            const tdStep = document.createElement("td");
            tdStep.className = "col-step";
            tdStep.textContent = r.step_name;
            tdStep.title = r.step_name;

            const tdStatus = document.createElement("td");
            tdStatus.className = `col-status s-${sc}`;
            tdStatus.textContent = r.status_code > 0 ? r.status_code : (r.skipped ? "SKIP" : "ERR");

            const tdExecuted = document.createElement("td");
            tdExecuted.className = "col-executed";
            tdExecuted.textContent = responseDisplayTime(r.executed_at);
            tdExecuted.title = tdExecuted.textContent;

            const tdTime = document.createElement("td");
            tdTime.className = "col-time";
            tdTime.textContent = r.duration_ms > 0 ? r.duration_ms + "ms" : "—";

            const tdBody = document.createElement("td");
            tdBody.className = "col-body";
            const bodyText = responseDisplayText(r);
            tdBody.appendChild(renderBoundedValue(bodyText, { className: "response-value response-pre-wrap", label: "response" }));

            tr.appendChild(tdStep);
            tr.appendChild(tdStatus);
            tr.appendChild(tdExecuted);
            tr.appendChild(tdTime);
            tr.appendChild(tdBody);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        responseList.appendChild(table);
        responsePanel.classList.remove("hidden");
    }

    responseClose.addEventListener("click", () => responsePanel.classList.add("hidden"));
    responseDownloadCsv.addEventListener("click", downloadResponsesCsv);

    // ── Inline YAML Editor toggle ────────────────────────────
    const editToggleBtn = document.getElementById("edit-toggle-btn");
    const editorSaveBtn = document.getElementById("editor-save-btn");
    const editorCancelBtn = document.getElementById("editor-cancel-btn");
    const editorStatusEl = document.getElementById("editor-status");
    const flowViewSection = document.getElementById("flow-view-section");
    const editorSection = document.getElementById("editor-section");
    let editorMode = false;
    // ── Monaco Editor Setup ────────────────────────────
    let monacoEditor;
    const monacoContainer = document.getElementById("monaco-container");

    if (window.require) {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
        require(['vs/editor/editor.main'], function() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || !document.documentElement.hasAttribute('data-theme');
            monacoEditor = monaco.editor.create(monacoContainer, {
                value: '',
                language: 'yaml',
                theme: isDark ? 'vs-dark' : 'vs',
                automaticLayout: true,
                fontSize: 13,
                fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                lineHeight: 20,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 10 }
            });

            // Sync theme when data-theme attribute changes
            const observer = new MutationObserver(() => {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            window.addEventListener("keydown", (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                    if (editorMode) {
                        e.preventDefault();
                        editorSaveBtn.click();
                    }
                }
            });
        });
    }

    editToggleBtn.addEventListener("click", async () => {
        if (!editorMode) {
            try {
                const res = await fetch(`/api/flow/${FLOW_PATH}/raw`);
                const data = await res.json();
                if (monacoEditor) {
                  monacoEditor.setValue(data.content);
                }
            } catch (err) { return; }
            flowViewSection.classList.add("hidden");
            editorSection.classList.remove("hidden");
            editToggleBtn.classList.add("hidden");
            editorSaveBtn.classList.remove("hidden");
            editorCancelBtn.classList.remove("hidden");
            editorMode = true;
        }
    });

    editorCancelBtn.addEventListener("click", () => {
        editorSection.classList.add("hidden");
        flowViewSection.classList.remove("hidden");
        editToggleBtn.classList.remove("hidden");
        editorSaveBtn.classList.add("hidden");
        editorCancelBtn.classList.add("hidden");
        editorStatusEl.textContent = "";
        editorMode = false;
    });

    editorSaveBtn.addEventListener("click", async () => {
        if (!monacoEditor) return;
        editorStatusEl.textContent = "Saving...";
        editorStatusEl.className = "detail-save-status";
        try {
            const content = monacoEditor.getValue();
            const res = await fetch(`/api/flow/${FLOW_PATH}/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            const data = await res.json();
            if (data.success) {
                editorStatusEl.textContent = "Saved";
                editorStatusEl.className = "detail-save-status success";
                setTimeout(() => location.reload(), 1000);
            } else {
                editorStatusEl.textContent = data.error || "Failed";
                editorStatusEl.className = "detail-save-status error";
            }
        } catch (err) {
            editorStatusEl.textContent = err.message;
            editorStatusEl.className = "detail-save-status error";
        }
    });

    // ── Init ─────────────────────────────────────────────────
    renderFlow();
})();
