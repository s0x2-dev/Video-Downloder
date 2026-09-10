# Video Downloader

A self-hosted web app that downloads video and audio from 1000+ sites as MP4 or MP3.
Paste a link, pick a quality, and get a file. It runs entirely on your machine and is
powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) with [ffmpeg](https://ffmpeg.org/)
for merging and re-encoding.

## Features

- Download from 1000+ platforms supported by yt-dlp
- Quality presets: best available, 1080p, 720p, 480p, or audio-only (MP3)
- Optional MP4 re-encode for maximum player compatibility
- Live download progress via Server-Sent Events, shown as a big radial ring on the preview
- Large cinematic preview of the video being fetched (thumbnail, source, duration)
- Interactive single-page interface: segmented format picker, paste-from-clipboard,
  clear / reset / new-link controls, light · dark · system theme toggle, keyboard shortcuts,
  and a confetti flourish when a download finishes
- Motion respects `prefers-reduced-motion`
- Runs locally, no external services

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) available on your `PATH`
- [ffmpeg](https://ffmpeg.org/download.html) (needed for merging video/audio and re-encoding)

### Installing yt-dlp and ffmpeg

**Windows (winget):**

```bash
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

**macOS (Homebrew):**

```bash
brew install yt-dlp ffmpeg
```

**Linux (pip + package manager):**

```bash
pip install yt-dlp
sudo apt install ffmpeg
```

If you prefer not to install ffmpeg globally, drop the `ffmpeg` binary into a folder named
`ffmpeg/` in the project root (or next to the app). The server detects it automatically.

## Getting started

```bash
git clone https://github.com/S0x2/Video-Downloder.git
cd Video-Downloder
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Paste a video URL into the input field (use the **Paste** button or `⌘/Ctrl`+`V`).
2. Click **Analyze link** (or press `Enter`) to see a large preview with the title,
   thumbnail, source, and duration.
3. Choose a quality preset in the segmented picker (and optionally enable **Force MP4**).
4. Click **Download** (or press `⌘/Ctrl`+`Enter`) — the file is saved to your device
   when it finishes, and progress is shown as a ring on the preview.
5. Use **New link** to fetch another video with the same settings, **Reset** (or `Esc`)
   to start fresh, and the top-right toggle to switch between light, dark, and system themes.

## One-click launcher (Windows)

Instead of opening a terminal every time, you can start the app with a single
double-click:

1. Copy `start-downloader.bat.example` and rename the copy to
   `start-downloader.bat`.
2. Open it in a text editor and set `PROJECT_DIR` to this project's full path.
3. Move the copy anywhere convenient (Desktop, taskbar, etc.) and double-click
   it whenever you want to download something.

It starts the server hidden (no lingering console window), opens the downloader
in your browser, and closes its own window. If the server is already running it
just opens the browser. Your personal copy is git-ignored so your local path
never gets committed.

To shut the server down, do the same with `stop-downloader.bat.example` — copy
it to `stop-downloader.bat` and double-click it whenever you want to stop the
server. (This one needs no path editing.)

## Configuration

The app can be configured through environment variables:

| Variable      | Description                                        | Default             |
| ------------- | -------------------------------------------------- | ------------------- |
| `PORT`        | Port the server listens on                         | `3000`              |
| `YTDLP_PATH`  | Path to the yt-dlp binary if it isn't on `PATH`    | `yt-dlp`            |
| `FFMPEG_DIR`  | Directory containing the ffmpeg binary             | auto-detected       |

Example:

```bash
YTDLP_PATH=./yt-dlp.exe PORT=8080 npm start
```

## Project structure

```
.
├── public/            # Frontend (served as static files)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/               # Backend
│   ├── server.js      # Express app and routes
│   ├── downloader.js  # yt-dlp process handling
│   ├── jobs.js        # In-memory job tracking
│   └── config.js      # Paths, formats, and settings
└── package.json
```

## How it works

The frontend sends the URL to the Express backend, which spawns `yt-dlp` as a child
process. Download progress is parsed from yt-dlp's output and streamed back to the browser
over Server-Sent Events. Finished files are written to a temporary directory, served to the
browser, and deleted immediately after the download completes.

## Notes

This project is intended for personal use. Please respect the copyright and terms of
service of the sites you download from.

## License

Proprietary — personal use only. You may view the source and run the app for
your own personal, non-commercial use. Modifying, redistributing, or using it
commercially is not permitted without written permission. See [LICENSE](LICENSE)
for the full terms.
