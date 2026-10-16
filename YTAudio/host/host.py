"""Chrome native messaging host: downloads the best audio stream of a YouTube URL with yt-dlp.

Receives {"url": ...}, streams back {"progress": "42%"}, then {"done": true, "file": ...} or {"error": ...}.
"""
import json
import os
import re
import struct
import subprocess
import sys

LINKS = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Links')
YTDLP = os.path.join(LINKS, 'yt-dlp.exe')
DENO = os.path.join(LINKS, 'deno.exe')
OUT_DIR = os.path.join(os.path.expanduser('~'), 'Music', 'YouTube Audio')
CREATE_NO_WINDOW = 0x08000000


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    (length,) = struct.unpack('<I', raw)
    return json.loads(sys.stdin.buffer.read(length).decode('utf-8'))


def send(obj):
    data = json.dumps(obj).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(data)) + data)
    sys.stdout.buffer.flush()


def open_in_explorer(path):
    """Show the file selected in Explorer, or the download folder if it's gone."""
    if os.path.isfile(path):
        subprocess.Popen(f'explorer /select,"{path}"')
    else:
        os.makedirs(OUT_DIR, exist_ok=True)
        subprocess.Popen(['explorer', OUT_DIR])


def main():
    msg = read_message() or {}
    if msg.get('open'):
        open_in_explorer(msg['open'])
        send({'ok': True})
        return
    url = msg.get('url')
    if not url:
        send({'error': 'no URL received'})
        return
    os.makedirs(OUT_DIR, exist_ok=True)

    cmd = [
        YTDLP, url,
        '--no-playlist',
        '-f', 'bestaudio',
        '-x',  # extract audio without re-encoding (keeps original quality)
        '--embed-metadata', '--embed-thumbnail',
        '--js-runtimes', f'deno:{DENO}',
        '--ffmpeg-location', LINKS,
        '-o', os.path.join(OUT_DIR, '%(title)s [%(id)s].%(ext)s'),
        '--encoding', 'utf-8',
        '--newline', '--progress',
        '--progress-template', 'download:PROGRESS %(progress._percent_str)s',
        '--no-simulate', '--print', 'after_move:FILE %(filepath)s',
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            creationflags=CREATE_NO_WINDOW, encoding='utf-8', errors='replace')

    file_path, last_error, last_pct = None, None, None
    for line in proc.stdout:
        line = line.strip()
        if line.startswith('PROGRESS'):
            m = re.search(r'(\d+)(?:\.\d+)?%', line)
            if m and m.group(1) != last_pct:
                last_pct = m.group(1)
                send({'progress': f'{last_pct}%'})
        elif line.startswith('FILE '):
            file_path = line[5:]
        elif line.startswith('ERROR'):
            last_error = line
    proc.wait()

    if proc.returncode == 0 and file_path:
        send({'done': True, 'file': file_path})
        open_in_explorer(file_path)
    else:
        send({'error': last_error or f'yt-dlp exited with code {proc.returncode}'})


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # report instead of dying silently
        send({'error': repr(e)})
