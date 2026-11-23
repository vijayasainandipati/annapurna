'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  FileText, 
  Download, 
  FileSpreadsheet, 
  Calendar, 
  IndianRupee, 
  CreditCard,
  CheckCircle2
} from 'lucide-react';
import { api } from '@/lib/api';

export default function ReportsHub() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'SALES' | 'GST' | 'RECEIVABLES' | 'COSTING'>('SALES');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payCustId, setPayCustId] = useState('');
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [payAmount, setPayAmount] = useState('4000.00');
  const [payRef, setPayRef] = useState('NEFT-TN-98124');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: salesRegister } = useQuery({
    queryKey: ['reports', 'sales'],
    queryFn: () => api.reports.getSalesRegister(),
  });

  const { data: gstSummary } = useQuery({
    queryKey: ['reports', 'gst'],
    queryFn: () => api.reports.getGSTSummary(),
  });

  const { data: receivables } = useQuery({
    queryKey: ['finance', 'receivables'],
    queryFn: () => api.finance.getReceivables(),
  });

  const { data: batchCosting } = useQuery({
    queryKey: ['reports', 'costing'],
    queryFn: () => api.reports.getBatchCosting(),
  });

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await api.finance.recordPayment({
        customer_id: payCustId,
        invoice_id: payInvoiceId || undefined,
        amount: payAmount,
        payment_method: 'BANK_TRANSFER',
        reference_number: payRef
      });
      setShowPaymentModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      alert(`Payment ${res.payment_number} recorded! Remaining balance: ₹${res.invoice_remaining_balance}`);
    } catch (err: any) {
      alert(`Payment Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-annapurna-ink flex items-center space-x-2">
            <FileText className="w-6 h-6 text-annapurna-terracotta" />
            <span>GST & Audit Reports Desk</span>
          </h1>
          <p className="text-xs text-annapurna-ink-muted mt-1">
            GSTR-1 Outward Summary • Sales Register • Aged Receivables • openpyxl Excel Exports
          </p>
        </div>

        <div className="flex space-x-2">
          <a
            href="/api/v1/reports/sales-register?format=excel"
            download
            className="px-3 py-1.5 rounded-lg border border-vintage bg-white hover:bg-annapurna-cream text-xs font-semibold text-annapurna-ink flex items-center space-x-1"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-green-700" />
            <span>Export Sales Register (.xlsx)</span>
          </a>
          <a
            href="/api/v1/reports/gst-summary?format=excel"
            download
            className="px-3 py-1.5 rounded-lg border border-vintage bg-white hover:bg-annapurna-cream text-xs font-semibold text-annapurna-ink flex items-center space-x-1"
          >
            <Download className="w-3.5 h-3.5 text-purple-700" />
            <span>GSTR-1 Excel (.xlsx)</span>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-vintage pb-2">
        {[
          { key: 'SALES', label: 'Sales Register' },
          { key: 'GST', label: 'GSTR-1 Outward Summary' },
          { key: 'RECEIVABLES', label: 'Aged Receivables & Collections' },
          { key: 'COSTING', label: 'Batch Costing Analysis' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === t.key
                ? 'bg-annapurna-terracotta text-white shadow-sm'
                : 'text-annapurna-ink-muted hover:bg-annapurna-cream'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Sales Register */}
      {activeTab === 'SALES' && (
        <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
          <div className="flex justify-between items-center text-xs">
            <div className="font-serif font-bold text-base text-annapurna-ink">Invoiced Sales Ledger</div>
            <div className="space-x-2">
              <a href="/api/v1/reports/sales-register?format=csv" className="text-annapurna-terracotta underline font-semibold">Download CSV</a>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream border-y border-vintage text-annapurna-ink-muted">
                <tr>
                  <th className="py-2 px-3">Invoice #</th>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Customer</th>
                  <th className="py-2 px-3">State</th>
                  <th className="py-2 px-3">Taxable</th>
                  <th className="py-2 px-3">CGST</th>
                  <th className="py-2 px-3">SGST</th>
                  <th className="py-2 px-3">IGST</th>
                  <th className="py-2 px-3">Total (₹)</th>
                  <th className="py-2 px-3">Paid (₹)</th>
                  <th className="py-2 px-3">Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {salesRegister?.invoices?.map((inv: any) => (
                  <tr key={inv.invoice_number} className="hover:bg-annapurna-cream/50">
                    <td className="py-2.5 px-3 font-semibold text-annapurna-terracotta">{inv.invoice_number}</td>
                    <td className="py-2.5 px-3 text-annapurna-ink-faint">{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</td>
                    <td className="py-2.5 px-3 font-medium text-annapurna-ink">{inv.customer_name}</td>
                    <td className="py-2.5 px-3">{inv.customer_state}</td>
                    <td className="py-2.5 px-3">₹{parseFloat(inv.taxable_amount).toFixed(2)}</td>
                    <td className="py-2.5 px-3">₹{parseFloat(inv.cgst_amount).toFixed(2)}</td>
                    <td className="py-2.5 px-3">₹{parseFloat(inv.sgst_amount).toFixed(2)}</td>
                    <td className="py-2.5 px-3">₹{parseFloat(inv.igst_amount).toFixed(2)}</td>
                    <td className="py-2.5 px-3 font-bold text-annapurna-ink">₹{parseFloat(inv.total_amount).toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-green-700 font-semibold">₹{parseFloat(inv.paid_amount).toFixed(2)}</td>
                    <td className="py-2.5 px-3 font-bold text-amber-800">₹{parseFloat(inv.balance_amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: GSTR-1 Outward Summary */}
      {activeTab === 'GST' && (
        <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
          <div className="font-serif font-bold text-base text-annapurna-ink">GSTR-1 Outward Supply Aggregation</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {gstSummary && [
              { title: 'B2B Intrastate (Tamil Nadu)', data: gstSummary.b2b_intrastate },
              { title: 'B2B Interstate (Other States)', data: gstSummary.b2b_interstate },
              { title: 'B2C Intrastate (Tamil Nadu)', data: gstSummary.b2c_intrastate },
              { title: 'B2C Interstate (Other States)', data: gstSummary.b2c_interstate },
            ].map((card) => (
              <div key={card.title} className="p-4 rounded-lg bg-annapurna-cream/50 border border-vintage space-y-2">
                <div className="font-bold text-annapurna-ink">{card.title}</div>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-annapurna-ink-muted">
                  <div>Taxable Value: <strong className="text-annapurna-ink">₹{parseFloat(card.data.taxable_value).toFixed(2)}</strong></div>
                  <div>Total Tax: <strong className="text-annapurna-ink">₹{parseFloat(card.data.total_tax).toFixed(2)}</strong></div>
                  <div>CGST: ₹{parseFloat(card.data.cgst_amount).toFixed(2)}</div>
                  <div>SGST: ₹{parseFloat(card.data.sgst_amount).toFixed(2)}</div>
                  <div>IGST: ₹{parseFloat(card.data.igst_amount).toFixed(2)}</div>
                  <div className="font-bold text-annapurna-terracotta">Total: ₹{parseFloat(card.data.total_invoice_value).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Aged Receivables */}
      {activeTab === 'RECEIVABLES' && (
        <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-serif font-bold text-base text-annapurna-ink">Customer Outstanding & Aging Buckets</div>
              <div className="text-xs text-annapurna-ink-muted">Standard 0-30, 31-60, 61-90, and &gt;90 days aging</div>
            </div>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="px-3.5 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center space-x-1"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Record Customer Payment</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream border-y border-vintage text-annapurna-ink-muted">
                <tr>
                  <th className="py-2.5 px-3">Customer Business Name</th>
                  <th className="py-2.5 px-3">State</th>
                  <th className="py-2.5 px-3">Total Due (₹)</th>
                  <th className="py-2.5 px-3">0-30 Days</th>
                  <th className="py-2.5 px-3">31-60 Days</th>
                  <th className="py-2.5 px-3">61-90 Days</th>
                  <th className="py-2.5 px-3">90+ Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {receivables?.customers?.map((cust: any) => (
                  <tr key={cust.customer_id} className="hover:bg-annapurna-cream/50">
                    <td className="py-2.5 px-3 font-semibold text-annapurna-ink">{cust.business_name}</td>
                    <td className="py-2.5 px-3 text-annapurna-ink-muted">{cust.state}</td>
                    <td className="py-2.5 px-3 font-bold text-annapurna-terracotta">
                      ₹{parseFloat(cust.current_balance).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-annapurna-ink">₹{parseFloat(cust.bucket_0_30).toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-annapurna-ink-faint">₹{parseFloat(cust.bucket_31_60).toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-annapurna-ink-faint">₹{parseFloat(cust.bucket_61_90).toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-annapurna-ink-faint">₹{parseFloat(cust.bucket_90_plus).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Batch Costing */}
      {activeTab === 'COSTING' && (
        <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
          <div className="font-serif font-bold text-base text-annapurna-ink">Batch Manufacturing Cost Breakdown</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream border-y border-vintage text-annapurna-ink-muted">
                <tr>
                  <th className="py-2.5 px-3">Batch Number</th>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3">Good Units</th>
                  <th className="py-2.5 px-3">Raw Materials (₹)</th>
                  <th className="py-2.5 px-3">Packaging (₹)</th>
                  <th className="py-2.5 px-3">Labour (₹)</th>
                  <th className="py-2.5 px-3">Power/Overhead (₹)</th>
                  <th className="py-2.5 px-3">Total Cost (₹)</th>
                  <th className="py-2.5 px-3">Unit Cost / Pkt (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {batchCosting?.batches?.map((b: any) => (
                  <tr key={b.batch_number} className="hover:bg-annapurna-cream/50">
                    <td className="py-2.5 px-3 font-semibold text-annapurna-terracotta">{b.batch_number}</td>
                    <td className="py-2.5 px-3 text-annapurna-ink">{b.product_name}</td>
                    <td className="py-2.5 px-3 font-bold">{b.good_units} pkts</td>
                    <td className="py-2.5 px-3">₹{parseFloat(b.raw_material_cost).toFixed(2)}</td>
                    <td className="py-2.5 px-3">₹{parseFloat(b.packaging_cost).toFixed(2)}</td>
                    <td className="py-2.5 px-3">₹{parseFloat(b.labour_cost).toFixed(2)}</td>
                    <td className="py-2.5 px-3">₹{parseFloat(b.overhead_cost).toFixed(2)}</td>
                    <td className="py-2.5 px-3 font-bold text-annapurna-ink">₹{parseFloat(b.total_cost).toFixed(2)}</td>
                    <td className="py-2.5 px-3 font-bold text-annapurna-terracotta">₹{parseFloat(b.cost_per_unit).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-vintage shadow-2xl space-y-4">
            <h3 className="font-serif font-bold text-lg text-annapurna-ink">Record Customer Payment</h3>
            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Customer</label>
                <select
                  value={payCustId}
                  onChange={(e) => setPayCustId(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg border border-vintage bg-white text-xs"
                >
                  <option value="">-- Choose Customer --</option>
                  {receivables?.customers?.map((c: any) => (
                    <option key={c.customer_id} value={c.customer_id}>{c.business_name} (Balance: ₹{parseFloat(c.current_balance).toFixed(2)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Payment Amount (₹)</label>
                <input
                  type="text"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  className="w-full p-2 rounded-lg border border-vintage font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Bank Reference / NEFT UTR</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full p-2 rounded-lg border border-vintage"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-3 py-2 rounded-lg border border-vintage hover:bg-annapurna-cream"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-green-700 text-white rounded-lg font-semibold hover:bg-green-800"
                >
                  {isSubmitting ? 'Posting...' : 'Allocate Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
