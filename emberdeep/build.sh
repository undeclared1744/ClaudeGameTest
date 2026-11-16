#!/bin/bash
# build.sh - Pack the game into one Linux program file (dist/Emberdeep) that
# runs without Python installed. Needs: pip install pygame-ce pyinstaller
cd "$(dirname "$0")"
python3 -m PyInstaller --onefile --noconfirm --name Emberdeep emberdeep.py
