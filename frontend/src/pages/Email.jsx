import { useState } from 'react';
import {
  Button, Card, Descriptions, Empty, Input, Space,
  Spin, Tag, Typography, message,
} from 'antd';
import { SearchOutlined, LinkOutlined } from '@ant-design/icons';
import { checkEmailParserResult } from '../api';

const { Text, Paragraph } = Typography;

const INTENT_COLOR = {
  ARRIVAL_PICKUP_LFD: 'orange',
  IMPORT: 'blue',
  EXPORT: 'green',
  OTHER: 'default',
};

export default function Email() {
  const [taskId, setTaskId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

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
  const taskInfo = result ? {
    created_at: result.created_at,
    completed_at: result.completed_at,
    error: result.error,
  } : null;

  return (
    <div style={{ padding: '0 4px' }}>
      <h2 style={{ marginBottom: 16 }}>Email 解析结果查询</h2>

      <Space style={{ marginBottom: 20 }}>
        <Input
          placeholder="请输入 email_task_id"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 360 }}
          allowClear
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
          查询
        </Button>
      </Space>

      <Spin spinning={loading}>
        {result ? (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>

            {/* 任务状态 */}
            <Card size="small" title="任务信息">
              <Descriptions column={3} size="small">
                <Descriptions.Item label="创建时间">{taskInfo.created_at ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="完成时间">{taskInfo.completed_at ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  {taskInfo.error
                    ? <Tag color="red">失败：{taskInfo.error}</Tag>
                    : <Tag color="green">成功</Tag>}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 邮件基本信息 */}
            <Card size="small" title="邮件信息">
              <Descriptions column={2} size="small" bordered>
                <Descriptions.Item label="发件人" span={2}>
                  <Text copyable>{r.from ?? '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="收件人" span={2}>
                  <Text>{r.to ?? '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="主题" span={2}>
                  <Text strong>{r.subject ?? '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="日期">{r.date ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="MBL 号">
                  {r.mbl_number ? <Text copyable>{r.mbl_number}</Text> : '-'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 意图解析 */}
            <Card size="small" title="意图解析">
              <Descriptions column={3} size="small" bordered>
                <Descriptions.Item label="意图类型1">
                  {r.intent_type1
                    ? <Tag color={INTENT_COLOR[r.intent_type1] ?? 'blue'}>{r.intent_type1}</Tag>
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="意图类型2">
                  {r.intent_type2 && typeof r.intent_type2 === 'string' && r.intent_type2 !== '{}'
                    ? <Tag color="purple">{r.intent_type2}</Tag>
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="处理结果">
                  {r.intent_result
                    ? <Tag color={r.intent_result === 'OTHER' ? 'default' : 'cyan'}>{r.intent_result}</Tag>
                    : '-'}
                </Descriptions.Item>
                {r.intent_reason && (
                  <Descriptions.Item label="原因" span={3}>{r.intent_reason}</Descriptions.Item>
                )}
              </Descriptions>
            </Card>

            {/* 摘要 */}
            {r.email_summary && (
              <Card size="small" title="邮件摘要">
                <Paragraph style={{ margin: 0 }}>{r.email_summary}</Paragraph>
              </Card>
            )}

            {/* 附件 */}
            {r.attachments?.length > 0 && (
              <Card size="small" title={`附件（${r.attachments.length}）`}>
                <Space wrap>
                  {r.attachments.map((att, i) => (
                    <Tag key={i} color="geekblue">
                      {att.filename}（{(att.size / 1024).toFixed(1)} KB）
                    </Tag>
                  ))}
                </Space>
              </Card>
            )}

            {/* 原始邮件链接 */}
            {r.email_url && (
              <Card size="small" title="原始邮件">
                <a href={r.email_url} target="_blank" rel="noreferrer">
                  <LinkOutlined /> {r.email_url}
                </a>
              </Card>
            )}

          </Space>
        ) : (
          <Card>
            <Empty description="请输入 task_id 查询解析结果" />
          </Card>
        )}
      </Spin>
    </div>
  );
}
