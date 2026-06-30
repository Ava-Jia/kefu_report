import { Layout, Menu, theme } from "antd";
import {
  BookOutlined,
  FileTextOutlined,
  LineChartOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import ReportForm from "./pages/ReportForm.jsx";
import Analysis from "./pages/Analysis.jsx";
import Knowledge from "./pages/Knowledge.jsx";
import CompanySearch from "./pages/Company.jsx";
import WechatBotKnowledge from "./pages/WechatBotKnowledge.jsx";
import Email from "./pages/Email.jsx";
import EmailDetail from "./pages/EmailDetail.jsx";

const { Header, Content } = Layout;

function TopMenu() {
  const location = useLocation();
  const selected = location.pathname.startsWith("/knowledge")
    ? ["/knowledge"]
    : location.pathname.startsWith("/analyze")
      ? ["/analyze"]
      : location.pathname.startsWith("/wechat-bot-knowledge")
        ? ["/wechat-bot-knowledge"]
        : location.pathname.startsWith("/company-search")
          ? ["/company-search"]
          : location.pathname.startsWith("/email")
            ? ["/email"]
            : ["/"];

  const menuItems = [
    { key: "/", icon: <FileTextOutlined />, label: <Link to="/">日报管理</Link> },
    { key: "/analyze", icon: <LineChartOutlined />, label: <Link to="/analyze">问题总结</Link> },
    { key: "/knowledge", icon: <BookOutlined />, label: <Link to="/knowledge">知识库</Link> },
    { key: "/company-search", icon: <BookOutlined />, label: <Link to="/company-search">公司检索</Link> },
    { key: "/wechat-bot-knowledge", icon: <BookOutlined />, label: <Link to="/wechat-bot-knowledge">Wechat Bot 知识库</Link> },
    { key: "/email", icon: <BookOutlined />, label: <Link to="/email">email管理</Link> },
  ];

  return (
    <Header style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 48 }}>
      <div style={{ color: "#fff", fontSize: 20, marginRight: 24, flexShrink: 0 }}>
        <RobotOutlined />
      </div>
      <Menu
        theme="dark"
        mode="horizontal"
        selectedKeys={selected}
        items={menuItems}
        style={{ flex: 1, minWidth: 0, lineHeight: "48px", borderBottom: "none" }}
      />
    </Header>
  );
}

export default function App() {
  const { token } = theme.useToken();
  const location = useLocation();
  const contentClass =
    location.pathname.startsWith("/analyze") ||
    location.pathname.startsWith("/knowledge") ||
    location.pathname.startsWith("/wechat-bot-knowledge")
      ? "app-content app-content--analyze-spread"
      : "app-content";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <TopMenu />
      <Layout style={{ background: token.colorBgLayout }}>
        <Content className={contentClass}>
          <Routes>
            <Route path="/" element={<ReportForm />} />
            <Route path="/analyze" element={<Analysis />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/company-search" element={<CompanySearch />} />
            <Route path="/wechat-bot-knowledge" element={<WechatBotKnowledge />} />
            <Route path="/email" element={<Email />} />
            <Route path="/email/:id" element={<EmailDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
