import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Check, 
  AlertCircle, 
  User as UserIcon, 
  DollarSign, 
  CreditCard, 
  ArrowRightLeft, 
  Clock, 
  Receipt, 
  RefreshCw,
  X,
  Package,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  GripVertical,
  SlidersHorizontal,
  Flame,
  Wallet,
  Tag,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import type { Product, User, ProductCategory, FinancialPaymentMethod } from '../types';
import { 
  subscribeToProducts, 
  subscribeToInventoryCategories, 
  subscribeToClients,
  createOperationWithInitialPayment,
  isGenericClientPlaceholder,
  subscribeToExpenseCategories,
  subscribeToExpenseItems,
  executeExpenseOperation,
  saveSupplierConceptInFirestore,
  saveExpenseItemInFirestore
} from '../lib/firestoreSync';
import { usePOSCart } from './POSCartContext';
import { playAddToCartSound, playCashRegisterSound } from '../lib/posAudio';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Fiado'];
const EXPENSE_PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Crédito', 'Pendiente'];
const STORAGE_PAYMENT_ORDER_KEY = 'jogo_pos_payment_methods_order';

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
}

export const POSModal: React.FC<POSModalProps> = ({
  isOpen,
  onClose,
  complexId = 'B',
  onNavigateToUserProfile,
  initialSection = 'mostrador'
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

  useEffect(() => {
    if (isOpen) {
      if (initialSection) {
        setActiveSection(initialSection);
      }
      setStep(1);
      setExpenseStep(1);
    }
  }, [isOpen, initialSection]);

  // Step in Mostrador: 1 (Armado del Carrito) | 2 (Checkout y Calculadora)
  const [step, setStep] = useState<1 | 2>(1);

  // Catalog State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  // Multi-category selection preserving selection order (oldest first)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Clients State
  const [clients, setClients] = useState<User[]>([]);
  const [selectedClient, setSelectedClient] = useState<User | null>(null);
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
  const [clientSearchText, setClientSearchText] = useState('');

  // Payment Methods Order (customizable via drag-and-drop & saved in localStorage)
  const [orderedMethods, setOrderedMethods] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_PAYMENT_ORDER_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return DEFAULT_PAYMENT_METHODS;
  });

  // Payments blocks in Step 2 (Checkout)
  const [payments, setPayments] = useState<PaymentBlock[]>([]);
  const [activeEditingIndex, setActiveEditingIndex] = useState<number | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isAddingMethodModalOpen, setIsAddingMethodModalOpen] = useState(false);

  // Submission & Confirmation state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saleIdempotencyKey, setSaleIdempotencyKey] = useState<string | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [saleCompletedData, setSaleCompletedData] = useState<{
    txId: string;
    total: number;
    payments: { method: string; amount: number }[];
    clientName?: string;
    itemsCount: number;
  } | null>(null);

  // Gastos (Expense Management) state - Sincronizado con Editar Mostrador
  const [expenseCategories, setExpenseCategories] = useState<ProductCategory[]>([]);
  const [expenseItems, setExpenseItems] = useState<Product[]>([]);
  const [expenseStep, setExpenseStep] = useState<1 | 2>(1);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('all');
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [selectedExpenseConcept, setSelectedExpenseConcept] = useState<Product | null>(null);
  const [expenseAmount, setExpenseAmount] = useState<number | string>('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [isCustomConceptModalOpen, setIsCustomConceptModalOpen] = useState(false);
  const [customConceptForm, setCustomConceptForm] = useState<{
    name: string;
    category: string;
    price: number | '';
    isSupplier: boolean;
    saveToCatalog: boolean;
  }>({
    name: '',
    category: '',
    price: '',
    isSupplier: false,
    saveToCatalog: true
  });
  const [expensePayments, setExpensePayments] = useState<PaymentBlock[]>([
    { id: 'exp_p_1', method: 'Efectivo', amount: '' }
  ]);
  const [expenseSelectedSupplier, setExpenseSelectedSupplier] = useState<User | Product | null>(null);
  const [isExpenseSupplierSearchOpen, setIsExpenseSupplierSearchOpen] = useState(false);
  const [expenseSupplierSearchText, setExpenseSupplierSearchText] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [expenseSuccessMsg, setExpenseSuccessMsg] = useState(false);
  const [expenseErrorMsg, setExpenseErrorMsg] = useState<string | null>(null);

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

    return () => {
      unsubProds();
      unsubCats();
      unsubClients();
      unsubExpCats();
      unsubExpItems();
    };
  }, [targetId, isOpen]);

  // Save methods order to localStorage when modified
  const handleSaveMethodsOrder = (newOrder: string[]) => {
    setOrderedMethods(newOrder);
    try {
      localStorage.setItem(STORAGE_PAYMENT_ORDER_KEY, JSON.stringify(newOrder));
    } catch (e) {}
  };

  // Sync payments state when entering Step 2:
  // "Estado Inicial: Al entrar, el primer método de pago (predeterminado) aparece con el monto TOTAL rellenado por defecto."
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
        // If there's only 1 method and its amount was equal to previous total, keep it synced
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

  // --------------------------------------------------------------------------
  // Category Selection Logic:
  // - "puedo presionar más de una categoría a la vez."
  // - "Si presiono todos, solo puedo tener una sola opción, no múltiples."
  // - "Mostrar primero los productos de la categoría presionada más antigua."
  // --------------------------------------------------------------------------
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
        // Only active products
        if (p.status === 'inactivo') return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchCat = (p.categoryId || '').toLowerCase().includes(q);
          if (!matchName && !matchCat) return false;
        }

        // Category filter
        if (selectedCategories.length > 0) {
          if (!selectedCategories.includes(p.categoryId)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // If multiple categories selected, show products of the oldest pressed category first
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

  // Filtered clients for quick selection
  const filteredClients = useMemo(() => {
    if (!clientSearchText.trim()) return clients.slice(0, 10);
    const q = clientSearchText.toLowerCase();
    return clients.filter((c) => 
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [clients, clientSearchText]);

  // --------------------------------------------------------------------------
  // Calculations for Step 2 (Checkout Calculator):
  // --------------------------------------------------------------------------
  const totalAssignedPayments = useMemo(() => {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments]);

  const diff = totalAssignedPayments - cartTotal;
  const isSobra = diff > 0.01;
  const isFalta = diff < -0.01;
  const sobrante = Math.max(0, diff);
  const faltante = Math.max(0, -diff);

  const isMathExact = cartTotal > 0 && Math.abs(diff) < 0.01;
  const hasFiado = payments.some((p) => p.method.toLowerCase().includes('fiado'));
  const isFiadoBlocked = hasFiado && !selectedClient;
  const canFinalizeSale = isMathExact && !isFiadoBlocked && !isSubmitting && cartItems.length > 0;

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
      // Deduct the surplus from the last payment or the payment with enough funds
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
    // Determine which method to use:
    // next one in orderedMethods that is not already in payments, or default
    let selectedMethod = methodToUse;
    if (!selectedMethod) {
      const unusedMethod = orderedMethods.find((m) => !payments.some((p) => p.method === m));
      selectedMethod = unusedMethod || orderedMethods[0] || 'Transferencia';
    }

    const newPaymentBlock: PaymentBlock = {
      id: `pay_${Date.now()}_${Math.random()}`,
      method: selectedMethod,
      amount: faltante > 0 ? faltante : 0
    };

    setPayments((prev) => [...prev, newPaymentBlock]);
    setIsAddingMethodModalOpen(false);
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
    setIsOrderModalOpen(false);
    setActiveEditingIndex(null);
  };

  // Remove a payment block row
  const handleRemovePaymentBlock = (id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  // Finalize Sale using Unified Financial Engine (createOperationWithInitialPayment)
  const handleFinalizeSale = async () => {
    if (!canFinalizeSale) return;

    setSaleError(null);
    setIsSubmitting(true);

    // Conservar la misma clave de idempotencia entre reintentos para no duplicar ventas
    const currentIdempotencyKey = saleIdempotencyKey || `pos_sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    if (!saleIdempotencyKey) {
      setSaleIdempotencyKey(currentIdempotencyKey);
    }

    try {
      const normalizedPayments = payments.map((p) => ({
        method: p.method.toLowerCase().includes('fiado') 
          ? 'fiado' 
          : p.method.toLowerCase().includes('transferencia')
          ? 'transferencia'
          : p.method.toLowerCase().includes('tarjeta')
          ? 'tarjeta'
          : 'efectivo',
        amount: Number(p.amount) || 0
      }));

      // Separar cobros efectivos de asignación a cuenta corriente (fiado)
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

      // Invocar función transaccional unificada con regla de oro de Firestore
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

      // Play cash register ka-ching chime!
      playCashRegisterSound();

      // Show completed sale animation modal
      setSaleCompletedData({
        txId: result.ticketCode || result.operationId,
        total: cartTotal,
        payments: normalizedPayments,
        clientName: resolvedClientName !== 'NN' ? resolvedClientName : undefined,
        itemsCount: totalUnits
      });

      // Vaciar carrito y reiniciar estado únicamente tras confirmación exitosa
      clearCart();
      setPayments([]);
      setSelectedClient(null);
      setSaleIdempotencyKey(null);
      setSaleError(null);
      setStep(1);
    } catch (err: any) {
      console.warn('Error finalizando venta:', err);
      const friendlyMsg = err?.message || 'Error al procesar la venta. Verificá la conexión y reintentá.';
      setSaleError(friendlyMsg);
      // Mantener saleIdempotencyKey intacto para que el próximo reintento sea idempotente
    } finally {
      setIsSubmitting(false);
    }
  };

  // Gastos: Métodos de pago y calculadora dividida coherente con Ventas
  const mapToFinancialPaymentMethod = (method: string): FinancialPaymentMethod => {
    const m = method.toLowerCase();
    if (m.includes('efectivo') || m === 'cash') return 'cash';
    if (m.includes('transf') || m === 'transfer') return 'transfer';
    if (m.includes('tarjeta') || m.includes('credit') || m.includes('crédito') || m.includes('débito') || m.includes('debito')) return 'credit';
    return 'cash';
  };

  const totalExpenseNum = Math.max(0, Number(expenseAmount) || 0);

  // Sincronizar primera fila con el total del gasto cuando se introduce o selecciona el importe
  useEffect(() => {
    if (activeSection === 'gastos') {
      if (expensePayments.length <= 1) {
        setExpensePayments([
          {
            id: expensePayments[0]?.id || `exp_pay_${Date.now()}`,
            method: expensePayments[0]?.method || 'Efectivo',
            amount: totalExpenseNum > 0 ? totalExpenseNum : ''
          }
        ]);
      }
    }
  }, [totalExpenseNum, activeSection]);

  const totalAssignedExpensePayments = useMemo(() => {
    return expensePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [expensePayments]);

  const expenseDiff = totalAssignedExpensePayments - totalExpenseNum;
  const isExpenseSobra = totalExpenseNum > 0 && expenseDiff > 0.01;
  const isExpenseFalta = totalExpenseNum > 0 && expenseDiff < -0.01;
  const expenseSobrante = Math.max(0, expenseDiff);
  const expenseFaltante = Math.max(0, -expenseDiff);
  const isExpenseMathExact = totalExpenseNum > 0 && Math.abs(expenseDiff) < 0.01;

  const handleAddNewExpensePaymentMethod = (methodToUse?: string) => {
    const available = ['Efectivo', 'Transferencia', 'Crédito', 'Pendiente'];
    let selMethod = methodToUse;
    if (!selMethod) {
      selMethod = available.find(m => !expensePayments.some(p => p.method === m)) || 'Transferencia';
    }
    const newAmt = expenseFaltante > 0 ? expenseFaltante : 0;
    setExpensePayments(prev => [
      ...prev,
      { id: `exp_pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, method: selMethod!, amount: newAmt }
    ]);
  };

  const handleChangeExpenseBlockMethod = (index: number, newMethod: string) => {
    setExpensePayments(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], method: newMethod };
      }
      return copy;
    });
  };

  const handleRemoveExpensePaymentBlock = (id: string) => {
    if (expensePayments.length <= 1) return;
    setExpensePayments(prev => prev.filter(p => p.id !== id));
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

  // Paso 1 -> Paso 2: Validar concepto e importe y avanzar al pago
  const handleProceedExpenseToPayment = () => {
    setExpenseErrorMsg(null);
    if (!totalExpenseNum || totalExpenseNum <= 0) {
      setExpenseErrorMsg('Ingresá un importe válido mayor a $0.');
      return;
    }

    if (!selectedExpenseConcept && !customConceptForm.name.trim()) {
      setExpenseErrorMsg('Seleccioná un concepto de gasto o ingresá uno personalizado.');
      return;
    }

    // Si aún no se distribuyó el pago o solo hay una fila vacía, asignar el total a Efectivo por defecto
    if (expensePayments.length <= 1 && (!expensePayments[0]?.amount || Number(expensePayments[0]?.amount) === 0)) {
      setExpensePayments([
        { id: `exp_p_${Date.now()}`, method: 'Efectivo', amount: totalExpenseNum }
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

    if (!selectedExpenseConcept && !customConceptForm.name.trim()) {
      setExpenseErrorMsg('Seleccioná un concepto de gasto o ingresá uno personalizado.');
      return;
    }

    if (!isExpenseMathExact) {
      if (isExpenseFalta) {
        setExpenseErrorMsg(`Faltan $${expenseFaltante.toLocaleString()} por asignar para completar el total del gasto ($${totalExpenseNum.toLocaleString()}).`);
      } else if (isExpenseSobra) {
        setExpenseErrorMsg(`Los importes asignados ($${totalAssignedExpensePayments.toLocaleString()}) superan el total del gasto ($${totalExpenseNum.toLocaleString()}).`);
      }
      return;
    }

    setIsSubmittingExpense(true);
    setExpenseErrorMsg(null);
    try {
      const conceptName = selectedExpenseConcept 
        ? selectedExpenseConcept.name 
        : customConceptForm.name.trim();
      const rubroName = selectedExpenseConcept 
        ? (selectedExpenseConcept.categoryName || selectedExpenseConcept.categoryId || 'Gastos Generales')
        : (customConceptForm.category || 'Gastos Generales');

      let finalConceptId = selectedExpenseConcept?.id;
      if (!selectedExpenseConcept && customConceptForm.saveToCatalog && customConceptForm.name.trim()) {
        try {
          finalConceptId = await saveExpenseItemInFirestore(targetId, {
            name: customConceptForm.name.trim(),
            categoryId: rubroName,
            categoryName: rubroName,
            price: totalExpenseNum,
            status: 'activo'
          });
        } catch (catErr) {
          console.warn('Error guardando concepto en catálogo:', catErr);
        }
      }

      // Separar importes efectivamente desembolsados (Efectivo, Transferencia, Crédito/Tarjeta)
      // del saldo Pendiente (que queda registrado como saldo por pagar sin generar movimiento de salida)
      const paidPayments = expensePayments
        .filter(p => p.method !== 'Pendiente' && (Number(p.amount) || 0) > 0)
        .map((p) => ({
          amount: Number(p.amount),
          paymentMethod: mapToFinancialPaymentMethod(p.method),
          notes: expenseDescription.trim() ? `${expenseDescription.trim()} (${p.method})` : `Pago egreso (${p.method})`
        }));

      await executeExpenseOperation({
        complexId: targetId,
        category: rubroName,
        categoryId: selectedExpenseConcept?.categoryId,
        concept: conceptName,
        conceptId: finalConceptId,
        supplierName: conceptName,
        amount: totalExpenseNum,
        payments: paidPayments,
        operatorId: auth.currentUser?.uid || 'administrador',
        notes: expenseDescription.trim() || `Egreso registrado: ${conceptName}`
      });

      playCashRegisterSound();
      setExpenseSuccessMsg(true);
      setExpenseAmount('');
      setExpenseDescription('');
      setSelectedExpenseConcept(null);
      setIsCustomConceptModalOpen(false);
      setExpenseStep(1);
      setCustomConceptForm({
        name: '',
        category: '',
        price: '',
        isSupplier: false,
        saveToCatalog: true
      });
      setExpensePayments([{ id: `exp_p_${Date.now()}`, method: 'Efectivo', amount: '' }]);
      setTimeout(() => {
        setExpenseSuccessMsg(false);
        onClose();
      }, 1300);
    } catch (err: any) {
      console.error('Error registrando egreso:', err);
      setExpenseErrorMsg(err?.message || 'Error al registrar el gasto en el sistema.');
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 select-none"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[96vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-slate-800 flex flex-col overflow-hidden mx-auto"
      >
        {/* =================================================================== */}
        {/* TOP MODAL HEADER: SECCIONES (MOSTRADOR Y GASTOS) + CLOSE BUTTON     */}
        {/* =================================================================== */}
        <div className="shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 z-20">
          
          {/* Si estamos en Paso 1 (en Mostrador o en Gastos), mostrar selector de Secciones */}
          {((activeSection === 'mostrador' && step === 1) || (activeSection === 'gastos' && expenseStep === 1)) ? (
            /* Dos Secciones: Mostrador y Gastos */
            <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-2xl gap-1">
              <button
                type="button"
                onClick={() => { setActiveSection('mostrador'); setStep(1); }}
                className={`px-4 py-1.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
                  activeSection === 'mostrador'
                    ? 'bg-white dark:bg-slate-700 text-[#0BA70B] shadow-xs'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-800'
                }`}
              >
                Mostrador
              </button>
              <button
                type="button"
                onClick={() => { setActiveSection('gastos'); setExpenseStep(1); }}
                className={`px-4 py-1.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
                  activeSection === 'gastos'
                    ? 'bg-white dark:bg-slate-700 text-red-500 shadow-xs'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-800'
                }`}
              >
                Gastos
              </button>
            </div>
          ) : activeSection === 'gastos' && expenseStep === 2 ? (
            /* Paso 2 en Gastos: Cabecera con flecha < para volver a Paso 1 de Gastos */
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpenseStep(1)}
                className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
                title="Volver al Paso 1 (selección de concepto de gasto)"
              >
                <ChevronLeft size={20} className="text-gray-800 dark:text-white" />
                <span className="hidden sm:inline">Volver a Selección</span>
              </button>
              <h3 className="text-sm sm:text-base font-black text-gray-900 dark:text-white ml-1 flex items-center gap-2">
                <span>Registrar Pago</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                  Paso 2 de 2
                </span>
              </h3>
            </div>
          ) : (
            /* Paso 2 en Mostrador: Cabecera con flecha < para volver a Paso 1 */
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
                title="Volver al Paso 1 (el carrito se mantiene intacto)"
              >
                <ChevronLeft size={20} className="text-gray-800 dark:text-white" />
                <span className="hidden sm:inline">Volver al Mostrador</span>
              </button>
              <h3 className="text-sm sm:text-base font-black text-gray-900 dark:text-white ml-1 flex items-center gap-2">
                <span>Cobro</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Paso 2 de 2
                </span>
              </h3>
            </div>
          )}

          <div className="flex items-center gap-2">
            {step === 1 && activeSection === 'mostrador' && cartItems.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-[#0BA70B] dark:bg-emerald-950 dark:text-emerald-300">
                {totalUnits} u.
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* SECCIÓN 1: GASTOS (CATÁLOGO EN TIEMPO REAL: RUBROS Y CONCEPTOS)    */}
        {/* =================================================================== */}
        {activeSection === 'gastos' ? (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {expenseSuccessMsg ? (
              <div className="p-10 m-auto text-center space-y-3 bg-red-50 dark:bg-red-950/40 rounded-3xl border border-red-200 dark:border-red-900 max-w-md mx-6">
                <CheckCircle2 size={44} className="mx-auto text-red-600 dark:text-red-400" />
                <h4 className="font-black text-lg text-red-700 dark:text-red-300">
                  ¡Gasto registrado con éxito!
                </h4>
                <p className="text-xs text-gray-600 dark:text-slate-300">
                  El egreso impactó directamente en el libro de caja y movimientos financieros.
                </p>
              </div>
            ) : expenseStep === 1 ? (
              <>
                {/* Cabecera con Buscador de Conceptos y Filtros por Rubro */}
                <div className="p-3 sm:p-4 pb-2 space-y-2.5 shrink-0 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                        <Wallet size={16} className="text-red-500" />
                        <span>Catálogo de Gastos y Egresos</span>
                      </h3>
                      <p className="text-[11px] text-gray-400">
                        Seleccioná un concepto para registrar la salida de dinero
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedExpenseConcept(null);
                        setCustomConceptForm({
                          name: '',
                          category: expenseCategories[0]?.name || 'Servicios',
                          price: '',
                          isSupplier: false,
                          saveToCatalog: true
                        });
                        setIsCustomConceptModalOpen(true);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 rounded-xl hover:bg-red-100 border border-red-200 dark:border-red-900/60 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Registrar un concepto no listado"
                    >
                      <Plus size={13} />
                      <span>Concepto puntual</span>
                    </button>
                  </div>

                  {/* Buscador de Conceptos de Gasto */}
                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar concepto o rubro de gasto..."
                      value={expenseSearchQuery}
                      onChange={(e) => setExpenseSearchQuery(e.target.value)}
                      className="w-full h-9.5 pl-10 pr-8 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                    />
                    {expenseSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setExpenseSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Filtro horizontal de Rubros */}
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    <button
                      type="button"
                      onClick={() => setExpenseCategoryFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        expenseCategoryFilter === 'all'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200'
                      }`}
                    >
                      Todos ({expenseItems.filter(i => i.status !== 'inactivo').length})
                    </button>

                    {expenseCategories
                      .filter((c) => c.status !== 'inactivo')
                      .map((rubro) => {
                        const isSelected = expenseCategoryFilter === rubro.name;
                        const count = expenseItems.filter(
                          (i) => i.status !== 'inactivo' && (i.categoryId === rubro.name || i.categoryName === rubro.name)
                        ).length;

                        return (
                          <button
                            type="button"
                            key={`exp-rubro-pill-${rubro.id}`}
                            onClick={() => setExpenseCategoryFilter(isSelected ? 'all' : rubro.name)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? 'bg-red-600 text-white shadow-xs'
                                : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200'
                            }`}
                          >
                            <span>{rubro.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                              isSelected ? 'bg-black/20 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                            }`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Grilla de Tarjetas de Conceptos */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-48">
                  {displayedExpenseConcepts.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 space-y-2">
                      <Wallet size={36} className="mx-auto opacity-40 text-red-500" />
                      <p className="text-xs font-bold text-gray-600 dark:text-slate-300">
                        No se encontraron conceptos de gasto
                      </p>
                      <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                        {expenseItems.length === 0
                          ? 'Configurá tus conceptos en Perfil → Editar mostrador → Gastos, o registrá uno puntual con el botón superior.'
                          : 'Probá seleccionando otro rubro o limpiá la búsqueda.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {displayedExpenseConcepts.map((concept) => {
                        const isSelected = selectedExpenseConcept?.id === concept.id;
                        const refPrice = Number(concept.purchasePrice || concept.price || 0);

                        return (
                          <motion.div
                            key={`exp-concept-card-${concept.id}`}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => {
                              setSelectedExpenseConcept(concept);
                              if (refPrice > 0) {
                                setExpenseAmount(String(refPrice));
                              } else if (!expenseAmount) {
                                setExpenseAmount('');
                              }
                              setExpenseDescription(concept.name);
                              setExpenseErrorMsg(null);
                            }}
                            className={`p-3 rounded-2xl border transition-all select-none flex flex-col justify-between relative cursor-pointer ${
                              isSelected
                                ? 'border-red-500 bg-red-50/30 dark:bg-red-950/30 ring-2 ring-red-500/20 shadow-xs'
                                : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 hover:border-red-400 hover:shadow-xs'
                            }`}
                          >
                            {isSelected && (
                              <div className="absolute -top-1.5 -right-1.5 bg-red-600 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-xs border-2 border-white dark:border-slate-900 z-10">
                                <Check size={11} />
                              </div>
                            )}

                            <div className="space-y-1">
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
                                {concept.categoryName || concept.categoryId || 'Gasto'}
                              </div>
                              <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white line-clamp-2 min-h-[2.5rem]">
                                {concept.name}
                              </p>
                            </div>

                            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
                              <span className="text-[11px] font-mono text-gray-500 dark:text-slate-400">
                                {refPrice > 0 ? `$${refPrice.toLocaleString()}` : 'Monto libre'}
                              </span>
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                                isSelected
                                  ? 'bg-red-600 text-white'
                                  : 'bg-red-50 dark:bg-red-950/50 text-red-600'
                              }`}>
                                <Plus size={14} />
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Panel Inferior Fijo de Confirmación de Gasto */}
                {(selectedExpenseConcept || isCustomConceptModalOpen) && (
                  <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 shadow-2xl z-30 space-y-3">
                    {/* Si es concepto puntual/libre, permitir escribir el nombre y seleccionar el rubro */}
                    {!selectedExpenseConcept && isCustomConceptModalOpen ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider">
                            Nuevo Concepto Puntual
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomConceptModalOpen(false);
                              setCustomConceptForm({
                                name: '',
                                category: '',
                                price: '',
                                isSupplier: false,
                                saveToCatalog: true
                              });
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                              Nombre del Concepto *
                            </label>
                            <input
                              type="text"
                              placeholder="Ej. Reparación de reflector..."
                              value={customConceptForm.name}
                              onChange={(e) => setCustomConceptForm(prev => ({ ...prev, name: e.target.value }))}
                              className="w-full h-10 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                              Rubro *
                            </label>
                            <select
                              value={customConceptForm.category || expenseCategories[0]?.name || 'Servicios'}
                              onChange={(e) => setCustomConceptForm(prev => ({ ...prev, category: e.target.value }))}
                              className="w-full h-10 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-bold text-gray-900 dark:text-white outline-none"
                            >
                              {expenseCategories.filter(c => c.status !== 'inactivo').map(c => (
                                <option key={`custom-rubro-opt-${c.id}`} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 block">
                            Concepto Seleccionado
                          </span>
                          <h4 className="font-black text-sm text-gray-900 dark:text-white truncate">
                            {selectedExpenseConcept?.name}
                          </h4>
                          <span className="text-[11px] text-gray-400">
                            Rubro: {selectedExpenseConcept?.categoryName || selectedExpenseConcept?.categoryId}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExpenseConcept(null);
                            setIsCustomConceptModalOpen(false);
                            setExpenseAmount('');
                            setExpenseDescription('');
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
                          title="Cambiar concepto"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    )}

                    {/* Inputs de Importe y Detalle */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Importe Total del Gasto ($) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-black text-gray-400">$</span>
                          <input
                            type="number"
                            min={1}
                            placeholder="0"
                            value={expenseAmount}
                            onChange={(e) => setExpenseAmount(e.target.value)}
                            className="w-full h-11 pl-8 pr-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 font-mono text-xl font-black text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Nota / Detalle adicional (opcional)
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: Factura A #001, service heladera..."
                          value={expenseDescription}
                          onChange={(e) => setExpenseDescription(e.target.value)}
                          className="w-full h-11 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                    </div>

                    {/* Botón para avanzar al Paso 2: Registrar Pago */}
                    {expenseErrorMsg && (
                      <p className="text-xs text-red-600 font-bold bg-red-50 dark:bg-red-950/50 p-2 rounded-xl">
                        {expenseErrorMsg}
                      </p>
                    )}

                    <div className="pt-2 flex items-center justify-between gap-3 border-t border-gray-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                          Total a Pagar
                        </span>
                        <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white font-mono">
                          ${totalExpenseNum > 0 ? totalExpenseNum.toLocaleString() : '0'}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={!totalExpenseNum || totalExpenseNum <= 0}
                        onClick={handleProceedExpenseToPayment}
                        className="py-3 px-5 bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-black text-sm rounded-2xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        <span>Continuar al Pago</span>
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* =================================================================== */
              /* PASO 2: REGISTRAR EL PAGO DEL GASTO (IDÉNTICO A VENTAS DE MOSTRADOR) */
              /* =================================================================== */
              <div className="flex-1 flex flex-col overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* Tarjeta Resumen del Gasto */}
                <div className="p-4 bg-red-50/70 dark:bg-red-950/30 rounded-2xl border border-red-100 dark:border-red-900/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-red-700 dark:text-red-300 uppercase tracking-wider block">
                        Total del Gasto
                      </span>
                      <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white font-mono">
                        ${totalExpenseNum.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-gray-900 dark:text-white block">
                        {selectedExpenseConcept?.name || customConceptForm.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        Rubro: {selectedExpenseConcept?.categoryName || selectedExpenseConcept?.categoryId || customConceptForm.category || 'Gastos'}
                      </span>
                    </div>
                  </div>
                  {expenseDescription.trim() && (
                    <div className="pt-2 border-t border-red-200/50 dark:border-red-900/40 text-xs text-gray-600 dark:text-slate-300">
                      <span className="font-bold">Detalle:</span> {expenseDescription.trim()}
                    </div>
                  )}
                  <div className="pt-2 border-t border-red-200/50 dark:border-red-900/40 flex items-center justify-between text-xs font-mono text-gray-500">
                    <span>Asignado: ${totalAssignedExpensePayments.toLocaleString()}</span>
                    <span>Total: ${totalExpenseNum.toLocaleString()}</span>
                  </div>
                </div>

                {/* Atajos Rápidos */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setExpensePayments([{ id: `exp_p_${Date.now()}`, method: 'Efectivo', amount: totalExpenseNum }]);
                    }}
                    className="py-2 px-1 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-slate-300 text-center cursor-pointer transition-colors"
                  >
                    100% Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExpensePayments([{ id: `exp_p_${Date.now()}`, method: 'Transferencia', amount: totalExpenseNum }]);
                    }}
                    className="py-2 px-1 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-slate-300 text-center cursor-pointer transition-colors"
                  >
                    100% Transf.
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExpensePayments([{ id: `exp_p_${Date.now()}`, method: 'Pendiente', amount: totalExpenseNum }]);
                    }}
                    className="py-2 px-1 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 text-center cursor-pointer transition-colors"
                  >
                    100% Pendiente
                  </button>
                </div>

                {/* Filas de Medios de Pago */}
                <div className="space-y-2.5">
                  {expensePayments.map((p, idx) => (
                    <div
                      key={`exp-pay-block-${p.id}`}
                      className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {['Efectivo', 'Transferencia', 'Crédito', 'Pendiente'].map((m) => {
                            const isSelected = p.method.toLowerCase() === m.toLowerCase();
                            const isPend = m === 'Pendiente';
                            return (
                              <button
                                key={`exp-row-${p.id}-m-${m}`}
                                type="button"
                                onClick={() => handleChangeExpenseBlockMethod(idx, m)}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                  isSelected
                                    ? isPend
                                      ? 'bg-amber-600 text-white shadow-2xs'
                                      : 'bg-red-600 text-white shadow-2xs'
                                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                }`}
                              >
                                {m}
                              </button>
                            );
                          })}
                        </div>

                        {expensePayments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveExpensePaymentBlock(p.id)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer shrink-0"
                            title="Eliminar este método"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                          <button
                            type="button"
                            onClick={() => {
                              setExpensePayments((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], amount: totalExpenseNum };
                                return copy;
                              });
                            }}
                            className="text-[11px] font-bold text-gray-400 hover:text-gray-900 dark:hover:text-white underline cursor-pointer"
                            title="Completar con el Total"
                          >
                            Total
                          </button>

                          {expenseFaltante > 0 && (
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
                              className="text-[11px] font-black text-amber-600 dark:text-amber-400 hover:underline cursor-pointer flex items-center gap-0.5"
                              title="Tocar para completar con el faltante"
                            >
                              <span>Restante: ${expenseFaltante.toLocaleString()}</span>
                            </button>
                          )}
                        </div>

                        <div className="relative w-36 sm:w-40">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                          <input
                            type="number"
                            min={0}
                            placeholder={String(totalExpenseNum)}
                            value={p.amount}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExpensePayments((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], amount: val === '' ? '' : Number(val) };
                                return copy;
                              });
                            }}
                            className="w-full h-9 pl-6 pr-2.5 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs sm:text-sm font-black text-gray-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-red-500 text-right"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Botón para añadir otro medio */}
                {expensePayments.length < 4 && (
                  <button
                    type="button"
                    onClick={() => handleAddNewExpensePaymentMethod()}
                    className="w-full py-2.5 border border-dashed border-gray-300 dark:border-slate-700 hover:border-red-500 text-gray-500 dark:text-slate-400 hover:text-red-600 rounded-2xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>Añadir otro medio de pago</span>
                  </button>
                )}

                {/* Alertas Matemáticas */}
                {!isExpenseMathExact && totalExpenseNum > 0 && (
                  <div className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 ${
                    isExpenseFalta
                      ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 text-amber-800 dark:text-amber-300"
                      : "bg-red-50 dark:bg-red-950/40 border-red-200 text-red-800 dark:text-red-300"
                  }`}>
                    <span>
                      {isExpenseFalta
                        ? `Faltan $${expenseFaltante.toLocaleString()} por asignar.`
                        : `Sobran $${expenseSobrante.toLocaleString()}.`}
                    </span>
                    {isExpenseSobra && (
                      <button
                        type="button"
                        onClick={handleAutocorrectExpenseSobrante}
                        className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold cursor-pointer hover:bg-red-700"
                      >
                        Ajustar
                      </button>
                    )}
                    {isExpenseFalta && (
                      <button
                        type="button"
                        onClick={() => handleAddNewExpensePaymentMethod('Pendiente')}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-bold cursor-pointer hover:bg-amber-700"
                      >
                        + Dejar restante como pendiente
                      </button>
                    )}
                  </div>
                )}

                {expenseErrorMsg && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{expenseErrorMsg}</span>
                  </div>
                )}

                {/* Botones de acción al pie */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setExpenseStep(1)}
                    className="py-3.5 px-4 rounded-2xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-bold text-xs sm:text-sm hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingExpense || !isExpenseMathExact}
                    onClick={() => handleSaveExpense()}
                    className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-black text-sm rounded-2xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <Wallet size={18} />
                    <span>
                      {isSubmittingExpense 
                        ? 'Registrando Gasto...' 
                        : `Confirmar Gasto · $${totalExpenseNum.toLocaleString()}`}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : step === 1 ? (
          /* =================================================================== */
          /* SECCIÓN 2: MOSTRADOR - PASO 1 (ARMADO DEL CARRITO)                  */
          /* =================================================================== */
          <div className="flex-1 flex flex-col overflow-hidden relative">
            
            {/* Buscador de Productos */}
            <div className="p-3 sm:p-4 pb-2 space-y-2.5 shrink-0 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar productos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9.5 pl-10 pr-8 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Filtros de Categorías:
                  - "Todos" (solo una opción a la vez)
                  - Categorías múltiples (muestra primero productos de la más antigua seleccionada) */}
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <button
                  type="button"
                  onClick={() => handleToggleCategory('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedCategories.length === 0
                      ? 'bg-[#0BA70B] text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200'
                  }`}
                >
                  Todos
                </button>

                {categories.map((cat) => {
                  const isSelected = selectedCategories.includes(cat);
                  const count = products.filter((p) => p.status !== 'inactivo' && p.categoryId === cat).length;
                  return (
                    <button
                      type="button"
                      key={`cat-pill-${cat}`}
                      onClick={() => handleToggleCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-[#0BA70B] text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected ? 'bg-black/20 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grilla de Productos */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-36">
              {displayedProducts.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <Package size={36} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-bold text-gray-600 dark:text-slate-300">
                    No se encontraron productos activos
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {products.length === 0 
                      ? 'Cargá productos en el catálogo dentro de Perfil.' 
                      : 'Probá con otra categoría o término de búsqueda.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {displayedProducts.map((product) => {
                    const cartMatch = cartItems.find((it) => it.product.id === product.id);
                    const isOutOfStock = product.stock <= 0;

                    return (
                      <motion.div
                        key={`pos-product-${product.id}`}
                        whileTap={!isOutOfStock ? { scale: 0.96 } : undefined}
                        onClick={() => {
                          if (!isOutOfStock) {
                            handleProductAdd(product);
                          }
                        }}
                        className={`p-3 rounded-2xl border transition-all select-none flex flex-col justify-between relative cursor-pointer ${
                          isOutOfStock
                            ? 'opacity-50 border-gray-200 bg-gray-50 dark:bg-slate-800/40 cursor-not-allowed'
                            : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 hover:border-[#0BA70B] hover:shadow-xs'
                        }`}
                      >
                        {/* Quantity badge in cart */}
                        {cartMatch && (
                          <div className="absolute -top-1.5 -right-1.5 bg-[#0BA70B] text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-xs border-2 border-white dark:border-slate-900 z-10 animate-scale">
                            {cartMatch.quantity}
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            <span className="truncate">{product.categoryId}</span>
                            <span className={isOutOfStock ? 'text-red-500' : 'text-[#0BA70B]'}>
                              {isOutOfStock ? 'Agotado' : `${product.stock} u.`}
                            </span>
                          </div>
                          <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white line-clamp-2 min-h-[2.5rem]">
                            {product.name}
                          </p>
                        </div>

                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-black text-gray-900 dark:text-white font-mono">
                            ${Number(product.salePrice || 0).toLocaleString()}
                          </span>
                          <button
                            type="button"
                            disabled={isOutOfStock}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs transition-colors ${
                              isOutOfStock
                                ? 'bg-gray-100 text-gray-400'
                                : 'bg-emerald-50 dark:bg-emerald-950 text-[#0BA70B] hover:bg-[#0BA70B] hover:text-white'
                            }`}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* =============================================================== */}
            {/* STICKY BOTTOM BAR (CARRITO) - Referencia Imagen 2               */}
            {/* Si el carrito está vacío: NO EXISTE / está oculto               */}
            {/* Si tiene >= 1 producto: aparece deslizado desde abajo           */}
            {/* =============================================================== */}
            <AnimatePresence>
              {cartItems.length > 0 && (
                <motion.div
                  initial={{ y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '100%', opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 280 }}
                  className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 shadow-[0_-6px_20px_rgba(0,0,0,0.1)] p-3 sm:p-4 space-y-3 z-30"
                >
                  {/* Lista exacta de ítems seleccionados (scrollable) */}
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {cartItems.map((item) => {
                      const itemSubtotal = Number(item.product.salePrice || 0) * item.quantity;
                      return (
                        <div
                          key={`sticky-cart-item-${item.product.id}`}
                          className="flex items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-slate-800/80 rounded-xl border border-gray-100 dark:border-slate-700/60"
                        >
                          {/* Izquierda: Nombre (Título) y debajo precio unitario en gris */}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                              {item.product.name}
                            </p>
                            <p className="text-[11px] text-gray-500 font-mono">
                              ${Number(item.product.salePrice || 0).toLocaleString()} c/u
                            </p>
                          </div>

                          {/* Centro/Derecha: Controles [ - ] [ Cantidad ] [ + ] */}
                          <div className="flex items-center gap-1.5 shrink-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-0.5">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, -1)}
                              className="w-6 h-6 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                              title="Disminuir cantidad"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-5 text-center text-xs font-black font-mono text-gray-900 dark:text-white">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, 1)}
                              className="w-6 h-6 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                              title="Aumentar cantidad"
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          {/* Derecha: Subtotal dinámico */}
                          <div className="text-right shrink-0 min-w-[55px]">
                            <span className="text-xs font-black text-gray-900 dark:text-white font-mono">
                              ${itemSubtotal.toLocaleString()}
                            </span>
                          </div>

                          {/* Extremo Derecho: Ícono de basura [ 🗑️ ] */}
                          <button
                            type="button"
                            onClick={() => removeItem(item.product.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                            title="Eliminar producto del carrito"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Botón Verde Principal:
                      - Ícono de carrito
                      - Sumatoria de unidades físicas (Ej: "3 productos")
                      - Total general a la derecha (Ej: "$15.000")
                      - Al presionar, avanza al Paso 2 */}
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="w-full py-3.5 px-4 bg-[#0BA70B] hover:bg-emerald-700 text-white rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between shadow-lg shadow-emerald-900/20 active:scale-98 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={18} />
                      <span>{totalUnits} {totalUnits === 1 ? 'producto' : 'productos'}</span>
                    </div>
                    <div className="font-mono text-sm sm:text-base">
                      ${cartTotal.toLocaleString()}
                    </div>
                  </button>
                </motion.div>
              )}

              {/* Botón gris deshabilitado si no hay productos seleccionados */}
              {cartItems.length === 0 && (
                <div className="shrink-0 p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled
                    className="w-full py-3.5 px-4 bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-not-allowed shadow-none"
                  >
                    <ShoppingCart size={18} />
                    <span>Selecciona productos</span>
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* =================================================================== */
          /* SECCIÓN 2: MOSTRADOR - PASO 2 (CHECKOUT Y CALCULADORA)              */
          /* Referencia visual: Imágenes 3, 4, 5 y 6                             */
          /* =================================================================== */
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            
            {/* A. Desglose de Productos:
                - "$ Total a cobrar" pequeño en gris claro
                - En negritas grande el monto correspondiente a cobrar
                - Desglose en gris: Coca Cola 2,5l x 3u ..... $15.000 (máximo 3 visibles, overflow-y-auto) */}
            <div className="bg-gray-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-gray-100 dark:border-slate-700/60 space-y-2">
              <div>
                <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider block">
                  $ Total a cobrar
                </span>
                <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white font-mono tracking-tight block">
                  ${cartTotal.toLocaleString()}
                </span>
              </div>

              {/* Lista con máximo 3 ítems visibles */}
              <div className="space-y-1 max-h-[85px] overflow-y-auto pr-1 text-xs text-gray-500 dark:text-slate-400 font-mono">
                {cartItems.map((item) => (
                  <div key={`checkout-item-${item.product.id}`} className="flex justify-between items-center gap-2">
                    <span className="truncate">
                      {item.product.name} x {item.quantity}u
                    </span>
                    <span className="shrink-0 font-bold text-gray-700 dark:text-slate-300">
                      ${(item.quantity * item.product.salePrice).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* A.2. Encabezado Cliente:
                - "+ Agregar cliente (opcional)"
                - Si hay Fiado y no hay cliente: "+ Añadir cliente (Obligatorio) *" en ROJO */}
            <div className="space-y-1.5">
              {!selectedClient ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setIsClientSearchOpen(!isClientSearchOpen)}
                    className={`text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isFiadoBlocked
                        ? 'text-red-500 hover:text-red-600 animate-pulse'
                        : 'text-[#0BA70B] hover:underline'
                    }`}
                  >
                    <UserIcon size={14} />
                    <span>
                      {isFiadoBlocked 
                        ? '+ Añadir cliente (Obligatorio) *' 
                        : '+ Agregar cliente (opcional)'}
                    </span>
                  </button>

                  {/* Buscador de usuarios registrados */}
                  {isClientSearchOpen && (
                    <div className="mt-2 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-lg space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Buscar por nombre o teléfono..."
                          value={clientSearchText}
                          onChange={(e) => setClientSearchText(e.target.value)}
                          className="w-full h-8 pl-8 pr-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-[#0BA70B]"
                          autoFocus
                        />
                      </div>

                      <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700 text-xs">
                        {filteredClients.map((client) => (
                          <div
                            key={`client-opt-${client.id}`}
                            onClick={() => {
                              setSelectedClient(client);
                              setIsClientSearchOpen(false);
                            }}
                            className="p-2 hover:bg-emerald-50 dark:hover:bg-slate-700/60 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div>
                              <span className="font-bold text-gray-900 dark:text-white block">
                                {client.name}
                              </span>
                              <span className="text-[11px] text-gray-400">
                                {client.phone || client.email || 'Sin teléfono'}
                              </span>
                            </div>
                            {Number(client.debt || 0) > 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                Debe ${Number(client.debt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Cliente Seleccionado:
                   - Visible nombre y número telefónico
                   - Al presionar su nombre lleva a su perfil (onNavigateToUserProfile) */
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onNavigateToUserProfile && onNavigateToUserProfile(String(selectedClient.id))}
                      className="font-black text-xs sm:text-sm text-gray-900 dark:text-white hover:text-[#0BA70B] underline cursor-pointer text-left block truncate"
                      title="Ver perfil del cliente"
                    >
                      {selectedClient.name}
                    </button>
                    <span className="text-[11px] text-gray-500 font-mono block">
                      {selectedClient.phone || 'Sin número telefónico registrado'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {Number(selectedClient.debt || 0) > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        Deuda: ${Number(selectedClient.debt).toLocaleString()}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedClient(null)}
                      className="text-[11px] font-bold text-gray-400 hover:text-red-500 cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* B. Métodos de Pago y Calculadora */}
            <div className="space-y-2.5 pt-1 border-t border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-slate-300">
                  Métodos de pago
                </span>

                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(true)}
                  className="text-[11px] font-bold text-[#0BA70B] flex items-center gap-1 hover:underline cursor-pointer"
                  title="Configurar orden y prioridad de métodos de pago"
                >
                  <SlidersHorizontal size={13} />
                  <span>Ordenar métodos</span>
                </button>
              </div>

              {/* Lista de Filas de Pago */}
              <div className="space-y-2.5">
                {payments.map((p, idx) => (
                  <div
                    key={`pay-block-${p.id}`}
                    className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Botones de métodos simples: [ Efectivo ], [ Transferencia ], [ Tarjeta ], [ Fiado ] */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {['Efectivo', 'Transferencia', 'Tarjeta', 'Fiado'].map((m) => (
                          <button
                            key={`row-${p.id}-m-${m}`}
                            type="button"
                            onClick={() => handleChangeBlockMethod(idx, m)}
                            className={`px-2 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              p.method.toLowerCase() === m.toLowerCase()
                                ? 'bg-[#0BA70B] text-white shadow-2xs'
                                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>

                      {payments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePaymentBlock(p.id)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer shrink-0"
                          title="Eliminar este método"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    {/* Input de Monto Editable con atajos Total y Restante */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                        {/* Texto interactivo "Total" */}
                        <button
                          type="button"
                          onClick={() => {
                            setPayments((prev) => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], amount: cartTotal };
                              return copy;
                            });
                          }}
                          className="text-[11px] font-bold text-gray-400 hover:text-gray-900 dark:hover:text-white underline cursor-pointer"
                          title="Completar con el Total"
                        >
                          Total
                        </button>

                        {/* Texto interactivo "Restante" si faltan fondos */}
                        {faltante > 0 && (
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
                            className="text-[11px] font-black text-amber-600 dark:text-amber-400 hover:underline cursor-pointer flex items-center gap-0.5"
                            title="Tocar para completar con el faltante"
                          >
                            <span>Restante: ${faltante.toLocaleString()}</span>
                          </button>
                        )}
                      </div>

                      <div className="relative w-36 sm:w-40">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                        <input
                          type="number"
                          min={0}
                          placeholder={String(cartTotal)}
                          value={p.amount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPayments((prev) => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], amount: val === '' ? '' : Number(val) };
                              return copy;
                            });
                          }}
                          className="w-full h-9 pl-6 pr-2.5 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs sm:text-sm font-black text-gray-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-[#0BA70B] text-right"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Atajos Matemáticos (Sobran / Faltan):
                  - "Sobran $X": Texto verde interactivo. Al tocarlo se autocorrige al precio de cobro exacto.
                  - "Faltan $X": Texto rojo. Habilita "+ agregar método de pago". */}
              {isSobra && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleAutocorrectSobrante}
                    className="text-xs font-black text-[#0BA70B] hover:underline cursor-pointer flex items-center gap-1 active:scale-98"
                    title="Tocar para autocorregir al monto exacto"
                  >
                    <span>Sobran ${sobrante.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-400 font-normal">(Tocar para corregir)</span>
                  </button>
                </div>
              )}

              {isFalta && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs font-black">
                    {/* Al tocar la palabra 'Restante', autocompleta con el restante */}
                    <button
                      type="button"
                      onClick={() => handleAddNewPaymentMethod()}
                      className="text-red-500 hover:text-red-600 cursor-pointer flex items-center gap-1 active:scale-98"
                      title="Tocar para agregar método con el restante exacto"
                    >
                      <span>Restante: ${faltante.toLocaleString()}</span>
                      <span className="text-[10px] text-gray-400 font-normal underline">(Tocar para autocompletar)</span>
                    </button>
                  </div>

                  {/* Acceso directo a agregar métodos rápidos con el restante exacto */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {['Efectivo', 'Transferencia', 'Tarjeta', 'Fiado'].map((m) => (
                      <button
                        key={`quick-add-${m}`}
                        type="button"
                        onClick={() => handleAddNewPaymentMethod(m)}
                        className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-[#0BA70B] text-[#0BA70B] hover:bg-emerald-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                      >
                        + {m}
                      </button>
                    ))}
                  </div>

                  {/* Opción blanca con bordes verdes juego finos de "+ agregar método de pago" */}
                  <button
                    type="button"
                    onClick={() => handleAddNewPaymentMethod()}
                    className="w-full py-2.5 px-4 rounded-xl border border-[#0BA70B] text-[#0BA70B] bg-white dark:bg-slate-800 hover:bg-emerald-50/50 dark:hover:bg-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-98"
                  >
                    <Plus size={16} />
                    <span>+ agregar método de pago (${faltante.toLocaleString()})</span>
                  </button>
                </div>
              )}
            </div>

            {/* D. Reglas de Validación y Bloqueo (Botón Finalizar Venta):
                - Deshabilitado si la suma de pagos !== Total
                - Deshabilitado si hay Fiado y no hay cliente seleccionado */}
            <div className="pt-3 space-y-2">
              {saleError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-red-500" />
                  <span>{saleError}</span>
                </div>
              )}
              <button
                type="button"
                onClick={handleFinalizeSale}
                disabled={!canFinalizeSale}
                className={`w-full py-4 px-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg transition-all ${
                  canFinalizeSale
                    ? 'bg-[#0BA70B] hover:bg-emerald-700 text-white shadow-emerald-900/20 active:scale-98 cursor-pointer'
                    : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Procesando venta...</span>
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    <span>
                      {!isMathExact 
                        ? isFalta 
                          ? `Faltan $${faltante.toLocaleString()}` 
                          : `Sobran $${sobrante.toLocaleString()}`
                        : isFiadoBlocked
                        ? 'Cliente obligatorio para fiar'
                        : `Finalizar Venta (${cartTotal.toLocaleString()})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* =================================================================== */}
      {/* MODAL: SELECCIONAR Y ORDENAR MÉTODOS DE PAGO (IMAGEN 5)             */}
      {/* Reorder.Group con drag-and-drop y persistencia en localStorage      */}
      {/* =================================================================== */}
      <AnimatePresence>
        {isOrderModalOpen && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => {
              setIsOrderModalOpen(false);
              setActiveEditingIndex(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-sm space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                <div>
                  <h4 className="font-black text-sm sm:text-base text-gray-900 dark:text-white">
                    Métodos de Pago
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    Mantén presionado para reordenar la prioridad.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsOrderModalOpen(false);
                    setActiveEditingIndex(null);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Reorder.Group de Framer Motion con animación en tiempo real */}
              <Reorder.Group
                axis="y"
                values={orderedMethods}
                onReorder={handleSaveMethodsOrder}
                className="space-y-2"
              >
                {orderedMethods.map((m, idx) => (
                  <Reorder.Item
                    key={`reorder-${m}`}
                    value={m}
                    className="p-3 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 flex items-center justify-between cursor-grab active:cursor-grabbing hover:border-[#0BA70B] transition-colors shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <GripVertical size={16} className="text-gray-400 shrink-0" />
                      <span className="font-black text-xs sm:text-sm text-gray-900 dark:text-white">
                        {m}
                      </span>
                      {idx === 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-[#0BA70B]">
                          Predeterminado
                        </span>
                      )}
                    </div>

                    {activeEditingIndex !== null && (
                      <button
                        type="button"
                        onClick={() => handleChangeBlockMethod(activeEditingIndex, m)}
                        className="text-xs font-bold text-[#0BA70B] bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-xl hover:bg-[#0BA70B] hover:text-white transition-colors cursor-pointer"
                      >
                        Seleccionar
                      </button>
                    )}
                  </Reorder.Item>
                ))}
              </Reorder.Group>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOrderModalOpen(false);
                    setActiveEditingIndex(null);
                  }}
                  className="w-full py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-800 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Listo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =================================================================== */}
      {/* MODAL: ELEGIR MÉTODO PARA "+ AGREGAR MÉTODO DE PAGO"                 */}
      {/* =================================================================== */}
      <AnimatePresence>
        {isAddingMethodModalOpen && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setIsAddingMethodModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-sm space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                <div>
                  <h4 className="font-black text-sm sm:text-base text-gray-900 dark:text-white">
                    Agregar Método de Pago
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    Se autocompletará con ${faltante.toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingMethodModalOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2">
                {orderedMethods.map((methodName) => (
                  <button
                    key={`add-method-opt-${methodName}`}
                    type="button"
                    onClick={() => handleAddNewPaymentMethod(methodName)}
                    className="w-full p-3 bg-gray-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 rounded-2xl border border-gray-200 dark:border-slate-700 text-left font-black text-xs sm:text-sm text-gray-900 dark:text-white flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>{methodName}</span>
                    <Plus size={16} className="text-[#0BA70B]" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =================================================================== */}
      {/* MODAL: ANIMACIÓN DE VENTA CONCRETADA                                */}
      {/* =================================================================== */}
      <AnimatePresence>
        {saleCompletedData && (
          <div 
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => {
              setSaleCompletedData(null);
              onClose();
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-sm text-center space-y-4"
            >
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-[#0BA70B] rounded-3xl flex items-center justify-center mx-auto shadow-inner animate-bounce">
                <CheckCircle2 size={36} />
              </div>

              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white">
                  ¡Venta Concretada!
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Transacción registrada y stock actualizado en Firestore.
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-slate-800/80 rounded-2xl border border-gray-100 dark:border-slate-700 text-left text-xs space-y-1 font-mono">
                <div className="flex justify-between text-gray-500">
                  <span>Comprobante:</span>
                  <span className="font-bold text-gray-700 dark:text-slate-300 truncate max-w-[140px]">
                    {saleCompletedData.txId}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Artículos:</span>
                  <span className="font-bold text-gray-800 dark:text-white">
                    {saleCompletedData.itemsCount} u.
                  </span>
                </div>
                {saleCompletedData.clientName && (
                  <div className="flex justify-between text-gray-500">
                    <span>Cliente:</span>
                    <span className="font-bold text-gray-800 dark:text-white">
                      {saleCompletedData.clientName}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between text-sm font-black text-[#0BA70B]">
                  <span>Total:</span>
                  <span>${saleCompletedData.total.toLocaleString()}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSaleCompletedData(null);
                  onClose();
                }}
                className="w-full py-3 bg-[#0BA70B] hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Aceptar y Cerrar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
