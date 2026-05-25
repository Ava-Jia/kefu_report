import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { deleteReport, fetchReport, fetchReports, saveReport } from "../api";

const { TextArea } = Input;
const { Title, Text } = Typography;

function reportRowKey(record) {
  return `${record.name}_${record.date}`;
}

export default function ReportForm() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [nameOptions, setNameOptions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  /** 编辑入口对应的原列表键，保存时若改了姓名/日期则让后端删旧文件 */
  const [editOriginal, setEditOriginal] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [draftName, setDraftName] = useState(undefined);
  const [draftDate, setDraftDate] = useState(null);
  const [appliedFilters, setAppliedFilters] = useState({ name: undefined, date: undefined });
  const [lockedKey, setLockedKey] = useState(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const params = {};
      if (appliedFilters.name) params.name = appliedFilters.name;
      if (appliedFilters.date) {
        params.start_date = appliedFilters.date;
        params.end_date = appliedFilters.date;
      }
      const res = await fetchReports(params);
      if (res.success) {
        const list = res.reports || [];
        setReports(list);
        if (!appliedFilters.name && !appliedFilters.date) {
          setNameOptions([...new Set(list.map((r) => r.name))].sort());
        }
        setLockedKey((prev) =>
          prev && list.some((r) => reportRowKey(r) === prev) ? prev : null
        );
      } else {
        message.error(res.message || "加载列表失败");
      }
    } catch (e) {
      message.error(e?.response?.data?.message || e.message || "加载列表失败");
    } finally {
      setListLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  /** 姓名 + 日期均筛选且仅一条时自动选中 */
  useEffect(() => {
    if (appliedFilters.name && appliedFilters.date && reports.length === 1) {
      setLockedKey(reportRowKey(reports[0]));
    }
  }, [reports, appliedFilters.name, appliedFilters.date]);

  /** 数据变少时避免当前页超出范围；受控分页需配合 total */
  useEffect(() => {
    const total = reports.length;
    if (total === 0) {
      setPage(1);
      return;
    }
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [reports.length, pageSize, page]);

  const resetFormForCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(),
      name: "",
      content: "",
    });
  };

  const openCreate = () => {
    setModalMode("create");
    setEditOriginal(null);
    resetFormForCreate();
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditOriginal(null);
    resetFormForCreate();
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const dateStr = values.date.format("YYYY-MM-DD");
      const payload = {
        name: values.name.trim(),
        date: dateStr,
        content: values.content ?? "",
      };
      if (modalMode === "edit" && editOriginal) {
        payload.replace_name = editOriginal.name;
        payload.replace_date = editOriginal.date;
      }
      const res = await saveReport(payload);
      if (res.success) {
        message.success(res.message || "保存成功");
        closeModal();
        await loadList();
      } else {
        message.error(res.message || "保存失败");
      }
    } catch (e) {
      message.error(e?.response?.data?.message || e.message || "保存失败");
    } finally {
      setLoading(false);
    }
  };

  const onEdit = useCallback(
    async (record) => {
      try {
        const res = await fetchReport(record.name, record.date);
        if (res.success) {
          setModalMode("edit");
          setEditOriginal({ name: record.name, date: record.date });
          form.setFieldsValue({
            name: res.name,
            date: dayjs(res.date, "YYYY-MM-DD"),
            content: res.content ?? "",
          });
          setModalOpen(true);
        } else {
          message.error(res.message || "读取失败");
        }
      } catch (e) {
        message.error(e?.response?.data?.message || e.message || "读取失败");
      }
    },
    [form]
  );

  const onDelete = useCallback(
    async (record) => {
      try {
        const res = await deleteReport(record.name, record.date);
        if (res.success) {
          message.success(res.message || "已删除");
          if (reportRowKey(record) === lockedKey) {
            setLockedKey(null);
          }
          if (
            editOriginal &&
            editOriginal.name === record.name &&
            editOriginal.date === record.date
          ) {
            setEditOriginal(null);
            setModalOpen(false);
            resetFormForCreate();
          }
          await loadList();
        } else {
          message.error(res.message || "删除失败");
        }
      } catch (e) {
        message.error(e?.response?.data?.message || e.message || "删除失败");
      }
    },
    [editOriginal, loadList, lockedKey]
  );

  const lockedRecord = useMemo(
    () => reports.find((r) => reportRowKey(r) === lockedKey) ?? null,
    [reports, lockedKey]
  );

  const onSearch = () => {
    setAppliedFilters({
      name: draftName,
      date: draftDate ? draftDate.format("YYYY-MM-DD") : undefined,
    });
    setPage(1);
  };

  const onResetFilters = () => {
    setDraftName(undefined);
    setDraftDate(null);
    setAppliedFilters({ name: undefined, date: undefined });
    setLockedKey(null);
    setPage(1);
  };

  const hasActiveFilters = !!(appliedFilters.name || appliedFilters.date);

  const columns = useMemo(
    () => [
      {
        title: "客服姓名",
        dataIndex: "name",
        key: "name",
        width: 160,
        render: (text) => (
          <Space>
            <FileTextOutlined style={{ color: "var(--app-accent)" }} />
            <Text strong>{text}</Text>
          </Space>
        ),
      },
      {
        title: "日期",
        dataIndex: "date",
        key: "date",
        width: 140,
        render: (d) => <Tag color="blue">{d}</Tag>,
      },
      {
        title: "内容",
        dataIndex: "content",
        key: "content",
        ellipsis: false,
        render: (text) => {
          const full = typeof text === "string" ? text : "";
          const normalized = full.replace(/\s+/g, " ").trim();
          if (!normalized) {
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
              overlayStyle={{ maxWidth: 560 }}
              overlayInnerStyle={{ maxHeight: 420, overflow: "auto" }}
              title={
                <div className="report-content-tooltip">
                  {full}
                </div>
              }
            >
              <span className="report-content-preview">{normalized}</span>
            </Tooltip>
          );
        },
      },
      {
        title: "操作",
        key: "action",
        width: 148,
        align: "center",
        render: (_, record) => (
          <Space size={0} onClick={(e) => e.stopPropagation()}>
            <Button type="link" icon={<EditOutlined />} onClick={() => onEdit(record)}>
              编辑
            </Button>
            <Popconfirm
              title="删除这条日报？"
              description={`将删除文件 ${record.name}_${record.date}.txt `}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(record)}
            >
              <Button type="link" danger icon={<DeleteOutlined />} size="small">
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [onEdit, onDelete]
  );

  const tablePagination = useMemo(
    () => ({
      current: page,
      pageSize,
      total: reports.length,
      showSizeChanger: true,
      pageSizeOptions: [10, 20, 50, 100],
      showTotal: (total) => `共 ${total} 条`,
      hideOnSinglePage: false,
      /** 关闭「每页条数」下拉里变成可搜索输入的问题 */
      selectProps: {
        showSearch: false,
        virtual: false
      },
      onChange: (p, ps) => {
        setPage(p);
        setPageSize(ps);
      },
    }),
    [page, pageSize, reports.length]
  );

  return (
    <div className="page-shell">
      <div className="page-header-block report-page-header">
        <div className="page-header-title">
          <Title level={3} className="page-title" style={{ marginBottom: 4 }}>
            日报管理
          </Title>
          <Text type="secondary">查看已提交的日报，支持新增、编辑与查询</Text>
        </div>
        <div className="report-filter-bar">
          <Space wrap size="middle" align="center">
            <Space size={8}>
              <Text type="secondary">客服姓名</Text>
              <Select
                allowClear
                showSearch
                placeholder="全部"
                style={{ width: 160 }}
                value={draftName}
                options={nameOptions.map((n) => ({ label: n, value: n }))}
                optionFilterProp="label"
                onChange={setDraftName}
              />
            </Space>
            <Space size={8}>
              <Text type="secondary">日期</Text>
              <DatePicker
                allowClear
                placeholder="全部"
                value={draftDate}
                format="YYYY-MM-DD"
                onChange={setDraftDate}
              />
            </Space>
            <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
              查询
            </Button>
            <Button onClick={onResetFilters} disabled={!hasActiveFilters && !draftName && !draftDate}>
              重置
            </Button>
          </Space>
          {lockedRecord && (
            <Text type="secondary" className="report-locked-hint">
              已选中：<Text strong>{lockedRecord.name}</Text> · {lockedRecord.date}
            </Text>
          )}
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
          新增日报
        </Button>
      </div>

      <Card className="page-card" variant="borderless">
        <Table
          className="report-list-table"
          rowKey={reportRowKey}
          loading={listLoading}
          columns={columns}
          dataSource={reports}
          tableLayout="fixed"
          pagination={tablePagination}
          rowSelection={{
            type: "radio",
            selectedRowKeys: lockedKey ? [lockedKey] : [],
            onChange: (keys) => setLockedKey(keys[0] ?? null),
          }}
          onRow={(record) => ({
            onClick: () => setLockedKey(reportRowKey(record)),
            className:
              reportRowKey(record) === lockedKey ? "report-row-selected" : undefined,
          })}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    {hasActiveFilters ? "没有符合筛选条件的日报" : "暂无日报记录"}
                    <br />
                    <Text type="secondary">
                      {hasActiveFilters
                        ? "请调整筛选条件或点击「重置」"
                        : "点击右上角「新增日报」开始填写"}
                    </Text>
                  </span>
                }
              />
            ),
          }}
        />
      </Card>

      <Modal
        title={modalMode === "create" ? "填写日报" : "编辑日报"}
        open={modalOpen}
        onCancel={() => {
          closeModal();
        }}
        footer={null}
        width={640}
        destroyOnClose
        className="report-form-modal"
        styles={{
          body: { paddingTop: 8 },
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark="optional"
          initialValues={{
            date: dayjs(),
            name: "",
            content: "",
          }}
        >
          <Form.Item
            label="姓名"
            name="name"
            rules={[{ required: true, message: "请输入姓名" }]}
          >
            <Input placeholder="例如：张三" maxLength={64} size="large" />
          </Form.Item>
          <Form.Item
            label="日期"
            name="date"
            rules={[{ required: true, message: "请选择日期" }]}
          >
            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" size="large" />
          </Form.Item>
          <Form.Item label="日报内容" name="content">
            <TextArea
              rows={12}
              placeholder={
                "示例：\n1. 今日处理客户 32 个\n2. 处理投诉 3 个\n3. 客户主要问题是物流延迟"
              }
              showCount
              maxLength={20000}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button onClick={() => closeModal()}>取消</Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                提交保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
