'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Minus, 
  Send, 
  Wifi, 
  WifiOff, 
  Clock, 
  RefreshCw,
  Trash2
} from 'lucide-react';
import { api } from '@/lib/api';
import { getOfflineOrders, enqueueOfflineOrder, syncOfflineOrders, QueuedOrder } from '@/lib/offlineQueue';

export default function SalesmanOrderPWA() {
  const queryClient = useQueryClient();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(100);
  const [cart, setCart] = useState<Array<{ product: any; quantity: number }>>([]);
  const [notes, setNotes] = useState<string>('Standard distributor dispatch order');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [offlineQueue, setOfflineQueue] = useState<QueuedOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadQueue = async () => {
    try {
      const q = await getOfflineOrders();
      setOfflineQueue(q);
    } catch {}
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleSyncQueue = async () => {
    setIsSyncing(true);
    try {
      const res = await syncOfflineOrders();
      await loadQueue();
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
      setActionNotice({
        type: 'success',
        message: `Offline synchronization completed: ${res.synced} orders posted to factory ledger (${res.failed} failed).`
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Sync Error: ${err.message}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const { data: customers } = useQuery({
    queryKey: ['masters', 'customers'],
    queryFn: () => api.masters.getCustomers(),
  });

  const { data: products } = useQuery({
    queryKey: ['masters', 'products'],
    queryFn: () => api.masters.getProducts(),
  });

  const { data: recentOrders } = useQuery({
    queryKey: ['sales', 'orders'],
    queryFn: () => api.sales.getOrders(),
  });

  useEffect(() => {
    if (customers && customers.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (products && products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  const selectedCustomer = customers?.find((c: any) => c.id === selectedCustomerId);
  const selectedProduct = products?.find((p: any) => p.id === selectedProductId);

  const effectiveItems = cart.length > 0
    ? cart
    : selectedProduct
      ? [{ product: selectedProduct, quantity }]
      : [];

  const handleAddLine = () => {
    if (!selectedProduct || quantity <= 0) return;
    setCart(prev => {
      const idx = prev.findIndex(item => item.product.id === selectedProduct.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { product: selectedProduct, quantity: next[idx].quantity + quantity };
        return next;
      }
      return [...prev, { product: selectedProduct, quantity }];
    });
  };

  const handleRemoveLine = (prodId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== prodId));
  };

  const taxableAmount = effectiveItems.reduce(
    (sum, it) => sum + it.quantity * parseFloat(it.product.base_selling_price),
    0
  );
  const isIntrastate = selectedCustomer?.state?.trim().toUpperCase() === 'TAMIL NADU';
  const cgstAmount = isIntrastate ? taxableAmount * 0.025 : 0;
  const sgstAmount = isIntrastate ? taxableAmount * 0.025 : 0;
  const igstAmount = !isIntrastate ? taxableAmount * 0.05 : 0;
  const totalAmount = taxableAmount + cgstAmount + sgstAmount + igstAmount;

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || effectiveItems.length === 0) return;

    setIsSubmitting(true);
    setActionNotice(null);

    try {
      const idempotencyKey = `pwa-order-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const primary = effectiveItems[0];

      if (isOfflineMode) {
        await enqueueOfflineOrder({
          customerId: selectedCustomerId,
          customerName: selectedCustomer?.business_name || 'Customer',
          productId: primary.product.id,
          productName: primary.product.name,
          quantity: primary.quantity,
          totalAmount: totalAmount,
          idempotencyKey: idempotencyKey,
          notes: `${notes} (Offline sync queue)`,
        });
        await loadQueue();
        setCart([]);
        setActionNotice({
          type: 'success',
          message: `Order enqueued in local IndexedDB offline storage. Will sync when reconnected.`
        });
      } else {
        const res = await api.sales.createOrder({
          customer_id: selectedCustomerId,
          items: effectiveItems.map(it => ({ product_id: it.product.id, quantity: it.quantity })),
          notes: notes,
          idempotency_key: idempotencyKey
        });
        await queryClient.invalidateQueries({ queryKey: ['sales'] });
        setCart([]);
        setActionNotice({
          type: 'success',
          message: `Sales Order ${res.order_number} submitted to factory admin inbox! Total: ₹${parseFloat(res.total_order_amount).toLocaleString('en-IN')}`
        });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Order Submission Error: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Mobile-first Rapid Order Entry */}
      <div className="space-y-4">
        <div className="border-b border-vintage pb-3 flex justify-between items-center">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-serif font-bold text-annapurna-ink">Field Sales Order Entry</h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
                SALESMAN PWA
              </span>
            </div>
            <p className="text-xs text-annapurna-ink-muted mt-0.5">
              Rapid mobile ordering (&lt; 45s flow) • Automated GST Split • Offline Sync
            </p>
          </div>

          <button
            onClick={() => setIsOfflineMode(prev => !prev)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md border flex items-center space-x-1.5 transition-colors ${
              isOfflineMode
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            {isOfflineMode ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
            <span>{isOfflineMode ? 'Offline Mode' : 'Online'}</span>
          </button>
        </div>

        {actionNotice && (
          <div className={`p-3 rounded-lg text-xs font-medium border flex justify-between items-center ${
            actionNotice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <span>{actionNotice.message}</span>
            <button onClick={() => setActionNotice(null)} className="underline font-semibold ml-4 shrink-0">Dismiss</button>
          </div>
        )}

        {offlineQueue.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex justify-between items-center text-xs">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-amber-700" />
              <span className="text-amber-800 font-medium">
                {offlineQueue.length} pending offline orders in device memory
              </span>
            </div>
            <button
              onClick={handleSyncQueue}
              disabled={isSyncing}
              className="px-2.5 py-1 bg-amber-700 text-white font-semibold rounded hover:bg-amber-800 flex items-center space-x-1"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync to Plant'}</span>
            </button>
          </div>
        )}

        <form onSubmit={handleOrderSubmit} className="bg-white rounded-lg border border-vintage shadow-xs p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-annapurna-ink mb-1">
              Distributor / Retail Customer
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              required
              className="w-full p-2.5 text-xs bg-annapurna-cream-paper border border-vintage rounded-md text-annapurna-ink font-medium focus:outline-none focus:border-annapurna-terracotta"
            >
              {customers?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.business_name} — {c.state} ({c.gstin || 'URP'})
                </option>
              ))}
            </select>
          </div>

          {/* Product Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-annapurna-ink mb-1">Select Product SKU</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full p-2 text-xs bg-annapurna-cream-paper border border-vintage rounded-md font-medium text-annapurna-ink"
              >
                {products?.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} (₹{parseFloat(p.base_selling_price).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-annapurna-ink mb-1">
                Quantity (Packets)
              </label>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setQuantity(prev => Math.max(10, prev - 20))}
                  className="w-8 h-8 rounded border border-vintage bg-white hover:bg-annapurna-cream flex items-center justify-center text-annapurna-ink"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-20 p-1.5 text-center text-xs font-mono font-bold border border-vintage rounded"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(prev => prev + 20)}
                  className="w-8 h-8 rounded border border-vintage bg-white hover:bg-annapurna-cream flex items-center justify-center text-annapurna-ink"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="px-2.5 h-8 text-[11px] font-semibold rounded bg-annapurna-cream hover:bg-annapurna-cream-border/50 border border-vintage text-annapurna-terracotta"
                >
                  + Add Line
                </button>
              </div>
            </div>
          </div>

          {/* Multi-SKU Order Basket */}
          {cart.length > 0 && (
            <div className="rounded border border-vintage bg-annapurna-cream-paper divide-y divide-vintage text-xs">
              {cart.map(item => (
                <div key={item.product.id} className="p-2 flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-annapurna-ink">{item.product.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-annapurna-ink-muted">
                      {item.quantity} pkts × ₹{parseFloat(item.product.base_selling_price).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold">
                      ₹{(item.quantity * parseFloat(item.product.base_selling_price)).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(item.product.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Real-time Order Computation */}
          <div className="p-3 rounded-lg bg-annapurna-cream-paper border border-vintage space-y-1 text-xs font-mono">
            <div className="flex justify-between text-annapurna-ink-muted">
              <span>Taxable Value ({effectiveItems.reduce((s, i) => s + i.quantity, 0)} pkts):</span>
              <span>₹{taxableAmount.toFixed(2)}</span>
            </div>
            {isIntrastate ? (
              <>
                <div className="flex justify-between text-annapurna-ink-muted">
                  <span>CGST (2.5% Intra-state):</span>
                  <span>₹{cgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-annapurna-ink-muted">
                  <span>SGST (2.5% Intra-state):</span>
                  <span>₹{sgstAmount.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-annapurna-ink-muted">
                <span>IGST (5.0% Inter-state):</span>
                <span>₹{igstAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-annapurna-ink pt-1.5 border-t border-vintage">
              <span>Grand Total:</span>
              <span>₹{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-annapurna-ink mb-1">
              Dispatch Instructions / Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 text-xs border border-vintage rounded-md focus:outline-none focus:border-annapurna-terracotta"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || effectiveItems.length === 0}
            className="w-full py-2.5 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white font-semibold text-xs rounded-md shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isSubmitting ? <span>Transmitting to Factory...</span> : (
              <>
                <Send className="w-4 h-4" />
                <span>{isOfflineMode ? 'Queue Order Locally' : 'Submit Sales Order to Plant'}</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Right Column: Price List & Salesman Order History */}
      <div className="space-y-4">
        <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Active Wholesale Price List</h2>
            <span className="text-[10px] font-mono text-annapurna-ink-muted">{products?.length || 0} SKUs • 5% GST</span>
          </div>
          <div className="divide-y divide-vintage text-xs">
            {products?.map((p: any) => (
              <div key={p.id} className="px-4 py-2 flex justify-between items-center">
                <div>
                  <span className="font-semibold text-annapurna-ink">{p.name}</span>
                  <span className="ml-2 font-mono text-[10px] text-annapurna-ink-muted">{p.sku} • HSN {p.hsn_code}</span>
                </div>
                <span className="font-mono font-bold text-annapurna-terracotta">
                  ₹{parseFloat(p.base_selling_price).toFixed(2)}/pkt
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Recent Booked Orders</h2>
            <span className="text-[10px] font-mono text-annapurna-ink-muted">{recentOrders?.length || 0} orders</span>
          </div>
          <div className="divide-y divide-vintage max-h-[340px] overflow-y-auto text-xs">
            {recentOrders && recentOrders.length > 0 ? (
              recentOrders.map((o: any) => (
                <div key={o.id} className="px-4 py-2.5 flex justify-between items-center">
                  <div>
                    <div className="font-mono font-semibold text-annapurna-ink">{o.order_number}</div>
                    <div className="text-[11px] text-annapurna-ink-muted">{o.customer_name}</div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <div className="font-mono font-bold text-annapurna-ink">
                      ₹{parseFloat(o.total_order_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-annapurna-cream text-annapurna-terracotta border border-vintage">
                      {o.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-annapurna-ink-muted">No orders booked yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
