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
    const detailSave = document.getElementById("detail-save");
    const detailSaveStatus = document.getElementById("detail-save-status");
    const responsePanel = document.getElementById("response-panel");
    const responseList = document.getElementById("response-list");
    const responseClose = document.getElementById("response-close");
    const editorPanel = document.getElementById("editor-panel");
    const editorToggle = document.getElementById("nav-editor-toggle");
    const editorSave = document.getElementById("editor-save");
    const editorCancel = document.getElementById("editor-cancel");
    const editorStatus = document.getElementById("editor-status");
    const yamlEditor = document.getElementById("yaml-editor");

    const steps = CHAIN_DATA.steps;
    const stepBoxes = [];
    let currentStepIndex = -1;

    // ── Render VERTICAL flow ─────────────────────────────────
    function renderFlow() {
        canvas.innerHTML = "";
        stepBoxes.length = 0;

        steps.forEach((step, i) => {
            const node = document.createElement("div");
            node.className = "step-node";
            node.dataset.index = i;

            // Wrap box + print_keys in a row container
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

            const pkHint = (step.print_keys && step.print_keys.length)
                ? `<div class="step-pk-hint">📋 ${step.print_keys.map(k => esc(k)).join(", ")}</div>` : "";

            box.innerHTML = `
                <span class="method-badge">${esc(step.method.toUpperCase())}</span>
                <div class="step-name">${esc(step.name)}</div>
                ${tags.length ? `<div class="step-tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
                ${pkHint}
            `;

            row.appendChild(box);

            node.appendChild(row);
            const idx = document.createElement("div");
            idx.className = "step-index";
            idx.textContent = `Step ${i + 1}`;
            node.appendChild(idx);

            node.addEventListener("click", (e) => { e.stopPropagation(); showDetail(step, i); });
            canvas.appendChild(node);
            stepBoxes.push(box);

            // Vertical arrow between steps
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
    function showDetail(step, index) {
        currentStepIndex = index;
        detailName.textContent = step.name;
        detailSaveStatus.textContent = "";
        detailSaveStatus.className = "detail-save-status";

        let html = "";
        html += readonlyRow("Method", step.method.toUpperCase());
        html += editableRow("url", "URL", step.url || "");
        if (step.delay > 0) html += readonlyRow("Delay", `${step.delay}s`);
        html += readonlyRow("Continue on Error", step.continue_on_error ? "Yes" : "No");

        if (step.headers && Object.keys(step.headers).length)
            html += editableRow("headers", "Headers", JSON.stringify(step.headers, null, 2));
        if (step.payload)
            html += editableRow("payload", "Payload", JSON.stringify(step.payload, null, 2));
        if (step.unique_fields)
            html += editableRow("unique_fields", "Unique Fields", JSON.stringify(step.unique_fields, null, 2));
        if (step.files)
            html += readonlyRow("Files", JSON.stringify(step.files, null, 2));
        if (step.print_keys && step.print_keys.length)
            html += readonlyRow("Print Keys", step.print_keys.join(", "));
        if (step.has_polling && step.polling) {
            const p = step.polling;
            html += readonlyRow("Polling", [
                p.key_path ? `Path: ${p.key_path}` : "Until 2xx",
                p.expected_values && p.expected_values.length ? `Expected: ${p.expected_values.join(", ")}` : "",
                `Interval: ${p.interval}s`, `Timeout: ${p.max_timeout}s`,
            ].filter(Boolean).join("\n"));
        }

        detailBody.innerHTML = html;
        detailOverlay.classList.remove("hidden");
    }

    function readonlyRow(label, value) {
        return `<div class="detail-row">
            <div class="detail-label">${esc(label)}</div>
            <div class="detail-value">${esc(String(value))}</div>
        </div>`;
    }

    function editableRow(field, label, value) {
        return `<div class="detail-row">
            <div class="detail-label">${esc(label)} <span style="color:var(--accent);font-size:0.6rem;">✎ editable</span></div>
            <textarea class="detail-editable" data-field="${esc(field)}" spellcheck="false">${esc(String(value))}</textarea>
        </div>`;
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
        if (currentStepIndex < 0) return;
        const editables = detailBody.querySelectorAll(".detail-editable");
        const updates = {};

        for (const el of editables) {
            const field = el.dataset.field;
            const raw = el.value.trim();
            if (field === "url") {
                updates[field] = raw;
            } else {
                // Parse JSON fields
                try {
                    updates[field] = JSON.parse(raw);
                } catch (err) {
                    detailSaveStatus.textContent = `✗ Invalid JSON in ${field}`;
                    detailSaveStatus.className = "detail-save-status error";
                    return;
                }
            }
        }

        detailSaveStatus.textContent = "Saving...";
        detailSaveStatus.className = "detail-save-status";

        try {
            const res = await fetch(`/api/flow/${FLOW_PATH}/step/${currentStepIndex}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ updates }),
            });
            const data = await res.json();
            if (data.success) {
                detailSaveStatus.textContent = "✓ Saved";
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
        });
        responsePanel.classList.add("hidden");
        responseList.innerHTML = "";

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
                    if (data.paused) {
                        runStatus.textContent = `Paused (${done}/${steps.length})`;
                        pauseBtn.classList.add("hidden");
                        resumeBtn.classList.remove("hidden");
                    } else {
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
                runStatus.textContent = "Poll error";
                runStatus.className = "run-status-badge error";
            }
        }, 1000);
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
                // Show printed key values — only add once, skip if already present
                if (r.printed_keys && Object.keys(r.printed_keys).length && !row.querySelector(".print-keys-connector")) {
                    const pkWrap = document.createElement("div");
                    pkWrap.className = "print-keys-connector";
                    const line = document.createElement("div");
                    line.className = "pk-line";
                    const pkBox = document.createElement("div");
                    pkBox.className = "pk-box";
                    let html = "";
                    for (const [k, v] of Object.entries(r.printed_keys)) {
                        html += `<div class="pk-entry"><span class="pk-key-name">${esc(k)}</span><span class="pk-key-val">${esc(v || "null")}</span></div>`;
                    }
                    pkBox.innerHTML = html;
                    pkWrap.appendChild(line);
                    pkWrap.appendChild(pkBox);
                    row.appendChild(pkWrap);
                }
            } else if (data.status === "running" && i === results.length) {
                box.classList.add("state-running");
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
    function showResponses(results) {
        if (!results || !results.length) return;
        responseList.innerHTML = "";
        const table = document.createElement("table");
        table.className = "response-table";
        table.innerHTML = `<thead><tr>
            <th class="col-step">Step</th>
            <th class="col-status">Status</th>
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

            const tdTime = document.createElement("td");
            tdTime.className = "col-time";
            tdTime.textContent = r.duration_ms > 0 ? r.duration_ms + "ms" : "—";

            const tdBody = document.createElement("td");
            tdBody.className = "col-body";
            const pre = document.createElement("pre");
            pre.textContent = r.response_body || r.error || (r.manual ? "Manual step" : r.skipped ? "Skipped" : "—");
            tdBody.appendChild(pre);

            tr.appendChild(tdStep);
            tr.appendChild(tdStatus);
            tr.appendChild(tdTime);
            tr.appendChild(tdBody);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        responseList.appendChild(table);
        responsePanel.classList.remove("hidden");
    }

    responseClose.addEventListener("click", () => responsePanel.classList.add("hidden"));

    // ── YAML Editor ──────────────────────────────────────────
    let editorOpen = false;
    editorToggle.addEventListener("click", async (e) => {
        e.preventDefault();
        if (editorOpen) { editorPanel.classList.add("hidden"); editorOpen = false; return; }
        try {
            const res = await fetch(`/api/flow/${FLOW_PATH}/raw`);
            const data = await res.json();
            yamlEditor.value = data.content;
            editorPanel.classList.remove("hidden");
            editorOpen = true;
            editorStatus.className = "editor-status"; editorStatus.textContent = "";
        } catch (err) { alert("Failed to load YAML: " + err.message); }
    });
    editorCancel.addEventListener("click", () => { editorPanel.classList.add("hidden"); editorOpen = false; });
    editorSave.addEventListener("click", async () => {
        editorStatus.className = "editor-status"; editorStatus.textContent = "Saving...";
        try {
            const res = await fetch(`/api/flow/${FLOW_PATH}/save`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: yamlEditor.value }),
            });
            const data = await res.json();
            if (data.success) {
                editorStatus.className = "editor-status success";
                editorStatus.textContent = "✓ Saved. Reloading...";
                setTimeout(() => location.reload(), 1500);
            } else {
                editorStatus.className = "editor-status error";
                editorStatus.textContent = "✗ " + (data.error || "Save failed");
            }
        } catch (err) {
            editorStatus.className = "editor-status error";
            editorStatus.textContent = "✗ " + err.message;
        }
    });
    yamlEditor.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const s = yamlEditor.selectionStart, end = yamlEditor.selectionEnd;
            yamlEditor.value = yamlEditor.value.substring(0, s) + "  " + yamlEditor.value.substring(end);
            yamlEditor.selectionStart = yamlEditor.selectionEnd = s + 2;
        }
    });

    // ── Init ─────────────────────────────────────────────────
    renderFlow();
})();
