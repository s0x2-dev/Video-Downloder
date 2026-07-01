import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
    DOWNLOAD_DIR,
    YTDLP_BIN,
    resolveFormat,
} from "./config.js";
import { createJob, getJob } from "./jobs.js";

const YTDLP_NOT_FOUND = "yt-dlp was not found. Install it (e.g. `winget install yt-dlp` or `pip install yt-dlp`) and restart the server.";

const PROGRESS_PATTERN = /\[download\]\s+([\d.]+)%/;

export function fetchVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const child = spawn(YTDLP_BIN, ["-J", "--no-playlist", url]);

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));

        child.on("error", (err) => {
            reject({ status: 500, message: `${YTDLP_NOT_FOUND} (${err.code || err.message})` });
        });

        child.on("close", (code) => {
            if (code !== 0) {
                return reject({
                    status: 500,
                    message: "Could not read video information.",
                    detail: stderr.slice(-800),
                });
            }

            try {
                const info = JSON.parse(stdout);
                resolve({
                    title: info.title || "Untitled",
                    thumbnail: info.thumbnail || null,
                    duration: info.duration || null,
                    source: info.extractor_key || info.extractor || null,
                });
            } catch {
                resolve({
                    title: "Video",
                    thumbnail: null,
                    duration: null,
                    source: null
                });
            }
        });
    });
}

export function startDownload({ url, quality, forceMp4, ffmpegDir }) {
    const jobId = randomUUID();
    const outputTemplate = path.join(DOWNLOAD_DIR, `${jobId}.%(ext)s`);

    const args = ["--no-playlist", "--newline", "-f", resolveFormat(quality), "-o", outputTemplate];

    if (ffmpegDir) {
        args.push("--ffmpeg-location", ffmpegDir);
    }

    if (quality === "audio") {
        args.push("--extract-audio", "--audio-format", "mp3");
    } else {
        args.push("--merge-output-format", "mp4");
        args.push("--postprocessor-args", "Merger:-c:v copy -c:a aac -b:a 192k");
        if (forceMp4) {
            args.push("--recode-video", "mp4");
        }
    }

    args.push(url);

    const job = createJob(jobId);
    const child = spawn(YTDLP_BIN, args);
    let stderrTail = "";

    child.stdout.on("data", (chunk) => {
        const match = chunk.toString().match(PROGRESS_PATTERN);
        if (match) {
            job.progress = parseFloat(match[1]);
        };
    });

    child.stderr.on("data", (chunk) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-1000);
    });

    child.on("error", (err) => {
        job.status = "error";
        job.error = `${YTDLP_NOT_FOUND} (${err.message})`;
    });

    child.on("close", (code) => {
        if (code !== 0) {
            job.status = "error";
            job.error = stderrTail || "yt-dlp exited with an error.";
            return;
        }

        const file = fs.readdirSync(DOWNLOAD_DIR).find((name) => name.startsWith(`${jobId}.`));

        if (file) {
            job.filePath = path.join(DOWNLOAD_DIR, file);
            job.progress = 100;
            job.status = "done";
        } else {
            job.status = "error";
            job.error = "Download finished, but the output file was not found.";
        }
    });

    return jobId;
}

export { getJob };
