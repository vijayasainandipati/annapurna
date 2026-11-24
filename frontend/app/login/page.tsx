'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, KeyRound, ArrowRight, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDevAccounts, setShowDevAccounts] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.auth.login({ username, password });
      login(res.access_token, res.user);
      if (res.user.role === 'OWNER') router.push('/owner');
      else if (res.user.role === 'SALESMAN') router.push('/salesman');
      else if (res.user.role === 'PRODUCTION_SUPERVISOR') router.push('/production');
      else if (res.user.role === 'ACCOUNTANT') router.push('/reports');
      else router.push('/admin');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDevAccount = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-annapurna-cream-paper flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-lg bg-annapurna-terracotta text-white font-serif font-bold text-2xl mx-auto flex items-center justify-center shadow-md border-2 border-annapurna-brass">
            அ
          </div>
          <h1 className="text-2xl font-serif font-bold text-annapurna-ink tracking-tight">ANNAPURNA</h1>
          <p className="text-xs uppercase tracking-widest text-annapurna-ink-muted font-mono">
            Plant 01 • Operations Portal
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-warm border border-vintage rounded-xl space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-annapurna-ink">Employee Authentication</h2>
            <p className="text-xs text-annapurna-ink-muted">Enter assigned corporate credentials to access the floor system</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-annapurna-ink mb-1">
                Employee Username / Badge ID
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-annapurna-ink-faint absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="e.g. admin, salesman_a, supervisor"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-vintage bg-annapurna-cream-paper focus:outline-none focus:border-annapurna-terracotta"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-annapurna-ink mb-1">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-annapurna-ink-faint absolute left-3 top-2.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-vintage bg-annapurna-cream-paper focus:outline-none focus:border-annapurna-terracotta"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-annapurna-terracotta text-white font-medium text-xs rounded-lg shadow-sm hover:bg-annapurna-terracotta-dark transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? <span>Verifying credentials...</span> : (
                <>
                  <span>Sign In to Plant System</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Development / Test Mode Dropdown */}
          <div className="pt-4 border-t border-vintage">
            <button
              type="button"
              onClick={() => setShowDevAccounts(prev => !prev)}
              className="w-full flex items-center justify-between text-[11px] text-annapurna-ink-muted hover:text-annapurna-terracotta font-medium"
            >
              <span>Development / Test Environments (Select Account)</span>
              <ChevronRight className={`w-3.5 h-3.5 transform transition-transform ${showDevAccounts ? 'rotate-90' : ''}`} />
            </button>

            {showDevAccounts && (
              <div className="mt-3 space-y-1.5 p-3 rounded-lg bg-annapurna-cream-paper border border-vintage text-xs">
                <p className="text-[10px] text-annapurna-ink-muted uppercase tracking-wider font-semibold">
                  Pre-configured Benchmark Accounts:
                </p>
                <div className="grid grid-cols-1 gap-1.5 pt-1">
                  {[
                    { label: 'Factory Admin (Kalyanasundaram)', u: 'admin', p: 'Admin123!', r: 'Full Operations & Dispatches' },
                    { label: 'Salesman A (Senthil - Tamil Nadu)', u: 'salesman_a', p: 'Salesman123!', r: 'Mobile Order Entry (Intrastate GST)' },
                    { label: 'Production Supervisor (Muthuvel)', u: 'supervisor', p: 'Supervisor123!', r: 'Batch Runs, BOM & Variances' },
                    { label: 'Managing Director / Owner (Sundaram)', u: 'owner', p: 'Owner123!', r: 'Executive Pulse & Financials' },
                    { label: 'Accountant (Ramanathan)', u: 'accountant', p: 'Accountant123!', r: 'GSTR-1, Invoices & Receivables' },
                  ].map(acc => (
                    <button
                      key={acc.u}
                      type="button"
                      onClick={() => handleSelectDevAccount(acc.u, acc.p)}
                      className="text-left p-2 rounded bg-white hover:bg-annapurna-cream border border-vintage transition-colors flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold text-annapurna-ink">{acc.label}</div>
                        <div className="text-[10px] text-annapurna-ink-muted">{acc.r}</div>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-vintage">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-[11px] text-annapurna-ink-muted">
          Annapurna Foods Unit 1 — Madurai Factory Operations System
        </div>
      </div>
    </div>
  );
}
