/* create.js — New flow creation modal logic */
(function () {
    const modal = document.getElementById("create-modal");
    const openBtn = document.getElementById("create-flow-btn");
    const closeBtn = document.getElementById("create-modal-close");
    const cancelBtn = document.getElementById("create-cancel");
    const submitBtn = document.getElementById("create-submit");
    const addStepBtn = document.getElementById("add-step-btn");
    const stepsContainer = document.getElementById("new-flow-steps");
    const statusEl = document.getElementById("create-status");

    if (!modal || !openBtn) return;

    openBtn.addEventListener("click", () => modal.classList.remove("hidden"));
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.add("hidden");
    });

    addStepBtn.addEventListener("click", () => {
        const row = document.createElement("div");
        row.className = "new-step-row";
        row.innerHTML = `
            <input type="text" class="form-input form-input-sm" placeholder="Step name">
            <select class="form-select form-input-sm">
                <option>POST</option><option>GET</option><option>PUT</option>
                <option>DELETE</option><option>PATCH</option>
            </select>`;
        stepsContainer.appendChild(row);
    });

    submitBtn.addEventListener("click", async () => {
        const name = document.getElementById("new-flow-name").value.trim();
        const folder = document.getElementById("new-flow-folder").value.trim();

        if (!name) {
            statusEl.textContent = "Flow name is required";
            statusEl.className = "create-status error";
            return;
        }

        const rows = stepsContainer.querySelectorAll(".new-step-row");
        const steps = [];
        rows.forEach(row => {
            const nameInput = row.querySelector("input");
            const methodSelect = row.querySelector("select");
            const stepName = nameInput.value.trim();
            if (stepName) {
                steps.push({ name: stepName, method: methodSelect.value });
            }
        });

        if (steps.length === 0) {
            statusEl.textContent = "Add at least one step";
            statusEl.className = "create-status error";
            return;
        }

        statusEl.textContent = "Creating...";
        statusEl.className = "create-status";

        try {
            const res = await fetch("/api/flow/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, folder, steps }),
            });
            const data = await res.json();
            if (data.success) {
                statusEl.textContent = "Created! Redirecting...";
                statusEl.className = "create-status success";
                setTimeout(() => {
                    window.location.href = "/flow/" + data.path;
                }, 800);
            } else {
                statusEl.textContent = data.error || "Failed to create";
                statusEl.className = "create-status error";
            }
        } catch (err) {
            statusEl.textContent = err.message;
            statusEl.className = "create-status error";
        }
    });
})();
