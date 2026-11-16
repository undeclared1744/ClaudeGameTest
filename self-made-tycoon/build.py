#!/usr/bin/env python3
"""
build.py - Bundle the game's source files in src/ into one index.html.

The game ships as ONE self-contained HTML file (that's what the published
artifact and phones need), but it's written as several smaller files so
that different features can be worked on at the same time without
everyone editing the same giant file.

    python3 build.py           write index.html from src/
    python3 build.py --check   exit 1 if index.html is out of date (for tests / before committing)

How it fits together:
    src/page.html          the page: head, markup, and two markers that
                           this script replaces:
                             /*@@CSS@@*/  -> every file in src/css/, A-Z
                             /*@@JS@@*/   -> every .js file under src/js/,
                                             A-Z by full path (folders too)
    src/css/*.css          styles
    src/js/**/*.js         the game. All files end up in ONE <script>, in
                           A-Z order, so they share one scope: a file can
                           use anything a file before it defines, and
                           functions anywhere (they're all defined before
                           the game starts running in 99-start.js).

No packages needed: plain Python 3.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = os.path.join(HERE, "index.html")


def files_under(folder, ext):
    """Every file with this extension under folder, sorted by path (so the
    order is the same on every computer)."""
    found = []
    for root, _dirs, names in os.walk(folder):
        for name in names:
            if name.endswith(ext):
                found.append(os.path.join(root, name))
    return sorted(found, key=lambda p: os.path.relpath(p, folder).replace(os.sep, "/"))


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def build():
    page = read(os.path.join(SRC, "page.html"))
    css = "".join(read(p) for p in files_under(os.path.join(SRC, "css"), ".css"))
    js = "".join(read(p) for p in files_under(os.path.join(SRC, "js"), ".js"))
    for marker, text in (("/*@@CSS@@*/", css), ("/*@@JS@@*/", js)):
        if page.count(marker) != 1:
            sys.exit(f"build.py: src/page.html must contain {marker} exactly once")
        page = page.replace(marker, text)
    return page


if __name__ == "__main__":
    html = build()
    if "--check" in sys.argv:
        current = read(OUT) if os.path.exists(OUT) else ""
        if current != html:
            sys.exit("index.html is out of date: run  python3 build.py")
        print("index.html is up to date")
    else:
        with open(OUT, "w", encoding="utf-8", newline="") as f:
            f.write(html)
        print(f"wrote index.html ({len(html.encode('utf-8')) // 1024} KB)")
