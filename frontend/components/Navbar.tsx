'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Building2, 
  ShoppingCart, 
  Factory, 
  Package, 
  FileText, 
  ShieldCheck, 
  LogOut, 
  Activity,
  Layers
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

export function Navbar() {
  const pathname = usePathname();
  const { user, logout, isAuthenticated } = useAuthStore();

  const navLinks = [
    { name: 'Owner Pulse', href: '/owner', icon: Activity, roles: ['OWNER', 'ADMIN'] },
    { name: 'Sales Order PWA', href: '/salesman', icon: ShoppingCart, roles: ['SALESMAN', 'ADMIN', 'OWNER'] },
    { name: 'Admin Inbox', href: '/admin', icon: ShieldCheck, roles: ['ADMIN', 'OWNER'] },
    { name: 'Production', href: '/production', icon: Factory, roles: ['PRODUCTION_SUPERVISOR', 'ADMIN', 'OWNER'] },
    { name: 'Warehouse & Ledger', href: '/inventory', icon: Package, roles: ['ADMIN', 'PRODUCTION_SUPERVISOR', 'OWNER', 'ACCOUNTANT'] },
    { name: 'GST & Audit Reports', href: '/reports', icon: FileText, roles: ['ACCOUNTANT', 'ADMIN', 'OWNER'] },
  ];

  const visibleLinks = navLinks.filter(l => !user || l.roles.includes(user.role));

  return (
    <header className="bg-white border-b border-vintage shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand Identity */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-full bg-annapurna-terracotta flex items-center justify-center text-white font-serif font-bold text-xl shadow-md border-2 border-annapurna-brass">
              அ
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-serif font-bold text-xl text-annapurna-terracotta tracking-tight">ANNAPURNA</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-annapurna-cream text-annapurna-brass-dark font-semibold border border-annapurna-brass/30">
                  MFG OPS
                </span>
              </div>
              <p className="text-[10px] text-annapurna-ink-muted tracking-wider uppercase">
                Order-to-Audit Intelligence
              </p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex space-x-1">
            {visibleLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-annapurna-terracotta text-white shadow-sm'
                      : 'text-annapurna-ink hover:bg-annapurna-cream hover:text-annapurna-terracotta'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{link.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User profile & Switcher */}
          <div className="flex items-center space-x-3">
            {isAuthenticated && user ? (
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-annapurna-ink">{user.full_name}</div>
                  <div className="text-[10px] text-annapurna-terracotta font-medium uppercase tracking-wider">
                    {user.role.replace('_', ' ')}
                  </div>
                </div>
                <button
                  onClick={logout}
                  title="Sign out"
                  className="p-1.5 text-annapurna-ink-muted hover:text-annapurna-red hover:bg-annapurna-cream rounded-md transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-annapurna-terracotta text-white hover:bg-annapurna-terracotta-dark shadow-sm transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
