"""Set up the project dependencies using an isolated local virtual environment."""
from pathlib import Path
import shutil
import subprocess
import sys
import venv

ROOT=Path(__file__).resolve().parent

def run(command):
    subprocess.run(command,cwd=ROOT,check=True)

def main():
    if sys.version_info < (3,12):
        raise SystemExit('Python 3.12 or newer is required. Install Python 3.12 and retry.')
    node=shutil.which('node')
    npm=shutil.which('npm.cmd') or shutil.which('npm')
    if not node or not npm:
        raise SystemExit('Install Node.js 22 or newer (including npm), then reopen this installer.')
    version=subprocess.check_output([node,'--version'],text=True).strip()
    if int(version.lstrip('v').split('.')[0])<22:
        raise SystemExit('Node.js 22 or newer is required.')
    python=ROOT/'.venv'/'Scripts'/'python.exe'
    if not python.exists():
        print('Creating project Python environment...',flush=True)
        venv.EnvBuilder(with_pip=True).create(ROOT/'.venv')
    print('Installing Python dependencies...',flush=True)
    run([str(python),'-m','pip','install','-r',str(ROOT/'backend/requirements.txt')])
    for name in ['wx-game','douyin-game']:
        print('Installing '+name+' dependencies...',flush=True)
        run([npm,'install','--prefix',str(ROOT/'backend'/name)])
    print('\nDependencies installed. Double-click Start-Aurora.cmd to open the website.')
    print('Existing databases, local SDK configuration and account sessions were not changed.')

if __name__=='__main__':
    try:main()
    except (subprocess.CalledProcessError,OSError) as exc:
        raise SystemExit('Installation failed. Check your network and the error above, then retry. ('+type(exc).__name__+')')
