#!/usr/bin/env bash
# 停止 backend(gunicorn)。nginx 是宿主机上的常驻服务，可能还服务其他站点，
# 默认不动它；确实要一起停可以自己加 systemctl stop nginx。
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PID_FILE="$PROJECT_ROOT/run/backend.pid"

if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
  kill "$(cat "$BACKEND_PID_FILE")"
  rm -f "$BACKEND_PID_FILE"
  echo "[backend] 已停止"
else
  echo "[backend] 未在运行"
fi
