import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { InMemoryStore } from "./in-memory-store.js";
import { RequirePermissions } from "./auth.decorators.js";
import { TenantContext, type TenantContextValue } from "./tenant-context.js";

@Controller()
export class OrdersController {
  constructor(private readonly store: InMemoryStore) {}

  @Post("tablet/orders/drafts")
  createDraft(
    @TenantContext() tenant: TenantContextValue,
    @Body() body: { tableNo?: string; items: Array<{ dishId: string; quantity: number }> }
  ) {
    return this.store.toTabletOrder(this.store.createDraftOrder(tenant.storeId, body));
  }

  @Post("admin/orders/:id/confirm")
  @RequirePermissions("order:write")
  confirm(@TenantContext() tenant: TenantContextValue, @Param("id") id: string) {
    return this.store.confirmOrder(tenant.storeId, id);
  }

  @Post("admin/order-items/:id/refund")
  @RequirePermissions("order:write")
  refund(
    @TenantContext() tenant: TenantContextValue,
    @Param("id") orderItemId: string,
    @Body() body: { made: boolean; refundYuan: string }
  ) {
    return this.store.refundItem(tenant.storeId, { orderItemId, made: body.made, refundYuan: body.refundYuan });
  }

  @Get("print/jobs")
  @RequirePermissions("order:write")
  printJobs(@TenantContext() tenant: TenantContextValue) {
    return this.store.listPrintJobs(tenant.storeId);
  }
}
