"""Build the downloadable source bundle for the airport sandbox page."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


LOCAL = Path(__file__).resolve().parent
WEB = Path(r"C:\Users\35499\Documents\Codex\2026-09-16\ni\public\airport-sandbox")
OUTPUT = WEB / "downloads" / "airport-live-source-2026-09-28.zip"
LOCAL_FILES = [
    "README.md", "app.js", "detail.css", "index.html", "live_model.py",
    "model.py", "package.json", "package-lock.json", "package_source.py",
    "scene.css", "scene.svg", "scene3d.js", "server.py", "style.css",
    "web_model.js", "tests/check_web_model.mjs", "tests/check_hour_rollup.mjs", "tests/test_live_model.py",
    "tests/test_model.py", "hour/index.html", "hour/hour.css", "hour/hour.js",
]
WEB_FILES = [
    "app.js", "detail.css", "index.html", "scene.css", "scene.svg",
    "scene3d.js", "style.css", "web_model.js", "hour/index.html", "hour/hour.css", "hour/hour.js",
]


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as bundle:
        for name in LOCAL_FILES:
            bundle.write(LOCAL / name, "python/" + name)
        for name in WEB_FILES:
            bundle.write(WEB / name, "web/" + name)
        bundle.write(LOCAL / "README.md", "README.md")
    print(OUTPUT)


if __name__ == "__main__":
    main()
