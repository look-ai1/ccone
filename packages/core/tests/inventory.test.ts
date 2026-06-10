import { describe, expect, it } from "vitest";
import { confirmOrderWithFifo, refundOrderItem } from "../src/inventory.js";

describe("FIFO inventory", () => {
  it("deducts oldest batches and snapshots yuan costs", () => {
    const result = confirmOrderWithFifo({
      storeId: "store_1",
      orderId: "order_1",
      orderItems: [
        {
          id: "item_1",
          dishId: "dish_1",
          quantity: 2,
          priceYuan: "28.00",
          recipeItems: [{ ingredientId: "pork", gramsPerDish: "300.000" }]
        }
      ],
      stockBatches: [
        {
          id: "batch_old",
          storeId: "store_1",
          ingredientId: "pork",
          receivedAt: "2026-06-01T00:00:00.000Z",
          initialGrams: "500.000",
          remainingGrams: "500.000",
          unitCostYuan: "0.0200"
        },
        {
          id: "batch_new",
          storeId: "store_1",
          ingredientId: "pork",
          receivedAt: "2026-06-02T00:00:00.000Z",
          initialGrams: "500.000",
          remainingGrams: "500.000",
          unitCostYuan: "0.0300"
        }
      ]
    });

    expect(result.updatedBatches.find((batch) => batch.id === "batch_old")?.remainingGrams).toBe("0.000");
    expect(result.updatedBatches.find((batch) => batch.id === "batch_new")?.remainingGrams).toBe("400.000");
    expect(result.totalRevenueYuan).toBe("56.00");
    expect(result.totalCostYuan).toBe("13.00");
    expect(result.consumptions).toHaveLength(2);
  });

  it("restores original batches for unmade refunds", () => {
    const confirmed = confirmOrderWithFifo({
      storeId: "store_1",
      orderId: "order_1",
      orderItems: [
        {
          id: "item_1",
          dishId: "dish_1",
          quantity: 1,
          priceYuan: "28.00",
          recipeItems: [{ ingredientId: "pork", gramsPerDish: "300.000" }]
        }
      ],
      stockBatches: [
        {
          id: "batch_1",
          storeId: "store_1",
          ingredientId: "pork",
          receivedAt: "2026-06-01T00:00:00.000Z",
          initialGrams: "500.000",
          remainingGrams: "500.000",
          unitCostYuan: "0.0200"
        }
      ]
    });

    const refund = refundOrderItem({
      storeId: "store_1",
      refundId: "refund_1",
      orderItemId: "item_1",
      made: false,
      stockBatches: confirmed.updatedBatches,
      consumptions: confirmed.consumptions
    });

    expect(refund.updatedBatches[0].remainingGrams).toBe("500.000");
    expect(refund.restoredCostYuan).toBe("6.00");
    expect(refund.movements[0].type).toBe("refund_restore");
  });

  it("does not restore inventory for made refunds", () => {
    const refund = refundOrderItem({
      storeId: "store_1",
      refundId: "refund_1",
      orderItemId: "item_1",
      made: true,
      stockBatches: [
        {
          id: "batch_1",
          storeId: "store_1",
          ingredientId: "pork",
          receivedAt: "2026-06-01T00:00:00.000Z",
          initialGrams: "500.000",
          remainingGrams: "200.000",
          unitCostYuan: "0.0200"
        }
      ],
      consumptions: []
    });

    expect(refund.updatedBatches[0].remainingGrams).toBe("200.000");
    expect(refund.movements).toHaveLength(0);
  });
});
