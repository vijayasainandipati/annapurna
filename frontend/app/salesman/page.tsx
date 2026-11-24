'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Send, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  AlertCircle,
  RefreshCw,
  Archive,
  Search,
  Check
} from 'lucide-react';
import { api } from '@/lib/api';
import { getOfflineOrders, enqueueOfflineOrder, syncOfflineOrders, QueuedOrder } from '@/lib/offlineQueue';

export default function SalesmanOrderPWA() {
  const queryClient = useQueryClient();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(150);
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
      queryClient.invalidateQueries({ queryKey: ['sales'] });
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

  const murukku = products?.find((p: any) => p.sku === 'MRK-200');
  const selectedCustomer = customers?.find((c: any) => c.id === selectedCustomerId);

  useEffect(() => {
    if (customers && customers.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  const basePrice = murukku ? parseFloat(murukku.base_selling_price) : 50.0;
  const taxableAmount = quantity * basePrice;
  const isIntrastate = selectedCustomer?.state.trim().toUpperCase() === 'TAMIL NADU';
  const cgstAmount = isIntrastate ? taxableAmount * 0.025 : 0;
  const sgstAmount = isIntrastate ? taxableAmount * 0.025 : 0;
  const igstAmount = !isIntrastate ? taxableAmount * 0.05 : 0;
  const totalAmount = taxableAmount + cgstAmount + sgstAmount + igstAmount;

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !murukku) return;

    setIsSubmitting(true);
    setActionNotice(null);

    try {
      const idempotencyKey = `pwa-order-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      if (isOfflineMode) {
        await enqueueOfflineOrder({
          customerId: selectedCustomerId,
          customerName: selectedCustomer?.name || 'Customer',
          productId: murukku.id,
          productName: murukku.name,
          quantity: quantity,
          totalAmount: totalAmount,
          idempotencyKey: idempotencyKey,
          notes: `${notes} (Offline sync queue)`,
        });
        await loadQueue();
        setActionNotice({
          type: 'success',
          message: `Order enqueued in local IndexedDB offline storage. Will sync when reconnected.`
        });
      } else {
        const res = await api.sales.createOrder({
          customer_id: selectedCustomerId,
          items: [{ product_id: murukku.id, quantity }],
          notes: notes,
          idempotency_key: idempotencyKey
        });
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        setActionNotice({
          type: 'success',
          message: `Sales Order ${res.order_number} submitted to factory admin inbox! Total: ₹${parseFloat(res.total_amount).toLocaleString('en-IN')}`
        });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Order Submission Error: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Mobile-first Header */}
      <div className="border-b border-vintage pb-4 flex justify-between items-center">
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

        {/* Offline Toggle */}
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
          <button onClick={() => setActionNotice(null)} className="underline font-semibold ml-4">Dismiss</button>
        </div>
      )}

      {/* Offline Queue Bar */}
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

      {/* Order Entry Form */}
      <form onSubmit={handleOrderSubmit} className="bg-white rounded-lg border border-vintage shadow-xs p-6 space-y-5">
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
                {c.name} — {c.city}, {c.state} ({c.gstin})
              </option>
            ))}
          </select>
        </div>

        {/* Product selection card */}
        <div className="p-3 rounded-lg bg-annapurna-cream-paper border border-vintage flex justify-between items-center">
          <div>
            <div className="text-xs font-bold text-annapurna-ink">Murukku 200g Pouch</div>
            <div className="text-[10px] text-annapurna-ink-muted font-mono">SKU: MRK-200 • HSN: 1905 • GST: 5%</div>
          </div>
          <div className="text-right font-mono font-bold text-annapurna-terracotta text-sm">
            ₹{basePrice.toFixed(2)} <span className="text-[10px] text-annapurna-ink-muted font-normal">/ pkt</span>
          </div>
        </div>

        {/* Quantity Controls */}
        <div>
          <label className="block text-xs font-semibold text-annapurna-ink mb-1.5">
            Order Quantity (Packets)
          </label>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setQuantity(prev => Math.max(10, prev - 20))}
              className="w-10 h-10 rounded-md border border-vintage bg-white hover:bg-annapurna-cream flex items-center justify-center text-annapurna-ink font-bold"
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
              className="flex-1 p-2 text-center text-base font-mono font-bold border border-vintage rounded-md focus:outline-none focus:border-annapurna-terracotta"
            />
            <button
              type="button"
              onClick={() => setQuantity(prev => prev + 20)}
              className="w-10 h-10 rounded-md border border-vintage bg-white hover:bg-annapurna-cream flex items-center justify-center text-annapurna-ink font-bold"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex justify-between pt-1.5 text-[10px] text-annapurna-ink-muted">
            <span>Standard carton size: 20 packets</span>
            <span className="font-mono">{Math.ceil(quantity / 20)} cartons</span>
          </div>
        </div>

        {/* Real-time Order Computation */}
        <div className="p-3 rounded-lg bg-annapurna-cream-paper border border-vintage space-y-1.5 text-xs font-mono">
          <div className="flex justify-between text-annapurna-ink-muted">
            <span>Taxable Amount ({quantity} × ₹{basePrice.toFixed(2)}):</span>
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
            placeholder="e.g. Deliver before 11 AM via Madurai route"
            className="w-full p-2 text-xs border border-vintage rounded-md focus:outline-none focus:border-annapurna-terracotta"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white font-semibold text-xs rounded-md shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
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
  );
}
