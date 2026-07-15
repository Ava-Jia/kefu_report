import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  CaretDownOutlined,
  CaretUpOutlined,
  DownloadOutlined,
  EditOutlined,
  FileSearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Button, Col, DatePicker, Divider, Flex, Form, Input, Modal, Radio, Row, Select, Space, Spin,
  Table, Tag, Tooltip, Typography, Upload, message,
} from 'antd';
import dayjs from 'dayjs';
import {
  fetchEmailList,
  updateEmailCheck,
  updateEmail,
  uploadEmailEml,
  fetchEmailParseStatus,
} from '../api';

const { Text } = Typography;

// 悬浮提示统一延迟：比 antd 默认 0.1s 的呈现更跟手，浏览器原生 title 无法调速
const TIP_DELAY = 0.1;
const ROW_REMOVE_DELAY = 150;

const EXCHANGE_OF_PORT = 'EXCHANGE_OF_PORT';

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
  AGENT_REPLY: 'default',
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
  AGENT_REPLY: '代理回复',
  OTHER_AGENT_REQUEST: '代理回复',
};

const EXCHANGE_INTENT = {
  PRE_ALERT_NEW: '首次预报',
  PRE_ALERT_UPDATE: '补充/更新预报',
  PRE_ALERT_CANCEL: '预报作废',
  OTHER: '其他',
};

const getSecondaryIntentLabel = (intent) => EXCHANGE_INTENT[intent] ?? intent;

const EXCHANGE_INTENT_OPTIONS = Object.entries(EXCHANGE_INTENT).map(([value, label]) => ({
  value,
  label,
}));

const INTENT_SECONDARY_OPTIONS = {
  [EXCHANGE_OF_PORT]: EXCHANGE_INTENT_OPTIONS,
};

// 按已选的一级意图合并生成二级候选
const getSecondaryOptions = (items1) => {
  const seen = new Set();
  const opts = [];
  for (const p of items1) {
    for (const o of (INTENT_SECONDARY_OPTIONS[p] || [])) {
      if (!seen.has(o.value)) {
        seen.add(o.value);
        opts.push(o);
      }
    }
  }
  return opts;
};

const INTENT_OPTIONS = Object.keys(INTENT_COLOR).map((value) => ({
  label: INTENT_LABEL[value] ?? value,
  value,
}));

const splitValues = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
};

const parseIntentType2 = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);

  const trimmed = String(v).trim();
  let items = [];

  if (trimmed.startsWith('[')) {
    try {
      items = JSON.parse(trimmed.replace(/'/g, '"'));
    } catch {
      items = trimmed.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    }
  } else {
    items = splitValues(trimmed);
  }

  return items.filter((s) => s && s.trim());
};

const copyText = (text) => {
  if (!text) return;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => message.success('已复制'));
    return;
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  message.success('已复制');
};

// 空值统一占位：与 MBL 号一致的灰色短横
const EmptyDash = () => <span style={{ color: '#ccc' }}>-</span>;

// 可复制文本：点击复制并高亮 2 秒
const CopyableText = ({ text, copyValue, tooltip }) => {
  const [highlight, setHighlight] = useState(false);
  const timerRef = useRef();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleClick = () => {
    copyText(copyValue ?? text);
    setHighlight(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHighlight(false), 2000);
  };

  return (
    <Tooltip title={tooltip ?? text} mouseEnterDelay={TIP_DELAY}>
      <Text
        onClick={handleClick}
        ellipsis
        style={{
          maxWidth: '100%',
          cursor: 'pointer',
          padding: '0 2px',
          borderRadius: 4,
          transition: 'background 0.2s, color 0.2s',
          background: highlight ? '#e6f4ff' : 'transparent',
          color: highlight ? '#1677ff' : undefined,
        }}
      >
        {text}
      </Text>
    </Tooltip>
  );
};

// 单元格右侧的修改图标：默认隐藏，hover 单元格时显示（见 index.css .row-edit-icon）
const EditIcon = ({ onClick }) => (
  <EditOutlined
    className="row-edit-icon"
    style={{ cursor: 'pointer', color: '#1677FF', fontSize: 16, marginLeft: 'auto', flexShrink: 0 }}
    onClick={onClick}
  />
);

