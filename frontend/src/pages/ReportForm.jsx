import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { PlusOutlined, EditOutlined, FileTextOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { fetchReport, fetchReports, saveReport } from "../api";

const { TextArea } = Input;
const { Title, Text } = Typography;

export default function ReportForm() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetchReports();
      if (res.success) {
        setReports(res.reports || []);
      } else {
        message.error(res.message || "加载列表失败");
      }
    } catch (e) {
      message.error(e?.response?.data?.message || e.message || "加载列表失败");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

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
    resetFormForCreate();
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetFormForCreate();
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const dateStr = values.date.format("YYYY-MM-DD");
      const res = await saveReport({
        name: values.name.trim(),
        date: dateStr,
        content: values.content ?? "",
      });
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
        width: 96,
        align: "center",
        render: (_, record) => (
          <Button type="link" icon={<EditOutlined />} onClick={() => onEdit(record)}>
            编辑
          </Button>
        ),
      },
    ],
    [onEdit]
  );

  return (
    <div className="page-shell">
      <div className="page-header-block">
        <div>
          <Title level={3} className="page-title" style={{ marginBottom: 4 }}>
            日报管理
          </Title>
          <Text type="secondary">查看已提交的日报，支持新增与编辑保存</Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
          新增日报
        </Button>
      </div>

      <Card className="page-card" variant="borderless">
        <Table
          className="report-list-table"
          rowKey={(r) => `${r.name}_${r.date}`}
          loading={listLoading}
          columns={columns}
          dataSource={reports}
          tableLayout="fixed"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    暂无日报记录
                    <br />
                    <Text type="secondary">点击右上角「新增日报」开始填写</Text>
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
