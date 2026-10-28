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
  time?: string;
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
  clientName?: string;
  host_phone: string;
  userPhone?: string;
  clientPhone?: string;
  userEmail?: string;
  clientEmail?: string;
  notes?: string;
  ownerId?: string;
  adminId?: string;
  canonicalId?: string;
  canonicalUserId?: string;
  canonicalName?: string;
  personId?: string;
  erpUserId?: string;
  historicalId?: string;
  historicalIds?: string[];
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
  address?: string;
  preferredFoot?: string;
  birthDate?: string;
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
  preferredFoot?: string;
  birthDate?: string;
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
  isDerived?: boolean;
  associatedComplexIds?: string[];
  canonicalId?: string;
  canonicalUserId?: string;
  canonicalName?: string;
  personId?: string;
  erpUserId?: string;
  historicalId?: string;
  historicalIds?: string[];
}

export interface ProductBatch {
  id: string;
  quantity: number;
  initialQuantity: number;
  unitCost: number;
  purchasePlace?: string;
  operationId?: string;
  expenseCategoryId?: string | null;
  expenseCategoryName?: string | null;
  expenseConceptId?: string | null;
  expenseConceptName?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  entityType?: ExpenseEntityType | string | null;
  createdAt: any;
}

export interface ProductCategory {
  id: string;
  complejoId: string;
  name: string;
  description?: string;
  catalogType?: 'sale' | 'expense';
  status?: 'activo' | 'inactivo';
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
  operationId?: string;
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
  price?: number; // Importe predefinido para conceptos de gasto o alias monetario
  stock: number;
  status: 'activo' | 'inactivo';
  catalogType?: 'sale' | 'expense';
  batches?: ProductBatch[];
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

export type ComplexClientStatus = 'trial' | 'active' | 'inactive' | 'paused';

export interface CanonicalComplejo {
  id: string;
  name: string;
  company?: string;
  clientStatus: ComplexClientStatus;
  phone?: string;
  address?: string;
  instagram?: string;
  description?: string;
  courts?: any[];
  hours?: any[];
  isActivated?: boolean;
  ownerUid?: string;
  ownerEmail?: string;
  activatedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export type InvitationStatus = 'pending' | 'claimed' | 'expired' | 'revoked';

export interface SaaSInvitation {
  id?: string;
  token: string;
  complexId: string;
  complexName?: string;
  role: 'owner' | 'admin' | 'staff' | string;
  status: InvitationStatus;
  createdAt: any;
  expiresAt: any;
  claimedByUid?: string | null;
  claimedByEmail?: string | null;
  claimedAt?: any | null;
}

export interface ComplexMembership {
  complexId: string;
  complexName: string;
  role: string;
  clientStatus?: ComplexClientStatus;
}

export interface CollaboratorProfile {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
  activeComplexId: string;
  complexIds?: string[];
  memberships: ComplexMembership[];
  createdAt?: any;
  updatedAt?: any;
}

// ==========================================
// MODELO FINANCIERO UNIFICADO (FASE 2 / ETAPA 1)
// ==========================================

export type OperationType = 
  | 'pos_sale' 
  | 'court_booking' 
  | 'expense' 
  | 'purchase' 
  | 'sale' 
  | 'booking' 
  | 'historical_debt_settlement';

export type OperationPaymentStatus = 
  | 'unpaid'              // $0 cobrado/pagado (Activa)
  | 'partial'             // Cobrado/pagado > $0 y < contractualAmount (Activa)
  | 'paid'                // Cobrado/pagado >= contractualAmount (Activa)
  | 'cancelled_unpaid'    // Cancelada sin cobros ($0 recaudado, saldo pendiente nulo)
  | 'cancelled_retained'  // Cancelada con retención total (ej. seña no devuelta como penalidad)
  | 'partial_refunded'    // Cancelada o ajustada con devolución parcial de lo cobrado
  | 'fully_refunded';     // Cancelada con devolución del 100% de lo cobrado

export type FinancialMovementFlow = 'income' | 'expense';

export type FinancialPaymentMethod = 'cash' | 'transfer' | 'debit' | 'credit' | 'mercado_pago' | 'other';

export type FinancialMovementCategory = 
  | 'sale_collection'
  | 'booking_deposit'
  | 'booking_settlement'
  | 'expense_payment'
  | 'refund'
  | 'historical_debt_payment';

export interface OperationDocument {
  id: string;                         // UUID v4 único
  complexId: string;                  // Aislamiento multi-tenant
  complejoId?: string;                // Compatibilidad con reglas y queries en español
  ticketCode: string;                 // Código secuencial legible (ej. T-26-000042)
  operationType: OperationType;

