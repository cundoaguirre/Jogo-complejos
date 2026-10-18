import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Plus, 
  ChevronRight, 
  ChevronLeft, 
  Store, 
  Tag, 
  Package, 
  Search, 
  Edit3, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  RotateCcw, 
  Clock, 
  Check, 
  AlertCircle,
  Layers,
  ArrowRight,
  ShoppingBag,
  DollarSign,
  CreditCard,
  Building2,
  Calendar,
  Receipt,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import type { Product, ProductCategory, InventoryMovement, ProductBatch, FinancialPaymentMethod } from '../types';
import { 
  subscribeToInventoryCategories, 
  saveInventoryCategories, 
  subscribeToProducts, 
  saveProductInFirestore, 
  deleteProductInFirestore,
  subscribeToProductMovements,
  adjustProductStockInFirestore,
  subscribeToExpenseCategories,
  saveExpenseCategoryInFirestore,
  deleteExpenseCategoryInFirestore,
  toggleExpenseCategoryStatus,
  subscribeToExpenseItems,
  saveExpenseItemInFirestore,
  deleteExpenseItemInFirestore,
  toggleExpenseItemStatus,
  saveSupplierConceptInFirestore,
  registerMerchandisePurchaseInFirestore
} from '../lib/firestoreSync';
import { playPurchaseSound } from '../lib/posAudio';
import { cn } from '../lib/utils';
import { isToday } from 'date-fns';
import { CatalogInventorySection } from './CatalogInventorySection';

interface MostradorBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  complexId: string;
}

