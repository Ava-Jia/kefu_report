import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Button, Spin, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { fetchEmailHtml, fetchEmailResult } from '../api';

const { Text } = Typography;

const FIELD_LABEL = {
  agentEmail: '代理邮箱', agentName: '代理名称',
  collectAmountUSD: '到付金额(USD)', collectItem: '到付项目',
  consigneeAddress: '收货人地址', consigneeEmail: '收货人邮箱',
  consigneeName: '收货人', consigneeTel: '收货人电话',
  containerType: '箱型', ctrNumber: '箱号',
  customerType: '客户类型', descriptionOfGoods: '货物描述',
  grossWeight: '毛重', houseBillNo: 'HBL号',
  hblUrl: 'HBL链接', isSuspicious: '是否可疑',
  mark: '唛头', masterBillNo: 'MBL号',
  masterBillNoFromEmail: 'MBL(邮件)', notifyAddress: '通知方地址',
  notifyEmails: '通知方邮箱', notifyName: '通知方',
  notifyTel: '通知方电话', orderType: '单据类型',
  packageUnit: '包装单位', pieces: '件数',
  shipperAddress: '发货人地址', shipperEmail: '发货人邮箱',
  shipperName: '发货人', shipperTel: '发货人电话',
  summary: '备注', volume: '体积(CBM)',
};

const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);
const isImageUrl = (v) => typeof v === 'string' && /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(v);

function ResultField({ label, value }) {
  const display = value === null || value === undefined || value === '' ? null
    : typeof value === 'object' ? value
    : String(value);

  const friendlyLabel = FIELD_LABEL[label] || label;

  if (display === null) {
    return (
      <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
        <span style={{ width: 90, flexShrink: 0, color: '#bbb', fontSize: 15 }}>{friendlyLabel}</span>
        <span style={{ color: '#ccc', fontSize: 15 }}>—</span>
      </div>
    );
  }

  if (typeof display === 'object') {
    return (
      <div style={{ padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
        <div style={{ color: '#bbb', fontSize: 12, marginBottom: 4 }}>{friendlyLabel}</div>
        <div style={{ paddingLeft: 8, borderLeft: '2px solid #e8e8e8' }}>
          {Object.entries(display).map(([k, v]) => (
            <ResultField key={k} label={k} value={v} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
      <span style={{ width: 90, flexShrink: 0, color: '#888', fontSize: 15, paddingTop: 1 }}>{friendlyLabel}</span>
      {isUrl(display) ? (
        <a href={display} target="_blank" rel="noreferrer"
          style={{ fontSize: 15, wordBreak: 'break-all', display: 'flex', alignItems: 'flex-start', gap: 3 }}>
          <span>查看链接</span>
        </a>
      ) : (
        <Text copyable={{ text: display }}
          style={{ fontSize: 15, wordBreak: 'break-all', whiteSpace: 'pre-wrap', flex: 1 }}>
          {display}
        </Text>
      )}
    </div>
  );
}

export default function EmailDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const orderingId = searchParams.get('ordering_id');
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from ?? '/email';

  const [html, setHtml] = useState('');
  const [htmlLoading, setHtmlLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [resultLoading, setResultLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    fetchEmailHtml(id)
      .then((res) => { if (res?.code === 200) setHtml(res.data.html_content || ''); })
      .finally(() => setHtmlLoading(false));

    if (orderingId) {
      setResultLoading(true);
      fetchEmailResult(orderingId)
        .then((res) => {
          if (res?.code === 200) {
            setResult(res.data.result);
            setAttachments(res.data.attachments?.attachments ?? []);
          }
        })
        .finally(() => setResultLoading(false));
    }
  }, [id, orderingId]);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', zIndex: 100 }}>
      <div style={{ padding: '8px 16px', borderBottom: '2px solid #d0d0d0', flexShrink: 0 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backTo)}>返回</Button>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* 第一列：附件列表（直接内嵌展示内容） */}
      <div style={{ width: '50%', flexShrink: 0, borderRight: '2px solid #d0d0d0', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 14px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, flexShrink: 0 }}>附件列表</div>
        {attachments.length > 0 ? (
          <>
            {/* 切换按钮 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, flexShrink: 0 }}>
              {attachments.map((a, i) => (
                <div
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: `1px solid ${activeIdx === i ? '#1677ff' : '#e8e8e8'}`,
                    background: activeIdx === i ? '#e6f4ff' : '#fafafa',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#333',
                  }}
                >
                  <span>{a.attachmentName}</span>
                </div>
              ))}
            </div>
            {/* 当前附件内容 */}
            {attachments[activeIdx] && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {isImageUrl(attachments[activeIdx].attachmentTypeUrl) ? (
                  <img
                    src={attachments[activeIdx].attachmentTypeUrl}
                    alt={attachments[activeIdx].attachmentName}
                    style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid #e8e8e8', borderRadius: 6 }}
                  />
                ) : (
                  <iframe
                    title={`attachment-${activeIdx}`}
                    src={`${attachments[activeIdx].attachmentTypeUrl}#view=FitH&toolbar=0`}
                    style={{ width: '100%', height: '100%', border: '1px solid #e8e8e8', borderRadius: 6 }}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#aaa', fontSize: 13 }}>暂无附件</div>
        )}
      </div>

      {/* 第二列：邮件预览 */}
      <div style={{ width: '20%', flexShrink: 0, position: 'relative', borderRight: '2px solid #d0d0d0' }}>
        {htmlLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin />
          </div>
        ) : (
          <iframe
            title="email-html-preview"
            srcDoc={`<style>::-webkit-scrollbar{display:none}html,body{scrollbar-width:none;-ms-overflow-style:none}</style>${html || '<p style="color:#aaa;padding:24px">无 HTML 内容</p>'}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            sandbox=""
          />
        )}
      </div>

      {/* 第三列：解析信息 */}
      <div className="scrollbar-hidden" style={{ width: '30%', flexShrink: 0, padding: '16px 14px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>解析信息</div>
        {resultLoading ? (
          <Spin size="small" />
        ) : result ? (
          Object.entries(Array.isArray(result) ? result[0] ?? {} : result).map(([k, v]) => <ResultField key={k} label={k} value={v} />)
        ) : (
          <div style={{ color: '#aaa', fontSize: 12 }}>
            {orderingId ? '暂无解析结果' : '无 ordering_id'}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
