export interface CanonicalCourt {
  id: string;
  name: string;
  sport: 'fútbol 5' | 'fútbol 6' | 'fútbol 7' | 'fútbol 8' | 'fútbol 9' | 'fútbol 11' | string;
  surface: string; // 'sintético', 'cemento', 'césped', 'blindex', 'tierra', 'arena', etc.
  price: number;
  status: 'activa' | 'mantenimiento' | 'inactiva' | string;
}

export interface Court {
  id: number | string;
  name: string;
  type: string;
  sport?: string;
  surface: string;
  price_per_hour: number;
  price?: number;
  image_url?: string;
  is_roofed?: boolean;
  status?: 'available' | 'maintenance' | 'activa' | 'inactiva' | string;
  blockedCourts?: (number | string)[];
}

export interface CanonicalBooking {
  complejoId: string;
  complejoName: string;
  courtName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  price: number;
  deposit: number;
  status: 'confirmado' | 'cancelado' | 'jugado' | string;
  paymentStatus: 'pendiente' | 'seña' | 'pagado' | string;
  userId: string;
  userName: string;
  userPhone: string;
  userEmail: string;
  notes: string;
  ownerId: string;
  adminId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Match {
  id: number | string;
  court_id: number | string;
  courtId?: number | string;
  complexId?: string;
  complejoId?: string;
  complejoName?: string;
  host_id: number | string;
  userId?: string | number;
  start_time: string;
  end_time: string;
  startTime?: string;
  endTime?: string;
  date?: string;
  durationMinutes?: number;
  is_open: boolean;
  mode?: string;
  max_players: number;
  price_total: number;
  price?: number;
  amount_paid: number;
  deposit?: number;
  payment_status: 'pending' | 'paid' | 'partial' | string;
  paymentStatus?: string;
  status: string;
  court_name: string;
  courtName?: string;
  host_name: string;
  userName?: string;
  host_phone: string;
  userPhone?: string;
  userEmail?: string;
  notes?: string;
  ownerId?: string;
  adminId?: string;
  player_count: number;
  players: any[];
}

export interface CanonicalUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  gender: string;
  city: string;
  category: string;
  status: string;
  isActivated: boolean;
  acquisitionChannel: string;
  acquisitionDate: string;
  acquisitionTime: string;
  activationDate: string | null;
  activationTime: string | null;
  originComplejoId: string;
  originComplejoName: string;
  totalBookings: number;
  totalMatchesPlayed: number;
  participatedMatches: number;
  lastGameDate: string;
  lastGameTime: string;
  debt?: number;
  notes: string;
  ownerId: string;
  adminId: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: number | string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  skill_level?: string;
  rating?: number;
  matches_played?: number;
  created_at?: string;
  first_visit?: string;
  last_visit?: string;
  last_played_anywhere?: string;
  address?: string;
  distance_km?: number;
  history?: { court_name: string; start_time: string }[];
  gender?: string;
  city?: string;
  category?: string;
  status?: string;
  isActivated?: boolean;
  acquisitionChannel?: string;
  acquisitionDate?: string;
  acquisitionTime?: string;
  activationDate?: string | null;
  activationTime?: string | null;
  originComplejoId?: string;
  originComplejoName?: string;
  totalBookings?: number;
  totalMatchesPlayed?: number;
  participatedMatches?: number;
  lastGameDate?: string;
  lastGameTime?: string;
  debt?: number;
  notes?: string;
  ownerId?: string;
  adminId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductCategory {
  id: string;
  complejoId: string;
  name: string;
  description?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  complejoId: string;
  type: 'initial' | 'sale' | 'restock' | 'adjustment' | string;
  typeLabel: string; // 'Stock inicial', 'Venta', 'Reposición de stock', 'Ajuste manual'
  quantity: number; // e.g. +10 or -1
  resultingStock: number;
  date: string;
  time: string;
  formattedDate?: string;
  actorName?: string;
  notes?: string;
  createdAt?: any;
}

export interface Product {
  id: string;
  complejoId: string;
  name: string;
  categoryId: string;
  categoryName?: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
  status: 'activo' | 'inactivo';
  createdAt?: any;
  updatedAt?: any;
}

export interface TransactionPayment {
  method: 'efectivo' | 'transferencia' | 'tarjeta' | 'fiado';
  amount: number;
}

export interface TransactionItem {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface POSTransaction {
  id: string;
  complejoId: string;
  type: 'venta' | 'gasto' | string;
  total: number;
  payments: TransactionPayment[];
  items: TransactionItem[];
  userId?: string;
  userName?: string;
  paymentStatus?: 'paid' | 'fiado' | 'pending' | string;
  category?: string;
  description?: string;
  notes?: string;
  createdAt: any;
  settledAt?: any;
}

export interface Transaction {
  id: number | string;
  type: 'income' | 'expense' | 'venta' | 'gasto';
  category: string;
  amount: number;
  date: string;
  description: string;
  payments?: TransactionPayment[];
  items?: TransactionItem[];
  userId?: string;
  userName?: string;
  paymentStatus?: string;
  complejoId?: string;
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
