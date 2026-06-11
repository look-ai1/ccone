import { BadRequestException, Body, Controller, Param, Patch, Post, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { InMemoryStore } from "./in-memory-store.js";
import { PrismaService } from "./prisma.service.js";
import { hashPassword } from "./security/password.js";
import { RequireSuperAdmin, RequirePermissions } from "./auth.decorators.js";
import { TenantContext, type TenantContextValue } from "./tenant-context.js";

// 超管写操作：60 秒内最多 30 次；读操作：60 秒内最多 120 次
const SUPER_WRITE = { default: { ttl: 60_000, limit: 30 } };
const SUPER_READ  = { default: { ttl: 60_000, limit: 120 } };

@Controller()
export class StoresController {
  constructor(
    private readonly store: InMemoryStore,
    private readonly prisma: PrismaService
  ) {}

  private async writeAudit(input: { storeId?: string; actorId?: string; action: string; entity: string; entityId: string; payload?: unknown }) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          storeId: input.storeId,
          actorId: input.actorId ?? "shengduoduo.saas",
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          payload: input.payload === undefined ? undefined : (input.payload as Prisma.InputJsonValue)
        }
      });
    } catch {
      return this.store.addAudit({ ...input, actorId: input.actorId ?? "shengduoduo.saas" });
    }
  }

  private generateInitialPassword() {
    return `Sdd@${randomBytes(4).toString("hex")}`;
  }

  private buildAdminAccount(phone: string | undefined | null, storeId: string) {
    const digits = phone?.replace(/\D/g, "");
    if (digits && digits.length >= 6) return digits;
    return `admin-${storeId.replace(/[^a-zA-Z0-9]/g, "").slice(-10)}@shengduoduo.local`;
  }

  private async ensureStoreAdmin(
    tx: Prisma.TransactionClient,
    input: { storeId: string; account?: string | null; displayName?: string | null; initialPassword?: string }
  ) {
    const role = await tx.role.upsert({
      where: { key: "STORE_ADMIN" },
      update: {
        permissions: ["auth:read", "store:read", "dish:write", "order:write", "inventory:write", "report:read"]
      },
      create: {
        key: "STORE_ADMIN",
        name: "门店管理员",
        permissions: ["auth:read", "store:read", "dish:write", "order:write", "inventory:write", "report:read"]
      }
    });
    const initialPassword = input.initialPassword ?? this.generateInitialPassword();
    const account = input.account ?? this.buildAdminAccount(null, input.storeId);
    const user = await tx.user.upsert({
      where: { email: account },
      update: {
        displayName: input.displayName ?? "门店管理员",
        passwordHash: hashPassword(initialPassword),
        isSuperAdmin: false
      },
      create: {
        email: account,
        displayName: input.displayName ?? "门店管理员",
        passwordHash: hashPassword(initialPassword),
        isSuperAdmin: false
      }
    });
    await tx.storeMember.upsert({
      where: {
        storeId_userId: {
          storeId: input.storeId,
          userId: user.id
        }
      },
      update: { roleId: role.id },
      create: {
        storeId: input.storeId,
        userId: user.id,
        roleId: role.id
      }
    });

    return {
      storeId: input.storeId,
      account,
      initialPassword,
      adminLoginUrl: "/admin",
      role: "STORE_ADMIN" as const
    };
  }

  @Get("super-admin/stores")
  @RequireSuperAdmin()
  @Throttle(SUPER_READ)
  async listStores() {
    try {
      return await this.prisma.store.findMany({
        orderBy: { createdAt: "desc" }
      });
    } catch (error) {
      console.error("[DB_FALLBACK] listStores:", (error as NodeJS.ErrnoException).code ?? "unknown");
      return this.store.listStores();
    }
  }

  @Get("super-admin/stats")
  @RequireSuperAdmin()
  @Throttle(SUPER_READ)
  async stats() {
    try {
      const [totalStores, activeStores, suspendedStores, pendingApplications, approvedApplications, rejectedApplications] = await Promise.all([
        this.prisma.store.count(),
        this.prisma.store.count({ where: { status: "ACTIVE" } }),
        this.prisma.store.count({ where: { status: "SUSPENDED" } }),
        this.prisma.storeApplication.count({ where: { status: "PENDING" } }),
        this.prisma.storeApplication.count({ where: { status: "APPROVED" } }),
        this.prisma.storeApplication.count({ where: { status: "REJECTED" } })
      ]);
      return { totalStores, activeStores, suspendedStores, pendingApplications, approvedApplications, rejectedApplications };
    } catch (error) {
      console.error("[DB_FALLBACK] stats:", (error as NodeJS.ErrnoException).code ?? "unknown");
      return this.store.stats();
    }
  }

  @Post("super-admin/stores")
  @RequireSuperAdmin()
  @Throttle(SUPER_WRITE)
  async createStore(@TenantContext() tenant: TenantContextValue, @Body() body: { name: string; parentStoreId?: string; contactName?: string; phone?: string }) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            name: body.name,
            parentStoreId: body.parentStoreId,
            contactName: body.contactName,
            phone: body.phone
          }
        });
        const adminCredential = await this.ensureStoreAdmin(tx, {
          storeId: store.id,
          account: this.buildAdminAccount(body.phone, store.id),
          displayName: body.contactName ?? `${body.name}管理员`
        });
        return { store, adminCredential };
      });
      await this.writeAudit({
        actorId: tenant.actorId,
        action: `新增门店并生成管理员账号：${result.store.name}`,
        entity: "store",
        entityId: result.store.id,
        payload: { result: "成功", account: result.adminCredential.account }
      });
      return result;
    } catch (error) {
      console.error("[DB_FALLBACK] createStore:", (error as NodeJS.ErrnoException).code ?? "unknown");
      const result = this.store.createStoreWithAdmin(body.name, body.parentStoreId, { contactName: body.contactName, phone: body.phone });
      this.store.addAudit({
        actorId: tenant.actorId,
        action: `新增门店并生成管理员账号：${result.store.name}`,
        entity: "store",
        entityId: result.store.id,
        payload: { result: "成功", account: result.adminCredential.account }
      });
      return result;
    }
  }

  @Patch("super-admin/stores/:id")
  @RequireSuperAdmin()
  @Throttle(SUPER_WRITE)
  async updateStore(@TenantContext() tenant: TenantContextValue, @Param("id") id: string, @Body() body: { name?: string; contactName?: string; phone?: string; status?: "ACTIVE" | "SUSPENDED" }) {
    try {
      const updated = await this.prisma.store.update({
        where: { id },
        data: {
          name: body.name,
          contactName: body.contactName,
          phone: body.phone,
          status: body.status
        }
      });
      await this.writeAudit({ actorId: tenant.actorId, action: `更新门店：${updated.name}`, entity: "store", entityId: updated.id, payload: { result: "成功", status: updated.status } });
      return updated;
    } catch (error) {
      console.error("[DB_FALLBACK] updateStore:", (error as NodeJS.ErrnoException).code ?? "unknown");
      const updated = this.store.updateStore(id, body);
      this.store.addAudit({ actorId: tenant.actorId, action: `更新门店：${updated.name}`, entity: "store", entityId: updated.id, payload: { result: "成功", status: updated.status } });
      return updated;
    }
  }

  @Patch("super-admin/stores/:id/suspend")
  @RequireSuperAdmin()
  @Throttle(SUPER_WRITE)
  async suspendStore(@TenantContext() tenant: TenantContextValue, @Param("id") id: string) {
    try {
      const suspended = await this.prisma.store.update({
        where: { id },
        data: { status: "SUSPENDED" }
      });
      await this.writeAudit({ actorId: tenant.actorId, action: `停用门店：${suspended.name}`, entity: "store", entityId: suspended.id, payload: { result: "成功" } });
      return suspended;
    } catch (error) {
      console.error("[DB_FALLBACK] suspendStore:", (error as NodeJS.ErrnoException).code ?? "unknown");
      const suspended = this.store.suspendStore(id);
      this.store.addAudit({ actorId: tenant.actorId, action: `停用门店：${suspended.name}`, entity: "store", entityId: suspended.id, payload: { result: "成功" } });
      return suspended;
    }
  }

  @Post("super-admin/stores/:id/reset-admin")
  @RequireSuperAdmin()
  @Throttle(SUPER_WRITE)
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
      await this.writeAudit({
        actorId: tenant.actorId,
        action: `重置门店管理员密码：${result.store.name}`,
        entity: "store",
        entityId: id,
        payload: { result: "成功", account: result.adminCredential.account }
      });
      return {
        storeId: result.adminCredential.storeId,
        account: result.adminCredential.account,
        temporaryPassword: result.adminCredential.initialPassword,
        adminLoginUrl: result.adminCredential.adminLoginUrl,
        role: result.adminCredential.role,
        notice: "请将此临时密码安全传达给管理员，页面关闭后无法再次查看"
      };
    } catch (error) {
      console.error("[DB_FALLBACK] resetStoreAdmin:", (error as NodeJS.ErrnoException).code ?? "unknown");
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

  @Post("admin/sub-store-applications")
  @RequirePermissions("store:read")
  async applySubStore(@TenantContext() tenant: TenantContextValue, @Body() body: { requestedName: string; applicantName?: string; applicantPhone?: string; reason?: string }) {
    try {
      const application = await this.prisma.storeApplication.create({
        data: {
          requesterStoreId: tenant.storeId,
          requestedName: body.requestedName,
          applicantName: body.applicantName,
          applicantPhone: body.applicantPhone,
          reason: body.reason
        }
      });
      await this.writeAudit({ storeId: tenant.storeId, actorId: tenant.actorId, action: `提交子门店申请：${application.requestedName}`, entity: "storeApplication", entityId: application.id, payload: { result: "成功" } });
      return application;
    } catch (error) {
      console.error("[DB_FALLBACK] applySubStore:", (error as NodeJS.ErrnoException).code ?? "unknown");
      const application = this.store.applySubStore(tenant.storeId, body.requestedName, { applicantName: body.applicantName, applicantPhone: body.applicantPhone, reason: body.reason });
      this.store.addAudit({ storeId: tenant.storeId, actorId: tenant.actorId, action: `提交子门店申请：${application.requestedName}`, entity: "storeApplication", entityId: application.id, payload: { result: "成功" } });
      return application;
    }
  }

  @Get("super-admin/sub-store-applications")
  @RequireSuperAdmin()
  @Throttle(SUPER_READ)
  async listApplications() {
    try {
      return await this.prisma.storeApplication.findMany({
        include: { requesterStore: true },
        orderBy: { createdAt: "desc" }
      });
    } catch (error) {
      console.error("[DB_FALLBACK] listApplications:", (error as NodeJS.ErrnoException).code ?? "unknown");
      return this.store.listApplications();
    }
  }

  @Post("super-admin/sub-store-applications/:id/approve")
  @RequireSuperAdmin()
  @Throttle(SUPER_WRITE)
  async approveApplication(@TenantContext() tenant: TenantContextValue, @Param("id") id: string) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const application = await tx.storeApplication.findUniqueOrThrow({
          where: { id }
        });
        if (application.status !== "PENDING") {
          throw new BadRequestException("Application already decided");
        }
        const approvedStore = await tx.store.create({
          data: {
            name: application.requestedName,
            parentStoreId: application.requesterStoreId,
            contactName: application.applicantName,
            phone: application.applicantPhone ?? "待补充"
          }
        });
        const adminCredential = await this.ensureStoreAdmin(tx, {
          storeId: approvedStore.id,
          account: this.buildAdminAccount(application.applicantPhone, approvedStore.id),
          displayName: application.applicantName ?? `${application.requestedName}管理员`
        });
        const approvedApplication = await tx.storeApplication.update({
          where: { id },
          data: {
            status: "APPROVED",
            approvedStoreId: approvedStore.id,
            decidedAt: new Date()
          }
        });
        return { application: approvedApplication, store: approvedStore, adminCredential };
      });
      await this.writeAudit({
        actorId: tenant.actorId,
        action: `通过子门店申请并生成管理员账号：${result.application.requestedName}`,
        entity: "storeApplication",
        entityId: id,
        payload: { result: "成功", approvedStoreId: result.store.id, account: result.adminCredential.account }
      });
      return result;
    } catch (error) {
      console.error("[DB_FALLBACK] approveApplication:", (error as NodeJS.ErrnoException).code ?? "unknown");
      const result = this.store.approveApplication(id);
      this.store.addAudit({
        actorId: tenant.actorId,
        action: `通过子门店申请并生成管理员账号：${result.application.requestedName}`,
        entity: "storeApplication",
        entityId: id,
        payload: { result: "成功", approvedStoreId: result.store.id, account: result.adminCredential.account }
      });
      return result;
    }
  }

  @Post("super-admin/sub-store-applications/:id/reject")
  @RequireSuperAdmin()
  @Throttle(SUPER_WRITE)
  async rejectApplication(@TenantContext() tenant: TenantContextValue, @Param("id") id: string) {
    try {
      const rejected = await this.prisma.storeApplication.update({
        where: { id },
        data: {
          status: "REJECTED",
          decidedAt: new Date()
        }
      });
      await this.writeAudit({ actorId: tenant.actorId, action: `拒绝子门店申请：${rejected.requestedName}`, entity: "storeApplication", entityId: id, payload: { result: "成功" } });
      return rejected;
    } catch (error) {
      console.error("[DB_FALLBACK] rejectApplication:", (error as NodeJS.ErrnoException).code ?? "unknown");
      const rejected = this.store.rejectApplication(id);
      this.store.addAudit({ actorId: tenant.actorId, action: `拒绝子门店申请：${rejected.requestedName}`, entity: "storeApplication", entityId: id, payload: { result: "成功" } });
      return rejected;
    }
  }

  @Get("super-admin/audit-logs")
  @RequireSuperAdmin()
  @Throttle(SUPER_READ)
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
    } catch (error) {
      console.error("[DB_FALLBACK] listAuditLogs:", (error as NodeJS.ErrnoException).code ?? "unknown");
      const allLogs = this.store.listAuditLogs();
      const items = allLogs.slice(skip, skip + pageSize);
      return { items, total: allLogs.length, page, pageSize, totalPages: Math.ceil(allLogs.length / pageSize) };
    }
  }

  @Post("super-admin/isolation-check")
  @RequireSuperAdmin()
  @Throttle(SUPER_WRITE)
  async runIsolationCheck(@TenantContext() tenant: TenantContextValue) {
    try {
      const [totalStores, rootStores, childStores, allStores, orphanDishes, orphanIngredients, orphanOrders] = await Promise.all([
        this.prisma.store.count(),
        this.prisma.store.count({ where: { parentStoreId: null } }),
        this.prisma.store.count({ where: { parentStoreId: { not: null } } }),
        this.prisma.store.findMany({ select: { id: true } }),
        this.prisma.dish.findMany({ select: { id: true, storeId: true } }),
        this.prisma.ingredient.findMany({ select: { id: true, storeId: true } }),
        this.prisma.order.findMany({ select: { id: true, storeId: true } })
      ]);

      const storeIds = new Set(allStores.map((s) => s.id));
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
    } catch (error) {
      console.error("[DB_FALLBACK] runIsolationCheck:", (error as NodeJS.ErrnoException).code ?? "unknown");
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

  @Get("super-admin/system-configs")
  @RequireSuperAdmin()
  @Throttle(SUPER_READ)
  async listSystemConfigs() {
    try {
      return await this.prisma.systemConfig.findMany({
        orderBy: { key: "asc" }
      });
    } catch (error) {
      console.error("[DB_FALLBACK] listSystemConfigs:", (error as NodeJS.ErrnoException).code ?? "unknown");
      return this.store.listSystemConfigs();
    }
  }

  @Patch("super-admin/system-configs/:key")
  @RequireSuperAdmin()
  @Throttle(SUPER_WRITE)
  async updateSystemConfig(@TenantContext() tenant: TenantContextValue, @Param("key") key: string, @Body() body: { value?: unknown }) {
    if (body.value === undefined) {
      throw new BadRequestException("Missing config value");
    }
    try {
      const config = await this.prisma.systemConfig.upsert({
        where: { key },
        update: { value: body.value as Prisma.InputJsonValue },
        create: { key, value: body.value as Prisma.InputJsonValue }
      });
      await this.writeAudit({ actorId: tenant.actorId, action: `保存系统配置：${key}`, entity: "systemConfig", entityId: key, payload: { result: "成功" } });
      return config;
    } catch (error) {
      console.error("[DB_FALLBACK] updateSystemConfig:", (error as NodeJS.ErrnoException).code ?? "unknown");
      const config = this.store.updateSystemConfig(key, body.value);
      this.store.addAudit({ actorId: tenant.actorId, action: `保存系统配置：${key}`, entity: "systemConfig", entityId: key, payload: { result: "成功" } });
      return config;
    }
  }
}
