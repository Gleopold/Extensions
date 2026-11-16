"""Chrome native messaging host: downloads video or audio from a page URL with yt-dlp.

Messages in:
  {"url": ..., "format": "mp4" | "mkv" | "webm" | "mp3" | "m4a" | "flac" | "wav" | "original",
   "quality": "best" | "2160" | "1440" | "1080" | "720" | "480" | "360"}   (quality: video only)
  {"cancel": true}          (on the same port, while a download runs)
  {"open": path}            show a file in Explorer
  {"update": true}          update yt-dlp itself
Messages out:
  {"progress": "42", "speed": ..., "eta": ..., "part": "video" | "audio" | ""}
  {"stage": "Merging"}
  {"done": true, "file": ...} | {"error": ...} | {"cancelled": true}
"""
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time

LINKS = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Links')
YTDLP = os.path.join(LINKS, 'yt-dlp.exe')
DENO = os.path.join(LINKS, 'deno.exe')
HOME = os.path.expanduser('~')
AUDIO_DIR = os.path.join(HOME, 'Music', 'YouTube Audio')
VIDEO_DIR = os.path.join(HOME, 'Videos', 'Video Downloads')
CREATE_NO_WINDOW = 0x08000000
ATTEMPTS = 4
VIDEO_FORMATS = ('mp4', 'mkv', 'webm')
HEIGHTS = ('2160', '1440', '1080', '720', '480', '360')

STAGES = {
    'Merger': 'Merging video and audio',
    'ExtractAudio': 'Converting audio',
    'VideoRemuxer': 'Converting video',
    'VideoConvertor': 'Converting video',
    'EmbedThumbnail': 'Adding thumbnail',
    'Metadata': 'Adding metadata',
}

send_lock = threading.Lock()


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    (length,) = struct.unpack('<I', raw)
    return json.loads(sys.stdin.buffer.read(length).decode('utf-8'))


def send(obj):
    data = json.dumps(obj).encode('utf-8')
    with send_lock:
        try:
            sys.stdout.buffer.write(struct.pack('<I', len(data)) + data)
            sys.stdout.buffer.flush()
        except OSError:
            pass  # browser already closed the pipe


def open_in_explorer(path):
    """Show the file selected in Explorer, or its folder if the file is gone."""
    if os.path.isfile(path):
        subprocess.Popen(f'explorer /select,"{path}"')
        return
    folder = os.path.dirname(path)
    if not os.path.isdir(folder):
        folder = AUDIO_DIR
        os.makedirs(folder, exist_ok=True)
    subprocess.Popen(['explorer', folder])


def update_ytdlp():
    result = subprocess.run([YTDLP, '-U'], capture_output=True, creationflags=CREATE_NO_WINDOW,
                            encoding='utf-8', errors='replace')
    lines = [l.strip() for l in (result.stdout + result.stderr).splitlines() if l.strip()]
    text = lines[-1] if lines else f'yt-dlp exited with code {result.returncode}'
    send({'ok': result.returncode == 0, 'message': text})


def build_command(url, fmt, quality, temp_dir, cookie_path=None):
    if fmt in VIDEO_FORMATS:
        out_dir = VIDEO_DIR
        height = quality if quality in HEIGHTS else None  # None = best available
        res = f'res:{height}' if height else 'res'
        if fmt == 'mp4':
            # Up to 1080p prefer H.264 + AAC, which plays and edits everywhere.
            # Above that only AV1/VP9 exist on YouTube, so take the resolution whatever the codec.
            compatible = height and int(height) <= 1080
            selection = ['-f', 'bv*+ba/b', '-S', f'{res},vcodec:h264,acodec:aac' if compatible else res,
                         '--merge-output-format', 'mp4', '--embed-thumbnail']
        elif fmt == 'mkv':
            # MKV holds any codec, so this is the untouched best streams.
            selection = ['-f', 'bv*+ba/b', '-S', res, '--merge-output-format', 'mkv', '--embed-thumbnail']
        else:  # webm
            # Take native WebM streams (VP9/AV1 + Opus) when the site has them;
            # otherwise re-encode, which is slow. WebM can't hold a thumbnail.
            selection = ['-f', 'bv*[ext=webm]+ba[ext=webm]/b[ext=webm]/bv*+ba/b', '-S', res,
                         '--recode-video', 'webm']
        selection += ['--embed-chapters']
    else:
        out_dir = AUDIO_DIR
        selection = ['-f', 'bestaudio/best', '-x']
        if fmt == 'wav':
            # Decode to 24-bit PCM at the source sample rate, for DAWs. WAV can't hold a thumbnail.
            selection += ['--audio-format', 'wav', '--postprocessor-args', 'ExtractAudio:-c:a pcm_s24le']
        elif fmt == 'mp3':
            selection += ['--audio-format', 'mp3', '--audio-quality', '0', '--embed-thumbnail']
        elif fmt == 'm4a':
            # Prefer a native AAC stream so nothing is re-encoded.
            selection = ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '-x',
                         '--audio-format', 'm4a', '--embed-thumbnail']
        elif fmt == 'flac':
            selection += ['--audio-format', 'flac', '--embed-thumbnail']
        else:
            # Keep the original stream (usually Opus) without re-encoding.
            selection += ['--embed-thumbnail']

    os.makedirs(out_dir, exist_ok=True)
    return [
        YTDLP, url,
        '--no-playlist',
        *(['--cookies', cookie_path] if cookie_path else []),
        '--force-overwrites',  # "Download again" replaces the earlier file instead of skipping
        # Many sites throttle one long connection to ~1 MB/s after a short burst.
        # Asking for the file in 10 MB pieces avoids that (measured about 9x faster).
        '--http-chunk-size', '10M',
        *selection,
        '--embed-metadata',
        '--no-mtime',  # file date = download date, so it sorts to the top of the folder
        '--js-runtimes', f'deno:{DENO}',
        '--ffmpeg-location', LINKS,
        # Partial files live in a throwaway folder, so a cancelled or failed download leaves nothing behind.
        '-P', f'home:{out_dir}', '-P', f'temp:{temp_dir}',
        '-o', '%(title).150B [%(id)s].%(ext)s',
        '--encoding', 'utf-8',
        '--newline', '--progress',
        '--progress-template',
        'download:PROGRESS|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.vcodec)s',
        '--progress-template', 'postprocess:POST|%(progress.postprocessor)s|%(progress.status)s',
        '--no-simulate', '--print', 'after_move:FILE %(filepath)s',
    ]


