/* theme.js — Dark/Light mode toggle with persistence */
(function () {
    const html = document.documentElement;
    const stored = localStorage.getItem("acr-theme");
    if (stored) html.setAttribute("data-theme", stored);

    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    btn.addEventListener("click", () => {
        const current = html.getAttribute("data-theme") || "dark";
        const next = current === "dark" ? "light" : "dark";
        html.setAttribute("data-theme", next);
        localStorage.setItem("acr-theme", next);
    });
})();
