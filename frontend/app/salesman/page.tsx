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
  Archive
} from 'lucide-react';
import { api } from '@/lib/api';
import { getOfflineOrders, enqueueOfflineOrder, syncOfflineOrders, QueuedOrder } from '@/lib/offlineQueue';

export default function SalesmanOrderPWA() {
  const queryClient = useQueryClient();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(150);
  const [notes, setNotes] = useState<string>('Benchmark Sales Order');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [offlineQueue, setOfflineQueue] = useState<QueuedOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setSuccessMessage(`Sync Complete: ${res.synced} orders posted to factory ledger (${res.failed} failed)`);
    } catch (err: any) {
      setErrorMessage(`Sync Error: ${err.message}`);
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

  // Set default customer
  React.useEffect(() => {
    if (customers && customers.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  // Tax calculations preview
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
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const idempotencyKey = `pwa-order-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      if (isOfflineMode) {
        // Save to IndexedDB offline queue
        await enqueueOfflineOrder({
          customerId: selectedCustomerId,
          customerName: selectedCustomer?.business_name || 'Customer',
          productId: murukku.id,
          productName: murukku.name,
          quantity: quantity,
          totalAmount: totalAmount,
          idempotencyKey: idempotencyKey,
          notes: notes
        });
        await loadQueue();
        setSuccessMessage(`Offline Order saved locally (ID: ${idempotencyKey}). Will sync when connection is restored.`);
        return;
      }

      const payload = {
        customer_id: selectedCustomerId,
        items: [
          {
            product_id: murukku.id,
            quantity: quantity
          }
        ],
        idempotency_key: idempotencyKey,
        notes: notes
      };

      const res = await api.sales.createOrder(payload);
      setSuccessMessage(`Order ${res.order_number} submitted successfully! Status: PENDING`);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 py-2">
      {/* PWA Mobile Header */}
      <div className="bg-white p-4 rounded-xl border border-vintage shadow-warm flex justify-between items-center">
        <div>
          <h1 className="text-xl font-serif font-bold text-annapurna-ink flex items-center space-x-2">
            <ShoppingCart className="w-5 h-5 text-annapurna-terracotta" />
            <span>Salesman Fast Order Entry</span>
          </h1>
          <p className="text-[11px] text-annapurna-ink-muted">
            &lt; 45 Seconds Field Order Booking • Tamil Nadu &amp; Karnataka
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setIsOfflineMode(!isOfflineMode)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
              isOfflineMode
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-green-50 text-green-700 border-green-200'
            }`}
          >
            {isOfflineMode ? <WifiOff className="w-3.5 h-3.5 text-amber-700" /> : <Wifi className="w-3.5 h-3.5" />}
            <span>{isOfflineMode ? 'Simulate Offline' : 'Online Mode'}</span>
          </button>
        </div>
      </div>

      {/* Offline Queue Notice */}
      {offlineQueue.length > 0 && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex justify-between items-center text-xs">
          <div className="flex items-center space-x-2 text-amber-900">
            <Archive className="w-4 h-4 text-amber-700" />
            <span><strong>{offlineQueue.length} order(s)</strong> saved in local IndexedDB offline queue.</span>
          </div>
          <button
            type="button"
            onClick={handleSyncQueue}
            disabled={isSyncing}
            className="px-3 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded-md font-semibold text-[11px] flex items-center space-x-1"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-xs font-medium flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleOrderSubmit} className="space-y-4">
        {/* Customer Select */}
        <div className="bg-white p-5 rounded-xl border border-vintage shadow-warm space-y-3">
          <label className="block text-xs font-bold text-annapurna-ink uppercase tracking-wider">
            1. Select Customer
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {customers?.map((cust: any) => {
              const isSelected = cust.id === selectedCustomerId;
              return (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => setSelectedCustomerId(cust.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-annapurna-terracotta bg-annapurna-cream ring-1 ring-annapurna-terracotta'
                      : 'border-vintage hover:bg-annapurna-cream/50'
                  }`}
                >
                  <div className="font-semibold text-xs text-annapurna-ink">{cust.business_name}</div>
                  <div className="text-[11px] text-annapurna-ink-muted flex items-center space-x-1 mt-1">
                    <MapPin className="w-3 h-3 text-annapurna-terracotta" />
                    <span>{cust.state}</span>
                  </div>
                  <div className="text-[10px] text-annapurna-brass-dark font-medium mt-1">
                    GSTIN: {cust.gstin || 'Unregistered'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Product & Quantity Stepper */}
        <div className="bg-white p-5 rounded-xl border border-vintage shadow-warm space-y-4">
          <label className="block text-xs font-bold text-annapurna-ink uppercase tracking-wider">
            2. Product & Quantity
          </label>

          <div className="p-3 rounded-lg bg-annapurna-cream/60 border border-vintage flex justify-between items-center">
            <div>
              <div className="font-bold text-sm text-annapurna-ink">Murukku 200g (Packaged)</div>
              <div className="text-xs text-annapurna-ink-muted">SKU: MRK-200 • HSN: 190590</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-base text-annapurna-terracotta">₹50.00</div>
              <div className="text-[10px] text-annapurna-ink-muted">Base Price / Pkt</div>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(10, quantity - 10))}
              className="w-12 h-12 rounded-lg bg-annapurna-cream border border-vintage flex items-center justify-center text-annapurna-ink active:scale-95 transition-transform"
            >
              <Minus className="w-5 h-5" />
            </button>

            <div className="flex-1 text-center">
              <div className="text-3xl font-serif font-bold text-annapurna-ink">{quantity}</div>
              <div className="text-[11px] text-annapurna-ink-muted uppercase tracking-wider">Packets</div>
            </div>

            <button
              type="button"
              onClick={() => setQuantity(quantity + 10)}
              className="w-12 h-12 rounded-lg bg-annapurna-cream border border-vintage flex items-center justify-center text-annapurna-ink active:scale-95 transition-transform"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Quick preset buttons */}
          <div className="flex gap-2 justify-center pt-2">
            {[50, 100, 120, 150, 200].map((qty) => (
              <button
                key={qty}
                type="button"
                onClick={() => setQuantity(qty)}
                className={`text-xs px-3 py-1 rounded-md font-medium border transition-colors ${
                  quantity === qty
                    ? 'bg-annapurna-terracotta text-white border-annapurna-terracotta'
                    : 'bg-white border-vintage text-annapurna-ink hover:bg-annapurna-cream'
                }`}
              >
                {qty}
              </button>
            ))}
          </div>
        </div>

        {/* Real-time Order Summary */}
        <div className="bg-white p-5 rounded-xl border border-vintage shadow-warm space-y-3">
          <label className="block text-xs font-bold text-annapurna-ink uppercase tracking-wider">
            3. Tax & Pricing Summary
          </label>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-annapurna-ink-muted">
              <span>Taxable Value ({quantity} pkts × ₹50.00)</span>
              <span>₹{taxableAmount.toFixed(2)}</span>
            </div>
            {isIntrastate ? (
              <>
                <div className="flex justify-between text-annapurna-ink-muted">
                  <span>CGST (2.5% Tamil Nadu Intrastate)</span>
                  <span>₹{cgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-annapurna-ink-muted">
                  <span>SGST (2.5% Tamil Nadu Intrastate)</span>
                  <span>₹{sgstAmount.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-annapurna-ink-muted">
                <span>IGST (5.0% Karnataka Interstate)</span>
                <span>₹{igstAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-vintage pt-2 flex justify-between font-bold text-base text-annapurna-ink">
              <span>Total Payable Amount</span>
              <span className="text-annapurna-terracotta">₹{totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white font-medium text-sm rounded-xl shadow-warm flex items-center justify-center space-x-2 active:scale-95 transition-all"
        >
          <Send className="w-4 h-4" />
          <span>{isSubmitting ? 'Transmitting Order...' : 'Submit Sales Order Now'}</span>
        </button>
      </form>
    </div>
  );
}
