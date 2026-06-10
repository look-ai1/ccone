"use client";

import { useEffect, useState } from "react";
import SuperAdminDashboard from "./super-admin-dashboard";
import SuperAdminLogin from "./super-admin-login";
import type { SuperAdminStats } from "./super-admin-types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000/api";

const emptyStats: SuperAdminStats = {
  totalStores: 0,
  activeStores: 0,
  suspendedStores: 0,
  pendingApplications: 0,
  approvedApplications: 0,
  rejectedApplications: 0
};

interface AuthenticatedUser {
  email?: string;
  isSuperAdmin?: boolean;
  memberships?: Array<{ storeId: string; role: string }>;
}

function authHeaders() {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("shengduoduo_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function moveStoreSessionToAdmin(token: string, user: AuthenticatedUser) {
  const storeId = user.memberships?.[0]?.storeId;
  localStorage.removeItem("shengduoduo_token");
  localStorage.setItem("shengduoduo_admin_token", token);
  if (storeId) {
    localStorage.setItem("shengduoduo_admin_store_id", storeId);
  }
  window.location.replace("/admin");
}

function LoginBrandPanel({ stats }: { stats: SuperAdminStats }) {
  return (
    <div className="login-brand-panel">
      <div>
        <span className="tag blue">省多多 SaaS</span>
        <h2>餐饮门店统一管控平台</h2>
        <p>从门店开通、权限分配到数据隔离监控，超管端统一管理。</p>
      </div>
      <div className="login-stat-grid">
        <div><strong>{stats.totalStores}</strong><span>门店总数</span></div>
        <div><strong>{stats.activeStores}</strong><span>正常营业</span></div>
        <div><strong>{stats.pendingApplications}</strong><span>待审批</span></div>
      </div>
      <div className="login-module-list">
        {["登录认证", "总览仪表盘", "一级门店管理", "子门店审批", "租户数据隔离", "系统配置"].map((item, index) => (
          <span key={item}>{index + 1}. {item}</span>
        ))}
      </div>
    </div>
  );
}

export default function SuperAdminGate() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [stats, setStats] = useState<SuperAdminStats>(emptyStats);

  useEffect(() => {
    let disposed = false;

    async function verifySuperAdminSession() {
      const token = localStorage.getItem("shengduoduo_token");
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const user = (await response.json()) as AuthenticatedUser;
        if (!user.isSuperAdmin) {
          moveStoreSessionToAdmin(token, user);
          if (!disposed) setIsAuthenticated(false);
          return;
        }
        if (!disposed) {
          setCurrentUserEmail(user.email ?? "");
          setIsAuthenticated(true);
        }
      } catch {
        localStorage.removeItem("shengduoduo_token");
        if (!disposed) setIsAuthenticated(false);
      }
    }

    void verifySuperAdminSession();
    return () => {
      disposed = true;
    };
  }, []);

  async function refreshStats() {
    try {
      const response = await fetch(`${API_BASE}/super-admin/stats`, { cache: "no-store", headers: authHeaders() });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setStats((await response.json()) as SuperAdminStats);
    } catch {
      setStats(emptyStats);
    }
  }

  useEffect(() => {
    let disposed = false;

    async function loadStats() {
      try {
        const response = await fetch(`${API_BASE}/super-admin/stats`, { cache: "no-store", headers: authHeaders() });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const nextStats = (await response.json()) as SuperAdminStats;
        if (!disposed) {
          setStats(nextStats);
        }
      } catch {
        if (!disposed) {
          setStats(emptyStats);
        }
      }
    }

    void loadStats();
    const timer = window.setInterval(loadStats, 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  function logout() {
    localStorage.removeItem("shengduoduo_token");
    setIsAuthenticated(false);
  }

  if (isAuthenticated === null) {
    return (
      <main className="super-login-page">
        <section className="super-login-shell">
          <div className="login-card">
            <h2>省多多</h2>
            <p className="muted">正在检查登录状态</p>
          </div>
          <LoginBrandPanel stats={stats} />
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="super-login-page">
        <section className="super-login-shell">
          <SuperAdminLogin onSuccess={(user) => {
            setCurrentUserEmail(user.email ?? "");
            setIsAuthenticated(true);
          }} />
          <LoginBrandPanel stats={stats} />
        </section>
      </main>
    );
  }

  return <SuperAdminDashboard stats={stats} currentUserEmail={currentUserEmail} onLogout={logout} onStatsRefresh={refreshStats} />;
}
