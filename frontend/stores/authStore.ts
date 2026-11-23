import { create } from 'zustand';

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone?: string;
  role: 'ADMIN' | 'SALESMAN' | 'PRODUCTION_SUPERVISOR' | 'OWNER' | 'ACCOUNTANT';
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  login: (token: string, user: User) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('annapurna_token', token);
      localStorage.setItem('annapurna_user', JSON.stringify(user));
    }
    set({ token, user, isAuthenticated: true });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('annapurna_token');
      localStorage.removeItem('annapurna_user');
    }
    set({ token: null, user: null, isAuthenticated: false });
  },
  initialize: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('annapurna_token');
      const userStr = localStorage.getItem('annapurna_user');
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          set({ token, user, isAuthenticated: true });
        } catch {
          localStorage.removeItem('annapurna_token');
          localStorage.removeItem('annapurna_user');
        }
      }
    }
  }
}));
