'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Truck, 
  FileText,
  Search,
  Check,
  XCircle,
  ChevronRight,
  Package,
  Download,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { api } from '@/lib/api';

export default function AdminOrderInbox() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [availabilityReport, setAvailabilityReport] = useState<Record<string, any>>({});
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['sales', 'orders'],
    queryFn: () => api.sales.getOrders(),
  });

  const selectedOrder = orders?.find((o: any) => o.id === selectedOrderId) || null;

  const handleCheckStock = async (orderId: string) => {
    try {
      setIsProcessing(true);
      const res = await api.sales.checkAvailability(orderId);
      setAvailabilityReport(prev => ({ ...prev, [orderId]: res }));
      setActionNotice({
        type: res.can_fulfill_completely ? 'success' : 'error',
        message: res.can_fulfill_completely
          ? `Stock Precheck Passed for ${res.order_number}: Required ${res.total_requested} pkts, all items available.`
          : `Shortage Detected on ${res.order_number}: Need ${res.total_requested} pkts — see shortage breakdown in detail drawer.`
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Stock Check Failed: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async (order: any) => {
    try {
      setIsProcessing(true);
      await api.sales.updateOrderStatus(order.id, 'APPROVED');
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
      setActionNotice({ type: 'success', message: `Order ${order.order_number} approved for GST invoicing.` });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Approval Error: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (order: any) => {
    const reason = window.prompt(`Enter rejection reason for ${order.order_number}:`, 'Credit limit review pending');
    if (!reason) return;
    try {
      setIsProcessing(true);
      await api.sales.updateOrderStatus(order.id, 'REJECTED', reason);
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
      setActionNotice({ type: 'success', message: `Order ${order.order_number} marked as REJECTED.` });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Rejection Error: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateInvoice = async (order: any) => {
    try {
      setIsProcessing(true);
      const inv = await api.sales.generateInvoice(order.id);
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
      setActionNotice({ 
        type: 'success', 
        message: `GST Tax Invoice ${inv.invoice_number} generated for ₹${parseFloat(inv.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}!` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Invoice Generation Error: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDispatch = async (order: any) => {
    if (!order.invoice_id) {
      setActionNotice({ type: 'error', message: 'Cannot dispatch without a generated invoice ID.' });
      return;
    }
    try {
      setIsProcessing(true);
      const res = await api.sales.dispatchOrder(order.id, {
        order_id: order.id,
        invoice_id: order.invoice_id,
        notes: `Warehouse dispatch completed for ${order.order_number}`
      });
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setActionNotice({ 
        type: 'success', 
        message: `Dispatch ${res.dispatch_number} posted! ${res.dispatched_quantity} pkts deducted from finished goods ledger.` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Dispatch Shortage Guard: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPdf = async (order: any) => {
    if (!order.invoice_id) return;
    try {
      await api.sales.downloadInvoicePdf(order.invoice_id, order.invoice_number);
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `PDF Download Error: ${err.message}` });
    }
  };

  const filteredOrders = orders?.filter((o: any) => {
    const matchesFilter = statusFilter === 'ALL' || o.status === statusFilter;
    const matchesSearch = !searchQuery || 
      o.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_state?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const activePrecheck = selectedOrder ? availabilityReport[selectedOrder.id] : null;
  const isIntraSelected = selectedOrder?.customer_state?.trim().toLowerCase() === 'tamil nadu';

  return (
    <div className="space-y-6">
      {/* Enterprise Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-serif font-bold text-annapurna-ink">Sales Orders &amp; Dispatch Desk</h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
              FACTORY ADMIN
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-0.5">
            Order Verification • Approval Gate • GST Tax Invoicing • Dispatch Shortage Guard
          </p>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto">
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
          <button onClick={() => setActionNotice(null)} className="underline font-semibold ml-4 shrink-0">Dismiss</button>
        </div>
      )}

      {/* Main Table + Slide-over Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${selectedOrder ? 'lg:col-span-2' : 'lg:col-span-3'} bg-white rounded-lg border border-vintage shadow-xs overflow-hidden`}>
          <div className="p-3 border-b border-vintage bg-annapurna-cream-paper/50 flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-annapurna-ink-faint absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search order #, distributor, or state..."
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
                        onClick={() => setSelectedOrderId(o.id)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-annapurna-cream' : 'hover:bg-annapurna-cream/40'}`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-mono font-medium text-annapurna-ink">{o.order_number}</div>
                          {o.invoice_number && (
                            <div className="text-[10px] font-mono text-blue-700">{o.invoice_number}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-annapurna-ink">{o.customer_name}</div>
                          <div className="text-[10px] text-annapurna-ink-muted font-mono">
                            {o.customer_state} • {o.salesman_name}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-annapurna-ink-muted">
                          ₹{parseFloat(o.total_taxable_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-annapurna-ink">
                          ₹{parseFloat(o.total_order_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            o.status === 'DISPATCHED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                            o.status === 'INVOICED' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                            o.status === 'APPROVED' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                            o.status === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-300' :
                            'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrderId(o.id);
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
          <div className="bg-white rounded-lg border border-vintage shadow-xs p-4 space-y-4 h-fit">
            <div className="flex justify-between items-start border-b border-vintage pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-annapurna-terracotta">ORDER DETAILS</span>
                <h3 className="text-base font-serif font-bold text-annapurna-ink">{selectedOrder.order_number}</h3>
                <p className="text-xs text-annapurna-ink-muted">{selectedOrder.customer_name}</p>
                <p className="text-[10px] font-mono text-annapurna-ink-muted">
                  {selectedOrder.customer_state} • GSTIN: {selectedOrder.customer_gstin || 'URP'}
                </p>
              </div>
              <button 
                onClick={() => setSelectedOrderId(null)}
                className="text-xs text-annapurna-ink-muted hover:text-annapurna-ink p-1 rounded"
              >
                ✕ Close
              </button>
            </div>

            {selectedOrder.notes && (
              <div className="text-[11px] bg-annapurna-cream-paper px-2.5 py-1.5 rounded border border-vintage text-annapurna-ink-muted">
                {selectedOrder.notes}
              </div>
            )}

            {/* Line items summary */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-annapurna-ink uppercase tracking-wider">Line Items</h4>
              <div className="rounded border border-vintage bg-annapurna-cream-paper divide-y divide-vintage text-xs">
                {selectedOrder.items?.map((it: any) => (
                  <div key={it.id} className="p-2.5 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-annapurna-ink">{it.product_name}</div>
                      <div className="text-[10px] text-annapurna-ink-muted font-mono">
                        {it.quantity} pkts @ ₹{parseFloat(it.unit_price).toFixed(2)} ({it.product_sku})
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-annapurna-ink">
                      ₹{parseFloat(it.taxable_amount).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Stock Precheck Results */}
            {activePrecheck && (
              <div className={`p-3 rounded border text-xs space-y-2 ${
                activePrecheck.can_fulfill_completely ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center space-x-1">
                    {activePrecheck.can_fulfill_completely
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-red-700" />}
                    <span>Finished Goods Availability Check</span>
                  </span>
                </div>
                <div className="space-y-1 font-mono text-[11px]">
                  {activePrecheck.items?.map((pi: any) => (
                    <div key={pi.product_id} className="flex justify-between">
                      <span>{pi.product_sku}: Req {pi.requested_quantity}</span>
                      <span className={pi.has_shortage ? 'text-red-700 font-bold' : 'text-emerald-700 font-semibold'}>
                        Avail {parseFloat(pi.available_stock).toFixed(0)} {pi.has_shortage ? `(Short -${pi.shortage_quantity})` : '(OK)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tax Breakdown */}
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1 text-xs font-mono">
              <div className="flex justify-between text-annapurna-ink-muted">
                <span>Taxable Value:</span>
                <span>₹{parseFloat(selectedOrder.total_taxable_amount || '0').toFixed(2)}</span>
              </div>
              {isIntraSelected ? (
                <>
                  <div className="flex justify-between text-annapurna-ink-muted">
                    <span>CGST (2.5% Intra-state):</span>
                    <span>₹{(parseFloat(selectedOrder.total_tax_amount || '0') / 2).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-annapurna-ink-muted">
                    <span>SGST (2.5% Intra-state):</span>
                    <span>₹{(parseFloat(selectedOrder.total_tax_amount || '0') / 2).toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-annapurna-ink-muted">
                  <span>IGST (5.0% Interstate):</span>
                  <span>₹{parseFloat(selectedOrder.total_tax_amount || '0').toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-annapurna-ink pt-1 border-t border-vintage">
                <span>Total Order Value:</span>
                <span>₹{parseFloat(selectedOrder.total_order_amount || '0').toFixed(2)}</span>
              </div>
            </div>

            {/* Operational Action Pipeline */}
            <div className="space-y-2 pt-2 border-t border-vintage">
              <h4 className="text-xs font-semibold text-annapurna-ink uppercase tracking-wider">Order Actions</h4>

              <div className="space-y-1.5">
                <button
                  onClick={() => handleCheckStock(selectedOrder.id)}
                  disabled={isProcessing}
                  className="w-full py-2 px-3 text-xs font-semibold rounded bg-white hover:bg-annapurna-cream border border-vintage text-annapurna-ink flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center space-x-1.5">
                    <Package className="w-3.5 h-3.5 text-annapurna-terracotta" />
                    <span>Check Finished Goods Stock</span>
                  </span>
                  <span className="text-[10px] font-mono text-annapurna-ink-muted">Precheck</span>
                </button>

                {selectedOrder.status === 'PENDING' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => handleApprove(selectedOrder)}
                      disabled={isProcessing}
                      className="py-2 px-3 text-xs font-semibold rounded bg-purple-700 hover:bg-purple-800 text-white flex items-center justify-center space-x-1 shadow-xs transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => handleReject(selectedOrder)}
                      disabled={isProcessing}
                      className="py-2 px-3 text-xs font-semibold rounded bg-white hover:bg-red-50 border border-red-200 text-red-700 flex items-center justify-center space-x-1 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}

                {selectedOrder.status === 'APPROVED' && (
                  <button
                    onClick={() => handleGenerateInvoice(selectedOrder)}
                    disabled={isProcessing}
                    className="w-full py-2 px-3 text-xs font-semibold rounded bg-blue-700 hover:bg-blue-800 text-white flex items-center justify-center space-x-1.5 shadow-xs transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Generate GST Tax Invoice</span>
                  </button>
                )}

                {selectedOrder.status === 'INVOICED' && (
                  <button
                    onClick={() => handleDispatch(selectedOrder)}
                    disabled={isProcessing}
                    className="w-full py-2 px-3 text-xs font-semibold rounded bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center space-x-1.5 shadow-xs transition-colors"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Dispatch (Verify Stock &amp; Deduct)</span>
                  </button>
                )}

                {selectedOrder.invoice_id && (
                  <button
                    onClick={() => handleDownloadPdf(selectedOrder)}
                    className="w-full py-2 px-3 text-xs font-semibold rounded bg-annapurna-cream hover:bg-annapurna-cream-border/40 border border-vintage text-annapurna-ink flex items-center justify-center space-x-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-annapurna-terracotta" />
                    <span>Download GST Invoice PDF ({selectedOrder.invoice_number})</span>
                  </button>
                )}

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
