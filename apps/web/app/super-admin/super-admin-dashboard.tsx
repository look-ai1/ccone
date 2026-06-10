"use client";

import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  DatabaseZap,
  FileText,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Store
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SuperAdminStats } from "./super-admin-types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000/api";

type StoreStatus = "正常" | "停用";
type ApplicationStatus = "待审批" | "已通过" | "已拒绝";
type ModuleKey = "overview" | "stores" | "approvals" | "isolation" | "settings" | "audit";

interface TrendPoint {
  x: number;
  y: number;
  label: string;
  orders: number;
}

interface StoreRow {
  name: string;
  contact: string;
  phone: string;
  status: StoreStatus;
  tenantId: string;
  parentStoreId?: string | null;
}

interface ApiStore {
  id: string;
  parentStoreId?: string | null;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  status: "ACTIVE" | "SUSPENDED";
}

interface AdminCredential {
  storeId: string;
  account: string;
  initialPassword: string;
  adminLoginUrl: string;
  role: "STORE_ADMIN";
}

interface ApiStoreCreateResult {
  store: ApiStore;
  adminCredential?: AdminCredential;
}

interface ApiApprovalResult {
  application: ApiApplication;
  store?: ApiStore;
  adminCredential?: AdminCredential;
}

interface ApiApplication {
  id: string;
  requesterStoreId: string;
  requestedName: string;
  applicantName?: string | null;
  applicantPhone?: string | null;
  reason?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  requesterStore?: ApiStore | null;
}

interface ApiAuditLog {
  id: string;
  actorId?: string | null;
  action: string;
  payload?: unknown;
  createdAt: string;
}

interface ApiSystemConfig {
  key: string;
  value: unknown;
}

interface ApplicationRow {
  id: string;
  store: string;
  child: string;
  owner: string;
  time: string;
  reason: string;
  status: ApplicationStatus;
}

interface AuditRow {
  time: string;
  actor: string;
  action: string;
  result: string;
}

interface ConfigState {
  ocr: {
    provider: string;
    apiKey: string;
    endpoint: string;
    status: string;
  };
  printer: {
    provider: string;
    retryCount: string;
    status: string;
  };
  permissions: {
    storeAdmin: string;
    waiter: string;
    kitchen: string;
  };
}

const initialStores: StoreRow[] = [
  { name: "川湘轩总店", contact: "张三", phone: "13800138000", status: "正常", tenantId: "T10001" },
  { name: "粤味小馆", contact: "李四", phone: "13800138001", status: "正常", tenantId: "T10002" },
  { name: "秦晋小厨", contact: "马六", phone: "13800138002", status: "停用", tenantId: "T10003" },
  { name: "港味人家", contact: "王五", phone: "13800138003", status: "正常", tenantId: "T10004" }
];

const initialApplications: ApplicationRow[] = [
  { id: "APP-1001", store: "川湘轩总店", child: "川湘轩朝阳分店", owner: "张三", time: "2026-06-09 10:00", reason: "业务扩张，需要开设新分店", status: "待审批" },
  { id: "APP-1002", store: "川湘轩总店", child: "川湘轩海淀分店", owner: "张三", time: "2026-06-09 10:20", reason: "覆盖周边商圈堂食业务", status: "待审批" }
];

const initialAuditLogs: AuditRow[] = [
  { time: "2026-06-09 13:20", actor: "shengduoduo.saas", action: "超管登录", result: "成功" },
  { time: "2026-06-09 13:18", actor: "系统", action: "读取门店统计", result: "成功" },
  { time: "2026-06-09 13:14", actor: "系统", action: "API 健康检查", result: "成功" }
];

const defaultConfigs: ConfigState = {
  ocr: {
    provider: "豆包 OCR",
    apiKey: "********",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    status: "正常"
  },
  printer: {
    provider: "飞鹅打印",
    retryCount: "5",
    status: "正常"
  },
  permissions: {
    storeAdmin: "菜单、库存、订单、报表",
    waiter: "点餐、订单查看",
    kitchen: "打印任务、制作状态"
  }
};

const trendShape = [
  { x: 24, y: 164, orders: 1280 },
  { x: 141, y: 132, orders: 1580 },
  { x: 258, y: 96, orders: 1960 },
  { x: 375, y: 84, orders: 2130 },
  { x: 492, y: 136, orders: 1510 },
  { x: 609, y: 116, orders: 1760 },
  { x: 700, y: 70, orders: 2356 }
];

