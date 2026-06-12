import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  fetchKnowledgeCategories,
  fetchWechatBotKnowledge,
  fetchWechatBotTodos,
} from "../api";

const { Paragraph, Text, Title } = Typography;

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

  useEffect(() => {
    fetchKnowledgeCategories().then((res) => {
      if (res?.code === 200) {
        setCategoryOptions([
          { label: "全部分类", value: "" },
          ...res.data.map((c) => ({ label: c, value: c })),
        ]);
      }
    });
  }, []);

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

  const columns = useMemo(
    () => [
      { title: "ID", dataIndex: "id", key: "id", width: 76, align: "center" },
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
    columns,
  };
}

function useTodoTables() {
  const [insertTodos, setInsertTodos] = useState([]);
  const [updateTodos, setUpdateTodos] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadTodos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWechatBotTodos({
        grouped: true,
        limit: 200,
      });

      if (res?.code !== 200) {
        throw new Error(res?.message || "加载待处理事项失败");
      }

      const data = res.data || {};
      setInsertTodos(Array.isArray(data.insert) ? data.insert : []);
      setUpdateTodos(Array.isArray(data.update) ? data.update : []);
    } catch (error) {
      message.error(
        error?.response?.data?.message || error.message || "加载待处理事项失败"
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
        width: 160,
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

  const insertColumns = baseColumns;

  const updateColumns = useMemo(
    () => [
      ...baseColumns,
      {
        title: "关联 QA ID",
        dataIndex: "qa_id",
        key: "qa_id",
        width: 110,
        align: "center",
        render: (value) =>
          value ? <Text>{value}</Text> : <Text type="secondary">-</Text>,
      },
      {
        title: "相似问题",
        dataIndex: "similar_question",
        key: "similar_question",
        width: 280,
        render: (value) => <TextPreview value={value} empty="暂无相似问题" />,
      },
    ],
    [baseColumns]
  );

  return {
    insertTodos,
    updateTodos,
    loading,
    loadTodos,
    insertColumns,
    updateColumns,
  };
}

export default function WechatBotKnowledge() {
  const [activeTab, setActiveTab] = useState("knowledge");
  const knowledge = useKnowledgeTable();
  const todos = useTodoTables();

  useEffect(() => {
    if (activeTab === "insert" || activeTab === "update") {
      todos.loadTodos();
    }
  }, [activeTab, todos.loadTodos]);

  const handleRefresh = () => {
    if (activeTab === "knowledge") {
      knowledge.loadItems(knowledge.page, knowledge.pageSize, knowledge.category);
      return;
    }
    todos.loadTodos();
  };

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
            </Space>
          </div>
          <Table
            rowKey="id"
            size="small"
            className="report-list-table"
            loading={knowledge.loading}
            columns={knowledge.columns}
            dataSource={knowledge.items}
            scroll={{ x: 900 }}
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
            <Text type="secondary">共 {todos.insertTodos.length} 条</Text>
          </div>
          <Table
            rowKey="id"
            size="small"
            className="report-list-table"
            loading={todos.loading}
            columns={todos.insertColumns}
            dataSource={todos.insertTodos}
            scroll={{ x: 1500 }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (value) => `共 ${value} 条`,
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
            <Text type="secondary">共 {todos.updateTodos.length} 条</Text>
          </div>
          <Table
            rowKey="id"
            size="small"
            className="report-list-table"
            loading={todos.loading}
            columns={todos.updateColumns}
            dataSource={todos.updateTodos}
            scroll={{ x: 1600 }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (value) => `共 ${value} 条`,
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
    activeTab === "knowledge" ? knowledge.loading : todos.loading;

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
    </div>
  );
}
