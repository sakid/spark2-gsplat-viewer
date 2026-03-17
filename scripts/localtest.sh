#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="dev"

DEFAULT_DEV_HOST="127.0.0.1"
DEFAULT_DEV_PORT="5173"
DEFAULT_PREVIEW_HOST="127.0.0.1"
DEFAULT_PREVIEW_PORT="4173"

usage() {
  cat <<'EOF'
Usage:
  scripts/localtest.sh [dev|preview] [--host HOST] [--port PORT]
  scripts/localtest.sh [dev|preview] [host] [port]

Modes:
  dev      Start Vite dev server (default).
  preview  Build and start Vite preview server.

Examples:
  scripts/localtest.sh
  scripts/localtest.sh dev 127.0.0.1 5173
  scripts/localtest.sh preview 127.0.0.1 4173
EOF
}

if [[ $# -gt 0 ]]; then
  case "${1}" in
    dev|preview)
      MODE="${1}"
      shift
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
  esac
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not on PATH." >&2
  exit 1
fi

if [[ ! -f "${ROOT_DIR}/package.json" ]]; then
  echo "Error: package.json not found in ${ROOT_DIR}." >&2
  exit 1
fi

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "Installing dependencies..."
  (cd "${ROOT_DIR}" && npm install)
fi

HOST=""
PORT=""
POSITIONAL=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help|help)
      usage
      exit 0
      ;;
    --host|-H)
      HOST="${2:-}"
      shift 2
      ;;
    --port|-p)
      PORT="${2:-}"
      shift 2
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [[ -z "${HOST}" && ${#POSITIONAL[@]} -ge 1 ]]; then
  HOST="${POSITIONAL[0]}"
fi

if [[ -z "${PORT}" && ${#POSITIONAL[@]} -ge 2 ]]; then
  PORT="${POSITIONAL[1]}"
fi

if [[ "${MODE}" == "dev" ]]; then
  HOST="${HOST:-${DEFAULT_DEV_HOST}}"
  PORT="${PORT:-${DEFAULT_DEV_PORT}}"
  echo "Starting local dev server at http://${HOST}:${PORT}"
  cd "${ROOT_DIR}"
  exec npm run dev -- --host "${HOST}" --port "${PORT}"
fi

if [[ "${MODE}" == "preview" ]]; then
  HOST="${HOST:-${DEFAULT_PREVIEW_HOST}}"
  PORT="${PORT:-${DEFAULT_PREVIEW_PORT}}"
  echo "Building project..."
  (cd "${ROOT_DIR}" && npm run build)
  echo "Starting local preview server at http://${HOST}:${PORT}"
  cd "${ROOT_DIR}"
  exec npm run preview -- --host "${HOST}" --port "${PORT}"
fi

echo "Error: unknown mode '${MODE}'." >&2
usage
exit 1