// 可复制 + 可修改的单元格（代理名称、角色等）；type='select' 时改用下拉
const EditableField = ({ row, field, title, value, onSaved, type = 'text', options }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const openModal = () => {
    setDraft(value || '');
    setOpen(true);
  };

  const handleSave = async () => {
    const nextValue = typeof draft === 'string' ? draft.trim() : draft;
    setSaving(true);
    try {
      const res = await updateEmail(row.id, { [field]: nextValue });
      if (res?.code === 200) {
        message.success('保存成功');
        onSaved?.(row.id, { [field]: nextValue });
        setOpen(false);
      } else {
        message.error(res?.message || '保存失败');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <span style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 4 }}>
      {value ? <CopyableText text={value} /> : <EmptyDash />}
      <EditIcon onClick={openModal} />
      <Modal
        title={`修改${title}`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        {type === 'select' ? (
          <Select
            value={draft || undefined}
            options={options}
            onChange={setDraft}
            style={{ width: '100%' }}
            placeholder={`请选择${title}`}
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={handleSave}
            placeholder={`请输入${title}`}
          />
        )}
      </Modal>
    </span>
  );
};

const IntentDetailModal = ({ open, onClose, items1, items2, emailId, onSaved }) => {
  const [draftItems1, setDraftItems1] = useState(items1);
  const [draftItems2, setDraftItems2] = useState(items2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraftItems1(items1);
      setDraftItems2(items2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    const fields = {
      intent_type1: draftItems1.join(','),
      intent_type2: JSON.stringify(draftItems2),
    };
    setSaving(true);
    try {
      const res = await updateEmail(emailId, fields);
      if (res?.code === 200) {
        message.success('保存成功');
        onSaved?.(fields);
        onClose?.();
      } else {
        message.error(res?.message || '保存失败');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const secondaryOptions = getSecondaryOptions(draftItems1);

  const toggleItem2 = (value, checked) => {
    setDraftItems2((prev) => checked ? [...prev, value] : prev.filter((v) => v !== value));
  };

  return (
    <Modal
      title="意图详情"
      open={open}
      onCancel={onClose}
      width={560}
      centered
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>取消</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>保存</Button>,
      ]}
    >
      <Form layout="vertical">
        <Row gutter={16} align="top">
          <Col span={12}>
            <Form.Item label="一级意图" style={{ marginBottom: 0 }}>
              <Select
                mode="multiple"
                value={draftItems1}
                onChange={setDraftItems1}
                options={INTENT_OPTIONS}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="二级意图" style={{ marginBottom: 0 }}>
              {secondaryOptions.length ? (
                <Space size={[8, 8]} wrap>
                  {secondaryOptions.map((o) => (
                    <Tag.CheckableTag
                      key={o.value}
                      checked={draftItems2.includes(o.value)}
                      onChange={(checked) => toggleItem2(o.value, checked)}
                      style={{ cursor: 'pointer', border: '1px solid #d9d9d9', padding: '2px 10px' }}
                    >
                      {o.label}
                    </Tag.CheckableTag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">请选择左侧一级意图</Text>
              )}
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

const MultiIntent = ({ value, intentType2, emailId, onSaved }) => {
  const [open, setOpen] = useState(false);
  const items = splitValues(value);
  const items2 = parseIntentType2(intentType2);
  if (!items.length) return <EmptyDash />;
  return (
    <>
      <span style={{ cursor: 'pointer' }} onClick={() => setOpen(true)}>
        <Tag color={INTENT_COLOR[items[0]] ?? 'blue'}>{INTENT_LABEL[items[0]] ?? items[0]}</Tag>
        {items.length > 1 && <Tag>+{items.length - 1}</Tag>}
      </span>
      <IntentDetailModal
        open={open}
        onClose={() => setOpen(false)}
        items1={items}
        items2={items2}
        emailId={emailId}
        onSaved={onSaved}
      />
    </>
  );
};

const SecondaryIntent = ({ value, intentType1, emailId, onSaved }) => {
  const [open, setOpen] = useState(false);
  const items2 = parseIntentType2(value);
  const items1 = splitValues(intentType1);
  if (!items2.length) return <EmptyDash />;
  return (
    <>
      <span style={{ cursor: 'pointer' }} onClick={() => setOpen(true)}>
        <Tag>{getSecondaryIntentLabel(items2[0])}</Tag>
        {items2.length > 1 && <Tag>+{items2.length - 1}</Tag>}
      </span>
      <IntentDetailModal
        open={open}
        onClose={() => setOpen(false)}
        items1={items1}
        items2={items2}
        emailId={emailId}
        onSaved={onSaved}
      />
    </>
  );
};

const PARSE_STATUS_MAP = {
  PENDING_TRACK: { label: '解析中', color: 'gold' },
  COMPLETED: { label: '完成', color: 'green' },
  FAILED: { label: '失败', color: 'red' },
};

// 0=待处理（尚未解析完成，展示为 -） 1=新建下单 2=新建失败 3=修改订单 4=作废
const IS_DONE_MAP = {
  1: { label: '新建下单', color: 'green' },
  2: { label: '新建失败', color: 'red' },
  3: { label: '修改订单', color: 'blue' },
  4: { label: '作废', color: 'default' },
};

const CHECK_OPTIONS = [
  { value: 0, label: '待处理', color: 'gold' },
  { value: 1, label: '已处理', color: 'green' },
  { value: 2, label: '待定',   color: 'warning' },
];

const CHECK_FILTER_OPTIONS = [
  { value: null, label: '全部' },
  { value: 0, label: '待处理' },
  { value: 1, label: '已处理' },
];

const CheckButton = ({ id, value, onChange }) => {
  const [loading, setLoading] = useState(false);
  const done = value === 1;

  const handleClick = async () => {
    const next = done ? 0 : 1;
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
    <div
      onClick={loading ? undefined : handleClick}
      title={done ? '已处理，点击撤销' : '点击标记完成'}
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        border: `2px solid ${done ? '#52c41a' : '#d9d9d9'}`,
        background: done ? '#52c41a' : 'transparent',
        cursor: loading ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.1s',
        opacity: loading ? 0.5 : 1,
      }}
    >
      {done && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
    </div>
  );
};

const PreviewButton = ({ row, listContext }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const handleClick = () => {
    navigate(`/email/${row.id}`, {
      state: {
        from: location.pathname + location.search,
        subject: row.subject,
        // 携带当前筛选后的列表，用于详情页在筛选结果内翻页（上一条/下一条）
        list: listContext,
      },
    });
  };
  return (
    <Button size="small" icon={<FileSearchOutlined />} onClick={handleClick}>
    </Button>
  );
};

// MBL 号：只读展示，多个时显示首个 + “+N” 标签，点击查看全部
const MblCell = ({ row, value, onSaved }) => {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const items = splitValues(value);

  const openEdit = () => {
    setDraft(items.join('\n'));
    setEditOpen(true);
  };

  const handleSave = async () => {
    const nextValue = draft.split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    setSaving(true);
    try {
      const res = await updateEmail(row.id, { mbl_number: nextValue });
      if (res?.code === 200) {
        message.success('保存成功');
        onSaved?.(row.id, { mbl_number: nextValue });
        setEditOpen(false);
      } else {
        message.error(res?.message || '保存失败');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <span style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 4 }}>
      {items.length ? (
        <span style={{ minWidth: 0, flexShrink: 1, display: 'flex' }}>
          <CopyableText text={items[0]} copyValue={items.join('\n')} tooltip={items.join('\n')} />
        </span>
      ) : (
        <EmptyDash />
      )}
      {items.length > 1 && (
        <Tag style={{ margin: 0, cursor: 'pointer', flexShrink: 0 }} onClick={() => setViewOpen(true)}>
          +{items.length - 1}
        </Tag>
      )}
      <EditIcon onClick={openEdit} />
      <Modal
        title={`全部 MBL（${items.length}）`}
        open={viewOpen}
        onCancel={() => setViewOpen(false)}
        footer={null}
        width={400}
      >
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {items.map((m) => <Text key={m} copyable>{m}</Text>)}
          </Space>
        </div>
      </Modal>
      <Modal
        title="修改 MBL 号"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <Input.TextArea
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="每行一个 MBL 号"
        />
      </Modal>
    </span>
  );
};

const ROLE_OPTIONS = [
  { label: '船公司', value: '船公司' },
  { label: '上层代理', value: '上层代理' },
  { label: '主单发货人', value: '主单发货人'},
  { label: '换单代理', value: '换单代理' },
  { label: '其他', value: '其他' },
  { label: '分单收货人', value: '分单收货人'},
];


const DateSortHeader = ({ order, onOrderChange }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    日期
    <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: '9px' }}>
      <Tooltip title="日期顺序（最早在前）" mouseEnterDelay={TIP_DELAY}>
        <CaretUpOutlined
          onClick={(e) => { e.stopPropagation(); onOrderChange('asc'); }}
          style={{ fontSize: 14, cursor: 'pointer', color: order === 'asc' ? '#1677ff' : '#bbb' }}
        />
      </Tooltip>
      <Tooltip title="日期倒序（最新在前）" mouseEnterDelay={TIP_DELAY}>
        <CaretDownOutlined
          onClick={(e) => { e.stopPropagation(); onOrderChange('desc'); }}
          style={{ fontSize: 14, cursor: 'pointer', color: order === 'desc' ? '#1677ff' : '#bbb' }}
        />
      </Tooltip>
    </span>
  </span>
);

const buildTableColumns = (onCheckChange, onIntentSaved, onFieldSaved, listContext, order, onOrderChange) => [
  {
    title: <DateSortHeader order={order} onOrderChange={onOrderChange} />,
    dataIndex: 'date',
    key: 'date',
    width: 150,
    fixed: 'left',
    ellipsis: true,
    render: (v) => {
      if (!v) return '-';
      return v.length > 16 ? v.slice(0, 16) : v;
    },
  },
  {
    title: '代理名称',
    dataIndex: 'broker_name',
    key: 'broker_name',
    width: 220,
    render: (v, record) => (
      <EditableField row={record} field="broker_name" title="代理名称" value={v || record['broker-name']} onSaved={onFieldSaved} />
    ),
  },
  {
    title: '发件人',
    dataIndex: 'from',
    key: 'from',
    width: 200,
    render: (v) => {
      if (!v) return <EmptyDash />;
      const m = v.match(/<([^>]+)>/);
      const text = m ? m[1] : v.trim();
      return <CopyableText text={text} />;
    },
  },
  {
    title: '角色',
    dataIndex: 'role',
    key: 'role',
    width: 100,
    render: (v, record) => (
      <EditableField
        row={record}
        field="role"
        title="角色"
        type="select"
        options={ROLE_OPTIONS}
        value={v}
        onSaved={onFieldSaved} />
      ),
  },
  {
    title: '邮件主题',
    dataIndex: 'subject',
    key: 'subject',
    width: 150,
    render: (v) => (
      <Tooltip title={v || ''} mouseEnterDelay={TIP_DELAY}>
        <div
          style={{
            maxHeight: 22,
            overflow: 'hidden',
            fontSize: 13,
            lineHeight: '22px',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            cursor: v ? 'pointer' : 'default',
          }}
          onClick={() => copyText(v)}
        >
          {v || <EmptyDash />}
        </div>
      </Tooltip>
    ),
  },
  {
    title: 'MBL 号',
    dataIndex: 'mbl_number',
    key: 'mbl_number',
    width: 230,
    render: (v, record) => <MblCell row={record} value={v} onSaved={onFieldSaved} />,
  },
  {
    title: 'Check',
    dataIndex: 'is_check',
    key: 'is_check',
    width: 70,
    render: (v, record) => (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CheckButton id={record.id} value={v ?? 0} onChange={(next) => onCheckChange(record.id, next)} />
      </div>
    ),
  },
  {
    title: '邮件摘要',
    dataIndex: 'email_summary',
    key: 'email_summary',
    width: 180,
    render: (v) => (
      <Tooltip title={v || ''} mouseEnterDelay={TIP_DELAY}>
        <div
          style={{
            maxHeight: 22,
            overflow: 'hidden',
            fontSize: 13,
            lineHeight: '22px',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {v || <EmptyDash />}
        </div>
      </Tooltip>
    ),
  },
  {
    
    title: '一级意图',
    dataIndex: 'intent_type1',
    key: 'intent_type1',
    width: 150,
    render: (v, record) => {
      const labels = splitValues(v).map((code) => INTENT_LABEL[code] ?? code);
      return (
        <Tooltip title={labels.length ? labels.join('、') : ''} mouseEnterDelay={TIP_DELAY}>
          <div style={{ overflow: 'hidden', maxHeight: 28 }}>
            <MultiIntent value={v} intentType2={record.intent_type2} emailId={record.id} onSaved={(fields) => onIntentSaved(record.id, fields)} />
          </div>
        </Tooltip>
      );
    },
  },
  {
    title: '二级意图',
    dataIndex: 'intent_type2',
    key: 'intent_type2',
    width: 140,
    render: (v, record) => {
      const items = parseIntentType2(v);
      const labels = items.map(getSecondaryIntentLabel);
      return (
        <Tooltip title={labels.length ? labels.join('、') : ''} mouseEnterDelay={TIP_DELAY}>
          <div style={{ overflow: 'hidden', maxHeight: 28 }}>
            <SecondaryIntent value={v} intentType1={record.intent_type1} emailId={record.id} onSaved={(fields) => onIntentSaved(record.id, fields)} />
          </div>
        </Tooltip>
      );
    },
  },
  {
    title: '下单状态',
    dataIndex: 'is_done',
    key: 'is_done',
    width: 90,
    ellipsis: true,
    render: (v, record) => {
      const intents = (record.intent_type1 || '').split(',');
      if (!intents.includes(EXCHANGE_OF_PORT)) return '-';
      if (record.status === null || record.status === undefined || record.status === '') return '-';
      if (v === null || v === undefined || v === '' || v === 0) return '-';
      const s = IS_DONE_MAP[v];
      return s ? <Tag color={s.color}>{s.label}</Tag> : v;
    },
  },
  {
    title: '解析状态',
    dataIndex: 'status',
    key: 'status',
    width: 80,
    render: (v) => {
      if (v === null || v === undefined || v === '') return '-';
      const s = PARSE_STATUS_MAP[v];
      return s ? <Tag color={s.color}>{s.label}</Tag> : v;
    },
  },
  {
    title: '操作',
    key: 'action',
    fixed: 'right',
    width: 100,
    render: (_, row) => (
      <Space size={8} split={<Divider type="vertical" style={{ margin: 0 }} />}>
        <PreviewButton row={row} listContext={listContext} />
        {row.email_url && (
          <Tooltip title="原始邮件链接" mouseEnterDelay={TIP_DELAY}>
            <a href={row.email_url} target="_blank" rel="noreferrer">
              <DownloadOutlined style={{ fontSize: 16, color: '#1677ff' }} />
            </a>
          </Tooltip>
        )}
      </Space>
    ),
  },
];

// 展示 .eml 异步解析返回的关键字段
const ParseResultView = ({ result }) => {
  const intents1 = splitValues(result.intent_type1);
  const intents2 = parseIntentType2(result.intent_type2);
  const rows = [
    ['邮件主题', result.subject],
    ['发件人', result.from],
    ['日期', result.date],
    ['代理名称', result.brokerName],
    ['MBL 号', result.mbl_number],
    ['邮件摘要', result.email_summary],
  ];
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>解析结果</div>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: '4px 8px', color: '#999', width: 84, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
              <td style={{ padding: '4px 8px', wordBreak: 'break-all' }}>{value || <span style={{ color: '#ccc' }}>-</span>}</td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: '4px 8px', color: '#999', verticalAlign: 'top' }}>意图</td>
            <td style={{ padding: '4px 8px' }}>
              {intents1.length || intents2.length ? (
                <Space size={[4, 4]} wrap>
                  {intents1.map((i) => <Tag key={i} color={INTENT_COLOR[i] ?? 'blue'}>{INTENT_LABEL[i] ?? i}</Tag>)}
                  {intents2.map((i) => <Tag key={i}>{getSecondaryIntentLabel(i)}</Tag>)}
                </Space>
              ) : <span style={{ color: '#ccc' }}>-</span>}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default function Email() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initPage = parseInt(searchParams.get('page') || '1', 10);
  const initPageSize = parseInt(searchParams.get('pageSize') || '50', 10);
  const initCategory = searchParams.get('category') || '';
  const initDateFrom = searchParams.get('date_from') || '';
  const initDateTo = searchParams.get('date_to') || '';
  const initIsCheck = searchParams.get('is_check') !== null && searchParams.get('is_check') !== ''
    ? parseInt(searchParams.get('is_check'), 10)
    : null;
  const initMblNumber = searchParams.get('mbl_number') || '';
  const initBrokerName = searchParams.get('broker_name') || '';
  const initOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

  const [tableData, setTableData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [total, setTotal] = useState(0);
  const [fadingIds, setFadingIds] = useState(new Set());
  const [batchBarMounted, setBatchBarMounted] = useState(false);

  useEffect(() => {
    if (selectedRowKeys.length > 0) {
      setBatchBarMounted(true);
    } else {
      const t = setTimeout(() => setBatchBarMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [selectedRowKeys.length]);

  const reloadPageAfterRowsRemoved = (removedCount) => {
    const remainingTotal = Math.max(total - removedCount, 0);
    if (remainingTotal <= 0) return;

    const maxPage = Math.ceil(remainingTotal / initPageSize);
    const targetPage = Math.min(initPage, maxPage);
    if (targetPage === initPage) {
      loadTable(initPage, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber, initBrokerName, initOrder);
    } else {
      pushParams(targetPage, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber, initBrokerName);
    }
  };

  const removeRowsOutsideCurrentCheckFilter = (ids, next) => {
    if (initIsCheck !== null && initIsCheck !== undefined && next !== initIsCheck) {
      const idSet = new Set(ids);
      setFadingIds((prev) => new Set([...prev, ...idSet]));
      setTimeout(() => {
        const nextRows = tableData.filter((row) => !idSet.has(row.id));
        const removedCount = tableData.length - nextRows.length;
        setTableData(nextRows);
        setFadingIds((prev) => {
          const s = new Set(prev);
          idSet.forEach((id) => s.delete(id));
          return s;
        });
        if (nextRows.length === 0 && removedCount > 0) {
          reloadPageAfterRowsRemoved(removedCount);
        }
      }, ROW_REMOVE_DELAY);
    }
  };

  const handleCheckChange = (id, next) => {
    setTableData((prev) => prev.map((row) => row.id === id ? { ...row, is_check: next } : row));
    removeRowsOutsideCurrentCheckFilter([id], next);
  };

  const [batchLoading, setBatchLoading] = useState(false);

  const handleBatchCheck = async (next) => {
    if (!selectedRowKeys.length) return;
    const ids = selectedRowKeys;
    setBatchLoading(true);
    try {
      await Promise.all(ids.map((id) => updateEmailCheck(id, next)));
      setTableData((prev) => prev.map((row) =>
        ids.includes(row.id) ? { ...row, is_check: next } : row
      ));
      removeRowsOutsideCurrentCheckFilter(ids, next);
      message.success(`已将 ${ids.length} 条更新为「${CHECK_OPTIONS.find(o => o.value === next)?.label}」`);
      setSelectedRowKeys([]);
    } catch {
      message.error('批量更新失败');
    } finally {
      setBatchLoading(false);
    }
  };

  // 意图/字段保存后就地更新该行数据
  const handleRowSaved = (id, fields) => {
    setTableData((prev) => prev.map((row) => row.id === id ? { ...row, ...fields } : row));
  };

  const pushParams = (page, pageSize, cat, dateFrom, dateTo, isCheck, mblNumber, brokerName = initBrokerName, order = initOrder) => {
    const p = {};
    if (page !== 1) p.page = page;
    if (pageSize !== 50) p.pageSize = pageSize;
    if (cat) p.category = cat;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (isCheck !== null && isCheck !== undefined) p.is_check = isCheck;
    if (mblNumber) p.mbl_number = mblNumber;
    if (brokerName) p.broker_name = brokerName;
    if (order === 'asc') p.order = 'asc';
    setSearchParams(p, { replace: false });
  };

  const loadTable = async (page, pageSize, cat, dateFrom, dateTo, isCheck, mblNumber, brokerName, order) => {
    setTableLoading(true);
    try {
      const res = await fetchEmailList({
        page,
        page_size: pageSize,
        intent_type1: cat,
        date_from: dateFrom,
        date_to: dateTo,
        is_check: isCheck,
        mbl_number: mblNumber,
        broker_name: brokerName,
        order,
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
    loadTable(initPage, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber, initBrokerName, initOrder);
  }, [searchParams.toString()]);

  const handleOrderChange = (value) => {
    pushParams(1, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber, initBrokerName, value);
  };

  // 当前筛选后的列表上下文，随预览一起带入详情页，用于结果内翻页 + 跨页续翻
  const listContext = {
    ids: tableData.map((r) => r.id),
    page: initPage,
    pageSize: initPageSize,
    total,
    filters: {
      intent_type1: initCategory,
      date_from: initDateFrom,
      date_to: initDateTo,
      is_check: initIsCheck,
      mbl_number: initMblNumber,
      broker_name: initBrokerName,
      order: initOrder,
    },
  };

  const tableColumns = buildTableColumns(handleCheckChange, handleRowSaved, handleRowSaved, listContext, initOrder, handleOrderChange);

  const handleCategoryChange = (value) => {
    pushParams(1, initPageSize, value || '', initDateFrom, initDateTo, initIsCheck, initMblNumber);
  };

  const handleIsCheckChange = (value) => {
    pushParams(1, initPageSize, initCategory, initDateFrom, initDateTo, value ?? null, initMblNumber);
  };

  const handleMblSearch = (value) => {
    pushParams(1, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, value.trim());
  };

  const handleBrokerSearch = (value) => {
    pushParams(1, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber, value.trim());
  };

  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  const handleCustomDateChange = (dates) => {
    if (!dates) {
      pushParams(1, initPageSize, initCategory, '', '', initIsCheck, initMblNumber);
    } else {
      pushParams(1, initPageSize, initCategory,
        dates[0] ? dates[0].format('YYYY-MM-DD') : '',
        dates[1] ? dates[1].format('YYYY-MM-DD') : '',
        initIsCheck, initMblNumber,
      );
    }
    setCustomPickerOpen(false);
  };

  const hasDateFilter = !!(initDateFrom || initDateTo);

  const handleQuickRange = (days) => {
    const to = dayjs().format('YYYY-MM-DD');
    const from = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD');
    pushParams(1, initPageSize, initCategory, from, to, initIsCheck, initMblNumber);
  };

  const activeQuickRange = (() => {
    if (initDateTo !== dayjs().format('YYYY-MM-DD')) return null;
    return [1, 7, 15].find(
      (d) => initDateFrom === dayjs().subtract(d - 1, 'day').format('YYYY-MM-DD'),
    ) ?? null;
  })();

  const handlePageChange = (page, pageSize) => {
    pushParams(page, pageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber);
  };

  // 上传解析：idle -> uploading -> polling -> done | failed
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadPhase, setUploadPhase] = useState('idle');
  const [parseResult, setParseResult] = useState(null);
  const [parseError, setParseError] = useState('');
  const [showRawResult, setShowRawResult] = useState(false);
  const [uploadBrokerName, setUploadBrokerName] = useState('');
  const pollTokenRef = useRef(0); // 自增令牌，切换文件/关弹窗时使旧轮询失效

  const POLL_INTERVAL = 10000;
  const POLL_MAX = 90; // 最多轮询约 3 分钟

  const terminalPhase = (status) => {
    const v = (status || '').toLowerCase();
    if (['completed', 'success', 'succeeded', 'done', 'finished'].includes(v)) return 'done';
    if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(v)) return 'failed';
    return null;
  };

  const pollStatus = async (taskId, token, attempt) => {
    if (pollTokenRef.current !== token) return;
    try {
      const res = await fetchEmailParseStatus(taskId);
      if (pollTokenRef.current !== token) return;
      if (res?.code === 200) {
        const data = res.data || {};
        const phase = terminalPhase(data.status);
        if (phase === 'done') {
          setParseResult(data.result || {});
          setUploadPhase('done');
          return;
        }
        if (phase === 'failed') {
          setParseError(data.error || '解析失败');
          setUploadPhase('failed');
          return;
        }
      }
    } catch {
      // 单次查询失败忽略，继续重试
    }
    if (attempt + 1 >= POLL_MAX) {
      if (pollTokenRef.current === token) {
        setParseError('解析超时，请稍后重试');
        setUploadPhase('failed');
      }
      return;
    }
    setTimeout(() => pollStatus(taskId, token, attempt + 1), POLL_INTERVAL);
  };

  const handleUploadEml = async (file) => {
    const token = ++pollTokenRef.current;
    setParseResult(null);
    setParseError('');
    setShowRawResult(false);
    setUploadPhase('uploading');
    try {
      const res = await uploadEmailEml(file, uploadBrokerName.trim());
      if (pollTokenRef.current !== token) return false;
      if (res?.code === 200 && res.data?.task_id) {
        setUploadPhase('polling');
        pollStatus(res.data.task_id, token, 0);
      } else {
        setParseError(res?.message || '上传失败');
        setUploadPhase('failed');
      }
    } catch (e) {
      if (pollTokenRef.current !== token) return false;
      setParseError(e.message || '上传失败');
      setUploadPhase('failed');
    }
    return false;
  };

  const closeUploadModal = () => {
    pollTokenRef.current += 1; // 让进行中的轮询失效
    setUploadModalOpen(false);
  };

  const openUploadModal = () => {
    pollTokenRef.current += 1;
    setUploadPhase('idle');
    setParseResult(null);
    setParseError('');
    setShowRawResult(false);
    setUploadModalOpen(true);
    setUploadBrokerName('');
  };

  const uploadBusy = uploadPhase === 'uploading' || uploadPhase === 'polling';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <Space wrap>
          <Input.Search
            size="middle"
            placeholder="搜索代理名称"
            defaultValue={initBrokerName}
            allowClear
            style={{ width: 170 }}
            onSearch={handleBrokerSearch}
          />
          <Select
            allowClear
            size="middle"
            value={initCategory || undefined}
            placeholder="全部类别"
            options={INTENT_OPTIONS}
            style={{ width: 170 }}
            onChange={(value) => handleCategoryChange(value || '')}
          />
          <Input.Search
            size="middle"
            placeholder="搜索 MBL 号"
            defaultValue={initMblNumber}
            allowClear
            style={{ width: 170 }}
            onSearch={handleMblSearch}
          />
          <DatePicker.RangePicker
            open={customPickerOpen}
            onOpenChange={setCustomPickerOpen}
            value={hasDateFilter ? [dayjs(initDateFrom), dayjs(initDateTo)] : null}
            onChange={handleCustomDateChange}
            allowClear
            disabledDate={(d) => d && d > dayjs().endOf('day')}
            style={{ width: 0, padding: 0, border: 'none', overflow: 'hidden', position: 'absolute' }}
          />

          <Flex gap="small" wrap>
            <Button
              size="middle"
              type={!hasDateFilter ? 'primary' : 'default'}
              onClick={() => handleCustomDateChange(null)}
            >
              全部
            </Button>
            {[1, 7].map((days) => (
              <Button
                key={days}
                size="middle"
                type={activeQuickRange === days ? 'primary' : 'default'}
                onClick={() => handleQuickRange(days)}
              >
                近 {days} 天
              </Button>
            ))}
          </Flex>

          <Button size="middle" onClick={openUploadModal}>
            上传解析
          </Button>
        </Space>
        <div
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            border: '1px solid #d9d9d9',
            borderRadius: 8,
          }}
        >
          <Radio.Group
            style={{ marginLeft: 'auto' }}
            value={initIsCheck}
            onChange={(e) => handleIsCheckChange(e.target.value)}
            options={CHECK_FILTER_OPTIONS}
          />
        </div>
      </div>
      <Modal
        title="上传 .eml 解析"
        open={uploadModalOpen}
        onCancel={closeUploadModal}
        footer={null}
        width={560}
      >
        <Input
          value={uploadBrokerName}
          onChange={(e) => setUploadBrokerName(e.target.value)}
          placeholder="请输入代理名称"
          style={{ marginBottom: 12 }}
          disabled={uploadBusy}
        />
        <Upload.Dragger
          accept=".eml"
          showUploadList={false}
          disabled={uploadBusy}
          beforeUpload={handleUploadEml}
        >
          <p style={{ fontSize: 32, color: '#1677ff', margin: '8px 0' }}><UploadOutlined /></p>
          <p style={{ margin: 0 }}>
            {uploadPhase === 'uploading' ? '上传中...'
              : uploadPhase === 'polling' ? '解析中...'
              : '点击或拖拽 .eml 文件到此区域上传'}
          </p>
        </Upload.Dragger>

        {uploadBusy && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Spin />
            <span style={{ marginLeft: 8, color: '#999' }}>
              {uploadPhase === 'uploading' ? '正在上传文件…' : '正在解析邮件，请稍候…'}
            </span>
          </div>
        )}

        {uploadPhase === 'failed' && (
          <div style={{ marginTop: 16, color: '#cf1322' }}>
            {parseError || '解析失败'}
          </div>
        )}

        {uploadPhase === 'done' && parseResult && (
          <div style={{ marginTop: 16 }}>
            <ParseResultView result={parseResult} />
            <div style={{ marginTop: 12 }}>
              <Button size="small" onClick={() => setShowRawResult((v) => !v)}>
                {showRawResult ? '隐藏原始数据' : '查看原始数据'}
              </Button>
              <Button
                size="small"
                style={{ marginLeft: 8 }}
                onClick={() => copyText(JSON.stringify(parseResult, null, 2))}
              >
                复制完整结果
              </Button>
            </div>
            {showRawResult && (
              <pre
                style={{
                  marginTop: 8, maxHeight: 260, overflow: 'auto',
                  background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12,
                }}
              >{JSON.stringify(parseResult, null, 2)}</pre>
            )}
          </div>
        )}
      </Modal>
      {batchBarMounted && (
        <Space
          style={{
            marginBottom: 8,
            opacity: selectedRowKeys.length > 0 ? 1 : 0,
            transform: selectedRowKeys.length > 0 ? 'translateY(0)' : 'translateY(-6px)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          <span style={{ fontSize: 15, color: 'rgba(0,0,0,0.85)', fontWeight: 500 }}>
            已选 {selectedRowKeys.length} 条，批量标记为：
          </span>
          {CHECK_OPTIONS.map((o) => (
            <Button
              key={o.value}
              type="text"
              size="small"
              loading={batchLoading}
              style={{ padding: '0 4px' }}
              onClick={() => handleBatchCheck(o.value)}
            >
              <Tag color={o.color} style={{ margin: 0 }}>{o.label}</Tag>
            </Button>
          ))}
          <Button
            type="text"
            size="small"
            style={{ padding: '0 4px' }}
            onClick={() => setSelectedRowKeys([])}
          >
            取消选择
          </Button>
        </Space>
      )}
      <Table
        rowKey="id"
        columns={tableColumns}
        dataSource={tableData}
        loading={tableLoading}
        size="small"
        bordered
        className="email-table"
        rowClassName={(row) => fadingIds.has(row.id) ? 'row-fading' : ''}
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        pagination={{
          current: initPage,
          size: 'large',
          pageSize: 50,
          total,
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 条`,
          onChange: handlePageChange,
          position: ['bottomCenter'],
        }}
        tableLayout="fixed"
        scroll={{
          x: 1660,
          y: 'calc(100vh - 220px)',
        }}
        sticky
      />
    </div>
  );
}
