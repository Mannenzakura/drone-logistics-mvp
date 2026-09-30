"""Local-only UI and API for the standalone airport model."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
from threading import Lock
from urllib.parse import urlsplit
from uuid import uuid4
from model import DEFAULT, simulate
from live_model import AirportSimulation

ROOT = Path(__file__).resolve().parent
SESSIONS = {}
SESSION_LOCK = Lock()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        vendor = {"/vendor/three.module.js": ROOT / "node_modules" / "three" / "build" / "three.module.js",
                  "/vendor/three.core.js": ROOT / "node_modules" / "three" / "build" / "three.core.js",
                  "/vendor/OrbitControls.js": ROOT / "node_modules" / "three" / "examples" / "jsm" / "controls" / "OrbitControls.js"}
        if path in vendor:
            body = vendor[path].read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
        elif path in ("/", "/style.css", "/scene.css", "/detail.css", "/app.js", "/web_model.js", "/scene3d.js", "/scene.svg"):
            name = "index.html" if path == "/" else path[1:]
            body = (ROOT / name).read_bytes()
            self.send_response(200)
            content_type = {"index.html": "text/html", "style.css": "text/css", "scene.css": "text/css", "detail.css": "text/css", "app.js": "application/javascript", "web_model.js": "application/javascript", "scene3d.js": "application/javascript", "scene.svg": "image/svg+xml"}[name]
            self.send_header("Content-Type", content_type + "; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
        elif path in ("/hour/", "/hour/index.html", "/hour/hour.css", "/hour/hour.js"):
            name = "hour/index.html" if path == "/hour/" else path[1:]
            body = (ROOT / name).read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ("text/html" if name.endswith(".html") else "text/css" if name.endswith(".css") else "application/javascript") + "; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
        elif path == "/api/default":
            body = json.dumps(DEFAULT, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
        else:
            self.send_error(404)
            return
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ("/api/simulate", "/api/sim/start", "/api/sim/step", "/api/sim/action"):
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n > 100_000 or n <= 0:
                raise ValueError("请求体长度无效")
            data = json.loads(self.rfile.read(n))
            if path == "/api/simulate":
                result = simulate(data)
            elif path == "/api/sim/start":
                sim = AirportSimulation(data)
                session_id = uuid4().hex
                with SESSION_LOCK:
                    SESSIONS[session_id] = sim
                    result = sim.step(compact=True)
                result["session_id"] = session_id
            else:
                session_id = data.get("session_id")
                with SESSION_LOCK:
                    sim = SESSIONS.get(session_id)
                    if sim is None:
                        raise ValueError("仿真会话不存在，请重新开始")
                    result = sim.step(compact=True) if path == "/api/sim/step" else sim.action(data.get("action"))
                    if path == "/api/sim/action":
                        result["timeline"] = result["timeline"][-1:]
                        result["timeline_start"] = sim.minute
                result["session_id"] = session_id
            code = 200
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            result = {"error": str(exc)}
            code = 400
        body = json.dumps(result, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8770), Handler)
    print("机场模型：http://127.0.0.1:8770/")
    server.serve_forever()
