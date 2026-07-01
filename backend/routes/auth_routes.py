from flask import Blueprint, request, jsonify

from auth_model import verify_user
from utils.auth import generate_token

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.route("/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""

    if not username or not password:
        return jsonify({"success": False, "message": "用户名和密码不能为空"}), 400

    user = verify_user(username, password)
    if not user:
        return jsonify({"success": False, "message": "用户名或密码错误"}), 401

    token = generate_token(user.id, user.username)
    return jsonify({"success": True, "token": token, "username": user.username})
