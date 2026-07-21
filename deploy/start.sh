#!/usr/bin/env bash
# 启动 backend(gunicorn) + 构建 frontend 静态文件 + 启动/重载 nginx
# 用于脱离 docker、直接在宿主机上跑这套服务。
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
RUN_DIR="$PROJECT_ROOT/run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"

BACKEND_PORT="${BACKEND_PORT:-5000}"
NGINX_CONF_LINK="/etc/nginx/conf.d/kefu_report.conf"

mkdir -p "$RUN_DIR" "$BACKEND_DIR/logs"

start_backend() {
  if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
    echo "[backend] 已在运行 (pid $(cat "$BACKEND_PID_FILE"))，跳过"
    return
  fi

  if [ ! -x "$BACKEND_DIR/.venv/bin/gunicorn" ]; then
    echo "[backend] 找不到 $BACKEND_DIR/.venv/bin/gunicorn，先执行：" >&2
    echo "  cd $BACKEND_DIR && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
    exit 1
  fi

  echo "[backend] 启动 gunicorn，端口 $BACKEND_PORT..."
  cd "$BACKEND_DIR"
  nohup "$BACKEND_DIR/.venv/bin/gunicorn" \
    --bind "0.0.0.0:${BACKEND_PORT}" \
    --workers 2 --threads 2 --timeout 120 \
    app:app >> "$BACKEND_DIR/logs/gunicorn.log" 2>&1 &
  echo $! > "$BACKEND_PID_FILE"
  sleep 1
  if ! kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
    echo "[backend] 启动失败，看日志：$BACKEND_DIR/logs/gunicorn.log" >&2
    exit 1
  fi
  echo "[backend] 已启动 (pid $(cat "$BACKEND_PID_FILE"))"
}

build_frontend() {
  if [ -d "$FRONTEND_DIR/dist" ] && [ "${FORCE_BUILD:-0}" != "1" ]; then
    echo "[frontend] 已有构建产物，跳过（强制重新构建：FORCE_BUILD=1 ./deploy/start.sh）"
    return
  fi
  echo "[frontend] 构建前端..."
  (cd "$FRONTEND_DIR" && npm ci && npm run build)
}

start_nginx() {
  echo "[nginx] 检查配置..."
  if [ ! -e "$NGINX_CONF_LINK" ]; then
    ln -s "$PROJECT_ROOT/deploy/nginx.host.conf" "$NGINX_CONF_LINK"
    echo "[nginx] 已链接站点配置到 $NGINX_CONF_LINK"
  fi
  nginx -t
  if pgrep -x nginx > /dev/null; then
    systemctl reload nginx 2>/dev/null || nginx -s reload
    echo "[nginx] 已 reload"
  else
    systemctl start nginx 2>/dev/null || nginx
    echo "[nginx] 已启动"
  fi
}

start_backend
build_frontend
start_nginx

echo
echo "全部启动完成："
echo "  backend health: curl http://127.0.0.1:${BACKEND_PORT}/api/health"
echo "  frontend:       http://<服务器IP>:8082"
