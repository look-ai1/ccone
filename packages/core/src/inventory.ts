import { Decimal } from "decimal.js";
import { addMoney, multiplyMoney, yuan2 } from "./money.js";
import type {
  ConfirmOrderResult,
  ConsumptionLine,
  InventoryMovement,
  OrderItemInput,
  RefundResult,
  StockBatch,
  StoreId
} from "./types.js";

export class InventoryError extends Error {}

export function confirmOrderWithFifo(input: {
  storeId: StoreId;
  orderId: string;
  orderItems: OrderItemInput[];
  stockBatches: StockBatch[];
}): ConfirmOrderResult {
  const batches = input.stockBatches
    .filter((batch) => batch.storeId === input.storeId)
    .map((batch) => ({ ...batch }))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));

  const consumptions: ConsumptionLine[] = [];
  const movements: InventoryMovement[] = [];

  for (const orderItem of input.orderItems) {
    if (!Number.isInteger(orderItem.quantity) || orderItem.quantity <= 0) {
      throw new InventoryError(`Invalid quantity for order item ${orderItem.id}`);
    }

    for (const recipe of orderItem.recipeItems) {
      let required = new Decimal(recipe.gramsPerDish).mul(orderItem.quantity);
      const available = batches
        .filter((batch) => batch.ingredientId === recipe.ingredientId)
        .reduce((sum, batch) => sum.plus(batch.remainingGrams), new Decimal(0));

      if (available.lt(required)) {
        throw new InventoryError(
          `Insufficient inventory for ingredient ${recipe.ingredientId}: required ${required.toString()}g, available ${available.toString()}g`
        );
      }

      for (const batch of batches) {
        if (required.lte(0)) {
          break;
        }
        if (batch.ingredientId !== recipe.ingredientId) {
          continue;
        }

        const remaining = new Decimal(batch.remainingGrams);
        if (remaining.lte(0)) {
          continue;
        }

        const deducted = Decimal.min(remaining, required).toDecimalPlaces(3);
        batch.remainingGrams = remaining.minus(deducted).toDecimalPlaces(3).toFixed(3);
        required = required.minus(deducted);

        const cost = multiplyMoney(batch.unitCostYuan, deducted);
        consumptions.push({
          orderItemId: orderItem.id,
          ingredientId: recipe.ingredientId,
          batchId: batch.id,
          grams: deducted.toFixed(3),
          unitCostYuan: batch.unitCostYuan,
          costYuan: cost.toFixed(4)
        });
        movements.push({
          storeId: input.storeId,
          ingredientId: recipe.ingredientId,
          batchId: batch.id,
          type: "sale_deduct",
          gramsDelta: deducted.negated().toFixed(3),
          reason: "order_confirmed",
          refId: input.orderId
        });
      }
    }
  }

  const totalRevenue = input.orderItems.reduce(
    (sum, item) => sum.plus(new Decimal(item.priceYuan).mul(item.quantity)),
    new Decimal(0)
  );
  const totalCost = addMoney(consumptions.map((line) => line.costYuan));

  return {
    updatedBatches: batches,
    consumptions,
    movements,
    totalCostYuan: yuan2(totalCost),
    totalRevenueYuan: yuan2(totalRevenue)
  };
}

export function refundOrderItem(input: {
  storeId: StoreId;
  refundId: string;
  orderItemId: string;
  made: boolean;
  stockBatches: StockBatch[];
  consumptions: ConsumptionLine[];
}): RefundResult {
  const batches = input.stockBatches.map((batch) => ({ ...batch }));
  if (input.made) {
    return { updatedBatches: batches, movements: [], restoredCostYuan: "0.00" };
  }

  const movements: InventoryMovement[] = [];
  const matching = input.consumptions.filter((line) => line.orderItemId === input.orderItemId);

  for (const consumption of matching) {
    const batch = batches.find((candidate) => candidate.id === consumption.batchId);
    if (!batch || batch.storeId !== input.storeId) {
      throw new InventoryError(`Cannot restore missing batch ${consumption.batchId}`);
    }

    batch.remainingGrams = new Decimal(batch.remainingGrams)
      .plus(consumption.grams)
      .toDecimalPlaces(3)
      .toFixed(3);
    movements.push({
      storeId: input.storeId,
      ingredientId: consumption.ingredientId,
      batchId: consumption.batchId,
      type: "refund_restore",
      gramsDelta: new Decimal(consumption.grams).toDecimalPlaces(3).toFixed(3),
      reason: "unmade_item_refund",
      refId: input.refundId
    });
  }

  const restoredCost = addMoney(matching.map((line) => line.costYuan));
  return {
    updatedBatches: batches,
    movements,
    restoredCostYuan: yuan2(restoredCost)
  };
}
