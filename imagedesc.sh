#!/usr/bin/env bash
set -e

# Directory where this script lives (project root expected)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ----------------------------------------------------------------------
# 0. Load environment variables from .env if it exists
# ----------------------------------------------------------------------
if [ -f "${SCRIPT_DIR}/.env" ]; then
    # Export everything in the .env for child processes (Python)
    # shellcheck disable=SC1090
    set -o allexport
    source "${SCRIPT_DIR}/.env"
    set +o allexport
fi

# If the key is still missing, emit a friendly notice
if [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "Warning: OPENAI_API_KEY is not set. Create a .env file (see sample.env) or export it before running." >&2
fi

VENV_DIR="${SCRIPT_DIR}/venv"

# 1. Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python venv in $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

# 2. Activate venv
# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

# 3. Ensure openai is installed (suppress already-satisfied chatter)
if ! "$VENV_DIR/bin/pip" show openai >/dev/null 2>&1; then
    echo "Installing openai package in venv..."
    "$VENV_DIR/bin/pip" install -q --upgrade pip
    "$VENV_DIR/bin/pip" install -q --upgrade openai
fi

# 4. Run imagedesc.py with all passed arguments
"$VENV_DIR/bin/python" "${SCRIPT_DIR}/imagedesc.py" "$@"
