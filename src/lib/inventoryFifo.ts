import type { ProductBatch } from '../types';

export interface FifoConsumeResult {
  newStock: number;
  updatedBatches: ProductBatch[];
  totalCMV: number;
  unitCost: number;
  category: string;
}

function getBatchCreatedAtMs(val: any): number {
  if (!val) return 0;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  const t = new Date(val).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Consume stock de lotes usando método PEPS (FIFO) sin efectos secundarios.
 */
export function consumeProductBatchesFifo(
  prodData: any,
  productId: string,
  requestedQty: number
): FifoConsumeResult {
  const currentStock = Number(prodData?.stock || 0);
  const qty = Math.max(0, Number(requestedQty || 0));
  const newStock = Math.max(0, currentStock - qty);

  const updatedBatches: ProductBatch[] = Array.isArray(prodData?.batches)
    ? prodData.batches.map((b: ProductBatch) => ({ ...b }))
    : [];

  if (updatedBatches.length === 0 && currentStock > 0) {
    updatedBatches.push({
      id: `batch_compat_${String(productId || '').slice(0, 8)}`,
      quantity: currentStock,
      initialQuantity: currentStock,
      unitCost: Number(prodData?.purchasePrice || 0),
      purchasePlace: 'Inventario inicial',
      createdAt: prodData?.createdAt || new Date().toISOString(),
    });
  }

  updatedBatches.sort(
    (a, b) => getBatchCreatedAtMs(a.createdAt) - getBatchCreatedAtMs(b.createdAt)
  );

  let qtyToConsume = qty;
  let totalCMV = 0;

  for (const batch of updatedBatches) {
    if (qtyToConsume <= 0) break;
    if (batch.quantity <= 0) continue;
    const take = Math.min(batch.quantity, qtyToConsume);
    batch.quantity -= take;
    qtyToConsume -= take;
    totalCMV += take * Number(batch.unitCost || 0);
  }

  const unitCost =
    qty > 0
      ? Number((totalCMV / qty).toFixed(2))
      : Number(prodData?.purchasePrice || 0);

  const category =
    String(
      prodData?.category || prodData?.categoryName || prodData?.categoryId || 'Sin categoría'
    ).trim() || 'Sin categoría';

  return {
    newStock,
    updatedBatches,
    totalCMV,
    unitCost,
    category,
  };
}

/**
 * Restaura unidades a lotes PEPS al anular o eliminar una venta,
 * devolviendo primero a los lotes más recientemente consumidos hasta su initialQuantity.
 */
export function restoreProductBatches(
  prodData: any,
  productId: string,
  qtyToRestore: number,
  fallbackIdGenerator: () => string = () => `batch_ret_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
): { newStock: number; updatedBatches: ProductBatch[] } {
  const currentStock = Math.max(0, Number(prodData?.stock || 0));
  const qty = Math.max(0, Number(qtyToRestore || 0));
  const newStock = currentStock + qty;

  const updatedBatches: ProductBatch[] = Array.isArray(prodData?.batches)
    ? prodData.batches.map((b: ProductBatch) => ({ ...b }))
    : [];

  if (qty <= 0) {
    return { newStock, updatedBatches };
  }

  // Orden descendente por fecha para reponer primero las tandas consumidas más recientemente
  const sortedDesc = [...updatedBatches].sort(
    (a, b) => getBatchCreatedAtMs(b.createdAt) - getBatchCreatedAtMs(a.createdAt)
  );

  let remaining = qty;
  for (const batch of sortedDesc) {
    if (remaining <= 0) break;
    const initQty = Number(batch.initialQuantity ?? batch.quantity ?? 0);
    const curQty = Math.max(0, Number(batch.quantity ?? 0));
    const room = Math.max(0, initQty - curQty);
    if (room > 0) {
      const add = Math.min(room, remaining);
      batch.quantity = curQty + add;
      remaining -= add;
    }
  }

  if (remaining > 0) {
    updatedBatches.push({
      id: fallbackIdGenerator(),
      quantity: remaining,
      initialQuantity: remaining,
      unitCost: Number(prodData?.purchasePrice || 0),
      purchasePlace: 'Restitución de stock',
      createdAt: new Date().toISOString(),
    });
  }

  return { newStock, updatedBatches };
}

