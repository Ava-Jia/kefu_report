import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Spin, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { fetchEmailHtml, fetchEmailResult } from '../api';

const { Text } = Typography;

const INTENT_COLOR = {
  CANCEL_IT: 'red', REEXPORT_RETURN: 'volcano', RELEASE: 'green',
  ARRIVAL_PICKUP_LFD: 'orange', CUSTOMS_EXAM_CLEARANCE: 'purple',
  TRANSPORT_STATUS: 'blue', EMPTY_RETURN_EQUIPMENT: 'cyan',
  PAYMENT_FINANCE: 'gold', DOCUMENT_BL: 'geekblue',
  SHIPPING_COMPANY_REPLY: 'lime', EXCHANGE_OF_PORT: 'magenta', OTHER: 'default',
};
const INTENT_LABEL = {
  CANCEL_IT: 'CANCEL_IT', REEXPORT_RETURN: '退运', RELEASE: '放行',
  ARRIVAL_PICKUP_LFD: '到港/提货/LFD', CUSTOMS_EXAM_CLEARANCE: '海关查验/清关',
  TRANSPORT_STATUS: '铁路运输', EMPTY_RETURN_EQUIPMENT: '空箱归还',
  PAYMENT_FINANCE: '费用相关', DOCUMENT_BL: '提单业务',
  SHIPPING_COMPANY_REPLY: '船公司回复', EXCHANGE_OF_PORT: '换单', OTHER: '其他',
};

function ResultField({ label, value }) {
  const display = value === null || value === undefined ? '-'
    : typeof value === 'object' ? JSON.stringify(value, null, 2)
    : String(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap', fontSize: 13 }}>{display}</div>
    </div>
  );
}

export default function EmailDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const orderingId = searchParams.get('ordering_id');
  const navigate = useNavigate();

  const [html, setHtml] = useState('');
  const [htmlLoading, setHtmlLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [resultLoading, setResultLoading] = useState(false);

  useEffect(() => {
    fetchEmailHtml(id)
      .then((res) => { if (res?.code === 200) setHtml(res.data.html_content || ''); })
      .finally(() => setHtmlLoading(false));

    if (orderingId) {
      setResultLoading(true);
      fetchEmailResult(orderingId)
        .then((res) => { if (res?.code === 200) setResult(res.data.result); })
        .finally(() => setResultLoading(false));
    }
  }, [id, orderingId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* 左侧：解析信息 */}
      <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid #f0f0f0', padding: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>解析信息</div>
        {resultLoading ? (
          <Spin size="small" />
        ) : result ? (
          Object.entries(result).map(([k, v]) => <ResultField key={k} label={k} value={v} />)
        ) : (
          <div style={{ color: '#aaa', fontSize: 12 }}>
            {orderingId ? '暂无解析结果' : '无 ordering_id'}
          </div>
        )}
      </div>

      {/* 右侧：HTML 预览 */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {htmlLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin />
          </div>
        ) : (
          <iframe
            title="email-html-preview"
            srcDoc={html || '<p style="color:#aaa;padding:24px">无 HTML 内容</p>'}
            style={{ width: '100%', height: '100%', border: 'none' }}
            sandbox=""
          />
        )}
      </div>
      </div>
    </div>
  );
}
