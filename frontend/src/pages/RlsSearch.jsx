import { useState, useEffect, useCallback, useMemo } from "react";
import { Input, Button, Card, Tag, Space, Table, Empty, message, Modal, Radio } from "antd";
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

/** 不同船公司人工补录时可修改的字段范围，未配置的船公司默认三项都可改 */
const CARRIER_EDITABLE_FIELDS = {
  WHLC: ["Ocean B/L Status"],
};

const getCarrierCode = (blNumber) => {
  const code = Object.keys(CARRIER_EDITABLE_FIELDS).find((scac) =>
    String(blNumber || "").toUpperCase().startsWith(scac)
  );
  return code || null;
};

const getEditableFields = (blNumber) => {
  const carrier = getCarrierCode(blNumber);
  return carrier ? CARRIER_EDITABLE_FIELDS[carrier] : STATUS_FIELDS;
};

/** Plt_Status 三个 Tag 统一尺寸，避免因文字长短不一导致框大小不一致 */
const STATUS_TAG_STYLE = {
  margin: 0,
  fontSize: 14,
  minWidth: 90,
  textAlign: "right",
};

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
const renderStatusRows = (raw, { withTag = true } = {}) => {
  const parsed = parseStatusFields(raw);
  if (!parsed) return withTag ? <Tag color="red">-</Tag> : <span>-</span>;
  return (
    <Space direction="vertical" size={4} style={{ width: "100%" }}>
      {STATUS_FIELDS.map((field) => {
        const hasKey = Object.prototype.hasOwnProperty.call(parsed, field);
        const val = parsed[field];
        // 0 = 根本爬取不到该字段（灰色 None）；key 缺失/null = 爬取成功但没有值（黑色 -）
        const isUnscraped = val === 0;
        const isEmpty = !isUnscraped && (!hasKey || val === null || val === undefined || val === "");
        return (
          <div
            key={field}
            style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%" }}
          >
            <span
              style={
                isUnscraped
                  ? { color: "#bbb", fontSize: 14, opacity: 0.6, flex: 1 }
                  : { color: "#000", fontSize: 14, flex: 1 }
              }
            >
              {field}
            </span>
            {withTag ? (
              isUnscraped ? (
                <Tag color="default" style={{ ...STATUS_TAG_STYLE, color: "#bbb", opacity: 0.6 }}>
                  None
                </Tag>
              ) : isEmpty ? (
                <Tag color="default" style={{ ...STATUS_TAG_STYLE, color: "#000" }}>
                  -
                </Tag>
              ) : (
                <Tag color={/released/i.test(val) ? "green" : "orange"} style={STATUS_TAG_STYLE}>
                  {val}
                </Tag>
              )
            ) : isUnscraped ? (
              <span style={{ color: "#bbb", fontSize: 14, opacity: 0.6 }}>None</span>
            ) : isEmpty ? (
              <span style={{ color: "#000", fontSize: 14 }}>-</span>
            ) : (
              <span style={{ color: "#000", fontSize: 14 }}>{val}</span>
            )}
          </div>
        );
      })}
    </Space>
  );
};

/** 检索状态 Tag 统一尺寸，避免 成功/失败/人工 因文字长短不一而大小不一致 */
const SEARCH_STATUS_TAG_STYLE = { minWidth: 48, textAlign: "center" };

