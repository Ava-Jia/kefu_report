import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button, Card, DatePicker, Dropdown, Modal, Popover, Select, Space,
  Table, Tag, Typography, message,
} from 'antd';
import { EyeOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchEmailList, updateEmailCheck } from '../api';

const { Text } = Typography;

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
  CANCEL_IT: 'CANCEL_IT',
  REEXPORT_RETURN: '退运',
  RELEASE: '放行',
  ARRIVAL_PICKUP_LFD: '到港/提货/LFD',
  CUSTOMS_EXAM_CLEARANCE: '海关查验/清关',
  TRANSPORT_STATUS: '铁路运输',
  EMPTY_RETURN_EQUIPMENT: '空箱归还',
  PAYMENT_FINANCE: '费用相关',
  DOCUMENT_BL: '提单业务',
  SHIPPING_COMPANY_REPLY: '船公司回复',
  EXCHANGE_OF_PORT: '预报/换单',
  OTHER: '其他',
};

const EXCHANGE_OF_PORT = 'EXCHANGE_OF_PORT';

const INTENT_OPTIONS = Object.keys(INTENT_COLOR).map((value) => ({
  label: INTENT_LABEL[value] ?? value,
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
  if (items.length === 1) return <Tag color={INTENT_COLOR[items[0]] ?? 'blue'}>{INTENT_LABEL[items[0]] ?? items[0]}</Tag>;
  return (
    <Popover
      trigger="click"
      content={
        <Space wrap size={4}>
          {items.map((v) => <Tag key={v} color={INTENT_COLOR[v] ?? 'blue'}>{INTENT_LABEL[v] ?? v}</Tag>)}
        </Space>
      }
    >
      <span style={{ cursor: 'pointer' }}>
        <Tag color={INTENT_COLOR[items[0]] ?? 'blue'}>{INTENT_LABEL[items[0]] ?? items[0]}</Tag>
        <Tag>+{items.length - 1}</Tag>
      </span>
    </Popover>
  );
};

const CHECK_OPTIONS = [
  { value: 0, label: '未处理', color: 'default' },
  { value: 1, label: '已处理', color: 'success' },
  { value: 2, label: '待定',   color: 'warning' },
];

const CheckButton = ({ id, value, onChange }) => {
  const [loading, setLoading] = useState(false);
  const current = CHECK_OPTIONS.find((o) => o.value === value) ?? CHECK_OPTIONS[0];

  const handleSelect = async ({ key }) => {
    const next = Number(key);
    if (next === value) return;
    setLoading(true);
    try {
      const res = await updateEmailCheck(id, next);
      if (res?.code === 200) onChange(next);
      else message.error(res?.message || '更新失败');
    } catch {
      message.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dropdown
      menu={{
        items: CHECK_OPTIONS.map((o) => ({ key: o.value, label: <Tag color={o.color}>{o.label}</Tag> })),
        onClick: handleSelect,
      }}
      trigger={['click']}
    >
      <Button size="small" loading={loading} style={{ minWidth: 64 }}>
        <Tag color={current.color} style={{ margin: 0 }}>{current.label}</Tag>
      </Button>
    </Dropdown>
  );
};

const PreviewButton = ({ row }) => {
  const navigate = useNavigate();
  const handleClick = () => {
    const qs = row.ordering_id ? `?ordering_id=${encodeURIComponent(row.ordering_id)}` : '';
    navigate(`/email/${row.id}${qs}`);
  };
  return (
    <Button size="small" icon={<EyeOutlined />} onClick={handleClick}>
      预览
    </Button>
  );
};

const buildTableColumns = (onCheckChange) => [
  {
    title: '日期',
    dataIndex: 'date',
    key: 'date',
    width: 120,
    render: (v) => v ? v : '-',
  },
  {
    title: '发件人',
    dataIndex: 'from',
    key: 'from',
    width: 220,
    ellipsis: true,
    render: (v) => {
      if (!v) return '-';
      const m = v.match(/<([^>]+)>/);
      return m ? m[1] : v.trim();
    },
  },
  {
    title: '邮件主题',
    dataIndex: 'subject',
    key: 'subject',
    width: 180,
    render: (v) => (
      <div
        style={{
          width: 180,
          maxHeight: 22,
          overflow: 'hidden',
          fontSize: 13,
          lineHeight: '22px',
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
        }}
        title={v || '-'}
      >
        {v || '-'}
      </div>
    ),
  },
  {
    title: 'MBL 号',
    dataIndex: 'mbl_number',
    key: 'mbl_number',
    width: 160,
    render: (v) => <MultiMbl value={v} />,
  },
  {
    title: 'Check',
    dataIndex: 'is_check',
    key: 'is_check',
    width: 100,
    render: (v, record) => (
      <CheckButton id={record.id} value={v ?? 0} onChange={(next) => onCheckChange(record.id, next)} />
    ),
  },
  {
    title: '邮件摘要',
    dataIndex: 'email_summary',
    key: 'email_summary',
    width: 180,
    render: (v) => (
      <div
        style={{
          width: 180,
          maxHeight: 22,
          overflow: 'hidden',
          fontSize: 13,
          lineHeight: '22px',
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
        }}
        title={v || '-'}
      >
        {v || '-'}
      </div>
    ),
  },
  {
    title: '一级意图',
    dataIndex: 'intent_type1',
    key: 'intent_type1',
    width: 120,
    render: (v) => <MultiIntent value={v} />,
  },
  {
    title: '是否下单',
    dataIndex: 'is_done',
    key: 'is_done',
    width: 100,
    render: (v, record) => {
      if (record.intent_type1 !== EXCHANGE_OF_PORT) return '-';
      if (v === null || v === undefined || v === '') return '-';
      return String(v) === '1' ? '已下单' : '未下单';
    },
  },
  {
    title: '操作',
    key: 'action',
    width: 80,
    render: (_, row) => <PreviewButton row={row} />,
  },
];

export default function Email() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initPage = parseInt(searchParams.get('page') || '1', 10);
  const initPageSize = parseInt(searchParams.get('pageSize') || '50', 10);
  const initCategory = searchParams.get('category') || '';
  const initDateFrom = searchParams.get('date_from') || '';
  const initDateTo = searchParams.get('date_to') || '';

  const [tableData, setTableData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const category = initCategory;
  const dateRange = [
    initDateFrom ? dayjs(initDateFrom) : null,
    initDateTo ? dayjs(initDateTo) : null,
  ];

  const handleCheckChange = (id, next) => {
    setTableData((prev) => prev.map((row) => row.id === id ? { ...row, is_check: next } : row));
  };

  const tableColumns = buildTableColumns(handleCheckChange);

  const pushParams = (page, pageSize, cat, dateFrom, dateTo) => {
    const p = {};
    if (page !== 1) p.page = page;
    if (pageSize !== 50) p.pageSize = pageSize;
    if (cat) p.category = cat;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    setSearchParams(p, { replace: false });
  };

  const loadTable = async (page, pageSize, cat, dateFrom, dateTo) => {
    setTableLoading(true);
    try {
      const res = await fetchEmailList({
        page,
        page_size: pageSize,
        intent_type1: cat,
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (res?.code === 200) {
        setTableData(res.data.items);
        setTotal(res.data.total);
      } else {
        message.error(res?.message || '加载失败');
      }
    } catch (e) {
      message.error(e.message || '加载失败');
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    loadTable(initPage, initPageSize, initCategory, initDateFrom, initDateTo);
  }, [searchParams.toString()]);

  const handleCategoryChange = (value) => {
    pushParams(1, initPageSize, value || '', initDateFrom, initDateTo);
  };

  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  const handleQuickDate = (days) => {
    const to = dayjs().format('YYYY-MM-DD');
    const from = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD');
    pushParams(1, initPageSize, initCategory, from, to);
  };

  const handleTodayOrder = () => {
    const today = dayjs().format('YYYY-MM-DD');
    pushParams(1, initPageSize, EXCHANGE_OF_PORT, today, today);
  };

  const isTodayOrderActive =
    initCategory === EXCHANGE_OF_PORT &&
    initDateFrom === dayjs().format('YYYY-MM-DD') &&
    initDateTo === dayjs().format('YYYY-MM-DD');

  const handleCustomDateChange = (dates) => {
    if (!dates) {
      pushParams(1, initPageSize, initCategory, '', '');
    } else {
      pushParams(1, initPageSize, initCategory,
        dates[0] ? dates[0].format('YYYY-MM-DD') : '',
        dates[1] ? dates[1].format('YYYY-MM-DD') : '',
      );
    }
    setCustomPickerOpen(false);
  };

  const hasDateFilter = !!(initDateFrom || initDateTo);

  const handlePageChange = (page, pageSize) => {
    pushParams(page, pageSize, initCategory, initDateFrom, initDateTo);
  };

  return (
    <div style={{ padding: '0 4px' }}>
      <h2 style={{ marginBottom: 16 }}>Email 管理</h2>

      <Card
        size="small"
        title={`邮件列表（共 ${total} 条）`}
        extra={
          <Button icon={<SyncOutlined />} size="small" onClick={() => loadTable(initPage, initPageSize, initCategory, initDateFrom, initDateTo)}>
            刷新
          </Button>
        }
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            allowClear
            value={initCategory || undefined}
            placeholder="全部类别"
            options={INTENT_OPTIONS}
            style={{ width: 180 }}
            onChange={(value) => handleCategoryChange(value || '')}
          />
          <Button onClick={() => handleQuickDate(3)}>近3天</Button>
          <Button
            onClick={handleTodayOrder}
            style={isTodayOrderActive ? { background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' } : {}}
          >今日预报/换单</Button>
          <DatePicker.RangePicker
            open={customPickerOpen}
            onOpenChange={setCustomPickerOpen}
            value={hasDateFilter ? [dayjs(initDateFrom), dayjs(initDateTo)] : null}
            onChange={handleCustomDateChange}
            allowClear
            disabledDate={(d) => d && d > dayjs().endOf('day')}
            style={{ width: 0, padding: 0, border: 'none', overflow: 'hidden', position: 'absolute' }}
          />
          <Button type={hasDateFilter ? 'primary' : 'default'} onClick={() => setCustomPickerOpen(true)}>
            {hasDateFilter ? `${initDateFrom} ~ ${initDateTo}` : '自定义日期'}
          </Button>
          {hasDateFilter && (
            <Button onClick={() => pushParams(1, initPageSize, initCategory, '', '')}>清除</Button>
          )}
        </Space>
        <Table
          rowKey="id"
          columns={tableColumns}
          dataSource={tableData}
          loading={tableLoading}
          size="small"
          pagination={{
            current: initPage,
            pageSize: initPageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '50', '100'],
            showTotal: (t) => `共 ${t} 条`,
            onChange: handlePageChange,
          }}
          scroll={{ x: 1000 }}
        />
      </Card>
    </div>
  );
}
