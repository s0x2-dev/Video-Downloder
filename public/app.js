const $ = (id) => document.getElementById(id);

const urlInput = $("url");
const qualitySelect = $("quality");
const forceMp4Checkbox = $("forceMp4");
const infoBtn = $("infoBtn");
const downloadBtn = $("downloadBtn");
const card = $("card");
const thumb = $("thumb");
const titleEl = $("title");
const metaEl = $("meta");
const barWrap = $("barWrap");
const bar = $("bar");
const statusEl = $("status");
const errorEl = $("error");

let currentJobId = null;

infoBtn.addEventListener("click", getInfo);
downloadBtn.addEventListener("click", startDownload);
urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") getInfo();
});

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
        errorEl.textContent = `Could not get info: ${err.message}`;
        card.hidden = false;
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
    bar.style.width = "0%";
}

async function startDownload() {
    const url = urlInput.value.trim();
    if (!url) return;

    clearMessages();
    downloadBtn.disabled = true;
    statusEl.textContent = "Starting...";
    barWrap.hidden = false;
    bar.style.width = "0%";

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
        statusEl.textContent = "";
    }
}

function trackProgress(jobId) {
    const source = new EventSource(`/api/progress/${jobId}`);

    source.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === "running") {
            const progress = data.progress || 0;
            bar.style.width = `${progress}%`;
            statusEl.textContent = `Downloading... ${progress.toFixed(1)}%`;
        } else if (data.status === "done") {
            source.close();
            bar.style.width = "100%";
            statusEl.textContent = "Done. Saving file to your device...";
            window.location = `/api/file/${jobId}`;
            setTimeout(() => {
                statusEl.textContent = "File saved.";
                downloadBtn.disabled = false;
            }, 1500);
        } else if (data.status === "error") {
            source.close();
            errorEl.textContent = `Download failed:\n${data.error || "Unknown error."}`;
            statusEl.textContent = "";
            downloadBtn.disabled = false;
        }
    };

    source.onerror = () => {
        source.close();
        downloadBtn.disabled = false;
    };
}

function setInfoLoading(isLoading) {
    infoBtn.disabled = isLoading;
    infoBtn.textContent = isLoading ? "Loading..." : "Get info";
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
