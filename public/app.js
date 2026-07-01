const $ = (id) => document.getElementById(id);

const urlInput = $("url");
const qualitySelect = $("quality");
const forceMp4Checkbox = $("forceMp4");
const infoBtn = $("infoBtn");
const infoLabel = infoBtn.querySelector(".pill__label");
const downloadBtn = $("downloadBtn");
const card = $("card");
const thumb = $("thumb");
const titleEl = $("title");
const metaEl = $("meta");
const barWrap = $("barWrap");
const bar = $("bar");
const pctEl = $("pct");
const statusEl = $("status");
const errorEl = $("error");
const cursorGlow = $("cursorGlow");

let currentJobId = null;

infoBtn.addEventListener("click", getInfo);
downloadBtn.addEventListener("click", startDownload);
urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") getInfo();
});

setupCursorGlow();

async function getInfo() {
    const url = urlInput.value.trim();
    if (!url) return;

    clearMessages();
    setInfoLoading(true);

    try {
        const response = await fetch("/api/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || data.error || "Request failed.");
        }

        renderInfo(data);
    } catch (err) {
        card.hidden = false;
        errorEl.textContent = `Could not read this link: ${err.message}`;
    } finally {
        setInfoLoading(false);
    }
}

function renderInfo(data) {
    titleEl.textContent = data.title;

    const parts = [];
    if (data.source) parts.push(data.source);
    if (data.duration) parts.push(formatDuration(data.duration));
    metaEl.textContent = parts.join("  ·  ");

    if (data.thumbnail) {
        thumb.src = data.thumbnail;
        thumb.hidden = false;
    } else {
        thumb.hidden = true;
    }

    card.hidden = false;
    barWrap.hidden = true;
    setProgress(0);
}

async function startDownload() {
    const url = urlInput.value.trim();
    if (!url) return;

    clearMessages();
    downloadBtn.disabled = true;
    barWrap.hidden = false;
    statusEl.textContent = "Preparing...";
    setProgress(0);

    try {
        const response = await fetch("/api/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url,
                quality: qualitySelect.value,
                forceMp4: forceMp4Checkbox.checked,
            }),
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to start.");
        }

        currentJobId = data.jobId;
        trackProgress(currentJobId);
    } catch (err) {
        errorEl.textContent = `Error: ${err.message}`;
        downloadBtn.disabled = false;
        barWrap.hidden = true;
    }
}

function trackProgress(jobId) {
    const source = new EventSource(`/api/progress/${jobId}`);

    source.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === "running") {
            setProgress(data.progress || 0);
            statusEl.textContent = "Downloading";
        } else if (data.status === "done") {
            source.close();
            setProgress(100);
            statusEl.textContent = "Saving to your device...";
            window.location = `/api/file/${jobId}`;
            setTimeout(() => {
                statusEl.textContent = "Saved.";
                downloadBtn.disabled = false;
            }, 1500);
        } else if (data.status === "error") {
            source.close();
            errorEl.textContent = `Download failed: ${data.error || "Unknown error."}`;
            barWrap.hidden = true;
            downloadBtn.disabled = false;
        }
    };

    source.onerror = () => {
        source.close();
        downloadBtn.disabled = false;
    };
}

function setProgress(percent) {
    bar.style.width = `${percent}%`;
    pctEl.textContent = `${percent.toFixed(1)}%`;
}

function setInfoLoading(isLoading) {
    infoBtn.disabled = isLoading;
    infoBtn.classList.toggle("is-loading", isLoading);
    infoLabel.textContent = isLoading ? "Analyzing..." : "Analyze link";
}

function clearMessages() {
    errorEl.textContent = "";
    statusEl.textContent = "";
}

function formatDuration(totalSeconds) {
    const seconds = Math.round(totalSeconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

function setupCursorGlow() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const current = { ...target };
    let visible = false;

    window.addEventListener("mousemove", (event) => {
        target.x = event.clientX;
        target.y = event.clientY;
        if (!visible) {
            visible = true;
            cursorGlow.style.opacity = "1";
        }
    });

    const tick = () => {
        current.x += (target.x - current.x) * 0.12;
        current.y += (target.y - current.y) * 0.12;
        cursorGlow.style.transform = `translate(${current.x}px, ${current.y}px) translate(-50%, -50%)`;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}
