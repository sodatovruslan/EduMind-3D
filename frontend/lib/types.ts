export type UserRole = "student" | "teacher" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export type SimulationModule = "simlab" | "geo3d";

export interface Simulation {
  id: string;
  title: string;
  module: SimulationModule;
  subject: string;
  config: Record<string, unknown>;
  difficulty: number;
  created_at: string;
}

export interface LabResult {
  id: string;
  user_id: string;
  simulation_id: string;
  simulation_title: string;
  actions_log: Record<string, unknown>[];
  score: number | null;
  feedback: { text: string } | null;
  duration_seconds: number;
  completed_at: string;
}

export interface ClassStats {
  average_score: number | null;
  completion_rate: number;
  active_students: number;
  total_students: number;
}
