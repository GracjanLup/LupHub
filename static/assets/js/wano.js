(() => {
    const statusEl = document.getElementById("wano-status");
    if (!statusEl) {
        return;
    }

    const plBtn = document.getElementById("generate-pl");
    const enBtn = document.getElementById("generate-en");
    const dropzone = document.getElementById("wano-dropzone");
    const fileInput = document.getElementById("wano-file-input");
    const tableBody = document.getElementById("wano-table-body");

    const mockVersions = [
        {
            file: "Cennik Partnera WANO.xlsm",
            info: "bla bla bla bla",
            date: "11.17.2025 godz. 18:01",
            href: "#",
        },
        {
            file: "Cennik_WANO_v1.xlsx",
            info: "Wersja testowa (prototyp)",
            date: "10.02.2024 godz. 09:15",
            href: "#",
        },
    ];

    function renderTable(rows) {
        if (!tableBody) return;
        if (!rows.length) {
            tableBody.innerHTML = `<div class="wano-table-row"><span>Brak wersji</span><span>-</span><span>-</span></div>`;
            return;
        }

        tableBody.innerHTML = rows
            .map(
                (row) => `
                <div class="wano-table-row">
                    <span><a href="${row.href}">${row.file}</a></span>
                    <span>${row.info}</span>
                    <span>${row.date}</span>
                </div>
            `
            )
            .join("");
    }

    function setStatus(message, type = "normal") {
        statusEl.textContent = message;
        statusEl.classList.toggle("error", type === "error");
    }

    function setLoading(isLoading) {
        [plBtn, enBtn].forEach((btn) => {
            if (btn) btn.disabled = isLoading;
        });
        dropzone?.classList.toggle("disabled", isLoading);
    }

    async function triggerGeneration(language) {
        setLoading(true);
        setStatus(`Generuję cennik ${language.toUpperCase()}...`);

        try {
            const response = await fetch(`/api/wano/generate/${language}`, {
                method: "POST",
            });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                const detail = payload.detail || payload.message || "Błąd generowania.";
                throw new Error(detail);
            }

            const filename = payload.output || payload.file || payload.path || "Plik PDF";
            setStatus(`✅ Gotowe: ${filename}`);
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Wystąpił błąd.";
            setStatus(`❌ ${message}`, "error");
        } finally {
            setLoading(false);
        }
    }

    plBtn?.addEventListener("click", () => triggerGeneration("pl"));
    enBtn?.addEventListener("click", () => triggerGeneration("en"));

    dropzone?.addEventListener("click", () => fileInput?.click());

    dropzone?.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropzone.classList.add("dragover");
    });

    dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

    dropzone?.addEventListener("drop", (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragover");
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            setStatus(`Plik "${file.name}" — wgrywanie w przygotowaniu.`);
        }
    });

    fileInput?.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        setStatus(`Plik "${file.name}" — wgrywanie w przygotowaniu.`);
    });

    renderTable(mockVersions);
})();
