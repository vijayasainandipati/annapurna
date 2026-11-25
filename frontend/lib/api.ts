const API_BASE = '/api/v1';

export function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('annapurna_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = 'An error occurred';
    try {
      const data = await res.json();
      errorDetail = data.detail || JSON.stringify(data);
    } catch {
      errorDetail = await res.text();
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

async function downloadAuthenticatedFile(url: string, fallbackFilename: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('annapurna_token') : null;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    let errorDetail = 'Download failed';
    try {
      const data = await res.json();
      errorDetail = data.detail || errorDetail;
    } catch {}
    throw new Error(errorDetail);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackFilename;

  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export const api = {
  // Auth
  auth: {
    login: async (credentials: any) => {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      return handleResponse<{ access_token: string; token_type: string; user: any }>(res);
    },
    me: async () => {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    }
  },

  // Masters
  masters: {
    getMaterials: async () => {
      const res = await fetch(`${API_BASE}/masters/materials`, { headers: getAuthHeaders() });
      return handleResponse<any[]>(res);
    },
    getProducts: async () => {
      const res = await fetch(`${API_BASE}/masters/products`, { headers: getAuthHeaders() });
      return handleResponse<any[]>(res);
    },
    getBOMs: async (productId: string) => {
      const res = await fetch(`${API_BASE}/masters/boms/${productId}`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    },
    getCustomers: async () => {
      const res = await fetch(`${API_BASE}/masters/customers`, { headers: getAuthHeaders() });
      return handleResponse<any[]>(res);
    }
  },

  // Inventory
  inventory: {
    getSummary: async () => {
      const res = await fetch(`${API_BASE}/inventory/summary`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    },
    getLedger: async (limit = 100) => {
      const res = await fetch(`${API_BASE}/inventory/ledger?limit=${limit}`, { headers: getAuthHeaders() });
      return handleResponse<any[]>(res);
    },
    recordPurchase: async (payload: {
      material_id: string;
      quantity: string;
      purchase_rate: string;
      supplier_name?: string;
      supplier_invoice_no?: string;
      notes?: string;
    }) => {
      const res = await fetch(`${API_BASE}/inventory/purchases`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      return handleResponse<any>(res);
    },
    recordAdjustment: async (payload: {
      item_type: string;
      material_id?: string;
      product_id?: string;
      quantity_delta: string;
      reason: string;
    }) => {
      const res = await fetch(`${API_BASE}/inventory/adjustments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      return handleResponse<any>(res);
    }
  },

  // Production
  production: {
    getRuns: async () => {
      const res = await fetch(`${API_BASE}/production/runs`, { headers: getAuthHeaders() });
      return handleResponse<any[]>(res);
    },
    createRun: async (payload: { bom_id: string; planned_quantity: string; notes?: string }) => {
      const res = await fetch(`${API_BASE}/production/runs`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      return handleResponse<any>(res);
    },
    postRun: async (runId: string, payload: any) => {
      const res = await fetch(`${API_BASE}/production/runs/${runId}/post`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      return handleResponse<any>(res);
    }
  },

  // Sales
  sales: {
    getOrders: async () => {
      const res = await fetch(`${API_BASE}/sales/orders`, { headers: getAuthHeaders() });
      return handleResponse<any[]>(res);
    },
    createOrder: async (payload: any) => {
      const res = await fetch(`${API_BASE}/sales/orders`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      return handleResponse<any>(res);
    },
    updateOrderStatus: async (orderId: string, status: string, rejection_reason?: string) => {
      const res = await fetch(`${API_BASE}/sales/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, rejection_reason })
      });
      return handleResponse<any>(res);
    },
    checkAvailability: async (orderId: string) => {
      const res = await fetch(`${API_BASE}/sales/orders/${orderId}/stock-check`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    },
    generateInvoice: async (orderId: string) => {
      const res = await fetch(`${API_BASE}/sales/orders/${orderId}/invoice`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      return handleResponse<any>(res);
    },
    dispatchOrder: async (orderId: string, payload: { order_id: string; invoice_id: string; partial_quantity?: number; notes?: string }) => {
      const res = await fetch(`${API_BASE}/sales/orders/${orderId}/dispatch`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      return handleResponse<any>(res);
    },
    getInvoices: async () => {
      const res = await fetch(`${API_BASE}/sales/invoices`, { headers: getAuthHeaders() });
      return handleResponse<any[]>(res);
    },
    downloadInvoicePdf: async (invoiceId: string, invoiceNumber?: string) => {
      const safeName = `Invoice_${(invoiceNumber || invoiceId).replace(/\//g, '_')}.pdf`;
      return downloadAuthenticatedFile(`${API_BASE}/sales/invoices/${invoiceId}/pdf`, safeName);
    }
  },

  // Finance & Payments
  finance: {
    getPayments: async () => {
      const res = await fetch(`${API_BASE}/payments`, { headers: getAuthHeaders() });
      return handleResponse<any[]>(res);
    },
    recordPayment: async (payload: any) => {
      const res = await fetch(`${API_BASE}/payments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      return handleResponse<any>(res);
    },
    getReceivables: async () => {
      const res = await fetch(`${API_BASE}/payments/receivables`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    }
  },

  // Reports
  reports: {
    getSalesRegister: async (params?: string) => {
      const res = await fetch(`${API_BASE}/reports/sales-register${params ? `?${params}` : ''}`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    },
    getGSTSummary: async () => {
      const res = await fetch(`${API_BASE}/reports/gst-summary`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    },
    getStockLedger: async () => {
      const res = await fetch(`${API_BASE}/reports/stock-ledger`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    },
    getProductionVariance: async () => {
      const res = await fetch(`${API_BASE}/reports/production-variance`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    },
    getBatchCosting: async () => {
      const res = await fetch(`${API_BASE}/reports/batch-costing`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    },
    downloadReport: async (pathWithQuery: string, fallbackFilename: string) => {
      return downloadAuthenticatedFile(`${API_BASE}/reports/${pathWithQuery}`, fallbackFilename);
    }
  },

  // Realtime
  realtime: {
    processOutbox: async () => {
      const res = await fetch(`${API_BASE}/realtime/process-outbox`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      return handleResponse<any>(res);
    },
    getEvents: async () => {
      const res = await fetch(`${API_BASE}/realtime/events`, { headers: getAuthHeaders() });
      return handleResponse<any[]>(res);
    },
    getStats: async () => {
      const res = await fetch(`${API_BASE}/realtime/stats`, { headers: getAuthHeaders() });
      return handleResponse<any>(res);
    }
  }
};
