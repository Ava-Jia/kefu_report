# AI 客服日报分析系统

客服每日工作日报收集与 AI 自动分析：工作总结、高频问题、投诉统计、情绪分析、重点客户问题等。

## 技术栈

- 前端：React 18、Vite 5、Ant Design 5
- 后端：Python 3.10+、Flask 3
- 存储：本地 UTF-8 文本文件（`backend/reports/`）
- AI：OpenAI 兼容 API（通过环境变量配置）

## 目录结构

```
kefu_report/
├── frontend/          # React + Vite 前端
├── backend/
│   ├── app.py         # Flask 入口
│   ├── routes/        # API 路由
│   ├── services/      # AI 服务封装
│   ├── utils/         # 文件读写与筛选
│   ├── reports/       # 日报 txt 存储目录（自动生成）
│   ├── requirements.txt
│   └── .env           # 本地创建（勿提交密钥）
└── README.md
```

## 快速开始

### 1. 后端

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env
```

编辑 `backend/.env`：

```
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

若使用国内兼容网关，将 `OPENAI_BASE_URL` 改为对应地址。

启动：

```bash
python app.py
```

默认监听 `http://127.0.0.1:5000`。可通过环境变量 `PORT` 修改端口。

### 2. 前端

新开终端：

```bash
cd frontend
npm install
npm run dev
```

浏览器访问终端提示的本地地址（一般为 `http://127.0.0.1:5173`）。开发模式下 Vite 会将 `/api` 代理到后端 `5000` 端口。

### 3. 生产构建（可选）

```bash
cd frontend
npm run build
```

将 `frontend/dist` 交由静态服务器托管，并配置反向代理把 `/api` 转到 Flask；或直接用 Flask 挂载静态目录（需自行扩展 `app.py`）。

## API 说明

| 方法 | 路径                                     | 说明                                             |
| ---- | ---------------------------------------- | ------------------------------------------------ |
| POST | `/api/report/save`                       | 保存日报，生成 `姓名_日期.txt`                   |
| GET  | `/api/reports`                           | 列表，查询参数：`name`、`start_date`、`end_date` |
| GET  | `/api/report?name=&date=`                | 读取单条（用于编辑回填）                         |
| POST | `/api/analyze`                           | AI 分析，body：`names`、`start_date`、`end_date` |
| GET  | `/api/health`                            | 健康检查                                         |
| POST | `/api/companys/search`                     | 检索公司                                         |
| GET  | `/api/companys/task/<task_id>`             | 根据task_id查看任务状态                          |
| GET  | `/api/companys/tasks`                      | 获取全部任务状态                                 |
| GET  | `/api/companys/task/<task_id>/export-xlsx` | 将任务结果导出为xlsx文件                         |

**分析接口**：`names` 为空数组表示**全部人员**；提供姓名数组则为**多人**（单人时数组长度为 1）。日期为范围筛选；单日可将开始与结束设为同一天。

## 日报文件格式

文件名：`姓名_YYYY-MM-DD.txt`，存放于 `backend/reports/`。

文件内容示例：

```
姓名：张三
日期：2026-05-08

日报内容：

1. 今日处理客户 32 个
2. ...
```

## 常见问题

- **分析报错与密钥相关**：检查 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 是否可达。
- **接口跨域**：后端已对 `/api/*` 启用 CORS；生产环境建议缩小允许来源。
- **未找到日报**：确认 `reports` 目录下存在对应 `姓名_日期.txt`，且筛选日期、姓名与文件内「姓名」「日期」一致。


## 配置定时任务
docker compose exec -T backend python -m jobs.<模块> <参数>

任务 1：jobs.analyze_cron
建议 crontab（宿主机，容器名按实际修改）：
# 每日次日 00:00 — 总结「昨天」业务日日报
0 0 * * * cd /home/kefu_report && docker compose exec -T backend python -m jobs.analyze_cron daily
# 每周六 12:00 — 提交时间在上周六12:00与本周六12:00之间（7天窗口）
0 12 * * 6 cd /home/kefu_report && docker compose exec -T backend python -m jobs.analyze_cron weekly
# 每月1日 00:00 — 总结上一自然月（按日报业务日期）
0 0 1 * * cd /home/kefu_report && docker compose exec -T backend python -m jobs.analyze_cron monthly

任务 2：jobs.knowledge_cron
crontab 示例：
30 0 * * * cd /home/kefu_report && docker compose exec -T backend python -m jobs.knowledge_cron
# 或每天 23:40 跑当天：
40 23 * * * cd /home/kefu_report && docker compose exec -T backend python -m jobs.knowledge_cron --today

## 许可证

MIT（可按需修改）。
