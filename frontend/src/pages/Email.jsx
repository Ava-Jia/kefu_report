import { useState, useEffect } from 'react';
import {
  Button, Card, DatePicker, Descriptions, Empty, Input, Popover, Space,
  Spin, Tag, Typography, message, Modal, Table, Select,
} from 'antd';
import { SearchOutlined, LinkOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { checkEmailParserResult, fetchEmailHtml, fetchEmailList } from '../api';

const { Text, Paragraph } = Typography;

const parseEmail = (raw) => {
  if (!raw) return '-';
  const m = raw.match(/<([^>]+)>/);
  return m ? m[1] : raw.trim();
};

const INTENT_COLOR = {
  CANCEL_IT: 'red',
  REEXPORT_RETURN: 'volcano',
  RELEASE: 'green',
  ARRIVAL_PICKUP_LFD: 'orange',
  CUSTOMS_EXAM_CLEARANCE: 'purple',
  TRANSPORT_STATUS: 'blue',
  EMPTY_RETURN_EQUIPMENT: 'cyan',
  PAYMENT_FINANCE: 'gold',
  DOCUMENT_BL: 'geekblue',
  SHIPPING_COMPANY_REPLY: 'lime',
  EXCHANGE_OF_PORT: 'magenta',
  OTHER: 'default',
};

const INTENT_LABEL = {
  CANCEL_IT: '取消 IT',
  REEXPORT_RETURN: '重新出口/退运',
  RELEASE: '放货/放行',
  ARRIVAL_PICKUP_LFD: '到港/提货/LFD',
  CUSTOMS_EXAM_CLEARANCE: '海关查验/清关',
  TRANSPORT_STATUS: '运输状态',
  EMPTY_RETURN_EQUIPMENT: '还空/设备',
  PAYMENT_FINANCE: '付款/财务',
  DOCUMENT_BL: '文件/提单',
  SHIPPING_COMPANY_REPLY: '船公司回复',
  EXCHANGE_OF_PORT: '换港',
  OTHER: '其他',
};

const INTENT_OPTIONS = Object.keys(INTENT_COLOR).map((value) => ({
  label: value,
  value,
}));

const splitValues = (v) =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

const MultiMbl = ({ value }) => {
  const [open, setOpen] = useState(false);
  const items = splitValues(value);
  if (!items.length) return '-';
  if (items.length === 1) return <Text copyable>{items[0]}</Text>;
  return (
    <>
      <span style={{ cursor: 'pointer' }} onClick={() => setOpen(true)}>
        <Text copyable={{ text: items[0] }}>{items[0]}</Text>
        <Tag style={{ marginLeft: 4 }}>+{items.length - 1}</Tag>
      </span>
      <Modal
        title={`全部 MBL（${items.length}）`}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={400}
      >
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {items.map((m) => <Text key={m} copyable>{m}</Text>)}
          </Space>
        </div>
      </Modal>
    </>
  );
};

const MultiIntent = ({ value }) => {
  const items = splitValues(value);
  if (!items.length) return '-';
  if (items.length === 1) return <Tag color={INTENT_COLOR[items[0]] ?? 'blue'}>{items[0]}</Tag>;
  return (
    <Popover
      trigger="click"
      content={
        <Space wrap size={4}>
          {items.map((v) => <Tag key={v} color={INTENT_COLOR[v] ?? 'blue'}>{v}</Tag>)}
        </Space>
      }
    >
      <span style={{ cursor: 'pointer' }}>
        <Tag color={INTENT_COLOR[items[0]] ?? 'blue'}>{items[0]}</Tag>
        <Tag>+{items.length - 1}</Tag>
      </span>
    </Popover>
  );
};

const PreviewButton = ({ row, onPreview }) => {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetchEmailHtml(row.id);
      if (res?.code === 200) {
        onPreview({ ...row, html_content: res.data.html_content });
      } else {
        message.error(res?.message || '获取 HTML 失败');
      }
    } catch (e) {
      message.error(e.message || '获取 HTML 失败');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button size="small" icon={<EyeOutlined />} loading={loading} onClick={handleClick}>
      预览
    </Button>
  );
};

const buildTableColumns = (onPreview) => [
  {
    title: 'MBL 号',
    dataIndex: 'mbl_number',
    key: 'mbl_number',
    width: 200,
    render: (v) => <MultiMbl value={v} />,
  },
  {
    title: '发件人',
    dataIndex: 'from',
    key: 'from',
    width: 220,
    ellipsis: true,
    render: (v) => v ? parseEmail(v) : '-',
  },
  {
    title: '一级意图',
    dataIndex: 'intent_type1',
    key: 'intent_type1',
    width: 180,
    render: (v) => <MultiIntent value={v} />,
  },
  {
    title: '操作',
    key: 'action',
    width: 80,
    render: (_, row) => <PreviewButton row={row} onPreview={onPreview} />,
  },
  {
    title: '日期',
    dataIndex: 'date',
    key: 'date',
    width: 200,
    render: (v) => v || '-',
  },
  
];

