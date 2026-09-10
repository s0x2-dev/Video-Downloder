/* ============================================================
   Fetch — front-end interactivity
   Vanilla JS, no dependencies. Talks to the same backend:
     POST /api/info      -> { title, thumbnail, duration, source }
     POST /api/start     -> { jobId }
     GET  /api/progress/:jobId  (SSE) -> { status, progress, error }
     GET  /api/file/:jobId       (file download)
   ============================================================ */

const $ = (id) => document.getElementById(id);

const card = $("card");
const urlInput = $("url");
const clearBtn = $("clearBtn");
const pasteBtn = $("pasteBtn");
const quality = $("quality");
const segs = [...quality.querySelectorAll(".seg")];
const forceMp4 = $("forceMp4");
const infoBtn = $("infoBtn");
const infoLabel = infoBtn.querySelector(".btn__label");
const downloadBtn = $("downloadBtn");
const downloadLabel = downloadBtn.querySelector(".btn__label");
const newBtn = $("newBtn");
const resetBtn = $("resetBtn");

const thumb = $("thumb");
const titleEl = $("title");
const metaEl = $("meta");
const sourceEl = $("source");
const durationEl = $("duration");

const barWrap = $("barWrap");
const bar = $("bar");
const pctEl = $("pct");
const statusEl = $("status");
const ring = $("ring");
const ringValue = ring.querySelector(".ring__value");
const ringPct = $("ringPct");
const errorEl = $("error");

const themeToggle = $("themeToggle");
const toasts = $("toasts");
const confettiCanvas = $("confetti");

const QUALITY_LABELS = {
    best: "Best available",
    1080: "1080p",
    720: "720p",
    480: "480p",
    audio: "Audio",
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r = 52 in the SVG

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

const state = {
    quality: "720",
    analyzedUrl: null,
    jobId: null,
    lastPct: 0,
};

/* ------------------------------------------------------------
   State machine
   ------------------------------------------------------------ */
function setState(name) {
    card.dataset.state = name;
}

/* ------------------------------------------------------------
   Theme: cycles system -> light -> dark, persisted
   ------------------------------------------------------------ */
const THEMES = ["system", "light", "dark"];

function applyTheme(theme) {
    if (theme === "system") {
        document.documentElement.setAttribute("data-theme", "system");
    } else {
        document.documentElement.setAttribute("data-theme", theme);
    }
    themeToggle.title = `Theme: ${theme}`;
    themeToggle.setAttribute("aria-label", `Theme: ${theme}. Click to switch.`);
}

function initTheme() {
    const saved = localStorage.getItem("fetch-theme");
    applyTheme(THEMES.includes(saved) ? saved : "system");
}

themeToggle.addEventListener("click", () => {
    const current = localStorage.getItem("fetch-theme");
    const idx = THEMES.indexOf(THEMES.includes(current) ? current : "system");
    const next = THEMES[(idx + 1) % THEMES.length];
    localStorage.setItem("fetch-theme", next);
    applyTheme(next);
    toast(`${next[0].toUpperCase()}${next.slice(1)} theme`);
});

/* ------------------------------------------------------------
   Segmented format control (radiogroup)
   ------------------------------------------------------------ */
function selectQuality(value, focus = false) {
    const idx = segs.findIndex((s) => s.dataset.value === value);
    if (idx === -1) return;
    state.quality = value;
    quality.style.setProperty("--i", idx);
    segs.forEach((s, i) => {
        s.setAttribute("aria-checked", String(i === idx));
        s.tabIndex = i === idx ? 0 : -1;
    });
    if (focus) segs[idx].focus();
    updateMeta();
}

segs.forEach((seg) => {
    seg.addEventListener("click", () => selectQuality(seg.dataset.value));
});

quality.addEventListener("keydown", (e) => {
    const idx = segs.findIndex((s) => s.dataset.value === state.quality);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        selectQuality(segs[(idx + 1) % segs.length].dataset.value, true);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        selectQuality(segs[(idx - 1 + segs.length) % segs.length].dataset.value, true);
    }
});

forceMp4.addEventListener("change", updateMeta);

function updateMeta() {
    const label = QUALITY_LABELS[state.quality] || "Best";
    let out;
    if (state.quality === "audio") {
        out = "Audio · MP3";
    } else {
        out = `${label} · ${forceMp4.checked ? "MP4 (re-encode)" : "MP4"}`;
    }
    metaEl.textContent = out;
}

/* ------------------------------------------------------------
   URL field: clear / paste, revert to idle when edited
   ------------------------------------------------------------ */
function refreshClearBtn() {
    clearBtn.hidden = urlInput.value.trim().length === 0;
}

urlInput.addEventListener("input", () => {
    refreshClearBtn();
    if (card.dataset.state === "downloading") return;
    if (urlInput.value.trim() !== state.analyzedUrl) {
        // The link changed since the last analyze — fold back to the start.
        if (card.dataset.state !== "idle") {
            setState("idle");
            clearMessages();
        }
    }
});

