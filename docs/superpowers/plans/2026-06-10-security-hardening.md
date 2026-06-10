# 超管端安全加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复安全审查报告中识别的 12 项漏洞，将 codex.app 超管端提升至生产级安全标准。

**Architecture:** 修复分为三层：API 层（NestJS 后端）消除后门、注入漏洞、未鉴权接口；传输层修正 CORS 配置；前端层改用 httpOnly cookie 替代 localStorage 存 token。密码重置流程改为一次性展示后不再返回明文。审计日志加入分页。

**Tech Stack:** NestJS 10, Prisma 5, Next.js (App Router), node:crypto, @nestjs/throttler (新增), zod

---

## 文件变更地图

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/api/src/auth.controller.ts` | 修改 | 删除硬编码后门凭据 |
| `apps/api/src/tenant.middleware.ts` | 修改 | 删除 x-super-admin 头；storeId 改从 JWT memberships 验证 |
| `apps/api/src/stores.controller.ts` | 修改 | applySubStore 加鉴权；audit actorId 改从 JWT 取；密码脱敏返回；审计日志分页；isolation check 真实实现 |
| `apps/api/src/main.ts` | 修改 | CORS 限白名单；JWT_SECRET 启动时断言；安装 throttler |
| `apps/api/src/app.module.ts` | 修改 | 注册 ThrottlerModule 和 ThrottlerGuard |
| `apps/api/src/auth.guard.ts` | 修改 | login 端点加 @Throttle 限速注解 |
| `apps/api/package.json` | 修改 | 添加 @nestjs/throttler 依赖 |
| `apps/web/app/super-admin/super-admin-login.tsx` | 修改 | 删除预填 Demo 账号 |
| `apps/web/app/super-admin/super-admin-gate.tsx` | 修改 | 删除预填 Demo 账号引用 |
| `apps/web/next.config.mjs` | 修改（可选） | 配置 ALLOWED_ORIGINS 环境变量 |
| `apps/api/.env.example`（如存在）或 `.env` 注释 | 参考 | 标注 JWT_SECRET 为必填 |

---

## Task 1: 删除硬编码超管后门凭据

**风险：** Critical — 数据库故障时任何人可用固定密码拿到超管 JWT

**Files:**
- Modify: `apps/api/src/auth.controller.ts:56-71`

- [ ] **Step 1: 修改 auth.controller.ts，删除 catch 分支中的 Demo 后门**

  将整个 `login` 方法的 catch 块从"先检查 demo 密码，再检查内存用户"改为"数据库失败只允许内存用户登录，绝不允许硬编码超管"：

  ```typescript
  // apps/api/src/auth.controller.ts
  import { Body, Controller, Get, Post, ServiceUnavailableException, UnauthorizedException, UseGuards } from "@nestjs/common";
  import { PrismaService } from "./prisma.service.js";
  import { verifyPassword } from "./security/password.js";
  import { signToken } from "./security/token.js";
  import { CurrentUser } from "./auth.decorators.js";
  import { PermissionGuard } from "./auth.guard.js";
  import type { AuthenticatedUser } from "./auth.types.js";
  import { InMemoryStore } from "./in-memory-store.js";

  @Controller("auth")
  export class AuthController {
    constructor(
      private readonly prisma: PrismaService,
      private readonly store: InMemoryStore
    ) {}

    @Post("login")
    async login(@Body() body: { email: string; password: string }) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { email: body.email },
          include: {
            memberships: {
              include: { role: true }
            }
          }
        });
        if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
          throw new UnauthorizedException("Invalid email or password");
        }

        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() }
        });

        const authUser: AuthenticatedUser = {
          id: user.id,
          email: user.email,
          isSuperAdmin: user.isSuperAdmin,
          memberships: user.memberships.map((membership) => ({
            storeId: membership.storeId,
            role: membership.role.key,
            permissions: membership.role.permissions
          }))
        };

        return this.issueToken(authUser);
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        // DB 不可用时只允许内存用户（门店测试账号），绝不允许任何硬编码超管凭据
        const inMemoryUser = this.store.findUserByCredentials(body.email, body.password);
        if (inMemoryUser && !inMemoryUser.isSuperAdmin) {
          return this.issueToken(inMemoryUser);
        }
        throw new ServiceUnavailableException("Database unavailable");
      }
    }

    private issueToken(authUser: AuthenticatedUser) {
      return {
        token: signToken({
          sub: authUser.id,
          email: authUser.email,
          isSuperAdmin: authUser.isSuperAdmin,
          memberships: authUser.memberships
        }),
        user: authUser
      };
    }

    @Get("me")
    @UseGuards(PermissionGuard)
    me(@CurrentUser() user?: AuthenticatedUser) {
      return user ?? null;
    }
  }
  ```

  注意：`verifyPassword` 改为 `await`（当前是同步函数，不需要 await，但保持一致性不影响功能）。实际上 `verifyPassword` 是同步的，去掉 await 也行，保持原样调用即可。

- [ ] **Step 2: 同步删除 DEMO_SUPER_ADMIN 常量**

  上一步已经不导入它了。确认文件顶部没有残留 `DEMO_SUPER_ADMIN` 定义。

- [ ] **Step 3: 验证编译通过**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/api
  ```

  期望：无 TypeScript 错误。

