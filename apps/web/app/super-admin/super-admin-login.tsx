"use client";

import { LogIn, ShieldCheck } from "lucide-react";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000/api";

interface LoginUser {
  email?: string;
  isSuperAdmin: boolean;
  memberships?: Array<{ storeId: string; role: string }>;
}

export default function SuperAdminLogin({ onSuccess }: { onSuccess?: (user: LoginUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function login() {
    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as { token: string; user: LoginUser };
      if (!result.user.isSuperAdmin) {
        localStorage.removeItem("shengduoduo_token");
        localStorage.setItem("shengduoduo_admin_token", result.token);
        const storeId = result.user.memberships?.[0]?.storeId;
        if (storeId) {
          localStorage.setItem("shengduoduo_admin_store_id", storeId);
        }
        setMessage("这个账号是门店管理员账号，正在跳转到门店后台");
        window.location.replace("/admin");
        return;
      }
      localStorage.removeItem("shengduoduo_admin_token");
      localStorage.removeItem("shengduoduo_admin_store_id");
      localStorage.setItem("shengduoduo_token", result.token);
      setMessage("登录成功，正在进入总控制台");
      if (onSuccess) {
        onSuccess(result.user);
      } else {
        window.location.href = "/super-admin";
      }
    } catch {
      setMessage("登录失败：请确认账号密码正确，或后端 API 已启动");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-card">
      <div className="login-brand-row">
        <span className="brand-mark" aria-label="省多多">
          <strong>省</strong>
          <i />
          <em />
        </span>
        <div>
          <h2>省多多</h2>
          <p className="muted">超管总控制台</p>
        </div>
      </div>
      <div className="login-copy">
        <strong>登录系统</strong>
        <span>管理门店开通、子门店审批与租户数据隔离</span>
      </div>
      <label className="login-field">
        <span>账号</span>
        <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="login-field">
        <span>密码</span>
        <input className="input" type="password" placeholder="请输入密码" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <button className="button blue" disabled={isSubmitting} type="button" onClick={login}>
        <LogIn size={18} /> {isSubmitting ? "登录中" : "登录"}
      </button>
      <div className="login-security"><ShieldCheck size={15} /> PBKDF2 密码校验 · RBAC 权限控制</div>
      {message ? <p className={message.includes("失败") || message.includes("门店管理员") ? "form-message error" : "form-message"}>{message}</p> : null}
    </div>
  );
}
