'use client';

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { useAuthStore } from '@/stores/authStore';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        refetchOnWindowFocus: true,
      },
    },
  }));

  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('Service worker registration failed:', err);
      });
    }
  }, [initialize]);

  return (
    <html lang="en">
      <head>
        <title>Annapurna — Manufacturing Operations ERP</title>
        <meta name="description" content="South Indian Packaged Snack Manufacturing Operations Platform — Madurai Unit 1" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-annapurna-cream-paper flex flex-col antialiased">
        <QueryClientProvider client={queryClient}>
          <AppShell>
            {children}
          </AppShell>
        </QueryClientProvider>
      </body>
    </html>
  );
}
