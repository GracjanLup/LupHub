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
    const genProgressWrap = document.getElementById("wano-progress-generate");
    const genProgressFill = document.getElementById("wano-progress-generate-fill");
    const genProgressText = document.getElementById("wano-progress-generate-text");
    const genProgressTimerText = document.getElementById("wano-progress-generate-timer");
    const cancelWrap = document.getElementById("wano-cancel-wrapper");
    const cancelBtn = document.getElementById("wano-cancel-btn");
    const uploadProgressWrap = document.getElementById("wano-progress-upload");
    const uploadProgressFill = document.getElementById("wano-progress-upload-fill");
    const uploadProgressText = document.getElementById("wano-progress-upload-text");
    const infoForm = document.getElementById("wano-info-form");
    const infoInput = document.getElementById("wano-info-input");
    const infoSubmit = document.getElementById("wano-info-submit");
    const infoFilename = document.getElementById("wano-info-filename");
    const downloadPlBtn = document.getElementById("download-latest-pl");
    const downloadEnBtn = document.getElementById("download-latest-en");
    const pdfDropzone = document.getElementById("wano-pdf-dropzone");
    const pdfInput = document.getElementById("wano-pdf-input");
    const pdfList = document.getElementById("wano-pdf-list");
    const pdfStatusEl = document.getElementById("wano-pdf-status");
    const allowedExt = ["xlsm", "xlsx"];
    const allowedPdfExt = ["pdf"];
    const PDF_ICON_SRC = "/static/images/pdf.png";

    let versions = [];
    let latestPdfs = { pl: null, en: null };
    const GEN_PROGRESS_INTERVAL = 3000; // 3 s na 1%
    const GEN_PROGRESS_MAX = 99;
    const GEN_TOTAL_MS = 300000; // 5 min
    const STAGE_PRIORITY = { start: 0, export: 1, merge: 2, done: 3, error: 4 };
    const STAGE_TEXT = {
        start: "Przygotowanie pliku...",
        export: "Eksport arkuszy...",
        merge: "Scalanie PDF...",
        done: "Finalizowanie PDF...",
    };
    let progressPoller = null;
    const PROGRESS_POLL_INTERVAL = 2500;
    let genProgressTimer = null;
    let genProgressValue = 0;
    let currentGenLanguage = null;
    let generationActive = false;
    let genStartTime = null;
    let genTimerInterval = null;
    let uploadedFilename = null;
    let pendingInfoText = null;
    let uploadInProgress = false;
    let cancelRequested = false;
    let cancelInFlight = false;
    let lastProgressPriority = -1;
    let progressStartMarker = 0;
    let pdfLibrary = [];

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

    function showProgress(wrapper, fill, text, percent = 0) {
        if (!wrapper) return;
        wrapper.hidden = false;
        if (fill) fill.style.width = `${percent}%`;
        if (text) text.textContent = `${percent}%`;
    }

    function updateProgressBar(fill, text, percent) {
        const pct = Math.min(100, Math.max(0, Math.round(percent)));
        if (fill) fill.style.width = `${pct}%`;
        if (text) text.textContent = `${pct}%`;
    }

    function hideProgress(wrapper) {
        if (wrapper) wrapper.hidden = true;
    }

    function setPdfStatus(message, type = "normal") {
        if (!pdfStatusEl) return;
        pdfStatusEl.textContent = message || "";
        pdfStatusEl.classList.toggle("error", type === "error");
    }

    function chunkIntoColumns(items, columns = 3) {
        const normalized = Array.from({ length: columns }, () => []);
        items.forEach((item, index) => {
            normalized[index % columns].push(item);
        });
        return normalized;
    }

    function renderPdfLibrary(files = []) {
        if (!pdfList) return;
        if (!files.length) {
            pdfList.innerHTML = `
                <div class="wano-pdf-column">
                    <span class="wano-drop-sub">Brak plików PDF w katalogu.</span>
                </div>
            `;
            return;
        }

        const columns = chunkIntoColumns(files, 3);
        pdfList.innerHTML = columns
            .map(
                (column, columnIndex) => `
                <div class="wano-pdf-column" data-column="${columnIndex + 1}">
                    ${
                        column.length
                            ? column
                                  .map(
                                      (entry) => `
                            <div class="wano-pdf-item">
                                <img src="${PDF_ICON_SRC}" alt="PDF" loading="lazy" />
                                <a href="${entry.href}" download="${entry.file}">${entry.file}</a>
                            </div>
                        `
                                  )
                                  .join("")
                            : `<span class="wano-drop-sub">Brak plików</span>`
                    }
                </div>
            `
            )
            .join("");
    }

    async function loadPdfLibrary() {
        if (!pdfList) return;
        try {
            const response = await fetch("/api/wano/pdf-library");
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = payload.detail || payload.message || "Nie udało się pobrać listy PDF.";
                throw new Error(detail);
            }
            pdfLibrary = Array.isArray(payload.files) ? payload.files : [];
            renderPdfLibrary(pdfLibrary);
        } catch (error) {
            console.error(error);
            setPdfStatus(
                error instanceof Error ? `❌ ${error.message}` : "❌ Nie udało się pobrać listy PDF.",
                "error"
            );
        }
    }

    function validatePdfReplacement(file) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !allowedPdfExt.includes(ext)) {
            throw new Error("Dozwolone są tylko pliki .pdf.");
        }
    }

    function togglePdfDropzoneDisabled(state) {
        if (!pdfDropzone) return;
        pdfDropzone.classList.toggle("disabled", Boolean(state));
    }

    async function replacePdfFile(file) {
        togglePdfDropzoneDisabled(true);
        setPdfStatus(`Podmieniam plik "${file.name}"...`);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch("/api/wano/pdf-library/replace", {
                method: "POST",
                body: formData,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = payload.detail || payload.message || "Nie udało się podmienić pliku.";
                throw new Error(detail);
            }
            const replacedName = payload.file || file.name;
            setPdfStatus(`✅ Podmieniono: ${replacedName}.`);
            await loadPdfLibrary();
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Wystąpił błąd.";
            setPdfStatus(`❌ ${message}`, "error");
        } finally {
            togglePdfDropzoneDisabled(false);
            if (pdfInput) pdfInput.value = "";
        }
    }

    function handlePdfReplacement(file) {
        if (!file) return;
        try {
            validatePdfReplacement(file);
            replacePdfFile(file);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Wystąpił błąd.";
            setPdfStatus(`❌ ${message}`, "error");
        }
    }

    function startGenProgress() {
        if (!genProgressWrap) return;
        clearInterval(genProgressTimer);
        genProgressValue = 1; // start od 1%, żeby pasek ruszył od razu
        lastProgressPriority = -1;
        progressStartMarker = Date.now();
        showProgress(genProgressWrap, genProgressFill, genProgressText, genProgressValue);
        genProgressTimer = setInterval(() => {
            if (genProgressValue >= GEN_PROGRESS_MAX) return;
            genProgressValue = Math.min(GEN_PROGRESS_MAX, genProgressValue + 1);
            updateProgressBar(genProgressFill, genProgressText, genProgressValue);
        }, GEN_PROGRESS_INTERVAL);
    }

    function finishGenProgress() {
        if (!genProgressWrap) return;
        clearInterval(genProgressTimer);
        genProgressValue = 100;
        updateProgressBar(genProgressFill, genProgressText, genProgressValue);
        updateGenTimer(0);
        setTimeout(() => hideProgress(genProgressWrap), 400);
    }

    function stopProgressPolling() {
        if (progressPoller) {
            clearInterval(progressPoller);
            progressPoller = null;
        }
        if (genTimerInterval) {
            clearInterval(genTimerInterval);
            genTimerInterval = null;
        }
    }

    function formatDuration(ms) {
        const totalSeconds = Math.max(0, Math.round(ms / 1000));
        const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
        const s = String(totalSeconds % 60).padStart(2, "0");
        return `${m}:${s}`;
    }

    function updateGenTimer(forceMs = null) {
        if (!genProgressTimerText) return;
        if (!generationActive && forceMs === null) {
            genProgressTimerText.textContent = "--:--";
            return;
        }
        const elapsed = genStartTime ? Date.now() - genStartTime : 0;
        const remainingMs = forceMs !== null ? forceMs : Math.max(0, GEN_TOTAL_MS - elapsed);
        genProgressTimerText.textContent = formatDuration(remainingMs);
    }

    function startGenTimer() {
        genStartTime = Date.now();
        updateGenTimer();
        if (genTimerInterval) clearInterval(genTimerInterval);
        genTimerInterval = setInterval(() => updateGenTimer(), 1000);
    }

    function applyProgressPayload(payload, language) {
        const stage = (payload.stage || "idle").toLowerCase();
        if (!generationActive || language !== currentGenLanguage || stage === "idle") {
            return;
        }
        if (progressStartMarker) {
            const updatedTs = Date.parse(payload.updated || "");
            if (updatedTs && updatedTs + 1000 < progressStartMarker) {
                return;
            }
        }

        const priority = STAGE_PRIORITY[stage] ?? -1;
        if (priority >= 0 && priority < lastProgressPriority && stage !== "error") {
            return;
        }
        if (priority > lastProgressPriority) {
            lastProgressPriority = priority;
        }

        if (stage === "error") {
            stopProgressPolling();
            setStatus(`❌ ${payload.message || "Błąd generowania."}`, "error");
            return;
        }

        if (stage === "done") {
            stopProgressPolling();
            setStatus(`${language.toUpperCase()}: ${STAGE_TEXT.done}`);
            finishGenProgress();
            return;
        }

        const label = STAGE_TEXT[stage] || stage;
        setStatus(`${language.toUpperCase()}: ${label}`);
        if (genProgressWrap && genProgressWrap.hidden) {
            showProgress(genProgressWrap, genProgressFill, genProgressText, genProgressValue || 1);
        }
    }

    async function pollProgress(language) {
        try {
            const res = await fetch(`/api/wano/progress/${language}`);
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) return;
            applyProgressPayload(payload, language);
        } catch (err) {
            console.error("Progress poll error", err);
        }
    }

    function startProgressPolling(language) {
        stopProgressPolling();
        pollProgress(language);
        progressPoller = setInterval(() => pollProgress(language), PROGRESS_POLL_INTERVAL);
    }

    function setLoading(isLoading) {
        [plBtn, enBtn].forEach((btn) => {
            if (btn) btn.disabled = isLoading;
        });
        [downloadPlBtn, downloadEnBtn].forEach((btn) => {
            if (btn) btn.disabled = isLoading;
        });
        dropzone?.classList.toggle("disabled", isLoading);
    }

    function toggleCancelButton(visible) {
        if (!cancelWrap) return;
        cancelWrap.hidden = !visible;
        if (cancelBtn) {
            cancelBtn.disabled = cancelInFlight || !visible;
        }
    }

    function showInfoForm(fileName) {
        uploadedFilename = fileName;
        pendingInfoText = null;
        if (infoFilename) infoFilename.textContent = `Plik: ${fileName}`;
        if (infoInput) infoInput.value = "";
        if (infoForm) { infoForm.hidden = false; infoForm.classList.add('visible'); }
        if (dropzone) dropzone.hidden = true;
    }

    function hideInfoForm() {
        uploadedFilename = null;
        if (infoForm) { infoForm.hidden = true; infoForm.classList.remove('visible'); }
        if (dropzone) dropzone.hidden = false;
        if (infoInput) infoInput.value = "";
        if (infoFilename) infoFilename.textContent = "";
    }

    function resetGenerationUiState(options = {}) {
        const { resetCancelFlags = false } = options;
        stopProgressPolling();
        clearInterval(genProgressTimer);
        genProgressTimer = null;
        genProgressValue = 0;
        genStartTime = null;
        progressStartMarker = 0;
        hideProgress(genProgressWrap);
        updateProgressBar(genProgressFill, genProgressText, 0);
        if (genProgressTimerText) genProgressTimerText.textContent = "--:--";
        setLoading(false);
        generationActive = false;
        currentGenLanguage = null;
        toggleCancelButton(false);
        hideInfoForm();
        updateGenTimer(0);
        lastProgressPriority = -1;
        if (resetCancelFlags) {
            cancelRequested = false;
            cancelInFlight = false;
        }
    }

    async function cancelGeneration(reason = "Generowanie przerwane.") {
        if (!generationActive || cancelInFlight) return;
        cancelRequested = true;
        cancelInFlight = true;
        setStatus("Przerywam generowanie...");
        resetGenerationUiState();
        try {
            await fetch("/api/wano/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ language: currentGenLanguage, reason }),
            });
            setStatus("⏹️ Generowanie przerwane.");
        } catch (error) {
            console.error("Cancel error", error);
            setStatus("❌ Nie udało się przerwać generowania.", "error");
        } finally {
            cancelInFlight = false;
        }
    }

    async function resetServerGenerationState() {
        try {
            await fetch("/api/wano/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "Reset po odświeżeniu interfejsu" }),
            });
        } catch (err) {
            console.warn("Reset cancel failed", err);
        }
    }

    function sendCancelBeacon(language, reason) {
        if (!navigator.sendBeacon) return false;
        try {
            const payload = JSON.stringify({ language, reason });
            const blob = new Blob([payload], { type: "application/json" });
            return navigator.sendBeacon("/api/wano/cancel", blob);
        } catch (err) {
            console.warn("sendBeacon cancel failed", err);
            return false;
        }
    }

    async function triggerGeneration(language) {
        setLoading(true);
        setStatus(`Generuję cennik ${language.toUpperCase()}...`);
        genProgressValue = 1;
        startGenProgress();
        startProgressPolling(language);
        generationActive = true;
        currentGenLanguage = language;
        startGenTimer();
        cancelRequested = false;
        cancelInFlight = false;
        toggleCancelButton(true);

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
            if (cancelRequested || message.toLowerCase().includes("przerwan")) {
                setStatus(`⏹️ ${message}`);
            } else {
                setStatus(`❌ ${message}`, "error");
            }
        } finally {
            if (cancelRequested) {
                resetGenerationUiState({ resetCancelFlags: true });
            } else {
                stopProgressPolling();
                finishGenProgress();
                setLoading(false);
                generationActive = false;
                currentGenLanguage = null;
                updateGenTimer(0);
                hideInfoForm();
                toggleCancelButton(false);
                cancelRequested = false;
                cancelInFlight = false;
            }
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
        uploadInProgress = true;
        showInfoForm(file.name);
        showProgress(uploadProgressWrap, uploadProgressFill, uploadProgressText, 0);

        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/wano/upload");

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                updateProgressBar(uploadProgressFill, uploadProgressText, percent);
            }
        };

        xhr.onload = async () => {
            hideProgress(uploadProgressWrap);
            setLoading(false);
            uploadInProgress = false;
            if (fileInput) fileInput.value = "";

        try {
            const payload = JSON.parse(xhr.responseText || "{}");
            if (xhr.status < 200 || xhr.status >= 300) {
                const detail = payload.detail || payload.message || "Błąd wgrywania pliku.";
                throw new Error(detail);
            }

            const savedName = payload.filename || payload.saved || file.name;
            uploadedFilename = savedName;
            if (infoFilename) infoFilename.textContent = `Plik: ${savedName}`;
            setStatus(`Wgrano: ${savedName}. Dodaj opis i zatwierdź.`);
            if (pendingInfoText !== null) {
                const infoText = pendingInfoText;
                pendingInfoText = null;
                await submitInfo(infoText);
                }
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Wystąpił błąd.";
            setStatus(`❌ ${message}`, "error");
            hideInfoForm();
            }
        };

        xhr.onerror = () => {
            hideProgress(uploadProgressWrap);
            uploadInProgress = false;
            setLoading(false);
            pendingInfoText = null;
            if (fileInput) fileInput.value = "";
            setStatus("❌ Błąd wgrywania pliku (połączenie).", "error");
            hideInfoForm();
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

    async function saveInfo(filename, infoText) {
        const payload = { filename, info: infoText || "" };
        const res = await fetch("/api/wano/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const detail = data.detail || data.message || "Błąd zapisu opisu.";
            throw new Error(detail);
        }
    }

    async function submitInfo(forceText = null) {
        const infoText = forceText !== null ? forceText : infoInput?.value || "";
        if (uploadInProgress) {
            pendingInfoText = infoText;
            if (infoSubmit) infoSubmit.disabled = true;
            hideInfoForm();
            return;
        }
        if (!uploadedFilename) {
            return;
        }
        if (infoSubmit) infoSubmit.disabled = true;
        setStatus("Zapisuję opis...");
        try {
            await saveInfo(uploadedFilename, infoText);
            setStatus("Plik załadowany pomyślnie");
            hideInfoForm();
            await loadVersions();
            await loadLatestPdfs();
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Błąd zapisu opisu.";
            setStatus(`❌ ${message}`, "error");
        } finally {
            if (infoSubmit) infoSubmit.disabled = false;
        }
    }

    plBtn?.addEventListener("click", () => triggerGeneration("pl"));
    enBtn?.addEventListener("click", () => triggerGeneration("en"));
    cancelBtn?.addEventListener("click", () => cancelGeneration("Generowanie przerwane przez użytkownika."));
    window.addEventListener("beforeunload", () => {
        if (generationActive && currentGenLanguage) {
            sendCancelBeacon(currentGenLanguage, "Odświeżenie strony");
        }
    });

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

    pdfDropzone?.addEventListener("click", () => pdfInput?.click());

    pdfDropzone?.addEventListener("dragover", (event) => {
        event.preventDefault();
        pdfDropzone.classList.add("dragover");
    });

    pdfDropzone?.addEventListener("dragleave", () => pdfDropzone.classList.remove("dragover"));

    pdfDropzone?.addEventListener("drop", (event) => {
        event.preventDefault();
        pdfDropzone.classList.remove("dragover");
        const file = event.dataTransfer?.files?.[0];
        handlePdfReplacement(file);
    });

    pdfInput?.addEventListener("change", () => {
        const file = pdfInput.files?.[0];
        if (!file) return;
        handlePdfReplacement(file);
    });

    infoSubmit?.addEventListener("click", (event) => {
        event.preventDefault();
        submitInfo();
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
            // zostaw poprzednio wyświetlone dane; nie nadpisuj statusu użytkownika
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
        const applyBtnState = (btn, entry, labelPrefix, lang) => {
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
            btn.setAttribute("data-href", `/api/wano/download-latest/${lang}`);
        };

        applyBtnState(downloadPlBtn, latestPdfs.pl, "Pobierz najnowszy plik PL", "pl");
        applyBtnState(downloadEnBtn, latestPdfs.en, "Pobierz najnowszy plik EN", "en");
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

    resetGenerationUiState({ resetCancelFlags: true });
    resetServerGenerationState();
    loadVersions();
    loadLatestPdfs();
    loadPdfLibrary();
    wireDownloadButtons();
})();
