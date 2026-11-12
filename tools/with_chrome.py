#!/usr/bin/env python3
"""Run any of the Python test scripts in the installed Chrome (or Edge) instead of Playwright's own Chromium:

  python tools/with_chrome.py games/spacemouse/tests/reach.py --res 1
  PIXELITE_BROWSER_CHANNEL=msedge python tools/with_chrome.py tests/smoke.py --all

For machines where `python -m playwright install chromium` was not run (a Windows checkout, say). It only adds
channel='chrome' to every browser launch; the scripts are not changed.
"""
import os, runpy, sys
channel = os.environ.get('PIXELITE_BROWSER_CHANNEL') or 'chrome'
from playwright import async_api, sync_api
for mod in (async_api, sync_api):
    orig = mod.BrowserType.launch
    def launch(self, *a, _orig=orig, **kw):
        if not kw.get('channel'): kw['channel'] = channel
        return _orig(self, *a, **kw)
    mod.BrowserType.launch = launch
if len(sys.argv) < 2: sys.exit(__doc__)
script = sys.argv[1]
sys.argv = sys.argv[1:]
sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
runpy.run_path(script, run_name='__main__')
