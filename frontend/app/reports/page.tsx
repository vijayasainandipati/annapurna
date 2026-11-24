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
  CheckCircle2,
  Receipt,
  Plus
} from 'lucide-react';
import { api } from '@/lib/api';

export default function ReportsHub() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'RECEIVABLES' | 'GST' | 'SALES' | 'PAYMENTS'>('RECEIVABLES');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payCustId, setPayCustId] = useState('');
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [payAmount, setPayAmount] = useState('4000.00');
  const [payRef, setPayRef] = useState('NEFT-TN-98124');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  const { data: customers } = useQuery({
    queryKey: ['masters', 'customers'],
    queryFn: () => api.masters.getCustomers(),
  });

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payCustId) return;
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
      setActionNotice({ 
        type: 'success', 
        message: `Payment ${res.payment_number} of ₹${parseFloat(payAmount).toLocaleString('en-IN')} allocated! Remaining invoice balance: ₹${res.invoice_remaining_balance}` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Payment Allocation Error: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enterprise Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-serif font-bold text-annapurna-ink">Finance, GST & Audit Desk</h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
              ACCOUNTANT / AUDITOR
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-0.5">
            Aged Debtors • GSTR-1 Outward Supply Summary • FIFO Payment Allocation • openpyxl Excel Exports
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowPaymentModal(true)}
            className="px-3 py-1.5 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
          <a
            href="/api/v1/reports/sales-register?format=excel"
            download
            className="px-2.5 py-1.5 rounded-md border border-vintage bg-white hover:bg-annapurna-cream text-xs font-semibold text-annapurna-ink flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Sales Register (.xlsx)</span>
          </a>
          <a
            href="/api/v1/reports/gst-summary?format=excel"
            download
            className="px-2.5 py-1.5 rounded-md border border-vintage bg-white hover:bg-annapurna-cream text-xs font-semibold text-annapurna-ink flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5 text-purple-700" />
            <span>GSTR-1 (.xlsx)</span>
          </a>
        </div>
      </div>

      {actionNotice && (
        <div className={`p-3 rounded-lg text-xs font-medium border flex justify-between items-center ${
          actionNotice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <span>{actionNotice.message}</span>
          <button onClick={() => setActionNotice(null)} className="underline font-semibold ml-4">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-md border border-vintage bg-white p-0.5 w-fit">
        {[
          { key: 'RECEIVABLES', label: 'Aged Receivables' },
          { key: 'GST', label: 'GSTR-1 Outward Summary' },
          { key: 'SALES', label: 'Sales Invoices Register' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeTab === t.key ? 'bg-annapurna-terracotta text-white shadow-xs' : 'text-annapurna-ink-muted hover:text-annapurna-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Aged Receivables Table */}
      {activeTab === 'RECEIVABLES' && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Customer Outstanding Ledger</h2>
              <p className="text-[10px] text-annapurna-ink-muted">Aged aging buckets (0-30, 31-60, 61-90, 90+ days) and payment history</p>
            </div>
            <div className="font-mono text-xs font-bold text-annapurna-terracotta">
              Total Outstanding: ₹{parseFloat(receivables?.total_receivables || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Distributor Name</th>
                  <th className="px-3 py-2.5">GSTIN</th>
                  <th className="px-3 py-2.5">State</th>
                  <th className="px-3 py-2.5 text-right">Credit Limit</th>
                  <th className="px-3 py-2.5 text-right">Current Balance</th>
                  <th className="px-4 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {receivables?.customers && receivables.customers.length > 0 ? (
                  receivables.customers.map((c: any) => (
                    <tr key={c.customer_id} className="hover:bg-annapurna-cream/40 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-annapurna-ink">{c.customer_name}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-annapurna-ink-muted">{c.gstin}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px]">{c.city}, {c.state}</td>
                      <td className="px-3 py-2.5 text-right font-mono">₹{parseFloat(c.credit_limit || '0').toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-annapurna-terracotta">
                        ₹{parseFloat(c.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => {
                            setPayCustId(c.customer_id);
                            setShowPaymentModal(true);
                          }}
                          className="px-2 py-1 text-[11px] font-semibold rounded bg-white hover:bg-annapurna-cream border border-vintage text-annapurna-ink"
                        >
                          Collect Payment
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-annapurna-ink-muted">No pending customer receivables.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: GSTR-1 Summary */}
      {activeTab === 'GST' && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs p-6 space-y-4">
          <div className="border-b border-vintage pb-3 flex justify-between items-center">
            <div>
              <h3 className="text-base font-serif font-bold text-annapurna-ink">GSTR-1 Outward Supplies Summary</h3>
              <p className="text-xs text-annapurna-ink-muted">B2B Sales split by Intra-state (CGST+SGST) and Inter-state (IGST)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1">
              <span className="text-[10px] uppercase font-bold text-annapurna-ink-muted">Total Taxable Value</span>
              <div className="text-lg font-mono font-bold text-annapurna-ink">
                ₹{parseFloat(gstSummary?.total_taxable || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1">
              <span className="text-[10px] uppercase font-bold text-annapurna-ink-muted">CGST (2.5%)</span>
              <div className="text-lg font-mono font-bold text-annapurna-ink">
                ₹{parseFloat(gstSummary?.total_cgst || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1">
              <span className="text-[10px] uppercase font-bold text-annapurna-ink-muted">SGST (2.5%)</span>
              <div className="text-lg font-mono font-bold text-annapurna-ink">
                ₹{parseFloat(gstSummary?.total_sgst || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1">
              <span className="text-[10px] uppercase font-bold text-annapurna-ink-muted">IGST (5.0%)</span>
              <div className="text-lg font-mono font-bold text-annapurna-ink">
                ₹{parseFloat(gstSummary?.total_igst || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Sales Register Table */}
      {activeTab === 'SALES' && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Sales Register & Invoices</span>
            <span className="text-[10px] font-mono text-annapurna-ink-muted">{salesRegister?.invoices?.length || 0} Invoices</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Invoice #</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Distributor</th>
                  <th className="px-3 py-2.5 text-right">Taxable</th>
                  <th className="px-3 py-2.5 text-right">Total GST</th>
                  <th className="px-3 py-2.5 text-right">Net Amount</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {salesRegister?.invoices && salesRegister.invoices.length > 0 ? (
                  salesRegister.invoices.map((inv: any) => (
                    <tr key={inv.invoice_number} className="hover:bg-annapurna-cream/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-medium text-annapurna-ink">{inv.invoice_number}</td>
                      <td className="px-3 py-2.5 font-mono text-annapurna-ink-muted">{inv.invoice_date}</td>
                      <td className="px-3 py-2.5 font-semibold text-annapurna-ink">{inv.customer_name}</td>
                      <td className="px-3 py-2.5 text-right font-mono">₹{parseFloat(inv.taxable_amount).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">₹{parseFloat(inv.tax_amount).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-annapurna-ink">
                        ₹{parseFloat(inv.total_amount).toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-50 text-emerald-800">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-annapurna-ink-muted">No invoices generated yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-vintage shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-vintage pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-annapurna-terracotta">PAYMENT RECEIPT</span>
                <h3 className="text-base font-serif font-bold text-annapurna-ink">Allocate Customer Remittance</h3>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-xs text-annapurna-ink-muted hover:text-annapurna-ink">✕</button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Customer / Distributor</label>
                <select
                  value={payCustId}
                  onChange={(e) => setPayCustId(e.target.value)}
                  required
                  className="w-full p-2 border border-vintage rounded bg-white text-annapurna-ink"
                >
                  <option value="">-- Select Customer --</option>
                  {customers?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Remittance Amount (₹)</label>
                  <input
                    type="text"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Bank Reference / UTR</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    required
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-vintage">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-3 py-1.5 text-xs rounded border border-vintage hover:bg-annapurna-cream text-annapurna-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold rounded bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white"
                >
                  {isSubmitting ? 'Allocating...' : 'Commit Payment to Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