  // Enlaces a entidades del dominio
  bookingId?: string;                 // ID en /bookings si aplica
  legacySaleId?: string;              // ID en /sales o /transactions si aplica

  // Responsable
  responsibleType: 'user' | 'anonymous' | 'supplier';
  userId?: string | null;             // UID en /users
  clientId?: string | null;           // Alias unificado para cliente
  userName: string;
  clientName?: string;                // Alias unificado para nombre de cliente
  userPhone?: string;
  clientPhone?: string;               // Alias unificado para teléfono de cliente
  supplierId?: string | null;         // ID estable del proveedor/concepto si aplica
  supplierName?: string | null;       // Nombre del proveedor si aplica
  expenseCategoryId?: string | null;
  expenseCategoryName?: string | null;
  expenseConceptId?: string | null;
  expenseConceptName?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  entityType?: ExpenseEntityType | string | null;

  // Cuentas contractuales y flujos monetarios
  contractualAmount: number;          // Monto total nominal pactado
  totalCollected: number;             // Total acumulado cobrado/pagado efectivamente
  totalRefunded: number;              // Total acumulado devuelto
  netCollected: number;               // totalCollected - totalRefunded
  retainedAmount: number;             // Monto retenido al cancelar
  amountPending: number;              // Saldo pendiente contractual / por pagar (0 si cancelada o saldada)

  paymentStatus: OperationPaymentStatus;

  // Cuenta Corriente ("Fiado")
  currentAccountAssigned: boolean;    // true ÚNICAMENTE si se asignó explícitamente a CC con userId
  currentAccountDebtAmount: number;   // Deuda atribuida vigente cargada a la cuenta corriente del usuario

  // Desglose de ítems
  items?: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;

  notes?: string;
  metadata?: Record<string, any>;

  createdAt: any;
  updatedAt: any;
  createdBy: string;
}

export interface FinancialMovementDocument {
  id: string;                         // UUID v4 único
  complexId: string;                  // Aislamiento multi-tenant
  complejoId?: string;                // Compatibilidad con reglas y queries en español
  operationId?: string | null;        // FK opcional a /operations (null en abonos de deuda histórica directa)
  bookingId?: string | null;          // FK opcional a /bookings
  ticketCode: string;                 // Desnormalizado para búsquedas e impresión
  idempotencyKey: string;             // FK a la clave de idempotencia procesada

  flow: FinancialMovementFlow;        // 'income' | 'expense'
  category: FinancialMovementCategory;
  amount: number;                     // Monto positivo estricto (> 0)
  paymentMethod: FinancialPaymentMethod;
  effectiveDate: any;                 // Fecha real en que se produjo el movimiento en caja

  userId?: string | null;
  clientId?: string | null;
  responsibleName: string;
  userName?: string;
  clientName?: string;
  userPhone?: string;
  clientPhone?: string;
  clearedCurrentAccountDebt: number;  // Monto que este cobro descuenta de cuenta corriente