def download(url, fmt, quality, cookies=None):
    is_video = fmt in VIDEO_FORMATS
    temp_dir = tempfile.mkdtemp(prefix='ytaudio-')
    cookie_path = None
    if cookies:
        # The browser's session for this site (e.g. after solving a captcha). It lives in the
        # temp folder only, which is deleted when the download ends.
        cookie_path = os.path.join(temp_dir, 'cookies.txt')
        with open(cookie_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(cookies)
    command = build_command(url, fmt, quality, temp_dir, cookie_path)
    cancelled = threading.Event()
    current = {}  # 'proc': the running yt-dlp

    def watch_stdin():
        # A cancel message, or the browser closing the port, stops yt-dlp and its ffmpeg children.
        while True:
            try:
                msg = read_message()
            except Exception:
                msg = None
            if msg is None or msg.get('cancel'):
                cancelled.set()
                proc = current.get('proc')
                if proc and proc.poll() is None:
                    subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)],
                                   capture_output=True, creationflags=CREATE_NO_WINDOW)
                return

    threading.Thread(target=watch_stdin, daemon=True).start()

    def run_once():
        """Runs yt-dlp once, relaying progress. Returns (exit code, saved file, last error)."""
        # stdin must not be inherited: the watcher thread blocks reading the browser's pipe,
        # and on Windows yt-dlp then hangs at startup when it touches that same handle.
        proc = current['proc'] = subprocess.Popen(
            command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            creationflags=CREATE_NO_WINDOW, encoding='utf-8', errors='replace')
        file_path, last_error, last_sent, last_time = None, None, None, 0.0
        for line in proc.stdout:
            line = line.strip()
            if line.startswith('PROGRESS|'):
                _, pct, speed, eta, vcodec = (line.split('|') + [''] * 5)[:5]
                m = re.search(r'(\d+)(?:\.\d+)?%', pct)
                if not m:
                    continue
                part = ('audio' if vcodec.strip() == 'none' else 'video') if is_video else ''
                speed, eta = speed.strip(), eta.strip()
                if 'Unknown' in speed or speed == 'NA':
                    speed = ''
                if 'Unknown' in eta or eta == 'NA':
                    eta = ''
                # Send on every new percent, and at least once a second so speed and time left
                # stay live on slow downloads instead of looking frozen.
                key = (m.group(1), part)
                now = time.monotonic()
                if key != last_sent or now - last_time >= 1:
                    last_sent, last_time = key, now
                    send({'progress': m.group(1), 'speed': speed, 'eta': eta, 'part': part})
            elif line.startswith('POST|'):
                _, name, status = (line.split('|') + [''] * 3)[:3]
                if status == 'started' and name in STAGES:
                    send({'stage': STAGES[name]})
            elif line.startswith('FILE '):
                file_path = line[5:]
            elif line.startswith('ERROR'):
                last_error = re.sub(r'^ERROR:\s*', '', line)
        return proc.wait(), file_path, last_error

    # YouTube sometimes answers 403 partway through a stream. A fresh attempt gets new
    # stream URLs and resumes the partial file, so retry those a few times before giving up.
    for attempt in range(1, ATTEMPTS + 1):
        code, file_path, last_error = run_once()
        if code == 0 or cancelled.is_set() or attempt == ATTEMPTS or '403' not in (last_error or ''):
            break
        send({'stage': f'Connection refused, retrying ({attempt + 1}/{ATTEMPTS})'})
        time.sleep(2)
    shutil.rmtree(temp_dir, ignore_errors=True)

    if code == 0 and file_path:
        send({'done': True, 'file': file_path})
        open_in_explorer(file_path)
    elif cancelled.is_set():
        send({'cancelled': True})
    else:
        error = last_error or f'yt-dlp exited with code {code}'
        # Bot checks, captchas, rate limits and logins: the browser's own session can fix these.
        needs_cookies = bool(re.search(
            r'(?i)\bbots?\b|captcha|rate.?limit|\b429\b|too many requests|sign in|log ?in|--cookies|short video ID', error))
        send({'error': error, 'needsCookies': needs_cookies and not cookies})


def main():
    msg = read_message() or {}
    if msg.get('open'):
        open_in_explorer(msg['open'])
        send({'ok': True})
    elif msg.get('update'):
        update_ytdlp()
    elif msg.get('url'):
        download(msg['url'], msg.get('format') or 'mp4', str(msg.get('quality') or 'best'),
                 msg.get('cookies'))
    else:
        send({'error': 'no URL received'})


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # report instead of dying silently
        send({'error': repr(e)})
    # Skip normal shutdown: the stdin watcher thread may still be blocked in a read,
    # which makes the interpreter crash while finalizing.
    os._exit(0)
