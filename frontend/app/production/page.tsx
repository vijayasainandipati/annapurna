'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  AlertTriangle,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { api } from '@/lib/api';

function ProductionContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'RUNS' | 'BOM' | 'NEW_RUN'>('RUNS');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [plannedQty, setPlannedQty] = useState<string>('200.0000');
  const [batchNotes, setBatchNotes] = useState<string>('Scheduled shift production run');
  const [selectedRunDetail, setSelectedRunDetail] = useState<any | null>(null);
  const [activeRunModal, setActiveRunModal] = useState<any | null>(null);

  // Modal state for posting active DRAFT batch
  const [goodOutput, setGoodOutput] = useState<number>(194);
  const [damagedPouches, setDamagedPouches] = useState<number>(4);
  const [cartonsUsed, setCartonsUsed] = useState<number>(9);
  const [materialActuals, setMaterialActuals] = useState<Record<string, string>>({});
  const [labourCost, setLabourCost] = useState<string>('1200.00');
  const [gasPowerCost, setGasPowerCost] = useState<string>('600.00');
  const [overheadCost, setOverheadCost] = useState<string>('0.00');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'bom') setActiveTab('BOM');
    else if (t === 'new') setActiveTab('NEW_RUN');
  }, [searchParams]);

  const { data: products } = useQuery({
    queryKey: ['masters', 'products'],
    queryFn: () => api.masters.getProducts(),
  });

  useEffect(() => {
    if (products && products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  const { data: bomData } = useQuery({
    queryKey: ['masters', 'bom', selectedProductId],
    queryFn: () => (selectedProductId ? api.masters.getBOMs(selectedProductId) : null),
    enabled: !!selectedProductId,
  });

  const modalProdId = activeRunModal?.product_id || '';
  const { data: modalBom } = useQuery({
    queryKey: ['masters', 'bom', modalProdId],
    queryFn: () => (modalProdId ? api.masters.getBOMs(modalProdId) : null),
    enabled: !!modalProdId,
  });

  useEffect(() => {
    if (activeRunModal && modalBom?.lines) {
      const defaults: Record<string, string> = {};
      modalBom.lines.forEach((line: any) => {
        if (line.material?.category === 'RAW_MATERIAL') {
          defaults[line.material_id] = String(line.planned_quantity);
        }
      });
      setMaterialActuals(defaults);
      setGoodOutput(Math.max(1, Math.round(parseFloat(activeRunModal.planned_quantity) * 0.97)));
      setDamagedPouches(4);
      setCartonsUsed(Math.floor(Math.round(parseFloat(activeRunModal.planned_quantity) * 0.97) / 20));
    }
  }, [activeRunModal, modalBom]);

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['production', 'runs'],
    queryFn: () => api.production.getRuns(),
  });

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bomData) return;
    setIsSubmitting(true);
    try {
      const res = await api.production.createRun({
        bom_id: bomData.id,
        planned_quantity: plannedQty,
        notes: batchNotes || 'Scheduled via Production Desk'
      });
      await queryClient.invalidateQueries({ queryKey: ['production'] });
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
      const issuesPayload = Object.entries(materialActuals)
        .filter(([, qty]) => parseFloat(qty) > 0)
        .map(([material_id, actual_quantity]) => ({ material_id, actual_quantity }));

      const res = await api.production.postRun(runId, {
        actual_good_output: goodOutput,
        damaged_pouches: damagedPouches,
        cartons_used: cartonsUsed,
        material_issues: issuesPayload,
        labour_cost: labourCost,
        gas_power_cost: gasPowerCost,
        other_overhead_cost: overheadCost
      });
      await queryClient.invalidateQueries({ queryKey: ['production'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
      setActiveRunModal(null);
      setSelectedRunDetail(res);
      setActionNotice({ 
        type: 'success', 
        message: `Batch ${res.batch_number} posted! Yield Var: ${res.yield_variance_percent}%, Unit Cost: ₹${res.cost_per_packet}/pkt. Finished goods added to stock.` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Error posting batch: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProduct = products?.find((p: any) => p.id === selectedProductId);

  return (
    <div className="space-y-6">
      {/* Enterprise Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-serif font-bold text-annapurna-ink">Floor Production &amp; Batch Engine</h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
              SUPERVISOR DESK
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-0.5">
            Recipe BOM Master • Material Staging • Batch Execution • Yield &amp; Cost Variance Reporting
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
          <button onClick={() => setActionNotice(null)} className="underline font-semibold ml-4 shrink-0">Dismiss</button>
        </div>
      )}

      {/* Tab 1: Runs Table + Selected Run Cost/Variance Drawer */}
      {activeTab === 'RUNS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`${selectedRunDetail ? 'lg:col-span-2' : 'lg:col-span-3'} bg-white rounded-lg border border-vintage shadow-xs overflow-hidden`}>
            <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Production Schedule &amp; Execution Log</span>
              <span className="text-[10px] font-mono text-annapurna-ink-muted">Click any row to inspect BOM consumption &amp; costing</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                  <tr>
                    <th className="px-4 py-2.5">Batch #</th>
                    <th className="px-3 py-2.5">Product</th>
                    <th className="px-3 py-2.5 text-right">Planned</th>
                    <th className="px-3 py-2.5 text-right">Good Output</th>
                    <th className="px-3 py-2.5 text-right">Yield Var %</th>
                    <th className="px-3 py-2.5 text-right">Cost / Pkt</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vintage">
                  {runsLoading ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-annapurna-ink-muted">Loading batches...</td></tr>
                  ) : runs && runs.length > 0 ? (
                    runs.map((r: any) => {
                      const yieldNum = parseFloat(r.yield_variance_percent || '0');
                      const isPosted = r.status === 'POSTED';
                      const isYieldAlert = isPosted && r.is_yield_alert;
                      return (
                        <tr 
                          key={r.id} 
                          onClick={() => setSelectedRunDetail(r)}
                          className={`cursor-pointer transition-colors ${selectedRunDetail?.id === r.id ? 'bg-annapurna-cream' : 'hover:bg-annapurna-cream/40'}`}
                        >
                          <td className="px-4 py-2.5 font-mono font-medium text-annapurna-ink">
                            {r.batch_number}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-annapurna-ink">{r.product_name}</div>
                            <div className="text-[10px] font-mono text-annapurna-ink-muted">{r.product_sku}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">{parseFloat(r.planned_quantity).toFixed(0)}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-annapurna-ink">
                            {isPosted ? r.actual_good_output : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {isPosted ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                isYieldAlert ? 'bg-red-50 text-red-700 border border-red-200' : 'text-emerald-700'
                              }`}>
                                {yieldNum > 0 ? `+${yieldNum.toFixed(2)}%` : `${yieldNum.toFixed(2)}%`}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium">
                            {isPosted ? `₹${parseFloat(r.cost_per_packet).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              isPosted ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {r.status === 'DRAFT' ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveRunModal(r);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white shadow-xs"
                              >
                                Post Floor Run
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRunDetail(r);
                                }}
                                className="px-2 py-1 text-[11px] font-semibold rounded bg-white hover:bg-annapurna-cream border border-vintage text-annapurna-ink inline-flex items-center space-x-1"
                              >
                                <span>Variance</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-annapurna-ink-muted">
                        No production runs in ledger. Click &quot;+ Schedule Batch&quot; to launch a run.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected Batch Variance & Cost Breakdown Side Panel */}
          {selectedRunDetail && (
            <div className="bg-white rounded-lg border border-vintage shadow-xs p-4 space-y-4 h-fit">
              <div className="flex justify-between items-start border-b border-vintage pb-3">
                <div>
                  <span className="text-[10px] font-mono uppercase font-bold text-annapurna-terracotta">BATCH AUDIT CARD</span>
                  <h3 className="text-base font-serif font-bold text-annapurna-ink">{selectedRunDetail.batch_number}</h3>
                  <p className="text-xs text-annapurna-ink-muted">{selectedRunDetail.product_name}</p>
                </div>
                <button onClick={() => setSelectedRunDetail(null)} className="text-xs text-annapurna-ink-muted hover:text-annapurna-ink">✕</button>
              </div>

              {selectedRunDetail.status === 'POSTED' ? (
                <>
                  {/* Material Variances */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-annapurna-ink">Raw Material Variances</h4>
                    <div className="rounded border border-vintage bg-annapurna-cream-paper divide-y divide-vintage text-xs">
                      {selectedRunDetail.variances?.map((v: any) => (
                        <div key={v.item_code} className="p-2 flex justify-between items-center">
                          <div>
                            <div className="font-semibold text-annapurna-ink flex items-center space-x-1">
                              <span>{v.item_name}</span>
                              {v.is_alert && <AlertTriangle className="w-3 h-3 text-red-600" />}
                            </div>
                            <div className="text-[10px] font-mono text-annapurna-ink-muted">
                              Plan: {parseFloat(v.planned_quantity).toFixed(2)} vs Act: {parseFloat(v.actual_quantity).toFixed(2)} {v.unit}
                            </div>
                          </div>
                          <div className="text-right font-mono">
                            <div className={`text-[11px] font-bold ${v.is_alert ? 'text-red-700' : 'text-emerald-700'}`}>
                              {parseFloat(v.variance_percent) > 0 ? `+${v.variance_percent}%` : `${v.variance_percent}%`}
                            </div>
                            <div className="text-[10px] text-annapurna-ink-muted">₹{parseFloat(v.line_cost).toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cost & Scrap Breakdown */}
                  <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1 text-xs font-mono">
                    <div className="flex justify-between text-annapurna-ink-muted">
                      <span>Raw Materials:</span>
                      <span>₹{parseFloat(selectedRunDetail.material_cost).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-annapurna-ink-muted">
                      <span>Packaging ({selectedRunDetail.total_pouches_consumed} pcs / {selectedRunDetail.cartons_used} ctn):</span>
                      <span>₹{parseFloat(selectedRunDetail.packaging_cost).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-annapurna-ink-muted">
                      <span>Labour &amp; Gas Overheads:</span>
                      <span>₹{(parseFloat(selectedRunDetail.labour_cost) + parseFloat(selectedRunDetail.gas_power_cost) + parseFloat(selectedRunDetail.other_overhead_cost)).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-annapurna-ink-muted">
                      <span>Scrap / Loose Packets:</span>
                      <span>{selectedRunDetail.damaged_pouches} dmg / {selectedRunDetail.loose_packets_exception} loose</span>
                    </div>
                    <div className="flex justify-between font-bold text-annapurna-ink pt-1 border-t border-vintage">
                      <span>Total Cost (₹{parseFloat(selectedRunDetail.cost_per_packet).toFixed(2)}/pkt):</span>
                      <span>₹{parseFloat(selectedRunDetail.total_batch_cost).toFixed(2)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    Batch is currently in <strong>DRAFT</strong> state. Materials will be deducted from the ledger upon posting.
                  </div>
                  <button
                    onClick={() => setActiveRunModal(selectedRunDetail)}
                    className="w-full py-2 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white font-semibold text-xs rounded"
                  >
                    Post Actual Consumption &amp; Output
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Recipe BOM Master */}
      {activeTab === 'BOM' && (
        <div className="bg-white rounded-lg border border-vintage shadow-xs p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-vintage pb-3">
            <div>
              <h3 className="text-base font-serif font-bold text-annapurna-ink">
                {selectedProduct ? `${selectedProduct.name} (${selectedProduct.sku})` : 'Recipe BOM Master'}
              </h3>
              <p className="text-xs text-annapurna-ink-muted">
                {bomData ? `Recipe Version ${bomData.version} • Standard Batch Output: ${parseFloat(bomData.batch_output_units).toFixed(0)} packets (200g)` : 'Loading BOM...'}
              </p>
            </div>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="p-2 text-xs border border-vintage rounded bg-annapurna-cream-paper font-semibold text-annapurna-ink"
            >
              {products?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {bomData && (
            <table className="w-full text-left text-xs">
              <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
                <tr>
                  <th className="px-3 py-2">Ingredient Code</th>
                  <th className="px-3 py-2">Material Name</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Standard Qty</th>
                  <th className="px-3 py-2">UOM</th>
                  <th className="px-3 py-2 text-right">Current WAR Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vintage">
                {bomData.lines?.map((line: any) => (
                  <tr key={line.id} className="hover:bg-annapurna-cream/40">
                    <td className="px-3 py-2 font-mono text-annapurna-ink">{line.material?.code}</td>
                    <td className="px-3 py-2 font-semibold text-annapurna-ink">{line.material?.name}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-annapurna-ink-muted">{line.material?.category}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-annapurna-ink">{parseFloat(line.planned_quantity).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-annapurna-ink-muted">{line.unit}</td>
                    <td className="px-3 py-2 text-right font-mono">₹{parseFloat(line.material?.current_valuation_rate || '0').toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Schedule Batch Form */}
      {activeTab === 'NEW_RUN' && (
        <div className="max-w-lg mx-auto bg-white rounded-lg border border-vintage shadow-xs p-6 space-y-4">
          <div className="border-b border-vintage pb-3">
            <h3 className="text-base font-serif font-bold text-annapurna-ink">Schedule New Production Run</h3>
            <p className="text-xs text-annapurna-ink-muted">Issues draft batch number and prepares BOM raw material issues</p>
          </div>

          <form onSubmit={handleCreateRun} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-annapurna-ink mb-1">Select Product &amp; Recipe BOM</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                required
                className="w-full p-2 bg-annapurna-cream-paper border border-vintage rounded text-annapurna-ink font-medium"
              >
                {products?.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} (₹{parseFloat(p.base_selling_price).toFixed(2)} base)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-annapurna-ink mb-1">Planned Output (Packets)</label>
              <input
                type="number"
                value={plannedQty}
                onChange={(e) => setPlannedQty(e.target.value)}
                required
                className="w-full p-2 border border-vintage rounded font-mono focus:outline-none focus:border-annapurna-terracotta"
              />
            </div>

            <div>
              <label className="block font-semibold text-annapurna-ink mb-1">Shift / Batch Notes</label>
              <input
                type="text"
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                className="w-full p-2 border border-vintage rounded focus:outline-none focus:border-annapurna-terracotta"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !bomData}
              className="w-full py-2.5 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white font-semibold rounded shadow-xs transition-colors"
            >
              {isSubmitting ? 'Scheduling...' : 'Launch Batch Run'}
            </button>
          </form>
        </div>
      )}

      {/* Post Batch Run Modal (Dynamic BOM Raw Material Inputs) */}
      {activeRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-vintage shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-vintage pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-annapurna-terracotta">POST ACTUAL FLOOR CONSUMPTION</span>
                <h3 className="text-base font-serif font-bold text-annapurna-ink">
                  {activeRunModal.batch_number} — {activeRunModal.product_name}
                </h3>
              </div>
              <button onClick={() => setActiveRunModal(null)} className="text-xs text-annapurna-ink-muted hover:text-annapurna-ink">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Good Output (pkts)</label>
                  <input
                    type="number"
                    value={goodOutput}
                    onChange={(e) => setGoodOutput(parseInt(e.target.value) || 0)}
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Damaged Pouches</label>
                  <input
                    type="number"
                    value={damagedPouches}
                    onChange={(e) => setDamagedPouches(parseInt(e.target.value) || 0)}
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Cartons Used</label>
                  <input
                    type="number"
                    value={cartonsUsed}
                    onChange={(e) => setCartonsUsed(parseInt(e.target.value) || 0)}
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-annapurna-ink uppercase tracking-wider text-[11px]">Raw Material Issues</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-annapurna-cream-paper p-3 rounded border border-vintage">
                  {modalBom?.lines
                    ?.filter((l: any) => l.material?.category === 'RAW_MATERIAL')
                    .map((line: any) => (
                      <div key={line.material_id}>
                        <label className="block font-medium text-annapurna-ink mb-1">
                          {line.material.name} (Plan: {parseFloat(line.planned_quantity).toFixed(2)} {line.unit})
                        </label>
                        <input
                          type="text"
                          value={materialActuals[line.material_id] ?? String(line.planned_quantity)}
                          onChange={(e) =>
                            setMaterialActuals((prev) => ({ ...prev, [line.material_id]: e.target.value }))
                          }
                          className="w-full p-1.5 bg-white border border-vintage rounded font-mono"
                        />
                      </div>
                    ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
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
                  <label className="block font-semibold text-annapurna-ink mb-1">Gas / Power (₹)</label>
                  <input
                    type="text"
                    value={gasPowerCost}
                    onChange={(e) => setGasPowerCost(e.target.value)}
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Other Overhead (₹)</label>
                  <input
                    type="text"
                    value={overheadCost}
                    onChange={(e) => setOverheadCost(e.target.value)}
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
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

export default function ProductionPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs font-mono text-annapurna-ink-muted">Loading Production Desk...</div>}>
      <ProductionContent />
    </Suspense>
  );
}
