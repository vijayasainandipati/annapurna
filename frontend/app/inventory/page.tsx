'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Search, 
  FileSpreadsheet,
  AlertTriangle
} from 'lucide-react';
import { api } from '@/lib/api';

function InventoryContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('60.0000');
  const [purchaseRate, setPurchaseRate] = useState('45.0000');
  const [supplierName, setSupplierName] = useState('Madurai Cauvery Rice Mills');
  const [supplierInv, setSupplierInv] = useState('MCRM-26-990');
  const [notes, setNotes] = useState('Inward stock receipt via Purchase Desk');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (searchParams.get('tab') === 'purchases') {
      setSourceFilter('PURCHASE_RECEIPT');
    }
  }, [searchParams]);

  const { data: summary } = useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => api.inventory.getSummary(),
  });

  const { data: ledger, isLoading: ledLoading } = useQuery({
    queryKey: ['inventory', 'ledger'],
    queryFn: () => api.inventory.getLedger(150),
  });

  const { data: materials } = useQuery({
    queryKey: ['masters', 'materials'],
    queryFn: () => api.masters.getMaterials(),
  });

  const rawMaterials = summary?.raw_materials || [];
  const packagingMaterials = summary?.packaging || [];
  const finishedGoods = summary?.finished_goods || [];
  const allStockItems = [...rawMaterials, ...packagingMaterials];

  const selectedStockItem = allStockItems.find((i: any) => i.id === selectedMaterialId);
  const selectedMat = materials?.find((m: any) => m.id === selectedMaterialId);
  const currentRate = selectedStockItem
    ? parseFloat(selectedStockItem.valuation_rate)
    : selectedMat
      ? parseFloat(selectedMat.current_valuation_rate)
      : 0;
  const currentStock = selectedStockItem ? parseFloat(selectedStockItem.current_stock) : 0;
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
      const res = await api.inventory.recordPurchase({
        material_id: selectedMaterialId,
        quantity: purchaseQty,
        purchase_rate: purchaseRate,
        supplier_name: supplierName,
        supplier_invoice_no: supplierInv,
        notes: notes
      });
      setShowPurchaseModal(false);
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['masters'] });
      setActionNotice({ 
        type: 'success', 
        message: `Inward Receipt posted for ${res.material_name}: +${parseFloat(res.quantity_received).toFixed(2)} ${res.unit}. New WAR: ₹${parseFloat(res.new_weighted_average_rate).toFixed(4)}/${res.unit}, Closing: ${parseFloat(res.new_closing_balance).toFixed(2)} ${res.unit}.` 
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Purchase Inward Error: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportStock = async () => {
    try {
      await api.reports.downloadReport('stock-ledger?format=excel', 'stock_ledger_summary.xlsx');
    } catch (err: any) {
      setActionNotice({ type: 'error', message: `Export Error: ${err.message}` });
    }
  };

  const filteredLedger = ledger?.filter((l: any) => {
    const matchesSource = sourceFilter === 'ALL' || l.source_type === sourceFilter;
    const matchesSearch = !searchQuery ||
      l.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSource && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Enterprise Header */}
      <div className="border-b border-vintage pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-serif font-bold text-annapurna-ink">Warehouse &amp; Immutable Stock Ledger</h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
              WAR VALUATION
            </span>
          </div>
          <p className="text-xs text-annapurna-ink-muted mt-0.5">
            Raw Materials • Packaging Foil &amp; Cartons • Finished Goods • Total Floor Valuation: ₹{parseFloat(summary?.total_inventory_value || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportStock}
            className="px-2.5 py-1.5 rounded-md border border-vintage bg-white hover:bg-annapurna-cream text-xs font-semibold text-annapurna-ink flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Stock Ledger (.xlsx)</span>
          </button>
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="px-3 py-1.5 bg-annapurna-terracotta hover:bg-annapurna-terracotta-dark text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Inward Purchase</span>
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

      {/* Stock Category Overview Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-vintage p-4 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-annapurna-ink-muted uppercase">
            <span>Raw Materials</span>
            <span className="text-[10px] font-mono bg-annapurna-cream px-1.5 py-0.5 rounded text-annapurna-terracotta">
              {rawMaterials.length} Items
            </span>
          </div>
          <div className="divide-y divide-vintage/60 text-xs">
            {rawMaterials.map((m: any) => (
              <div key={m.id} className="py-2 flex justify-between items-center gap-2">
                <div>
                  <div className="font-semibold text-annapurna-ink flex items-center space-x-1.5">
                    <span>{m.name}</span>
                    {m.is_low_stock && (
                      <span className="text-[9px] font-mono font-bold px-1 rounded bg-red-100 text-red-700 border border-red-200 inline-flex items-center space-x-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        <span>LOW</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-annapurna-ink-muted font-mono">
                    {m.code_or_sku} • WAR: ₹{parseFloat(m.valuation_rate).toFixed(2)}/{m.unit}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono font-bold ${m.is_low_stock ? 'text-red-700' : 'text-annapurna-ink'}`}>
                    {parseFloat(m.current_stock).toFixed(2)} {m.unit}
                  </div>
                  <div className="text-[10px] font-mono text-annapurna-ink-muted">
                    ₹{parseFloat(m.total_valuation).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-vintage p-4 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-annapurna-ink-muted uppercase">
            <span>Packaging Materials</span>
            <span className="text-[10px] font-mono bg-blue-50 px-1.5 py-0.5 rounded text-blue-700">
              {packagingMaterials.length} Items
            </span>
          </div>
          <div className="divide-y divide-vintage/60 text-xs">
            {packagingMaterials.map((m: any) => (
              <div key={m.id} className="py-2 flex justify-between items-center gap-2">
                <div>
                  <div className="font-semibold text-annapurna-ink">{m.name}</div>
                  <div className="text-[10px] text-annapurna-ink-muted font-mono">
                    {m.code_or_sku} • WAR: ₹{parseFloat(m.valuation_rate).toFixed(2)}/{m.unit}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-annapurna-ink">
                    {parseFloat(m.current_stock).toFixed(0)} {m.unit}
                  </div>
                  <div className="text-[10px] font-mono text-annapurna-ink-muted">
                    ₹{parseFloat(m.total_valuation).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-vintage p-4 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-annapurna-ink-muted uppercase">
            <span>Finished Goods</span>
            <span className="text-[10px] font-mono bg-emerald-50 px-1.5 py-0.5 rounded text-emerald-700">
              {finishedGoods.length} SKUs
            </span>
          </div>
          <div className="divide-y divide-vintage/60 text-xs">
            {finishedGoods.map((fg: any) => (
              <div key={fg.id} className="py-2 flex justify-between items-center gap-2">
                <div>
                  <div className="font-semibold text-annapurna-ink flex items-center space-x-1.5">
                    <span>{fg.name}</span>
                    {fg.is_low_stock && (
                      <span className="text-[9px] font-mono font-bold px-1 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        REORDER
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-annapurna-ink-muted font-mono">
                    {fg.code_or_sku} • Min: {parseFloat(fg.minimum_threshold).toFixed(0)} pkts
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-annapurna-ink">
                    {parseFloat(fg.current_stock).toFixed(0)} pkts
                  </div>
                  <div className="text-[10px] font-mono text-annapurna-ink-muted">
                    ₹{parseFloat(fg.total_valuation).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Immutable Stock Movement Ledger Table */}
      <div className="bg-white rounded-lg border border-vintage shadow-xs overflow-hidden">
        <div className="p-3 border-b border-vintage bg-annapurna-cream-paper/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-annapurna-ink-faint absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter ledger by item code, name, or ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-vintage rounded-md focus:outline-none focus:border-annapurna-terracotta"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { key: 'ALL', label: 'All' },
              { key: 'PURCHASE_RECEIPT', label: 'Purchases' },
              { key: 'PRODUCTION_ISSUE', label: 'Issues' },
              { key: 'PRODUCTION_OUTPUT', label: 'Batch Output' },
              { key: 'SALES_DISPATCH', label: 'Dispatches' },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setSourceFilter(s.key)}
                className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                  sourceFilter === s.key
                    ? 'bg-annapurna-terracotta text-white border-annapurna-terracotta'
                    : 'bg-white text-annapurna-ink-muted border-vintage hover:text-annapurna-ink'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-annapurna-cream-paper border-b border-vintage text-[11px] font-semibold text-annapurna-ink-muted">
              <tr>
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-3 py-2.5">Code &amp; Item</th>
                <th className="px-3 py-2.5 text-center">Source Type</th>
                <th className="px-3 py-2.5 text-right">Qty Delta</th>
                <th className="px-3 py-2.5 text-right">WAR Rate</th>
                <th className="px-3 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Audit Reference / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vintage">
              {ledLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-annapurna-ink-muted">Loading immutable ledger...</td></tr>
              ) : filteredLedger && filteredLedger.length > 0 ? (
                filteredLedger.map((l: any) => {
                  const delta = parseFloat(l.quantity_delta || '0');
                  const isInward = delta > 0;
                  return (
                    <tr key={l.id} className="hover:bg-annapurna-cream/40 transition-colors">
                      <td className="px-4 py-2 font-mono text-annapurna-ink-muted text-[11px] whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-annapurna-ink">{l.item_name}</div>
                        <div className="text-[10px] font-mono text-annapurna-ink-muted">{l.item_code} • {l.item_type}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          l.source_type === 'PURCHASE_RECEIPT' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                          l.source_type === 'PRODUCTION_OUTPUT' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                          l.source_type === 'PRODUCTION_ISSUE' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          l.source_type === 'SALES_DISPATCH' ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {l.source_type}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold whitespace-nowrap ${isInward ? 'text-emerald-700' : 'text-red-700'}`}>
                        {isInward ? `+${delta.toFixed(2)}` : delta.toFixed(2)} {l.unit}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-annapurna-ink">
                        ₹{parseFloat(l.valuation_rate || '0').toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-annapurna-ink-muted">
                        {l.created_by_name}
                      </td>
                      <td className="px-4 py-2 text-annapurna-ink-muted text-[11px] max-w-xs truncate" title={l.notes || ''}>
                        {l.notes || l.source_document_id}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-annapurna-ink-muted">
                    No ledger transactions matching filters.
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
                <span className="text-[10px] font-mono uppercase font-bold text-annapurna-terracotta">STOCK RECEIPT (WAR)</span>
                <h3 className="text-base font-serif font-bold text-annapurna-ink">Record Inward Material Purchase</h3>
              </div>
              <button onClick={() => setShowPurchaseModal(false)} className="text-xs text-annapurna-ink-muted hover:text-annapurna-ink">✕</button>
            </div>

            <form onSubmit={handlePurchaseSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Select Material</label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  required
                  className="w-full p-2 border border-vintage rounded bg-white text-annapurna-ink"
                >
                  <option value="">-- Choose Raw or Packaging Material --</option>
                  {materials?.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.code} - {m.name} ({m.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Quantity ({selectedMat?.unit || 'unit'})</label>
                  <input
                    type="text"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                    required
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Purchase Rate (₹/unit)</label>
                  <input
                    type="text"
                    value={purchaseRate}
                    onChange={(e) => setPurchaseRate(e.target.value)}
                    required
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
              </div>

              {/* Live Weighted-Average Rate Preview */}
              <div className="p-3 rounded bg-annapurna-cream-paper border border-vintage space-y-1 text-[11px] font-mono">
                <div className="flex justify-between text-annapurna-ink-muted">
                  <span>Current Balance ({currentStock.toFixed(2)} {selectedMat?.unit || ''}):</span>
                  <span>@ ₹{currentRate.toFixed(4)}</span>
                </div>
                <div className="flex justify-between font-bold text-annapurna-terracotta pt-1 border-t border-vintage">
                  <span>Projected New WAR:</span>
                  <span>₹{newWAR}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Supplier Name</label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full p-2 border border-vintage rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-annapurna-ink mb-1">Supplier Invoice #</label>
                  <input
                    type="text"
                    value={supplierInv}
                    onChange={(e) => setSupplierInv(e.target.value)}
                    className="w-full p-2 border border-vintage rounded font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-annapurna-ink mb-1">Audit Notes</label>
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

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs font-mono text-annapurna-ink-muted">Loading Inventory Ledger...</div>}>
      <InventoryContent />
    </Suspense>
  );
}
