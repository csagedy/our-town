#!/usr/bin/env python3
"""Run the self-test: build, inject tools/selftest.js, drive it in headless
Chrome, print the results."""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def main():
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py")],
                   check=True, capture_output=True)
    html = open(os.path.join(ROOT, "index.html")).read()
    test = open(os.path.join(ROOT, "tools", "selftest.js")).read()
    html = html.replace("</body>", "<script>%s</script></body>" % test)
    tmp = os.path.join(ROOT, "_selftest.html")
    open(tmp, "w").write(html)
    try:
        out = subprocess.run(
            [CHROME, "--headless", "--disable-gpu", "--virtual-time-budget=14000",
             "--dump-dom", "--window-size=1400,950", "file://" + tmp],
            capture_output=True, text=True, timeout=90).stdout
    finally:
        os.remove(tmp)

    m = re.search(r'data-test="([^"]*)"', out)
    if not m:
        print("no test output -- the page probably threw before it ran")
        for line in re.findall(r'(?i)(uncaught[^<]{0,200})', out)[:5]:
            print("  ", line)
        return 2
    results = json.loads(m.group(1).replace("&quot;", '"').replace("&amp;", "&")
                         .replace("&lt;", "<").replace("&gt;", ">"))
    bad = 0
    for r in results:
        if not r.startswith("PASS"):
            bad += 1
        print(" ", r)
    print("\n%d checks, %d problem(s)" % (len(results), bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
