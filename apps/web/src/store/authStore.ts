import { create } from 'zustand';

export type UserRole = 'MAIN_ADMIN' | 'EMPLOYEE';
export type UserStatus = 'AVAILABLE' | 'AWAY' | 'DND';

export interface UserSummary {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  status_text: string | null;
  is_active: boolean;
  is_demo: boolean;
}

interface AuthState {
  user: UserSummary | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: UserSummary, token: string) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: UserSummary) => void;
  updateStatus: (status: UserStatus, statusText?: string | null) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user: UserSummary, token: string) =>
    set({
      user,
      accessToken: token,
      isAuthenticated: true,
      isLoading: false,
    }),

  setAccessToken: (token: string) =>
    set({ accessToken: token, isAuthenticated: true }),

  setUser: (user: UserSummary) =>
    set({ user }),

  updateStatus: (status: UserStatus, statusText?: string | null) =>
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            status,
            status_text: statusText !== undefined ? statusText : state.user.status_text,
          }
        : null,
    })),

  clearAuth: () =>
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    }),

  setLoading: (loading: boolean) =>
    set({ isLoading: loading }),
}));
