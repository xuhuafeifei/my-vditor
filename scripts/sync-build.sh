#!/usr/bin/env bash
set -euo pipefail

# 用法:
#   bash scripts/sync-build.sh <markdown_docs_project_path> [--from dist] [--to vendor/vditor]
#
# 示例:
#   bash scripts/sync-build.sh ../markdown-docs --from dist --to vendor/vditor

if [ $# -lt 1 ]; then
  echo "Usage: $0 <markdown_docs_project_path> [--from dist] [--to vendor/vditor]"
  exit 1
fi

TARGET_PROJECT="${1%/}"
shift

FROM_DIR="dist"
TO_DIR="vendor/vditor"

while [ $# -gt 0 ]; do
  case "$1" in
    --from)
      FROM_DIR="${2:-}"
      shift 2
      ;;
    --to)
      TO_DIR="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SOURCE_DIR="${PROJECT_ROOT%/}/${FROM_DIR}"
DEST_DIR="${TARGET_PROJECT%/}/${TO_DIR}"

echo "[1/3] Build current project: $PROJECT_ROOT"
(
  cd "$PROJECT_ROOT"
  npm run build
)

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Build output not found: $SOURCE_DIR"
  exit 1
fi

echo "[2/3] Sync files"
mkdir -p "$DEST_DIR"
rsync -a --delete "$SOURCE_DIR"/ "$DEST_DIR"/

echo "[3/3] Done -> $DEST_DIR"