clearBtn.addEventListener("click", () => {
    urlInput.value = "";
    refreshClearBtn();
    resetToIdle();
    urlInput.focus();
});

pasteBtn.addEventListener("click", async () => {
    try {
        const text = (await navigator.clipboard.readText()).trim();
        if (!text) {
            toast("Clipboard is empty");
            return;
        }
        urlInput.value = text;
        refreshClearBtn();
        toast("Pasted");
        if (/^https?:\/\//i.test(text)) getInfo();
        else urlInput.focus();
    } catch {
        urlInput.focus();
        toast("Press ⌘/Ctrl+V to paste", "error");
    }
});

/* ------------------------------------------------------------
   Analyze
   ------------------------------------------------------------ */
infoBtn.addEventListener("click", getInfo);

async function getInfo() {
    const url = urlInput.value.trim();
    if (!url) {
        urlInput.focus();
        return toast("Paste a link first", "error");
    }

    clearMessages();
    setInfoLoading(true);

    try {
        const response = await fetch("/api/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.error || "Request failed.");
        renderInfo(data, url);
        toast("Link ready", "success");
    } catch (err) {
        setState("idle");
        errorEl.textContent = `Could not read this link: ${err.message}`;
        toast("Couldn't read that link", "error");
    } finally {
        setInfoLoading(false);
    }
}

function renderInfo(data, url) {
    state.analyzedUrl = url;

    titleEl.textContent = data.title || "Untitled";

    if (data.source) {
        sourceEl.textContent = data.source;
        sourceEl.hidden = false;
    } else {
        sourceEl.hidden = true;
    }

    if (data.duration) {
        durationEl.textContent = formatDuration(data.duration);
        durationEl.hidden = false;
    } else {
        durationEl.hidden = true;
    }

    if (data.thumbnail) {
        thumb.src = data.thumbnail;
        thumb.hidden = false;
    } else {
        thumb.removeAttribute("src");
        thumb.hidden = true;
    }

    updateMeta();
    setProgress(0, true);
    downloadLabel.textContent = "Download";
    setState("analyzed");
}

/* ------------------------------------------------------------
   Download
   ------------------------------------------------------------ */
downloadBtn.addEventListener("click", startDownload);

async function startDownload() {
    const url = urlInput.value.trim();
    if (!url) return;

    clearMessages();
    setState("downloading");
    setDownloadLoading(true);
    statusEl.innerHTML = '<span class="dot" aria-hidden="true"></span>Preparing…';
    setProgress(0, true);

    try {
        const response = await fetch("/api/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, quality: state.quality, forceMp4: forceMp4.checked }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to start.");
        state.jobId = data.jobId;
        trackProgress(state.jobId);
    } catch (err) {
        errorEl.textContent = `Error: ${err.message}`;
        toast("Download failed to start", "error");
        setDownloadLoading(false);
        setState("analyzed");
    }
}

function trackProgress(jobId) {
    const source = new EventSource(`/api/progress/${jobId}`);

    source.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === "running") {
            setProgress(data.progress || 0);
            statusEl.innerHTML = '<span class="dot" aria-hidden="true"></span>Downloading';
        } else if (data.status === "done") {
            source.close();
            setProgress(100);
            statusEl.textContent = "Saving to your device…";
            window.location = `/api/file/${jobId}`;
            setState("done");
            setDownloadLoading(false);
            downloadLabel.textContent = "Download again";
            fireConfetti();
            toast("Saved to your device", "success");
            setTimeout(() => {
                statusEl.textContent = "Saved.";
            }, 1400);
        } else if (data.status === "error") {
            source.close();
            errorEl.textContent = `Download failed: ${data.error || "Unknown error."}`;
            toast("Download failed", "error");
            setDownloadLoading(false);
            setState("analyzed");
        }
    };

    source.onerror = () => {
        source.close();
        setDownloadLoading(false);
        if (card.dataset.state === "downloading") setState("analyzed");
    };
}

/* ------------------------------------------------------------
   Progress rendering (bar + ring + counting number)
   ------------------------------------------------------------ */
function setProgress(percent, instant = false) {
    const target = Math.max(0, Math.min(100, percent));
    bar.style.width = `${target}%`;
    ringValue.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - target / 100);

    if (instant || reduceMotion) {
        state.lastPct = target;
        pctEl.textContent = `${target.toFixed(1)}%`;
        ringPct.textContent = `${Math.round(target)}%`;
        return;
    }
    animateNumber(state.lastPct, target, (v) => {
        pctEl.textContent = `${v.toFixed(1)}%`;
        ringPct.textContent = `${Math.round(v)}%`;
    });
    state.lastPct = target;
}

