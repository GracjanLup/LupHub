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
    const progressWrap = document.getElementById("wano-progress");
    const progressFill = document.getElementById("wano-progress-fill");
    const progressText = document.getElementById("wano-progress-text");
    const downloadPlBtn = document.getElementById("download-latest-pl");
    const downloadEnBtn = document.getElementById("download-latest-en");
    const allowedExt = ["xlsm", "xlsx"];

    let versions = [];
    let latestPdfs = { pl: null, en: null };

    function formatDate(d = new Date()) {
        const pad = (v) => String(v).padStart(2, "0");
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} godz. ${pad(d.getHours())}:${pad(
            d.getMinutes()
        )}`;
    }

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
                    <span><a href="${row.href}" download>${row.file}</a></span>
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

    function showProgress() {
        if (progressWrap) progressWrap.hidden = false;
        if (progressFill) progressFill.style.width = "0%";
        if (progressText) progressText.textContent = "0%";
    }

    function updateProgress(percent) {
        const pct = Math.min(100, Math.max(0, Math.round(percent)));
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `${pct}%`;
    }

    function hideProgress() {
        if (progressWrap) progressWrap.hidden = true;
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
            if (payload.download) {
                window.location.href = payload.download;
            }
            await loadVersions();
            await loadLatestPdfs();
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Wystąpił błąd.";
            setStatus(`❌ ${message}`, "error");
        } finally {
            setLoading(false);
        }
    }

    function validateFile(file) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !allowedExt.includes(ext)) {
            throw new Error("Dozwolone pliki: .xlsm lub .xlsx");
        }
    }

    async function uploadFile(file) {
        setStatus(`Wgrywam "${file.name}"...`);
        setLoading(true);
        showProgress();

        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/wano/upload");

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                updateProgress(percent);
            }
        };

        xhr.onload = () => {
            hideProgress();
            setLoading(false);
            if (fileInput) fileInput.value = "";

            try {
                const payload = JSON.parse(xhr.responseText || "{}");
                if (xhr.status < 200 || xhr.status >= 300) {
                    const detail = payload.detail || payload.message || "Błąd wgrywania pliku.";
                    throw new Error(detail);
                }

                const savedName = payload.filename || payload.saved || file.name;
                setStatus(`Wgrano: ${savedName}`);
                loadVersions();
                loadLatestPdfs();
            } catch (error) {
                console.error(error);
                const message = error instanceof Error ? error.message : "Wystąpił błąd.";
                setStatus(`❌ ${message}`, "error");
            }
        };

        xhr.onerror = () => {
            hideProgress();
            setLoading(false);
            if (fileInput) fileInput.value = "";
            setStatus("❌ Błąd wgrywania pliku (połączenie).", "error");
        };

        xhr.send(formData);
    }

    function handleFileSelect(file) {
        if (!file) return;
        try {
            validateFile(file);
            uploadFile(file);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Błąd wgrywania pliku.";
            setStatus(`❌ ${message}`, "error");
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
        if (file) handleFileSelect(file);
    });

    fileInput?.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        handleFileSelect(file);
    });

    async function loadVersions() {
        try {
            const response = await fetch("/api/wano/files");
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = payload.detail || payload.message || "Nie udało się pobrać listy plików.";
                throw new Error(detail);
            }
            versions = Array.isArray(payload.files) ? payload.files : [];
            renderTable(versions);
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Błąd odczytu plików.";
            setStatus(`❌ ${message}`, "error");
            renderTable([]);
        }
    }

    async function loadLatestPdfs() {
        try {
            const response = await fetch("/api/wano/latest-pdfs");
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = payload.detail || payload.message || "Nie udało się pobrać najnowszych PDF.";
                throw new Error(detail);
            }
            latestPdfs = payload;
            updateDownloadButtons();
        } catch (error) {
            console.error(error);
            if (downloadPlBtn) downloadPlBtn.disabled = true;
            if (downloadEnBtn) downloadEnBtn.disabled = true;
        }
    }

    function updateDownloadButtons() {
        const applyBtnState = (btn, entry, labelPrefix) => {
            if (!btn) return;
            if (!entry || !entry.href) {
                btn.textContent = `${labelPrefix} - brak pliku`;
                btn.disabled = true;
                btn.removeAttribute("data-href");
                return;
            }
            const dateLabel = entry.date || "";
            btn.textContent = `${labelPrefix} z dnia ${dateLabel}`;
            btn.disabled = false;
            btn.setAttribute("data-href", entry.href);
        };

        applyBtnState(downloadPlBtn, latestPdfs.pl, "Pobierz najnowszy plik PL");
        applyBtnState(downloadEnBtn, latestPdfs.en, "Pobierz najnowszy plik EN");
    }

    function wireDownloadButtons() {
        downloadPlBtn?.addEventListener("click", () => {
            const href = downloadPlBtn.getAttribute("data-href");
            if (href) window.location.href = href;
        });
        downloadEnBtn?.addEventListener("click", () => {
            const href = downloadEnBtn.getAttribute("data-href");
            if (href) window.location.href = href;
        });
    }

    loadVersions();
    loadLatestPdfs();
    wireDownloadButtons();
})();
