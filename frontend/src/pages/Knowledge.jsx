import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  archiveKnowledgeItem,
  deleteKnowledgeItem,
  fetchKnowledgeItems,
  updateKnowledgeItem,
} from "../api";

const TAB_ITEMS = [
  { key: "pending", label: "未存档" },
  { key: "archived", label: "已存档" },
];

const { Text } = Typography;
const { TextArea } = Input;

function QaContentCell({ record }) {
  const q = record.q || "";
  const a = record.a || "";
  const full = `Q：${q}\n\nA：${a}`;
  const qShort = q.replace(/\s+/g, " ").trim();
  const aShort = a.replace(/\s+/g, " ").trim();
  if (!qShort && !aShort) {
    return (
      <Text type="secondary" className="report-content-empty">
        暂无内容
      </Text>
    );
  }
  return (
    <Tooltip
      mouseEnterDelay={0.15}
      placement="topLeft"
      overlayStyle={{ maxWidth: 640 }}
      overlayInnerStyle={{ maxHeight: 480, overflow: "auto", whiteSpace: "pre-wrap" }}
      title={<div className="report-content-tooltip">{full}</div>}
    >
      <div className="knowledge-qa-cell">
        <div className="knowledge-qa-line">
          <Text type="secondary" className="knowledge-qa-label">
            Q
          </Text>
          <span className="report-content-preview">{qShort || "—"}</span>
        </div>
        <div className="knowledge-qa-line">
          <Text type="secondary" className="knowledge-qa-label">
            A
          </Text>
          <span className="report-content-preview">{aShort || "—"}</span>
        </div>
      </div>
    </Tooltip>
  );
}

