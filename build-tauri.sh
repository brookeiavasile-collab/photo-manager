#!/bin/bash
set -euo pipefail

# 从 Finder / GUI 或精简环境启动时，PATH 里可能没有 cargo / npm
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

cd "$(dirname "$0")"
npm run tauri:build
