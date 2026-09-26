#!/usr/bin/env python3
"""Build tool for Our Town. Python 3 stdlib only.

    python3 tools/build.py            # run every step
    python3 tools/build.py icons      # just the home-screen icons
    python3 tools/build.py precache --check   # exit 1 if sw.js's precache block is stale

Steps:
  icons     assets/icons/icon-{180,192,512}.png          (placeholder, P1.1)
  art       rig.json, room layer + prop WebPs, art-manifest.json, contact sheet
            (node tools/art/build.mjs, headless Chrome; P1.12)
  precache  the VERSION + FILES block in sw.js (content hash) (P1.2)

Each step is a function taking ROOT and returning a list of files it wrote, so
the precache step can run last and hash everything the earlier steps made.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))


def step_icons(root):
    from art.icons import build_icons
    return build_icons(os.path.join(root, 'assets', 'icons'))


def step_art(root):
    """Rig data, room layer and prop WebPs, art-manifest.json and the contact
    sheet, from the Node sources in tools/art/ (needs node 22+ and Chrome)."""
    import subprocess
    proc = subprocess.run(['node', os.path.join(root, 'tools', 'art', 'build.mjs')],
                          cwd=root, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout + proc.stderr)
        raise SystemExit('art step failed')
    wrote = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if line.startswith('wrote '):
            wrote.append(os.path.join(root, line[len('wrote '):]))
        elif line:
            print('  ' + line)
    return wrote


# What ships to the iPad. Everything else in the repo (archive/, art-bakeoff/,
# spikes/, tests/, tools/, docs/, dotfiles) stays off the device.
SHIP_FILES = ['index.html', 'manifest.webmanifest']
SHIP_DIRS = ['src', 'assets', 'data']
PRECACHE_BEGIN = '// BEGIN PRECACHE'
PRECACHE_END = '// END PRECACHE'
PRECACHE_BUDGET = 15 * 1024 * 1024   # docs/design.md section 6


def shipped_files(root):
    """Sorted repo-relative paths (forward slashes) of every shipped file."""
    out = [f for f in SHIP_FILES if os.path.isfile(os.path.join(root, f))]
    for top in SHIP_DIRS:
        for dirpath, dirnames, filenames in os.walk(os.path.join(root, top)):
            dirnames[:] = sorted(d for d in dirnames if not d.startswith('.') and d != '__pycache__')
            for name in filenames:
                if name.startswith('.') or name.endswith(('.py', '.pyc')):
                    continue
                out.append(os.path.relpath(os.path.join(dirpath, name), root).replace(os.sep, '/'))
    return sorted(out)


def _split_sw(text):
    """(before, generated block, after) of sw.js around the PRECACHE markers."""
    i = text.index(PRECACHE_BEGIN)
    j = text.index(PRECACHE_END)
    k = text.index('\n', i) + 1
    return text[:k], text[k:j], text[j:]


def precache_block(root):
    """(version, files, generated sw.js block). The version hashes every
    shipped file's path and bytes plus sw.js itself minus this block, so any
    change to what the iPad runs gives a new cache name and a new sw.js."""
    import hashlib
    import json
    files = shipped_files(root)
    h = hashlib.sha256()
    total = 0
    for rel in files:
        with open(os.path.join(root, rel), 'rb') as f:
            data = f.read()
        total += len(data)
        h.update(rel.encode() + b'\0' + hashlib.sha256(data).digest())
    with open(os.path.join(root, 'sw.js'), encoding='utf-8') as f:
        before, _, after = _split_sw(f.read())
    h.update(b'sw.js\0' + (before + after).encode())
    version = h.hexdigest()[:10]
    urls = ['./'] + ['./' + rel for rel in files]
    block = "var VERSION = '%s';\nvar FILES = [\n%s\n];\n" % (
        version, ',\n'.join('  ' + json.dumps(u) for u in urls))
    return version, urls, block, total


def step_precache(root, check=False):
    """Rewrite the generated VERSION/FILES block in sw.js. With check=True,
    write nothing and exit non-zero if the block is out of date."""
    version, urls, block, total = precache_block(root)
    sw = os.path.join(root, 'sw.js')
    with open(sw, encoding='utf-8') as f:
        text = f.read()
    before, current, after = _split_sw(text)
    print('  precache: %d files, %.1f KB, version %s' % (len(urls), total / 1024.0, version))
    if total > PRECACHE_BUDGET:
        print('  WARNING: precache is over the %d MB budget' % (PRECACHE_BUDGET // (1024 * 1024)))
    if check:
        if current != block:
            print('  sw.js precache block is STALE: run `python3 tools/build.py precache`')
            raise SystemExit(1)
        print('  sw.js precache block is up to date')
        return []
    if current == block:
        return []
    with open(sw, 'w', encoding='utf-8') as f:
        f.write(before + block + after)
    return [sw]


STEPS = {'icons': step_icons, 'art': step_art, 'precache': step_precache}
ORDER = ['icons', 'art', 'precache']


def main(argv):
    if '--check' in argv:
        # Only precache has a check mode; used by tests/unit/precache.test.mjs.
        step_precache(ROOT, check=True)
        return 0
    names = argv or ORDER
    unknown = [n for n in names if n not in STEPS]
    if unknown:
        print('unknown step(s): %s. Steps: %s' % (', '.join(unknown), ', '.join(ORDER)))
        return 2
    for name in names:
        print('%s:' % name)
        for path in STEPS[name](ROOT):
            print('  wrote %s' % os.path.relpath(path, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
