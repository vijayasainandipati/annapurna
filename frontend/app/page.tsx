'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

export default function RootHomePage() {
  const router = useRouter();
  const { user, isAuthenticated, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    } else if (user) {
      switch (user.role) {
        case 'OWNER':
          router.replace('/owner');
          break;
        case 'ADMIN':
          router.replace('/admin');
          break;
        case 'SALESMAN':
          router.replace('/salesman');
          break;
        case 'PRODUCTION_SUPERVISOR':
          router.replace('/production');
          break;
        case 'ACCOUNTANT':
          router.replace('/reports');
          break;
        default:
          router.replace('/admin');
      }
    }
  }, [isAuthenticated, user, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-md bg-annapurna-terracotta text-white font-serif font-bold text-xl mx-auto flex items-center justify-center shadow-md animate-pulse">
          அ
        </div>
        <p className="text-xs font-mono text-annapurna-ink-muted">Loading Annapurna ERP Workspace...</p>
      </div>
    </div>
  );
}
