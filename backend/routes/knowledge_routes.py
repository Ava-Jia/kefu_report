"""
知识库 QA：未存档 / 已存档。
"""
from flask import Blueprint, jsonify, request

from utils.knowledge_storage import (
    archive_item,
    delete_item,
    list_items,
    update_item,
)

bp = Blueprint("knowledge", __name__, url_prefix="/api")


def _status_arg() -> str:
    s = (request.args.get("status") or "pending").strip().lower()
    if s not in ("pending", "archived"):
        return ""
    return s


@bp.route("/knowledge/items", methods=["GET"])
def knowledge_items_list():
    st = _status_arg()
    if not st:
        return jsonify({"success": False, "message": "status 须为 pending 或 archived"}), 400
    items = list_items("pending" if st == "pending" else "archived")
    return jsonify({"success": True, "status": st, "items": items})


@bp.route("/knowledge/items/<item_id>", methods=["PUT"])
def knowledge_items_update(item_id: str):
    st = _status_arg()
    if not st:
        return jsonify({"success": False, "message": "status 须为 pending 或 archived"}), 400
    data = request.get_json(silent=True) or {}
    q = data.get("q")
    a = data.get("a")
    if q is not None and not str(q).strip():
        return jsonify({"success": False, "message": "问题 Q 不能为空"}), 400
    if a is not None and not str(a).strip():
        return jsonify({"success": False, "message": "回答 A 不能为空"}), 400
    ok, msg = update_item(
        item_id,
        "pending" if st == "pending" else "archived",
        q=q,
        a=a,
        source_name=data.get("source_name"),
        source_date=data.get("source_date"),
    )
    if not ok:
        return jsonify({"success": False, "message": msg}), 404
    return jsonify({"success": True, "message": "已保存"})


@bp.route("/knowledge/items/<item_id>", methods=["DELETE"])
def knowledge_items_delete(item_id: str):
    st = _status_arg()
    if not st:
        return jsonify({"success": False, "message": "status 须为 pending 或 archived"}), 400
    ok, msg = delete_item(item_id, "pending" if st == "pending" else "archived")
    if not ok:
        return jsonify({"success": False, "message": msg}), 404
    return jsonify({"success": True, "message": "已删除"})


@bp.route("/knowledge/items/<item_id>/archive", methods=["POST"])
def knowledge_items_archive(item_id: str):
    ok, msg = archive_item(item_id)
    if not ok:
        return jsonify({"success": False, "message": msg}), 400
    return jsonify({"success": True, "message": "已存档"})
