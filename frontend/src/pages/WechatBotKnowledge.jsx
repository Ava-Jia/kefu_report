import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  addWechatBotKnowledgeItem,
  deleteWechatBotKnowledgeItem,
  deleteWechatBotTodo,
  fetchKnowledgeCategories,
  fetchTodoCategories,
  fetchWechatBotKnowledge,
  fetchWechatBotTodos,
  updateWechatBotKnowledgeItem,
  updateWechatBotTodo,
  writeWechatBotTodoToQa,
} from "../api";

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

function TextPreview({ value, empty }) {
  if (!value) {
    return <Text type="secondary">{empty}</Text>;
  }
  return (
    <Paragraph
      ellipsis={{ rows: 3, expandable: true, symbol: "展开" }}
      style={{ marginBottom: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
    >
      {value}
    </Paragraph>
  );
}

function TodoActionCell({ record, onWrite, onEdit, onDelete }) {
  const written = record.is_write === 1;

  return (
    <div className="wechat-bot-todo-actions">
      <Popconfirm
        title="将该条目写入知识库？"
        okText="写入"
        cancelText="取消"
        onConfirm={() => onWrite(record)}
        disabled={written}
      >
        <Button
          type="link"
          size="small"
          className="wechat-bot-todo-action-primary"
          icon={<SaveOutlined />}
          disabled={written}
        >
          {written ? "已写入" : "写入"}
        </Button>
      </Popconfirm>
      <div className="wechat-bot-todo-action-secondary">
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => onEdit(record)}
        >
          修改
        </Button>
        <Popconfirm
          title="删除这条待办？"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => onDelete(record)}
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}

const TODO_TABLE_PAGINATION_OPTIONS = {
  showSizeChanger: true,
  pageSizeOptions: [10, 20, 50, 100],
  showTotal: (value) => `共 ${value} 条`,
};

function useTodoTable(actionType) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [categoryOptions, setCategoryOptions] = useState([
    { label: "全部分类", value: "" },
  ]);

  const refreshCategories = useCallback(() => {
    fetchTodoCategories(actionType).then((res) => {
      if (res?.code === 200) {
        setCategoryOptions([
          { label: "全部分类", value: "" },
          ...res.data.map((c) => ({ label: c, value: c })),
        ]);
      }
    });
  }, [actionType]);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  const loadItems = useCallback(
    async (nextPage = 1, nextPageSize = pageSize, nextCategory = category) => {
      setLoading(true);
      try {
        const res = await fetchWechatBotTodos({
          action_type: actionType,
          page: nextPage,
          page_size: nextPageSize,
          ...(nextCategory ? { category: nextCategory } : {}),
        });

        if (res?.code !== 200) {
          throw new Error(res?.message || "加载待处理事项失败");
        }

        const payload = res.data || {};
        const pagination = payload.pagination || {};

        setItems(payload.list || []);
        setTotal(Number(pagination.total) || 0);
        setPage(Number(pagination.page) || nextPage);
        setPageSize(Number(pagination.page_size) || nextPageSize);
      } catch (error) {
        message.error(
          error?.response?.data?.message || error.message || "加载待处理事项失败"
        );
      } finally {
        setLoading(false);
      }
    },
    [actionType, pageSize, category]
  );

  useEffect(() => {
    loadItems(1, pageSize, category);
  }, [loadItems, pageSize, category]);

  const baseColumns = useMemo(
    () => [
      {
        title: "问题",
        dataIndex: "question",
        key: "question",
        ellipsis: false,
        render: (value) => <TextPreview value={value} empty="暂无问题" />,
      },
      {
        title: "答案",
        dataIndex: "answer",
        key: "answer",
        ellipsis: false,
        render: (value) => <TextPreview value={value} empty="暂无答案" />,
      },
      {
        title: "分类",
        dataIndex: "category",
        key: "category",
        width: 112,
        render: (value) =>
          value ? (
            <Tag color="blue">{value}</Tag>
          ) : (
            <Text type="secondary">未分类</Text>
          ),
      },
    ],
    []
  );

  const updateExtraColumns = useMemo(
    () => [
      {
        title: "相似问题",
        dataIndex: "similar_question",
        key: "similar_question",
        ellipsis: false,
        render: (value) => <TextPreview value={value} empty="暂无相似问题" />,
      },
      {
        title: "相似答案",
        dataIndex: "similar_answer",
        key: "similar_answer",
        ellipsis: false,
        render: (value) => <TextPreview value={value} empty="暂无相似答案" />,
      },
    ],
    []
  );

  return {
    items,
    loading,
    page,
    pageSize,
    total,
    category,
    categoryInput,
    setCategoryInput,
    setCategory,
    categoryOptions,
    loadItems,
    baseColumns,
    updateExtraColumns,
    refreshCategories,
  };
}