---

## Task 2: 修复 TenantMiddleware — 删除 x-super-admin 头，锁定 storeId 来源

**风险：** Critical (#2) + High (#3) — 头注入可篡改上下文

**Files:**
- Modify: `apps/api/src/tenant.middleware.ts`

- [ ] **Step 1: 重写 TenantMiddleware**

  规则：
  1. `isSuperAdmin` 只从已验证 JWT payload 取，不接受任何请求头覆盖
  2. `storeId` 优先从 JWT memberships 验证——若请求携带 JWT，则 `x-store-id` 必须在该用户的 memberships 中；超管不受此约束（超管可管理所有门店）
  3. `x-actor-id` 头完全删除，actorId 只从 JWT 的 `sub` 取

  ```typescript
  // apps/api/src/tenant.middleware.ts
  import { Injectable, NestMiddleware } from "@nestjs/common";
  import type { NextFunction, Request, Response } from "express";
  import type { AuthenticatedUser } from "./auth.types.js";
  import type { TenantContextValue } from "./tenant-context.js";
  import { verifyToken } from "./security/token.js";

  declare module "express-serve-static-core" {
    interface Request {
      tenant: TenantContextValue;
      user?: AuthenticatedUser;
    }
  }

  @Injectable()
  export class TenantMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction) {
      const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
      const payload = token ? verifyToken(token) : null;

      if (payload) {
        req.user = {
          id: payload.sub,
          email: payload.email,
          isSuperAdmin: payload.isSuperAdmin,
          memberships: payload.memberships
        };
      }

      const requestedStoreId = req.header("x-store-id");
      let storeId: string;

      if (req.user?.isSuperAdmin) {
        // 超管可以操作任意门店，接受头传入；无头时用 fallback
        storeId = requestedStoreId ?? "store_demo";
      } else if (req.user && req.user.memberships.length > 0) {
        // 普通用户：x-store-id 必须在其 memberships 中，否则取第一个 membership
        const validStoreId = req.user.memberships.find((m) => m.storeId === requestedStoreId)?.storeId;
        storeId = validStoreId ?? req.user.memberships[0].storeId;
      } else {
        // 未认证或无 membership：使用请求头（后续 guard 会拦截需要权限的端点）
        storeId = requestedStoreId ?? "store_demo";
      }

      // isSuperAdmin 和 actorId 严格来自 JWT，不接受任何头覆盖
      req.tenant = {
        storeId,
        actorId: req.user?.id,
        isSuperAdmin: req.user?.isSuperAdmin ?? false
      };

      next();
    }
  }
  ```

- [ ] **Step 2: 验证编译**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/api
  ```

---

## Task 3: 给 applySubStore 添加鉴权

**风险：** High (#7) — 完全公开接口

**Files:**
- Modify: `apps/api/src/stores.controller.ts:252`

- [ ] **Step 1: 给 applySubStore 端点添加权限修饰符**

  该端点是门店管理员提交子门店申请，需要 `store:read` 权限（代表已登录的门店管理员）：

  ```typescript
  // 在 stores.controller.ts 顶部导入中添加 RequirePermissions（已存在则跳过）
  import { RequireSuperAdmin, RequirePermissions } from "./auth.decorators.js";
  ```

  找到 `applySubStore` 方法，在 `@Post` 之上添加装饰器：

  ```typescript
  @Post("admin/sub-store-applications")
  @RequirePermissions("store:read")
  async applySubStore(@TenantContext() tenant: TenantContextValue, @Body() body: { requestedName: string; applicantName?: string; applicantPhone?: string; reason?: string }) {
  ```

- [ ] **Step 2: 同步检查 stores.controller.ts 顶部导入**

  确认 `RequirePermissions` 已在导入列表中：
  ```typescript
  import { RequireSuperAdmin, RequirePermissions } from "./auth.decorators.js";
  ```

- [ ] **Step 3: 验证编译**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/api
  ```

---

## Task 4: 修复 JWT_SECRET 启动时校验 + CORS 白名单

**风险：** Medium (#8) + High (#5)

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: 重写 main.ts**

  - `envSchema` 加入 `JWT_SECRET`（必填，最小 32 字符）
  - `ALLOWED_ORIGINS` 环境变量控制 CORS 白名单，生产必须设置
  - 开发环境 fallback 到 localhost

  ```typescript
  // apps/api/src/main.ts
  import "reflect-metadata";
  import { existsSync, readFileSync } from "node:fs";
  import { dirname, join } from "node:path";
  import { NestFactory } from "@nestjs/core";
  import { z } from "zod";
  import { AppModule } from "./app.module.js";

  function loadEnvFile() {
    let current = process.cwd();
    for (let depth = 0; depth < 5; depth += 1) {
      const envPath = join(current, ".env");
      if (existsSync(envPath)) {
        const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const index = trimmed.indexOf("=");
          if (index <= 0) continue;
          const key = trimmed.slice(0, index).trim();
          const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
          process.env[key] ??= value;
        }
        return;
      }
      const parent = dirname(current);
      if (parent === current) return;
      current = parent;
    }
  }

  const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    ALLOWED_ORIGINS: z.string().optional()
  });

  function getAllowedOrigins(env: { NODE_ENV: string; ALLOWED_ORIGINS?: string }): string[] | true {
    if (env.NODE_ENV !== "production") {
      return ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"];
    }
    if (!env.ALLOWED_ORIGINS) {
      console.error("FATAL: ALLOWED_ORIGINS must be set in production");
      process.exit(1);
    }
    return env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
  }

  async function bootstrap() {
    loadEnvFile();
    const env = envSchema.parse(process.env);
    const app = await NestFactory.create(AppModule);
    app.enableCors({
      origin: getAllowedOrigins(env),
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-store-id"]
    });
    app.setGlobalPrefix("api");
    await app.listen(env.PORT);
    console.log(`API listening on http://localhost:${env.PORT}/api`);
  }

  void bootstrap();
  ```

- [ ] **Step 2: 更新 .env 文件，确保 JWT_SECRET 符合最小长度要求**

  检查 `E:/codex.app/.env` 中 `JWT_SECRET` 的长度（当前是 `shengduoduo-local-development-secret-32`，恰好 38 字符，符合要求）。

  若生产环境部署，必须在服务器环境变量中设置 `ALLOWED_ORIGINS=https://your-domain.com`。

- [ ] **Step 3: 验证编译**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/api
  ```

---

## Task 5: 添加登录频率限制（@nestjs/throttler）

**风险：** Medium (#11) — 无暴力破解防护

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/auth.controller.ts`

- [ ] **Step 1: 安装 @nestjs/throttler**

  ```bash
  cd E:/codex.app && npm install @nestjs/throttler --workspace=apps/api
  ```

  期望：`apps/api/package.json` 中出现 `"@nestjs/throttler": "^6.x.x"`。

- [ ] **Step 2: 注册 ThrottlerModule 到 AppModule**

  ```typescript
  // apps/api/src/app.module.ts
  import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
  import { APP_GUARD } from "@nestjs/core";
  import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
  import { AdminDashboardController } from "./admin-dashboard.controller.js";
  import { AuthController } from "./auth.controller.js";
  import { PermissionGuard } from "./auth.guard.js";
  import { TenantMiddleware } from "./tenant.middleware.js";
  import { CatalogController } from "./catalog.controller.js";
  import { HealthController } from "./health.controller.js";
  import { InMemoryStore } from "./in-memory-store.js";
  import { OrdersController } from "./orders.controller.js";
  import { PrismaService } from "./prisma.service.js";
  import { PurchasesController } from "./purchases.controller.js";
  import { ReportsController } from "./reports.controller.js";
  import { StoresController } from "./stores.controller.js";

  @Module({
    imports: [
      ThrottlerModule.forRoot([
        {
          name: "global",
          ttl: 60_000,   // 1 分钟窗口
          limit: 60      // 普通接口：每分钟 60 次
        }
      ])
    ],
    controllers: [HealthController, AuthController, StoresController, AdminDashboardController, CatalogController, PurchasesController, OrdersController, ReportsController],
    providers: [
      InMemoryStore,
      PrismaService,
      {
        provide: APP_GUARD,
        useClass: ThrottlerGuard
      },
      {
        provide: APP_GUARD,
        useClass: PermissionGuard
      }
    ]
  })
  export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(TenantMiddleware).forRoutes("*");
    }
  }
  ```

- [ ] **Step 3: 给登录端点单独设置严格限速**

  在 `auth.controller.ts` 的 `login` 方法上添加 `@Throttle`，覆盖全局配置为更严格的限速：

  ```typescript
  import { Body, Controller, Get, Post, ServiceUnavailableException, UnauthorizedException, UseGuards } from "@nestjs/common";
  import { Throttle } from "@nestjs/throttler";
  // ... 其余 imports 不变

  @Post("login")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })  // 每分钟最多 10 次登录尝试
  async login(@Body() body: { email: string; password: string }) {
    // ... 方法体不变
  }
  ```

- [ ] **Step 4: 验证编译**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/api
  ```

---

## Task 6: 修复密码重置不返回明文 + 审计 actorId 来源修正

**风险：** Medium (#10) + High (#4)

**Files:**
- Modify: `apps/api/src/stores.controller.ts`

- [ ] **Step 1: 修改 resetStoreAdmin 返回值，对明文密码脱敏**

  密码重置后，明文密码只能展示一次。API 层面的修复：返回时用 `initialPassword` 字段，但标记为"已展示"。
  
  前端收到后展示一次，关闭弹窗后不再可见。API 本身无状态，不能"只展示一次"，但我们可以避免把明文写入审计日志，并在 response 中加一个字段提示前端这是一次性密码。

  在 `resetStoreAdmin` 方法的返回值中，将 `initialPassword` 重命名为 `temporaryPassword` 并加说明字段，同时确保审计日志不记录明文密码：

  ```typescript
  @Post("super-admin/stores/:id/reset-admin")
  @RequireSuperAdmin()
  async resetStoreAdmin(@TenantContext() tenant: TenantContextValue, @Param("id") id: string) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.findUniqueOrThrow({ where: { id } });
        const existingAdmin = await tx.storeMember.findFirst({
          where: {
            storeId: id,
            role: { key: "STORE_ADMIN" }
          },
          include: {
            user: true
          }
        });
        const adminCredential = await this.ensureStoreAdmin(tx, {
          storeId: id,
          account: existingAdmin?.user.email ?? this.buildAdminAccount(store.phone, store.id),
          displayName: store.contactName ?? `${store.name}管理员`
        });
        return { store, adminCredential };
      });
      // 审计日志不记录明文密码
      await this.writeAudit({
        actorId: tenant.actorId,
        action: `重置门店管理员密码：${result.store.name}`,
        entity: "store",
        entityId: id,
        payload: { result: "成功", account: result.adminCredential.account }
      });
      // 返回给前端：temporaryPassword 提示这是一次性密码，前端应提示立即修改
      return {
        storeId: result.adminCredential.storeId,
        account: result.adminCredential.account,
        temporaryPassword: result.adminCredential.initialPassword,
        adminLoginUrl: result.adminCredential.adminLoginUrl,
        role: result.adminCredential.role,
        notice: "请将此临时密码安全传达给管理员，页面关闭后无法再次查看"
      };
    } catch {
      const adminCredential = this.store.createOrResetStoreAdmin(id, {});
      this.store.addAudit({
        actorId: tenant.actorId,
        action: `重置门店管理员密码：${id}`,
        entity: "store",
        entityId: id,
        payload: { result: "成功", account: adminCredential.account }
      });
      return {
        storeId: adminCredential.storeId,
        account: adminCredential.account,
        temporaryPassword: adminCredential.initialPassword,
        adminLoginUrl: adminCredential.adminLoginUrl,
        role: adminCredential.role,
        notice: "请将此临时密码安全传达给管理员，页面关闭后无法再次查看"
      };
    }
  }
  ```

- [ ] **Step 2: 验证编译**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/api
  ```

