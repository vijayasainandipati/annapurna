'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Building2, 
  Activity, 
  ShoppingCart, 
  Users, 
  Factory, 
  ScrollText, 
  Warehouse, 
  Truck, 
  FileCheck2, 
  Receipt, 
  FileSpreadsheet, 
  Settings, 
  Search, 
  Bell, 
  Radio, 
  LogOut, 
  ChevronDown, 
  Menu, 
  X,
  ChevronRight,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { getSocket } from '@/lib/realtime';
import { api } from '@/lib/api';

interface AppShellProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  roles: string[];
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAVIGATION_GROUPS: NavGroup[] = [
  {
    group: 'Operations',
    items: [
      { name: 'Executive Overview', href: '/owner', icon: Activity, roles: ['OWNER', 'ADMIN'] },
      { name: 'Admin Order Inbox', href: '/admin', icon: FileCheck2, roles: ['ADMIN', 'OWNER'] },
      { name: 'Sales Order Entry', href: '/salesman', icon: ShoppingCart, roles: ['SALESMAN', 'ADMIN', 'OWNER'] },
    ]
  },
  {
    group: 'Manufacturing',
    items: [
      { name: 'Production Runs', href: '/production', icon: Factory, roles: ['PRODUCTION_SUPERVISOR', 'ADMIN', 'OWNER'] },
      { name: 'Recipes & BOM', href: '/production?tab=bom', icon: ScrollText, roles: ['PRODUCTION_SUPERVISOR', 'ADMIN', 'OWNER'] },
    ]
  },
  {
    group: 'Supply Chain & Warehouse',
    items: [
      { name: 'Warehouse & Stock', href: '/inventory', icon: Warehouse, roles: ['ADMIN', 'PRODUCTION_SUPERVISOR', 'OWNER', 'ACCOUNTANT'] },
      { name: 'Inward Purchases', href: '/inventory?tab=purchases', icon: Truck, roles: ['ADMIN', 'OWNER', 'ACCOUNTANT'] },
    ]
  },
  {
    group: 'Finance & Compliance',
    items: [
      { name: 'Payments & Receivables', href: '/reports?tab=receivables', icon: Receipt, roles: ['ACCOUNTANT', 'ADMIN', 'OWNER'] },
      { name: 'GST & Sales Register', href: '/reports?tab=gst', icon: FileSpreadsheet, roles: ['ACCOUNTANT', 'ADMIN', 'OWNER'] },
    ]
  }
];

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAuthenticated, initialize } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDevDrawer, setShowDevDrawer] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; time: string; type: string }>>([]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Seed initial notification feed from committed PostgreSQL outbox (Admin/Owner only)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (user.role === 'ADMIN' || user.role === 'OWNER') {
      api.realtime.getEvents()
        .then((events) => {
          if (Array.isArray(events)) {
            setNotifications(
              events.slice(0, 8).map((ev: any) => ({
                id: String(ev.id),
                title: `${ev.event_type}: ${ev.payload?.order_number || ev.payload?.batch_number || ev.payload?.payment_number || ev.payload?.name || ev.channel}`,
                time: new Date(ev.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
                type: ev.channel || 'system'
              }))
            );
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, user]);

  // Realtime connection status listener
  useEffect(() => {
    if (!isAuthenticated) {
      setRealtimeConnected(false);
      return;
    }
    try {
      const socket = getSocket();
      setRealtimeConnected(socket.connected);

      const onConnect = () => setRealtimeConnected(true);
      const onDisconnect = () => setRealtimeConnected(false);

      const onStock = (data: any) => {
        setNotifications(prev => [
          { id: String(Date.now()), title: `Stock Updated: ${data.payload?.name || 'Item'}`, time: 'Just now', type: 'stock' },
          ...prev.slice(0, 9)
        ]);
      };
      const onOrder = (data: any) => {
        setNotifications(prev => [
          { id: String(Date.now()), title: `Order Created: ${data.payload?.order_number || ''}`, time: 'Just now', type: 'order' },
          ...prev.slice(0, 9)
        ]);
      };
      const onProduction = (data: any) => {
        setNotifications(prev => [
          { id: String(Date.now()), title: `Batch Posted: ${data.payload?.batch_number || ''}`, time: 'Just now', type: 'production' },
          ...prev.slice(0, 9)
        ]);
      };
      const onPayment = (data: any) => {
        setNotifications(prev => [
          { id: String(Date.now()), title: `Payment Received: ${data.payload?.payment_number || ''}`, time: 'Just now', type: 'finance' },
          ...prev.slice(0, 9)
        ]);
      };

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('STOCK_UPDATED', onStock);
      socket.on('ORDER_CREATED', onOrder);
      socket.on('PRODUCTION_POSTED', onProduction);
      socket.on('PAYMENT_RECEIVED', onPayment);

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('STOCK_UPDATED', onStock);
        socket.off('ORDER_CREATED', onOrder);
        socket.off('PRODUCTION_POSTED', onProduction);
        socket.off('PAYMENT_RECEIVED', onPayment);
      };
    } catch {
      setRealtimeConnected(false);
    }
  }, [isAuthenticated]);

  // Keyboard shortcut Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // If login page, render bare without shell
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // Filter navigation by role
  const allowedGroups = NAVIGATION_GROUPS.map(grp => ({
    group: grp.group,
    items: grp.items.filter(item => !user || item.roles.includes(user.role))
  })).filter(grp => grp.items.length > 0);

  return (
    <div className="min-h-screen bg-annapurna-cream-paper flex flex-col font-sans text-annapurna-ink">
      {/* Top Application Bar */}
      <header className="h-14 bg-white border-b border-vintage shadow-sm sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setSidebarOpen(prev => !prev)}
            className="md:hidden p-1.5 rounded-md text-annapurna-ink hover:bg-annapurna-cream"
            aria-label="Toggle navigation"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Plant Identity */}
          <Link href="/" className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-md bg-annapurna-terracotta flex items-center justify-center text-white font-serif font-bold text-lg shadow-sm border border-annapurna-brass">
              அ
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-serif font-bold text-base tracking-tight text-annapurna-ink">ANNAPURNA</span>
                <span className="hidden sm:inline-block text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta border border-annapurna-cream-border">
                  PLANT 01 • MADURAI
                </span>
              </div>
              <p className="text-[9px] text-annapurna-ink-muted uppercase tracking-widest hidden sm:block">
                Manufacturing ERP & Audit System
              </p>
            </div>
          </Link>
        </div>

        {/* Global Search Bar (Trigger) */}
        <div className="flex-1 max-w-md mx-4 hidden md:block">
          <button
            onClick={() => setGlobalSearchOpen(true)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-annapurna-ink-muted bg-annapurna-cream-paper hover:bg-white border border-vintage rounded-md shadow-inner transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Search className="w-3.5 h-3.5 text-annapurna-ink-faint" />
              <span>Search orders, batches, SKUs, or ledgers...</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white border border-vintage rounded text-annapurna-ink-muted font-mono">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Status, Notifications & Profile */}
        <div className="flex items-center space-x-3">
          {/* Honest Realtime Status Indicator */}
          <div 
            title={realtimeConnected ? "Socket.IO Outbox: Realtime Connected" : "Socket.IO: Connecting / Polling Mode"}
            className="flex items-center space-x-1.5 px-2 py-1 rounded bg-annapurna-cream border border-vintage text-[11px] font-mono"
          >
            <span className={`w-2 h-2 rounded-full ${realtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="hidden sm:inline text-annapurna-ink-muted">
              {realtimeConnected ? 'LIVE PULSE' : 'SYNCING'}
            </span>
          </div>

          {/* Notifications Popover */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(prev => !prev)}
              className="p-1.5 rounded-md text-annapurna-ink-muted hover:text-annapurna-ink hover:bg-annapurna-cream relative"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-annapurna-terracotta rounded-full" />
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-vintage rounded-lg shadow-warm py-2 z-50">
                <div className="px-3 py-1.5 border-b border-vintage flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-annapurna-ink">Operational Feed</span>
                  <span className="text-[10px] text-annapurna-ink-muted">{notifications.length} events</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {notifications.map(n => (
                    <div key={n.id} className="p-2.5 hover:bg-annapurna-cream text-xs transition-colors">
                      <p className="text-annapurna-ink font-medium leading-snug">{n.title}</p>
                      <span className="text-[10px] text-annapurna-ink-muted mt-0.5 block">{n.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-annapurna-cream-border hidden sm:block" />

          {/* User Profile & Role Badge */}
          {isAuthenticated && user ? (
            <div className="flex items-center space-x-2">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-annapurna-ink leading-tight">{user.full_name}</div>
                <div className="text-[10px] font-mono text-annapurna-terracotta uppercase font-bold">
                  {user.role.replace(/_/g, ' ')}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out of factory session"
                className="p-1.5 text-annapurna-ink-muted hover:text-annapurna-red hover:bg-annapurna-cream rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-annapurna-terracotta text-white hover:bg-annapurna-terracotta-dark shadow-sm transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Navigation */}
        <aside className={`
          fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-vintage flex flex-col justify-between
          transform transition-transform duration-200 ease-in-out md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          top-14 md:top-0
        `}>
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
            {allowedGroups.map(group => (
              <div key={group.group} className="space-y-1">
                <div className="px-3 text-[10px] font-bold text-annapurna-ink-muted uppercase tracking-wider">
                  {group.group}
                </div>
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href) && !item.href.includes('?'));
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors
                        ${isActive 
                          ? 'bg-annapurna-terracotta text-white font-semibold shadow-sm' 
                          : 'text-annapurna-ink hover:bg-annapurna-cream hover:text-annapurna-terracotta'}
                      `}
                    >
                      <div className="flex items-center space-x-2.5">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-annapurna-cream text-annapurna-terracotta font-mono font-bold">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Plant Floor Info & Dev Account Switcher Toggle */}
          <div className="p-3 border-t border-vintage bg-annapurna-cream-paper/50 text-[11px] space-y-2">
            <div className="flex justify-between items-center text-annapurna-ink-muted">
              <span>Unit: Madurai 01</span>
              <span className="font-mono text-[10px]">ERP v1.0.0</span>
            </div>
            
            <button
              onClick={() => setShowDevDrawer(prev => !prev)}
              className="w-full text-left text-[10px] text-annapurna-ink-faint hover:text-annapurna-terracotta font-medium flex items-center justify-between pt-1 border-t border-vintage/50"
            >
              <span>Development Mode: Role Switcher</span>
              <ChevronRight className={`w-3 h-3 transform transition-transform ${showDevDrawer ? 'rotate-90' : ''}`} />
            </button>

            {showDevDrawer && (
              <div className="pt-2 space-y-1">
                <p className="text-[10px] text-annapurna-ink-muted">Switch test persona:</p>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { label: 'Admin', user: 'admin', role: 'ADMIN' },
                    { label: 'Salesman A', user: 'salesman_a', role: 'SALESMAN' },
                    { label: 'Supervisor', user: 'supervisor', role: 'PRODUCTION_SUPERVISOR' },
                    { label: 'Owner', user: 'owner', role: 'OWNER' },
                    { label: 'Accountant', user: 'accountant', role: 'ACCOUNTANT' },
                  ].map(b => (
                    <button
                      key={b.user}
                      onClick={async () => {
                        const pwd = b.user === 'admin' ? 'Admin123!' :
                                    b.user.startsWith('salesman') ? 'Salesman123!' :
                                    b.user === 'supervisor' ? 'Supervisor123!' :
                                    b.user === 'owner' ? 'Owner123!' : 'Accountant123!';
                        try {
                          const res = await fetch('/api/v1/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: b.user, password: pwd })
                          });
                          const data = await res.json();
                          if (data.access_token) {
                            useAuthStore.getState().login(data.access_token, data.user);
                            if (b.role === 'OWNER') router.push('/owner');
                            else if (b.role === 'SALESMAN') router.push('/salesman');
                            else if (b.role === 'PRODUCTION_SUPERVISOR') router.push('/production');
                            else if (b.role === 'ACCOUNTANT') router.push('/reports');
                            else router.push('/admin');
                          }
                        } catch (err: any) {
                          alert(`Switch failed: ${err.message}`);
                        }
                      }}
                      className="px-2 py-1 text-[10px] font-medium rounded bg-white hover:bg-annapurna-cream border border-vintage text-annapurna-ink text-left truncate"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Global Search Dialog Modal (Ctrl+K) */}
      {globalSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-vintage shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-3 border-b border-vintage flex items-center space-x-2">
              <Search className="w-4 h-4 text-annapurna-ink-muted" />
              <input
                type="text"
                autoFocus
                placeholder="Type order #, material code, or customer name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs text-annapurna-ink bg-transparent focus:outline-none"
              />
              <kbd 
                onClick={() => setGlobalSearchOpen(false)}
                className="px-1.5 py-0.5 text-[10px] bg-annapurna-cream border border-vintage rounded text-annapurna-ink-muted cursor-pointer"
              >
                ESC
              </kbd>
            </div>
            <div className="p-3 max-h-60 overflow-y-auto text-xs space-y-2">
              <p className="text-[10px] uppercase font-bold text-annapurna-ink-muted">Quick Navigation Shortcuts</p>
              <div className="space-y-1">
                {[
                  { name: 'Go to Admin Order Inbox', href: '/admin' },
                  { name: 'Go to Production Schedule & Batches', href: '/production' },
                  { name: 'Go to Stock Ledger & Valuation', href: '/inventory' },
                  { name: 'Go to GST & Financial Reports', href: '/reports' },
                  { name: 'Go to Mobile Order Entry (PWA)', href: '/salesman' },
                ].map(s => (
                  <button
                    key={s.name}
                    onClick={() => {
                      router.push(s.href);
                      setGlobalSearchOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-annapurna-cream text-annapurna-ink flex items-center justify-between"
                  >
                    <span>{s.name}</span>
                    <ArrowRight className="w-3 h-3 text-annapurna-ink-muted" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
