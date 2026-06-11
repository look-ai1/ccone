import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import { InMemoryStore } from "./in-memory-store.js";
import { RequirePermissions } from "./auth.decorators.js";
import { TenantContext, type TenantContextValue } from "./tenant-context.js";

const DECIMAL_RE = /^\d+(\.\d{1,3})?$/;

function validateDish(body: { name?: unknown; priceYuan?: unknown; recipeItems?: unknown }) {
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0 || body.name.length > 100) {
    throw new BadRequestException("Invalid dish name");
  }
  if (typeof body.priceYuan !== "string" || !DECIMAL_RE.test(body.priceYuan) || parseFloat(body.priceYuan) <= 0) {
    throw new BadRequestException("Invalid priceYuan: must be a positive decimal string e.g. '28.00'");
  }
  if (!Array.isArray(body.recipeItems)) {
    throw new BadRequestException("recipeItems must be an array");
  }
  for (const item of body.recipeItems as Array<unknown>) {
    const r = item as Record<string, unknown>;
    if (typeof r.ingredientId !== "string" || r.ingredientId.trim().length === 0) {
      throw new BadRequestException("Invalid ingredientId in recipeItems");
    }
    if (typeof r.gramsPerDish !== "string" || !DECIMAL_RE.test(r.gramsPerDish) || parseFloat(r.gramsPerDish) <= 0) {
      throw new BadRequestException("Invalid gramsPerDish: must be a positive decimal string e.g. '250.000'");
    }
  }
}

@Controller()
export class CatalogController {
  constructor(private readonly store: InMemoryStore) {}

  @Get("tablet/dishes")
  tabletDishes(@TenantContext() tenant: TenantContextValue) {
    return this.store.listTabletDishes(tenant.storeId);
  }

  @Get("admin/dishes")
  @RequirePermissions("store:read")
  adminDishes(@TenantContext() tenant: TenantContextValue) {
    return this.store.listDishes(tenant.storeId);
  }

  @Post("admin/dishes")
  @RequirePermissions("dish:write")
  createDish(
    @TenantContext() tenant: TenantContextValue,
    @Body() body: { name: string; priceYuan: string; recipeItems: Array<{ ingredientId: string; gramsPerDish: string }> }
  ) {
    validateDish(body);
    return this.store.createDish(tenant.storeId, body);
  }
}
