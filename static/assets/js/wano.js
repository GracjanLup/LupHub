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
    const uploadProgressWrap = document.getElementById("wano-progress-upload");
    const uploadProgressFill = document.getElementById("wano-progress-upload-fill");
    const uploadProgressText = document.getElementById("wano-progress-upload-text");
    const infoForm = document.getElementById("wano-info-form");
    const infoInput = document.getElementById("wano-info-input");
    const infoSubmit = document.getElementById("wano-info-submit");
    const infoFilename = document.getElementById("wano-info-filename");
    const downloadPlBtn = document.getElementById("download-latest-pl");
    const downloadEnBtn = document.getElementById("download-latest-en");
    const allowedExt = ["xlsm", "xlsx"];

    let versions = [];
    let latestPdfs = { pl: null, en: null };
    const GEN_FAST_TARGET = 10;
    const GEN_FAST_STEP = 1;
    const GEN_FAST_INTERVAL = 400;
    const GEN_SLOW_STEP = 1;
    const GEN_SLOW_INTERVAL = 2750;
    const GEN_SLOW_CAP = 99;
    const BASE_TOTAL_MS = 210000; // 3 min 30 s
    const MAX_TOTAL_MS = 600000; // 10 min max
    const MILESTONES = [25, 50, 75];
    let progressPoller = null;
    const PROGRESS_POLL_INTERVAL = 2500;
    let genProgressTimer = null;
    let genProgressValue = 0;
    let genSlowPhase = false;
    let currentGenLanguage = null;
    let generationActive = false;
    let genStartTime = null;
    let genTimerInterval = null;
    let genTotalMs = BASE_TOTAL_MS;
    let nextMilestoneIdx = 0;
    let uploadedFilename = null;
    let pendingInfoText = null;
    let uploadInProgress = false;

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
        if (genProgressTimerText) genProgressTimerText.textContent = formatDuration(genTotalMs);
    }

    function updateProgressBar(fill, text, percent) {
        const pct = Math.min(100, Math.max(0, Math.round(percent)));
        if (fill) fill.style.width = `${pct}%`;
        if (text) text.textContent = `${pct}%`;
    }

    function hideProgress(wrapper) {
        if (wrapper) wrapper.hidden = true;
    }

    function startSlowGenPhase() {
        clearInterval(genProgressTimer);
        genProgressTimer = setInterval(() => {
            if (genProgressValue >= GEN_SLOW_CAP) return;
            genProgressValue = Math.min(GEN_SLOW_CAP, genProgressValue + GEN_SLOW_STEP);
            updateProgressBar(genProgressFill, genProgressText, genProgressValue);
        }, GEN_SLOW_INTERVAL);
    }

    function startGenProgress() {
        if (!genProgressWrap) return;
        clearInterval(genProgressTimer);
        genSlowPhase = false;
        genProgressValue = 1; // start od 1%, żeby pasek ruszył od razu
        showProgress(genProgressWrap, genProgressFill, genProgressText, genProgressValue);
        genProgressTimer = setInterval(() => {
            if (genProgressValue >= GEN_FAST_TARGET) {
                if (!genSlowPhase) {
                    genSlowPhase = true;
                    startSlowGenPhase();
                }
                return;
            }
            genProgressValue = Math.min(GEN_FAST_TARGET, genProgressValue + GEN_FAST_STEP);
            updateProgressBar(genProgressFill, genProgressText, genProgressValue);
            if (genProgressValue >= GEN_FAST_TARGET) {
                genSlowPhase = true;
                startSlowGenPhase();
            }
        }, GEN_FAST_INTERVAL);
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
        const remainingMs = forceMs !== null ? forceMs : Math.max(0, genTotalMs - elapsed);
        genProgressTimerText.textContent = formatDuration(remainingMs);
    }

    function maybeAdjustTotal(percent) {
        if (nextMilestoneIdx >= MILESTONES.length) return;
        const milestone = MILESTONES[nextMilestoneIdx];
        if (percent < milestone) return;
        const elapsed = genStartTime ? Date.now() - genStartTime : 0;
        const estTotal = Math.min(MAX_TOTAL_MS, Math.max(genTotalMs, (elapsed * 100) / Math.max(percent, 1)));
        if (estTotal > genTotalMs) {
            genTotalMs = estTotal;
        }
        nextMilestoneIdx += 1;
    }

    function startGenTimer() {
        genStartTime = Date.now();
        genTotalMs = BASE_TOTAL_MS;
        nextMilestoneIdx = 0;
        updateGenTimer();
        if (genTimerInterval) clearInterval(genTimerInterval);
        genTimerInterval = setInterval(() => updateGenTimer(), 1000);
    }

    function applyProgressPayload(payload, language) {
        const stage = payload.stage || "idle";
        const rawPercent = typeof payload.percent === "number" ? payload.percent : 0;
        const message = payload.message || "";
        if (generationActive && language === currentGenLanguage && stage === "idle") {
            // Nie nadpisuj podczas trwającej generacji pustym stanem
            return;
        }
        const stageLabel = {
            start: "Start",
            export: "Eksport arkuszy",
            merge: "Scalanie PDF",
            done: "Zakończono",
            error: "Błąd",
            idle: "Oczekiwanie",
        }[stage] || stage;

        const percent =
            stage === "done" || stage === "error"
                ? Math.max(rawPercent, 100)
                : Math.min(GEN_SLOW_CAP, Math.max(genProgressValue, rawPercent));
        showProgress(genProgressWrap, genProgressFill, genProgressText, percent);
        genProgressValue = percent;
        updateProgressBar(genProgressFill, genProgressText, percent);
        maybeAdjustTotal(percent);
        updateGenTimer();

        if (stage === "done") {
            finishGenProgress();
            stopProgressPolling();
            setStatus(`✅ ${message || "Gotowe"}`);
            setLoading(false);
            hideInfoForm();
    loadVersions();
            loadLatestPdfs();
            generationActive = false;
            currentGenLanguage = null;
        } else if (stage === "error") {
            stopProgressPolling();
            setStatus(`❌ ${message || "Błąd generowania."}`, "error");
            setLoading(false);
            hideProgress(genProgressWrap);
            generationActive = false;
            currentGenLanguage = null;
            updateGenTimer(0);
        } else {
            setStatus(`${language.toUpperCase()}: ${stageLabel}${message ? " – " + message : ""}`);
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

    async function triggerGeneration(language) {
        setLoading(true);
        setStatus(`Generuję cennik ${language.toUpperCase()}...`);
        genProgressValue = 1;
        startGenProgress();
        startProgressPolling(language);
        generationActive = true;
        currentGenLanguage = language;
        startGenTimer();

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
            stopProgressPolling();
            finishGenProgress();
            setLoading(false);
            generationActive = false;
            currentGenLanguage = null;
            updateGenTimer(0);
            hideInfoForm();
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

    hideInfoForm();
    loadVersions();
    loadLatestPdfs();
    wireDownloadButtons();
})();
