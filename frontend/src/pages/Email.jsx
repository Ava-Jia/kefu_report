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
  fetchUploadResult,
  fetchBrokerNames,
} from '../api';
import {
  EXCHANGE_OF_PORT,
  EXCHANGE_INTENT,
  INTENT_COLOR,
  INTENT_LABEL,
  IS_DONE_MAP,
  PARSE_STATUS_MAP,
  getSecondaryIntentLabel,
  parseIntentType2,
  splitValues,
} from '../constants/intent';

const { Text } = Typography;

// 悬浮提示统一延迟：比 antd 默认 0.1s 的呈现更跟手，浏览器原生 title 无法调速
const TIP_DELAY = 0.1;
const ROW_REMOVE_DELAY = 150;

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

// 上传解析历史任务：仅存 taskId 及元信息在本地，结果按需用状态接口回查
const PARSE_TASKS_KEY = 'emailParseTasks';
const PARSE_TASKS_MAX = 200;

const PARSE_TASK_STATUS = {
  polling: { label: '解析中', color: 'gold' },
  done: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
  timeout: { label: '超时', color: 'orange' },
};

// 旧缓存整条 result 都存了下来，容易撑爆 localStorage：读取时抽出 ID 后丢弃
const stripParseTask = ({ result, ...task }) => ({
  ...task,
  emailId: task.emailId || result?.email_id || result?.email_detail?.id,
  orderId: task.orderId || result?.order_id,
});

