export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  skill_level: string;
  rating: number;
  matches_played: number;
  created_at?: string;
  first_visit: string;
  last_visit: string;
  last_played_anywhere?: string;
  address?: string;
  distance_km?: number;
  history?: { court_name: string; start_time: string }[];
}

export interface Court {
  id: number;
  name: string;
  type: string;
  surface: string;
  price_per_hour: number;
  image_url?: string;
  is_roofed?: boolean;
  status?: 'available' | 'maintenance';
  blockedCourts?: number[];
}

export interface Match {
  id: number;
  court_id: number;
  host_id: number;
  start_time: string;
  end_time: string;
  is_open: boolean;
  mode?: string;
  max_players: number;
  price_total: number;
  amount_paid: number;
  payment_status: 'pending' | 'paid' | 'partial';
  status: string;
  court_name: string;
  host_name: string;
  host_phone: string;
  player_count: number;
  players: User[];
}

export interface Transaction {
  id: number;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: string;
  description: string;
}

export interface DashboardStats {
  totalUsers: number;
  todayMatches: number;
  revenue: number;
  occupancyRate: number;
  aiSuggestion: string;
  preferredGameMode: string;
  newUsers: number;
  recentActivity?: any[];
}

export interface SupportTicket {
  id: number;
  ticket_code: string;
  type: 'bug' | 'feature' | 'inquiry' | 'urgent';
  priority: 'low' | 'medium' | 'high' | 'critical';
  module: string;
  title: string;
  description: string;
  admin_name?: string;
  admin_email?: string;
  admin_phone?: string;
  system_info?: string;
  status: 'pending' | 'in_review' | 'resolved';
  channel?: 'whatsapp' | 'email' | 'system';
  created_at: string;
}
