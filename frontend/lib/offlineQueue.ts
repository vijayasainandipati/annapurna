import { get, set, del } from 'idb-keyval';
import { api } from './api';

const OFFLINE_QUEUE_KEY = 'annapurna_offline_orders';

export interface QueuedOrder {
  id: string; // client UUID
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  quantity: number;
  totalAmount: number;
  idempotencyKey: string;
  notes?: string;
  createdAt: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  error?: string;
}

export async function getOfflineOrders(): Promise<QueuedOrder[]> {
  const queue = await get<QueuedOrder[]>(OFFLINE_QUEUE_KEY);
  return queue || [];
}

export async function enqueueOfflineOrder(order: Omit<QueuedOrder, 'id' | 'createdAt' | 'status'>): Promise<QueuedOrder> {
  const queue = await getOfflineOrders();
  const newOrder: QueuedOrder = {
    ...order,
    id: `offline-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    status: 'PENDING'
  };
  queue.push(newOrder);
  await set(OFFLINE_QUEUE_KEY, queue);
  return newOrder;
}

export async function syncOfflineOrders(): Promise<{ synced: number; failed: number }> {
  const queue = await getOfflineOrders();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let syncedCount = 0;
  let failedCount = 0;
  const remainingQueue: QueuedOrder[] = [];

  for (const order of queue) {
    try {
      await api.sales.createOrder({
        customer_id: order.customerId,
        items: [
          {
            product_id: order.productId,
            quantity: order.quantity
          }
        ],
        idempotency_key: order.idempotencyKey,
        notes: order.notes ? `[Synced from Offline] ${order.notes}` : '[Synced from Offline]'
      });
      syncedCount++;
    } catch (err: any) {
      // If error indicates already processed via idempotency, consider it synced
      if (err.message && err.message.includes('idempotency')) {
        syncedCount++;
      } else {
        failedCount++;
        remainingQueue.push({ ...order, status: 'FAILED', error: err.message });
      }
    }
  }

  await set(OFFLINE_QUEUE_KEY, remainingQueue);
  return { synced: syncedCount, failed: failedCount };
}