function animateNumber(from, to, onUpdate, duration = 420) {
    const start = performance.now();
    function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        onUpdate(from + (to - from) * eased);
        if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

/* ------------------------------------------------------------
   Reset / New link
   ------------------------------------------------------------ */
function resetToIdle({ keepUrl = false, keepFormat = true } = {}) {
    if (!keepUrl) {
        urlInput.value = "";
        refreshClearBtn();
    }
    if (!keepFormat) {
        selectQuality("720");
        forceMp4.checked = false;
    }
    state.analyzedUrl = null;
    state.jobId = null;
    thumb.removeAttribute("src");
    thumb.hidden = true;
    titleEl.textContent = "";
    sourceEl.hidden = true;
    durationEl.hidden = true;
    downloadLabel.textContent = "Download";
    setProgress(0, true);
    clearMessages();
    setState("idle");
}

newBtn.addEventListener("click", () => {
    resetToIdle({ keepFormat: true });
    urlInput.focus();
    toast("Ready for a new link");
});

resetBtn.addEventListener("click", () => {
    resetToIdle({ keepFormat: false });
    updateMeta();
    urlInput.focus();
    toast("Reset");
});

/* ------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------ */
function setInfoLoading(isLoading) {
    infoBtn.disabled = isLoading;
    infoBtn.classList.toggle("is-loading", isLoading);
    infoLabel.textContent = isLoading ? "Analyzing…" : "Analyze link";
}

function setDownloadLoading(isLoading) {
    downloadBtn.disabled = isLoading;
    downloadBtn.classList.toggle("is-loading", isLoading);
}

function clearMessages() {
    errorEl.textContent = "";
}

function formatDuration(totalSeconds) {
    const seconds = Math.round(totalSeconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/* ------------------------------------------------------------
   Toasts
   ------------------------------------------------------------ */
function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.innerHTML = `<span class="toast__dot" aria-hidden="true"></span><span>${message}</span>`;
    toasts.appendChild(el);

    const life = setTimeout(() => dismiss(), 2600);
    function dismiss() {
        clearTimeout(life);
        el.classList.add("is-out");
        el.addEventListener("animationend", () => el.remove(), { once: true });
    }
    // Keep at most four toasts on screen.
    while (toasts.children.length > 4) toasts.firstChild.remove();
}

/* ------------------------------------------------------------
   Confetti (tiny canvas burst, no dependency)
   ------------------------------------------------------------ */
function fireConfetti() {
    if (reduceMotion) return;
    const ctx = confettiCanvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (confettiCanvas.width = window.innerWidth * dpr);
    const H = (confettiCanvas.height = window.innerHeight * dpr);

    const colors = ["#5b58d6", "#d65890", "#58bcd6", "#f5c451", "#ffffff"];
    const rect = card.getBoundingClientRect();
    const originX = (rect.left + rect.width / 2) * dpr;
    const originY = (rect.top + rect.height * 0.35) * dpr;

    const particles = Array.from({ length: 150 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = (6 + Math.random() * 9) * dpr;
        return {
            x: originX,
            y: originY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 6 * dpr,
            size: (5 + Math.random() * 7) * dpr,
            color: colors[(Math.random() * colors.length) | 0],
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.4,
            life: 1,
        };
    });

    const gravity = 0.32 * dpr;
    let raf;

    function tick() {
        ctx.clearRect(0, 0, W, H);
        let alive = false;
        for (const p of particles) {
            p.vy += gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.99;
            p.rot += p.vr;
            p.life -= 0.009;
            if (p.life > 0 && p.y < H + 40) {
                alive = true;
                ctx.save();
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                ctx.restore();
            }
        }
        if (alive) raf = requestAnimationFrame(tick);
        else ctx.clearRect(0, 0, W, H);
    }
    cancelAnimationFrame(raf);
    tick();
}

/* ------------------------------------------------------------
   Pointer flourishes: spotlight, card glow + tilt, ripple
   ------------------------------------------------------------ */
function attachSpotlight(el) {
    el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
}
document.querySelectorAll(".spotlight").forEach(attachSpotlight);

if (finePointer && !reduceMotion) {
    let tiltRaf = null;
    card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
        if (tiltRaf) return;
        tiltRaf = requestAnimationFrame(() => {
            const rx = (0.5 - py) * 5;
            const ry = (px - 0.5) * 5;
            card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
            tiltRaf = null;
        });
    });
    card.addEventListener("pointerleave", () => {
        card.style.transform = "";
    });
}

// Material-style ripple on the main buttons.
[infoBtn, downloadBtn, newBtn, resetBtn].forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
        if (reduceMotion || btn.disabled) return;
        const r = btn.getBoundingClientRect();
        const size = Math.max(r.width, r.height);
        const ripple = document.createElement("span");
        ripple.className = "ripple";
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - r.left - size / 2}px`;
        ripple.style.top = `${e.clientY - r.top - size / 2}px`;
        btn.appendChild(ripple);
        ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    });
});

/* ------------------------------------------------------------
   Keyboard shortcuts
   ------------------------------------------------------------ */
document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (card.dataset.state === "analyzed" || card.dataset.state === "done") {
            e.preventDefault();
            startDownload();
        }
        return;
    }
    if (e.key === "Enter" && document.activeElement === urlInput) {
        e.preventDefault();
        getInfo();
    } else if (e.key === "Escape") {
        resetToIdle({ keepFormat: false });
        updateMeta();
    }
});

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */
initTheme();
selectQuality("720");
refreshClearBtn();
updateMeta();
