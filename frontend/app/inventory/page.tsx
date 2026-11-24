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
  FileSpreadsheet,
  Filter,
  Warehouse
} from 'lucide-react';
import { api } from '@/lib/api';

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('60.0000');
  const [purchaseRate, setPurchaseRate] = useState('45.0000');
  const [notes, setNotes] = useState('Inward stock receipt via Purchase Desk');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
  const currentStock = 100.0;
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
      setActionNotice({ 
        type: 'success', 
        message: `Inward Purchase recorded. Updated Weighted-Average Rate (WAR): ₹${newWAR} / ${selectedMat?.uom || 'unit'}. Ledger entry committed.` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Purchase Inward Error: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const rawMaterials = summary?.raw_materials || [];
  const packagingMaterials = summary?.packaging_materials || [];
  const finishedGoods = summary?.finished_goods || [];

  return (
    <div className="space-y-6">
      {/* Enterprise Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-serif font-bold text-annapurna-ink">Warehouse & Immutable Stock Ledger</h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
              INVENTORY DESK
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-0.5">
            Raw Materials • Packaging Foil & Cartons • Finished Goods • Weighted-Average Valuation (WAR)
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="px-3 py-1.5 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Inward Stock</span>
          </button>
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

      {/* Stock Category Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-vintage p-4 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-annapurna-ink-muted uppercase">
            <span>Raw Materials (Ingredients)</span>
            <span className="text-[10px] font-mono bg-annapurna-cream px-1 rounded text-annapurna-terracotta">
              {rawMaterials.length} Items
            </span>
          </div>
          <div className="divide-y divide-vintage/60 text-xs">
            {rawMaterials.map((m: any) => (
              <div key={m.material_id} className="py-2 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-annapurna-ink">{m.material_name}</div>
                  <div className="text-[10px] text-annapurna-ink-muted font-mono">WAR: ₹{parseFloat(m.valuation_rate).toFixed(2)}/{m.uom}</div>
                </div>
                <div className="text-right font-mono font-bold text-annapurna-ink">
                  {parseFloat(m.quantity_on_hand).toFixed(2)} {m.uom}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-vintage p-4 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-annapurna-ink-muted uppercase">
            <span>Packaging Materials</span>
            <span className="text-[10px] font-mono bg-blue-50 px-1 rounded text-blue-700">
              {packagingMaterials.length} Items
            </span>
          </div>
          <div className="divide-y divide-vintage/60 text-xs">
            {packagingMaterials.map((m: any) => (
              <div key={m.material_id} className="py-2 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-annapurna-ink">{m.material_name}</div>
                  <div className="text-[10px] text-annapurna-ink-muted font-mono">WAR: ₹{parseFloat(m.valuation_rate).toFixed(2)}/{m.uom}</div>
                </div>
                <div className="text-right font-mono font-bold text-annapurna-ink">
                  {parseFloat(m.quantity_on_hand).toFixed(0)} {m.uom}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-vintage p-4 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-annapurna-ink-muted uppercase">
            <span>Finished Goods (Dispatches)</span>
            <span className="text-[10px] font-mono bg-emerald-50 px-1 rounded text-emerald-700">
              {finishedGoods.length} Products
            </span>
          </div>
          <div className="divide-y divide-vintage/60 text-xs">
            {finishedGoods.map((fg: any) => (
              <div key={fg.product_id} className="py-2 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-annapurna-ink">{fg.product_name}</div>
                  <div className="text-[10px] text-annapurna-ink-muted font-mono">SKU: {fg.sku}</div>
                </div>
                <div className="text-right font-mono font-bold text-annapurna-ink">
                  {parseFloat(fg.quantity_on_hand).toFixed(0)} pkts
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Immutable Stock Movement Ledger Table */}
      <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-vintage bg-annapurna-cream-paper/50 flex justify-between items-center">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">
              Append-Only Stock Ledger History
            </h2>
            <p className="text-[10px] text-annapurna-ink-muted">All physical movements commit immutable debit/credit ledger records</p>
          </div>
          <span className="text-[10px] font-mono text-annapurna-ink-muted">Last 100 Transactions</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
              <tr>
                <th className="px-4 py-2.5">Date & Time</th>
                <th className="px-3 py-2.5">Item Code & Name</th>
                <th className="px-3 py-2.5 text-center">Movement Type</th>
                <th className="px-3 py-2.5 text-right">Inward (+)</th>
                <th className="px-3 py-2.5 text-right">Outward (-)</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
                <th className="px-3 py-2.5 text-right">Valuation Rate</th>
                <th className="px-4 py-2.5">Ref / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vintage">
              {ledger && ledger.length > 0 ? (
                ledger.map((l: any) => {
                  const isInward = parseFloat(l.inward_quantity || '0') > 0;
                  return (
                    <tr key={l.id} className="hover:bg-annapurna-cream/40 transition-colors">
                      <td className="px-4 py-2 font-mono text-annapurna-ink-muted text-[11px]">
                        {new Date(l.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2 font-medium text-annapurna-ink">
                        {l.item_name || l.material_code || 'Inventory Movement'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          l.movement_type === 'PURCHASE' ? 'bg-blue-50 text-blue-800' :
                          l.movement_type === 'PRODUCTION_IN' ? 'bg-emerald-50 text-emerald-800' :
                          l.movement_type === 'PRODUCTION_OUT' ? 'bg-amber-50 text-amber-800' :
                          'bg-purple-50 text-purple-800'
                        }`}>
                          {l.movement_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700 font-bold">
                        {parseFloat(l.inward_quantity || '0') > 0 ? `+${parseFloat(l.inward_quantity).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-red-700 font-bold">
                        {parseFloat(l.outward_quantity || '0') > 0 ? `-${parseFloat(l.outward_quantity).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-annapurna-ink">
                        {parseFloat(l.balance_quantity || '0').toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-annapurna-ink">
                        ₹{parseFloat(l.valuation_rate || '0').toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-annapurna-ink-muted text-[11px] truncate max-w-xs">
                        {l.notes || l.reference_id || 'System movement'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-annapurna-ink-muted">
                    No ledger transactions logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Inward Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-vintage shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-vintage pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-annapurna-terracotta">STOCK RECEIPT</span>
                <h3 className="text-base font-serif font-bold text-annapurna-ink">Record Inward Raw Material</h3>
              </div>
              <button onClick={() => setShowPurchaseModal(false)} className="text-xs text-annapurna-ink-muted hover:text-annapurna-ink">✕</button>
            </div>

            <form onSubmit={handlePurchaseSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Select Material</label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  required
                  className="w-full p-2 border border-vintage rounded bg-white text-annapurna-ink"
                >
                  <option value="">-- Choose Material --</option>
                  {materials?.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.code} - {m.name} ({m.uom})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Purchase Quantity</label>
                  <input
                    type="text"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                    required
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Invoice Rate (₹/unit)</label>
                  <input
                    type="text"
                    value={purchaseRate}
                    onChange={(e) => setPurchaseRate(e.target.value)}
                    required
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
              </div>

              {/* WAR calculation preview */}
              <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1 text-[11px] font-mono">
                <div className="flex justify-between text-annapurna-ink-muted">
                  <span>Current Floor Rate:</span>
                  <span>₹{currentRate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-annapurna-terracotta pt-1 border-t border-vintage">
                  <span>New Weighted-Average Rate (WAR):</span>
                  <span>₹{newWAR}</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Supplier / PO Reference</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2 border border-vintage rounded"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-vintage">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-3 py-1.5 text-xs rounded border border-vintage hover:bg-annapurna-cream text-annapurna-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold rounded bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white"
                >
                  {isSubmitting ? 'Posting...' : 'Commit Inward to Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