/** 把外部系统返回的原始字段映射为页面内部使用的统一字段名 */
const normalizeRlsRow = (item) => ({
  id: item.id,
  query_number: item.bl_number,
  status: item.status,
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
  const [blNumberFilter, setBlNumberFilter] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [manualBlStatus, setManualBlStatus] = useState("");
  const [manualFreightStatus, setManualFreightStatus] = useState("");
  const [manualCustomsStatus, setManualCustomsStatus] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const filteredResults = useMemo(() => {
    let list = dbResults;
    if (dateFilter !== null) {
      const target = new Date();
      target.setDate(target.getDate() - dateFilter);
      const targetStr = formatLocalDate(target);
      list = list.filter((row) => (row.updated_at || "").slice(0, 10) === targetStr);
    }
    const keyword = blNumberFilter.trim().toUpperCase();
    if (keyword) {
      list = list.filter((row) => (row.query_number || "").toUpperCase().includes(keyword));
    }
    return list;
  }, [dbResults, dateFilter, blNumberFilter]);

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

  const editableFields = useMemo(() => getEditableFields(editingRow?.query_number), [editingRow]);

  const openManualEdit = (row) => {
    const parsed = parseStatusFields(row.web_status) || {};
    setEditingRow(row);
    setManualBlStatus(parsed["Ocean B/L Status"] || "");
    setManualFreightStatus(parsed["Freight Status"] || "");
    setManualCustomsStatus(parsed["Customs Status"] || "");
  };

  const handleManualSubmit = async () => {
    const blStatus = editableFields.includes("Ocean B/L Status") ? manualBlStatus.trim() : "";
    const freightStatus = editableFields.includes("Freight Status") ? manualFreightStatus.trim() : "";
    const customsStatus = editableFields.includes("Customs Status") ? manualCustomsStatus.trim() : "";
    if (!blStatus && !freightStatus && !customsStatus) {
      message.warning("请至少输入一项检索到的状态");
      return;
    }
    setManualSubmitting(true);
    try {
      const res = await updateRlsResult(editingRow.id, {
        blStatus: blStatus || undefined,
        freightStatus: freightStatus || undefined,
        customsStatus: customsStatus || undefined,
      });
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
      dataIndex: "status",
      key: "status",
      width: "12%",
      render: (status) => {
        if (status === "success") {
          return <Tag color="green" style={SEARCH_STATUS_TAG_STYLE}>成功</Tag>;
        }
        if (status === "manual") {
          return <Tag color="gold" style={SEARCH_STATUS_TAG_STYLE}>人工</Tag>;
        }
        return <Tag color="red" style={SEARCH_STATUS_TAG_STYLE}>失败</Tag>;
      },
    },
    {
      title: "Web_Status",
      dataIndex: "web_status",
      key: "web_status",
      width: "18%",
      render: (value) => renderStatusRows(value, { withTag: false }),
    },
    {
      title: "Plt_Status",
      dataIndex: "plt_status",
      key: "plt_status",
      width: "18%",
      render: (value) => renderStatusRows(value),
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
      title: "操作",
      key: "action",
      width: "10%",
      render: (_, record) =>
        !record.success && (
          <Button size="small" icon={<EditOutlined />} onClick={() => openManualEdit(record)}>
            修改
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
        <Space style={{ marginBottom: 12, width: "100%" }} wrap>
          <Input.Search
            allowClear
            placeholder="按提单号搜索"
            value={blNumberFilter}
            onChange={(e) => setBlNumberFilter(e.target.value)}
            style={{ width: 240, height: 32 }}
          />

          <div
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 32,
              padding: "0 12px",
              border: "1px solid rgb(217, 217, 217)",
              borderRadius: 8,
              boxSizing: "border-box",
            }}
          >
            <Radio.Group
              value={dateFilter === null ? "" : dateFilter}
              onChange={(e) => {
                const v = e.target.value;
                setDateFilter(v === "" ? null : v);
              }}
            >
              <Radio value="">全部</Radio>
              {DATE_FILTERS.map(({ key, label }) => (
                <Radio key={key} value={key}>
                  {label}
                </Radio>
              ))}
            </Radio.Group>
          </div>
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
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          {editableFields.includes("Ocean B/L Status") && (
            <div>
              <div style={{ marginBottom: 4, color: "#666" }}>Ocean B/L Status</div>
              <Input
                value={manualBlStatus}
                placeholder="如 Telex Release"
                onChange={(e) => setManualBlStatus(e.target.value)}
                onPressEnter={handleManualSubmit}
              />
            </div>
          )}
          {editableFields.includes("Freight Status") && (
            <div>
              <div style={{ marginBottom: 4, color: "#666" }}>Freight Status</div>
              <Input
                value={manualFreightStatus}
                placeholder="如 Received"
                onChange={(e) => setManualFreightStatus(e.target.value)}
                onPressEnter={handleManualSubmit}
              />
            </div>
          )}
          {editableFields.includes("Customs Status") && (
            <div>
              <div style={{ marginBottom: 4, color: "#666" }}>Customs Status</div>
              <Input
                value={manualCustomsStatus}
                placeholder="如 Released"
                onChange={(e) => setManualCustomsStatus(e.target.value)}
                onPressEnter={handleManualSubmit}
              />
            </div>
          )}
        </Space>
      </Modal>
    </div>
  );
}
