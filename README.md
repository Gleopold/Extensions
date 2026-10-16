# Extensions

Personal Chrome extensions (Manifest V3), loaded unpacked via `chrome://extensions` → Developer mode → Load unpacked.

## FitVideoWidth

Scales the currently playing video to the full width of the browser window. Toggle with the toolbar icon or **Alt+Shift+F**; **Esc** exits. Works with videos inside iframes and shadow DOM.

## YTAudio

Toolbar menu (**Alt+Shift+A**) with a "Download audio" button that sends the current YouTube URL to a local native-messaging host, which runs [yt-dlp](https://github.com/yt-dlp/yt-dlp) to save the best audio stream to `~/Music/YouTube Audio`.

Works in Chrome and Brave. Setup: install yt-dlp (`winget install yt-dlp.yt-dlp`), load `YTAudio/extension`, then run `YTAudio/host/install.ps1` to register the host. `host.bat` hardcodes the Python path; adjust it for your machine.

**Status:** not working as of 2026-10. YouTube now returns HTTP 403 for downloads without proof-of-origin (PO) tokens, so yt-dlp can't fetch the audio stream.