const loadParseTasks = () => {
  try {
    const raw = localStorage.getItem(PARSE_TASKS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(stripParseTask) : [];
  } catch {
    return [];
  }
};

const saveParseTasks = (list) => {
  try {
    localStorage.setItem(PARSE_TASKS_KEY, JSON.stringify(list.slice(0, PARSE_TASKS_MAX)));
  } catch {
    // 存储不可用时忽略，不影响主流程
  }
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

// key-value 表格：解析详情统一用它渲染
const DetailTable = ({ rows }) => (
  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
    <tbody>
      {rows.map(([label, value]) => (
        <tr key={label}>
          <td style={{ padding: '4px 8px', color: '#999', width: 84, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
          <td style={{ padding: '4px 8px', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
            {value != null && value !== '' ? value : <EmptyDash />}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

// 展示 .eml 异步解析返回的邮件关键字段
const ParseResultView = ({ result, title = '邮件解析结果' }) => {
  const intents1 = splitValues(result.intent_type1);
  const intents2 = parseIntentType2(result.intent_type2);
  const intentCell = (intents1.length || intents2.length) ? (
    <Space size={[4, 4]} wrap>
      {intents1.map((i) => <Tag key={i} color={INTENT_COLOR[i] ?? 'blue'}>{INTENT_LABEL[i] ?? i}</Tag>)}
      {intents2.map((i) => <Tag key={i}>{getSecondaryIntentLabel(i)}</Tag>)}
    </Space>
  ) : null;
  const rows = [
    ['邮件主题', result.subject],
    ['发件人', result.from],
    ['日期', result.date],
    ['代理名称', result.brokerName || result.broker_name],
    ['MBL 号', result.mbl_number],
    ['意图', intentCell],
    ['邮件摘要', result.email_summary],
  ];
  return (
    <div>
      {title && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>}
      <DetailTable rows={rows} />
    </div>
  );
};

// 展示订单解析结果（order_detail.result 里的每一份提单）
const OrderResultView = ({ orders }) => {
  if (!orders?.length) {
    return <div style={{ color: '#999', fontSize: 13 }}>无订单解析结果</div>;
  }
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        订单解析结果（{orders.length} 条）
      </div>
      {orders.map((o, idx) => {
        const expense = o.expenseItem
          ? [o.expenseItem.expenseName, o.expenseItem.expenseAmount].filter(Boolean).join(' ')
          : '';
        const rows = [
          ['MBL 号', o.masterBillNo],
          ['HBL 号', o.houseBillNo],
          ['箱型/箱号', [o.containerType, o.ctrNumber].filter(Boolean).join(' / ')],
          ['单据类型', o.orderType],
          ['客户类型', o.customerType],
          ['发货人', o.shipperName],
          ['发货人地址', o.shipperAddress],
          ['收货人', o.consigneeName],
          ['收货人地址', o.consigneeAddress],
          ['通知人', o.notifyName],
          ['通知人地址', o.notifyAddress],
          ['货物描述', o.descriptionOfGoods],
          ['唛头', o.mark],
          ['件数', [o.pieces, o.packageUnit].filter(Boolean).join(' ')],
          ['毛重', o.grossWeight],
          ['体积', o.volume],
          ['费用', expense],
          ['HBL 文件', o.hblUrl ? <a href={o.hblUrl} target="_blank" rel="noreferrer">查看 PDF</a> : ''],
        ];
        return (
          <div key={idx} style={{ marginBottom: 12, border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1677ff', marginBottom: 4 }}>订单 {idx + 1}</div>
            <DetailTable rows={rows} />
          </div>
        );
      })}
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
  const [brokerOptions, setBrokerOptions] = useState([]);

  useEffect(() => {
    fetchBrokerNames().then((res) => {
      const names = res?.data || [];
      setBrokerOptions(names.map((name) => ({ label: name, value: name })));
    });
  }, []);

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
  const [parseTasks, setParseTasks] = useState(loadParseTasks); // 历史任务（含 taskId）
  // 每个 taskId 一条独立轮询：taskId -> 代次号。多个任务可同时在跑，
  // 关弹窗/切换查看都不会打断它们，只有组件卸载或删除任务才停。
  const pollingRef = useRef(new Map());
  // 弹窗当前展示的是哪个任务的结果，只有它的轮询结果会写进 UI
  const viewTaskIdRef = useRef(null);
  // 上传请求的先后序号，防止先发后到的上传抢占视图
  const uploadSeqRef = useRef(0);

  useEffect(() => () => pollingRef.current.clear(), []);

  // 新增/更新某个 taskId 的历史记录并持久化
  const upsertParseTask = (taskId, patch) => {
    setParseTasks((prev) => {
      const idx = prev.findIndex((t) => t.taskId === taskId);
      const next = idx >= 0
        ? prev.map((t, i) => (i === idx ? { ...t, ...patch } : t))
        : [{ taskId, ...patch }, ...prev];
      saveParseTasks(next);
      return next;
    });
  };

  const removeParseTask = (taskId) => {
    pollingRef.current.delete(taskId); // 删掉的任务不再轮询
    if (viewTaskIdRef.current === taskId) viewTaskIdRef.current = null;
    setParseTasks((prev) => {
      const next = prev.filter((t) => t.taskId !== taskId);
      saveParseTasks(next);
      return next;
    });
  };

  const POLL_INTERVAL = 10000;
  const POLL_MAX = 90; // 10s × 90，最多轮询约 15 分钟
  const RESUME_MAX_AGE = 30 * 60 * 1000; // 超过这个时长的「解析中」任务不再自动续查

  const isPollAlive = (taskId, gen) => pollingRef.current.get(taskId) === gen;

  // 查到 email_detail 即视为解析完成；查不到（后端返回非 200）则继续轮询。
  // 无论弹窗当前看的是哪个任务，历史记录都会被更新；UI 只在看着本任务时才动。
  const pollStatus = async (taskId, gen, attempt) => {
    if (!isPollAlive(taskId, gen)) return;
    try {
      const res = await fetchEmailParseStatus(taskId);
      if (!isPollAlive(taskId, gen)) return;
      if (res?.code === 200 && res.data?.email_detail) {
        pollingRef.current.delete(taskId);
        // 只留 ID 和元信息，完整结果需要时用状态接口回查
        upsertParseTask(taskId, {
          status: 'done',
          emailId: res.data.email_id,
          orderId: res.data.order_id,
        });
        if (viewTaskIdRef.current === taskId) {
          setParseResult(res.data);
          setUploadPhase('done');
        }
        return;
      }
    } catch {
      // 单次查询失败忽略，继续重试
    }
    if (!isPollAlive(taskId, gen)) return;
    if (attempt + 1 >= POLL_MAX) {
      pollingRef.current.delete(taskId);
      upsertParseTask(taskId, { status: 'timeout', error: '解析超时' });
      if (viewTaskIdRef.current === taskId) {
        setParseError('解析超时，请稍后重试');
        setUploadPhase('failed');
      }
      return;
    }
    setTimeout(() => pollStatus(taskId, gen, attempt + 1), POLL_INTERVAL);
  };

  // 已在轮询的任务不重复启动，避免同一 taskId 叠加多条定时器链
  const startPolling = (taskId) => {
    if (pollingRef.current.has(taskId)) return;
    const gen = Date.now();
    pollingRef.current.set(taskId, gen);
    pollStatus(taskId, gen, 0);
  };

  const handleUploadEml = async (file) => {
    const seq = ++uploadSeqRef.current;
    const brokerName = uploadBrokerName.trim();
    setParseResult(null);
    setParseError('');
    setShowRawResult(false);
    setUploadPhase('uploading');
    viewTaskIdRef.current = null;
    try {
      const res = await uploadEmailEml(file, brokerName);
      if (res?.code === 200 && res.data?.task_id) {
        const taskId = res.data.task_id;
        upsertParseTask(taskId, {
          fileName: file.name,
          brokerName,
          createdAt: Date.now(),
          status: 'polling',
        });
        startPolling(taskId);
        // 期间又传了新文件时，视图归最后一次上传，本次只在后台跑
        if (uploadSeqRef.current === seq) {
          viewTaskIdRef.current = taskId;
          setUploadPhase('polling');
        }
      } else if (uploadSeqRef.current === seq) {
        setParseError(res?.message || '上传失败');
        setUploadPhase('failed');
      }
    } catch (e) {
      if (uploadSeqRef.current === seq) {
        setParseError(e.message || '上传失败');
        setUploadPhase('failed');
      }
    }
    return false;
  };

  // 关弹窗不打断轮询，任务继续在后台跑完并回写历史记录
  const closeUploadModal = () => {
    viewTaskIdRef.current = null;
    setUploadModalOpen(false);
  };

  const openUploadModal = () => {
    viewTaskIdRef.current = null;
    setUploadPhase('idle');
    setParseResult(null);
    setParseError('');
    setShowRawResult(false);
    setUploadModalOpen(true);
    setUploadBrokerName('');
    // 刷新页面会中断轮询，这里把仍在解析中的近期任务接着跑起来
    const resumeSince = Date.now() - RESUME_MAX_AGE;
    parseTasks
      .filter((t) => t.status === 'polling' && (t.createdAt ?? 0) > resumeSince)
      .forEach((t) => startPolling(t.taskId));
  };

  // 查看历史任务：已解析出 email_id 的直接按 ID 取结果，
  // 还没解析完的（无 ID）才回到 task_id 轮询。
  const handleViewParseTask = async (task) => {
    const seq = ++uploadSeqRef.current;
    const isCurrentView = () => uploadSeqRef.current === seq;
    setUploadBrokerName(task.brokerName || '');
    setParseError('');
    setShowRawResult(false);
    setParseResult(null);
    setUploadPhase('polling');
    viewTaskIdRef.current = task.taskId;

    if (!task.emailId) {
      startPolling(task.taskId);
      return;
    }

    try {
      const res = await fetchUploadResult(task.emailId, task.orderId);
      if (!isCurrentView()) return;
      if (res?.code === 200 && res.data?.email_detail) {
        setParseResult(res.data);
        setUploadPhase('done');
      } else {
        setParseError(res?.message || '查询任务失败');
        setUploadPhase('failed');
      }
    } catch {
      if (!isCurrentView()) return;
      setParseError('查询任务失败');
      setUploadPhase('failed');
    }
  };

  // 上传请求本身是串行的，但解析中允许继续传下一个文件
  const uploadBusy = uploadPhase === 'uploading';

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
          <Select
            showSearch
            allowClear
            size="middle"
            placeholder="搜索代理名称"
            value={initBrokerName || undefined}
            options={brokerOptions}
            style={{ width: 170 }}
            optionFilterProp="label"
            onChange={(value) => handleBrokerSearch(value || '')}
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
        width={uploadPhase === 'done' ? 940 : 560}
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
            {uploadPhase === 'uploading' ? '上传中...' : '点击或拖拽 .eml 文件到此区域上传'}
          </p>
        </Upload.Dragger>

        {(uploadPhase === 'uploading' || uploadPhase === 'polling') && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Spin />
            <span style={{ marginLeft: 8, color: '#999' }}>
              {uploadPhase === 'uploading' ? '正在上传文件…' : '正在解析邮件，可继续上传其他文件…'}
            </span>
          </div>
        )}

        {uploadPhase === 'failed' && (
          <div style={{ marginTop: 16, color: '#cf1322' }}>
            {parseError || '解析失败'}
          </div>
        )}

        {uploadPhase === 'done' && parseResult?.email_detail && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, maxHeight: 460, overflow: 'auto' }}>
                <ParseResultView result={parseResult.email_detail} />
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: '#f0f0f0' }} />
              <div style={{ flex: 1, minWidth: 0, maxHeight: 460, overflow: 'auto' }}>
                <OrderResultView orders={parseResult.order_detail} />
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <Button
                type="link"
                size="small"
                style={{ paddingLeft: 0 }}
                onClick={() => copyText(JSON.stringify(parseResult, null, 2))}
              >
                复制完整结果
              </Button>
            </div>
          </div>
        )}

        {parseTasks.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>历史任务</span>
              <Button
                type="link"
                size="small"
                style={{ marginLeft: 'auto' }}
                disabled={uploadBusy}
                onClick={() => {
                  pollingRef.current.clear();
                  viewTaskIdRef.current = null;
                  setParseTasks([]);
                  saveParseTasks([]);
                }}
              >
                清空
              </Button>
            </div>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              {parseTasks.map((task) => {
                const meta = PARSE_TASK_STATUS[task.status] || { label: task.status, color: 'default' };
                const { emailId, orderId } = task;
                return (
                  <div
                    key={task.taskId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 6, border: '1px solid #f0f0f0', marginBottom: 6,
                    }}
                  >
                    <Tag color={meta.color} style={{ margin: 0, flexShrink: 0 }}>{meta.label}</Tag>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {task.fileName || task.taskId}
                      </div>
                      <div style={{ fontSize: 11, color: '#999' }}>
                        {task.brokerName ? `${task.brokerName} · ` : ''}
                        {task.createdAt ? dayjs(task.createdAt).format('MM-DD HH:mm') : ''}
                      </div>
                      {/* 解析出的 ID 直接展示，无需点「查看」 */}
                      {(emailId || orderId) && (
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#666', marginTop: 2 }}>
                          {emailId && (
                            <span style={{ display: 'inline-flex', minWidth: 0 }}>
                              email:&nbsp;<CopyableText text={emailId} />
                            </span>
                          )}
                          {orderId && (
                            <span style={{ display: 'inline-flex', minWidth: 0 }}>
                              order:&nbsp;<CopyableText text={orderId} />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <Button size="small" type="link" disabled={uploadBusy} onClick={() => handleViewParseTask(task)}>
                      查看
                    </Button>
                    <Button size="small" type="link" onClick={() => copyText(task.taskId)}>
                      复制 ID
                    </Button>
                    <Button size="small" type="link" danger disabled={uploadBusy} onClick={() => removeParseTask(task.taskId)}>
                      删除
                    </Button>
                  </div>
                );
              })}
            </div>
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
