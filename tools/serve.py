#!/usr/bin/env python3
"""Local dev server. Python 3 stdlib only.

    python3 tools/serve.py                # http://127.0.0.1:8124/
    python3 tools/serve.py --port 0       # pick a free port (the test harness does this)
    python3 tools/serve.py --lan          # also reachable from an iPad on the same Wi-Fi

Sends no-cache headers so edits show on reload, and correct MIME types for
ES modules, the web manifest and audio clips. Note: a service worker only
registers on a secure context, which includes localhost but NOT the Mac's LAN
address, so offline behavior can't be checked on an iPad through --lan.
"""
import argparse
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
        '.m4a': 'audio/mp4',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if not self.server.quiet:
            super().log_message(fmt, *args)


class Server(http.server.ThreadingHTTPServer):
    # The stdlib default listen backlog is 5. Chrome fetches an ES module graph
    # over several parallel connections (HTTP/1.0: one per request), and when
    # the machine is busy the server thread can't accept() fast enough: the
    # full queue makes macOS reset connections (net::ERR_CONNECTION_RESET on a
    # module, so boot never runs). Flaky e2e tests, bead dollhouse-game-mhf.17.
    request_queue_size = 256
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8124)
    ap.add_argument('--lan', action='store_true', help='bind 0.0.0.0 instead of 127.0.0.1')
    ap.add_argument('--quiet', action='store_true', help='no per-request log lines')
    ap.add_argument('--root', default=ROOT, help='directory to serve (tests serve a temp copy)')
    args = ap.parse_args()

    host = '0.0.0.0' if args.lan else '127.0.0.1'
    handler = functools.partial(Handler, directory=os.path.abspath(args.root))
    httpd = Server((host, args.port), handler)
    httpd.quiet = args.quiet
    port = httpd.server_address[1]
    # The test harness reads this exact line to learn the port.
    print('Serving on http://127.0.0.1:%d/' % port, flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
