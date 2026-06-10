import { Controller, Get } from "@nestjs/common";
import { InMemoryStore } from "./in-memory-store.js";
import { RequirePermissions } from "./auth.decorators.js";
import { TenantContext, type TenantContextValue } from "./tenant-context.js";

@Controller("admin/reports")
export class ReportsController {
  constructor(private readonly store: InMemoryStore) {}

  @Get("gross-profit")
  @RequirePermissions("report:read")
  grossProfit(@TenantContext() tenant: TenantContextValue) {
    return this.store.report(tenant.storeId);
  }
}
