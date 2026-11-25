'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  AlertTriangle, 
  Download, 
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { api } from '@/lib/api';

export default function OwnerDashboard() {
  const { data: inventory, refetch: refetchInv } = useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => api.inventory.getSummary(),
  });

  const { data: receivables, refetch: refetchRec } = useQuery({
    queryKey: ['finance', 'receivables'],
    queryFn: () => api.finance.getReceivables(),
  });

  const { data: varianceReport, refetch: refetchVar } = useQuery({
    queryKey: ['reports', 'variance'],
    queryFn: () => api.reports.getProductionVariance(),
  });

  const { data: salesRegister, refetch: refetchSales } = useQuery({
    queryKey: ['reports', 'sales'],
    queryFn: () => api.reports.getSalesRegister(),
  });

  const { data: outboxEvents, refetch: refetchOutbox } = useQuery({
    queryKey: ['realtime', 'events'],
    queryFn: () => api.realtime.getEvents(),
  });

  const handleRefreshAll = () => {
    refetchInv();
    refetchRec();
    refetchVar();
    refetchSales();
    refetchOutbox();
  };

  const handleExportSales = async () => {
    try {
      await api.reports.downloadReport('sales-register?format=excel', 'sales_register.xlsx');
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const totalSales = salesRegister?.total_sales || '0.00';
  const totalCollected = salesRegister?.total_collected || '0.00';
  const totalReceivables = receivables?.total_receivables || '0.00';
  const totalValuation = inventory?.total_inventory_value || '0.00';
  const totalProductionPkts = varianceReport?.total_actual_output_pkts || '0';
  const batches = varianceReport?.batches || [];

  const lowStockItems = [
    ...(inventory?.raw_materials || []),
    ...(inventory?.packaging || []),
    ...(inventory?.finished_goods || []),
  ].filter((item: any) => item.is_low_stock);

  return (
    <div className="space-y-6">
      {/* Enterprise Page Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-serif font-bold text-annapurna-ink">Executive Plant Overview</h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
              OWNER DESK
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-0.5">
            Unit 1 (Madurai) • Consolidated Financial Position, Floor Valuation, and Batch Variance Exceptions
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefreshAll}
            className="p-1.5 rounded-md border border-vintage bg-white hover:bg-annapurna-cream text-annapurna-ink-muted transition-colors"
            title="Refresh Ledger Figures"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleExportSales}
            className="px-2.5 py-1.5 rounded-md border border-vintage bg-white hover:bg-annapurna-cream text-xs font-semibold text-annapurna-ink flex items-center space-x-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-annapurna-ink-muted" />
            <span>Export Sales Register (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Low Stock Exception Banner */}
      {lowStockItems.length > 0 && (
        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-semibold">
              {lowStockItems.length} Inventory Item(s) below minimum threshold:
            </span>
            <span className="font-mono text-[11px]">
              {lowStockItems.map((i: any) => `${i.name} (${parseFloat(i.current_stock).toFixed(1)} ${i.unit})`).join(' • ')}
            </span>
          </div>
        </div>
      )}

      {/* Primary KPI Control Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-lg border border-vintage shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs text-annapurna-ink-muted font-medium">
            <span>INVOICED REVENUE</span>
            <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1 rounded">POSTED</span>
          </div>
          <div className="text-2xl font-mono font-bold text-annapurna-ink">
            ₹{parseFloat(totalSales).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-annapurna-ink-muted flex items-center justify-between">
            <span>{salesRegister?.total_invoices || 0} Tax Invoices</span>
            <span className="text-emerald-700 font-medium font-mono">
              Collected: ₹{parseFloat(totalCollected).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-vintage shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs text-annapurna-ink-muted font-medium">
            <span>OUTSTANDING RECEIVABLES</span>
            <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-1 rounded">DUE</span>
          </div>
          <div className="text-2xl font-mono font-bold text-annapurna-ink">
            ₹{parseFloat(totalReceivables).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-annapurna-ink-muted flex items-center justify-between">
            <span>Accounts with Dues: {receivables?.total_customers_with_dues || 0}</span>
            <span className="text-amber-800 font-medium">Net Exposure</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-vintage shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs text-annapurna-ink-muted font-medium">
            <span>FLOOR STOCK VALUATION (WAR)</span>
            <span className="text-[10px] font-mono text-annapurna-terracotta bg-annapurna-cream px-1 rounded">WAR COST</span>
          </div>
          <div className="text-2xl font-mono font-bold text-annapurna-ink">
            ₹{parseFloat(totalValuation).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-annapurna-ink-muted flex items-center justify-between">
            <span>
              {(inventory?.raw_materials?.length || 0) + (inventory?.packaging?.length || 0) + (inventory?.finished_goods?.length || 0)} Active SKUs
            </span>
            <span className="text-annapurna-terracotta font-medium">Weighted Avg Rate</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-vintage shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs text-annapurna-ink-muted font-medium">
            <span>BATCH OUTPUT (PACKETS)</span>
            <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1 rounded">RUNS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-annapurna-ink">
            {parseInt(totalProductionPkts).toLocaleString('en-IN')}{' '}
            <span className="text-sm font-sans font-normal text-annapurna-ink-muted">pkts</span>
          </div>
          <div className="text-[10px] text-annapurna-ink-muted flex items-center justify-between">
            <span>Batches Logged: {varianceReport?.total_batches || 0}</span>
            <span className="text-blue-700 font-medium font-mono">
              Avg Var: {parseFloat(varianceReport?.average_yield_variance_percent || '0').toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Dense Operational Detail Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Production Batch Variance & Exceptions Table (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">
                Production Batches & Yield Variances
              </h2>
              <p className="text-[10px] text-annapurna-ink-muted">Monitored tolerance: ±3.0% on yield &amp; raw ingredients</p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-ink-muted border border-vintage">
              {batches.length} Batches
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-4 py-2">Batch #</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Std Output</th>
                  <th className="px-3 py-2 text-right">Actual Output</th>
                  <th className="px-3 py-2 text-right">Yield Var %</th>
                  <th className="px-3 py-2 text-right">Pkg Scrap</th>
                  <th className="px-3 py-2 text-right">Unit Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {batches.length > 0 ? (
                  batches.map((b: any) => {
                    const yieldNum = parseFloat(b.yield_variance_percent || '0');
                    const actualPkts = parseFloat(b.actual_output_pkts || '0');
                    const isDraft = actualPkts === 0 && parseFloat(b.total_cost || '0') === 0;
                    const isYieldAlert = !isDraft && Math.abs(yieldNum) > 3.0;
                    return (
                      <tr key={b.batch_number} className="hover:bg-annapurna-cream/50 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-medium text-annapurna-ink">
                          {b.batch_number}
                        </td>
                        <td className="px-3 py-2.5 font-medium">{b.product_name}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{parseFloat(b.standard_output_pkts).toFixed(0)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-annapurna-ink">
                          {isDraft ? <span className="text-amber-700 font-normal">DRAFT</span> : actualPkts.toFixed(0)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {isDraft ? (
                            '—'
                          ) : (
                            <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-[11px] ${
                              isYieldAlert ? 'bg-red-50 text-red-700 border border-red-200' : 'text-emerald-700'
                            }`}>
                              {yieldNum > 0 ? `+${yieldNum.toFixed(2)}%` : `${yieldNum.toFixed(2)}%`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-annapurna-ink-muted">
                          {isDraft ? '—' : `${parseFloat(b.packaging_scrap_percent || '0').toFixed(2)}%`}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-annapurna-ink font-medium">
                          {isDraft ? '—' : `₹${parseFloat(b.unit_cost || '0').toFixed(2)}`}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-annapurna-ink-muted text-xs">
                      No batch runs posted yet. Use Production Supervisor desk to execute batches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Aged Receivables & Exposure Table (1 col) */}
        <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">
                Customer Balances
              </h2>
              <p className="text-[10px] text-annapurna-ink-muted">Aged receivables across distributor accounts</p>
            </div>
          </div>

          <div className="divide-y divide-vintage overflow-y-auto max-h-[380px]">
            {receivables?.customers && receivables.customers.length > 0 ? (
              receivables.customers.map((c: any) => {
                const bal = parseFloat(c.current_balance || '0');
                const aging31 = parseFloat(c.bucket_31_60 || '0') + parseFloat(c.bucket_61_90 || '0') + parseFloat(c.bucket_90_plus || '0');
                return (
                  <div key={c.customer_id} className="p-3 hover:bg-annapurna-cream/40 transition-colors space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-semibold text-annapurna-ink leading-tight">{c.business_name}</span>
                      <span className={`font-mono text-xs font-bold shrink-0 ${bal > 0 ? 'text-annapurna-terracotta' : 'text-emerald-700'}`}>
                        ₹{bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="text-[10px] text-annapurna-ink-muted flex justify-between items-center">
                      <span>
                        {c.unpaid_invoices_count > 0 ? `${c.unpaid_invoices_count} open inv` : 'Settled'}
                        {aging31 > 0 && (
                          <span className="ml-1.5 text-red-700 font-semibold">(₹{aging31.toLocaleString('en-IN')} &gt;30d)</span>
                        )}
                      </span>
                      <span className="font-mono text-[9px] bg-annapurna-cream px-1.5 py-0.5 rounded border border-vintage/50">
                        {c.state}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs text-annapurna-ink-muted">
                No active customer accounts.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Realtime Event Audit Stream */}
      <div className="bg-white rounded-lg border border-vintage shadow-xs p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">
              Committed Transaction Outbox Log
            </h2>
            <p className="text-[10px] text-annapurna-ink-muted">
              Transactional Outbox pattern: all websocket broadcasts originate from committed PostgreSQL rows
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>PostgreSQL Verified</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {outboxEvents && outboxEvents.length > 0 ? (
            outboxEvents.slice(0, 6).map((evt: any) => (
              <div key={evt.id} className="p-2.5 rounded bg-annapurna-cream-paper border border-vintage text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] font-bold text-annapurna-terracotta">{evt.event_type}</span>
                  <span className="text-[9px] font-mono text-annapurna-ink-muted">
                    {new Date(evt.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <p className="text-[11px] text-annapurna-ink line-clamp-1 font-mono">
                  {JSON.stringify(evt.payload)}
                </p>
              </div>
            ))
          ) : (
            <div className="col-span-3 text-center py-4 text-xs text-annapurna-ink-muted">
              No outbox events recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
