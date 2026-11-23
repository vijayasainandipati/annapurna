'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, KeyRound, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-2xl border border-vintage shadow-warm space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-annapurna-terracotta text-white font-serif font-bold text-2xl mx-auto flex items-center justify-center shadow-md border-2 border-annapurna-brass">
          அ
        </div>
        <h1 className="text-2xl font-serif font-bold text-annapurna-ink">Sign in to Annapurna</h1>
        <p className="text-xs text-annapurna-ink-muted">Enter factory credentials to access operational roles</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-xs font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-annapurna-ink mb-1">Username</label>
          <div className="relative">
            <User className="w-4 h-4 text-annapurna-ink-faint absolute left-3 top-2.5" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-vintage bg-annapurna-cream-paper focus:outline-none focus:border-annapurna-terracotta"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-annapurna-ink mb-1">Password</label>
          <div className="relative">
            <KeyRound className="w-4 h-4 text-annapurna-ink-faint absolute left-3 top-2.5" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-vintage bg-annapurna-cream-paper focus:outline-none focus:border-annapurna-terracotta"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-annapurna-terracotta text-white font-medium text-sm rounded-lg shadow-sm hover:bg-annapurna-terracotta-dark transition-colors flex items-center justify-center space-x-2"
        >
          {loading ? <span>Authenticating...</span> : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Quick Demo Credentials */}
      <div className="border-t border-vintage pt-4 space-y-2">
        <p className="text-[11px] font-bold text-annapurna-ink-muted uppercase tracking-wider text-center">
          Quick Demo Credentials
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Admin', u: 'admin', p: 'Admin123!' },
            { label: 'Owner', u: 'owner', p: 'Owner123!' },
            { label: 'Salesman A', u: 'salesman_a', p: 'Salesman123!' },
            { label: 'Supervisor', u: 'supervisor', p: 'Supervisor123!' },
            { label: 'Accountant', u: 'accountant', p: 'Accountant123!' },
            { label: 'Salesman B', u: 'salesman_b', p: 'Salesman123!' },
          ].map((role) => (
            <button
              key={role.u}
              type="button"
              onClick={() => handleQuickSelect(role.u, role.p)}
              className="px-2 py-1.5 rounded border border-vintage bg-annapurna-cream hover:bg-annapurna-terracotta/10 text-annapurna-ink text-left font-medium text-[11px] transition-colors"
            >
              {role.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
