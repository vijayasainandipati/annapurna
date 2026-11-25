'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Download, 
  FileSpreadsheet, 
  Plus
} from 'lucide-react';
import { api } from '@/lib/api';

function ReportsContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'RECEIVABLES' | 'GST' | 'SALES' | 'PAYMENTS' | 'COSTING'>('RECEIVABLES');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payCustId, setPayCustId] = useState('');
  const [payAmount, setPayAmount] = useState('2500.00');
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');
  const [payRef, setPayRef] = useState('NEFT-TN-98124');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'gst') setActiveTab('GST');
    else if (t === 'receivables') setActiveTab('RECEIVABLES');
    else if (t === 'sales') setActiveTab('SALES');
  }, [searchParams]);

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

  const { data: payments } = useQuery({
    queryKey: ['finance', 'payments'],
    queryFn: () => api.finance.getPayments(),
  });

  const { data: batchCosting } = useQuery({
    queryKey: ['reports', 'costing'],
    queryFn: () => api.reports.getBatchCosting(),
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
        amount: payAmount,
        payment_method: payMethod,
        reference_number: payRef
      });
      setShowPaymentModal(false);
      await queryClient.invalidateQueries({ queryKey: ['finance'] });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
      setActionNotice({ 
        type: 'success', 
        message: `Payment ${res.payment_number} (₹${parseFloat(res.amount).toLocaleString('en-IN')}) allocated FIFO to ${res.invoice_number}! Invoice balance: ₹${parseFloat(res.invoice_remaining_balance).toLocaleString('en-IN')}.` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Payment Allocation Error: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async (path: string, filename: string) => {
    try {
      await api.reports.downloadReport(path, filename);
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Download Failed: ${err.message}` });
    }
  };

  return (
    <div className="space-y-6">
      {/* Enterprise Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-serif font-bold text-annapurna-ink">Finance, GST &amp; Audit Desk</h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
              ACCOUNTANT / AUDITOR
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-0.5">
            Aged Debtors • GSTR-1 Outward Supply Summary • FIFO Payment Allocation • openpyxl Excel Exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowPaymentModal(true)}
            className="px-3 py-1.5 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
          <button
            onClick={() => handleDownload('sales-register?format=excel', 'sales_register.xlsx')}
            className="px-2.5 py-1.5 rounded-md border border-vintage bg-white hover:bg-annapurna-cream text-xs font-semibold text-annapurna-ink flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Sales Register (.xlsx)</span>
          </button>
          <button
            onClick={() => handleDownload('gst-summary?format=excel', 'gstr1_summary.xlsx')}
            className="px-2.5 py-1.5 rounded-md border border-vintage bg-white hover:bg-annapurna-cream text-xs font-semibold text-annapurna-ink flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5 text-purple-700" />
            <span>GSTR-1 (.xlsx)</span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className={`p-3 rounded-lg text-xs font-medium border flex justify-between items-center ${
          actionNotice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <span>{actionNotice.message}</span>
          <button onClick={() => setActionNotice(null)} className="underline font-semibold ml-4 shrink-0">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap rounded-md border border-vintage bg-white p-0.5 w-fit gap-0.5">
        {[
          { key: 'RECEIVABLES', label: 'Aged Receivables' },
          { key: 'GST', label: 'GSTR-1 Summary' },
          { key: 'SALES', label: 'Sales Register' },
          { key: 'PAYMENTS', label: 'Payment Receipts' },
          { key: 'COSTING', label: 'Batch Costing' },
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
              <h2 className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Customer Outstanding &amp; Aging Buckets</h2>
              <p className="text-[10px] text-annapurna-ink-muted">Live overdue tracking across 0-30, 31-60, 61-90, and 90+ days buckets</p>
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
                  <th className="px-3 py-2.5">State &amp; GSTIN</th>
                  <th className="px-3 py-2.5 text-right">0-30 Days</th>
                  <th className="px-3 py-2.5 text-right">31-60 Days</th>
                  <th className="px-3 py-2.5 text-right">61-90+ Days</th>
                  <th className="px-3 py-2.5 text-right">Total Due</th>
                  <th className="px-4 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {receivables?.customers && receivables.customers.length > 0 ? (
                  receivables.customers.map((c: any) => {
                    const bal = parseFloat(c.current_balance || '0');
                    const older = parseFloat(c.bucket_61_90 || '0') + parseFloat(c.bucket_90_plus || '0');
                    return (
                      <tr key={c.customer_id} className="hover:bg-annapurna-cream/40 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-annapurna-ink">{c.business_name}</div>
                          <div className="text-[10px] text-annapurna-ink-muted font-mono">
                            Limit: ₹{parseFloat(c.credit_limit || '0').toLocaleString('en-IN')} • {c.unpaid_invoices_count} unpaid inv
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-annapurna-ink-muted">
                          <div>{c.state}</div>
                          <div className="text-[10px]">{c.gstin}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          ₹{parseFloat(c.bucket_0_30 || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono ${parseFloat(c.bucket_31_60 || '0') > 0 ? 'text-amber-700 font-semibold' : ''}`}>
                          ₹{parseFloat(c.bucket_31_60 || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          ₹{older.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${bal > 0 ? 'text-annapurna-terracotta' : 'text-emerald-700'}`}>
                          ₹{bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {bal > 0 ? (
                            <button
                              onClick={() => {
                                setPayCustId(c.customer_id);
                                setPayAmount(bal.toFixed(2));
                                setShowPaymentModal(true);
                              }}
                              className="px-2 py-1 text-[11px] font-semibold rounded bg-white hover:bg-annapurna-cream border border-vintage text-annapurna-ink"
                            >
                              Collect
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-emerald-700 font-semibold">CLEARED</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-annapurna-ink-muted">No customer receivables records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: GSTR-1 Summary */}
      {activeTab === 'GST' && gstSummary && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs p-6 space-y-5">
          <div className="border-b border-vintage pb-3 flex justify-between items-center">
            <div>
              <h3 className="text-base font-serif font-bold text-annapurna-ink">GSTR-1 Outward Supplies Summary ({gstSummary.period})</h3>
              <p className="text-xs text-annapurna-ink-muted">B2B Sales split by Intra-state (Tamil Nadu CGST+SGST) and Inter-state (IGST)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1">
              <span className="text-[10px] uppercase font-bold text-annapurna-ink-muted">Total Taxable Value</span>
              <div className="text-lg font-mono font-bold text-annapurna-ink">
                ₹{parseFloat(gstSummary.total?.taxable_value || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1">
              <span className="text-[10px] uppercase font-bold text-annapurna-ink-muted">CGST (2.5%)</span>
              <div className="text-lg font-mono font-bold text-annapurna-ink">
                ₹{parseFloat(gstSummary.total?.cgst_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1">
              <span className="text-[10px] uppercase font-bold text-annapurna-ink-muted">SGST (2.5%)</span>
              <div className="text-lg font-mono font-bold text-annapurna-ink">
                ₹{parseFloat(gstSummary.total?.sgst_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1">
              <span className="text-[10px] uppercase font-bold text-annapurna-ink-muted">IGST (5.0%)</span>
              <div className="text-lg font-mono font-bold text-annapurna-ink">
                ₹{parseFloat(gstSummary.total?.igst_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <table className="w-full text-left text-xs border border-vintage">
            <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
              <tr>
                <th className="px-3 py-2">Supply Category</th>
                <th className="px-3 py-2 text-right">Taxable Value</th>
                <th className="px-3 py-2 text-right">CGST</th>
                <th className="px-3 py-2 text-right">SGST</th>
                <th className="px-3 py-2 text-right">IGST</th>
                <th className="px-3 py-2 text-right">Total Tax</th>
                <th className="px-3 py-2 text-right">Invoice Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vintage font-mono">
              {[
                gstSummary.b2b_intrastate,
                gstSummary.b2b_interstate,
                gstSummary.b2c_intrastate,
                gstSummary.b2c_interstate,
              ].map((cat: any) => (
                <tr key={cat.category} className="hover:bg-annapurna-cream/40">
                  <td className="px-3 py-2 font-sans font-semibold text-annapurna-ink">{cat.category}</td>
                  <td className="px-3 py-2 text-right">₹{parseFloat(cat.taxable_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">₹{parseFloat(cat.cgst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">₹{parseFloat(cat.sgst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">₹{parseFloat(cat.igst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">₹{parseFloat(cat.total_tax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right font-bold">₹{parseFloat(cat.total_invoice_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              <tr className="bg-annapurna-cream font-bold text-annapurna-ink">
                <td className="px-3 py-2.5 font-sans">{gstSummary.total.category}</td>
                <td className="px-3 py-2.5 text-right">₹{parseFloat(gstSummary.total.taxable_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2.5 text-right">₹{parseFloat(gstSummary.total.cgst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2.5 text-right">₹{parseFloat(gstSummary.total.sgst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2.5 text-right">₹{parseFloat(gstSummary.total.igst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2.5 text-right">₹{parseFloat(gstSummary.total.total_tax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2.5 text-right">₹{parseFloat(gstSummary.total.total_invoice_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Sales Register Table */}
      {activeTab === 'SALES' && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">
              Sales Register ({salesRegister?.total_invoices || 0} Invoices)
            </span>
            <button
              onClick={() => handleDownload('sales-register?format=csv', 'sales_register.csv')}
              className="text-[11px] font-semibold text-annapurna-terracotta hover:underline"
            >
              Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Invoice #</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Distributor</th>
                  <th className="px-3 py-2.5 text-right">Taxable</th>
                  <th className="px-3 py-2.5 text-right">GST</th>
                  <th className="px-3 py-2.5 text-right">Net Amount</th>
                  <th className="px-3 py-2.5 text-right">Balance Due</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {salesRegister?.invoices && salesRegister.invoices.length > 0 ? (
                  salesRegister.invoices.map((inv: any) => {
                    const gst = parseFloat(inv.cgst_amount || '0') + parseFloat(inv.sgst_amount || '0') + parseFloat(inv.igst_amount || '0');
                    return (
                      <tr key={inv.invoice_number} className="hover:bg-annapurna-cream/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-medium text-annapurna-ink">
                          <div>{inv.invoice_number}</div>
                          <div className="text-[10px] text-annapurna-ink-muted">{inv.order_number}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-annapurna-ink-muted">
                          {new Date(inv.invoice_date).toLocaleDateString('en-IN')}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-annapurna-ink">{inv.customer_name}</div>
                          <div className="text-[10px] font-mono text-annapurna-ink-muted">{inv.customer_state}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">₹{parseFloat(inv.taxable_amount).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">₹{gst.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-annapurna-ink">
                          ₹{parseFloat(inv.total_amount).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-annapurna-terracotta font-semibold">
                          ₹{parseFloat(inv.balance_amount).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                            inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                            inv.status === 'PARTIALLY_PAID' ? 'bg-amber-100 text-amber-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-annapurna-ink-muted">No invoices generated yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Payments Ledger */}
      {activeTab === 'PAYMENTS' && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Customer Remittance Ledger</span>
            <span className="text-[10px] font-mono text-annapurna-ink-muted">{payments?.length || 0} Receipts</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Payment #</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Invoice #</th>
                  <th className="px-3 py-2.5">Method / Ref</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-right">Inv Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {payments && payments.length > 0 ? (
                  payments.map((p: any) => (
                    <tr key={p.id} className="hover:bg-annapurna-cream/40">
                      <td className="px-4 py-2.5 font-mono font-medium text-annapurna-ink">{p.payment_number}</td>
                      <td className="px-3 py-2.5 font-mono text-annapurna-ink-muted">{p.payment_date}</td>
                      <td className="px-3 py-2.5 font-semibold text-annapurna-ink">{p.customer_name}</td>
                      <td className="px-3 py-2.5 font-mono text-blue-700">{p.invoice_number}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-annapurna-ink-muted">
                        {p.payment_method} • {p.reference_number || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">
                        ₹{parseFloat(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-annapurna-ink">
                        ₹{parseFloat(p.invoice_remaining_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-annapurna-ink-muted">No payments logged yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Batch Costing */}
      {activeTab === 'COSTING' && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Batch Manufacturing Cost Audit</span>
            <span className="text-[10px] font-mono text-annapurna-ink-muted">{batchCosting?.total_batches || 0} Batches</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Batch #</th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5 text-right">Output</th>
                  <th className="px-3 py-2.5 text-right">Raw Mat</th>
                  <th className="px-3 py-2.5 text-right">Packaging</th>
                  <th className="px-3 py-2.5 text-right">Labour + OH</th>
                  <th className="px-3 py-2.5 text-right">Total Cost</th>
                  <th className="px-4 py-2.5 text-right">Unit Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage font-mono">
                {batchCosting?.batches?.map((b: any) => (
                  <tr key={b.batch_number} className="hover:bg-annapurna-cream/40">
                    <td className="px-4 py-2.5 font-medium text-annapurna-ink">{b.batch_number}</td>
                    <td className="px-3 py-2.5 font-sans font-semibold text-annapurna-ink">{b.product_name}</td>
                    <td className="px-3 py-2.5 text-right">{parseFloat(b.good_units).toFixed(0)}</td>
                    <td className="px-3 py-2.5 text-right">₹{parseFloat(b.raw_material_cost).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right">₹{parseFloat(b.packaging_cost).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right">₹{(parseFloat(b.labour_cost) + parseFloat(b.overhead_cost)).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-annapurna-ink">₹{parseFloat(b.total_cost).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-annapurna-terracotta">₹{parseFloat(b.cost_per_unit).toFixed(2)}</td>
                  </tr>
                ))}
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
                <span className="text-[10px] font-mono uppercase font-bold text-annapurna-terracotta">PAYMENT RECEIPT (FIFO)</span>
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
                      {c.business_name} ({c.state})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Amount (₹)</label>
                  <input
                    type="text"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full p-2 border border-vintage rounded bg-white"
                  >
                    <option value="BANK_TRANSFER">NEFT / RTGS</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
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

export default function ReportsHub() {
  return (
    <Suspense fallback={<div className="p-6 text-xs font-mono text-annapurna-ink-muted">Loading Finance &amp; Audit Reports...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
