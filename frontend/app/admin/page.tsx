'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ShieldCheck, 
  FileCheck, 
  Truck, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Download, 
  FileText,
  Search,
  Filter,
  Check,
  ChevronRight,
  Printer,
  Package
} from 'lucide-react';
import { api } from '@/lib/api';

export default function AdminOrderInbox() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [availabilityReport, setAvailabilityReport] = useState<Record<string, any>>({});
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['sales', 'orders'],
    queryFn: () => api.sales.getOrders(),
  });

  const handleCheckStock = async (orderId: string) => {
    try {
      setIsProcessing(true);
      const res = await api.sales.checkAvailability(orderId);
      setAvailabilityReport(prev => ({ ...prev, [orderId]: res }));
      setActionNotice({
        type: 'success',
        message: `Stock check: Required ${res.required_quantity} pkts. Available in Finished Goods: ${res.available_quantity} pkts.`
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Stock Check Failed: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async (orderId: string) => {
    try {
      setIsProcessing(true);
      await api.sales.updateOrderStatus(orderId, 'APPROVED');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setActionNotice({ type: 'success', message: `Order #${orderId.substring(0, 8)} approved for invoicing.` });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Approval Error: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateInvoice = async (orderId: string) => {
    try {
      setIsProcessing(true);
      const inv = await api.sales.generateInvoice(orderId);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setActionNotice({ 
        type: 'success', 
        message: `GST Invoice ${inv.invoice_number} generated (₹${parseFloat(inv.total_amount).toLocaleString('en-IN')})!` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Invoice Generation Error: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDispatch = async (orderId: string) => {
    try {
      setIsProcessing(true);
      const res = await api.sales.dispatchOrder(orderId, {
        vehicle_number: 'TN-59-BZ-4412',
        driver_name: 'P. Murugesan',
        driver_phone: '9840199999'
      });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setActionNotice({ 
        type: 'success', 
        message: `Dispatch ${res.dispatch_number} posted! Finished Goods stock deducted automatically.` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Dispatch Shortage Guard: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredOrders = orders?.filter((o: any) => {
    const matchesFilter = statusFilter === 'ALL' || o.status === statusFilter;
    const matchesSearch = !searchQuery || 
      o.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Enterprise Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-serif font-bold text-annapurna-ink">Sales Orders & Dispatch Desk</h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
              FACTORY ADMIN
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-0.5">
            Order Verification • Approval Gate • GST Tax Invoicing • Dispatch Shortage Guard
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex rounded-md border border-vintage bg-white p-0.5">
            {['ALL', 'PENDING', 'APPROVED', 'INVOICED', 'DISPATCHED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  statusFilter === st
                    ? 'bg-annapurna-terracotta text-white shadow-xs'
                    : 'text-annapurna-ink-muted hover:text-annapurna-ink'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionNotice && (
        <div className={`p-3 rounded-lg text-xs font-medium border flex justify-between items-center ${
          actionNotice.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <span>{actionNotice.message}</span>
          <button onClick={() => setActionNotice(null)} className="underline font-semibold ml-4">Dismiss</button>
        </div>
      )}

      {/* Main Table + Slide-over Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders Data Table (2 cols or full if no selection) */}
        <div className={`${selectedOrder ? 'lg:col-span-2' : 'lg:col-span-3'} bg-white rounded-lg border border-vintage shadow-xs overflow-hidden`}>
          <div className="p-3 border-b border-vintage bg-annapurna-cream-paper/50 flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-annapurna-ink-faint absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search order # or distributor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-vintage rounded-md focus:outline-none focus:border-annapurna-terracotta"
              />
            </div>
            <div className="text-xs text-annapurna-ink-muted font-mono">
              Showing {filteredOrders?.length || 0} orders
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Order #</th>
                  <th className="px-3 py-2.5">Distributor / Customer</th>
                  <th className="px-3 py-2.5 text-right">Taxable</th>
                  <th className="px-3 py-2.5 text-right">Total (GST)</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-annapurna-ink-muted">Loading orders...</td>
                  </tr>
                ) : filteredOrders && filteredOrders.length > 0 ? (
                  filteredOrders.map((o: any) => {
                    const isSelected = selectedOrder?.id === o.id;
                    return (
                      <tr 
                        key={o.id} 
                        onClick={() => setSelectedOrder(o)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-annapurna-cream' : 'hover:bg-annapurna-cream/40'}`}
                      >
                        <td className="px-4 py-2.5 font-mono font-medium text-annapurna-ink">
                          {o.order_number}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-annapurna-ink">{o.customer_name}</div>
                          <div className="text-[10px] text-annapurna-ink-muted font-mono">{o.customer_city || 'Tamil Nadu'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-annapurna-ink-muted">
                          ₹{parseFloat(o.taxable_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-annapurna-ink">
                          ₹{parseFloat(o.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            o.status === 'DISPATCHED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                            o.status === 'INVOICED' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                            o.status === 'APPROVED' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                            'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrder(o);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold rounded bg-white hover:bg-annapurna-cream border border-vintage text-annapurna-ink inline-flex items-center space-x-1"
                          >
                            <span>Inspect</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-annapurna-ink-muted">
                      No sales orders found matching filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Order Slide-Over Panel (1 col) */}
        {selectedOrder && (
          <div className="bg-white rounded-lg border border-vintage shadow-xs p-4 space-y-4">
            <div className="flex justify-between items-start border-b border-vintage pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-annapurna-terracotta">ORDER DETAILS</span>
                <h3 className="text-base font-serif font-bold text-annapurna-ink">{selectedOrder.order_number}</h3>
                <p className="text-xs text-annapurna-ink-muted">{selectedOrder.customer_name}</p>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="text-xs text-annapurna-ink-muted hover:text-annapurna-ink p-1 rounded"
              >
                ✕ Close
              </button>
            </div>

            {/* Line items summary */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-annapurna-ink uppercase tracking-wider">Line Items</h4>
              <div className="rounded border border-vintage bg-annapurna-cream-paper divide-y divide-vintage text-xs">
                {selectedOrder.items?.map((it: any) => (
                  <div key={it.id} className="p-2.5 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-annapurna-ink">{it.product_name}</div>
                      <div className="text-[10px] text-annapurna-ink-muted font-mono">
                        {it.ordered_quantity} pkts @ ₹{parseFloat(it.unit_price).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-annapurna-ink">
                      ₹{parseFloat(it.taxable_amount).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tax Breakdown */}
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1 text-xs font-mono">
              <div className="flex justify-between text-annapurna-ink-muted">
                <span>Taxable Value:</span>
                <span>₹{parseFloat(selectedOrder.taxable_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-annapurna-ink-muted">
                <span>CGST:</span>
                <span>₹{parseFloat(selectedOrder.cgst_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-annapurna-ink-muted">
                <span>SGST:</span>
                <span>₹{parseFloat(selectedOrder.sgst_amount).toFixed(2)}</span>
              </div>
              {parseFloat(selectedOrder.igst_amount) > 0 && (
                <div className="flex justify-between text-annapurna-ink-muted">
                  <span>IGST (Interstate):</span>
                  <span>₹{parseFloat(selectedOrder.igst_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-annapurna-ink pt-1 border-t border-vintage">
                <span>Total Invoice Value:</span>
                <span>₹{parseFloat(selectedOrder.total_amount).toFixed(2)}</span>
              </div>
            </div>

            {/* Operational Action Pipeline */}
            <div className="space-y-2 pt-2 border-t border-vintage">
              <h4 className="text-xs font-semibold text-annapurna-ink uppercase tracking-wider">Order Actions</h4>

              <div className="space-y-1.5">
                {/* 1. Stock Availability Check */}
                <button
                  onClick={() => handleCheckStock(selectedOrder.id)}
                  disabled={isProcessing}
                  className="w-full py-2 px-3 text-xs font-semibold rounded bg-white hover:bg-annapurna-cream border border-vintage text-annapurna-ink flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center space-x-1.5">
                    <Package className="w-3.5 h-3.5 text-annapurna-terracotta" />
                    <span>Check Finished Goods Stock</span>
                  </span>
                  <span className="text-[10px] font-mono text-annapurna-ink-muted">Guardrail</span>
                </button>

                {/* 2. Approve Order */}
                {selectedOrder.status === 'PENDING' && (
                  <button
                    onClick={() => handleApprove(selectedOrder.id)}
                    disabled={isProcessing}
                    className="w-full py-2 px-3 text-xs font-semibold rounded bg-purple-700 hover:bg-purple-800 text-white flex items-center justify-center space-x-1.5 shadow-xs transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve Order</span>
                  </button>
                )}

                {/* 3. Generate GST Invoice */}
                {selectedOrder.status === 'APPROVED' && (
                  <button
                    onClick={() => handleGenerateInvoice(selectedOrder.id)}
                    disabled={isProcessing}
                    className="w-full py-2 px-3 text-xs font-semibold rounded bg-blue-700 hover:bg-blue-800 text-white flex items-center justify-center space-x-1.5 shadow-xs transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Generate GST Tax Invoice</span>
                  </button>
                )}

                {/* 4. Dispatch Order */}
                {selectedOrder.status === 'INVOICED' && (
                  <button
                    onClick={() => handleDispatch(selectedOrder.id)}
                    disabled={isProcessing}
                    className="w-full py-2 px-3 text-xs font-semibold rounded bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center space-x-1.5 shadow-xs transition-colors"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Dispatch (Verify Stock & Deduct)</span>
                  </button>
                )}

                {/* View Invoice PDF if available */}
                {selectedOrder.status === 'DISPATCHED' && (
                  <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs text-center font-medium">
                    Order Dispatched. Finished goods deducted from stock ledger.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
