#!/usr/bin/env python3
"""Serve the rollout picker and persist selections."""
from __future__ import annotations

import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SELECTION = ROOT / "selection.json"
PORT = 8777


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path != "/api/selection":
            self.send_error(404)
            return
        length = int(self.headers["Content-Length"])
        payload = json.loads(self.rfile.read(length))
        SELECTION.write_text(json.dumps(payload, indent=2) + "\n")
        body = json.dumps({"ok": True, "path": str(SELECTION)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}")


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Rollout picker: http://127.0.0.1:{PORT}/", flush=True)
    print(f"Serving {ROOT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
