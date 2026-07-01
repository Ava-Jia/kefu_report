import { useState } from "react";
import { Button, Layout, Menu, theme } from "antd";
import {
  BookOutlined,
  FileTextOutlined,
  LineChartOutlined,
  LogoutOutlined,
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
import Login from "./pages/Login.jsx";

const { Header, Content } = Layout;

function TopMenu({ onLogout }) {
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
    { key: "/email", icon: <BookOutlined />, label: <Link to="/email">Email管理</Link> },
  ];

  const username = localStorage.getItem("username") || "";

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
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>{username}</span>
        <Button
          type="text"
          icon={<LogoutOutlined />}
          onClick={onLogout}
          style={{ color: "rgba(255,255,255,0.65)" }}
          size="small"
        >
          退出
        </Button>
      </div>
    </Header>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("token"));
  const { token } = theme.useToken();
  const location = useLocation();

  if (!loggedIn) {
    return <Login onLogin={() => setLoggedIn(true)} />;
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setLoggedIn(false);
  }

  const contentClass =
    location.pathname.startsWith("/analyze") ||
    location.pathname.startsWith("/knowledge") ||
    location.pathname.startsWith("/wechat-bot-knowledge")
      ? "app-content app-content--analyze-spread"
      : location.pathname.startsWith("/email")
        ? "app-content app-content--email"
        : "app-content";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <TopMenu onLogout={handleLogout} />
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
