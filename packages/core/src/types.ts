export type StoreId = string;
export type IngredientId = string;
export type DishId = string;
export type OrderId = string;
export type OrderItemId = string;

export interface StockBatch {
  id: string;
  storeId: StoreId;
  ingredientId: IngredientId;
  receivedAt: string;
  initialGrams: string;
  remainingGrams: string;
  unitCostYuan: string;
}

export interface RecipeItem {
  ingredientId: IngredientId;
  gramsPerDish: string;
}

export interface OrderItemInput {
  id: OrderItemId;
  dishId: DishId;
  quantity: number;
  priceYuan: string;
  recipeItems: RecipeItem[];
}

export interface ConsumptionLine {
  orderItemId: OrderItemId;
  ingredientId: IngredientId;
  batchId: string;
  grams: string;
  unitCostYuan: string;
  costYuan: string;
}

export interface InventoryMovement {
  storeId: StoreId;
  ingredientId: IngredientId;
  batchId: string;
  type: "sale_deduct" | "refund_restore" | "purchase_in" | "adjustment";
  gramsDelta: string;
  reason: string;
  refId: string;
}

export interface ConfirmOrderResult {
  updatedBatches: StockBatch[];
  consumptions: ConsumptionLine[];
  movements: InventoryMovement[];
  totalCostYuan: string;
  totalRevenueYuan: string;
}

export interface RefundResult {
  updatedBatches: StockBatch[];
  movements: InventoryMovement[];
  restoredCostYuan: string;
}
