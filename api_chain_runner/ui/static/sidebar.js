/* sidebar.js — conditional disclosure for overflowing file names */
(function () {
    const items = Array.from(document.querySelectorAll(".nav-file-item"));
    if (!items.length) return;

    const updateDisclosure = () => {
        items.forEach((item) => {
            const label = item.querySelector(".nav-file-name");
            if (!label) return;

            const rawName = item.dataset.fileName;
            if (typeof rawName !== "string") return;

            if (label.scrollWidth > label.clientWidth) {
                item.setAttribute("title", rawName);
                item.setAttribute("aria-label", rawName);
            } else {
                item.removeAttribute("title");
                item.removeAttribute("aria-label");
            }
        });
    };

    updateDisclosure();
    window.addEventListener("resize", updateDisclosure);

    if (typeof ResizeObserver === "function") {
        const observer = new ResizeObserver(updateDisclosure);
        items.forEach((item) => {
            const label = item.querySelector(".nav-file-name");
            if (label) observer.observe(label);
        });
    }
})();
