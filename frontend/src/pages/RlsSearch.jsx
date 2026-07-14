import { useState, useEffect, useCallback, useMemo } from "react";
import { Input, Button, Card, Tag, Space, Table, Empty, message, Modal } from "antd";
import { SearchOutlined, ReloadOutlined, EditOutlined } from "@ant-design/icons";
import { searchRls, fetchRlsResults, updateRlsResult } from "../api.js";

const copyText = (text) => {
  if (!text) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => message.success("已复制"));
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  message.success("已复制");
};

const normalizeQueryNumber = (queryNumber) =>
  queryNumber.startsWith("WHLC") ? queryNumber.slice(4) : queryNumber;

const parseQueryNumbers = (text) =>
  String(text || "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .map(normalizeQueryNumber)
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

/** web_status / plt_status 是包含三项状态的 JSON 字符串 */
const STATUS_FIELDS = ["Ocean B/L Status", "Freight Status", "Customs Status"];

const parseStatusFields = (raw) => {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

/** 把 JSON 字符串拆成三行展示：Ocean B/L Status / Freight Status / Customs Status */
const renderStatusRows = (raw) => {
  const parsed = parseStatusFields(raw);
  if (!parsed) return <Tag color="red">-</Tag>;
  return (
    <Space direction="vertical" size={4} style={{ width: "100%" }}>
      {STATUS_FIELDS.map((field) => {
        const val = parsed[field];
        return (
          <div
            key={field}
            style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
          >
            <span style={{ color: "#999", fontSize: 12 }}>{field}</span>
            {val ? (
              <Tag color={/released/i.test(val) ? "green" : "orange"} style={{ margin: 0 }}>
                {val}
              </Tag>
            ) : (
              <Tag color="default" style={{ margin: 0 }}>
                -
              </Tag>
            )}
          </div>
        );
      })}
    </Space>
  );
};

/** 把外部系统返回的原始字段映射为页面内部使用的统一字段名 */
const normalizeRlsRow = (item) => ({
  id: item.id,
  query_number: item.bl_number,
  success: item.status === "success",
  web_status: item.web_Status,
  plt_status: item.plt_Status,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

export default function RlsSearch() {
  const [scacCode, setScacCode] = useState("");
  const [queryNumberText, setQueryNumberText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dbResults, setDbResults] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState(null);
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
      message.success("任务已提交，请稍后点击刷新查看结果");
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
    {
      title: "提单号",
      dataIndex: "query_number",
      key: "query_number",
      width: "16%",
      ellipsis: true,
      render: (v) =>
        v && (
          <span
            title={`点击复制：${v}`}
            onClick={() => copyText(v)}
            style={{
              display: "inline-block",
              maxWidth: "100%",
              padding: "1px 8px",
              border: "1px solid #d9d9d9",
              borderRadius: 4,
              cursor: "pointer",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {v}
          </span>
        ),
    },
    {
      title: "检索状态",
      dataIndex: "success",
      key: "success",
      width: "12%",
      render: (success) =>
        success ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>,
    },
    {
      title: "Web_Status",
      dataIndex: "web_status",
      key: "web_status",
      width: "20%",
      render: renderStatusRows,
    },
    {
      title: "Plt_Status",
      dataIndex: "plt_status",
      key: "plt_status",
      width: "20%",
      render: renderStatusRows,
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: "10%",
      ellipsis: true,
      render: (createdAt) => (createdAt || "").slice(0, 10),
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: "10%",
      ellipsis: true,
      render: (updatedAt) => (updatedAt || "").slice(0, 10),
    },
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
          pagination={{ 
            pageSize: 50,
            showSizeChanger: false,
          }}
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
          提单号：{editingRow?.query_number}
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