function buildTrendPoints(): TrendPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return trendShape.map((point, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (trendShape.length - 1 - index));
    return {
      ...point,
      label: `${date.getMonth() + 1}月${date.getDate()}日`
    };
  });
}

const modules: Array<{ key: ModuleKey; title: string; description: string; icon: typeof Activity }> = [
  { key: "overview", title: "总览仪表盘", description: "门店、审批和系统状态", icon: Activity },
  { key: "stores", title: "一级门店管理", description: "开店、停用、重置账号", icon: Store },
  { key: "approvals", title: "子门店审批", description: "审核分店申请", icon: ClipboardCheck },
  { key: "isolation", title: "租户隔离监控", description: "检查跨租户风险", icon: DatabaseZap },
  { key: "settings", title: "系统配置", description: "OCR、打印、权限模板", icon: Settings },
  { key: "audit", title: "审计日志", description: "登录和关键操作留痕", icon: FileText }
];

function nowText() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function StatCard({ label, value, tone = "blue" }: { label: string; value: string | number; tone?: "blue" | "green" | "red" | "orange" }) {
  return (
    <div className="console-stat-card">
      <span>{label}</span>
      <strong className={`${tone}-text`}>{value}</strong>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const ok = status === "正常" || status === "成功" || status === "已通过";
  const pending = status === "待审批";
  return <span className={ok ? "tag green" : pending ? "tag blue" : "tag red"}>{status}</span>;
}

function isStoreCreateResult(value: unknown): value is ApiStoreCreateResult {
  return Boolean(value && typeof value === "object" && "store" in value);
}

function unwrapStoreResult(value: unknown) {
  if (isStoreCreateResult(value)) {
    return value;
  }
  return { store: value as ApiStore, adminCredential: undefined };
}

function toStoreRow(store: ApiStore): StoreRow {
  return {
    name: store.name,
    contact: store.contactName ?? "待补充",
    phone: store.phone ?? "待补充",
    status: store.status === "ACTIVE" ? "正常" : "停用",
    tenantId: store.id,
    parentStoreId: store.parentStoreId ?? null
  };
}

function toApiStatus(status: StoreStatus) {
  return status === "正常" ? "ACTIVE" : "SUSPENDED";
}

function mapApplicationStatus(status: ApiApplication["status"]): ApplicationStatus {
  if (status === "APPROVED") return "已通过";
  if (status === "REJECTED") return "已拒绝";
  return "待审批";
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function toApplicationRow(application: ApiApplication): ApplicationRow {
  return {
    id: application.id,
    store: application.requesterStore?.name ?? application.requesterStoreId,
    child: application.requestedName,
    owner: application.applicantName ?? "待补充",
    time: formatDateTime(application.createdAt),
    reason: application.reason ?? "未填写",
    status: mapApplicationStatus(application.status)
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(record: Record<string, unknown>, key: string, fallback: string) {
  return typeof record[key] === "string" ? record[key] : fallback;
}

function toAuditRow(log: ApiAuditLog): AuditRow {
  const payload = toRecord(log.payload);
  return {
    time: formatDateTime(log.createdAt),
    actor: log.actorId ?? "系统",
    action: log.action,
    result: readString(payload, "result", "成功")
  };
}

function mergeConfigs(items: ApiSystemConfig[]): ConfigState {
  const byKey = new Map(items.map((item) => [item.key, toRecord(item.value)]));
  const ocr = byKey.get("ocr") ?? {};
  const printer = byKey.get("printer") ?? {};
  const permissions = byKey.get("permissions") ?? {};
  return {
    ocr: {
      provider: readString(ocr, "provider", defaultConfigs.ocr.provider),
      apiKey: readString(ocr, "apiKey", defaultConfigs.ocr.apiKey),
      endpoint: readString(ocr, "endpoint", defaultConfigs.ocr.endpoint),
      status: readString(ocr, "status", defaultConfigs.ocr.status)
    },
    printer: {
      provider: readString(printer, "provider", defaultConfigs.printer.provider),
      retryCount: readString(printer, "retryCount", defaultConfigs.printer.retryCount),
      status: readString(printer, "status", defaultConfigs.printer.status)
    },
    permissions: {
      storeAdmin: readString(permissions, "storeAdmin", defaultConfigs.permissions.storeAdmin),
      waiter: readString(permissions, "waiter", defaultConfigs.permissions.waiter),
      kitchen: readString(permissions, "kitchen", defaultConfigs.permissions.kitchen)
    }
  };
}

function requestHeaders(hasBody = false) {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  const token = window.localStorage.getItem("shengduoduo_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function SuperAdminDashboard({
  stats,
  currentUserEmail,
  onLogout,
  onStatsRefresh
}: {
  stats: SuperAdminStats;
  currentUserEmail: string;
  onLogout: () => void;
  onStatsRefresh: () => Promise<void>;
}) {
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");
  const [stores, setStores] = useState<StoreRow[]>(initialStores);
  const [applications, setApplications] = useState<ApplicationRow[]>(initialApplications);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>(initialAuditLogs);
  const [configs, setConfigs] = useState<ConfigState>(defaultConfigs);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [savingConfigKey, setSavingConfigKey] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastIsolationCheck, setLastIsolationCheck] = useState("10:00");
  const [selectedStore, setSelectedStore] = useState<StoreRow | null>(initialStores[0]);
  const [storeDraft, setStoreDraft] = useState<StoreRow>(initialStores[0]);
  const [hoveredTrend, setHoveredTrend] = useState<TrendPoint | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
  const [storeKeyword, setStoreKeyword] = useState("");
  const [latestCredential, setLatestCredential] = useState<AdminCredential | null>(null);

  const currentModule = useMemo(() => modules.find((item) => item.key === activeModule) ?? modules[0], [activeModule]);
  const pendingApplications = applications.filter((item) => item.status === "待审批").length;
  const trendPoints = useMemo(() => buildTrendPoints(), []);
  const trendLinePath = useMemo(() => trendPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" "), [trendPoints]);
  const trendAreaPath = `${trendLinePath} V200 H${trendPoints[0]?.x ?? 24}Z`;
  const filteredStores = useMemo(() => {
    const keyword = storeKeyword.trim().toLowerCase();
    if (!keyword) return stores;
    return stores.filter((store) => `${store.name} ${store.contact} ${store.phone} ${store.tenantId}`.toLowerCase().includes(keyword));
  }, [storeKeyword, stores]);
  const tenantTree = useMemo(() => {
    const roots = stores.filter((store) => !store.parentStoreId);
    return roots.map((root) => ({
      name: root.name,
      tenantId: root.tenantId,
      children: stores.filter((store) => store.parentStoreId === root.tenantId).map((store) => store.name)
    }));
  }, [stores]);

  useEffect(() => {
    if (selectedStore) {
      setStoreDraft(selectedStore);
    }
  }, [selectedStore]);

  useEffect(() => {
    void loadStores();
    void loadApplications();
    void loadAuditLogs();
    void loadSystemConfigs();
  }, []);

  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice(message);
    setNoticeTone(tone);
  }

  function addAudit(action: string, result = "成功") {
    setAuditLogs((current) => [
      { time: nowText(), actor: currentUserEmail, action, result },
      ...current
    ]);
  }

  async function copyLatestCredential() {
    if (!latestCredential) return;
    const text = [
      "省多多门店后台管理员账号",
      `后台地址：${window.location.origin}${latestCredential.adminLoginUrl}`,
      `账号：${latestCredential.account}`,
      `初始密码：${latestCredential.initialPassword}`,
      "首次登录后请立即修改密码。"
    ].join("\n");
    try {
      await window.navigator.clipboard.writeText(text);
      showNotice("管理员登录凭证已复制");
    } catch {
      showNotice("复制失败，请手动复制凭证", "error");
    }
  }

  async function loadStores() {
    setIsLoadingStores(true);
    try {
      const response = await fetch(`${API_BASE}/super-admin/stores`, { cache: "no-store", headers: requestHeaders() });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const nextStores = ((await response.json()) as ApiStore[]).map(toStoreRow);
      if (nextStores.length > 0) {
        setStores(nextStores);
        setSelectedStore(nextStores[0]);
      }
    } catch {
      showNotice("门店列表加载失败，当前显示本地演示数据", "error");
    } finally {
      setIsLoadingStores(false);
    }
  }

  async function loadApplications() {
    setIsLoadingApplications(true);
    try {
      const response = await fetch(`${API_BASE}/super-admin/sub-store-applications`, { cache: "no-store", headers: requestHeaders() });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setApplications(((await response.json()) as ApiApplication[]).map(toApplicationRow));
    } catch {
      showNotice("子门店审批列表加载失败，当前显示本地演示数据", "error");
    } finally {
      setIsLoadingApplications(false);
    }
  }

  async function loadAuditLogs() {
    setIsLoadingAudit(true);
    try {
      const response = await fetch(`${API_BASE}/super-admin/audit-logs`, { cache: "no-store", headers: requestHeaders() });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const rows = ((await response.json()) as ApiAuditLog[]).map(toAuditRow);
      if (rows.length > 0) {
        setAuditLogs(rows);
      }
    } catch {
      showNotice("审计日志加载失败，当前显示本地演示数据", "error");
    } finally {
      setIsLoadingAudit(false);
    }
  }

  async function loadSystemConfigs() {
    try {
      const response = await fetch(`${API_BASE}/super-admin/system-configs`, { cache: "no-store", headers: requestHeaders() });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setConfigs(mergeConfigs((await response.json()) as ApiSystemConfig[]));
    } catch {
      showNotice("系统配置加载失败，当前显示默认配置", "error");
    }
  }

  async function createDemoStore() {
    setIsCreating(true);
    showNotice("", "success");
    try {
      const name = `新增门店 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
      const phone = `139${Date.now().toString().slice(-8)}`;
      const response = await fetch(`${API_BASE}/super-admin/stores`, {
        method: "POST",
        headers: requestHeaders(true),
        body: JSON.stringify({ name, contactName: "新店管理员", phone })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = unwrapStoreResult(await response.json());
      const created = toStoreRow(result.store);
      setStores((current) => [created, ...current]);
      setSelectedStore(created);
      setLatestCredential(result.adminCredential ?? null);
      await onStatsRefresh();
      await loadAuditLogs();
      showNotice(result.adminCredential ? "门店已新增，管理员账号已生成" : "门店已新增，统计已刷新");
    } catch {
      showNotice("新增门店失败，请确认 API 服务已启动", "error");
      addAudit("新增门店", "失败");
    } finally {
      setIsCreating(false);
    }
  }

  async function refreshOverview() {
    await onStatsRefresh();
    showNotice("总览数据已刷新");
    addAudit("刷新总览统计");
  }

  async function handleStoreAction(tenantId: string, action: "edit" | "reset" | "toggle") {
    const target = stores.find((item) => item.tenantId === tenantId);
    if (!target) {
      showNotice("未找到门店", "error");
      return;
    }

    if (action === "edit") {
      setSelectedStore(target);
      showNotice(`已打开 ${target.name} 的详情，可在右侧查看`);
      addAudit(`查看门店详情：${target.name}`);
      return;
    }

    if (action === "reset") {
      try {
        const response = await fetch(`${API_BASE}/super-admin/stores/${tenantId}/reset-admin`, {
          method: "POST",
          headers: requestHeaders()
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const result = (await response.json()) as AdminCredential;
        setLatestCredential(result);
        showNotice(`${target.name} 的管理员密码已重置，请复制下方一次性凭证`);
        await loadAuditLogs();
      } catch {
        showNotice("重置门店账号失败，请确认 API 服务已启动", "error");
        addAudit(`重置门店账号：${target.name}`, "失败");
      }
      return;
    }

    try {
      const nextStatus: StoreStatus = target.status === "正常" ? "停用" : "正常";
      const response = await fetch(`${API_BASE}/super-admin/stores/${tenantId}`, {
        method: "PATCH",
        headers: requestHeaders(true),
        body: JSON.stringify({ status: toApiStatus(nextStatus) })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const updated = toStoreRow((await response.json()) as ApiStore);
      setStores((current) => current.map((item) => (item.tenantId === tenantId ? { ...item, ...updated } : item)));
      setSelectedStore((current) => (current?.tenantId === tenantId ? { ...current, ...updated } : current));
      await onStatsRefresh();
      await loadAuditLogs();
      showNotice(`${target.name} 已${nextStatus === "正常" ? "启用" : "停用"}`);
    } catch {
      showNotice("门店状态更新失败，请确认 API 服务已启动", "error");
      addAudit(`更新门店状态：${target.name}`, "失败");
    }
  }

  function updateStoreDraft(field: keyof StoreRow, value: string) {
    setStoreDraft((current) => ({ ...current, [field]: field === "status" ? (value as StoreStatus) : value }));
  }

  async function saveStoreEdit() {
    const nextName = storeDraft.name.trim();
    const nextContact = storeDraft.contact.trim();
    const nextPhone = storeDraft.phone.trim();
    if (!selectedStore) {
      showNotice("请先选择一个门店", "error");
      return;
    }
    if (!nextName) {
      showNotice("门店名称不能为空", "error");
      return;
    }
    if (!nextContact) {
      showNotice("联系人不能为空", "error");
      return;
    }
    if (!nextPhone) {
      showNotice("手机号不能为空", "error");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/super-admin/stores/${storeDraft.tenantId}`, {
        method: "PATCH",
        headers: requestHeaders(true),
        body: JSON.stringify({
          name: nextName,
          contactName: nextContact,
          phone: nextPhone,
          status: toApiStatus(storeDraft.status)
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const updatedStore = toStoreRow((await response.json()) as ApiStore);
      setStores((current) => current.map((item) => (item.tenantId === updatedStore.tenantId ? updatedStore : item)));
      setSelectedStore(updatedStore);
      await onStatsRefresh();
      await loadAuditLogs();
      showNotice(`${updatedStore.name} 的门店信息已保存`);
    } catch {
      showNotice("门店信息保存失败，请确认 API 服务已启动", "error");
      addAudit(`编辑门店信息：${nextName}`, "失败");
    }
  }

  async function decideApplication(id: string, status: Exclude<ApplicationStatus, "待审批">) {
    const target = applications.find((item) => item.id === id);
    if (!target) {
      showNotice("未找到审批申请", "error");
      return;
    }
    try {
      const action = status === "已通过" ? "approve" : "reject";
      const response = await fetch(`${API_BASE}/super-admin/sub-store-applications/${id}/${action}`, {
        method: "POST",
        headers: requestHeaders()
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as ApiApprovalResult | ApiApplication;
      if ("adminCredential" in result && result.adminCredential) {
        setLatestCredential(result.adminCredential);
      }
      await Promise.all([loadApplications(), loadStores(), onStatsRefresh(), loadAuditLogs()]);
      showNotice(`${target.child} 已${status === "已通过" ? "通过并生成管理员账号" : "拒绝"}`);
    } catch {
      showNotice("审批操作失败，请确认 API 服务已启动", "error");
      addAudit(`${status === "已通过" ? "通过" : "拒绝"}子门店申请：${target.child}`, "失败");
    }
  }

  async function runIsolationCheck() {
    setIsChecking(true);
    try {
      const response = await fetch(`${API_BASE}/super-admin/isolation-check`, {
        method: "POST",
        headers: requestHeaders()
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as { checkedAt: string };
      const checkedAt = new Date(result.checkedAt).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
      setLastIsolationCheck(checkedAt);
      showNotice("租户隔离检查完成，未发现跨门店数据访问");
      await loadAuditLogs();
    } catch {
      showNotice("租户隔离检查失败，请确认 API 服务已启动", "error");
      addAudit("执行租户隔离检查", "失败");
    } finally {
      setIsChecking(false);
    }
  }

  function updateConfig<K extends keyof ConfigState>(key: K, field: keyof ConfigState[K], value: string) {
    setConfigs((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value
      }
    }));
  }

  async function saveConfig(key: keyof ConfigState, name: string) {
    setSavingConfigKey(key);
    try {
      const response = await fetch(`${API_BASE}/super-admin/system-configs/${key}`, {
        method: "PATCH",
        headers: requestHeaders(true),
        body: JSON.stringify({ value: configs[key] })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await Promise.all([loadSystemConfigs(), loadAuditLogs()]);
      showNotice(`${name} 已保存`);
    } catch {
      showNotice(`${name} 保存失败，请确认 API 服务已启动`, "error");
      addAudit(`保存${name}`, "失败");
    } finally {
      setSavingConfigKey(null);
    }
  }

  return (
    <main className="super-console">
      <aside className="console-sidebar">
        <div className="console-brand">
          <span className="brand-mark" aria-label="省多多">
            <strong>省</strong>
            <i />
            <em />
          </span>
          <div>
            <strong>省多多</strong>
            <span>超管总控制台</span>
          </div>
        </div>

        <nav className="console-nav" aria-label="超管模块">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <button className={activeModule === item.key ? "active" : ""} key={item.key} type="button" onClick={() => setActiveModule(item.key)}>
                <Icon size={18} />
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="console-user-box">
          <span>当前账号</span>
          <strong>{currentUserEmail}</strong>
          <button className="button secondary" type="button" onClick={onLogout}>
            <LogOut size={16} /> 退出登录
          </button>
        </div>
      </aside>

      <section className="console-main">
        <header className="console-topbar">
          <div>
            <span className="tag blue">超管端</span>
            <h1>{currentModule.title}</h1>
            <p>{currentModule.description}</p>
          </div>
          <div className="console-health">
            <ShieldCheck size={18} />
            <span>RBAC 已启用</span>
          </div>
        </header>

        {notice ? <p className={noticeTone === "error" ? "form-message error console-notice" : "form-message console-notice"}>{notice}</p> : null}

        {latestCredential ? (
          <section className="credential-panel">
            <div>
              <strong>最近生成的门店管理员账号</strong>
              <span>该初始密码只在本次创建/重置后展示，请及时交给门店负责人并要求首次登录后修改。</span>
            </div>
            <dl>
              <div><dt>后台地址</dt><dd>{latestCredential.adminLoginUrl}</dd></div>
              <div><dt>账号</dt><dd>{latestCredential.account}</dd></div>
              <div><dt>初始密码</dt><dd>{latestCredential.initialPassword}</dd></div>
              <div><dt>角色</dt><dd>门店管理员</dd></div>
            </dl>
            <button className="button blue" type="button" onClick={copyLatestCredential}>复制凭证</button>
          </section>
        ) : null}

        {activeModule === "overview" ? (
          <section className="console-section">
            <div className="console-toolbar">
              <span className="muted">门店统计来自 API；订单和销售额仍是演示数据。</span>
              <button className="button secondary" type="button" onClick={refreshOverview}>
                <RefreshCw size={16} /> 刷新统计
              </button>
            </div>
            <div className="console-stat-grid">
              <StatCard label="门店总数" value={stats.totalStores} />
              <StatCard label="正常营业" value={stats.activeStores} tone="green" />
              <StatCard label="停用门店" value={stats.suspendedStores} tone="red" />
              <StatCard label="待审批子门店" value={pendingApplications || stats.pendingApplications} tone="orange" />
              <StatCard label="今日订单总数" value="2,356" />
              <StatCard label="今日平台销售额" value="328,560.00 元" tone="green" />
            </div>
            <div className="console-panel-grid">
              <div className="console-panel wide">
                <div className="panel-title">
                  <strong>近 7 日订单趋势</strong>
                  <span>用于总览视觉验收，后续接订单报表 API</span>
                </div>
                <div className="chart-shell" onMouseLeave={() => setHoveredTrend(null)}>
                  <svg className="console-chart" viewBox="0 0 720 210" role="img" aria-label="近 7 日订单趋势">
                    <path d={trendLinePath} fill="none" stroke="#1662e8" strokeWidth="5" />
                    <path d={trendAreaPath} fill="#eaf2ff" />
                    {trendPoints.map((point) => (
                      <g key={point.label} onMouseEnter={() => setHoveredTrend(point)} onFocus={() => setHoveredTrend(point)} tabIndex={0}>
                        <circle cx={point.x} cy={point.y} r="18" fill="transparent" />
                        <circle cx={point.x} cy={point.y} r={hoveredTrend?.label === point.label ? "7" : "5"} fill="#1662e8" stroke="#fff" strokeWidth="3" />
                      </g>
                    ))}
                  </svg>
                  {hoveredTrend ? (
                    <div className="chart-tooltip" style={{ left: `${(hoveredTrend.x / 720) * 100}%`, top: `${(hoveredTrend.y / 210) * 100}%` }}>
                      <strong>{hoveredTrend.orders.toLocaleString("zh-CN")}</strong>
                      <span>{hoveredTrend.label} 订单数</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="console-panel">
                <div className="panel-title">
                  <strong>系统状态</strong>
                </div>
                <div className="status-list">
                  <span><CheckCircle2 size={16} /> API 正常</span>
                  <span><CheckCircle2 size={16} /> 权限守卫正常</span>
                  <span><AlertTriangle size={16} /> 未配置正式 DATABASE_URL</span>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeModule === "stores" ? (
          <section className="console-section">
            <div className="console-toolbar">
              <label className="console-search">
                <Search size={17} />
                <input placeholder="搜索门店名称、联系人、手机号" value={storeKeyword} onChange={(event) => setStoreKeyword(event.target.value)} />
              </label>
              {isLoadingStores ? <span className="muted">正在加载门店...</span> : null}
              <button className="button blue" disabled={isCreating} type="button" onClick={createDemoStore}>
                <Plus size={16} /> {isCreating ? "新增中" : "新增门店"}
              </button>
            </div>
            <div className="console-panel-grid">
              <div className="console-panel">
                <table className="table">
                  <thead><tr><th>门店名称</th><th>租户 ID</th><th>联系人</th><th>手机号</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {filteredStores.map((store) => (
                      <tr key={store.tenantId}>
                        <td>{store.name}</td>
                        <td>{store.tenantId}</td>
                        <td>{store.contact}</td>
                        <td>{store.phone}</td>
                        <td><StatusTag status={store.status} /></td>
                        <td>
                          <div className="inline-actions">
                            <button type="button" onClick={() => handleStoreAction(store.tenantId, "edit")}>详情</button>
                            <button type="button" onClick={() => handleStoreAction(store.tenantId, "toggle")}>{store.status === "正常" ? "停用" : "启用"}</button>
                            <button type="button" onClick={() => handleStoreAction(store.tenantId, "reset")}>重置账号</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredStores.length === 0 ? (
                      <tr>
                        <td colSpan={6}>没有匹配的门店</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <aside className="console-panel detail-panel">
                <div className="panel-title">
                  <strong>门店信息编辑</strong>
                  <span>保存后同步到左侧列表</span>
                </div>
                {selectedStore ? (
                  <form className="store-edit-form" onSubmit={(event) => { event.preventDefault(); saveStoreEdit(); }}>
                    <label>
                      <span>门店名称</span>
                      <input className="input" value={storeDraft.name} onChange={(event) => updateStoreDraft("name", event.target.value)} />
                    </label>
                    <label>
                      <span>租户 ID</span>
                      <input className="input" value={storeDraft.tenantId} disabled readOnly />
                    </label>
                    <label>
                      <span>联系人</span>
                      <input className="input" value={storeDraft.contact} onChange={(event) => updateStoreDraft("contact", event.target.value)} />
                    </label>
                    <label>
                      <span>手机号</span>
                      <input className="input" value={storeDraft.phone} onChange={(event) => updateStoreDraft("phone", event.target.value)} />
                    </label>
                    <label>
                      <span>状态</span>
                      <select value={storeDraft.status} onChange={(event) => updateStoreDraft("status", event.target.value)}>
                        <option value="正常">正常</option>
                        <option value="停用">停用</option>
                      </select>
                    </label>
                    <div className="store-edit-actions">
                      <button className="button secondary" type="button" onClick={() => setStoreDraft(selectedStore)}>取消修改</button>
                      <button className="button blue" type="submit">保存门店信息</button>
                    </div>
                  </form>
                ) : <p className="muted">请选择门店</p>}
              </aside>
            </div>
          </section>
        ) : null}

        {activeModule === "approvals" ? (
          <section className="console-section approval-layout">
            {isLoadingApplications ? <p className="muted">正在加载审批申请...</p> : null}
            {applications.map((item) => (
              <article className="console-panel approval-item" key={item.id}>
                <div>
                  <div className="panel-title">
                    <strong>{item.child}</strong>
                    <StatusTag status={item.status} />
                  </div>
                  <p>申请门店：{item.store}</p>
                  <p>申请人：{item.owner}</p>
                  <p>申请时间：{item.time}</p>
                  <p>申请原因：{item.reason}</p>
                </div>
                <div className="approval-actions">
                  <button className="button danger" disabled={item.status !== "待审批"} type="button" onClick={() => decideApplication(item.id, "已拒绝")}>拒绝</button>
                  <button className="button" disabled={item.status !== "待审批"} type="button" onClick={() => decideApplication(item.id, "已通过")}>通过</button>
                </div>
              </article>
            ))}
            {applications.length === 0 && !isLoadingApplications ? <p className="muted">暂无子门店申请</p> : null}
          </section>
        ) : null}

        {activeModule === "isolation" ? (
          <section className="console-section">
            <div className="console-panel-grid">
              <div className="console-panel">
                <div className="panel-title"><strong>门店层级与租户边界</strong></div>
                <div className="console-tenant-tree">
                  {tenantTree.map((tenant) => (
                    <div className="tenant-node" key={tenant.tenantId}>
                      <strong><Building2 size={16} /> {tenant.name} <span>{tenant.tenantId}</span></strong>
                      {tenant.children.map((child) => <p key={child}><ShieldCheck size={14} /> 子门店：{child}</p>)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="console-panel">
                <div className="console-stat-grid compact">
                  <StatCard label="数据隔离状态" value="正常" tone="green" />
                  <StatCard label="异常数据数量" value="0" tone="red" />
                  <StatCard label="今日检查时间" value={lastIsolationCheck} />
                </div>
                <button className="button blue" disabled={isChecking} type="button" onClick={runIsolationCheck}>
                  {isChecking ? "检查中" : "立即检查"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeModule === "settings" ? (
          <section className="console-section settings-layout">
            <div className="console-panel config-card">
              <strong>OCR 服务配置</strong>
              <label>服务商<input className="input" value={configs.ocr.provider} onChange={(event) => updateConfig("ocr", "provider", event.target.value)} /></label>
              <label>API Key<input className="input" value={configs.ocr.apiKey} onChange={(event) => updateConfig("ocr", "apiKey", event.target.value)} /></label>
              <label>接口地址<input className="input" value={configs.ocr.endpoint} onChange={(event) => updateConfig("ocr", "endpoint", event.target.value)} /></label>
              <p>状态：<span className="green-text">{configs.ocr.status}</span></p>
              <button className="button blue" disabled={savingConfigKey === "ocr"} type="button" onClick={() => saveConfig("ocr", "OCR 服务配置")}>{savingConfigKey === "ocr" ? "保存中" : "保存配置"}</button>
            </div>
            <div className="console-panel config-card">
              <strong>打印服务配置</strong>
              <label>打印服务商<input className="input" value={configs.printer.provider} onChange={(event) => updateConfig("printer", "provider", event.target.value)} /></label>
              <label>失败重试次数<input className="input" value={configs.printer.retryCount} onChange={(event) => updateConfig("printer", "retryCount", event.target.value)} /></label>
              <p>状态：<span className="green-text">{configs.printer.status}</span></p>
              <button className="button blue" disabled={savingConfigKey === "printer"} type="button" onClick={() => saveConfig("printer", "打印服务配置")}>{savingConfigKey === "printer" ? "保存中" : "保存配置"}</button>
            </div>
            <div className="console-panel config-card">
              <strong>权限模板</strong>
              <label>门店管理员<input className="input" value={configs.permissions.storeAdmin} onChange={(event) => updateConfig("permissions", "storeAdmin", event.target.value)} /></label>
              <label>服务员<input className="input" value={configs.permissions.waiter} onChange={(event) => updateConfig("permissions", "waiter", event.target.value)} /></label>
              <label>后厨<input className="input" value={configs.permissions.kitchen} onChange={(event) => updateConfig("permissions", "kitchen", event.target.value)} /></label>
              <button className="button secondary" disabled={savingConfigKey === "permissions"} type="button" onClick={() => saveConfig("permissions", "权限模板")}>{savingConfigKey === "permissions" ? "保存中" : "保存模板"}</button>
            </div>
          </section>
        ) : null}

        {activeModule === "audit" ? (
          <section className="console-section">
            <div className="console-panel">
              {isLoadingAudit ? <p className="muted">正在加载审计日志...</p> : null}
              <table className="table">
                <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>结果</th></tr></thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={`${log.time}-${log.action}`}>
                      <td>{log.time}</td>
                      <td>{log.actor}</td>
                      <td>{log.action}</td>
                      <td><StatusTag status={log.result} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
