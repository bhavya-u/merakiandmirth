"""Serve the production-compatible local bundle without stale browser caching."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # A preview must never answer 304 based on an older build's timestamp.
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        super().do_GET()

if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent / 'dist'
    server = ThreadingHTTPServer(('127.0.0.1', 4173), partial(PreviewHandler, directory=str(root)))
    print('Production-backed local preview: http://localhost:4173/ (cache disabled)', flush=True)
    server.serve_forever()
