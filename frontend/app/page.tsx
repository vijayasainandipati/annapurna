'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Activity, 
  ShoppingCart, 
  ShieldCheck, 
  Factory, 
  Package, 
  FileText, 
  ArrowRight,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

export default function HomePage() {
  const { user, login } = useAuthStore();

  const handleQuickLogin = async (username: string, roleName: string) => {
    try {
      const password = username === 'admin' ? 'Admin123!' :
                       username.startsWith('salesman') ? 'Salesman123!' :
                       username === 'supervisor' ? 'Supervisor123!' :
                       username === 'owner' ? 'Owner123!' : 'Accountant123!';
      const res = await api.auth.login({ username, password });
      login(res.access_token, res.user);
    } catch (err: any) {
      alert(`Login failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-12 py-4">
      {/* Hero Section with Vintage Kitchen Aesthetic */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-annapurna-cream to-annapurna-cream-border/30 border border-vintage p-8 sm:p-12 shadow-warm">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-annapurna-terracotta/10 text-annapurna-terracotta text-xs font-semibold border border-annapurna-terracotta/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>South Indian Packaged-Snack Manufacturing Operations</span>
          </div>
          
          <h1 className="text-3xl sm:text-5xl font-serif font-bold text-annapurna-ink tracking-tight leading-tight">
            From the First Order to the Final Audit.
          </h1>
          
          <p className="text-base sm:text-lg text-annapurna-ink-muted leading-relaxed">
            Annapurna connects your entire factory floor: Sales Orders, Approval Queue, GST Invoicing, Dispatch Shortage Protection, Batch BOM Production, Immutable Stock Ledgers, and Realtime Costing.
          </p>

          {/* Quick Benchmark Role Switcher */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-bold text-annapurna-terracotta uppercase tracking-wider">
              ⚡ Instant Benchmark Demo Access (1-Click Login):
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Admin (Kalyanasundaram)', user: 'admin', role: 'ADMIN', color: 'bg-annapurna-terracotta text-white' },
                { label: 'Salesman A (Senthil - TN)', user: 'salesman_a', role: 'SALESMAN', color: 'bg-annapurna-brass text-white' },
                { label: 'Supervisor (Muthuvel)', user: 'supervisor', role: 'PRODUCTION_SUPERVISOR', color: 'bg-annapurna-leaf text-white' },
                { label: 'Owner (Annapurna Sundaram)', user: 'owner', role: 'OWNER', color: 'bg-annapurna-ink text-white' },
                { label: 'Accountant (Ramanathan)', user: 'accountant', role: 'ACCOUNTANT', color: 'bg-amber-700 text-white' },
              ].map((b) => (
                <button
                  key={b.user}
                  onClick={() => handleQuickLogin(b.user, b.role)}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium shadow-sm transition-transform active:scale-95 hover:opacity-90 ${b.color}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {user && (
              <p className="text-xs text-annapurna-green font-semibold pt-1 flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Currently signed in as: <strong>{user.full_name}</strong> ({user.role})</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 6 Core Functional Modules */}
      <section className="space-y-6">
        <div className="flex justify-between items-end border-b border-vintage pb-4">
          <div>
            <h2 className="text-2xl font-serif font-bold text-annapurna-ink">Operational Modules</h2>
            <p className="text-sm text-annapurna-ink-muted">Complete Order-to-Audit manufacturing workflow</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Owner Pulse Dashboard',
              tamil: 'உரிமையாளர் கட்டுப்பாட்டு அறை',
              desc: 'Live 4-card KPIs: Revenue, Receivables, Batch Units & Floor Valuation. Urgent variance alerts for yield & ingredient deviations.',
              href: '/owner',
              icon: Activity,
              color: 'text-annapurna-terracotta bg-annapurna-terracotta/10 border-annapurna-terracotta/20',
            },
            {
              title: 'Salesman Mobile PWA',
              tamil: 'விற்பனை முன்பதிவு',
              desc: 'Ultra-fast order creation (&lt;45s) with quick quantity steppers (+10, +50, +100), offline sync queue, and customer price list.',
              href: '/salesman',
              icon: ShoppingCart,
              color: 'text-annapurna-brass-dark bg-annapurna-brass/10 border-annapurna-brass/20',
            },
            {
              title: 'Admin Order & Dispatch Inbox',
              tamil: 'ஆர்டர் மேலாண்மை & சரக்கு அனுப்புதல்',
              desc: 'Live inbox with stock availability pre-check, shortage warnings, 1-click GST invoice generation, and ReportLab PDF downloads.',
              href: '/admin',
              icon: ShieldCheck,
              color: 'text-blue-700 bg-blue-50 border-blue-200',
            },
            {
              title: 'Production & Recipe BOM Engine',
              tamil: 'உற்பத்தி மற்றும் மூலப்பொருள் கணக்கீடு',
              desc: 'Actual vs standard batch reporting, ingredient consumption, packaging scrap accounting, and live batch costing (₹31.14/pkt).',
              href: '/production',
              icon: Factory,
              color: 'text-annapurna-leaf bg-emerald-50 border-emerald-200',
            },
            {
              title: 'Warehouse & Immutable Ledger',
              tamil: 'கிடங்கு மற்றும் இருப்புப் புத்தகம்',
              desc: 'Single source of truth: Weighted-Average Rate (WAR) purchase valuation, low stock alerts, and immutable transaction audit history.',
              href: '/inventory',
              icon: Package,
              color: 'text-purple-700 bg-purple-50 border-purple-200',
            },
            {
              title: 'GST & Audit Reports',
              tamil: 'ஜிஎஸ்டி & தணிக்கை அறிக்கைகள்',
              desc: 'Sales Register, GSTR-1 Outward Summary, Aged Receivables (0-30 to 90+ days), and openpyxl styled Excel exports.',
              href: '/reports',
              icon: FileText,
              color: 'text-amber-800 bg-amber-50 border-amber-200',
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.title}
                href={card.href}
                className="group relative rounded-xl bg-white border border-vintage p-6 shadow-warm hover:shadow-warm-hover transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center border ${card.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-lg text-annapurna-ink group-hover:text-annapurna-terracotta transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-annapurna-terracotta font-medium tracking-wide">
                      {card.tamil}
                    </p>
                  </div>
                  <p className="text-xs text-annapurna-ink-muted leading-relaxed">
                    {card.desc}
                  </p>
                </div>
                
                <div className="pt-4 flex items-center text-xs font-semibold text-annapurna-terracotta group-hover:translate-x-1 transition-transform">
                  <span>Enter Module</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Canonical Benchmark Specifications Preview */}
      <section className="rounded-xl bg-annapurna-cream border border-vintage p-6 space-y-4">
        <h3 className="font-serif font-bold text-base text-annapurna-ink flex items-center space-x-2">
          <Layers className="w-4 h-4 text-annapurna-terracotta" />
          <span>Locked Benchmark Scenario Specifications</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-white p-3 rounded-lg border border-vintage">
            <div className="font-bold text-annapurna-terracotta">Tamil Nadu Intrastate</div>
            <div className="text-annapurna-ink mt-1">Retailer A (Chennai Grocers)</div>
            <div className="text-annapurna-ink-muted mt-0.5">150 pkts Murukku 200g @ ₹50 = ₹7,500 + 2.5% CGST + 2.5% SGST = ₹7,875.00</div>
          </div>
          <div className="bg-white p-3 rounded-lg border border-vintage">
            <div className="font-bold text-annapurna-brass-dark">Karnataka Interstate</div>
            <div className="text-annapurna-ink mt-1">Distributor B (Bengaluru Snacks)</div>
            <div className="text-annapurna-ink-muted mt-0.5">120 pkts Murukku 200g @ ₹50 = ₹6,000 + 5.0% IGST = ₹6,300.00 (Shortage Guard Tested)</div>
          </div>
          <div className="bg-white p-3 rounded-lg border border-vintage">
            <div className="font-bold text-annapurna-leaf">Batch Costing & Variances</div>
            <div className="text-annapurna-ink mt-1">Batch BATCH-2026-0315-01</div>
            <div className="text-annapurna-ink-muted mt-0.5">Yield -6.00% (188/200), Oil +5.00% (10.5/10.0L), Cost ₹5,855.00 @ ₹31.14/pkt</div>
          </div>
        </div>
      </section>
    </div>
  );
}
