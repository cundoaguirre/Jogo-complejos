import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Check, 
  AlertCircle, 
  CircleDollarSign,
  Landmark,
  CreditCard, 
  History,
  RefreshCw,
  X,
  Package,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  GripVertical
} from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import type { Product, User, ProductCategory, FinancialPaymentMethod, ExpenseEntity } from '../types';
import { 
  subscribeToProducts, 
  subscribeToInventoryCategories, 
  subscribeToClients,
  createOperationWithInitialPayment,
  isGenericClientPlaceholder,
  subscribeToExpenseCategories,
  subscribeToExpenseItems,
  executeExpenseOperation,
  subscribeToExpenseEntities
} from '../lib/firestoreSync';
import { usePOSCart } from './POSCartContext';
import { playAddToCartSound, playCashRegisterSound } from '../lib/posAudio';
import { auth } from '../lib/firebase';

const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Pendiente'];
const EXPENSE_PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Pendiente'];
const STORAGE_PAYMENT_ORDER_KEY = 'jogo_payment_methods_order';

interface PaymentBlock {
  id: string;
  method: string;
  amount: number | string;
}

interface POSModalProps {
  isOpen: boolean;
  onClose: () => void;
  complexId?: string;
  onNavigateToUserProfile?: (userId: string) => void;
  initialSection?: 'mostrador' | 'gastos';
  users?: User[];
}

