'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Factory, 
  Play, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Layers, 
  Plus, 
  IndianRupee,
  ScrollText,
  Search,
  Filter,
  Check,
  Percent
} from 'lucide-react';
import { api } from '@/lib/api';

export default function ProductionPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'RUNS' | 'BOM' | 'NEW_RUN'>('RUNS');
  const [selectedBomId, setSelectedBomId] = useState<string>('');
  const [plannedQty, setPlannedQty] = useState<string>('200.0000');
  const [activeRunModal, setActiveRunModal] = useState<any | null>(null);

  // Form states for posting batch
  const [goodOutput, setGoodOutput] = useState<number>(188);
  const [damagedPouches, setDamagedPouches] = useState<number>(6);
  const [cartonsUsed, setCartonsUsed] = useState<number>(9);
  const [flourQty, setFlourQty] = useState<string>('40.0000');
  const [oilQty, setOilQty] = useState<string>('10.5000');
  const [spiceQty, setSpiceQty] = useState<string>('1.2000');
  const [labourCost, setLabourCost] = useState<string>('1200.00');
  const [gasPowerCost, setGasPowerCost] = useState<string>('600.00');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: products } = useQuery({
    queryKey: ['masters', 'products'],
    queryFn: () => api.masters.getProducts(),
  });

  const murukku = products?.find((p: any) => p.sku === 'MRK-200');

  const { data: bomData } = useQuery({
    queryKey: ['masters', 'bom', murukku?.id],
    queryFn: () => murukku ? api.masters.getBOMs(murukku.id) : null,
    enabled: !!murukku,
  });

  const { data: materials } = useQuery({
    queryKey: ['masters', 'materials'],
    queryFn: () => api.masters.getMaterials(),
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['production', 'runs'],
    queryFn: () => api.production.getRuns(),
  });

  const matMap: Record<string, any> = {};
  materials?.forEach((m: any) => { matMap[m.code] = m; });

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bomData) return;
    setIsSubmitting(true);
    try {
      const res = await api.production.createRun({
        bom_id: bomData.id,
        planned_quantity: plannedQty,
        notes: 'Batch scheduled via Production Desk'
      });
      queryClient.invalidateQueries({ queryKey: ['production'] });
      setActiveTab('RUNS');
      setActionNotice({ 
        type: 'success', 
        message: `Draft Production Run ${res.batch_number} created for ${plannedQty} packets.` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Error creating run: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostRun = async (runId: string) => {
    setIsSubmitting(true);
    try {
      const payload = {
        actual_good_output: goodOutput,
        damaged_pouches: damagedPouches,
        cartons_used: cartonsUsed,
        material_issues: [
          { material_id: matMap['MAT-FLOUR-01']?.id, actual_quantity: flourQty },
          { material_id: matMap['MAT-OIL-01']?.id, actual_quantity: oilQty },
          { material_id: matMap['MAT-SPICE-01']?.id, actual_quantity: spiceQty }
        ].filter(i => !!i.material_id),
        labour_cost: labourCost,
        gas_power_cost: gasPowerCost,
        other_overhead_cost: '0.00'
      };

      const res = await api.production.postRun(runId, payload);
      queryClient.invalidateQueries({ queryKey: ['production'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setActiveRunModal(null);
      setActionNotice({ 
        type: 'success', 
        message: `Batch ${res.batch_number} successfully posted! Yield: ${res.yield_variance_percent}%, Unit Cost: ₹${res.cost_per_packet}. Finished goods added to stock.` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Error posting batch: ${err.message}` });
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
            <h1 className="text-xl font-serif font-bold text-annapurna-ink">Floor Production & Batch Engine</h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
              SUPERVISOR DESK
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-0.5">
            Recipe BOM Master • Material Staging • Batch Execution • Yield & Cost Variance Reporting
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex rounded-md border border-vintage bg-white p-0.5">
            <button
              onClick={() => setActiveTab('RUNS')}
              className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                activeTab === 'RUNS' ? 'bg-annapurna-terracotta text-white shadow-xs' : 'text-annapurna-ink-muted hover:text-annapurna-ink'
              }`}
            >
              Batch Runs ({runs?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('BOM')}
              className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                activeTab === 'BOM' ? 'bg-annapurna-terracotta text-white shadow-xs' : 'text-annapurna-ink-muted hover:text-annapurna-ink'
              }`}
            >
              Recipe BOM Master
            </button>
            <button
              onClick={() => setActiveTab('NEW_RUN')}
              className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                activeTab === 'NEW_RUN' ? 'bg-annapurna-terracotta text-white shadow-xs' : 'text-annapurna-ink-muted hover:text-annapurna-ink'
              }`}
            >
              + Schedule Batch
            </button>
          </div>
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

      {/* Tab 1: Runs Table */}
      {activeTab === 'RUNS' && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Production Schedule & Execution Log</span>
            <span className="text-[10px] font-mono text-annapurna-ink-muted">Automated WAR Ingredient Allocation</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Batch #</th>
                  <th className="px-3 py-2.5">Recipe / Product</th>
                  <th className="px-3 py-2.5 text-right">Planned (pkts)</th>
                  <th className="px-3 py-2.5 text-right">Good Output</th>
                  <th className="px-3 py-2.5 text-right">Yield Variance</th>
                  <th className="px-3 py-2.5 text-right">Cost / Pkt</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {runs && runs.length > 0 ? (
                  runs.map((r: any) => {
                    const yieldNum = parseFloat(r.yield_variance_percent || '0');
                    const isYieldAlert = yieldNum < -2.0 || yieldNum > 2.0;
                    return (
                      <tr key={r.id} className="hover:bg-annapurna-cream/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-medium text-annapurna-ink">
                          {r.batch_number}
                        </td>
                        <td className="px-3 py-2.5 font-medium">{r.product_name || 'Murukku 200g'}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{r.planned_quantity}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-annapurna-ink">
                          {r.actual_good_output !== null ? r.actual_good_output : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {r.yield_variance_percent !== null ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                              isYieldAlert ? 'bg-red-50 text-red-700 border border-red-200' : 'text-emerald-700'
                            }`}>
                              {yieldNum > 0 ? `+${yieldNum}%` : `${yieldNum}%`}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-medium">
                          {r.cost_per_packet ? `₹${parseFloat(r.cost_per_packet).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            r.status === 'POSTED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                            'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.status === 'DRAFT' ? (
                            <button
                              onClick={() => setActiveRunModal(r)}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white shadow-xs"
                            >
                              Post Floor Run
                            </button>
                          ) : (
                            <span className="text-[11px] font-mono text-annapurna-ink-muted">Completed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-annapurna-ink-muted">
                      No production runs in ledger. Click "+ Schedule Batch" to launch a run.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Recipe BOM Master */}
      {activeTab === 'BOM' && bomData && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs p-6 space-y-4">
          <div className="border-b border-vintage pb-3">
            <h3 className="text-base font-serif font-bold text-annapurna-ink">{bomData.name}</h3>
            <p className="text-xs text-annapurna-ink-muted">
              Base Batch Standard: {bomData.base_quantity} packets ({bomData.batch_size_kg} kg flour dough)
            </p>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
              <tr>
                <th className="px-3 py-2">Ingredient Code</th>
                <th className="px-3 py-2">Material Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Standard Qty</th>
                <th className="px-3 py-2">UOM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vintage">
              {bomData.lines?.map((line: any) => (
                <tr key={line.id}>
                  <td className="px-3 py-2 font-mono text-annapurna-ink">{line.material_code}</td>
                  <td className="px-3 py-2 font-semibold text-annapurna-ink">{line.material_name}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-annapurna-ink-muted">{line.line_type}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-annapurna-ink">{line.quantity}</td>
                  <td className="px-3 py-2 font-mono text-annapurna-ink-muted">{line.uom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Schedule Batch Form */}
      {activeTab === 'NEW_RUN' && (
        <div className="max-w-lg mx-auto bg-white rounded-lg border border-vintage shadow-xs p-6 space-y-4">
          <div className="border-b border-vintage pb-3">
            <h3 className="text-base font-serif font-bold text-annapurna-ink">Schedule New Production Run</h3>
            <p className="text-xs text-annapurna-ink-muted">Issues draft batch number and reserves BOM materials</p>
          </div>

          <form onSubmit={handleCreateRun} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-annapurna-ink mb-1">Standard Product BOM</label>
              <input
                type="text"
                disabled
                value={bomData ? `${bomData.name} (Base 200 pkts)` : 'Murukku 200g BOM'}
                className="w-full p-2 bg-annapurna-cream-paper border border-vintage rounded text-annapurna-ink"
              />
            </div>

            <div>
              <label className="block font-semibold text-annapurna-ink mb-1">Planned Packets</label>
              <input
                type="number"
                value={plannedQty}
                onChange={(e) => setPlannedQty(e.target.value)}
                required
                className="w-full p-2 border border-vintage rounded font-mono focus:outline-none focus:border-annapurna-terracotta"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white font-semibold rounded shadow-xs transition-colors"
            >
              {isSubmitting ? 'Scheduling...' : 'Launch Batch Run'}
            </button>
          </form>
        </div>
      )}

      {/* Post Batch Run Modal */}
      {activeRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-vintage shadow-2xl w-full max-w-xl overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-vintage pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-annapurna-terracotta">POST ACTUAL FLOOR CONSUMPTION</span>
                <h3 className="text-base font-serif font-bold text-annapurna-ink">Batch {activeRunModal.batch_number}</h3>
              </div>
              <button onClick={() => setActiveRunModal(null)} className="text-xs text-annapurna-ink-muted hover:text-annapurna-ink">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Good Output (Packets)</label>
                <input
                  type="number"
                  value={goodOutput}
                  onChange={(e) => setGoodOutput(parseInt(e.target.value) || 0)}
                  className="w-full p-2 border border-vintage rounded font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Damaged Pouches (Scrap)</label>
                <input
                  type="number"
                  value={damagedPouches}
                  onChange={(e) => setDamagedPouches(parseInt(e.target.value) || 0)}
                  className="w-full p-2 border border-vintage rounded font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Actual Flour Used (kg)</label>
                <input
                  type="text"
                  value={flourQty}
                  onChange={(e) => setFlourQty(e.target.value)}
                  className="w-full p-2 border border-vintage rounded font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Actual Oil Used (litres)</label>
                <input
                  type="text"
                  value={oilQty}
                  onChange={(e) => setOilQty(e.target.value)}
                  className="w-full p-2 border border-vintage rounded font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Labour Cost (₹)</label>
                <input
                  type="text"
                  value={labourCost}
                  onChange={(e) => setLabourCost(e.target.value)}
                  className="w-full p-2 border border-vintage rounded font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Gas / Power Cost (₹)</label>
                <input
                  type="text"
                  value={gasPowerCost}
                  onChange={(e) => setGasPowerCost(e.target.value)}
                  className="w-full p-2 border border-vintage rounded font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-vintage">
              <button
                onClick={() => setActiveRunModal(null)}
                className="px-3 py-1.5 text-xs rounded border border-vintage hover:bg-annapurna-cream text-annapurna-ink"
              >
                Cancel
              </button>
              <button
                onClick={() => handlePostRun(activeRunModal.id)}
                disabled={isSubmitting}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white"
              >
                {isSubmitting ? 'Calculating & Posting...' : 'Commit Batch to Ledger'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
