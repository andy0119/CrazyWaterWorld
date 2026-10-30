"""Offline regression suite. Never opens a game session or sends game requests."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import shutil
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parent
node = os.environ.get('AURORA_NODE') or shutil.which('node')
if not node:
    bundled = Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    node = str(bundled) if bundled.is_file() else None
if not node:
    raise SystemExit('Node.js is required; install Node.js 22 LTS or set AURORA_NODE.')

def run(path):
    try:
        r = subprocess.run([node,str(path)],capture_output=True,text=True,encoding='utf-8',timeout=20,cwd=ROOT.parent)
        return path.name,r.returncode,r.stdout+r.stderr
    except subprocess.TimeoutExpired:
        return path.name,1,'Timed out after 20 seconds'

failed=[]
with ThreadPoolExecutor(max_workers=4) as pool:
    for name,status,output in pool.map(run,sorted(ROOT.glob('test_*.mjs'))):
        print(('FAIL ' if status else 'PASS ')+name)
        if status:
            print(output)
            failed.append(name)
result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover(str(ROOT),pattern='test_*.py'))
print(f'Node: {len(list(ROOT.glob("test_*.mjs")))-len(failed)} passed, {len(failed)} failed; Python: {result.testsRun} tests.')
sys.exit(1 if failed or not result.wasSuccessful() else 0)
