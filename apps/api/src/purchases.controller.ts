import { Body, Controller, Post } from "@nestjs/common";
import { InMemoryStore } from "./in-memory-store.js";
import { RequirePermissions } from "./auth.decorators.js";
import { TenantContext, type TenantContextValue } from "./tenant-context.js";

@Controller("admin/purchases")
export class PurchasesController {
  constructor(private readonly store: InMemoryStore) {}

  @Post("ocr")
  @RequirePermissions("inventory:write")
  createOcrDraft(@Body() body: { imageUrl: string }) {
    return {
      status: "DRAFT",
      sourceImageUrl: body.imageUrl,
      message: "OCR provider is not connected yet. Review and submit items to /admin/purchases/confirm."
    };
  }

  @Post("confirm")
  @RequirePermissions("inventory:write")
  confirmPurchase(
    @TenantContext() tenant: TenantContextValue,
    @Body() body: { items: Array<{ ingredientId: string; grams: string; unitCostYuan: string }> }
  ) {
    return this.store.confirmPurchase(tenant.storeId, body);
  }
}
