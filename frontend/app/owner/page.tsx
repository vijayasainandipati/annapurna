'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  Package, 
  CheckCircle, 
  Clock, 
  IndianRupee,
  Factory,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Download,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';

export default function OwnerDashboard() {
  const [dateFilter, setDateFilter] = useState('TODAY');

  const { data: inventory, isLoading: invLoading, refetch: refetchInv } = useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => api.inventory.getSummary(),
  });

  const { data: receivables, isLoading: recLoading, refetch: refetchRec } = useQuery({
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

  const { data: outboxEvents } = useQuery({
    queryKey: ['realtime', 'events'],
    queryFn: () => api.realtime.getEvents(),
  });

  const handleRefreshAll = () => {
    refetchInv();
    refetchRec();
    refetchVar();
    refetchSales();
  };

  const totalSales = salesRegister?.total_sales || '0.00';
  const totalReceivables = receivables?.total_receivables || '0.00';
  const totalValuation = inventory?.total_inventory_value || '0.00';
  const totalProductionPkts = varianceReport?.total_actual_output_pkts || '0';

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
          <a
            href="/api/v1/reports/sales-register?format=excel"
            download
            className="px-2.5 py-1.5 rounded-md border border-vintage bg-white hover:bg-annapurna-cream text-xs font-semibold text-annapurna-ink flex items-center space-x-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-annapurna-ink-muted" />
            <span>Export Financial Ledger (.xlsx)</span>
          </a>
        </div>
      </div>

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
            <span>Orders: {salesRegister?.invoices?.length || 0} Invoices</span>
            <span className="text-emerald-700 font-medium">Active Ledger</span>
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
            <span>Customers with Balance: {receivables?.total_customers_with_dues || 0}</span>
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
            <span>Raw + Pack + FG</span>
            <span className="text-annapurna-terracotta font-medium">Weighted Avg Rate</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-vintage shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs text-annapurna-ink-muted font-medium">
            <span>BATCH OUTPUT (PACKETS)</span>
            <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1 rounded">RUNS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-annapurna-ink">
            {parseInt(totalProductionPkts).toLocaleString('en-IN')} <span className="text-sm font-sans font-normal text-annapurna-ink-muted">pkts</span>
          </div>
          <div className="text-[10px] text-annapurna-ink-muted flex items-center justify-between">
            <span>Completed Batches: {varianceReport?.runs?.length || 0}</span>
            <span className="text-blue-700 font-medium">Factory Floor</span>
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
                Production Runs & Yield Variances
              </h2>
              <p className="text-[10px] text-annapurna-ink-muted">Monitored tolerance: ±2.0% on yield & raw ingredients</p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-ink-muted border border-vintage">
              Automated Costing
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-4 py-2">Batch #</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Planned</th>
                  <th className="px-3 py-2 text-right">Actual Output</th>
                  <th className="px-3 py-2 text-right">Yield Var %</th>
                  <th className="px-3 py-2 text-right">Unit Cost</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {varianceReport?.runs && varianceReport.runs.length > 0 ? (
                  varianceReport.runs.map((r: any) => {
                    const yieldNum = parseFloat(r.yield_variance_percent || '0');
                    const isYieldAlert = yieldNum < -2.0 || yieldNum > 2.0;
                    return (
                      <tr key={r.batch_number} className="hover:bg-annapurna-cream/50 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-medium text-annapurna-ink">
                          {r.batch_number}
                        </td>
                        <td className="px-3 py-2.5 font-medium">{r.product_name}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{r.planned_quantity}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-annapurna-ink">
                          {r.actual_good_output}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-[11px] ${
                            isYieldAlert ? 'bg-red-50 text-red-700 font-bold border border-red-200' : 'text-emerald-700'
                          }`}>
                            {yieldNum > 0 ? `+${yieldNum}%` : `${yieldNum}%`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-annapurna-ink font-medium">
                          ₹{parseFloat(r.cost_per_packet || '0').toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {r.status}
                          </span>
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
              receivables.customers.map((c: any) => (
                <div key={c.customer_id} className="p-3 hover:bg-annapurna-cream/40 transition-colors space-y-1">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-annapurna-ink leading-tight">{c.customer_name}</span>
                    <span className="font-mono text-xs font-bold text-annapurna-terracotta">
                      ₹{parseFloat(c.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-[10px] text-annapurna-ink-muted flex justify-between items-center">
                    <span>Credit Limit: ₹{parseFloat(c.credit_limit || '0').toLocaleString('en-IN')}</span>
                    <span className="font-mono text-[9px] bg-annapurna-cream px-1 rounded">
                      {c.city}, {c.state}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs text-annapurna-ink-muted">
                No active outstanding receivables.
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
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
            PostgreSQL Verified
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {outboxEvents?.slice(0, 6).map((evt: any) => (
            <div key={evt.id} className="p-2.5 rounded bg-annapurna-cream-paper border border-vintage text-xs space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-mono text-[10px] font-bold text-annapurna-terracotta">{evt.event_type}</span>
                <span className="text-[9px] font-mono text-annapurna-ink-muted">
                  {new Date(evt.created_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-[11px] text-annapurna-ink line-clamp-1 font-mono">
                {JSON.stringify(evt.payload)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