export const POSModal: React.FC<POSModalProps> = ({
  isOpen,
  onClose,
  complexId = 'B',
  onNavigateToUserProfile,
  initialSection = 'mostrador',
  users: propUsers = []
}) => {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;

  // Global cart state (persists across closures)
  const { 
    items: cartItems, 
    addToCart, 
    updateQuantity, 
    removeItem, 
    clearCart, 
    total: cartTotal, 
    totalUnits 
  } = usePOSCart();

  // Top Section: 'mostrador' | 'gastos'
  const [activeSection, setActiveSection] = useState<'mostrador' | 'gastos'>(initialSection);

  // Step in Mostrador: 1 (Armado del Carrito) | 2 (Checkout y Calculadora)
  const [step, setStep] = useState<1 | 2>(1);

  // Catalog State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Clients State
  const [clients, setClients] = useState<User[]>([]);
  const [selectedClient, setSelectedClient] = useState<User | null>(null);
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
  const [clientSearchText, setClientSearchText] = useState('');
  const clientBoxRef = useRef<HTMLDivElement>(null);

  // Payment Methods Order (customizable via drag-and-drop & saved in localStorage)
  const [orderedMethods, setOrderedMethods] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_PAYMENT_ORDER_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map((m: string) => 
              m === 'Fiado' ? 'Pendiente' : (m === 'Crédito' || m === 'Credito') ? 'Tarjeta' : m
            );
            DEFAULT_PAYMENT_METHODS.forEach(def => {
              if (!normalized.includes(def)) normalized.push(def);
            });
            return Array.from(new Set(normalized));
          }
        }
      } catch (e) {}
    }
    return DEFAULT_PAYMENT_METHODS;
  });

  // Payments blocks in Step 2 (Checkout)
  const [payments, setPayments] = useState<PaymentBlock[]>([]);
  const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);
  const [editingPaymentIndex, setEditingPaymentIndex] = useState<number | null>(null);
  const [deleteMenuRowId, setDeleteMenuRowId] = useState<string | null>(null);
  const sheetDragControls = useDragControls();

  // Submission & Confirmation state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saleIdempotencyKey, setSaleIdempotencyKey] = useState<string | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [confirmationData, setConfirmationData] = useState<{
    type: 'mostrador' | 'gastos';
    title: string;
    total: number;
    ticketCode: string;
    clientOrEntity?: string;
  } | null>(null);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Gastos (Expense Management) state
  const [expenseCategories, setExpenseCategories] = useState<ProductCategory[]>([]);
  const [expenseItems, setExpenseItems] = useState<Product[]>([]);
  const [expenseStep, setExpenseStep] = useState<1 | 2>(1);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('all');
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [selectedExpenseConcept, setSelectedExpenseConcept] = useState<Product | null>(null);
  const [expenseAmount, setExpenseAmount] = useState<number | string>('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expensePayments, setExpensePayments] = useState<PaymentBlock[]>([
    { id: 'exp_p_1', method: orderedMethods[0] || 'Efectivo', amount: '' }
  ]);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [expenseErrorMsg, setExpenseErrorMsg] = useState<string | null>(null);

  // Focus ref for expense amount
  const expenseAmountInputRef = useRef<HTMLInputElement>(null);

  // 3-Dimension Expense Architecture: Entidades (Selector/Buscador sin alta de FAB)
  const [expenseEntities, setExpenseEntities] = useState<ExpenseEntity[]>([]);
  const [selectedExpenseEntity, setSelectedExpenseEntity] = useState<ExpenseEntity | null>(null);
  const [isEntitySearchOpen, setIsEntitySearchOpen] = useState(false);
  const [entitySearchText, setEntitySearchText] = useState('');
  const entityBoxRef = useRef<HTMLDivElement>(null);

  // Limpieza y manejo del auto-cierre en 2 segundos
  const handleCloseConfirmation = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setConfirmationData(null);
    onClose();
  };

  const triggerConfirmation = (data: {
    type: 'mostrador' | 'gastos';
    title: string;
    total: number;
    ticketCode: string;
    clientOrEntity?: string;
  }) => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
    }
    setConfirmationData(data);
    autoCloseTimerRef.current = setTimeout(() => {
      handleCloseConfirmation();
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, []);

  // Reset when opening / closing
  useEffect(() => {
    if (isOpen) {
      if (initialSection) {
        setActiveSection(initialSection);
      }
      setStep(1);
      setExpenseStep(1);
      const defaultMethod = orderedMethods[0] || 'Efectivo';
      setPayments([]);
      setExpensePayments([{ id: `exp_p_${Date.now()}`, method: defaultMethod, amount: '' }]);
      setIsClientSearchOpen(false);
      setIsEntitySearchOpen(false);
      setDeleteMenuRowId(null);
      setConfirmationData(null);
    } else {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      setConfirmationData(null);
    }
  }, [isOpen, initialSection]);

  // Listener para cerrar buscadores de cliente y entidad al tocar afuera de sus contenedores
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node)) {
        setIsClientSearchOpen(false);
      }
      if (entityBoxRef.current && !entityBoxRef.current.contains(e.target as Node)) {
        setIsEntitySearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Subscriptions to Firestore data
  useEffect(() => {
    if (!isOpen) return;

    const unsubProds = subscribeToProducts(targetId, (prods) => {
      setProducts(prods);
    });

    const unsubCats = subscribeToInventoryCategories(targetId, (cats) => {
      setCategories(cats);
    });

    const unsubClients = subscribeToClients(targetId, (cls) => {
      setClients(cls);
    });

    const unsubExpCats = subscribeToExpenseCategories(targetId, (expCats) => {
      setExpenseCategories(expCats);
    });

    const unsubExpItems = subscribeToExpenseItems(targetId, (expIts) => {
      setExpenseItems(expIts);
    });

    const unsubEntities = subscribeToExpenseEntities(targetId, (ents) => {
      setExpenseEntities(ents);
    });

    return () => {
      unsubProds();
      unsubCats();
      unsubClients();
      unsubExpCats();
      unsubExpItems();
      unsubEntities();
    };
  }, [targetId, isOpen]);

  // Escuchar cambios de orden de métodos emitidos desde otros componentes (Reservas, Compras, etc.)
  useEffect(() => {
    const handleOrderChange = () => {
      try {
        const saved = localStorage.getItem(STORAGE_PAYMENT_ORDER_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map((m: string) => 
              m === 'Fiado' ? 'Pendiente' : (m === 'Crédito' || m === 'Credito') ? 'Tarjeta' : m
            );
            DEFAULT_PAYMENT_METHODS.forEach(def => {
              if (!normalized.includes(def)) normalized.push(def);
            });
            const newOrder = Array.from(new Set(normalized));
            setOrderedMethods(newOrder);
            setPayments(prev => prev.length === 1 ? [{ ...prev[0], method: newOrder[0] || 'Efectivo' }] : prev);
            setExpensePayments(prev => prev.length === 1 ? [{ ...prev[0], method: newOrder[0] || 'Efectivo' }] : prev);
          }
        }
      } catch (e) {}
    };
    window.addEventListener('jogo_payment_methods_order_changed', handleOrderChange);
    return () => window.removeEventListener('jogo_payment_methods_order_changed', handleOrderChange);
  }, []);

  // Save methods order to localStorage when modified & broadcast event
  const handleSaveMethodsOrder = (newOrder: string[]) => {
    setOrderedMethods(newOrder);
    try {
      localStorage.setItem(STORAGE_PAYMENT_ORDER_KEY, JSON.stringify(newOrder));
      window.dispatchEvent(new Event('jogo_payment_methods_order_changed'));
    } catch (e) {}
    // Sincronía inmediata en el modal actual si hay 1 solo pago
    setPayments(prev => prev.length === 1 ? [{ ...prev[0], method: newOrder[0] || 'Efectivo' }] : prev);
    setExpensePayments(prev => prev.length === 1 ? [{ ...prev[0], method: newOrder[0] || 'Efectivo' }] : prev);
  };

  // Sync payments state when entering Step 2 in Mostrador (always orderedMethods[0] default)
  useEffect(() => {
    if (step === 2) {
      if (payments.length === 0) {
        const defaultMethod = orderedMethods[0] || 'Efectivo';
        setPayments([
          {
            id: `pay_${Date.now()}`,
            method: defaultMethod,
            amount: cartTotal
          }
        ]);
      } else {
        if (payments.length === 1 && payments[0].amount === 0) {
          setPayments([{ ...payments[0], amount: cartTotal }]);
        }
      }
    }
  }, [step, cartTotal, orderedMethods]);

  // If cart becomes empty while in Step 2, go back to Step 1
  useEffect(() => {
    if (cartItems.length === 0 && step === 2) {
      setStep(1);
      setPayments([]);
    }
  }, [cartItems.length, step]);

  // Category Selection Logic for Mostrador
  const handleToggleCategory = (cat: string) => {
    if (cat === 'all') {
      setSelectedCategories([]);
      return;
    }

    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        return prev.filter((c) => c !== cat);
      } else {
        return [...prev, cat];
      }
    });
  };

  // Filtered and sorted products for Step 1
  const displayedProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (p.status === 'inactivo') return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchCat = (p.categoryId || '').toLowerCase().includes(q);
          if (!matchName && !matchCat) return false;
        }
        if (selectedCategories.length > 0) {
          if (!selectedCategories.includes(p.categoryId)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (selectedCategories.length > 1) {
          const idxA = selectedCategories.indexOf(a.categoryId);
          const idxB = selectedCategories.indexOf(b.categoryId);
          if (idxA !== -1 && idxB !== -1 && idxA !== idxB) {
            return idxA - idxB;
          }
        }
        return a.name.localeCompare(b.name);
      });
  }, [products, searchQuery, selectedCategories]);

  // Todos los usuarios registrados: unificación completa de propUsers y subscribeToClients
  const allAvailableClients = useMemo(() => {
    const map = new Map<string, User>();
    clients.forEach((c) => {
      if (c && c.id) map.set(String(c.id), c);
    });
    if (propUsers && Array.isArray(propUsers)) {
      propUsers.forEach((u) => {
        if (u && u.id) {
          const existing = map.get(String(u.id));
          map.set(String(u.id), { ...existing, ...u });
        }
      });
    }
    return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [clients, propUsers]);

  // Filtered clients for quick selection (sin .slice(0, 10), todos disponibles con scroll max-h-28)
  const filteredClients = useMemo(() => {
    if (!clientSearchText.trim()) return allAvailableClients;
    const q = clientSearchText.toLowerCase();
    return allAvailableClients.filter((c) => 
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && String(c.phone).includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  }, [allAvailableClients, clientSearchText]);

  // Calculations for Step 2 (Checkout Calculator - Mostrador):
  const totalAssignedPayments = useMemo(() => {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments]);

  const diff = totalAssignedPayments - cartTotal;
  const isSobra = diff > 0.01;
  const isFalta = diff < -0.01;
  const sobrante = Math.max(0, diff);
  const faltante = Math.max(0, -diff);
  const isMathExact = cartTotal > 0 && Math.abs(diff) < 0.01;

  // Visual name is "Pendiente", internally mapped to "fiado"
  const hasFiado = payments.some((p) => {
    const m = p.method.toLowerCase();
    return (m.includes('pendiente') || m.includes('fiado')) && (Number(p.amount) || 0) > 0;
  });
  const isFiadoBlocked = hasFiado && !selectedClient;
  const canFinalizeSale = (isMathExact || isSobra) && !isFiadoBlocked && !isSubmitting && cartItems.length > 0;

  // Handle clicking (+) on product in Step 1
  const handleProductAdd = (product: Product) => {
    addToCart(product);
    playAddToCartSound();
  };

  // Autocorrect when clicking "Sobran $X"
  const handleAutocorrectSobrante = () => {
    if (payments.length === 1) {
      setPayments([{ ...payments[0], amount: cartTotal }]);
    } else {
      setPayments((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        const curAmt = Number(last.amount) || 0;
        const newAmt = Math.max(0, curAmt - sobrante);
        copy[copy.length - 1] = { ...last, amount: newAmt };
        return copy;
      });
    }
  };

  // Add a new payment method row with exact missing amount
  const handleAddNewPaymentMethod = (methodToUse?: string) => {
    let selectedMethod = methodToUse;
    if (!selectedMethod) {
      const unusedMethod = orderedMethods.find((m) => !payments.some((p) => p.method === m));
      selectedMethod = unusedMethod || orderedMethods[0] || 'Transferencia';
    }

    const newPaymentBlock: PaymentBlock = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      method: selectedMethod,
      amount: faltante > 0 ? faltante : 0
    };

    setPayments((prev) => [...prev, newPaymentBlock]);
    setIsPaymentSheetOpen(false);
    setEditingPaymentIndex(null);
  };

  // Change method of a specific payment block
  const handleChangeBlockMethod = (index: number, newMethod: string) => {
    setPayments((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], method: newMethod };
      }
      return copy;
    });
    setIsPaymentSheetOpen(false);
    setEditingPaymentIndex(null);
  };

  // Remove a payment block row
  const handleRemovePaymentBlock = (id: string) => {
    if (payments.length <= 1) return;
    setPayments((prev) => prev.filter((p) => p.id !== id));
    setDeleteMenuRowId(null);
  };

  // Finalize Sale using Unified Financial Engine (createOperationWithInitialPayment)
  const handleFinalizeSale = async () => {
    if (!canFinalizeSale) return;

    setSaleError(null);
    setIsSubmitting(true);

    const currentIdempotencyKey = saleIdempotencyKey || `pos_sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    if (!saleIdempotencyKey) {
      setSaleIdempotencyKey(currentIdempotencyKey);
    }

    try {
      let effectivePayments = payments.map(p => ({ ...p, amount: Number(p.amount) || 0 }));
      if (sobrante > 0) {
        let remainingSobrante = sobrante;
        for (let i = effectivePayments.length - 1; i >= 0 && remainingSobrante > 0; i--) {
          const curAmt = effectivePayments[i].amount as number;
          const isPend = effectivePayments[i].method.toLowerCase().includes('pendiente') || effectivePayments[i].method.toLowerCase().includes('fiado');
          if (curAmt > 0 && !isPend) {
            const deduct = Math.min(curAmt, remainingSobrante);
            effectivePayments[i].amount = curAmt - deduct;
            remainingSobrante -= deduct;
          }
        }
      }

      const normalizedPayments = effectivePayments.map((p) => ({
        method: (p.method.toLowerCase().includes('fiado') || p.method.toLowerCase().includes('pendiente'))
          ? 'fiado' 
          : p.method.toLowerCase().includes('transferencia')
          ? 'transferencia'
          : (p.method.toLowerCase().includes('tarjeta') || p.method.toLowerCase().includes('crédito'))
          ? 'tarjeta'
          : 'efectivo',
        amount: Number(p.amount) || 0
      }));

      const cashPayments = normalizedPayments.filter(p => p.method !== 'fiado' && p.amount > 0);
      const fiadoPayment = normalizedPayments.find(p => p.method === 'fiado' && p.amount > 0);
      const fiadoAmount = fiadoPayment ? Number(fiadoPayment.amount || 0) : 0;

      const itemsPayload = cartItems.map((it) => ({
        id: it.product.id,
        productId: it.product.id,
        name: it.product.name,
        quantity: it.quantity,
        unitPrice: Number(it.product.salePrice || 0),
        subtotal: Number(it.product.salePrice || 0) * it.quantity
      }));

      const hasClient = Boolean(selectedClient && selectedClient.id);
      const resolvedClientName = (hasClient && selectedClient?.name && !isGenericClientPlaceholder(selectedClient.name))
        ? selectedClient.name.trim()
        : (hasClient ? (selectedClient?.name || 'NN') : 'NN');
      const resolvedClientId = hasClient ? String(selectedClient!.id) : null;
      const resolvedClientPhone = selectedClient?.phone ? String(selectedClient.phone).trim() : '';

      const result = await createOperationWithInitialPayment({
        complexId: targetId,
        operationType: 'pos_sale',
        contractualAmount: cartTotal,
        operatorId: auth.currentUser?.uid || 'pos_operator',
        responsibleType: hasClient ? 'user' : 'anonymous',
        userId: resolvedClientId,
        clientId: resolvedClientId,
        userName: resolvedClientName,
        clientName: resolvedClientName,
        userPhone: resolvedClientPhone,
        clientPhone: resolvedClientPhone,
        items: itemsPayload,
        idempotencyKey: currentIdempotencyKey,
        initialPayments: cashPayments.map((p, idx) => ({
          amount: p.amount,
          paymentMethod: p.method as any,
          idempotencyKey: `${currentIdempotencyKey}_pay_${idx}`,
          notes: `Cobro mostrador (${p.method})`
        })),
        assignToCurrentAccount: fiadoAmount > 0,
        customDebtAmount: fiadoAmount > 0 ? fiadoAmount : undefined,
        notes: ''
      });

      playCashRegisterSound();

      clearCart();
      setPayments([]);
      setSelectedClient(null);
      setSaleIdempotencyKey(null);
      setSaleError(null);
      setStep(1);
      setIsPaymentSheetOpen(false);

      triggerConfirmation({
        type: 'mostrador',
        title: '¡Venta registrada!',
        total: cartTotal,
        ticketCode: result.ticketCode || result.operationId,
        clientOrEntity: resolvedClientName !== 'NN' ? resolvedClientName : undefined
      });
    } catch (err: any) {
      console.warn('Error finalizando venta:', err);
      const friendlyMsg = err?.message || 'Error al procesar la venta. Verificá la conexión y reintentá.';
      setSaleError(friendlyMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Gastos: Métodos de pago y calculadora dividida coherente con Ventas
  const mapToFinancialPaymentMethod = (method: string): FinancialPaymentMethod => {
    const m = method.toLowerCase();
    if (m.includes('efectivo') || m === 'cash') return 'cash';
    if (m.includes('transf') || m === 'transfer') return 'transfer';
    if (m.includes('tarjeta') || m.includes('credit') || m.includes('crédito') || m.includes('debito')) return 'credit';
    return 'cash';
  };

  const totalExpenseNum = Math.max(0, Number(expenseAmount) || 0);

  // Sincronizar primera fila con el método predeterminado (orderedMethods[0])
  useEffect(() => {
    if (activeSection === 'gastos') {
      const defaultMethod = orderedMethods[0] || 'Efectivo';
      if (expensePayments.length <= 1) {
        setExpensePayments([
          {
            id: expensePayments[0]?.id || `exp_pay_${Date.now()}`,
            method: expensePayments[0]?.method || defaultMethod,
            amount: totalExpenseNum > 0 ? totalExpenseNum : ''
          }
        ]);
      }
    }
  }, [totalExpenseNum, activeSection, orderedMethods]);

  const totalAssignedExpensePayments = useMemo(() => {
    return expensePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [expensePayments]);

  const expenseDiff = totalAssignedExpensePayments - totalExpenseNum;
  const isExpenseSobra = totalExpenseNum > 0 && expenseDiff > 0.01;
  const isExpenseFalta = totalExpenseNum > 0 && expenseDiff < -0.01;
  const expenseSobrante = Math.max(0, expenseDiff);
  const expenseFaltante = Math.max(0, -expenseDiff);
  const isExpenseMathExact = totalExpenseNum > 0 && Math.abs(expenseDiff) < 0.01;

  const hasExpensePendiente = expensePayments.some((p) => {
    const m = p.method.toLowerCase();
    return m.includes('pendiente') && (Number(p.amount) || 0) > 0;
  });
  const isExpenseEntityBlocked = hasExpensePendiente && !selectedExpenseEntity;
  const canFinalizeExpense = (isExpenseMathExact || isExpenseSobra) && !isExpenseEntityBlocked && !isSubmittingExpense && totalExpenseNum > 0;

  const handleAddNewExpensePaymentMethod = (methodToUse?: string) => {
    const available = EXPENSE_PAYMENT_METHODS;
    let selMethod = methodToUse;
    if (!selMethod) {
      selMethod = available.find(m => !expensePayments.some(p => p.method === m)) || 'Transferencia';
    }
    const newAmt = expenseFaltante > 0 ? expenseFaltante : 0;
    setExpensePayments(prev => [
      ...prev,
      { id: `exp_pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, method: selMethod!, amount: newAmt }
    ]);
    setIsPaymentSheetOpen(false);
    setEditingPaymentIndex(null);
  };

  const handleChangeExpenseBlockMethod = (index: number, newMethod: string) => {
    setExpensePayments(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], method: newMethod };
      }
      return copy;
    });
    setIsPaymentSheetOpen(false);
    setEditingPaymentIndex(null);
  };

  const handleRemoveExpensePaymentBlock = (id: string) => {
    if (expensePayments.length <= 1) return;
    setExpensePayments(prev => prev.filter(p => p.id !== id));
    setDeleteMenuRowId(null);
  };

  const handleAutocorrectExpenseSobrante = () => {
    if (expensePayments.length === 1) {
      setExpensePayments([{ ...expensePayments[0], amount: totalExpenseNum }]);
    } else {
      setExpensePayments(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        const curAmt = Number(last.amount) || 0;
        copy[copy.length - 1] = { ...last, amount: Math.max(0, curAmt - expenseSobrante) };
        return copy;
      });
    }
  };

  // Conceptos de gastos filtrados por Rubro y por texto de búsqueda
  const displayedExpenseConcepts = useMemo(() => {
    let list = expenseItems.filter((i) => i.status !== 'inactivo');
    if (expenseCategoryFilter !== 'all') {
      list = list.filter((i) => i.categoryId === expenseCategoryFilter || i.categoryName === expenseCategoryFilter);
    }
    if (expenseSearchQuery.trim()) {
      const q = expenseSearchQuery.toLowerCase().trim();
      list = list.filter((i) => 
        i.name.toLowerCase().includes(q) || 
        (i.categoryName && i.categoryName.toLowerCase().includes(q)) ||
        (i.categoryId && i.categoryId.toLowerCase().includes(q))
      );
    }
    return list;
  }, [expenseItems, expenseCategoryFilter, expenseSearchQuery]);

  const activeExpenseEntities = useMemo(() => {
    return expenseEntities.filter(e => e.status !== 'inactivo');
  }, [expenseEntities]);

  const filteredExpenseEntities = useMemo(() => {
    const q = entitySearchText.toLowerCase().trim();
    if (!q) return activeExpenseEntities;
    return activeExpenseEntities.filter(e => 
      e.name.toLowerCase().includes(q) ||
      (e.cuit && e.cuit.includes(q)) ||
      (e.phone && String(e.phone).includes(q))
    );
  }, [activeExpenseEntities, entitySearchText]);

  // Seleccionar concepto de gasto en Paso 1 (con auto-focus numérico)
  const handleSelectExpenseConcept = (concept: Product) => {
    setSelectedExpenseConcept(concept);
    const refPrice = Number(concept.purchasePrice || concept.price || 0);
    if (refPrice > 0) {
      setExpenseAmount(String(refPrice));
    } else {
      setExpenseAmount('');
    }
    setExpenseDescription(concept.name);
    setExpenseErrorMsg(null);
    setTimeout(() => {
      expenseAmountInputRef.current?.focus();
    }, 80);
  };

  // Paso 1 -> Paso 2: Validar concepto e importe y avanzar al pago
  const handleProceedExpenseToPayment = () => {
    setExpenseErrorMsg(null);
    if (!totalExpenseNum || totalExpenseNum <= 0) {
      setExpenseErrorMsg('Ingresá un importe válido mayor a $0.');
      return;
    }

    if (!selectedExpenseConcept) {
      setExpenseErrorMsg('Seleccioná un concepto de gasto.');
      return;
    }

    const defaultMethod = orderedMethods[0] || 'Efectivo';
    if (expensePayments.length <= 1 && (!expensePayments[0]?.amount || Number(expensePayments[0]?.amount) === 0)) {
      setExpensePayments([
        { id: `exp_p_${Date.now()}`, method: defaultMethod, amount: totalExpenseNum }
      ]);
    } else if (expensePayments.length === 1) {
      setExpensePayments([
        { ...expensePayments[0], amount: totalExpenseNum }
      ]);
    }

    setExpenseStep(2);
  };

  // Submit expense in Gastos tab
  const handleSaveExpense = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!totalExpenseNum || totalExpenseNum <= 0) {
      setExpenseErrorMsg('Ingresá un importe válido mayor a $0.');
      return;
    }

    if (!selectedExpenseConcept) {
      setExpenseErrorMsg('Seleccioná un concepto de gasto.');
      return;
    }

    if (!canFinalizeExpense) {
      if (isExpenseEntityBlocked) {
        setExpenseErrorMsg('Debes asociar una entidad para saldos pendientes.');
      } else if (isExpenseFalta) {
        setExpenseErrorMsg(`Faltan $${expenseFaltante.toLocaleString()} para completar el total.`);
      }
      return;
    }

    setIsSubmittingExpense(true);
    setExpenseErrorMsg(null);
    try {
      const conceptName = selectedExpenseConcept.name;
      const rubroName = selectedExpenseConcept.categoryName || selectedExpenseConcept.categoryId || 'Gastos Generales';

      let effectiveExpensePayments = expensePayments.map(p => ({ ...p, amount: Number(p.amount) || 0 }));
      if (expenseSobrante > 0) {
        let remainingSobrante = expenseSobrante;
        for (let i = effectiveExpensePayments.length - 1; i >= 0 && remainingSobrante > 0; i--) {
          const curAmt = effectiveExpensePayments[i].amount as number;
          const isPend = effectiveExpensePayments[i].method.toLowerCase().includes('pendiente');
          if (curAmt > 0 && !isPend) {
            const deduct = Math.min(curAmt, remainingSobrante);
            effectiveExpensePayments[i].amount = curAmt - deduct;
            remainingSobrante -= deduct;
          }
        }
      }

      const paidPayments = effectiveExpensePayments
        .filter(p => !p.method.toLowerCase().includes('pendiente') && (Number(p.amount) || 0) > 0)
        .map((p) => ({
          amount: Number(p.amount),
          paymentMethod: mapToFinancialPaymentMethod(p.method),
          notes: expenseDescription.trim() ? `${expenseDescription.trim()} (${p.method})` : `Pago egreso (${p.method})`
        }));

      const result = await executeExpenseOperation({
        complexId: targetId,
        category: rubroName,
        categoryId: selectedExpenseConcept.categoryId,
        concept: conceptName,
        conceptId: selectedExpenseConcept.id,
        supplierName: selectedExpenseEntity ? selectedExpenseEntity.name : conceptName,
        amount: totalExpenseNum,
        payments: paidPayments,
        operatorId: auth.currentUser?.uid || 'administrador',
        notes: expenseDescription.trim() || `Gasto registrado: ${conceptName}`,
        entityId: selectedExpenseEntity?.id,
        entityName: selectedExpenseEntity?.name,
        entityType: selectedExpenseEntity?.type
      });

      playCashRegisterSound();
      setExpenseAmount('');
      setExpenseDescription('');
      setSelectedExpenseConcept(null);
      setSelectedExpenseEntity(null);
      setExpenseStep(1);
      const defaultMethod = orderedMethods[0] || 'Efectivo';
      setExpensePayments([{ id: `exp_p_${Date.now()}`, method: defaultMethod, amount: '' }]);
      setIsPaymentSheetOpen(false);

      triggerConfirmation({
        type: 'gastos',
        title: '¡Gasto registrado!',
        total: totalExpenseNum,
        ticketCode: result.ticketCode || result.operationId || 'E-0000',
        clientOrEntity: selectedExpenseEntity?.name || undefined
      });
    } catch (err: any) {
      console.error('Error registrando gasto:', err);
      setExpenseErrorMsg(err?.message || 'Error al registrar el gasto en el sistema.');
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  // Helper para renderizar los iconos limpios requeridos (sin círculos ni badges de fondo)
  const renderMethodIcon = (method: string) => {
    const m = method.toLowerCase();
    if (m.includes('transf') || m.includes('transfer')) {
      return <Landmark size={22} strokeWidth={1.8} className="text-gray-600 dark:text-slate-300 shrink-0" />;
    }
    if (m.includes('tarjeta') || m.includes('crédito') || m.includes('credito') || m.includes('credit')) {
      return <CreditCard size={22} strokeWidth={1.8} className="text-gray-600 dark:text-slate-300 shrink-0" />;
    }
    if (m.includes('pendiente') || m.includes('fiado')) {
      return <History size={22} strokeWidth={1.8} className="text-gray-600 dark:text-slate-300 shrink-0" />;
    }
    return <CircleDollarSign size={22} strokeWidth={1.8} className="text-gray-600 dark:text-slate-300 shrink-0" />;
  };

  if (!isOpen) return null;

  const isStep1 = (activeSection === 'mostrador' && step === 1) || (activeSection === 'gastos' && expenseStep === 1);

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 select-none"
      onClick={() => {
        // Tocar afuera del modal principal cierra POSModal sólo si el sub-sheet no está abierto y no está la confirmación
        if (!isPaymentSheetOpen && !confirmationData) {
          onClose();
        }
      }}
    >
      {!confirmationData && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => {
          e.stopPropagation();
          setDeleteMenuRowId(null);
        }}
        className="bg-[#f8fafc] dark:bg-slate-900 w-full max-w-2xl max-h-[96vh] sm:max-h-[90vh] rounded-t-[32px] sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-slate-800 flex flex-col overflow-hidden mx-auto relative"
      >
        {/* Barra superior de arrastre tipo cápsula */}
        <div className="w-12 h-1.5 bg-gray-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0" />

        {/* =================================================================== */}
        {/* CABECERA SUPERIOR: PASO 1 (PESTAÑAS 50/50) vs PASO 2 (VOLVER + TITULO) */}
        {/* =================================================================== */}
        {isStep1 ? (
          <div className="shrink-0 px-4 pt-1 pb-0 bg-transparent z-20 border-b border-gray-200/80 dark:border-slate-800">
            <div className="grid grid-cols-2 text-center">
              <button
                type="button"
                onClick={() => { setActiveSection('mostrador'); setStep(1); }}
                className={`py-3 text-sm sm:text-base transition-colors cursor-pointer border-b-[3px] ${
                  activeSection === 'mostrador'
                    ? 'font-black text-gray-900 dark:text-white border-gray-600 dark:border-white'
                    : 'font-bold text-gray-400 dark:text-slate-500 border-transparent hover:text-gray-600'
                }`}
              >
                Mostrador
              </button>
              <button
                type="button"
                onClick={() => { setActiveSection('gastos'); setExpenseStep(1); }}
                className={`py-3 text-sm sm:text-base transition-colors cursor-pointer border-b-[3px] ${
                  activeSection === 'gastos'
                    ? 'font-black text-gray-900 dark:text-white border-gray-600 dark:border-white'
                    : 'font-bold text-gray-400 dark:text-slate-500 border-transparent hover:text-gray-600'
                }`}
              >
                Gastos
              </button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 z-20">
            <button
              type="button"
              onClick={() => activeSection === 'gastos' ? setExpenseStep(1) : setStep(1)}
              className="p-1 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-800 dark:text-white transition-colors cursor-pointer"
              title="Volver al Paso 1"
            >
              <ChevronLeft size={24} />
            </button>
            <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white flex-1 text-center pr-6">
              {activeSection === 'gastos' ? 'Pago de gastos' : 'Cobro de mostrador'}
            </h3>
          </div>
        )}

        {/* =================================================================== */}
        {/* SECCIÓN GASTOS (PASO 1 Y PASO 2)                                    */}
        {/* =================================================================== */}
        {activeSection === 'gastos' ? (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {expenseStep === 1 ? (
              <>
                {/* Buscador tipo cápsula y Filtros de texto plano */}
                <div className="p-4 pb-2 space-y-3 shrink-0 bg-transparent">
                  <div className="relative">
                    <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar rubros o conceptos"
                      value={expenseSearchQuery}
                      onChange={(e) => setExpenseSearchQuery(e.target.value)}
                      className="w-full h-11 pl-10 pr-8 rounded-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-2xs text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#7c12e8]"
                    />
                    {expenseSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setExpenseSearchQuery('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {/* Filtro horizontal de texto plano */}
                  <div className="flex gap-4 overflow-x-auto no-scrollbar py-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setExpenseCategoryFilter('all')}
                      className={`transition-colors whitespace-nowrap cursor-pointer ${
                        expenseCategoryFilter === 'all'
                          ? 'text-gray-900 dark:text-white font-extrabold text-xs'
                          : 'text-gray-400 dark:text-slate-500 font-bold text-xs hover:text-gray-600'
                      }`}
                    >
                      Todos
                    </button>
                    {expenseCategories
                      .filter((c) => c.status !== 'inactivo')
                      .map((rubro) => {
                        const isSelected = expenseCategoryFilter === rubro.name;
                        return (
                          <button
                            type="button"
                            key={`exp-rubro-txt-${rubro.id}`}
                            onClick={() => setExpenseCategoryFilter(isSelected ? 'all' : rubro.name)}
                            className={`transition-colors whitespace-nowrap cursor-pointer ${
                              isSelected
                                ? 'text-gray-900 dark:text-white font-extrabold text-xs'
                                : 'text-gray-400 dark:text-slate-500 font-bold text-xs hover:text-gray-600'
                            }`}
                          >
                            {rubro.name}
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Grilla de Tarjetas en 2 columnas */}
                <div className="flex-1 overflow-y-auto p-4 pt-1 pb-44">
                  {displayedExpenseConcepts.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 space-y-2">
                      <p className="text-xs font-bold text-gray-600 dark:text-slate-300">
                        No se encontraron conceptos de gasto
                      </p>
                      <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                        Configurá tus conceptos en Perfil → Editar gastos.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {displayedExpenseConcepts.map((concept) => {
                        const isSelected = selectedExpenseConcept?.id === concept.id;
                        const refPrice = Number(concept.purchasePrice || concept.price || 0);

                        return (
                          <div
                            key={`exp-card-${concept.id}`}
                            onClick={() => handleSelectExpenseConcept(concept)}
                            className={`bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-2xs border transition-all relative flex flex-col justify-between min-h-[105px] cursor-pointer ${
                              isSelected
                                ? 'border-[#7c12e8] ring-2 ring-[#7c12e8]/20'
                                : 'border-gray-100 dark:border-slate-700/60 hover:border-gray-300'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-medium text-gray-400 dark:text-slate-500 truncate">
                                  {concept.categoryName || concept.categoryId || 'Gasto'}
                                </span>
                                {isSelected && (
                                  <div className="w-6 h-6 rounded-full bg-[#7c12e8]/15 text-[#7c12e8] flex items-center justify-center shrink-0">
                                    <Check size={14} strokeWidth={3} />
                                  </div>
                                )}
                              </div>
                              <p className="font-bold text-sm text-gray-900 dark:text-white line-clamp-2 mt-1 mb-2">
                                {concept.name}
                              </p>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              {refPrice > 0 ? (
                                <span className="text-sm font-black text-gray-800 dark:text-slate-200 font-mono">
                                  $ {refPrice.toLocaleString()}
                                </span>
                              ) : (
                                <span />
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectExpenseConcept(concept);
                                }}
                                className="w-8 h-8 rounded-full bg-[#7c12e8] text-white flex items-center justify-center shadow-xs active:scale-95 transition-transform cursor-pointer shrink-0"
                              >
                                <Plus size={16} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Arquitectura de 2 capas: Tarjeta deslizante trasera (z-10) desde el borde inferior y Botón delantero 100% estático (z-20) */}
                <div className="relative shrink-0 mt-auto">
                  <AnimatePresence>
                    {selectedExpenseConcept && (
                      <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="absolute bottom-0 left-0 right-0 z-10 bg-white dark:bg-slate-800 rounded-t-[32px] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] border-t border-x border-gray-100 dark:border-slate-700 pt-4 px-5 pb-20 pointer-events-auto"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 pr-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                {selectedExpenseConcept.categoryName || selectedExpenseConcept.categoryId || 'Gasto'}
                              </span>
                              <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                                {selectedExpenseConcept.name}
                              </h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedExpenseConcept(null);
                                setExpenseAmount('');
                              }}
                              className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg cursor-pointer"
                              title="Deseleccionar concepto"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-100 dark:border-slate-700/60">
                            <span className="text-xs font-bold text-gray-600 dark:text-slate-300">
                              Importe
                            </span>
                            <div className="relative w-36 sm:w-44">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black text-sm">$</span>
                              <input
                                ref={expenseAmountInputRef}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                placeholder="0"
                                value={expenseAmount}
                                onChange={(e) => setExpenseAmount(e.target.value)}
                                className="w-full h-10 pl-7 pr-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 font-mono text-base font-black text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#7c12e8] text-right"
                              />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Botón principal 100% estático */}
                  <div className="relative z-20 px-4 pb-4 pt-2 bg-transparent">
                    {totalExpenseNum > 0 && selectedExpenseConcept ? (
                      <button
                        type="button"
                        onClick={handleProceedExpenseToPayment}
                        className="w-full h-13 rounded-2xl bg-[#7c12e8] hover:bg-[#680fc5] text-white font-black text-sm flex items-center justify-between px-5 shadow-lg shadow-[#7c12e8]/25 active:scale-[0.99] transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <ShoppingCart size={18} />
                          <span>1 concepto</span>
                        </div>
                        <span className="font-mono text-base">${totalExpenseNum.toLocaleString()}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full h-13 rounded-2xl bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-500 font-black text-sm flex items-center justify-between px-5 cursor-not-allowed shadow-none"
                      >
                        <div className="flex items-center gap-2">
                          <ShoppingCart size={18} />
                          <span>Selecciona conceptos</span>
                        </div>
                        <span className="font-mono text-base">$ 0</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* PASO 2: CHECKOUT DE GASTOS */
              <div 
                className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
                onClick={() => {
                  setIsEntitySearchOpen(false);
                }}
              >
                {/* Resumen centrado */}
                <div className="text-center pt-2 pb-1 space-y-1">
                  <span className="text-xs text-gray-400 font-medium lowercase block">
                    total a pagar
                  </span>
                  <span className="text-4xl font-black text-gray-900 dark:text-white font-mono tracking-tight block">
                    ${totalExpenseNum.toLocaleString()}
                  </span>
                  <div className="max-w-[240px] sm:max-w-[260px] mx-auto pt-1.5 flex items-start justify-between gap-4 text-left">
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 truncate">
                      {selectedExpenseConcept?.name}
                    </span>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 shrink-0">
                      ${totalExpenseNum.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Fila Entidad (3 Dimensiones) - Título cliqueable sin caja ni alta rápida de FAB */}
                <div ref={entityBoxRef} className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  {!selectedExpenseEntity ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setIsEntitySearchOpen(!isEntitySearchOpen)}
                        className={`text-left font-bold text-sm cursor-pointer block ${
                          isExpenseEntityBlocked
                            ? 'text-red-600'
                            : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        {isExpenseEntityBlocked ? '+ Añadir entidad (Obligatorio) *' : '+ Añadir entidad (opcional)'}
                      </button>

                      {isEntitySearchOpen && (
                        <div className="mt-2 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg space-y-2">
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Buscar por nombre, CUIT o teléfono..."
                              value={entitySearchText}
                              onChange={(e) => setEntitySearchText(e.target.value)}
                              className="w-full h-8 pl-8 pr-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-[#7c12e8]"
                              autoFocus
                            />
                          </div>

                          <div className="max-h-28 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700 text-xs">
                            {filteredExpenseEntities.length === 0 ? (
                              <p className="p-2 text-gray-400 text-center">No hay entidades disponibles</p>
                            ) : (
                              filteredExpenseEntities.map((ent) => (
                                <div
                                  key={`ent-opt-${ent.id}`}
                                  onClick={() => {
                                    setSelectedExpenseEntity(ent);
                                    setIsEntitySearchOpen(false);
                                    setEntitySearchText('');
                                  }}
                                  className="p-2 hover:bg-purple-50 dark:hover:bg-slate-700/60 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
                                >
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-gray-900 dark:text-white">
                                        {ent.name}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                                        {ent.type}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-[#0BA70B]">
                                      {ent.phone || ent.cuit || '-'}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                            {selectedExpenseEntity.name}
                          </p>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                            {selectedExpenseEntity.type}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-[#0BA70B]">
                          {selectedExpenseEntity.phone || '-'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedExpenseEntity(null)}
                        className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg cursor-pointer transition-colors"
                        title="Quitar entidad"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Filas de Métodos de Pago: transparentes, alineadas en la misma línea horizontal, monto sin borde */}
                <div className="space-y-2 pt-1">
                  <div className="text-sm font-bold text-gray-600 dark:text-slate-300 text-left">
                    Método de pago
                  </div>

                  <div className="space-y-1.5">
                    {expensePayments.map((p, idx) => {
                      const isDeleteOpen = deleteMenuRowId === p.id;

                      return (
                        <div
                          key={`exp-pay-block-${p.id}`}
                          className="bg-transparent border-none shadow-none py-1.5 relative"
                        >
                          {/* Fila principal en una sola línea horizontal */}
                          <div className="flex items-center justify-between w-full">
                            {/* Zona 1: Icono + Nombre del método */}
                            <div 
                              onClick={() => {
                                setEditingPaymentIndex(idx);
                                setIsPaymentSheetOpen(true);
                              }}
                              className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer py-1"
                            >
                              {renderMethodIcon(p.method)}
                              <span className="font-black text-sm text-gray-900 dark:text-white truncate">
                                {p.method}
                              </span>
                            </div>

                            {/* Zona 2: Badge de Monto SIN BORDE */}
                            <div className="flex items-center gap-2 shrink-0">
                              <input
                                type="number"
                                min={0}
                                placeholder="0"
                                value={p.amount}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setExpensePayments((prev) => {
                                    const copy = [...prev];
                                    copy[idx] = { ...copy[idx], amount: val === '' ? '' : Number(val) };
                                    return copy;
                                  });
                                }}
                                className={`border-0 border-none ring-0 focus:ring-0 outline-none rounded-lg px-3 py-1.5 w-24 text-center font-bold text-xs sm:text-sm text-gray-900 dark:text-white transition-colors ${
                                  isExpenseFalta 
                                    ? 'bg-[#fce8e8] dark:bg-red-950/50' 
                                    : 'bg-[#f1e8fc] dark:bg-purple-950/50'
                                }`}
                              />

                              {/* Zona 3: Flecha > con Popover de Borrado en letra gris */}
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteMenuRowId(isDeleteOpen ? null : p.id);
                                  }}
                                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer transition-colors"
                                >
                                  <ChevronRight size={18} />
                                </button>

                                {isDeleteOpen && (
                                  <div className="absolute right-0 top-full mt-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveExpensePaymentBlock(p.id);
                                      }}
                                      className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-300 hover:text-gray-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                    >
                                      <Trash2 size={13} />
                                      <span>Borrar método de pago</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Renglón inferior alineado bajo el badge para no desalinear la fila */}
                          {expenseFaltante > 0 && (
                            <div className="text-right pr-7 mt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpensePayments((prev) => {
                                    const copy = [...prev];
                                    const cur = Number(copy[idx].amount) || 0;
                                    copy[idx] = { ...copy[idx], amount: cur + expenseFaltante };
                                    return copy;
                                  });
                                }}
                                className="text-[11px] font-bold text-rose-600 underline cursor-pointer"
                              >
                                Faltan ${expenseFaltante.toLocaleString()}
                              </button>
                            </div>
                          )}

                          {expenseSobrante > 0 && (
                            <div className="text-right pr-7 mt-0.5">
                              <button
                                type="button"
                                onClick={handleAutocorrectExpenseSobrante}
                                className="text-[11px] font-bold text-[#7c12e8] underline cursor-pointer"
                              >
                                Sobran ${expenseSobrante.toLocaleString()}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Botón "+ agregar método de pago" con fondo transparente */}
                  {expenseFaltante > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPaymentIndex(null);
                        setIsPaymentSheetOpen(true);
                      }}
                      className="w-full py-2.5 rounded-xl bg-transparent border border-gray-200 dark:border-slate-700 text-center font-bold text-xs sm:text-sm text-gray-700 dark:text-slate-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                    >
                      + agregar método de pago
                    </button>
                  )}
                </div>

                {expenseErrorMsg && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{expenseErrorMsg}</span>
                  </div>
                )}

                {/* Botón Principal Inferior en Paso 2 de Gastos */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleSaveExpense()}
                    disabled={!canFinalizeExpense}
                    className={`w-full py-4 px-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg transition-all ${
                      canFinalizeExpense
                        ? 'bg-[#7c12e8] hover:bg-[#680fc5] text-white shadow-[#7c12e8]/25 active:scale-98 cursor-pointer'
                        : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                    }`}
                  >
                    {isSubmittingExpense ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Registrando gasto...</span>
                      </>
                    ) : (
                      <span>
                        {isExpenseFalta
                          ? `Faltan $${expenseFaltante.toLocaleString()}`
                          : isExpenseEntityBlocked
                          ? 'Asigná una entidad para saldo pendiente'
                          : 'Finalizar gasto'}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : step === 1 ? (
          /* =================================================================== */
          /* SECCIÓN MOSTRADOR - PASO 1 (ARMADO DEL CARRITO)                     */
          /* =================================================================== */
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Buscador de Productos tipo cápsula */}
            <div className="p-4 pb-2 space-y-3 shrink-0 bg-transparent">
              <div className="relative">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar productos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-11 pl-10 pr-8 rounded-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-2xs text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#1d63b8]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Filtros de Categorías de texto plano */}
              <div className="flex gap-4 overflow-x-auto no-scrollbar py-1 text-xs">
                <button
                  type="button"
                  onClick={() => handleToggleCategory('all')}
                  className={`transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategories.length === 0
                      ? 'text-gray-900 dark:text-white font-extrabold text-xs'
                      : 'text-gray-400 dark:text-slate-500 font-bold text-xs hover:text-gray-600'
                  }`}
                >
                  Todos
                </button>
                {categories.map((cat) => {
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <button
                      type="button"
                      key={`cat-txt-${cat}`}
                      onClick={() => handleToggleCategory(cat)}
                      className={`transition-colors whitespace-nowrap cursor-pointer ${
                        isSelected
                          ? 'text-gray-900 dark:text-white font-extrabold text-xs'
                          : 'text-gray-400 dark:text-slate-500 font-bold text-xs hover:text-gray-600'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grilla de Productos en 2 columnas */}
            <div className="flex-1 overflow-y-auto p-4 pt-1 pb-44">
              {displayedProducts.length === 0 ? (
                <div className="py-12 text-center text-gray-400 space-y-2">
                  <Package size={36} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-bold text-gray-600 dark:text-slate-300">
                    No se encontraron productos activos
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Cargá productos en el catálogo dentro de Perfil.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {displayedProducts.map((product) => {
                    const cartMatch = cartItems.find((it) => it.product.id === product.id);
                    const isOutOfStock = product.stock <= 0;

                    return (
                      <div
                        key={`pos-product-${product.id}`}
                        onClick={() => {
                          if (!isOutOfStock) handleProductAdd(product);
                        }}
                        className={`bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-2xs border transition-all relative flex flex-col justify-between min-h-[105px] cursor-pointer ${
                          isOutOfStock
                            ? 'opacity-50 border-gray-200 bg-gray-50 dark:bg-slate-800/40 cursor-not-allowed'
                            : 'border-gray-100 dark:border-slate-700/60 hover:border-gray-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-medium text-gray-400 dark:text-slate-500 truncate">
                              {product.categoryId}
                            </span>
                            {cartMatch && (
                              <div className="w-6 h-6 rounded-full bg-[#1d63b8]/15 text-[#1d63b8] text-xs font-black flex items-center justify-center shrink-0">
                                {cartMatch.quantity}
                              </div>
                            )}
                          </div>
                          <p className="font-bold text-sm text-gray-900 dark:text-white line-clamp-2 mt-1 mb-2">
                            {product.name}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-sm font-black text-gray-800 dark:text-slate-200 font-mono">
                            $ {Number(product.salePrice || 0).toLocaleString()}
                          </span>
                          <button
                            type="button"
                            disabled={isOutOfStock}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isOutOfStock) handleProductAdd(product);
                            }}
                            className="w-8 h-8 rounded-full bg-[#1d63b8] text-white flex items-center justify-center shadow-xs active:scale-95 transition-transform cursor-pointer shrink-0 disabled:opacity-40"
                          >
                            <Plus size={16} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Arquitectura de 2 capas: Tarjeta deslizante trasera (z-10) desde el borde inferior y Botón delantero 100% estático (z-20) */}
            <div className="relative shrink-0 mt-auto">
              <AnimatePresence>
                {cartItems.length > 0 && (
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className="absolute bottom-0 left-0 right-0 z-10 bg-white dark:bg-slate-800 rounded-t-[32px] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] border-t border-x border-gray-100 dark:border-slate-700 pt-4 px-5 pb-20 pointer-events-auto"
                  >
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Productos elegidos
                      </span>
                      <div className="space-y-2">
                        {cartItems.map((item) => {
                          const itemSubtotal = Number(item.product.salePrice || 0) * item.quantity;
                          return (
                            <div
                              key={`cart-row-${item.product.id}`}
                              className="flex items-center justify-between gap-2 p-1.5 bg-gray-50 dark:bg-slate-900 rounded-xl"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                  {item.product.name}
                                </p>
                                <p className="text-[10px] text-gray-400 font-mono">
                                  ${Number(item.product.salePrice || 0).toLocaleString()} c/u
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-0.5">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.product.id, -1)}
                                  className="w-5 h-5 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 rounded cursor-pointer"
                                >
                                  <Minus size={11} />
                                </button>
                                <span className="w-5 text-center text-xs font-bold font-mono">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.product.id, 1)}
                                  className="w-5 h-5 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 rounded cursor-pointer"
                                >
                                  <Plus size={11} />
                                </button>
                              </div>

                              <span className="text-xs font-black font-mono text-gray-900 dark:text-white min-w-[50px] text-right">
                                ${itemSubtotal.toLocaleString()}
                              </span>

                              <button
                                type="button"
                                onClick={() => removeItem(item.product.id)}
                                className="p-1 text-gray-400 hover:text-rose-500 rounded cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Botón principal 100% estático */}
              <div className="relative z-20 px-4 pb-4 pt-2 bg-transparent">
                {cartItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="w-full h-13 rounded-2xl bg-[#1d63b8] hover:bg-[#18539c] text-white font-black text-sm flex items-center justify-between px-5 shadow-lg shadow-[#1d63b8]/25 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={18} />
                      <span>{totalUnits} {totalUnits === 1 ? 'producto' : 'productos'}</span>
                    </div>
                    <span className="font-mono text-base">${cartTotal.toLocaleString()}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full h-13 rounded-2xl bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-500 font-black text-sm flex items-center justify-between px-5 cursor-not-allowed shadow-none"
                  >
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={18} />
                      <span>Selecciona productos</span>
                    </div>
                    <span className="font-mono text-base">$ 0</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* =================================================================== */
          /* SECCIÓN MOSTRADOR - PASO 2 (CHECKOUT Y CALCULADORA)                 */
          /* =================================================================== */
          <div 
            className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
            onClick={() => {
              setIsClientSearchOpen(false);
            }}
          >
            {/* Resumen centrado */}
            <div className="text-center pt-2 pb-1 space-y-1">
              <span className="text-xs text-gray-400 font-medium lowercase block">
                total a cobrar
              </span>
              <span className="text-4xl font-black text-gray-900 dark:text-white font-mono tracking-tight block">
                ${cartTotal.toLocaleString()}
              </span>
              <div className="max-w-[240px] sm:max-w-[260px] mx-auto pt-1.5 space-y-1.5 max-h-24 overflow-y-auto no-scrollbar">
                {cartItems.map((it) => (
                  <div key={it.product.id} className="flex items-start justify-between gap-2 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-slate-400 truncate leading-tight">
                        {it.product.name}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-tight mt-0.5">
                        {it.quantity}u x ${Number(it.product.salePrice || 0).toLocaleString()} c/u
                      </p>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 shrink-0 leading-tight">
                      ${(it.quantity * Number(it.product.salePrice || 0)).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fila Cliente: Título cliqueable sin caja */}
            <div ref={clientBoxRef} className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
              {!selectedClient ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setIsClientSearchOpen(!isClientSearchOpen)}
                    className={`text-left font-bold text-sm cursor-pointer block ${
                      isFiadoBlocked
                        ? 'text-red-600'
                        : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {isFiadoBlocked 
                      ? '+ Añadir cliente (Obligatorio) *' 
                      : '+ Añadir cliente (opcional)'}
                  </button>

                  {/* Buscador de todos los usuarios registrados con scroll vertical max-h-28 */}
                  {isClientSearchOpen && (
                    <div className="mt-2 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Buscar por nombre o teléfono..."
                          value={clientSearchText}
                          onChange={(e) => setClientSearchText(e.target.value)}
                          className="w-full h-8 pl-8 pr-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-[#1d63b8]"
                          autoFocus
                        />
                      </div>

                      <div className="max-h-28 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700 text-xs">
                        {filteredClients.length === 0 ? (
                          <p className="p-2 text-gray-400 text-center">No se encontraron clientes</p>
                        ) : (
                          filteredClients.map((client) => (
                            <div
                              key={`client-opt-${client.id}`}
                              onClick={() => {
                                setSelectedClient(client);
                                setIsClientSearchOpen(false);
                                setClientSearchText('');
                              }}
                              className="p-2 hover:bg-blue-50 dark:hover:bg-slate-700/60 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
                            >
                              <div>
                                <span className="font-bold text-gray-900 dark:text-white block">
                                  {client.name}
                                </span>
                                <span className="text-[11px] text-[#0BA70B]">
                                  {client.phone || '-'}
                                </span>
                              </div>
                              {Number(client.debt || 0) > 0 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                  Debe ${Number(client.debt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between py-1">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {selectedClient.name}
                    </p>
                    <p className="text-xs font-mono text-[#0BA70B]">
                      {selectedClient.phone || '-'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedClient(null)}
                    className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg cursor-pointer transition-colors"
                    title="Quitar cliente"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Filas de Métodos de Pago: transparentes, alineadas en la misma línea horizontal, monto sin borde */}
            <div className="space-y-2 pt-1">
              <div className="text-sm font-bold text-gray-600 dark:text-slate-300 text-left">
                Método de pago
              </div>

              <div className="space-y-1.5">
                {payments.map((p, idx) => {
                  const isDeleteOpen = deleteMenuRowId === p.id;

                  return (
                    <div
                      key={`pay-block-${p.id}`}
                      className="bg-transparent border-none shadow-none py-1.5 relative"
                    >
                      {/* Fila principal en una sola línea horizontal */}
                      <div className="flex items-center justify-between w-full">
                        {/* Zona 1: Icono + Nombre del método */}
                        <div 
                          onClick={() => {
                            setEditingPaymentIndex(idx);
                            setIsPaymentSheetOpen(true);
                          }}
                          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer py-1"
                        >
                          {renderMethodIcon(p.method)}
                          <span className="font-black text-sm text-gray-900 dark:text-white truncate">
                            {p.method}
                          </span>
                        </div>

                        {/* Zona 2: Badge de Monto SIN BORDE */}
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={p.amount}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPayments((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], amount: val === '' ? '' : Number(val) };
                                return copy;
                              });
                            }}
                            className={`border-0 border-none ring-0 focus:ring-0 outline-none rounded-lg px-3 py-1.5 w-24 text-center font-bold text-xs sm:text-sm text-gray-900 dark:text-white transition-colors ${
                              isFalta 
                                ? 'bg-[#fce8e8] dark:bg-red-950/50' 
                                : 'bg-[#e8effa] dark:bg-blue-950/50'
                            }`}
                          />

                          {/* Zona 3: Flecha > con Popover de Borrado en letra gris */}
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteMenuRowId(isDeleteOpen ? null : p.id);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer transition-colors"
                            >
                              <ChevronRight size={18} />
                            </button>

                            {isDeleteOpen && (
                              <div className="absolute right-0 top-full mt-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemovePaymentBlock(p.id);
                                  }}
                                  className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-300 hover:text-gray-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                  <span>Borrar método de pago</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Renglón inferior alineado bajo el badge para no desalinear la fila */}
                      {faltante > 0 && (
                        <div className="text-right pr-7 mt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setPayments((prev) => {
                                const copy = [...prev];
                                const cur = Number(copy[idx].amount) || 0;
                                copy[idx] = { ...copy[idx], amount: cur + faltante };
                                return copy;
                              });
                            }}
                            className="text-[11px] font-bold text-rose-600 underline cursor-pointer"
                          >
                            Faltan ${faltante.toLocaleString()}
                          </button>
                        </div>
                      )}

                      {sobrante > 0 && (
                        <div className="text-right pr-7 mt-0.5">
                          <button
                            type="button"
                            onClick={handleAutocorrectSobrante}
                            className="text-[11px] font-bold text-[#1d63b8] underline cursor-pointer"
                          >
                            Sobran ${sobrante.toLocaleString()}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Botón "+ agregar método de pago" con fondo transparente */}
              {faltante > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPaymentIndex(null);
                    setIsPaymentSheetOpen(true);
                  }}
                  className="w-full py-2.5 rounded-xl bg-transparent border border-gray-200 dark:border-slate-700 text-center font-bold text-xs sm:text-sm text-gray-700 dark:text-slate-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                >
                  + agregar método de pago
                </button>
              )}
            </div>

            {saleError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{saleError}</span>
              </div>
            )}

            {/* Botón Principal Inferior en Paso 2 de Mostrador */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleFinalizeSale}
                disabled={!canFinalizeSale}
                className={`w-full py-4 px-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg transition-all ${
                  canFinalizeSale
                    ? 'bg-[#1d63b8] hover:bg-[#18539c] text-white shadow-[#1d63b8]/25 active:scale-98 cursor-pointer'
                    : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Procesando venta...</span>
                  </>
                ) : (
                  <span>
                    {isFalta
                      ? `Faltan $${faltante.toLocaleString()}`
                      : isFiadoBlocked
                      ? 'Asigná un cliente para saldo pendiente'
                      : 'Finalizar venta'}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
      )}

      {/* =================================================================== */}
      {/* SUB-BOTTOM SHEET: AGREGAR / CAMBIAR MÉTODO DE PAGO                  */}
      {/* =================================================================== */}
      <AnimatePresence>
        {isPaymentSheetOpen && (
          <div
            className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60 backdrop-blur-xs select-none"
            onClick={(e) => {
              e.stopPropagation();
              setIsPaymentSheetOpen(false);
              setEditingPaymentIndex(null);
            }}
          >
            <motion.div
              drag="y"
              dragListener={false}
              dragControls={sheetDragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.9 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) {
                  setIsPaymentSheetOpen(false);
                  setEditingPaymentIndex(null);
                }
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-t-[32px] sm:rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md mx-auto space-y-4"
            >
              <div 
                onPointerDown={(e) => sheetDragControls.start(e)}
                className="touch-none cursor-grab active:cursor-grabbing text-center space-y-1 -mt-1 mb-2"
              >
                <div className="w-12 h-1.5 bg-gray-300 dark:bg-slate-700 rounded-full mx-auto mb-2 shrink-0" />
                <h4 className="font-black text-base text-gray-900 dark:text-white">
                  {editingPaymentIndex !== null ? 'Cambiar método de pago' : 'Agregar método de pago'}
                </h4>
                <p className="text-xs text-gray-400">
                  mantené presionado para ordenar los métodos de pago según tu preferencia
                </p>
              </div>

              <Reorder.Group
                axis="y"
                values={orderedMethods}
                onReorder={handleSaveMethodsOrder}
                className="space-y-2 py-2"
              >
                {orderedMethods.map((m) => (
                  <Reorder.Item
                    key={`reorder-sheet-${m}`}
                    value={m}
                    className="p-3.5 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:border-gray-400 transition-colors shadow-2xs"
                    onClick={() => {
                      if (activeSection === 'gastos') {
                        if (editingPaymentIndex !== null) {
                          handleChangeExpenseBlockMethod(editingPaymentIndex, m);
                        } else {
                          handleAddNewExpensePaymentMethod(m);
                        }
                      } else {
                        if (editingPaymentIndex !== null) {
                          handleChangeBlockMethod(editingPaymentIndex, m);
                        } else {
                          handleAddNewPaymentMethod(m);
                        }
                      }
                      setIsPaymentSheetOpen(false);
                      setEditingPaymentIndex(null);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {renderMethodIcon(m)}
                      <span className="font-black text-sm text-gray-900 dark:text-white">
                        {m}
                      </span>
                    </div>
                    <div
                      className="p-2 text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical size={18} />
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =================================================================== */}
      {/* MODAL: CARTEL FLOTANTE AUTO-CERRABLE (2S) MOSTRADOR Y GASTOS       */}
      {/* =================================================================== */}
      <AnimatePresence>
        {confirmationData && (
          <div 
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none"
            onClick={handleCloseConfirmation}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-sm text-center space-y-4"
            >
              <div 
                className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-inner ${
                  confirmationData.type === 'mostrador' 
                    ? 'bg-blue-50 dark:bg-blue-950/80 text-[#1d63b8]' 
                    : 'bg-purple-50 dark:bg-purple-950/80 text-[#7c12e8]'
                }`}
              >
                <CheckCircle2 size={36} strokeWidth={2.2} />
              </div>

              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white">
                  {confirmationData.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  {confirmationData.type === 'mostrador' 
                    ? 'Transacción registrada y stock actualizado en Firestore.' 
                    : 'Gasto registrado correctamente en el libro de finanzas.'}
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-slate-800/80 rounded-2xl border border-gray-100 dark:border-slate-700 text-left text-xs space-y-1.5 font-mono">
                {confirmationData.ticketCode && (
                  <div className="flex justify-between text-gray-500 dark:text-slate-400">
                    <span>Comprobante:</span>
                    <span className="font-bold text-gray-700 dark:text-slate-300 truncate max-w-[140px]">
                      {confirmationData.ticketCode}
                    </span>
                  </div>
                )}
                {confirmationData.clientOrEntity && (
                  <div className="flex justify-between text-gray-500 dark:text-slate-400">
                    <span>{confirmationData.type === 'mostrador' ? 'Cliente:' : 'Entidad:'}</span>
                    <span className="font-bold text-gray-800 dark:text-white truncate max-w-[140px]">
                      {confirmationData.clientOrEntity}
                    </span>
                  </div>
                )}
                <div className={`pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between items-baseline font-black ${
                  confirmationData.type === 'mostrador' ? 'text-[#1d63b8]' : 'text-[#7c12e8]'
                }`}>
                  <span className="text-xs uppercase tracking-wider">Total:</span>
                  <span className="font-mono text-2xl font-black">
                    ${confirmationData.total.toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseConfirmation}
                className={`w-full py-3.5 text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer ${
                  confirmationData.type === 'mostrador'
                    ? 'bg-[#1d63b8] hover:bg-[#18539c]'
                    : 'bg-[#7c12e8] hover:bg-[#680fc5]'
                }`}
              >
                Aceptar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
