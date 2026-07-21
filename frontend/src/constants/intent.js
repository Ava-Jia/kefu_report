// Intent / order-status constants shared by the email list and the email detail page.

export const EXCHANGE_OF_PORT = 'EXCHANGE_OF_PORT';

export const INTENT_COLOR = {
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

export const INTENT_LABEL = {
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

export const EXCHANGE_INTENT = {
  PRE_ALERT_NEW: '首次预报',
  PRE_ALERT_UPDATE: '补充/更新预报',
  PRE_ALERT_CANCEL: '预报作废',
  OTHER: '其他',
};

export const getSecondaryIntentLabel = (intent) => EXCHANGE_INTENT[intent] ?? intent;

export const PARSE_STATUS_MAP = {
  PENDING_TRACK: { label: '解析中', color: 'gold' },
  COMPLETED: { label: '完成', color: 'green' },
  FAILED: { label: '失败', color: 'red' },
};

// 0=待处理（尚未解析完成，展示为 -） 1=新建下单 2=新建失败 3=修改订单 4=作废
export const IS_DONE_MAP = {
  1: { label: '新建下单', color: 'green' },
  2: { label: '新建失败', color: 'red' },
  3: { label: '修改订单', color: 'blue' },
  4: { label: '作废', color: 'default' },
};

export const splitValues = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
};

export const parseIntentType2 = (v) => {
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
