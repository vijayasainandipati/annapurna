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
  IndianRupee 
} from 'lucide-react';
import { api } from '@/lib/api';

export default function ProductionPage() {
  const queryClient = useQueryClient();
  const [selectedBomId, setSelectedBomId] = useState<string>('');
  const [plannedQty, setPlannedQty] = useState<string>('200.0000');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Form states for posting batch
  const [goodOutput, setGoodOutput] = useState<number>(188);
  const [damagedPouches, setDamagedPouches] = useState<number>(6);
  const [cartonsUsed, setCartonsUsed] = useState<number>(9);
  const [flourQty, setFlourQty] = useState<string>('40.0000');
  const [oilQty, setOilQty] = useState<string>('10.5000');
  const [spiceQty, setSpiceQty] = useState<string>('1.2000');
  const [labourCost, setLabourCost] = useState<string>('1200.00');
  const [gasPowerCost, setGasPowerCost] = useState<string>('600.00');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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

  const { data: runs } = useQuery({
    queryKey: ['production', 'runs'],
    queryFn: () => api.production.getRuns(),
  });

  // Material map
  const matMap: Record<string, any> = {};
  materials?.forEach((m: any) => { matMap[m.code] = m; });

  // Handle Create Run
  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bomData) return;
    try {
      const res = await api.production.createRun({
        bom_id: bomData.id,
        planned_quantity: plannedQty,
        notes: 'Murukku 200g Canonical Batch'
      });
      setActiveRunId(res.run_id);
      queryClient.invalidateQueries({ queryKey: ['production'] });
      setActionMessage(`Draft Production Run ${res.batch_number} created.`);
    } catch (err: any) {
      alert(`Error creating run: ${err.message}`);
    }
  };

  // Handle Post Run
  const handlePostRun = async (runId: string) => {
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
      setActionMessage(`Batch ${res.batch_number} posted! Yield: ${res.yield_variance_percent}%, Unit Cost: ₹${res.cost_per_packet}`);
    } catch (err: any) {
      alert(`Error posting batch: ${err.message}`);
    }
  };

  // Live calculations preview
  const plannedVal = parseFloat(plannedQty) || 200;
  const yieldVariance = (((goodOutput - plannedVal) / plannedVal) * 100).toFixed(2);
  const totalPouches = goodOutput + damagedPouches;
  const scrapPercent = totalPouches > 0 ? ((damagedPouches / totalPouches) * 100).toFixed(2) : '0.00';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-vintage pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-serif font-bold text-annapurna-ink flex items-center space-x-2">
            <Factory className="w-6 h-6 text-annapurna-terracotta" />
            <span>Production & Recipe BOM Engine</span>
          </h1>
          <p className="text-xs text-annapurna-ink-muted mt-1">
            Batch Manufacturing • Recipe Ingredients • Scrap Accounting • Canonical Batch Costing
          </p>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-annapurna-cream border border-annapurna-terracotta/30 text-annapurna-terracotta text-xs font-semibold rounded-lg flex justify-between items-center">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="underline text-annapurna-ink">Dismiss</button>
        </div>
      )}

      {/* Recipe BOM Standard Reference Card */}
      <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-3">
        <div className="flex justify-between items-center">
          <div className="font-serif font-bold text-sm text-annapurna-ink flex items-center space-x-2">
            <Layers className="w-4 h-4 text-annapurna-brass-dark" />
            <span>Active Standard BOM: Murukku 200g (Recipe v1.0)</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-annapurna-cream font-semibold text-annapurna-terracotta border border-annapurna-terracotta/20">
            Standard Batch Output: 200 packets
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs pt-1">
          <div className="p-2.5 rounded bg-annapurna-cream/40 border border-vintage">
            <div className="text-annapurna-ink-muted font-medium">Rice Flour Grade A</div>
            <div className="font-bold text-annapurna-ink mt-0.5">40.00 kg</div>
          </div>
          <div className="p-2.5 rounded bg-annapurna-cream/40 border border-vintage">
            <div className="text-annapurna-ink-muted font-medium">Refined Cooking Oil</div>
            <div className="font-bold text-annapurna-ink mt-0.5">10.00 L</div>
          </div>
          <div className="p-2.5 rounded bg-annapurna-cream/40 border border-vintage">
            <div className="text-annapurna-ink-muted font-medium">Spice Master Mix</div>
            <div className="font-bold text-annapurna-ink mt-0.5">1.20 kg</div>
          </div>
          <div className="p-2.5 rounded bg-annapurna-cream/40 border border-vintage">
            <div className="text-annapurna-ink-muted font-medium">Printed Pouches</div>
            <div className="font-bold text-annapurna-ink mt-0.5">200 pieces</div>
          </div>
          <div className="p-2.5 rounded bg-annapurna-cream/40 border border-vintage">
            <div className="text-annapurna-ink-muted font-medium">Corrugated Cartons</div>
            <div className="font-bold text-annapurna-ink mt-0.5">10 boxes (20pkts/box)</div>
          </div>
        </div>
      </div>

      {/* Batch Execution Desk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step 1: Initialize Batch */}
        <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
          <div className="font-serif font-bold text-base text-annapurna-ink flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-annapurna-terracotta text-white flex items-center justify-center text-xs">1</span>
            <span>Launch Production Batch</span>
          </div>

          <form onSubmit={handleCreateRun} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-annapurna-ink mb-1">Select Recipe BOM</label>
              <select
                disabled
                className="w-full p-2.5 rounded-lg border border-vintage bg-annapurna-cream-paper text-xs font-medium"
              >
                <option>{bomData ? `${bomData.product_name} (${bomData.version})` : 'Murukku 200g (v1.0)'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-annapurna-ink mb-1">Planned Target Packets</label>
              <input
                type="text"
                value={plannedQty}
                onChange={(e) => setPlannedQty(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-vintage bg-white text-xs font-medium"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white rounded-lg text-xs font-semibold shadow-sm flex items-center justify-center space-x-1.5"
            >
              <Play className="w-4 h-4" />
              <span>Create Draft Batch Run</span>
            </button>
          </form>
        </div>

        {/* Step 2: Post Actuals & Costing */}
        <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
          <div className="font-serif font-bold text-base text-annapurna-ink flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-annapurna-brass text-white flex items-center justify-center text-xs">2</span>
            <span>Record Floor Actuals & Variance</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold mb-1">Actual Good Packets</label>
              <input
                type="number"
                value={goodOutput}
                onChange={(e) => setGoodOutput(parseInt(e.target.value) || 0)}
                className="w-full p-2 rounded border border-vintage bg-white text-xs font-bold text-annapurna-terracotta"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Damaged Pouches</label>
              <input
                type="number"
                value={damagedPouches}
                onChange={(e) => setDamagedPouches(parseInt(e.target.value) || 0)}
                className="w-full p-2 rounded border border-vintage bg-white text-xs"
              />
            </div>
          </div>

          {/* Variances Live Display */}
          <div className="p-3 rounded-lg bg-annapurna-cream border border-vintage grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-annapurna-ink-muted">Yield Variance:</span>
              <div className={`font-bold text-sm ${parseFloat(yieldVariance) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {yieldVariance}%
              </div>
            </div>
            <div>
              <span className="text-annapurna-ink-muted">Packaging Scrap:</span>
              <div className="font-bold text-sm text-annapurna-ink">
                {scrapPercent}%
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1 text-xs">
            <div className="font-semibold text-annapurna-ink">Actual Ingredients Consumed:</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-annapurna-ink-muted">Flour (kg)</span>
                <input
                  type="text"
                  value={flourQty}
                  onChange={(e) => setFlourQty(e.target.value)}
                  className="w-full p-1.5 border border-vintage rounded text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-annapurna-ink-muted">Oil (L)</span>
                <input
                  type="text"
                  value={oilQty}
                  onChange={(e) => setOilQty(e.target.value)}
                  className="w-full p-1.5 border border-vintage rounded text-xs font-bold text-amber-700"
                />
              </div>
              <div>
                <span className="text-[10px] text-annapurna-ink-muted">Spice (kg)</span>
                <input
                  type="text"
                  value={spiceQty}
                  onChange={(e) => setSpiceQty(e.target.value)}
                  className="w-full p-1.5 border border-vintage rounded text-xs"
                />
              </div>
            </div>
          </div>

          {/* Ready to Post Buttons */}
          <div className="pt-2">
            {runs?.filter((r: any) => r.status === 'DRAFT').map((draft: any) => (
              <button
                key={draft.id}
                onClick={() => handlePostRun(draft.id)}
                className="w-full py-2.5 bg-annapurna-leaf hover:opacity-95 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center justify-center space-x-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Post Batch {draft.batch_number} (Atomic Deduct & FG Credit)</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Historical Batches Table */}
      <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
        <h2 className="font-serif font-bold text-base text-annapurna-ink">Recent Production Batches</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-annapurna-cream border-y border-vintage text-annapurna-ink-muted">
              <tr>
                <th className="py-2.5 px-3">Batch Number</th>
                <th className="py-2.5 px-3">Product</th>
                <th className="py-2.5 px-3">Standard / Actual</th>
                <th className="py-2.5 px-3">Yield Variance</th>
                <th className="py-2.5 px-3">Damaged Pouches</th>
                <th className="py-2.5 px-3">Total Cost</th>
                <th className="py-2.5 px-3">Unit Cost</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vintage">
              {runs?.map((r: any) => (
                <tr key={r.id} className="hover:bg-annapurna-cream/50 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-annapurna-terracotta">{r.batch_number}</td>
                  <td className="py-2.5 px-3 text-annapurna-ink">{r.product?.name || 'Murukku 200g'}</td>
                  <td className="py-2.5 px-3 font-medium">
                    {r.planned_quantity} / <strong>{r.actual_good_output}</strong> pkts
                  </td>
                  <td className={`py-2.5 px-3 font-bold ${parseFloat(r.yield_variance_percent) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {r.yield_variance_percent}%
                  </td>
                  <td className="py-2.5 px-3">{r.damaged_pouches} units</td>
                  <td className="py-2.5 px-3 font-medium">₹{parseFloat(r.total_batch_cost || 0).toFixed(2)}</td>
                  <td className="py-2.5 px-3 font-bold text-annapurna-terracotta">₹{parseFloat(r.cost_per_packet || 0).toFixed(2)}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                      {r.status}
                    </span>
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
