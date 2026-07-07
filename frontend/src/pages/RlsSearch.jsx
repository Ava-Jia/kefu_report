import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Input, Button, Card, Tag, Space, Table, Empty, message, Modal } from "antd";
import { SearchOutlined, ReloadOutlined, EditOutlined } from "@ant-design/icons";
import { searchRls, fetchRlsTaskResult, fetchRlsResults, updateRlsResult } from "../api.js";

const parseQueryNumbers = (text) =>
  String(text || "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const formatLocalDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const DATE_FILTERS = [
  { key: 0, label: "今天" },
  { key: 1, label: "昨天" },
  { key: 2, label: "前天" },
];

/** 外部系统 release_status 是 JSON 字符串，提取其中的 bl_type 展示 */
const parseReleaseStatus = (raw) => {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed?.bl_type ?? parsed;
  } catch {
    return raw;
  }
};

/** 把外部系统返回的原始字段映射为页面内部使用的统一字段名 */
const normalizeRlsRow = (item) => ({
  id: item.id,
  query_number: item.bl_number,
  scac_code: item.item,
  success: item.status === "success",
  result: parseReleaseStatus(item.release_status),
  updated_at: item.updated_at,
});

const POLL_INTERVAL = 5000;
const POLL_MAX_ATTEMPTS = 60;
const PENDING_TASKS_KEY = "rls_pending_tasks";