export default function Knowledge() {
  const [form] = Form.useForm();
  const [pending, setPending] = useState([]);
  const [archived, setArchived] = useState([]);
  const [loadingP, setLoadingP] = useState(false);
  const [loadingA, setLoadingA] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editStatus, setEditStatus] = useState("pending");
  const [editRecord, setEditRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  const [tabKey, setTabKey] = useState("pending");

  const [pageP, setPageP] = useState(1);
  const [pageSizeP, setPageSizeP] = useState(10);
  const [pageA, setPageA] = useState(1);
  const [pageSizeA, setPageSizeA] = useState(10);

  const loadPending = useCallback(async () => {
    setLoadingP(true);
    try {
      const res = await fetchKnowledgeItems("pending");
      if (res.success) setPending(res.items || []);
      else message.error(res.message || "加载未存档失败");
    } catch (e) {
      message.error(e?.response?.data?.message || e.message || "加载未存档失败");
    } finally {
      setLoadingP(false);
    }
  }, []);

  const loadArchived = useCallback(async () => {
    setLoadingA(true);
    try {
      const res = await fetchKnowledgeItems("archived");
      if (res.success) setArchived(res.items || []);
      else message.error(res.message || "加载已存档失败");
    } catch (e) {
      message.error(e?.response?.data?.message || e.message || "加载已存档失败");
    } finally {
      setLoadingA(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadPending(), loadArchived()]);
  }, [loadPending, loadArchived]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const total = pending.length;
    if (total === 0) {
      setPageP(1);
      return;
    }
    const maxPage = Math.max(1, Math.ceil(total / pageSizeP));
    if (pageP > maxPage) setPageP(maxPage);
  }, [pending.length, pageSizeP, pageP]);

  useEffect(() => {
    const total = archived.length;
    if (total === 0) {
      setPageA(1);
      return;
    }
    const maxPage = Math.max(1, Math.ceil(total / pageSizeA));
    if (pageA > maxPage) setPageA(maxPage);
  }, [archived.length, pageSizeA, pageA]);

  const openEdit = useCallback((status, record) => {
    setEditStatus(status);
    setEditRecord(record);
    form.setFieldsValue({
      q: record.q,
      a: record.a,
      source_name: record.source_name,
      source_date: record.source_date,
    });
    setModalOpen(true);
  }, [form]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditRecord(null);
    form.resetFields();
  }, [form]);

  const onSaveEdit = useCallback(async () => {
    try {
      const v = await form.validateFields();
      if (!editRecord) return;
      setSaving(true);
      const res = await updateKnowledgeItem(editStatus, editRecord.id, {
        q: v.q.trim(),
        a: v.a.trim(),
        source_name: (v.source_name || "").trim(),
        source_date: (v.source_date || "").trim(),
      });
      if (res.success) {
        message.success("已保存");
        closeModal();
        await loadAll();
      } else {
        message.error(res.message || "保存失败");
      }
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }, [form, editRecord, editStatus, closeModal, loadAll]);

  const onArchive = useCallback(
    async (record) => {
      try {
        const res = await archiveKnowledgeItem(record.id);
        if (res.success) {
          message.success("已存档");
          await loadAll();
        } else {
          message.error(res.message || "存档失败");
        }
      } catch (e) {
        message.error(e?.response?.data?.message || e.message || "存档失败");
      }
    },
    [loadAll]
  );

  const onDelete = useCallback(
    async (status, record) => {
      try {
        const res = await deleteKnowledgeItem(status, record.id);
        if (res.success) {
          message.success("已删除");
          if (editRecord && editRecord.id === record.id) closeModal();
          await loadAll();
        } else {
          message.error(res.message || "删除失败");
        }
      } catch (e) {
        message.error(e?.response?.data?.message || e.message || "删除失败");
      }
    },
    [loadAll, editRecord, closeModal]
  );

  const columnsPending = useMemo(
    () => [
      {
        title: "内容",
        dataIndex: "q",
        key: "content",
        ellipsis: false,
        render: (_, record) => <QaContentCell record={record} />,
      },
      {
        title: "来源",
        key: "source",
        width: 140,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text strong>{record.source_name || "—"}</Text>
            <Tag color="blue">{record.source_date || "—"}</Tag>
          </Space>
        ),
      },
      {
        title: "操作",
        key: "action",
        width: 240,
        align: "center",
        render: (_, record) => (
          <Space size={0} wrap>
            <Button type="link" icon={<EditOutlined />} onClick={() => openEdit("pending", record)}>
              编辑
            </Button>
            <Button type="link" icon={<SaveOutlined />} onClick={() => onArchive(record)}>
              存档
            </Button>
            <Popconfirm
              title="删除这条知识？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete("pending", record)}
            >
              <Button type="link" danger icon={<DeleteOutlined />} size="small">
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [openEdit, onArchive, onDelete]
  );

  const columnsArchived = useMemo(
    () => [
      {
        title: "内容",
        dataIndex: "q",
        key: "content",
        ellipsis: false,
        render: (_, record) => <QaContentCell record={record} />,
      },
      {
        title: "来源",
        key: "source",
        width: 200,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text strong>{record.source_name || "—"}</Text>
            <Tag color="blue">{record.source_date || "—"}</Tag>
          </Space>
        ),
      },
      {
        title: "操作",
        key: "action",
        width: 148,
        align: "center",
        render: (_, record) => (
          <Space size={0} wrap>
            <Button type="link" icon={<EditOutlined />} onClick={() => openEdit("archived", record)}>
              编辑
            </Button>
            <Popconfirm
              title="删除这条知识？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete("archived", record)}
            >
              <Button type="link" danger icon={<DeleteOutlined />} size="small">
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [openEdit, onDelete]
  );

  const paginationP = useMemo(
    () => ({
      current: pageP,
      pageSize: pageSizeP,
      total: pending.length,
      showSizeChanger: true,
      pageSizeOptions: [10, 20, 50, 100],
      showTotal: (total) => `共 ${total} 条`,
      hideOnSinglePage: false,
      selectProps: { showSearch: false },
      onChange: (p, ps) => {
        setPageP(p);
        setPageSizeP(ps);
      },
    }),
    [pageP, pageSizeP, pending.length]
  );

  const paginationA = useMemo(
    () => ({
      current: pageA,
      pageSize: pageSizeA,
      total: archived.length,
      showSizeChanger: true,
      pageSizeOptions: [10, 20, 50, 100],
      showTotal: (total) => `共 ${total} 条`,
      hideOnSinglePage: false,
      selectProps: { showSearch: false },
      onChange: (p, ps) => {
        setPageA(p);
        setPageSizeA(ps);
      },
    }),
    [pageA, pageSizeA, archived.length]
  );

  const handleTabChange = useCallback((key) => {
    setTabKey(key);
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="page-shell knowledge-page">
      <div className="analyze-journal-wrap knowledge-journal-shell">
        <div className="analyze-journal-tabs">
          {TAB_ITEMS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={
                tabKey === t.key ? "analyze-tab analyze-tab-active" : "analyze-tab"
              }
              onClick={() => handleTabChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="knowledge-journal-body">
          <Card className="page-card" variant="borderless">
            {tabKey === "pending" ? (
              <Table
                className="report-list-table"
                rowKey={(r) => r.id}
                loading={loadingP}
                columns={columnsPending}
                dataSource={pending}
                tableLayout="fixed"
                pagination={paginationP}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <span>
                          暂无未存档记录
                          <br />
                          <Text type="secondary">定时任务运行后会出现在此处</Text>
                        </span>
                      }
                    />
                  ),
                }}
              />
            ) : (
              <Table
                className="report-list-table"
                rowKey={(r) => r.id}
                loading={loadingA}
                columns={columnsArchived}
                dataSource={archived}
                tableLayout="fixed"
                pagination={paginationA}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={<Text type="secondary">暂无已存档记录</Text>}
                    />
                  ),
                }}
              />
            )}
          </Card>
        </div>
      </div>

      <Modal
        title="编辑 QA"
        open={modalOpen}
        onCancel={closeModal}
        footer={null}
        width={640}
        destroyOnClose
        className="report-form-modal"
        styles={{ body: { paddingTop: 8 } }}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item label="问题 Q" name="q" rules={[{ required: true, message: "请输入问题" }]}>
            <TextArea rows={4} placeholder="具体问题" maxLength={4000} showCount />
          </Form.Item>
          <Form.Item label="回答 A" name="a" rules={[{ required: true, message: "请输入回答" }]}>
            <TextArea rows={8} placeholder="可执行的做法与注意点" maxLength={12000} showCount />
          </Form.Item>
          <Form.Item label="来源客服" name="source_name">
            <Input placeholder="姓名" maxLength={64} />
          </Form.Item>
          <Form.Item label="来源日期" name="source_date">
            <Input placeholder="YYYY-MM-DD" maxLength={10} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button onClick={closeModal}>取消</Button>
              <Button type="primary" onClick={onSaveEdit} loading={saving}>
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
