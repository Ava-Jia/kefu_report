from flask import Blueprint, jsonify, request

from utils.analyze_storage import (
    list_analyze_keys,
    read_analyze_markdown
)

bp = Blueprint("analyze", __name__, url_prefix="/api")

def _kind_map():
    return {
        "daily": "daily",
        "weekly": "weekly",
        "monthly": "monthly",
        "每日": "daily",
        "每周": "weekly",
        "每月": "monthly",
    }


@bp.route("/analyze/list", methods=["GET"])
def analyze_list():
    view = (request.args.get("view") or "daily").strip()
    km = _kind_map()
    kind = km.get(view, view)
    if kind not in ("daily", "weekly", "monthly"):
        return jsonify({"success": False, "message": "view 须为 daily|weekly|monthly"}), 400

    keys = list_analyze_keys(kind)
    items = []
    for k in keys:
        label = k
        if kind == "weekly":
            label = f"截至 {k}（周六）"
        elif kind == "monthly":
            parts = k.split("-")
            if len(parts) >= 2:
                label = f"{parts[0]}年{int(parts[1])}月"
        items.append({"key": k, "title": label})

    return jsonify({"success": True, "view": kind, "items": items})


@bp.route("/analyze/detail", methods=["GET"])
def analyze_detail():
    view = (request.args.get("view") or "").strip()
    key = (request.args.get("key") or "").strip()
    km = _kind_map()
    kind = km.get(view, view)
    if kind not in ("daily", "weekly", "monthly"):
        return jsonify({"success": False, "message": "view 须为 daily|weekly|monthly"}), 400
    if not key:
        return jsonify({"success": False, "message": "请提供 key"}), 400

    body = read_analyze_markdown(kind, key)
    if body is None:
        return jsonify(
            {
                "success": True,
                "exists": False,
                "content": "",
                "message": "尚未生成该期总结",
            }
        )

    return jsonify({"success": True, "exists": True, "content": body})
