#!/bin/bash
# run_from_source.sh - Plan B for the Steam Deck (or any Linux PC) if the
# ready-made "Emberdeep" program will not start. Also the way to run the game
# after you edit the code.
#
# The first time, it makes a private Python folder (.venv) next to this file
# and downloads pygame into it (needs internet once). After that it just
# starts the game. Nothing is installed system-wide.
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
    python3 -m venv .venv || exit 1
    .venv/bin/pip install pygame-ce || exit 1
fi
exec .venv/bin/python emberdeep.py "$@"
