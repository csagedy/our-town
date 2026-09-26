#!/usr/bin/env python3
"""Build tool for Our Town. Python 3 stdlib only.

    python3 tools/build.py            # run every step
    python3 tools/build.py icons      # just the home-screen icons

Steps (only `icons` is real so far; the rest are stubs owned by later beads):
  icons     assets/icons/icon-{180,192,512}.png          (placeholder, P1.1)
  art       palette-driven SVG rooms and sprites          (P1.12)
  precache  precache-manifest.json with content hashes    (P1.2)

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
    print('  art: not implemented yet (P1.12)')
    return []


def step_precache(root):
    print('  precache: not implemented yet (P1.2)')
    return []


STEPS = {'icons': step_icons, 'art': step_art, 'precache': step_precache}
ORDER = ['icons', 'art', 'precache']


def main(argv):
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
