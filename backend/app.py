"""
AI 客服日报分析系统 - Flask 入口
"""
import os
import logging

from config import setup_logging
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

from routes.analyze_routes import bp as analyze_bp
from routes.auth_routes import bp as auth_bp
from routes.email_routes import bp as email_bp
from routes.knowledge_routes import bp as knowledge_bp
from routes.parser_result_routes import bp as parser_result_bp
from routes.report_routes import bp as report_bp
from routes.rls_routes import bp as rls_search_bp
from routes.search_routes import bp as company_bp
from routes.wechat_rag import bp as rag_bp
from utils.auth import verify_token


load_dotenv()

setup_logging()
logger = logging.getLogger(__name__)

_PUBLIC_PATHS = {"/api/auth/login", "/api/health", "/api/email/create"}
_PUBLIC_PATH_PREFIXES = ("/api/companys", "/api/test", "/api/parser_result", "/api/email")


def create_app():
    # origins = [
    #     "http://localhost:5173",
    #     "http://127.0.0.1:5173",
    #     "http://192.168.20.81:5173",
    #     "http://101.132.22.43:5173"
    # ]
    app = Flask(__name__)
    # Keep original key order in JSON responses (e.g. parser_result field order)
    app.json.sort_keys = False
    CORS(app, resources={r"/api/*": {"origins": "*", "supports_credentials": True}})

    logger.info("******************Starting app******************")

    @app.before_request
    def check_auth():
        from flask import request, g
        if (
            request.method == "OPTIONS"
            or request.path in _PUBLIC_PATHS
            or request.path.startswith(_PUBLIC_PATH_PREFIXES)
        ):
            return
        raw = request.headers.get("Authorization", "")
        token = raw.removeprefix("Bearer ").strip()
        payload = verify_token(token) if token else None
        if payload is None:
            return jsonify({"success": False, "message": "未登录或登录已过期"}), 401
        g.user = payload

    app.register_blueprint(auth_bp)
    app.register_blueprint(report_bp)
    app.register_blueprint(analyze_bp)
    app.register_blueprint(email_bp)
    app.register_blueprint(knowledge_bp)
    app.register_blueprint(parser_result_bp)
    app.register_blueprint(company_bp)
    app.register_blueprint(rag_bp)
    app.register_blueprint(rls_search_bp)

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"ok": True, "service": "kefu-report-backend"})

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"success": False, "message": "接口不存在"}), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"success": False, "message": "服务器内部错误"}), 500

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5008"))
    app.run(host="0.0.0.0", port=port, debug=False)
