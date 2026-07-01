import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PORT, findFfmpegDir } from "./config.js";
import { fetchVideoInfo, startDownload } from "./downloader.js";
import { getJob, removeJob } from "./jobs.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const ffmpegDir = findFfmpegDir(rootDir);

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

app.post("/api/info", async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "No URL provided." });
    }

    try {
        const info = await fetchVideoInfo(url);
        res.json(info);
    } catch (err) {
        res.status(err.status || 500).json({
            error: err.message || "Unexpected error.",
            detail: err.detail,
        });
    }
});

app.post("/api/start", (req, res) => {
    const { url, quality, forceMp4 } = req.body || {};
    if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "No URL provided." });
    }

    const jobId = startDownload({ url, quality, forceMp4, ffmpegDir });
    res.json({ jobId });
});

app.get("/api/progress/:jobId", (req, res) => {
    const { jobId } = req.params;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const timer = setInterval(() => {
        const job = getJob(jobId);
        if (!job) {
            res.write(`data: ${JSON.stringify({ status: "error", error: "Job not found." })}\n\n`);
            clearInterval(timer);
            return res.end();
        }

        res.write(
            `data: ${JSON.stringify({
                status: job.status,
                progress: job.progress,
                error: job.error,
            })}\n\n`
        );

        if (job.status === "done" || job.status === "error") {
            clearInterval(timer);
            res.end();
        }
    }, 500);

    req.on("close", () => clearInterval(timer));
});

app.get("/api/file/:jobId", (req, res) => {
    const { jobId } = req.params;
    const job = getJob(jobId);

    if (!job || job.status !== "done" || !job.filePath) {
        return res.status(404).send("File is not ready.");
    }

    const ext = path.extname(job.filePath);
    const fileName = `video_${jobId.slice(0, 8)}${ext}`;

    res.download(job.filePath, fileName, (err) => {
        fs.unlink(job.filePath, () => { });
        removeJob(jobId);
        if (err && !res.headersSent) res.status(500).end();
    });
});

app.listen(PORT, () => {
    if (ffmpegDir) console.log(`ffmpeg found: ${ffmpegDir}`);
    console.log(`Video Downloader running at http://localhost:${PORT}`);
});
