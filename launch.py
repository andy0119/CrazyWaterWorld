from pathlib import Path
import json
import socket
import threading
import urllib.request
import webbrowser
import uvicorn

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8000'

def main():
    with socket.socket() as probe:
        busy = probe.connect_ex(('127.0.0.1', 8000)) == 0
    if busy:
        try:
            with urllib.request.urlopen(URL + '/api/health', timeout=3) as response:
                existing = json.load(response)
            if existing.get('mode') == 'rebuild-demo':
                webbrowser.open(URL)
                return
        except Exception:
            pass
        raise SystemExit('Port 8000 is in use. Close the other application and try again.')
    def open_when_ready():
        import time
        for _ in range(60):
            try:
                with urllib.request.urlopen(URL + '/api/health', timeout=1) as response:
                    if response.status == 200:
                        webbrowser.open(URL)
                        return
            except Exception:
                time.sleep(0.5)
    threading.Thread(target=open_when_ready, daemon=True).start()
    print('Aurora: ' + URL + '\nKeep this window open. Press Ctrl+C to stop.')
    uvicorn.run('app:app', app_dir=str(ROOT / 'backend'), host='127.0.0.1', port=8000)

if __name__ == '__main__':
    main()
