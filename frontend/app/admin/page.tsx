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
  PackageCheck
} from 'lucide-react';
import { api } from '@/lib/api';

export default function AdminOrderInbox() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('ALL');
  const [availabilityReport, setAvailabilityReport] = useState<Record<string, any>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['sales', 'orders'],
    queryFn: () => api.sales.getOrders(),
  });

  // Action handlers
  const handleCheckStock = async (orderId: string) => {
    try {
      const res = await api.sales.checkAvailability(orderId);
      setAvailabilityReport(prev => ({ ...prev, [orderId]: res }));
      setActionMessage(`Stock check completed for Order.`);
    } catch (err: any) {
      alert(`Error checking stock: ${err.message}`);
    }
  };

  const handleApprove = async (orderId: string) => {
    try {
      await api.sales.updateOrderStatus(orderId, 'APPROVED');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setActionMessage(`Order approved successfully.`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleGenerateInvoice = async (orderId: string) => {
    try {
      const inv = await api.sales.generateInvoice(orderId);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setActionMessage(`GST Invoice ${inv.invoice_number} generated for ₹${inv.total_amount}!`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDispatch = async (orderId: string) => {
    try {
      const res = await api.sales.dispatchOrder(orderId, {
        vehicle_number: 'TN-01-AB-1234',
        driver_name: 'Murugan',
        driver_phone: '9840199999'
      });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setActionMessage(`Order dispatched! Dispatch note: ${res.dispatch_number}. Finished goods stock deducted.`);
    } catch (err: any) {
      alert(`Dispatch Error: ${err.message}`);
    }
  };

  const filteredOrders = orders?.filter((o: any) => {
    if (filter === 'ALL') return true;
    return o.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-vintage pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-serif font-bold text-annapurna-ink flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-annapurna-terracotta" />
            <span>Admin Order & Dispatch Desk</span>
          </h1>
          <p className="text-xs text-annapurna-ink-muted mt-1">
            Order Approval • GST Invoicing • Shortage Lock • Final Dispatch
          </p>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-annapurna-cream border border-annapurna-terracotta/30 text-annapurna-terracotta text-xs font-semibold rounded-lg flex justify-between items-center">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="underline text-annapurna-ink">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-vintage pb-2">
        {['ALL', 'PENDING', 'APPROVED', 'INVOICED', 'DISPATCHED'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              filter === tab
                ? 'bg-annapurna-terracotta text-white shadow-sm'
                : 'text-annapurna-ink-muted hover:bg-annapurna-cream'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders?.map((order: any) => {
          const check = availabilityReport[order.id];
          const hasShortage = check && !check.all_items_available;

          return (
            <div
              key={order.id}
              className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-annapurna-ink">{order.order_number}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      order.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                      order.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'INVOICED' ? 'bg-purple-100 text-purple-800' :
                      order.status === 'DISPATCHED' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="text-xs text-annapurna-ink-muted mt-0.5">
                    Customer: <strong className="text-annapurna-ink">{order.customer?.business_name || 'Retailer A'}</strong> • State: {order.customer?.state || 'Tamil Nadu'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-base font-bold text-annapurna-terracotta">
                    ₹{parseFloat(order.total_order_amount).toFixed(2)}
                  </div>
                  <div className="text-[11px] text-annapurna-ink-muted">
                    Total Invoiced Amount (GST Incl.)
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="bg-annapurna-cream/40 rounded-lg p-3 text-xs space-y-2">
                <div className="font-semibold text-annapurna-ink-muted">Order Line Items:</div>
                {order.items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center text-xs">
                    <span>{item.product?.name || 'Murukku 200g'} × <strong>{item.quantity} pkts</strong></span>
                    <span>₹{parseFloat(item.line_total).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Stock Pre-check Availability Banner */}
              {check && (
                <div className={`p-3 rounded-lg border text-xs ${
                  hasShortage ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'
                }`}>
                  <div className="font-bold flex items-center space-x-1.5">
                    {hasShortage ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <CheckCircle className="w-4 h-4 text-green-600" />}
                    <span>{hasShortage ? 'Stock Shortage Detected!' : 'All Stock Ready for Dispatch'}</span>
                  </div>
                  {check.items?.map((it: any) => (
                    <div key={it.product_id} className="mt-1 text-[11px]">
                      {it.product_name}: Requested <strong>{it.requested_quantity}</strong> pkts, Available <strong>{it.available_stock}</strong> pkts
                      {it.shortage_quantity > 0 && (
                        <span className="font-bold text-red-700 ml-2">
                          (Shortage of {it.shortage_quantity} pkts!)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons Toolbar */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-vintage">
                <button
                  onClick={() => handleCheckStock(order.id)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-vintage bg-white hover:bg-annapurna-cream text-annapurna-ink flex items-center space-x-1"
                >
                  <PackageCheck className="w-3.5 h-3.5 text-annapurna-brass-dark" />
                  <span>Check Availability</span>
                </button>

                {order.status === 'PENDING' && (
                  <button
                    onClick={() => handleApprove(order.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Approve Order</span>
                  </button>
                )}

                {order.status === 'APPROVED' && (
                  <button
                    onClick={() => handleGenerateInvoice(order.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-purple-600 hover:bg-purple-700 text-white flex items-center space-x-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Generate GST Invoice</span>
                  </button>
                )}

                {(order.status === 'INVOICED' || order.status === 'APPROVED') && (
                  <button
                    onClick={() => handleDispatch(order.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white flex items-center space-x-1"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Dispatch & Deduct Stock</span>
                  </button>
                )}

                {order.invoices && order.invoices.length > 0 && (
                  <a
                    href={`/api/v1/sales/invoices/${order.invoices[0].id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 text-xs font-semibold rounded-md border border-annapurna-terracotta/40 bg-annapurna-cream text-annapurna-terracotta flex items-center space-x-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download ReportLab PDF</span>
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