function useKnowledgeTable() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [categoryOptions, setCategoryOptions] = useState([
    { label: "全部分类", value: "" },
  ]);

  const refreshCategories = useCallback(() => {
    fetchKnowledgeCategories().then((res) => {
      if (res?.code === 200) {
        setCategoryOptions([
          { label: "全部分类", value: "" },
          ...res.data.map((c) => ({ label: c, value: c })),
        ]);
      }
    });
  }, []);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  const loadItems = useCallback(
    async (nextPage = 1, nextPageSize = pageSize, nextCategory = category) => {
      setLoading(true);
      try {
        const res = await fetchWechatBotKnowledge({
          page: nextPage,
          page_size: nextPageSize,
          ...(nextCategory ? { category: nextCategory } : {}),
        });

        if (res?.code !== 200) {
          throw new Error(res?.message || "加载知识库失败");
        }

        const payload = res.data || {};
        const pagination = payload.pagination || {};

        setItems(payload.list || []);
        setTotal(Number(pagination.total) || 0);
        setPage(Number(pagination.page) || nextPage);
        setPageSize(Number(pagination.page_size) || nextPageSize);
      } catch (error) {
        message.error(
          error?.response?.data?.message || error.message || "加载知识库失败"
        );
      } finally {
        setLoading(false);
      }
    },
    [pageSize, category]
  );

  useEffect(() => {
    loadItems(1, pageSize, category);
  }, [loadItems, pageSize, category]);

  const baseColumns = useMemo(
    () => [
      {
        title: "问题",
        dataIndex: "question",
        key: "question",
        width: 280,
        render: (value) => <TextPreview value={value} empty="暂无问题" />,
      },
      {
        title: "答案",
        dataIndex: "answer",
        key: "answer",
        width: 320,
        render: (value) => <TextPreview value={value} empty="暂无答案" />,
      },
      {
        title: "分类",
        dataIndex: "category",
        key: "category",
        width: 180,
        render: (value) =>
          value ? (
            <Tag color="blue">{value}</Tag>
          ) : (
            <Text type="secondary">未分类</Text>
          ),
      },
    ],
    []
  );

  return {
    items,
    loading,
    page,
    pageSize,
    total,
    category,
    categoryInput,
    setCategoryInput,
    setCategory,
    categoryOptions,
    loadItems,
    baseColumns,
    refreshCategories,
  };
}

