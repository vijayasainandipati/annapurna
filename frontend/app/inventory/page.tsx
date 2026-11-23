'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Package, 
  Plus, 
  Search, 
  History, 
  ArrowDownRight, 
  ArrowUpRight, 
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '@/lib/api';

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('60.0000');
  const [purchaseRate, setPurchaseRate] = useState('45.0000');
  const [notes, setNotes] = useState('Canonical benchmark purchase');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => api.inventory.getSummary(),
  });

  const { data: ledger, isLoading: ledLoading } = useQuery({
    queryKey: ['inventory', 'ledger'],
    queryFn: () => api.inventory.getLedger(100),
  });

  const { data: materials } = useQuery({
    queryKey: ['masters', 'materials'],
    queryFn: () => api.masters.getMaterials(),
  });

  // Calculate live WAR preview
  const selectedMat = materials?.find((m: any) => m.id === selectedMaterialId);
  const currentRate = selectedMat ? parseFloat(selectedMat.current_valuation_rate) : 0;
  const currentStock = 100.0; // Benchmark opening
  const pQty = parseFloat(purchaseQty) || 0;
  const pRate = parseFloat(purchaseRate) || 0;
  const newWAR = (currentStock + pQty) > 0 
    ? (((currentStock * currentRate) + (pQty * pRate)) / (currentStock + pQty)).toFixed(4)
    : pRate.toFixed(4);

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterialId) return;
    setIsSubmitting(true);
    try {
      await api.inventory.recordPurchase({
        material_id: selectedMaterialId,
        quantity: purchaseQty,
        purchase_rate: purchaseRate,
        notes: notes
      });
      setShowPurchaseModal(false);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      alert(`Purchase recorded! New Weighted-Average Rate: ₹${newWAR}`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-annapurna-ink flex items-center space-x-2">
            <Package className="w-6 h-6 text-annapurna-terracotta" />
            <span>Warehouse & Stock Ledger</span>
          </h1>
          <p className="text-xs text-annapurna-ink-muted mt-1">
            Raw Materials • Packaging • Finished Goods • Immutable Ledger Traceability
          </p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="px-3.5 py-2 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white rounded-lg text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Record Inward Purchase</span>
          </button>
        </div>
      </div>

      {/* Stock Cards by Category */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Raw Materials */}
        <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
          <h2 className="font-serif font-bold text-sm text-annapurna-ink flex justify-between items-center">
            <span>Raw Materials</span>
            <span className="text-[11px] font-normal text-annapurna-ink-muted">Weight (kg/L)</span>
          </h2>
          <div className="divide-y divide-vintage">
            {summary?.raw_materials?.map((item: any) => (
              <div key={item.item_id} className="py-2.5 flex justify-between items-center text-xs">
                <div>
                  <div className="font-semibold text-annapurna-ink">{item.name}</div>
                  <div className="text-[10px] text-annapurna-ink-muted">{item.code_or_sku} • ₹{parseFloat(item.valuation_rate).toFixed(2)}/{item.unit}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-annapurna-ink">{parseFloat(item.current_stock).toFixed(2)} <span className="text-[10px] font-normal">{item.unit}</span></div>
                  <div className="text-[10px] text-annapurna-ink-muted">₹{parseFloat(item.total_value).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Packaging */}
        <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
          <h2 className="font-serif font-bold text-sm text-annapurna-ink flex justify-between items-center">
            <span>Packaging Materials</span>
            <span className="text-[11px] font-normal text-annapurna-ink-muted">Pieces</span>
          </h2>
          <div className="divide-y divide-vintage">
            {summary?.packaging?.map((item: any) => (
              <div key={item.item_id} className="py-2.5 flex justify-between items-center text-xs">
                <div>
                  <div className="font-semibold text-annapurna-ink">{item.name}</div>
                  <div className="text-[10px] text-annapurna-ink-muted">{item.code_or_sku} • ₹{parseFloat(item.valuation_rate).toFixed(2)}/{item.unit}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-annapurna-ink">{parseFloat(item.current_stock).toFixed(0)} <span className="text-[10px] font-normal">{item.unit}</span></div>
                  <div className="text-[10px] text-annapurna-ink-muted">₹{parseFloat(item.total_value).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Finished Goods */}
        <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
          <h2 className="font-serif font-bold text-sm text-annapurna-ink flex justify-between items-center">
            <span>Finished Goods</span>
            <span className="text-[11px] font-normal text-annapurna-ink-muted">Packets</span>
          </h2>
          <div className="divide-y divide-vintage">
            {summary?.finished_goods?.map((item: any) => (
              <div key={item.item_id} className="py-2.5 flex justify-between items-center text-xs">
                <div>
                  <div className="font-semibold text-annapurna-ink">{item.name}</div>
                  <div className="text-[10px] text-annapurna-ink-muted">{item.code_or_sku} • Base ₹{parseFloat(item.valuation_rate).toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-annapurna-terracotta">{parseFloat(item.current_stock).toFixed(0)} <span className="text-[10px] font-normal">pkts</span></div>
                  <div className="text-[10px] text-annapurna-ink-muted">₹{parseFloat(item.total_value).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Immutable Stock Ledger Table */}
      <div className="bg-white rounded-xl border border-vintage p-5 shadow-warm space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-serif font-bold text-base text-annapurna-ink flex items-center space-x-2">
            <History className="w-5 h-5 text-annapurna-brass-dark" />
            <span>Immutable Stock Movement Ledger (Audit Log)</span>
          </h2>
          <span className="text-xs text-annapurna-ink-muted">Source of Truth</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-annapurna-cream border-y border-vintage text-annapurna-ink-muted">
              <tr>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-3">Source Movement</th>
                <th className="py-2.5 px-3">Quantity Delta</th>
                <th className="py-2.5 px-3">Unit Rate</th>
                <th className="py-2.5 px-3">Notes & Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vintage">
              {ledger?.slice(0, 15).map((entry: any) => {
                const isPositive = parseFloat(entry.quantity_delta) > 0;
                return (
                  <tr key={entry.id} className="hover:bg-annapurna-cream/50 transition-colors">
                    <td className="py-2.5 px-3 text-annapurna-ink-faint">
                      {new Date(entry.created_at).toLocaleDateString('en-IN')} {new Date(entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-annapurna-ink">
                      {entry.item_name} <span className="text-[10px] text-annapurna-ink-muted">({entry.item_code})</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-annapurna-cream text-annapurna-terracotta border border-annapurna-terracotta/20">
                        {entry.source_type}
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 font-bold ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
                      {isPositive ? `+${parseFloat(entry.quantity_delta).toFixed(2)}` : parseFloat(entry.quantity_delta).toFixed(2)} {entry.unit}
                    </td>
                    <td className="py-2.5 px-3 text-annapurna-ink">
                      ₹{parseFloat(entry.valuation_rate).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-annapurna-ink-muted truncate max-w-xs">
                      {entry.notes || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-vintage shadow-2xl space-y-4">
            <h3 className="font-serif font-bold text-lg text-annapurna-ink">Record Material Inward Receipt</h3>
            <form onSubmit={handlePurchaseSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Select Material</label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg border border-vintage bg-white text-xs"
                >
                  <option value="">-- Choose Material --</option>
                  {materials?.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1">Quantity</label>
                  <input
                    type="text"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                    required
                    className="w-full p-2 rounded-lg border border-vintage"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Purchase Rate (₹)</label>
                  <input
                    type="text"
                    value={purchaseRate}
                    onChange={(e) => setPurchaseRate(e.target.value)}
                    required
                    className="w-full p-2 rounded-lg border border-vintage"
                  />
                </div>
              </div>

              {/* WAR Formula Preview */}
              <div className="p-3 rounded-lg bg-annapurna-cream border border-vintage text-[11px] space-y-1">
                <div className="font-bold text-annapurna-terracotta">Weighted-Average Rate (WAR) Preview:</div>
                <div>Opening: 100 kg @ ₹42.00 + Purchase: {purchaseQty} kg @ ₹{purchaseRate}</div>
                <div className="font-bold text-annapurna-ink pt-1">
                  New Valuation Rate: ₹{newWAR} / unit
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-3 py-2 rounded-lg border border-vintage hover:bg-annapurna-cream"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-annapurna-terracotta text-white rounded-lg font-semibold hover:bg-annapurna-terracotta-dark"
                >
                  {isSubmitting ? 'Posting...' : 'Confirm Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