export const MostradorBottomSheet: React.FC<MostradorBottomSheetProps> = ({
  isOpen,
  onClose,
  complexId
}) => {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;

  // View state: 'categories' | 'products' | 'expenses'
  const [activeTab, setActiveTab] = useState<'categories' | 'products' | 'expenses'>('categories');
  // Selected category context when navigating into a specific category
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Data states
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Expense management data states
  const [expenseCategories, setExpenseCategories] = useState<ProductCategory[]>([]);
  const [expenseItems, setExpenseItems] = useState<Product[]>([]);

  // Toast confirmation state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  // Modals inside the Mostrador
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Expense Modals
  const [isExpenseCatModalOpen, setIsExpenseCatModalOpen] = useState(false);
  const [editingExpenseCat, setEditingExpenseCat] = useState<{ id?: string; name: string; oldName?: string; status?: 'activo' | 'inactivo' } | null>(null);
  const [isExpenseItemModalOpen, setIsExpenseItemModalOpen] = useState(false);
  const [editingExpenseItem, setEditingExpenseItem] = useState<{ id?: string; name: string; categoryId: string; price: number | ''; status?: 'activo' | 'inactivo' } | null>(null);
  const [expenseCatFilter, setExpenseCatFilter] = useState<'all' | 'active'>('active');

  // Product Modal (Create or Edit)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productModalMode, setProductModalMode] = useState<'create' | 'edit'>('create');
  // Sub-tabs in Edit mode: 'datos' | 'compras'
  const [editProductSubTab, setEditProductSubTab] = useState<'datos' | 'compras'>('datos');

  const [productForm, setProductForm] = useState<{
    id?: string;
    name: string;
    categoryId: string;
    stock: number | string;
    purchasePrice: number | string;
    salePrice: number | string;
    status: 'activo' | 'inactivo';
  }>({
    name: '',
    categoryId: '',
    stock: 10,
    purchasePrice: '',
    salePrice: '',
    status: 'activo'
  });

  // Purchase section form state with supplier support
  const [purchaseForm, setPurchaseForm] = useState<{
    quantity: number | string;
    unitCost: number | string;
    purchasePlace: string;
    supplierId?: string;
    paymentMode: 'cash' | 'transfer' | 'split';
    cashAmount: number | string;
    transferAmount: number | string;
    notes: string;
  }>({
    quantity: 10,
    unitCost: '',
    purchasePlace: '',
    supplierId: undefined,
    paymentMode: 'cash',
    cashAmount: '',
    transferAmount: '',
    notes: ''
  });
  const [purchasePayments, setPurchasePayments] = useState<Array<{
    id: string;
    method: 'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente';
    amount: number | '';
  }>>([
    { id: 'purch_pay_0', method: 'Efectivo', amount: '' }
  ]);
  const [purchaseStep, setPurchaseStep] = useState<1 | 2>(1);
  const [selectedPurchaseRubro, setSelectedPurchaseRubro] = useState<ProductCategory | null>(null);
  const [purchaseRubroSearch, setPurchaseRubroSearch] = useState('');
  const [isPurchaseRubroDropdownOpen, setIsPurchaseRubroDropdownOpen] = useState(false);

  const [selectedPurchaseConcept, setSelectedPurchaseConcept] = useState<Product | null>(null);
  const [purchaseConceptSearch, setPurchaseConceptSearch] = useState('');
  const [isPurchaseConceptDropdownOpen, setIsPurchaseConceptDropdownOpen] = useState(false);

  const rubroDropdownRef = useRef<HTMLDivElement>(null);
  const conceptDropdownRef = useRef<HTMLDivElement>(null);
  const [isSupplierSuggestionsOpen, setIsSupplierSuggestionsOpen] = useState(false);
  const [isRegisteringPurchase, setIsRegisteringPurchase] = useState(false);

  // Selected product for Detail Bottom Sheet
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Stock Adjustment inline modal inside detail
  const [isAdjustStockOpen, setIsAdjustStockOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<'restock' | 'adjustment'>('restock');
  const [adjustQuantity, setAdjustQuantity] = useState<number | string>(1);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isSavingStock, setIsSavingStock] = useState(false);

  // Product movements history
  const [productMovements, setProductMovements] = useState<InventoryMovement[]>([]);

  // Real-time subscriptions
  useEffect(() => {
    if (!isOpen) return;

    const unsubCats = subscribeToInventoryCategories(targetId, (cats) => {
      setCategories(cats);
    });

    const unsubProds = subscribeToProducts(targetId, (prods) => {
      setProducts(prods);
      // Keep selected product in sync if open
      if (selectedProduct) {
        const updated = prods.find(p => p.id === selectedProduct.id);
        if (updated) setSelectedProduct(updated);
      }
    });

    const unsubExpCats = subscribeToExpenseCategories(targetId, (expCats) => {
      setExpenseCategories(expCats);
    });

    const unsubExpItems = subscribeToExpenseItems(targetId, (expIts) => {
      setExpenseItems(expIts);
    });

    return () => {
      unsubCats();
      unsubProds();
      unsubExpCats();
      unsubExpItems();
    };
  }, [targetId, isOpen, selectedProduct?.id]);

  // Subscribe to movements of currently viewed product
  useEffect(() => {
    if (!selectedProduct?.id) {
      setProductMovements([]);
      return;
    }

    const unsubMovs = subscribeToProductMovements(selectedProduct.id, (movs) => {
      setProductMovements(movs);
    });

    return () => unsubMovs();
  }, [selectedProduct?.id]);

  // Reset tab and category context when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab('categories');
      setSelectedCategory(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Products filtered by selected category if any, or search query
  const displayedProducts = useMemo(() => {
    let list = products;
    if (selectedCategory) {
      list = list.filter(p => p.categoryId === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.categoryId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, selectedCategory, searchQuery]);

  // Count products by category
  const productCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach(cat => {
      counts[cat] = products.filter(p => p.categoryId === cat).length;
    });
    return counts;
  }, [categories, products]);

  const normalizeFilterText = (text: string) =>
    (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rubroDropdownRef.current && !rubroDropdownRef.current.contains(e.target as Node)) {
        setIsPurchaseRubroDropdownOpen(false);
      }
      if (conceptDropdownRef.current && !conceptDropdownRef.current.contains(e.target as Node)) {
        setIsPurchaseConceptDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasInitializedEditProductRubroRef = useRef(false);

  // Preseleccionar de manera predeterminada el último rubro usado solo una vez por apertura, y solo si existe preferencia válida
  useEffect(() => {
    if (!isProductModalOpen || editProductSubTab !== 'compras') {
      hasInitializedEditProductRubroRef.current = false;
      return;
    }
    if (!hasInitializedEditProductRubroRef.current && expenseCategories.length > 0) {
      hasInitializedEditProductRubroRef.current = true;
      try {
        const lastRubroName = localStorage.getItem('jogo_last_purchase_rubro');
        if (lastRubroName) {
          const match = expenseCategories.find(r => r.name.toLowerCase() === lastRubroName.toLowerCase() && r.status !== 'inactivo');
          if (match) {
            setSelectedPurchaseRubro(match);
            setPurchaseRubroSearch(match.name);
          }
        }
      } catch {}
    }
  }, [isProductModalOpen, editProductSubTab, expenseCategories]);

  const activeExpenseRubros = useMemo(() => {
    return expenseCategories.filter(r => r.status !== 'inactivo');
  }, [expenseCategories]);

  const filteredPurchaseRubros = useMemo(() => {
    const q = normalizeFilterText(purchaseRubroSearch);
    if (!q) return activeExpenseRubros;
    return activeExpenseRubros.filter(r => normalizeFilterText(r.name).includes(q));
  }, [activeExpenseRubros, purchaseRubroSearch]);

  const activeExpenseConcepts = useMemo(() => {
    return expenseItems.filter(c => c.status !== 'inactivo');
  }, [expenseItems]);

  const filteredPurchaseConcepts = useMemo(() => {
    let list = activeExpenseConcepts;
    if (selectedPurchaseRubro) {
      list = list.filter(c => 
        (c.categoryId && normalizeFilterText(c.categoryId) === normalizeFilterText(selectedPurchaseRubro.name)) ||
        (c.categoryName && normalizeFilterText(c.categoryName) === normalizeFilterText(selectedPurchaseRubro.name)) ||
        c.categoryId === selectedPurchaseRubro.id
      );
    }
    const q = normalizeFilterText(purchaseConceptSearch);
    if (!q) return list;
    return list.filter(c => {
      const nameMatch = normalizeFilterText(c.name).includes(q);
      const catMatch = normalizeFilterText(c.categoryName || c.categoryId || '').includes(q);
      return nameMatch || catMatch;
    });
  }, [activeExpenseConcepts, selectedPurchaseRubro, purchaseConceptSearch]);

  const handleSelectPurchaseRubro = (rubro: ProductCategory) => {
    setSelectedPurchaseRubro(rubro);
    setPurchaseRubroSearch(rubro.name);
    try {
      localStorage.setItem('jogo_last_purchase_rubro', rubro.name);
    } catch {}
    setIsPurchaseRubroDropdownOpen(false);
    if (selectedPurchaseConcept) {
      const conceptCat = selectedPurchaseConcept.categoryName || selectedPurchaseConcept.categoryId || '';
      if (normalizeFilterText(conceptCat) !== normalizeFilterText(rubro.name) && selectedPurchaseConcept.categoryId !== rubro.id) {
        setSelectedPurchaseConcept(null);
        setPurchaseConceptSearch('');
        setPurchaseForm(prev => ({ ...prev, purchasePlace: '', supplierId: undefined }));
      } else {
        setPurchaseForm(prev => ({ ...prev, purchasePlace: `${rubro.name} - ${selectedPurchaseConcept.name}` }));
      }
    }
  };

  const handleClearPurchaseRubro = () => {
    setSelectedPurchaseRubro(null);
    setPurchaseRubroSearch('');
    setIsPurchaseRubroDropdownOpen(false);
    if (selectedPurchaseConcept) {
      setPurchaseForm(prev => ({ ...prev, purchasePlace: selectedPurchaseConcept.name }));
    } else {
      setPurchaseForm(prev => ({ ...prev, purchasePlace: '', supplierId: undefined }));
    }
  };

  const handleSelectPurchaseConcept = (concept: Product) => {
    setSelectedPurchaseConcept(concept);
    setPurchaseConceptSearch(concept.name);
    setIsPurchaseConceptDropdownOpen(false);

    let rubroNameToUse = selectedPurchaseRubro?.name || '';
    const catName = concept.categoryName || concept.categoryId;
    if (catName) {
      const matched = expenseCategories.find(r => 
        normalizeFilterText(r.name) === normalizeFilterText(catName) || r.id === concept.categoryId
      );
      if (matched) {
        setSelectedPurchaseRubro(matched);
        setPurchaseRubroSearch(matched.name);
        rubroNameToUse = matched.name;
        try {
          localStorage.setItem('jogo_last_purchase_rubro', matched.name);
        } catch {}
      } else {
        setSelectedPurchaseRubro({
          id: concept.categoryId || catName,
          complejoId: targetId,
          name: catName,
          status: 'activo',
          catalogType: 'expense'
        });
        setPurchaseRubroSearch(catName);
        rubroNameToUse = catName;
        try {
          localStorage.setItem('jogo_last_purchase_rubro', catName);
        } catch {}
      }
    }

    const placeVal = rubroNameToUse ? `${rubroNameToUse} - ${concept.name}` : concept.name;
    setPurchaseForm(prev => ({
      ...prev,
      purchasePlace: placeVal,
      supplierId: concept.id
    }));

    const conceptPrice = Number(concept.purchasePrice || concept.price || 0);
    if (conceptPrice > 0 && (!purchaseForm.unitCost || Number(purchaseForm.unitCost) === 0)) {
      setPurchaseForm(prev => ({ ...prev, unitCost: conceptPrice }));
    }
  };

  const handleOpenAddRubroFromPurchase = () => {
    setEditingExpenseCat({
      name: purchaseRubroSearch.trim(),
      status: 'activo'
    });
    setIsExpenseCatModalOpen(true);
  };

  const handleOpenAddConceptFromPurchase = () => {
    const defaultRubro = selectedPurchaseRubro?.name || (expenseCategories.find(r => r.status !== 'inactivo')?.name) || expenseCategories[0]?.name || 'Proveedores';
    setEditingExpenseItem({
      name: purchaseConceptSearch.trim(),
      categoryId: defaultRubro,
      price: '',
      status: 'activo'
    });
    setIsExpenseItemModalOpen(true);
  };

  // Handlers for Categories
  const handleCreateCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newCategoryName.trim();
    if (!clean) return;

    if (categories.some(c => c.toLowerCase() === clean.toLowerCase())) {
      return; // Already exists
    }

    const updated = [...categories, clean];
    await saveInventoryCategories(targetId, updated);
    setNewCategoryName('');
    setIsCategoryModalOpen(false);
  };

  // Handlers for Products
  const handleOpenCreateProduct = (cat?: string) => {
    const targetCat = cat || selectedCategory || (categories.length > 0 ? categories[0] : '');
    setProductModalMode('create');
    setEditProductSubTab('datos');
    setProductForm({
      name: '',
      categoryId: targetCat,
      stock: 10,
      purchasePrice: '',
      salePrice: '',
      status: 'activo'
    });
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setProductModalMode('edit');
    setEditProductSubTab('datos');
    setProductForm({
      id: prod.id,
      name: prod.name,
      categoryId: prod.categoryId,
      stock: prod.stock,
      purchasePrice: prod.purchasePrice,
      salePrice: prod.salePrice,
      status: prod.status || 'activo'
    });

    const initUnitCost = Number(prod.purchasePrice || 0);
    const initQty = 10;
    const initTotal = initUnitCost * initQty;

    // Cargar de manera predeterminada el último rubro usado solo si existe preferencia válida
    let defaultRubro: ProductCategory | null = null;
    try {
      const lastRubroName = localStorage.getItem('jogo_last_purchase_rubro');
      if (lastRubroName) {
        defaultRubro = expenseCategories.find(r => r.name.toLowerCase() === lastRubroName.toLowerCase() && r.status !== 'inactivo') || null;
      }
    } catch {}

    if (defaultRubro) {
      setSelectedPurchaseRubro(defaultRubro);
      setPurchaseRubroSearch(defaultRubro.name);
    } else {
      setSelectedPurchaseRubro(null);
      setPurchaseRubroSearch('');
    }
    hasInitializedEditProductRubroRef.current = true;
    setIsPurchaseRubroDropdownOpen(false);

    setSelectedPurchaseConcept(null);
    setPurchaseConceptSearch('');
    setIsPurchaseConceptDropdownOpen(false);

    setPurchaseForm({
      quantity: initQty,
      unitCost: initUnitCost > 0 ? initUnitCost : '',
      purchasePlace: '',
      paymentMode: 'cash',
      cashAmount: initTotal > 0 ? initTotal : '',
      transferAmount: '',
      notes: ''
    });

    setPurchaseStep(1);
    setIsProductModalOpen(true);
  };

  const isProductFormValid = useMemo(() => {
    return (
      productForm.name.trim().length > 0 &&
      productForm.categoryId.trim().length > 0 &&
      productForm.salePrice !== '' &&
      Number(productForm.salePrice) >= 0 &&
      productForm.stock !== '' &&
      Number(productForm.stock) >= 0
    );
  }, [productForm]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProductFormValid) return;

    const payload: Partial<Product> = {
      ...(productForm.id ? { id: productForm.id } : {}),
      name: productForm.name.trim(),
      categoryId: productForm.categoryId.trim(),
      categoryName: productForm.categoryId.trim(),
      stock: Number(productForm.stock),
      purchasePrice: Number(productForm.purchasePrice || 0),
      salePrice: Number(productForm.salePrice),
      status: productForm.status
    };

    const savedId = await saveProductInFirestore(targetId, payload);
    setIsProductModalOpen(false);

    // If currently viewing detail of this product, update it smoothly
    if (selectedProduct && selectedProduct.id === savedId) {
      setSelectedProduct({
        ...selectedProduct,
        ...payload,
        id: savedId
      } as Product);
    }
    showToast('Producto actualizado exitosamente');
  };

  // Handler for Confirm Purchase of Merchandise with unified mixed payments
  const totalPurchaseComputed = useMemo(() => {
    const q = Math.floor(Number(purchaseForm.quantity) || 0);
    const c = Math.max(0, Number(purchaseForm.unitCost) || 0);
    return q * c;
  }, [purchaseForm.quantity, purchaseForm.unitCost]);

  useEffect(() => {
    if (purchasePayments.length <= 1) {
      setPurchasePayments([
        {
          id: purchasePayments[0]?.id || `purch_pay_${Date.now()}`,
          method: purchasePayments[0]?.method || 'Efectivo',
          amount: totalPurchaseComputed > 0 ? totalPurchaseComputed : ''
        }
      ]);
    }
  }, [totalPurchaseComputed]);

  const totalAssignedPurchasePayments = useMemo(() => {
    return purchasePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [purchasePayments]);

  const purchaseDiff = totalAssignedPurchasePayments - totalPurchaseComputed;
  const isPurchaseSobra = totalPurchaseComputed > 0 && purchaseDiff > 0.01;
  const isPurchaseFalta = totalPurchaseComputed > 0 && purchaseDiff < -0.01;
  const purchaseSobrante = Math.max(0, purchaseDiff);
  const purchaseFaltante = Math.max(0, -purchaseDiff);
  const isPurchaseMathExact = totalPurchaseComputed > 0 && Math.abs(purchaseDiff) < 0.01;

  const totalPaidComputed = useMemo(() => {
    return purchasePayments
      .filter(p => p.method !== 'Pendiente')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [purchasePayments]);

  const amountPendingComputed = Math.max(0, totalPurchaseComputed - totalPaidComputed);

  const handleAddNewPurchasePaymentMethod = (methodToUse?: 'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente') => {
    const available: Array<'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente'> = ['Efectivo', 'Transferencia', 'Crédito', 'Pendiente'];
    let selMethod = methodToUse;
    if (!selMethod) {
      selMethod = available.find(m => !purchasePayments.some(p => p.method === m)) || 'Transferencia';
    }
    const newAmt = purchaseFaltante > 0 ? purchaseFaltante : 0;
    setPurchasePayments(prev => [
      ...prev,
      { id: `purch_pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, method: selMethod!, amount: newAmt }
    ]);
  };

  const handleChangePurchaseBlockMethod = (index: number, newMethod: 'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente') => {
    setPurchasePayments(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], method: newMethod };
      }
      return copy;
    });
  };

  const handleRemovePurchasePaymentBlock = (id: string) => {
    if (purchasePayments.length <= 1) return;
    setPurchasePayments(prev => prev.filter(p => p.id !== id));
  };

  const handleAutocorrectPurchaseSobrante = () => {
    if (purchasePayments.length === 1) {
      setPurchasePayments([{ ...purchasePayments[0], amount: totalPurchaseComputed }]);
    } else {
      setPurchasePayments(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        const curAmt = Number(last.amount) || 0;
        copy[copy.length - 1] = { ...last, amount: Math.max(0, curAmt - purchaseSobrante) };
        return copy;
      });
    }
  };

  const handleProceedPurchaseToPayment = () => {
    const qty = Math.floor(Number(purchaseForm.quantity));
    if (isNaN(qty) || qty <= 0) {
      alert('La cantidad a comprar debe ser un número entero mayor a 0.');
      return;
    }
    const cost = Number(purchaseForm.unitCost);
    if (isNaN(cost) || cost <= 0) {
      alert('El costo unitario debe ser mayor a 0.');
      return;
    }
    const tot = qty * cost;
    if (purchasePayments.length === 0 || (purchasePayments.length === 1 && (!purchasePayments[0].amount || purchasePayments[0].amount === 0))) {
      setPurchasePayments([{ id: `purch_p_${Date.now()}`, method: 'Efectivo', amount: tot }]);
    }
    setPurchaseStep(2);
  };

  const handleConfirmPurchase = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedProduct) return;

    const qty = Math.floor(Number(purchaseForm.quantity));
    if (isNaN(qty) || qty <= 0) {
      alert('La cantidad a comprar debe ser un número entero mayor a 0.');
      return;
    }
    const cost = Number(purchaseForm.unitCost);
    if (isNaN(cost) || cost < 0) {
      alert('El costo unitario debe ser mayor o igual a 0.');
      return;
    }

    if (!isPurchaseMathExact) {
      alert(isPurchaseFalta
        ? `Faltan $${purchaseFaltante.toLocaleString()} por asignar para completar el total de la compra ($${totalPurchaseComputed.toLocaleString()}).`
        : `Los importes asignados ($${totalAssignedPurchasePayments.toLocaleString()}) superan el total de la compra ($${totalPurchaseComputed.toLocaleString()}).`
      );
      return;
    }

    setIsRegisteringPurchase(true);
    try {
      const mapMethod = (m: string): FinancialPaymentMethod => {
        const lower = m.toLowerCase();
        if (lower.includes('efectivo') || lower === 'cash') return 'cash';
        if (lower.includes('transf') || lower === 'transfer') return 'transfer';
        if (lower.includes('tarjeta') || lower.includes('crédito') || lower.includes('credit')) return 'credit';
        return 'cash';
      };

      const paidPayments = purchasePayments
        .filter(p => p.method !== 'Pendiente' && (Number(p.amount) || 0) > 0)
        .map(p => ({
          amount: Number(p.amount),
          paymentMethod: mapMethod(p.method),
          notes: `Pago compra (${p.method}) · ${purchaseForm.purchasePlace.trim() || 'Mayorista'}`
        }));

      if (selectedPurchaseRubro?.name) {
        const isValid = expenseCategories.some(r => r.name.toLowerCase() === selectedPurchaseRubro.name.toLowerCase() && r.status !== 'inactivo');
        if (isValid) {
          try {
            localStorage.setItem('jogo_last_purchase_rubro', selectedPurchaseRubro.name);
          } catch {}
        }
      }

      const result = await registerMerchandisePurchaseInFirestore({
        complexId: targetId,
        productId: selectedProduct.id,
        quantity: qty,
        unitCost: cost,
        purchasePlace: purchaseForm.purchasePlace.trim() || 'Mayorista',
        supplierId: purchaseForm.supplierId,
        expenseCategoryId: selectedPurchaseRubro?.id,
        expenseCategoryName: selectedPurchaseRubro?.name,
        expenseConceptId: selectedPurchaseConcept?.id,
        expenseConceptName: selectedPurchaseConcept?.name,
        payments: paidPayments,
        operatorId: 'admin_mostrador',
        notes: purchaseForm.notes.trim() || undefined
      });

      // Play purchase confirmation audio sound
      playPurchaseSound();

      // Show toast
      showToast(`¡Compra registrada! Stock aumentado a ${result.newStock} u.`);

      // Update selected product state directly
      setSelectedProduct({
        ...selectedProduct,
        stock: result.newStock,
        purchasePrice: cost,
        batches: result.batches
      });

      // Close edit modal, stay on product detail sheet
      setIsProductModalOpen(false);
    } catch (err: any) {
      console.error('Error registrando compra:', err);
      alert(err.message || 'Error al registrar la compra.');
    } finally {
      setIsRegisteringPurchase(false);
    }
  };

  // Stock manual adjustment handler from Detail sheet
  const handleConfirmStockAdjustment = async () => {
    if (!selectedProduct) return;
    const qty = Number(adjustQuantity);
    if (isNaN(qty) || qty <= 0) return;

    setIsSavingStock(true);
    try {
      const delta = adjustType === 'restock' ? qty : -qty;
      const typeLabel = adjustType === 'restock' ? 'Reposición de stock' : 'Ajuste manual';
      const notes = adjustReason.trim() || (adjustType === 'restock' ? 'Reposición' : 'Ajuste de inventario');

      const newStock = await adjustProductStockInFirestore({
        complexId: targetId,
        productId: selectedProduct.id,
        delta,
        type: adjustType,
        typeLabel,
        notes,
        actorName: 'Administrador'
      });

      setSelectedProduct({
        ...selectedProduct,
        stock: newStock
      });

      setIsAdjustStockOpen(false);
      setAdjustQuantity(1);
      setAdjustReason('');
      showToast('Ajuste de inventario guardado');
    } catch (e: any) {
      console.error('Error adjusting stock:', e);
      alert(e.message || 'Error al ajustar stock');
    } finally {
      setIsSavingStock(false);
    }
  };

  // Helper to format movement date/time
  const formatMovementDate = (dateStr: string, timeStr: string, createdAt?: any) => {
    if (!dateStr) return 'Reciente';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const movementDate = new Date(y, m - 1, d);
      const timePart = timeStr ? ` · ${timeStr}` : '';
      if (isToday(movementDate)) {
        return `Hoy${timePart}`;
      }
      return `${d}/${m}/${y}${timePart}`;
    } catch {
      return `${dateStr}${timeStr ? ` · ${timeStr}` : ''}`;
    }
  };

  // Expense Handlers
  const handleSaveExpenseCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpenseCat || !editingExpenseCat.name.trim()) return;
    try {
      const cleanName = editingExpenseCat.name.trim();
      const savedId = await saveExpenseCategoryInFirestore(targetId, {
        id: editingExpenseCat.id,
        name: cleanName,
        oldName: editingExpenseCat.oldName,
        status: editingExpenseCat.status || 'activo'
      });
      setIsExpenseCatModalOpen(false);
      setEditingExpenseCat(null);
      showToast('Categoría de gasto guardada');

      // Auto-seleccionar si el modal de producto y pestaña de compras están activos
      if (isProductModalOpen && editProductSubTab === 'compras') {
        const newRubro: ProductCategory = {
          id: savedId,
          complejoId: targetId,
          name: cleanName,
          status: editingExpenseCat.status || 'activo',
          catalogType: 'expense'
        };
        setSelectedPurchaseRubro(newRubro);
        setPurchaseRubroSearch(cleanName);
        try {
          localStorage.setItem('jogo_last_purchase_rubro', cleanName);
        } catch {}

        if (selectedPurchaseConcept) {
          const conceptCat = selectedPurchaseConcept.categoryName || selectedPurchaseConcept.categoryId || '';
          if (normalizeFilterText(conceptCat) !== normalizeFilterText(cleanName) && selectedPurchaseConcept.categoryId !== savedId) {
            setSelectedPurchaseConcept(null);
            setPurchaseConceptSearch('');
            setPurchaseForm(prev => ({ ...prev, purchasePlace: '', supplierId: undefined }));
          } else {
            setPurchaseForm(prev => ({ ...prev, purchasePlace: `${cleanName} - ${selectedPurchaseConcept.name}` }));
          }
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Error al guardar categoría');
    }
  };

  const handleToggleExpenseCatStatus = async (cat: ProductCategory) => {
    try {
      const newStatus = cat.status === 'inactivo' ? 'activo' : 'inactivo';
      await toggleExpenseCategoryStatus(cat.id, newStatus);
      showToast(`Categoría ${newStatus === 'activo' ? 'activada' : 'desactivada'}`);
    } catch (err: any) {
      showToast('Error al cambiar estado de categoría');
    }
  };

  const handleDeleteExpenseCat = async (catId: string) => {
    try {
      const res = await deleteExpenseCategoryInFirestore(catId, targetId);
      if (res.status === 'deleted') {
        showToast('Categoría eliminada de Firestore');
      } else {
        showToast('Categoría desactivada de forma segura para preservar historial');
      }
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar categoría');
    }
  };

  const handleSaveExpenseItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpenseItem || !editingExpenseItem.name.trim() || !editingExpenseItem.categoryId) return;
    try {
      const cleanName = editingExpenseItem.name.trim();
      const cleanCat = editingExpenseItem.categoryId.trim();
      const savedPrice = Number(editingExpenseItem.price || 0);

      const savedId = await saveExpenseItemInFirestore(targetId, {
        id: editingExpenseItem.id,
        name: cleanName,
        categoryId: cleanCat,
        categoryName: cleanCat,
        price: savedPrice,
        status: editingExpenseItem.status || 'activo'
      });
      setIsExpenseItemModalOpen(false);
      setEditingExpenseItem(null);
      showToast('Concepto de gasto guardado');

      // Auto-seleccionar si el modal de producto y pestaña de compras están activos
      if (isProductModalOpen && editProductSubTab === 'compras') {
        const newConcept: Product = {
          id: savedId,
          complejoId: targetId,
          name: cleanName,
          categoryId: cleanCat,
          categoryName: cleanCat,
          purchasePrice: savedPrice,
          salePrice: savedPrice,
          stock: 0,
          status: editingExpenseItem.status || 'activo',
          catalogType: 'expense'
        };
        setSelectedPurchaseConcept(newConcept);
        setPurchaseConceptSearch(cleanName);

        // Auto-asignar rubro si no estaba seleccionado o es diferente
        const matched = expenseCategories.find(r => 
          normalizeFilterText(r.name) === normalizeFilterText(cleanCat) || r.id === cleanCat
        );
        if (matched) {
          setSelectedPurchaseRubro(matched);
          setPurchaseRubroSearch(matched.name);
          try {
            localStorage.setItem('jogo_last_purchase_rubro', matched.name);
          } catch {}
        } else {
          setSelectedPurchaseRubro({
            id: cleanCat,
            complejoId: targetId,
            name: cleanCat,
            status: 'activo',
            catalogType: 'expense'
          });
          setPurchaseRubroSearch(cleanCat);
          try {
            localStorage.setItem('jogo_last_purchase_rubro', cleanCat);
          } catch {}
        }

        const placeVal = cleanCat ? `${cleanCat} - ${cleanName}` : cleanName;
        setPurchaseForm(prev => ({
          ...prev,
          purchasePlace: placeVal,
          supplierId: savedId,
          unitCost: (savedPrice > 0 && (!prev.unitCost || Number(prev.unitCost) === 0)) ? savedPrice : prev.unitCost
        }));
      }
    } catch (err: any) {
      showToast(err.message || 'Error al guardar concepto');
    }
  };

  const handleToggleExpenseItemStatus = async (item: Product) => {
    try {
      const newStatus = item.status === 'inactivo' ? 'activo' : 'inactivo';
      await toggleExpenseItemStatus(item.id, newStatus);
      showToast(`Concepto ${newStatus === 'activo' ? 'activado' : 'desactivado'}`);
    } catch (err: any) {
      showToast('Error al cambiar estado del concepto');
    }
  };

  const handleDeleteExpenseItem = async (itemId: string) => {
    try {
      const res = await deleteExpenseItemInFirestore(itemId, targetId);
      if (res.status === 'deleted') {
        showToast('Concepto eliminado de Firestore');
      } else {
        showToast('Concepto desactivado de forma segura para preservar historial');
      }
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar concepto');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        {/* Backdrop general */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs"
        />

        {/* Toast Notifier minimalista en parte superior */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-2xl bg-slate-900/90 text-white text-xs font-bold shadow-xl border border-slate-700/60 flex items-center gap-2 backdrop-blur-md"
            >
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Sheet Principal (Editar Mostrador) */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-h-[92vh] bg-white dark:bg-slate-900 rounded-t-[2.5rem] shadow-2xl border-t border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden z-10"
        >
          {/* Drag handle */}
          <div className="w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
          </div>

          {/* Top Bar: Navigation & Title */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedCategory ? (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} />
                  <span>Volver a Categorías</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                    <Store size={18} />
                  </div>
                  <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                    Editar Mostrador
                  </h2>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar Mostrador"
            >
              <X size={20} />
            </button>
          </div>

          {/* Context Banner if inside a category */}
          {selectedCategory ? (
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Categoría</span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {selectedCategory}
                </h3>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                {displayedProducts.length} {displayedProducts.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
          ) : (
            /* Main Segmented Switcher: Categorías | Productos | Gastos */
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl flex-1 min-w-[280px] max-w-md">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('categories');
                    setSelectedCategory(null);
                  }}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer text-center",
                    activeTab === 'categories'
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  )}
                >
                  Categorías
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('products');
                    setSelectedCategory(null);
                  }}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer text-center",
                    activeTab === 'products'
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  )}
                >
                  Productos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('expenses');
                    setSelectedCategory(null);
                  }}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer text-center",
                    activeTab === 'expenses'
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  )}
                >
                  Gastos
                </button>
              </div>

              {activeTab === 'products' && (
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              )}
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto px-5 py-4 pb-28 space-y-3">
            {/* 1. Vista "Categorías" */}
            {activeTab === 'categories' && !selectedCategory && (
              <>
                {categories.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                      <Tag size={28} />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                        Todavía no hay categorías
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                        Creá tu primera categoría para comenzar a agregar productos.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(true)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/10 flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <Plus size={16} />
                      <span>Crear primera categoría</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {categories.map((cat) => {
                      const count = productCountByCategory[cat] || 0;
                      return (
                        <div
                          key={`cat-item-${cat}`}
                          onClick={() => setSelectedCategory(cat)}
                          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm active:scale-[0.99] transition-all flex items-center justify-between cursor-pointer group"
                        >
                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-white text-base">
                              {cat}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {count} {count === 1 ? 'producto' : 'productos'}
                            </p>
                          </div>
                          <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:text-emerald-600 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/40 flex items-center justify-center transition-colors">
                            <ChevronRight size={18} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* 2. Vista "Productos" */}
            {(selectedCategory || activeTab === 'products') && (
              <>
                {displayedProducts.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                      <Package size={28} />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                        No hay productos
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                        {selectedCategory 
                          ? `Aún no agregaste productos a la categoría "${selectedCategory}".`
                          : 'No se encontraron productos registrados.'}
                      </p>
                    </div>
                    {categories.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => setIsCategoryModalOpen(true)}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md"
                      >
                        <Plus size={16} />
                        <span>Crear categoría primero</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenCreateProduct(selectedCategory || undefined)}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md"
                      >
                        <Plus size={16} />
                        <span>Agregar primer producto</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displayedProducts.map((prod) => {
                      const cost = Number(prod.purchasePrice || 0);
                      const sale = Number(prod.salePrice || 0);
                      const marginMonetary = sale - cost;

                      return (
                        <div
                          key={`prod-card-${prod.id}`}
                          onClick={() => setSelectedProduct(prod)}
                          className="p-4 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer group"
                        >
                          <div className="grid grid-cols-2 gap-4 items-center">
                            {/* Lado izquierdo */}
                            <div className="space-y-2">
                              <div>
                                <h4 className="font-bold text-slate-900 dark:text-white text-base leading-tight truncate">
                                  {prod.name}
                                </h4>
                                {!selectedCategory && (
                                  <span className="text-[11px] font-semibold text-slate-400 truncate block mt-0.5">
                                    {prod.categoryId}
                                  </span>
                                )}
                              </div>

                              <div className="space-y-1 text-xs">
                                <div className="text-slate-500 dark:text-slate-400">
                                  Costo
                                </div>
                                <div className="text-slate-500 dark:text-slate-400">
                                  Venta
                                </div>
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  Margen
                                </div>
                              </div>
                            </div>

                            {/* Lado derecho */}
                            <div className="space-y-2 text-right">
                              <div>
                                <span className={cn(
                                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold",
                                  prod.stock > 0
                                    ? "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                    : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                                )}>
                                  {prod.stock} unidades
                                </span>
                              </div>

                              <div className="space-y-1 text-xs font-mono">
                                <div className="text-slate-800 dark:text-slate-200 font-medium">
                                  ${cost.toLocaleString()}
                                </div>
                                <div className="text-slate-900 dark:text-white font-bold">
                                  ${sale.toLocaleString()}
                                </div>
                                <div className={cn(
                                  "font-bold",
                                  marginMonetary >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                                )}>
                                  ${marginMonetary.toLocaleString()}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* 3. Vista "Gastos" (Configurar Rubros y Conceptos de Gastos) */}
            {activeTab === 'expenses' && (
              <div className="pb-16">
                <CatalogInventorySection complexId={targetId} initialTab="expenses" hideTopTabs={true} />
              </div>
            )}
          </div>

          {/* Floating Action Button (FAB): Bottom Right Corner (para Categorías y Productos de Venta) */}
          {activeTab !== 'expenses' && (
            <div className="absolute right-5 bottom-5 z-20">
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'categories' && !selectedCategory) {
                    setIsCategoryModalOpen(true);
                  } else {
                    handleOpenCreateProduct(selectedCategory || undefined);
                  }
                }}
                className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-xl shadow-emerald-950/30 flex items-center justify-center transition-all cursor-pointer group"
                title={
                  activeTab === 'categories' && !selectedCategory
                    ? 'Nueva categoría de productos'
                    : 'Agregar producto'
                }
              >
                <Plus size={24} className="group-hover:rotate-90 transition-transform duration-200" />
              </button>
            </div>
          )}
        </motion.div>

        {/* Modal: Nueva Categoría de Producto */}
        <AnimatePresence>
          {isCategoryModalOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsCategoryModalOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 z-10 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Nueva categoría
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsCategoryModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleCreateCategory} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Nombre de categoría
                    </label>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Ej. Bebidas, Snacks, Indumentaria"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!newCategoryName.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-900/10 transition-all cursor-pointer"
                    >
                      Crear
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal: Categoría de Gasto */}
        <AnimatePresence>
          {isExpenseCatModalOpen && editingExpenseCat && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsExpenseCatModalOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 z-10 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {editingExpenseCat.id ? 'Editar rubro de gasto' : 'Nuevo rubro de gasto'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsExpenseCatModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveExpenseCat} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Nombre del rubro *
                    </label>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Ej. Servicios, Mantenimiento, Proveedores"
                      value={editingExpenseCat.name}
                      onChange={(e) => setEditingExpenseCat({ ...editingExpenseCat, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Estado *
                    </label>
                    <select
                      value={editingExpenseCat.status || 'activo'}
                      onChange={(e) => setEditingExpenseCat({ ...editingExpenseCat, status: e.target.value as 'activo' | 'inactivo' })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsExpenseCatModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!editingExpenseCat.name.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer"
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal: Concepto de Gasto */}
        <AnimatePresence>
          {isExpenseItemModalOpen && editingExpenseItem && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsExpenseItemModalOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 z-10 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {editingExpenseItem.id ? 'Editar concepto de gasto' : 'Nuevo concepto de gasto'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsExpenseItemModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveExpenseItem} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Rubro *
                    </label>
                    <select
                      value={editingExpenseItem.categoryId}
                      onChange={(e) => setEditingExpenseItem({ ...editingExpenseItem, categoryId: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      {expenseCategories.map(c => (
                        <option key={`opt-exp-c-${c.id}`} value={c.name}>
                          {c.name} {c.status === 'inactivo' ? '(Inactivo)' : ''}
                        </option>
                      ))}
                      {editingExpenseItem.categoryId && !expenseCategories.some(c => c.name === editingExpenseItem.categoryId) && (
                        <option value={editingExpenseItem.categoryId}>
                          {editingExpenseItem.categoryId}
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Nombre del concepto *
                    </label>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Ej. Factura de Luz, Limpieza, Reparación"
                      value={editingExpenseItem.name}
                      onChange={(e) => setEditingExpenseItem({ ...editingExpenseItem, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Importe predefinido ($ opcional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={editingExpenseItem.price}
                      onChange={(e) => setEditingExpenseItem({ ...editingExpenseItem, price: e.target.value === '' ? '' : Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Estado *
                    </label>
                    <select
                      value={editingExpenseItem.status || 'activo'}
                      onChange={(e) => setEditingExpenseItem({ ...editingExpenseItem, status: e.target.value as 'activo' | 'inactivo' })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsExpenseItemModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!editingExpenseItem.name.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer"
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ------------------------------------------------------------- */}
        {/* 9. Detalle del Producto (Bottom Sheet) - Capa z-[60]          */}
        {/* Permanece montado cuando se abre la tarjeta de edición por encima */}
        {/* ------------------------------------------------------------- */}
        <AnimatePresence>
          {selectedProduct && (
            <div className="fixed inset-0 z-[60] flex flex-col justify-end">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedProduct(null)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-h-[88vh] bg-white dark:bg-slate-900 rounded-t-[2.5rem] shadow-2xl border-t border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden z-10"
              >
                {/* Drag handle */}
                <div className="w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
                  <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                </div>

                {/* Encabezado: Nombre destacado, Categoría debajo en gris */}
                <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                      {selectedProduct.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                      {selectedProduct.categoryId}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEditProduct(selectedProduct)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Edit3 size={14} />
                      <span>Editar producto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Body: Desplazable internamente */}
                <div className="p-6 overflow-y-auto space-y-6 pb-20">
                  {/* Resumen financiero del producto: Costo | Venta | Margen */}
                  {(() => {
                    const cost = Number(selectedProduct.purchasePrice || 0);
                    const sale = Number(selectedProduct.salePrice || 0);
                    const margin = sale - cost;
                    const marginPct = sale > 0 ? ((sale - cost) / sale) * 100 : 0;

                    return (
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Costo
                          </span>
                          <span className="text-base font-black text-slate-900 dark:text-white font-mono mt-1 block">
                            ${cost.toLocaleString()}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Precio de venta
                          </span>
                          <span className="text-base font-black text-slate-900 dark:text-white font-mono mt-1 block">
                            ${sale.toLocaleString()}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Margen
                          </span>
                          <span className={cn(
                            "text-base font-black font-mono mt-1 block",
                            margin >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          )}>
                            ${margin.toLocaleString()}
                          </span>
                          <span className={cn(
                            "text-[10px] font-bold",
                            margin >= 0
                              ? "text-emerald-600/80 dark:text-emerald-400/80"
                              : "text-red-500"
                          )}>
                            {marginPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Stock actual & Acciones rápidas de ajuste manual */}
                  <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">
                          Stock físico actual
                        </span>
                        <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                          {selectedProduct.stock} <span className="text-sm font-medium text-slate-500 dark:text-slate-400">unidades</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustType('restock');
                            setAdjustQuantity(1);
                            setAdjustReason('');
                            setIsAdjustStockOpen(true);
                          }}
                          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
                        >
                          + Ajuste físico
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustType('adjustment');
                            setAdjustQuantity(1);
                            setAdjustReason('');
                            setIsAdjustStockOpen(true);
                          }}
                          className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          − Retirar
                        </button>
                      </div>
                    </div>

                    {/* Stock adjustment inline form */}
                    {isAdjustStockOpen && (
                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {adjustType === 'restock' ? 'Ajuste de stock (+)' : 'Ajuste manual de retiro (−)'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsAdjustStockOpen(false)}
                            className="text-slate-400 hover:text-slate-600 text-xs"
                          >
                            Cancelar
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-500 font-bold block mb-1">
                              Cantidad
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={adjustQuantity}
                              onChange={(e) => setAdjustQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 font-bold block mb-1">
                              Motivo / Nota
                            </label>
                            <input
                              type="text"
                              placeholder={adjustType === 'restock' ? 'Ej. Conteo físico' : 'Ej. Merma o rotura'}
                              value={adjustReason}
                              onChange={(e) => setAdjustReason(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isSavingStock || !adjustQuantity || Number(adjustQuantity) <= 0}
                          onClick={handleConfirmStockAdjustment}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          {isSavingStock ? 'Guardando...' : 'Confirmar ajuste físico'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ------------------------------------------------------------- */}
                  {/* SECCIÓN TANDAS DE INVENTARIO PEPS (ACTIVAS quantity > 0)       */}
                  {/* ------------------------------------------------------------- */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers size={16} className="text-emerald-600" />
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                          Tandas de Inventario (PEPS)
                        </h4>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">
                        Primero en entrar, primero en salir
                      </span>
                    </div>

                    {(() => {
                      const activeBatches = (Array.isArray(selectedProduct.batches) ? selectedProduct.batches : [])
                        .filter(b => Number(b.quantity || 0) > 0)
                        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

                      if (activeBatches.length === 0) {
                        return (
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800">
                            {selectedProduct.stock > 0 ? (
                              <span>Stock disponible sin tandas discriminadas. En la próxima compra se crearán tandas automáticas.</span>
                            ) : (
                              <span>Sin stock activo ni tandas disponibles.</span>
                            )}
                          </div>
                        );
                      }

                      const salePrice = Number(selectedProduct.salePrice || 0);

                      return (
                        <div className="space-y-2.5">
                          {activeBatches.map((batch, bIdx) => {
                            const unitCost = Number(batch.unitCost || 0);
                            const unitGrossProfit = salePrice - unitCost;
                            const marginPercent = salePrice > 0 ? (unitGrossProfit / salePrice) * 100 : 0;
                            const isPositive = unitGrossProfit >= 0;

                            return (
                              <div
                                key={`batch-card-${batch.id || bIdx}`}
                                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black flex items-center justify-center font-mono">
                                      {bIdx + 1}
                                    </span>
                                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                                      {batch.purchasePlace || 'Proveedor'}
                                    </span>
                                    {bIdx === 0 && (
                                      <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[9px] font-black uppercase tracking-wider">
                                        Próxima a salir
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-right">
                                    <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                                      {batch.quantity} {batch.quantity === 1 ? 'unidad' : 'unidades'}
                                    </span>
                                    {batch.initialQuantity !== undefined && batch.initialQuantity !== batch.quantity && (
                                      <span className="text-[10px] text-slate-400 block font-mono">
                                        de {batch.initialQuantity}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 text-[11px] font-mono">
                                  <div>
                                    <span className="text-slate-400 text-[10px] block font-sans">Costo unitario</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">
                                      ${unitCost.toLocaleString()}
                                    </span>
                                  </div>

                                  <div>
                                    <span className="text-slate-400 text-[10px] block font-sans">Ganancia bruta</span>
                                    <span className={cn("font-bold", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                                      {isPositive ? `+$${unitGrossProfit.toLocaleString()}` : `-$${Math.abs(unitGrossProfit).toLocaleString()}`}
                                    </span>
                                  </div>

                                  <div className="text-right">
                                    <span className="text-slate-400 text-[10px] block font-sans">Margen %</span>
                                    <span className={cn("font-bold", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                                      {marginPercent.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Historial de movimientos de inventario */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">
                      Historial de movimientos
                    </h4>

                    {productMovements.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400">
                        Aún no hay movimientos de inventario registrados para este producto.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {productMovements.map((mov) => {
                          const isPositive = mov.quantity > 0;
                          return (
                            <div
                              key={`mov-${mov.id}`}
                              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "font-black font-mono",
                                    isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                                  )}>
                                    {isPositive ? `+${mov.quantity}` : `${mov.quantity}`} {Math.abs(mov.quantity) === 1 ? 'unidad' : 'unidades'}
                                  </span>
                                  <span className="text-slate-400">·</span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {mov.typeLabel}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {formatMovementDate(mov.date, mov.time, mov.createdAt)}
                                  {mov.actorName && ` · Por ${mov.actorName}`}
                                </div>
                                {mov.notes && (
                                  <p className="text-[10px] text-slate-500 italic mt-0.5">
                                    {mov.notes}
                                  </p>
                                )}
                              </div>

                              <div className="text-right shrink-0">
                                {mov.resultingStock !== undefined && (
                                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    Stock: {mov.resultingStock}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ------------------------------------------------------------- */}
        {/* MODAL: Nuevo Producto o Editar Producto con Tabs Datos/Compras  */}
        {/* Capa z-[70]: Se superpone por encima del Detalle z-[60]      */}
        {/* ------------------------------------------------------------- */}
        <AnimatePresence>
          {isProductModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsProductModalOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 z-10 space-y-4 max-h-[92vh] overflow-y-auto"
              >
                {/* Header modal */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      {productModalMode === 'create' ? 'Nuevo producto' : `Editar: ${productForm.name || 'Producto'}`}
                    </h3>
                    {productModalMode === 'edit' && (
                      <p className="text-[11px] text-slate-400 font-medium">
                        Administrá la ficha técnica o registrá reposiciones con PEPS
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Sub-tabs en modo edición: Datos | Compras (Navegable por touch/clic y swipe) */}
                {productModalMode === 'edit' && (
                  <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setEditProductSubTab('datos')}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-1.5",
                        editProductSubTab === 'datos'
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                      )}
                    >
                      <Package size={14} />
                      <span>Datos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditProductSubTab('compras')}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-1.5",
                        editProductSubTab === 'compras'
                          ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                      )}
                    >
                      <ShoppingBag size={14} />
                      <span>Compras</span>
                    </button>
                  </div>
                )}

                {/* Contenido con soporte de gesto swipe horizontal */}
                <motion.div
                  drag={productModalMode === 'edit' ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.15}
                  onDragEnd={(e, info) => {
                    if (productModalMode !== 'edit') return;
                    if (info.offset.x < -40 && editProductSubTab === 'datos') {
                      setEditProductSubTab('compras');
                    } else if (info.offset.x > 40 && editProductSubTab === 'compras') {
                      setEditProductSubTab('datos');
                    }
                  }}
                  className="touch-pan-y"
                >
                  {/* SECCIÓN 1: DATOS GENERALES DEL PRODUCTO */}
                  {(productModalMode === 'create' || editProductSubTab === 'datos') && (
                    <form onSubmit={handleSaveProduct} className="space-y-4">
                      {/* Nombre */}
                      <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Nombre del producto *
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Coca-Cola 500 ml"
                          value={productForm.name}
                          onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>

                      {/* Categoría */}
                      <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Categoría *
                        </label>
                        {categories.length > 0 ? (
                          <select
                            value={productForm.categoryId}
                            onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                          >
                            {categories.map((c) => (
                              <option key={`opt-cat-prod-${c}`} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="Categoría"
                            value={productForm.categoryId}
                            onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                          />
                        )}
                      </div>

                      {/* Precio de venta general */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Precio de venta general ($) *
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Ej. 1500"
                            value={productForm.salePrice}
                            onChange={(e) => setProductForm({ ...productForm, salePrice: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>

                        {/* Unidades de stock físico (Ajuste físico de inventario, sin movimiento de dinero) */}
                        <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Unidades de stock físico *
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={productForm.stock}
                            onChange={(e) => setProductForm({ ...productForm, stock: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      {productModalMode === 'create' && (
                        <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Costo inicial unitario ($)
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Ej. 800"
                            value={productForm.purchasePrice}
                            onChange={(e) => setProductForm({ ...productForm, purchasePrice: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                      )}

                      {/* Estado: Activo / Inactivo */}
                      <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Estado del producto
                        </label>
                        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setProductForm({ ...productForm, status: 'activo' })}
                            className={cn(
                              "py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
                              productForm.status === 'activo'
                                ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                            )}
                          >
                            Activo
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductForm({ ...productForm, status: 'inactivo' })}
                            className={cn(
                              "py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
                              productForm.status === 'inactivo'
                                ? "bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs"
                                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                            )}
                          >
                            Inactivo
                          </button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setIsProductModalOpen(false)}
                          className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={!isProductFormValid}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-900/10 transition-all cursor-pointer"
                        >
                          {productModalMode === 'create' ? 'Agregar producto' : 'Guardar datos'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* SECCIÓN 2: COMPRAS DE MERCADERÍA (REPOSICIONES Y TANDAS PEPS EN 2 PASOS) */}
                  {productModalMode === 'edit' && editProductSubTab === 'compras' && (
                    <div className="space-y-4">
                      {purchaseStep === 1 ? (
                        /* PASO 1: SELECCIONAR QUÉ COMPRA SE REALIZA (CANTIDAD, COSTO, PROVEEDOR) */
                        <div className="space-y-4">
                          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300">
                            Cada compra ingresa como una nueva tanda PEPS, actualiza el stock, registra el egreso y guarda saldos a pagar si corresponde.
                          </div>

                          {/* Unidades compradas y Costo por unidad */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Unidades compradas *
                              </label>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={purchaseForm.quantity}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : Math.max(1, Math.floor(Number(e.target.value)));
                                  setPurchaseForm((prev) => ({
                                    ...prev,
                                    quantity: val
                                  }));
                                }}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Costo por unidad ($) *
                              </label>
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={purchaseForm.unitCost}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                                  setPurchaseForm((prev) => ({
                                    ...prev,
                                    unitCost: val
                                  }));
                                }}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </div>
                          </div>

                          {/* Selector 1: Rubro de Gastos */}
                          <div className="relative" ref={rubroDropdownRef}>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <span>Rubro</span>
                                {selectedPurchaseRubro ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md">
                                    <span>{selectedPurchaseRubro.name}</span>
                                    <button
                                      type="button"
                                      onClick={handleClearPurchaseRubro}
                                      className="hover:text-red-500 cursor-pointer ml-0.5"
                                      title="Quitar rubro seleccionado"
                                    >
                                      <X size={11} />
                                    </button>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    (Sin seleccionar)
                                  </span>
                                )}
                              </label>
                              <button
                                type="button"
                                onClick={handleOpenAddRubroFromPurchase}
                                className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                                title="Crear nuevo rubro de gastos"
                              >
                                <Plus size={13} className="stroke-[3]" />
                                <span>+ Rubro</span>
                              </button>
                            </div>

                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Elegir o buscar «Rubro» (ej. Proveedores, Bebidas)..."
                                value={purchaseRubroSearch}
                                onFocus={() => setIsPurchaseRubroDropdownOpen(true)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPurchaseRubroSearch(val);
                                  setIsPurchaseRubroDropdownOpen(true);
                                  if (!val) {
                                    setSelectedPurchaseRubro(null);
                                    if (selectedPurchaseConcept) {
                                      setPurchaseForm(prev => ({ ...prev, purchasePlace: selectedPurchaseConcept.name }));
                                    } else {
                                      setPurchaseForm(prev => ({ ...prev, purchasePlace: '', supplierId: undefined }));
                                    }
                                  }
                                }}
                                className="w-full px-3.5 py-2.5 pr-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                              {purchaseRubroSearch ? (
                                <button
                                  type="button"
                                  onClick={handleClearPurchaseRubro}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                  title="Limpiar búsqueda y quitar rubro"
                                >
                                  <X size={14} />
                                </button>
                              ) : (
                                <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              )}
                            </div>

                            {/* Dropdown Rubros */}
                            {isPurchaseRubroDropdownOpen && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
                                {filteredPurchaseRubros.length > 0 ? (
                                  filteredPurchaseRubros.map((r) => {
                                    const isSelected = selectedPurchaseRubro?.id === r.id;
                                    return (
                                      <button
                                        key={`purch-bs-rubro-${r.id}`}
                                        type="button"
                                        onClick={() => handleSelectPurchaseRubro(r)}
                                        className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-slate-700/80 transition-colors cursor-pointer ${
                                          isSelected ? 'bg-emerald-50/70 dark:bg-slate-700 font-bold text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'
                                        }`}
                                      >
                                        <span>{r.name}</span>
                                        {isSelected && <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-400">
                                    <p className="mb-1.5">No se encontraron rubros con "{purchaseRubroSearch}".</p>
                                    <button
                                      type="button"
                                      onClick={handleOpenAddRubroFromPurchase}
                                      className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Plus size={12} />
                                      <span>Crear "{purchaseRubroSearch}" como Rubro</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Selector 2: Concepto de Gasto / Proveedor */}
                          <div className="relative" ref={conceptDropdownRef}>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <span>Concepto</span>
                                {selectedPurchaseConcept && (
                                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md">
                                    {selectedPurchaseConcept.categoryName || selectedPurchaseConcept.categoryId}
                                  </span>
                                )}
                              </label>
                              <button
                                type="button"
                                onClick={handleOpenAddConceptFromPurchase}
                                className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                                title="Crear nuevo concepto de gastos"
                              >
                                <Plus size={13} className="stroke-[3]" />
                                <span>+ Agregar concepto</span>
                              </button>
                            </div>

                            <div className="relative">
                              <input
                                type="text"
                                placeholder={selectedPurchaseRubro ? `Elegir o buscar «Concepto» en ${selectedPurchaseRubro.name}...` : "Elegir o buscar «Concepto» (ej. Cervecería Quilmes, Distribuidora)..."}
                                value={purchaseConceptSearch}
                                onFocus={() => setIsPurchaseConceptDropdownOpen(true)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPurchaseConceptSearch(val);
                                  setPurchaseForm(prev => ({ ...prev, purchasePlace: val }));
                                  setIsPurchaseConceptDropdownOpen(true);
                                  if (!val) {
                                    setSelectedPurchaseConcept(null);
                                  }
                                }}
                                className="w-full px-3.5 py-2.5 pr-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                              {purchaseConceptSearch ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPurchaseConcept(null);
                                    setPurchaseConceptSearch('');
                                    setPurchaseForm(prev => ({ ...prev, purchasePlace: '', supplierId: undefined }));
                                  }}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  <X size={14} />
                                </button>
                              ) : (
                                <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              )}
                            </div>

                            {/* Dropdown Conceptos */}
                            {isPurchaseConceptDropdownOpen && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
                                {filteredPurchaseConcepts.length > 0 ? (
                                  filteredPurchaseConcepts.map((c) => {
                                    const isSelected = selectedPurchaseConcept?.id === c.id;
                                    const price = Number(c.purchasePrice || c.price || 0);
                                    return (
                                      <button
                                        key={`purch-bs-concept-${c.id}`}
                                        type="button"
                                        onClick={() => handleSelectPurchaseConcept(c)}
                                        className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-slate-700/80 transition-colors cursor-pointer ${
                                          isSelected ? 'bg-emerald-50/70 dark:bg-slate-700 font-bold text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'
                                        }`}
                                      >
                                        <div className="flex flex-col">
                                          <span>{c.name}</span>
                                          <span className="text-[10px] text-slate-400">
                                            {c.categoryName || c.categoryId} {price > 0 ? `· $${price.toLocaleString()}` : ''}
                                          </span>
                                        </div>
                                        {isSelected && <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-400">
                                    <p className="mb-1.5">No se encontraron conceptos con "{purchaseConceptSearch}".</p>
                                    <button
                                      type="button"
                                      onClick={handleOpenAddConceptFromPurchase}
                                      className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Plus size={12} />
                                      <span>Crear "{purchaseConceptSearch}" como Concepto</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Resumen previo de compra */}
                          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-300">
                              Total de la compra:
                            </span>
                            <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                              ${totalPurchaseComputed.toLocaleString()}
                            </span>
                          </div>

                          {/* Actions Paso 1 */}
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => {
                                setIsProductModalOpen(false);
                                setPurchaseStep(1);
                              }}
                              className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleProceedPurchaseToPayment}
                              disabled={totalPurchaseComputed <= 0}
                              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-900/10 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <span>Continuar al Pago</span>
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* PASO 2: REGISTRAR EL PAGO DE LA COMPRA (PAGOS MIXTOS) */
                        <form onSubmit={handleConfirmPurchase} className="space-y-4">
                          {/* Resumen reactivo de la compra */}
                          <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800/40 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                                  Total a Pagar · Compra
                                </span>
                                <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono">
                                  ${totalPurchaseComputed.toLocaleString()}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate max-w-[160px]">
                                  {productForm.name}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500">
                                  {purchaseForm.quantity} u. x ${Number(purchaseForm.unitCost || 0).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                              <span>Proveedor: <strong className="text-slate-900 dark:text-white">{purchaseForm.purchasePlace.trim() || 'Mayorista'}</strong></span>
                              <span className="font-mono text-slate-500">
                                Asignado: ${totalAssignedPurchasePayments.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Atajos Rápidos */}
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setPurchasePayments([{ id: `purch_p_${Date.now()}`, method: 'Efectivo', amount: totalPurchaseComputed }]);
                              }}
                              className="py-1.5 px-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors text-center cursor-pointer"
                            >
                              100% Efectivo
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPurchasePayments([{ id: `purch_p_${Date.now()}`, method: 'Transferencia', amount: totalPurchaseComputed }]);
                              }}
                              className="py-1.5 px-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors text-center cursor-pointer"
                            >
                              100% Transf.
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPurchasePayments([{ id: `purch_p_${Date.now()}`, method: 'Pendiente', amount: totalPurchaseComputed }]);
                              }}
                              className="py-1.5 px-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 transition-colors text-center cursor-pointer"
                            >
                              100% Pendiente
                            </button>
                          </div>

                          {/* Distribución de Medios de Pago */}
                          <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                                Distribución de Medios de Pago
                              </label>
                              <span className="text-[11px] font-mono text-slate-400">
                                Asignado: ${totalAssignedPurchasePayments.toLocaleString()} / ${totalPurchaseComputed.toLocaleString()}
                              </span>
                            </div>

                            {/* Filas de pago */}
                            <div className="space-y-2">
                              {purchasePayments.map((p, idx) => (
                                <div
                                  key={`purch-pay-row-${p.id}`}
                                  className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {(['Efectivo', 'Transferencia', 'Crédito', 'Pendiente'] as const).map((m) => {
                                        const isSelected = p.method === m;
                                        const isPend = m === 'Pendiente';
                                        return (
                                          <button
                                            key={`purch-btn-${p.id}-${m}`}
                                            type="button"
                                            onClick={() => handleChangePurchaseBlockMethod(idx, m)}
                                            className={cn(
                                              "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                                              isSelected
                                                ? isPend
                                                  ? "bg-amber-600 text-white shadow-2xs"
                                                  : "bg-emerald-600 text-white shadow-2xs"
                                                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                                            )}
                                          >
                                            {m}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    {purchasePayments.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemovePurchasePaymentBlock(p.id)}
                                        className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer shrink-0"
                                        title="Eliminar método"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between gap-3 pt-1">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPurchasePayments(prev => {
                                            const copy = [...prev];
                                            copy[idx] = { ...copy[idx], amount: totalPurchaseComputed };
                                            return copy;
                                          });
                                        }}
                                        className="text-[11px] font-bold text-slate-400 hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
                                      >
                                        Total
                                      </button>

                                      {purchaseFaltante > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPurchasePayments(prev => {
                                              const copy = [...prev];
                                              const cur = Number(copy[idx].amount) || 0;
                                              copy[idx] = { ...copy[idx], amount: cur + purchaseFaltante };
                                              return copy;
                                            });
                                          }}
                                          className="text-[11px] font-black text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                                        >
                                          Restante: ${purchaseFaltante.toLocaleString()}
                                        </button>
                                      )}
                                    </div>

                                    <div className="relative w-36 sm:w-40">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                                      <input
                                        type="number"
                                        min="0"
                                        placeholder={String(totalPurchaseComputed)}
                                        value={p.amount}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setPurchasePayments(prev => {
                                            const copy = [...prev];
                                            copy[idx] = { ...copy[idx], amount: val === '' ? '' : Number(val) };
                                            return copy;
                                          });
                                        }}
                                        className="w-full h-9 pl-6 pr-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-black text-slate-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Sobran / Faltan */}
                            {isPurchaseSobra && (
                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={handleAutocorrectPurchaseSobrante}
                                  className="text-xs font-black text-emerald-600 hover:underline cursor-pointer flex items-center gap-1"
                                >
                                  <span>Sobran ${purchaseSobrante.toLocaleString()}</span>
                                  <span className="text-[10px] text-slate-400 font-normal">(Tocar para autocorregir)</span>
                                </button>
                              </div>
                            )}

                            {isPurchaseFalta && (
                              <div className="flex items-center justify-between pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleAddNewPurchasePaymentMethod()}
                                  className="text-xs font-black text-amber-600 hover:text-amber-700 cursor-pointer"
                                >
                                  <span>Faltan ${purchaseFaltante.toLocaleString()}</span>
                                  <span className="text-[10px] text-slate-400 font-normal underline ml-1">(Tocar para autocompletar)</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleAddNewPurchasePaymentMethod()}
                                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus size={13} />
                                  <span>Dividir pago</span>
                                </button>
                              </div>
                            )}

                            {isPurchaseMathExact && purchasePayments.length < 4 && (
                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleAddNewPurchasePaymentMethod()}
                                  className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus size={13} />
                                  <span>Dividir con otro medio</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Actions Paso 2 */}
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => setPurchaseStep(1)}
                              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <ChevronLeft size={16} />
                              <span>Volver</span>
                            </button>
                            <button
                              type="submit"
                              disabled={isRegisteringPurchase || !isPurchaseMathExact}
                              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-900/10 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              {isRegisteringPurchase ? (
                                <span>Registrando...</span>
                              ) : (
                                <>
                                  <Check size={16} />
                                  <span>Confirmar compra · ${totalPurchaseComputed.toLocaleString()}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </AnimatePresence>
  );
};