export default function WechatBotKnowledge() {
  const [activeTab, setActiveTab] = useState("knowledge");
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [modalTarget, setModalTarget] = useState("knowledge");
  const [editRecord, setEditRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  const knowledge = useKnowledgeTable();
  const insertTodos = useTodoTable("insert");
  const updateTodos = useTodoTable("update");

  const reloadActiveTodoTable = useCallback(() => {
    if (activeTab === "insert") {
      insertTodos.loadItems(insertTodos.page, insertTodos.pageSize, insertTodos.category);
      return;
    }
    if (activeTab === "update") {
      updateTodos.loadItems(updateTodos.page, updateTodos.pageSize, updateTodos.category);
    }
  }, [
    activeTab,
    insertTodos.loadItems,
    insertTodos.page,
    insertTodos.pageSize,
    insertTodos.category,
    updateTodos.loadItems,
    updateTodos.page,
    updateTodos.pageSize,
    updateTodos.category,
  ]);

  useEffect(() => {
    if (activeTab === "insert") {
      insertTodos.loadItems(insertTodos.page, insertTodos.pageSize, insertTodos.category);
    } else if (activeTab === "update") {
      updateTodos.loadItems(updateTodos.page, updateTodos.pageSize, updateTodos.category);
    }
    // 仅在切换 Tab 时加载，翻页由 Table pagination.onChange 触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditRecord(null);
    form.resetFields();
  }, [form]);

  const openCreateKnowledge = useCallback(() => {
    setModalMode("create");
    setModalTarget("knowledge");
    setEditRecord(null);
    form.setFieldsValue({ question: "", answer: "", category: "" });
    setModalOpen(true);
  }, [form]);

  const openEditKnowledge = useCallback(
    (record) => {
      setModalMode("edit");
      setModalTarget("knowledge");
      setEditRecord(record);
      form.setFieldsValue({
        question: record.question || "",
        answer: record.answer || "",
        category: record.category || "",
      });
      setModalOpen(true);
    },
    [form]
  );

  const openEditTodo = useCallback(
    (record) => {
      setModalMode("edit");
      setModalTarget("todo");
      setEditRecord(record);
      form.setFieldsValue({
        question: record.question || "",
        answer: record.answer || "",
        category: record.category || "",
      });
      setModalOpen(true);
    },
    [form]
  );

  const onSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (modalTarget === "knowledge") {
        const payload = {
          question: values.question.trim(),
          answer: (values.answer || "").trim(),
          category: (values.category || "").trim() || null,
        };

        const res =
          modalMode === "create"
            ? await addWechatBotKnowledgeItem(payload)
            : await updateWechatBotKnowledgeItem(editRecord.id, payload);

        if (res?.code !== 200) {
          message.error(res?.message || "保存失败");
          return;
        }

        message.success(modalMode === "create" ? "新增成功" : "修改成功");
        closeModal();
        knowledge.refreshCategories();
        knowledge.loadItems(knowledge.page, knowledge.pageSize, knowledge.category);
        return;
      }

      const payload = {
        question: values.question.trim(),
        answer: (values.answer || "").trim(),
        category: (values.category || "").trim(),
      };

      const res = await updateWechatBotTodo(editRecord.id, payload);
      if (res?.code !== 200) {
        message.error(res?.message || "保存失败");
        return;
      }

      message.success("修改成功");
      closeModal();
      reloadActiveTodoTable();
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || error.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }, [
    form,
    modalTarget,
    modalMode,
    editRecord,
    closeModal,
    knowledge,
    reloadActiveTodoTable,
  ]);

  const onDeleteKnowledge = useCallback(
    async (record) => {
      try {
        const res = await deleteWechatBotKnowledgeItem(record.id);
        if (res?.code !== 200) {
          message.error(res?.message || "删除失败");
          return;
        }
        message.success("删除成功");
        if (editRecord?.id === record.id) closeModal();
        knowledge.loadItems(knowledge.page, knowledge.pageSize, knowledge.category);
      } catch (error) {
        message.error(error?.response?.data?.message || error.message || "删除失败");
      }
    },
    [editRecord, closeModal, knowledge]
  );

  const onDeleteTodo = useCallback(
    async (record) => {
      try {
        const res = await deleteWechatBotTodo(record.id);
        if (res?.code !== 200) {
          message.error(res?.message || "删除失败");
          return;
        }
        message.success("删除成功");
        if (editRecord?.id === record.id) closeModal();
        reloadActiveTodoTable();
      } catch (error) {
        message.error(error?.response?.data?.message || error.message || "删除失败");
      }
    },
    [editRecord, closeModal, reloadActiveTodoTable]
  );

  const onWriteTodoToQa = useCallback(
    async (record) => {
      try {
        const res = await writeWechatBotTodoToQa(record.id);
        if (res?.code !== 200) {
          message.error(res?.message || "写入失败");
          return;
        }
        message.success("已写入知识库");
        reloadActiveTodoTable();
      } catch (error) {
        message.error(error?.response?.data?.message || error.message || "写入失败");
      }
    },
    [reloadActiveTodoTable]
  );

  const knowledgeActionColumn = useMemo(
    () => ({
      title: "操作",
      key: "action",
      width: 140,
      align: "center",
      fixed: "right",
      render: (_, record) => (
        <Space size={0} wrap>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditKnowledge(record)}
          >
            修改
          </Button>
          <Popconfirm
            title="删除这条知识？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDeleteKnowledge(record)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    }),
    [openEditKnowledge, onDeleteKnowledge]
  );

  const todoActionColumn = useMemo(
    () => ({
      title: "操作",
      key: "action",
      width: 108,
      align: "center",
      className: "wechat-bot-todo-action-col",
      render: (_, record) => (
        <TodoActionCell
          record={record}
          onWrite={onWriteTodoToQa}
          onEdit={openEditTodo}
          onDelete={onDeleteTodo}
        />
      ),
    }),
    [onWriteTodoToQa, openEditTodo, onDeleteTodo]
  );

  const knowledgeColumns = useMemo(
    () => [...knowledge.baseColumns, knowledgeActionColumn],
    [knowledge.baseColumns, knowledgeActionColumn]
  );

  const insertColumns = useMemo(
    () => [...insertTodos.baseColumns, todoActionColumn],
    [insertTodos.baseColumns, todoActionColumn]
  );

  const updateColumns = useMemo(
    () => [...updateTodos.baseColumns, ...updateTodos.updateExtraColumns, todoActionColumn],
    [updateTodos.baseColumns, updateTodos.updateExtraColumns, todoActionColumn]
  );

  const handleRefresh = () => {
    if (activeTab === "knowledge") {
      knowledge.loadItems(knowledge.page, knowledge.pageSize, knowledge.category);
      return;
    }
    reloadActiveTodoTable();
  };

  const modalTitle =
    modalTarget === "knowledge"
      ? modalMode === "create"
        ? "新增知识"
        : "修改知识"
      : "修改待办";

  const tabItems = [
    {
      key: "knowledge",
      label: "知识库",
      children: (
        <>
          <div className="wechat-bot-toolbar">
            <Space wrap>
              <Select
                value={knowledge.categoryInput}
                onChange={(val) => {
                  const nextCategory = val ?? "";
                  knowledge.setCategoryInput(nextCategory);
                  knowledge.setCategory(nextCategory);
                }}
                options={knowledge.categoryOptions}
                style={{ width: 240 }}
                placeholder="选择分类"
                showSearch
                allowClear
                optionFilterProp="label"
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateKnowledge}>
                新增
              </Button>
            </Space>
          </div>
          <Table
            rowKey="id"
            size="small"
            className="report-list-table"
            loading={knowledge.loading}
            columns={knowledgeColumns}
            dataSource={knowledge.items}
            scroll={{ x: 1000 }}
            pagination={{
              current: knowledge.page,
              pageSize: knowledge.pageSize,
              total: knowledge.total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (value) => `共 ${value} 条`,
              onChange: (nextPage, nextPageSize) => {
                knowledge.loadItems(nextPage, nextPageSize, knowledge.category);
              },
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无知识库数据"
                />
              ),
            }}
          />
        </>
      ),
    },
    {
      key: "insert",
      label: (
        <span>
          <PlusCircleOutlined style={{ marginRight: 6 }} />
          待新增
        </span>
      ),
      children: (
        <>
          <div className="wechat-bot-toolbar">
            <Select
              value={insertTodos.categoryInput}
              onChange={(val) => {
                const nextCategory = val ?? "";
                insertTodos.setCategoryInput(nextCategory);
                insertTodos.setCategory(nextCategory);
              }}
              options={insertTodos.categoryOptions}
              style={{ width: 240 }}
              placeholder="选择分类"
              showSearch
              allowClear
              optionFilterProp="label"
            />
          </div>
          <Table
            rowKey="id"
            size="small"
            className="report-list-table wechat-bot-todo-table"
            tableLayout="fixed"
            loading={insertTodos.loading}
            columns={insertColumns}
            dataSource={insertTodos.items}
            pagination={{
              current: insertTodos.page,
              pageSize: insertTodos.pageSize,
              total: insertTodos.total,
              ...TODO_TABLE_PAGINATION_OPTIONS,
              onChange: (nextPage, nextPageSize) => {
                insertTodos.loadItems(nextPage, nextPageSize, insertTodos.category);
              },
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无待新增数据"
                />
              ),
            }}
          />
        </>
      ),
    },
    {
      key: "update",
      label: (
        <span>
          <SyncOutlined style={{ marginRight: 6 }} />
          待更新
        </span>
      ),
      children: (
        <>
          <div className="wechat-bot-toolbar">
            <Select
              value={updateTodos.categoryInput}
              onChange={(val) => {
                const nextCategory = val ?? "";
                updateTodos.setCategoryInput(nextCategory);
                updateTodos.setCategory(nextCategory);
              }}
              options={updateTodos.categoryOptions}
              style={{ width: 240 }}
              placeholder="选择分类"
              showSearch
              allowClear
              optionFilterProp="label"
            />
          </div>
          <Table
            rowKey="id"
            size="small"
            className="report-list-table wechat-bot-todo-table"
            tableLayout="fixed"
            loading={updateTodos.loading}
            columns={updateColumns}
            dataSource={updateTodos.items}
            pagination={{
              current: updateTodos.page,
              pageSize: updateTodos.pageSize,
              total: updateTodos.total,
              ...TODO_TABLE_PAGINATION_OPTIONS,
              onChange: (nextPage, nextPageSize) => {
                updateTodos.loadItems(nextPage, nextPageSize, updateTodos.category);
              },
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无待更新数据"
                />
              ),
            }}
          />
        </>
      ),
    },
  ];

  const pageLoading =
    activeTab === "knowledge"
      ? knowledge.loading
      : activeTab === "insert"
        ? insertTodos.loading
        : updateTodos.loading;

  return (
    <div className="page-shell wechat-bot-page">
      <div className="page-header-block">
        <div>
          <Title level={3} className="page-title" style={{ marginBottom: 8 }}>
            <BookOutlined style={{ marginRight: 10 }} />
            Wechat Bot 知识库
          </Title>
        </div>
        <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={pageLoading}>
          刷新
        </Button>
      </div>

      <Card className="page-card wechat-bot-card" variant="borderless">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          className="wechat-bot-tabs"
        />
      </Card>

      <Modal
        title={modalTitle}
        open={modalOpen}
        onCancel={closeModal}
        onOk={onSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={640}
        destroyOnClose
        className="report-form-modal"
        styles={{ body: { paddingTop: 8 } }}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            label="问题"
            name="question"
            rules={[{ required: true, message: "请输入问题" }]}
          >
            <TextArea rows={4} placeholder="具体问题" maxLength={4000} showCount />
          </Form.Item>
          <Form.Item label="答案" name="answer">
            <TextArea rows={8} placeholder="回答内容" maxLength={12000} showCount />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Input placeholder="分类名称" maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
