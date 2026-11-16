# Extensions

Personal Chrome extensions (Manifest V3), loaded unpacked via `chrome://extensions` → Developer mode → Load unpacked.

## FitVideoWidth

Scales the currently playing video to the full width of the browser window. Toggle with the toolbar icon or **Alt+Shift+F**; **Esc** exits. Works with videos inside iframes and shadow DOM.

## YTAudio (Video & Audio Download)

Toolbar menu (**Alt+Shift+A**) that downloads the video or audio of the current page. It sends the page URL to a local native-messaging host, which runs [yt-dlp](https://github.com/yt-dlp/yt-dlp), so it works on YouTube and most other sites yt-dlp supports.

- **Video:** MP4, MKV or WebM, at best available quality or capped at 4K, 1440p, 1080p, 720p, 480p or 360p. Saved to `~/Videos/Video Downloads`.
- **Audio only:** MP3, M4A, FLAC, 24-bit WAV (for mixing) or the original Opus stream. Saved to `~/Music/YouTube Audio`.
- Progress with speed and time left, a Cancel button (no partial files left behind), and "Show in folder" when done.
- Sites that show a captcha or login ("you appear to be a bot") fail with a hint; solve it on the page, then press **Retry with my browser session**. The extension asks once per site for permission to read that site's cookies and passes them to yt-dlp for that one download.
- YouTube sometimes answers HTTP 403 partway through a stream; the host retries and resumes automatically. If downloads keep failing, the popup offers an "Update yt-dlp" button, which fixes most breakage.

Works in Chrome and Brave on Windows. Setup:

1. Install the tools: `winget install yt-dlp.yt-dlp Gyan.FFmpeg DenoLand.Deno Python.Python.3.13` (Python must be on `PATH`).
2. Load `YTAudio/extension` as an unpacked extension.
3. Run `YTAudio/host/install.ps1` to register the host. Re-run it if you move the folder.

## ImprovedHistory

Remembers Facebook and Instagram videos you've seen, so you can get back to them after scrolling away. Every video that starts playing (including autoplay while scrolling) is saved with its post/reel link, caption snippet and thumbnail; reel feeds are recorded as you swipe. The toolbar menu lists them newest first with search and a site filter. Stored locally in the browser (last 2,000 items).