  notes?: string;
  expenseCategoryId?: string | null;
  expenseCategoryName?: string | null;
  expenseConceptId?: string | null;
  expenseConceptName?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  entityType?: ExpenseEntityType | string | null;
  operatorId: string;
  createdAt: any;
}

export interface IdempotencyRecord {
  idempotencyKey: string;
  complexId: string;
  complejoId?: string;
  operationId?: string | null;        // Opcional para abonos directos de deuda histórica
  ticketCode?: string;
  amount: number;
  paymentMethod: FinancialPaymentMethod;
  flow: FinancialMovementFlow;
  status: 'processing' | 'completed' | 'failed';
  movementId?: string;
  errorMessage?: string;
  createdAt: any;
  completedAt?: any;
}

export interface ComplexCountersDocument {
  complexId: string;
  pos_sale_sequence: number;
  court_booking_sequence: number;
  expense_sequence: number;
  historical_debt_sequence: number;
  updatedAt: any;
}

export interface FinancialCalculationInput {
  contractualAmount: number;
  totalCollected: number;
  totalRefunded: number;
  isCancelled?: boolean;
  retainDepositOnCancel?: boolean;
}

export interface FinancialCalculationResult {
  contractualAmount: number;
  totalCollected: number;
  totalRefunded: number;
  netCollected: number;
  retainedAmount: number;
  amountPending: number;
  paymentStatus: OperationPaymentStatus;
}

export interface CreateOperationParams {
  complexId: string;
  operationType: OperationType;
  contractualAmount: number;
  operatorId: string;
  responsibleType?: 'user' | 'anonymous' | 'supplier';
  userId?: string | null;
  clientId?: string | null;
  userName?: string;
  clientName?: string;
  userPhone?: string;
  clientPhone?: string;
  items?: Array<{
    id?: string;
    productId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  bookingId?: string;
  legacySaleId?: string;
  notes?: string;
  idempotencyKey?: string;
  initialPayment?: {
    amount: number;
    paymentMethod: FinancialPaymentMethod;
    idempotencyKey: string;
    notes?: string;
  };
  initialPayments?: Array<{
    amount: number;
    paymentMethod: FinancialPaymentMethod;
    idempotencyKey: string;
    notes?: string;
  }>;
  assignToCurrentAccount?: boolean;
  customDebtAmount?: number;
}

export interface RegisterOperationPaymentParams {
  complexId: string;
  operationId: string;
  amount: number;
  paymentMethod: FinancialPaymentMethod;
  idempotencyKey: string;
  operatorId: string;
  notes?: string;
  category?: FinancialMovementCategory;
}

export interface RegisterHistoricalDebtPaymentParams {
  complexId: string;
  userId: string;
  amount: number;
  paymentMethod: FinancialPaymentMethod;
  idempotencyKey: string;
  operatorId: string;
  notes?: string;
}

export interface CancelOperationParams {
  complexId: string;
  operationId: string;
  operatorId: string;
  policy: 'retain_deposit' | 'refund_deposit' | 'partial_refund';
  refundAmount?: number;
  refundPaymentMethod?: FinancialPaymentMethod;
  idempotencyKey?: string;
  notes?: string;
}

export interface OperationResult {
  success: boolean;
  operationId: string;
  ticketCode: string;
  paymentStatus: OperationPaymentStatus;
  amountPending: number;
  currentAccountDebtAmount: number;
  movementId?: string | null;
  movementIds?: string[];
  alreadyProcessed?: boolean;
}

export interface PaymentRegistrationResult {
  success: boolean;
  operationId: string;
  movementId: string | null;
  ticketCode: string;
  paymentStatus: OperationPaymentStatus;
  amountPending: number;
  currentAccountDebtAmount: number;
  clearedCurrentAccountDebt: number;
  alreadyProcessed?: boolean;
}

export interface HistoricalDebtPaymentResult {
  success: boolean;
  movementId: string;
  ticketCode: string;
  userId: string;
  clearedDebt: number;
  remainingDebt: number;
  alreadyProcessed?: boolean;
}

export interface RegisterExpenseOperationParams {
  complexId: string;
  category: string;
  categoryId?: string;
  concept: string;
  conceptId?: string;
  supplierId?: string;
  supplierName?: string;
  entityId?: string | null;
  entityName?: string | null;
  entityType?: ExpenseEntityType | string | null;
  amount: number;
  payments: Array<{
    amount: number;
    paymentMethod: FinancialPaymentMethod;
    notes?: string;
  }>;
  operatorId: string;
  notes?: string;
  idempotencyKey?: string;
}

export type ExpenseEntityType = 'Empresa' | 'Sector Público' | 'Persona' | 'ONG' | 'Otro';

export interface ExpenseEntity {
  id: string;
  complejoId: string;
  complexId: string;
  name: string;               // Obligatorio
  type: ExpenseEntityType;    // Obligatorio
  location?: string;          // Ubicación
  cuit?: string;              // CUIT / CUIL
  phone?: string;             // Teléfono de contacto
  email?: string;             // Correo electrónico
  notes?: string;             // Observaciones
  status: 'activo' | 'inactivo'; // Estado
  createdAt?: any;
  updatedAt?: any;
}

export const getExpenseEntityTypeBadgeClass = (type?: ExpenseEntityType | string | null): string => {
  switch (type) {
    case 'Empresa':
      return 'bg-[#2563eb] text-white';
    case 'Sector Público':
      return 'bg-[#eab308] text-slate-900';
    case 'Persona':
      return 'bg-[#e2e8f0] text-slate-700 dark:bg-slate-700 dark:text-slate-200';
    case 'ONG':
      return 'bg-[#9333ea] text-white';
    case 'Otro':
      return 'bg-[#ef4444] text-white';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  }
};

