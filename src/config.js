import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.PORT) || 3000;
export const YTDLP_BIN = process.env.YTDLP_PATH || "yt-dlp";

export const DOWNLOAD_DIR = path.join(os.tmpdir(), "video-downloader");
fs.mkdirSync(DOWNLOAD_DIR, {
    recursive: true
});

export function findFfmpegDir(rootDir) {
    const candidates = [process.env.FFMPEG_DIR, path.join(rootDir, "ffmpeg"), rootDir].filter(Boolean);
    for (const dir of candidates) {
        const hasFfmpeg = fs.existsSync(path.join(dir, "ffmpeg.exe")) || fs.existsSync(path.join(dir, "ffmpeg"));
        if (hasFfmpeg) {
            return dir;
        };
    }
    return null;
}

const QUALITY_FORMATS = {
    best: "bv*+ba/b",
    1080: "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
    720: "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b",
    480: "bv*[height<=480]+ba/b[height<=480]/bv*+ba/b",
    audio: "ba/b",
};

export function resolveFormat(quality) {
    return QUALITY_FORMATS[quality] || QUALITY_FORMATS.best;
}
