import { create } from 'zustand';
import { apiFetch } from '../lib/api';

export interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
  is_lead: boolean;
  joined_at: string;
}

export interface Team {
  id: string;
  name: string;
  display_name: string;
  color: string;
  file_size_limit_bytes: number | null;
  active_member_count: number;
  lead_names: string[];
  created_at: string;
  updated_at: string;
}

export interface TeamDetail extends Team {
  members: TeamMember[];
}

interface TeamState {
  teams: Team[];
  activeTeamId: string | null;
  teamDetails: Record<string, TeamDetail>;
  loading: boolean;
  error: string | null;

  fetchTeams: () => Promise<void>;
  fetchTeamDetail: (teamId: string) => Promise<TeamDetail | null>;
  setActiveTeamId: (teamId: string | null) => void;
  updateTeamLimit: (teamId: string, limitBytes: number | null) => Promise<void>;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  teams: [],
  activeTeamId: null,
  teamDetails: {},
  loading: false,
  error: null,

  fetchTeams: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<Team[]>('/teams');
      set({ teams: data, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch teams',
        loading: false,
      });
    }
  },

  fetchTeamDetail: async (teamId: string) => {
    try {
      const detail = await apiFetch<TeamDetail>(`/teams/${teamId}`);
      set((state) => ({
        teamDetails: { ...state.teamDetails, [teamId]: detail },
      }));
      return detail;
    } catch (err) {
      console.error(`Failed to fetch team details for ${teamId}:`, err);
      return null;
    }
  },

  setActiveTeamId: (teamId: string | null) => {
    set({ activeTeamId: teamId });
    if (teamId && !get().teamDetails[teamId]) {
      get().fetchTeamDetail(teamId);
    }
  },

  updateTeamLimit: async (teamId: string, limitBytes: number | null) => {
    const updated = await apiFetch<Team>(`/teams/${teamId}/limit`, {
      method: 'PATCH',
      body: JSON.stringify({ file_size_limit_bytes: limitBytes }),
    });
    set((state) => ({
      teams: state.teams.map((t) => (t.id === teamId ? { ...t, ...updated } : t)),
    }));
  },
}));