const loadPendingTaskIds = () => {
  try {
    const saved = localStorage.getItem(PENDING_TASKS_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const savePendingTaskIds = (taskIds) => {
  localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(taskIds));
};

export default function RlsSearch() {
  const [scacCode, setScacCode] = useState("");
  const [queryNumberText, setQueryNumberText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState(loadPendingTaskIds);
  const [dbResults, setDbResults] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState(null);
  const resumedRef = useRef(false);
  const [editingRow, setEditingRow] = useState(null);
  const [manualResult, setManualResult] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const filteredResults = useMemo(() => {
    if (dateFilter === null) return dbResults;
    const target = new Date();
    target.setDate(target.getDate() - dateFilter);
    const targetStr = formatLocalDate(target);
    return dbResults.filter(
      (row) => (row.updated_at || "").slice(0, 10) === targetStr
    );
  }, [dbResults, dateFilter]);

  const loadDbResults = useCallback(async () => {
    setDbLoading(true);
    try {
      const res = await fetchRlsResults();
      if (res.code !== 200) {
        throw new Error(res.error || res.message || "加载失败");
      }
      const rawList = Array.isArray(res.data) ? res.data : res.data?.results || [];
      setDbResults(rawList.map(normalizeRlsRow));
    } catch (e) {
      message.error(e.message || "加载失败");
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDbResults();
  }, [loadDbResults]);

  const removePendingTask = useCallback((taskId) => {
    setPendingTaskIds((prev) => {
      const next = prev.filter((id) => id !== taskId);
      savePendingTaskIds(next);
      return next;
    });
  }, []);

  const pollTaskResult = useCallback(
    async (taskId, attempt = 0) => {
      try {
        const res = await fetchRlsTaskResult(taskId);
        const status = res?.data?.status;
        if (res.code === 200 && (status === "completed" || status === "failed")) {
          removePendingTask(taskId);
          loadDbResults();
          return;
        }
      } catch {
        // 忽略单次轮询失败，继续重试
      }

      if (attempt + 1 >= POLL_MAX_ATTEMPTS) {
        removePendingTask(taskId);
        return;
      }
      setTimeout(() => pollTaskResult(taskId, attempt + 1), POLL_INTERVAL);
    },
    [loadDbResults, removePendingTask]
  );

  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    loadPendingTaskIds().forEach((taskId) => pollTaskResult(taskId));
  }, [pollTaskResult]);

  const handleSearch = async () => {
    const scac = scacCode.trim();
    const queryNumbers = parseQueryNumbers(queryNumberText);

    if (!scac) {
      message.warning("请输入 SCAC Code");
      return;
    }
    if (queryNumbers.length === 0) {
      message.warning("请至少输入一个查询单号");
      return;
    }

    setSubmitting(true);
    try {
      const res = await searchRls(scac, queryNumbers);
      if (res.code !== 200) {
        throw new Error(res.error || res.message || "提交失败");
      }
      const batches = Array.isArray(res.data) ? res.data : [res.data];
      const taskIds = batches
        .map((item) => item?.task_id || item?.taskId || item?.id || item)
        .filter(Boolean)
        .map(String);

      message.success(
        taskIds.length > 1 ? `任务已分 ${taskIds.length} 批提交` : "任务已提交"
      );

      setPendingTaskIds((prev) => {
        const next = [...prev, ...taskIds];
        savePendingTaskIds(next);
        return next;
      });
      taskIds.forEach((taskId) => pollTaskResult(taskId));
    } catch (e) {
      message.error(e.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const openManualEdit = (row) => {
    setEditingRow(row);
    setManualResult("");
  };

  const handleManualSubmit = async () => {
    const value = manualResult.trim();
    if (!value) {
      message.warning("请输入检索到的状态");
      return;
    }
    setManualSubmitting(true);
    try {
      const res = await updateRlsResult(editingRow.id, value);
      if (res.code !== 200) {
        throw new Error(res.error || res.message || "更新失败");
      }
      message.success("更新成功");
      setEditingRow(null);
      loadDbResults();
    } catch (e) {
      message.error(e.message || "更新失败");
    } finally {
      setManualSubmitting(false);
    }
  };

  const dbColumns = [
    { title: "提单号", dataIndex: "query_number", key: "query_number", width: "16.6%", ellipsis: true },
    { title: "SCAC Code", dataIndex: "scac_code", key: "scac_code", width: "16.6%", ellipsis: true },
    {
      title: "状态",
      dataIndex: "success",
      key: "success",
      width: "16.6%",
      render: (success) =>
        success ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>,
    },
    {
      title: "release_status",
      dataIndex: "result",
      key: "result",
      width: "16.6%",
      render: (result) => {
        const value = typeof result === "string" ? result : result ? JSON.stringify(result) : "";
        if (!value) {
          return <Tag color="red">-</Tag>;
        }
        return (
          <Tag color={value === "Telex Release" ? "green" : "orange"}>
            {value}
          </Tag>
        );
      },
    },
    { title: "更新时间", dataIndex: "updated_at", key: "updated_at", width: "16.6%", ellipsis: true },
    {
      title: "操作",
      key: "action",
      width: "10%",
      render: (_, row) =>
        !row.success && (
          <Button size="small" icon={<EditOutlined />} onClick={() => openManualEdit(row)}>
            手动补录
          </Button>
        ),
    },
  ];

  return (
    <div style={{ padding: 24, background: "#f0f2f5", minHeight: "100vh" }}>
      <Card title="RLS 查询">
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <div>
            <div style={{ marginBottom: 4, color: "#666" }}>SCAC Code</div>
            <Input
              value={scacCode}
              placeholder="请输入 SCAC Code"
              onChange={(e) => setScacCode(e.target.value)}
              style={{ maxWidth: 320 }}
            />
          </div>

          <div>
            <div style={{ marginBottom: 4, color: "#666" }}>
              查询单号（每行一个，或用逗号分隔）
            </div>
            <Input.TextArea
              value={queryNumberText}
              placeholder="请输入查询单号"
              autoSize={{ minRows: 4, maxRows: 8 }}
              onChange={(e) => setQueryNumberText(e.target.value)}
            />
          </div>

          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={submitting}
          >
            提交查询
          </Button>
          {pendingTaskIds.length > 0 && (
            <span style={{ color: "#999" }}>
              有 {pendingTaskIds.length} 个任务正在后台查询中，完成后会自动出现在下方结果中
            </span>
          )}
        </Space>
      </Card>

      <Card
        title="数据库中的 RLS 结果"
        style={{ marginTop: 16 }}
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadDbResults} loading={dbLoading}>
            刷新
          </Button>
        }
      >
        <Space style={{ marginBottom: 12 }}>
          {DATE_FILTERS.map(({ key, label }) => (
            <Button
              key={key}
              type={dateFilter === key ? "primary" : "default"}
              onClick={() => setDateFilter((prev) => (prev === key ? null : key))}
            >
              {label}
            </Button>
          ))}
        </Space>

        <Table
          rowKey={(row) => row.id ?? `${row.query_number}-${row.updated_at}`}
          columns={dbColumns}
          dataSource={filteredResults}
          loading={dbLoading}
          pagination={{ pageSize: 10 }}
          tableLayout="fixed"
          scroll={{ x: "max-content" }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无数据"
              />
            ),
          }}
        />
      </Card>

      <Modal
        title="手动补录检索状态"
        open={!!editingRow}
        onOk={handleManualSubmit}
        onCancel={() => setEditingRow(null)}
        confirmLoading={manualSubmitting}
        okText="保存"
        cancelText="取消"
      >
        <p style={{ color: "#666" }}>
          提单号：{editingRow?.query_number}　SCAC Code：{editingRow?.scac_code}
        </p>
        <Input
          value={manualResult}
          placeholder="请输入检索到的状态，如 Telex Release"
          onChange={(e) => setManualResult(e.target.value)}
          onPressEnter={handleManualSubmit}
        />
      </Modal>
    </div>
  );
}