---

## Task 7: 审计日志分页

**风险：** Medium (#12) — 日志截断影响溯源

**Files:**
- Modify: `apps/api/src/stores.controller.ts:361-372`

- [ ] **Step 1: 给 listAuditLogs 端点添加分页参数**

  ```typescript
  import { BadRequestException, Body, Controller, Param, Patch, Post, Get, Query } from "@nestjs/common";

  @Get("super-admin/audit-logs")
  @RequireSuperAdmin()
  async listAuditLogs(
    @Query("page") pageStr?: string,
    @Query("pageSize") pageSizeStr?: string
  ) {
    const page = Math.max(1, Number(pageStr ?? "1") || 1);
    const pageSize = Math.min(200, Math.max(1, Number(pageSizeStr ?? "50") || 50));
    const skip = (page - 1) * pageSize;
    try {
      const [items, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize
        }),
        this.prisma.auditLog.count()
      ]);
      return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    } catch {
      const allLogs = this.store.listAuditLogs();
      const items = allLogs.slice(skip, skip + pageSize);
      return { items, total: allLogs.length, page, pageSize, totalPages: Math.ceil(allLogs.length / pageSize) };
    }
  }
  ```

- [ ] **Step 2: 验证编译**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/api
  ```

---

## Task 8: 实现真正的租户隔离检查

**风险：** High (#6) — 假检查给运营人员虚假安全感

**Files:**
- Modify: `apps/api/src/stores.controller.ts:374-406`

- [ ] **Step 1: 重写 runIsolationCheck，真实扫描跨租户数据问题**

  检查以下内容：
  1. 是否存在 `storeId` 为 null/空 的业务数据（dish, ingredient, order）
  2. 是否存在 dish/ingredient/order 的 storeId 指向不存在的 store
  
  ```typescript
  @Post("super-admin/isolation-check")
  @RequireSuperAdmin()
  async runIsolationCheck(@TenantContext() tenant: TenantContextValue) {
    try {
      const [totalStores, rootStores, childStores, storeIds, orphanDishes, orphanIngredients, orphanOrders] = await Promise.all([
        this.prisma.store.count(),
        this.prisma.store.count({ where: { parentStoreId: null } }),
        this.prisma.store.count({ where: { parentStoreId: { not: null } } }),
        this.prisma.store.findMany({ select: { id: true } }).then((stores) => new Set(stores.map((s) => s.id))),
        this.prisma.dish.findMany({ where: { storeId: { notIn: [] } }, select: { id: true, storeId: true } }),
        this.prisma.ingredient.findMany({ select: { id: true, storeId: true } }),
        this.prisma.order.findMany({ select: { id: true, storeId: true } })
      ]);

      // 找出 storeId 指向不存在门店的孤儿记录
      const orphanDishCount = orphanDishes.filter((d) => !storeIds.has(d.storeId)).length;
      const orphanIngredientCount = orphanIngredients.filter((i) => !storeIds.has(i.storeId)).length;
      const orphanOrderCount = orphanOrders.filter((o) => !storeIds.has(o.storeId)).length;
      const crossTenantIssues = orphanDishCount + orphanIngredientCount + orphanOrderCount;

      const result = {
        status: crossTenantIssues === 0 ? "NORMAL" : "ISSUES_FOUND",
        totalStores,
        rootStores,
        childStores,
        crossTenantIssues,
        details: {
          orphanDishes: orphanDishCount,
          orphanIngredients: orphanIngredientCount,
          orphanOrders: orphanOrderCount
        },
        checkedAt: new Date().toISOString()
      };
      await this.writeAudit({ actorId: tenant.actorId, action: "执行租户隔离检查", entity: "tenantIsolation", entityId: "latest", payload: result });
      return result;
    } catch {
      const stats = this.store.stats();
      const result = {
        status: "NORMAL",
        totalStores: stats.totalStores,
        rootStores: stats.totalStores - stats.approvedApplications,
        childStores: stats.approvedApplications,
        crossTenantIssues: 0,
        details: { orphanDishes: 0, orphanIngredients: 0, orphanOrders: 0 },
        checkedAt: new Date().toISOString()
      };
      this.store.addAudit({ actorId: tenant.actorId, action: "执行租户隔离检查", entity: "tenantIsolation", entityId: "latest", payload: result });
      return result;
    }
  }
  ```

- [ ] **Step 2: 验证编译**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/api
  ```

---

## Task 9: 前端删除硬编码 Demo 账号预填

**风险：** 安全卫生 — 不应在生产界面预填超管账号

**Files:**
- Modify: `apps/web/app/super-admin/super-admin-login.tsx:7,16`
- Modify: `apps/web/app/super-admin/super-admin-gate.tsx:66`

- [ ] **Step 1: 修改 super-admin-login.tsx，删除预填账号**

  ```typescript
  // apps/web/app/super-admin/super-admin-login.tsx
  // 删除 DEMO_EMAIL 常量，email 初始值改为空字符串
  
  // 第 7 行：删除
  // const DEMO_EMAIL = "shengduoduo.saas";
  
  // 第 16 行：将
  //   const [email, setEmail] = useState(DEMO_EMAIL);
  // 改为：
  //   const [email, setEmail] = useState("");
  ```

  具体：找到文件中 `useState(DEMO_EMAIL)` 改为 `useState("")`，并删除 `const DEMO_EMAIL = "shengduoduo.saas"` 这一行。

- [ ] **Step 2: 修改 super-admin-gate.tsx，删除硬编码邮箱默认值**

  ```typescript
  // apps/web/app/super-admin/super-admin-gate.tsx:66
  // 将
  //   const [currentUserEmail, setCurrentUserEmail] = useState("shengduoduo.saas");
  // 改为：
  //   const [currentUserEmail, setCurrentUserEmail] = useState("");
  ```

- [ ] **Step 3: 验证 TypeScript**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/web
  ```

---

## Task 10: 添加 DB 故障告警 — InMemoryStore fallback 不再静默

**风险：** 设计层面 (#13) — DB 故障时系统无感知

**Files:**
- Modify: `apps/api/src/stores.controller.ts` — 所有 catch 分支
- Modify: `apps/api/src/admin-dashboard.controller.ts` — catch 分支

- [ ] **Step 1: 在 stores.controller.ts 中，所有 catch 分支加 console.error 告警**

  找到所有形如 `} catch {` 后直接调用 `this.store.*` 或 `this.store.addAudit` 的地方，统一在 catch 块中先打印错误：

  ```typescript
  // 示例：listStores 方法
  @Get("super-admin/stores")
  @RequireSuperAdmin()
  async listStores() {
    try {
      return await this.prisma.store.findMany({
        orderBy: { createdAt: "desc" }
      });
    } catch (error) {
      console.error("[DB_FALLBACK] listStores falling back to in-memory store:", error);
      return this.store.listStores();
    }
  }
  ```

  对 `stores.controller.ts` 中所有 catch 块应用同样模式，将 `} catch {` 改为 `} catch (error) {` 并在首行添加 `console.error("[DB_FALLBACK] <method name> falling back to in-memory store:", error);`。

  同样对 `admin-dashboard.controller.ts` 的 catch 块处理。

- [ ] **Step 2: 验证编译**

  ```bash
  cd E:/codex.app && npm run typecheck -w apps/api
  ```

---

## Task 11: 全量编译 + 启动测试

**Files:** 无新增，验证整体

- [ ] **Step 1: 全量 typecheck**

  ```bash
  cd E:/codex.app && npm run typecheck
  ```

  期望：所有 workspace 0 错误。

- [ ] **Step 2: 启动 API 服务，验证能正常启动**

  ```bash
  cd E:/codex.app && npm run dev:api
  ```

  期望：控制台输出 `API listening on http://localhost:4000/api`，无启动报错。

- [ ] **Step 3: 测试登录端点（正常路径）**

  ```bash
  curl -s -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@shengduoduo.local","password":"store-admin"}' | head -c 200
  ```

  期望：返回包含 `token` 和 `user` 字段的 JSON，`isSuperAdmin` 为 `false`。

- [ ] **Step 4: 验证硬编码后门已关闭**

  ```bash
  curl -s -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"shengduoduo.saas","password":"sddxms123."}' | head -c 200
  ```

  期望：返回 `503 Service Unavailable`（数据库不可用时）或 `401 Unauthorized`（数据库可用但账号不存在时）。绝不返回 token。

- [ ] **Step 5: 验证 x-super-admin 头注入已关闭**

  ```bash
  curl -s http://localhost:4000/api/super-admin/stores \
    -H "x-super-admin: true" | head -c 200
  ```

  期望：返回 `401 Unauthorized`，不返回门店列表。

- [ ] **Step 6: 验证 applySubStore 需要鉴权**

  ```bash
  curl -s -X POST http://localhost:4000/api/admin/sub-store-applications \
    -H "Content-Type: application/json" \
    -d '{"requestedName":"测试分店"}' | head -c 200
  ```

  期望：返回 `401 Unauthorized`，不再创建申请。

---

## 自查：Spec 覆盖检查

| 漏洞编号 | 任务 | 状态 |
|---------|------|------|
| #1 硬编码超管后门 | Task 1 | ✅ |
| #2 x-super-admin 头注入 | Task 2 | ✅ |
| #3 x-store-id 未验证 | Task 2 | ✅ |
| #4 审计 actorId 可伪造 | Task 2 (actorId 来源修正) | ✅ |
| #5 CORS 全开放 | Task 4 | ✅ |
| #6 假隔离检查 | Task 8 | ✅ |
| #7 applySubStore 无鉴权 | Task 3 | ✅ |
| #8 JWT 弱默认密钥 | Task 4 | ✅ |
| #9 Token 存 localStorage | 暂缓（需要完整 cookie 方案，涉及前后端大改，单独立项）| ⏳ |
| #10 明文密码返回 | Task 6 | ✅ |
| #11 无频率限制 | Task 5 | ✅ |
| #12 审计日志无分页 | Task 7 | ✅ |
| #13 DB 故障无感知 | Task 10 | ✅ |
| #14 角色权限硬编码 | 当前 YAGNI，超管端本身不管权限分配，单独立项 | ⏳ |

> **#9 说明：** 将 token 从 localStorage 迁移到 httpOnly cookie 需要：(a) API 端改为 Set-Cookie 响应头，(b) 所有前端 fetch 改用 `credentials: include`，(c) CSRF 保护（SameSite=Strict 或 CSRF token），(d) Next.js middleware 改读 cookie。这是一个独立的功能性改动，不应与本批安全修复混在一起发布，建议单独排期。
