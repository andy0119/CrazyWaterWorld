"""Resolve Node without requiring the original developer machine."""
import os,shutil
from pathlib import Path

def node_executable():
 configured=os.getenv('AURORA_NODE')
 if configured:return configured
 installed=shutil.which('node')
 if installed:return installed
 bundled=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
 return str(bundled) if bundled.is_file() else 'node'
