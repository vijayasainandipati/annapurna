'use client';

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from '@/components/Navbar';
import { useAuthStore } from '@/stores/authStore';
import { getSocket } from '@/lib/realtime';
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [realtimeNotification, setRealtimeNotification] = useState<string | null>(null);

  useEffect(() => {
    initialize();
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('Service worker registration failed:', err);
      });
    }
  }, [initialize]);

  useEffect(() => {
    if (isAuthenticated) {
      try {
        const socket = getSocket();
        
        socket.on('STOCK_UPDATED', (data: any) => {
          setRealtimeNotification(`📦 Stock Updated: ${data.payload?.name || 'Item'} (${data.payload?.source || 'Movement'})`);
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
        });

        socket.on('ORDER_CREATED', (data: any) => {
          setRealtimeNotification(`🛒 New Order Created: ${data.payload?.order_number || ''}`);
          queryClient.invalidateQueries({ queryKey: ['sales'] });
        });

        socket.on('PRODUCTION_POSTED', (data: any) => {
          setRealtimeNotification(`🏭 Batch Posted: ${data.payload?.batch_number || ''} (${data.payload?.actual_good_output} pkts)`);
          queryClient.invalidateQueries({ queryKey: ['production'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
        });

        socket.on('VARIANCE_FLAGGED', (data: any) => {
          setRealtimeNotification(`⚠️ Production Variance Flagged: ${data.payload?.batch_number || ''}`);
          queryClient.invalidateQueries({ queryKey: ['production'] });
        });

        socket.on('PAYMENT_RECEIVED', (data: any) => {
          setRealtimeNotification(`💰 Payment Received: ${data.payload?.payment_number || ''} (₹${data.payload?.amount})`);
          queryClient.invalidateQueries({ queryKey: ['finance'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        });

        return () => {
          socket.off('STOCK_UPDATED');
          socket.off('ORDER_CREATED');
          socket.off('PRODUCTION_POSTED');
          socket.off('VARIANCE_FLAGGED');
          socket.off('PAYMENT_RECEIVED');
        };
      } catch (err) {
        console.warn('Realtime socket initialization warning:', err);
      }
    }
  }, [isAuthenticated, queryClient]);

  return (
    <html lang="en">
      <head>
        <title>Annapurna — Order-to-Audit Manufacturing Operations System</title>
        <meta name="description" content="Production-first Manufacturing Operations & Audit Intelligence for South Indian Packaged Snacks" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-annapurna-cream-paper flex flex-col antialiased">
        <QueryClientProvider client={queryClient}>
          <Navbar />
          
          {/* Realtime Toast Banner */}
          {realtimeNotification && (
            <div className="bg-annapurna-terracotta text-white px-4 py-2 text-xs font-medium flex justify-between items-center shadow-md animate-pulse">
              <span>{realtimeNotification}</span>
              <button 
                onClick={() => setRealtimeNotification(null)}
                className="underline hover:text-annapurna-cream ml-4"
              >
                Dismiss
              </button>
            </div>
          )}

          <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>

          <footer className="bg-white border-t border-vintage py-6 mt-12 text-center text-xs text-annapurna-ink-muted">
            <p className="font-serif font-medium text-annapurna-ink">ANNAPURNA — ORDER-TO-AUDIT SYSTEM</p>
            <p className="mt-1">அன்னபூர்ணா • From the first order to the final audit • Tamil Nadu & Karnataka Operations</p>
            <p className="mt-1 text-[11px] text-annapurna-ink-faint">PostgreSQL NUMERIC Precision • ReportLab PDF Invoicing • openpyxl Audit Reports</p>
          </footer>
        </QueryClientProvider>
      </body>
    </html>
  );
}