export default function Email() {
  const [taskId, setTaskId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [htmlVisible, setHtmlVisible] = useState(false);
  const [previewRow, setPreviewRow] = useState(null);
  const [category, setCategory] = useState('');

  const [tableData, setTableData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  const [dateRange, setDateRange] = useState([null, null]);

  const handleTablePreview = (row) => setPreviewRow(row);
  const tableColumns = buildTableColumns(handleTablePreview);

  const loadTable = async (page = 1, pageSize = 50, nextCategory = category, nextDateRange = dateRange) => {
    setTableLoading(true);
    try {
      const res = await fetchEmailList({
        page,
        page_size: pageSize,
        intent_type1: nextCategory,
        date_from: nextDateRange?.[0] ? nextDateRange[0].format('YYYY-MM-DD') : '',
        date_to: nextDateRange?.[1] ? nextDateRange[1].format('YYYY-MM-DD') : '',
      });
      if (res?.code === 200) {
        setTableData(res.data.items);
        setPagination((p) => ({ ...p, current: page, pageSize, total: res.data.total }));
      } else {
        message.error(res?.message || '加载失败');
      }
    } catch (e) {
      message.error(e.message || '加载失败');
    } finally {
      setTableLoading(false);
    }
  };
  useEffect(() => { loadTable(); }, []);

  const handleCategoryChange = (value) => {
    setCategory(value);
    loadTable(1, pagination.pageSize, value, dateRange);
  };

  const handleDateChange = (dates) => {
    setDateRange(dates ?? [null, null]);
    loadTable(1, pagination.pageSize, category, dates ?? [null, null]);
  };

  const handleSearch = async () => {
    const trimmed = taskId.trim();
    if (!trimmed) { message.warning('请输入 email_task_id'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await checkEmailParserResult(trimmed);
      if (res?.code === 200) {
        setResult(res.data);
        message.success(res.message || '查询成功');
      } else {
        message.error(res?.message || '查询失败');
      }
    } catch (e) {
      message.error(e?.response?.data?.message || e.message || '查询失败');
    } finally {
      setLoading(false);
    }
  };

  const r = result?.result ?? {};

  return (
    <div style={{ padding: '0 4px' }}>
      <h2 style={{ marginBottom: 16 }}>Email 管理</h2>

      {/* 邮件列表表格 */}
      <Card
        size="small"
        title={`邮件列表（共 ${pagination.total} 条）`}
        style={{ marginBottom: 24 }}
        extra={
          <Button icon={<SyncOutlined />} size="small" onClick={() => loadTable(1, pagination.pageSize, category, dateRange)}>
            刷新
          </Button>
        }
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            allowClear
            value={category || undefined}
            placeholder="全部类别"
            options={INTENT_OPTIONS}
            style={{ width: 180 }}
            onChange={(value) => handleCategoryChange(value || '')}
          />
          <DatePicker.RangePicker
            value={dateRange}
            onChange={handleDateChange}
            allowClear
            placeholder={['开始日期', '结束日期']}
            disabledDate={(d) => d && d > dayjs().endOf('day')}
          />
        </Space>
        <Table
          rowKey="id"
          columns={tableColumns}
          dataSource={tableData}
          loading={tableLoading}
          size="small"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '50', '100'],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => loadTable(page, pageSize, category),
          }}
          scroll={{ x: 1000 }}
        />
      </Card>
      <Modal
        title="HTML 邮件预览"
        open={htmlVisible}
        onCancel={() => setHtmlVisible(false)}
        footer={null}
        width="80%"
        destroyOnClose
      >
        <iframe
          title="html-content-preview"
          srcDoc={r.html_content || ''}
          style={{ width: '100%', height: '70vh', border: '1px solid #eee', borderRadius: 4 }}
          sandbox=""
        />
      </Modal>

      <Modal
        title="邮件详情"
        open={!!previewRow}
        onCancel={() => setPreviewRow(null)}
        footer={null}
        width="92vw"
        style={{ top: 20 }}
        destroyOnClose
      >
        <div style={{ display: 'flex', gap: 12, height: '78vh' }}>
          {/* 第一列：附件 */}
          <div style={{ width: 200, flexShrink: 0, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>附件</div>
            <div style={{ color: '#aaa', fontSize: 12 }}>暂无附件信息</div>
          </div>

          {/* 第二列：HTML 预览 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <iframe
              title="table-html-content-preview"
              srcDoc={previewRow?.html_content || ''}
              style={{ width: '100%', height: '100%', border: '1px solid #f0f0f0', borderRadius: 6 }}
              sandbox=""
            />
          </div>

          {/* 第三列：解析信息 */}
          <div style={{ width: 280, flexShrink: 0, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>解析信息</div>
            
          </div>
        </div>
      </Modal>
    </div>
  );
}
