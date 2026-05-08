"""
AI 客服日报分析系统 - Flask 入口
"""
import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

from routes.analyze_routes import bp as analyze_bp
from routes.report_routes import bp as report_bp

load_dotenv()


def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    app.register_blueprint(report_bp)
    app.register_blueprint(analyze_bp)

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
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
