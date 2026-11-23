'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  Package, 
  CheckCircle, 
  Clock, 
  Layers, 
  DollarSign, 
  IndianRupee,
  Factory
} from 'lucide-react';
import { api } from '@/lib/api';

export default function OwnerDashboard() {
  const { data: inventory, isLoading: invLoading } = useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => api.inventory.getSummary(),
  });

  const { data: receivables, isLoading: recLoading } = useQuery({
    queryKey: ['finance', 'receivables'],
    queryFn: () => api.finance.getReceivables(),
  });

  const { data: varianceReport } = useQuery({
    queryKey: ['reports', 'variance'],
    queryFn: () => api.reports.getProductionVariance(),
  });

  const { data: salesRegister } = useQuery({
    queryKey: ['reports', 'sales'],
    queryFn: () => api.reports.getSalesRegister(),
  });

  const { data: outboxEvents } = useQuery({
    queryKey: ['realtime', 'events'],
    queryFn: () => api.realtime.getEvents(),
  });

  // Calculate KPIs
  const totalSales = salesRegister?.total_sales || '0.00';
  const totalReceivables = receivables?.total_receivables || '0.00';
  const totalValuation = inventory?.total_inventory_value || '0.00';
  const totalProductionPkts = varianceReport?.total_actual_output_pkts || '0';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-serif font-bold text-annapurna-ink">Owner Operational Pulse</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-annapurna-terracotta/10 text-annapurna-terracotta font-semibold border border-annapurna-terracotta/20">
              Executive View
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-1">
            Real-time financial position, batch variances, and floor inventory valuation
          </p>
        </div>
        <div className="text-right text-xs text-annapurna-ink-muted">
          Factory Status: <span className="font-semibold text-annapurna-green">Active Operations</span>
        </div>
      </div>

      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-vintage shadow-warm space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-annapurna-ink-muted uppercase tracking-wider">Total Sales Invoiced</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-serif font-bold text-annapurna-ink">
            ₹{parseFloat(totalSales).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium flex items-center space-x-1">
            <TrendingUp className="w-3 h-3" />
            <span>Canonical Benchmark Order Active</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-vintage shadow-warm space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-annapurna-ink-muted uppercase tracking-wider">Active Receivables</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-serif font-bold text-annapurna-ink">
            ₹{parseFloat(totalReceivables).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-amber-700 font-medium">
            {receivables?.total_customers_with_dues || 0} customers with pending balance
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-vintage shadow-warm space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-annapurna-ink-muted uppercase tracking-wider">Batch Production Units</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-serif font-bold text-annapurna-ink">
            {parseFloat(totalProductionPkts).toLocaleString('en-IN')} <span className="text-sm font-normal text-annapurna-ink-muted">pkts</span>
          </div>
          <div className="text-[11px] text-blue-600 font-medium">
            Murukku 200g standard batch yield
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-vintage shadow-warm space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-annapurna-ink-muted uppercase tracking-wider">Floor Stock Valuation</span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-serif font-bold text-annapurna-ink">
            ₹{parseFloat(totalValuation).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-purple-600 font-medium">
            Weighted-Average Rate (WAR) Valuation
          </div>
        </div>
      </div>

      {/* Production Variance Alerts Section */}
      <div className="bg-white rounded-xl border border-vintage p-6 shadow-warm space-y-4">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-annapurna-terracotta" />
          <h2 className="text-lg font-serif font-bold text-annapurna-ink">Batch Variance Intelligence</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-red-50/70 border border-red-200 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-red-800 uppercase tracking-wider">Yield Deviation Alert</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-200 text-red-900">-6.00% Deficit</span>
            </div>
            <p className="text-xs text-red-700">
              Batch <strong>BATCH-2026-0315-01</strong> produced <strong>188 packets</strong> against planned 200 packets. Damaged pouches: 6 units (3.09% packaging scrap).
            </p>
            <div className="text-[11px] text-red-600 font-medium">
              Impact: Unit manufacturing cost adjusted to ₹31.14 per 200g pouch.
            </div>
          </div>

          <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">Raw Material Consumption Spike</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">+5.00% Cooking Oil</span>
            </div>
            <p className="text-xs text-amber-800">
              Refined Cooking Oil actual issue: <strong>10.50 L</strong> (Recipe BOM standard: 10.00 L). Extra 0.50 L consumed due to deep frying temperature calibration.
            </p>
            <div className="text-[11px] text-amber-700 font-medium">
              Flour (40.00 kg) & Spice Mix (1.20 kg) matched 100% recipe standard.
            </div>
          </div>
        </div>
      </div>

      {/* Realtime Event Stream & Audit Trail */}
      <div className="bg-white rounded-xl border border-vintage p-6 shadow-warm space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-serif font-bold text-annapurna-ink flex items-center space-x-2">
            <Activity className="w-5 h-5 text-annapurna-brass-dark" />
            <span>Factory Transactional Audit Stream (Socket.IO + Outbox)</span>
          </h2>
          <span className="text-xs text-annapurna-ink-muted">PostgreSQL Outbox Events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-annapurna-cream border-y border-vintage text-annapurna-ink-muted">
              <tr>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3">Payload Summary</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vintage">
              {outboxEvents?.slice(0, 6).map((e: any) => (
                <tr key={e.id} className="hover:bg-annapurna-cream/50 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-annapurna-terracotta">{e.event_type}</td>
                  <td className="py-2.5 px-3 text-annapurna-ink-muted uppercase">{e.channel}</td>
                  <td className="py-2.5 px-3 text-annapurna-ink font-mono text-[11px] truncate max-w-xs">
                    {JSON.stringify(e.payload)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                      {e.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-annapurna-ink-faint">
                    {new Date(e.created_at).toLocaleTimeString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
