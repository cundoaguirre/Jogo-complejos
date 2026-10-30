import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
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
  ChevronDown,
  Wallet,
  Landmark,
  CircleDollarSign,
  History,
  GripVertical,
  RefreshCw,
  User as UserIcon,
  FileText
} from 'lucide-react';
import type { Product, ProductCategory, InventoryMovement, ProductBatch, FinancialPaymentMethod, ExpenseEntity, ExpenseEntityType } from '../types';
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
  registerMerchandisePurchaseInFirestore,
  subscribeToExpenseEntities,
  saveExpenseEntityInFirestore,
  toggleExpenseEntityStatus,
  deleteExpenseEntityInFirestore
} from '../lib/firestoreSync';
import { playPurchaseSound } from '../lib/posAudio';
import { cn } from '../lib/utils';
import { isToday } from 'date-fns';
import { CatalogInventorySection } from './CatalogInventorySection';

interface MostradorBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  complexId: string;
  mode?: 'mostrador' | 'gastos';
}

export const MostradorBottomSheet: React.FC<MostradorBottomSheetProps> = ({
  isOpen,
  onClose,
  complexId,
  mode = 'mostrador'
}) => {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;

  // View state: 'categories' | 'products' | 'expenses'
  const [activeTab, setActiveTab] = useState<'categories' | 'products' | 'expenses'>(mode === 'gastos' ? 'expenses' : 'categories');

  useEffect(() => {
    if (isOpen) {
      if (mode === 'gastos') {
        setActiveTab('expenses');
        setExpenseSubTab('rubros_conceptos');
      } else {
        setActiveTab('categories');
      }
      setSelectedCategory(null);
    }
  }, [isOpen, mode]);
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

  // Expense Modals & 3-Dimension Architecture states
  const [isExpenseCatModalOpen, setIsExpenseCatModalOpen] = useState(false);
  const [editingExpenseCat, setEditingExpenseCat] = useState<{ id?: string; name: string; oldName?: string; status?: 'activo' | 'inactivo' } | null>(null);
  const [isExpenseItemModalOpen, setIsExpenseItemModalOpen] = useState(false);
  const [editingExpenseItem, setEditingExpenseItem] = useState<{ id?: string; name: string; categoryId: string; price: number | ''; status?: 'activo' | 'inactivo' } | null>(null);
  const [expenseCatFilter, setExpenseCatFilter] = useState<'all' | 'active'>('active');

  // Rediseño Gastos: 3 Dimensiones (Rubros y conceptos | Entidad)
  const [expenseSubTab, setExpenseSubTab] = useState<'rubros_conceptos' | 'entidades'>('rubros_conceptos');
  const [expenseEntities, setExpenseEntities] = useState<ExpenseEntity[]>([]);
  const [selectedRubroPill, setSelectedRubroPill] = useState<string>('total');
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [entitySearchQuery, setEntitySearchQuery] = useState('');

  // Entity Modal state
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [entityModalMode, setEntityModalMode] = useState<'create' | 'edit'>('create');
  const [entityForm, setEntityForm] = useState<{
    id?: string;
    name: string;
    type: ExpenseEntityType;
    location: string;
    cuit: string;
    phone: string;
    email: string;
    notes: string;
    status: 'activo' | 'inactivo';
  }>({
    name: '',
    type: 'Empresa',
    location: '',
    cuit: '',
    phone: '',
    email: '',
    notes: '',
    status: 'activo'
  });
  const [entityFormError, setEntityFormError] = useState<string | null>(null);
  const [isSavingEntity, setIsSavingEntity] = useState(false);

  // Concept Modal state
  const [isConceptModalOpen, setIsConceptModalOpen] = useState(false);
  const [conceptModalMode, setConceptModalMode] = useState<'create' | 'edit'>('create');
  const [conceptForm, setConceptForm] = useState<{
    id?: string;
    name: string;
    categoryId: string;
    price: number | '';
    status: 'activo' | 'inactivo';
  }>({
    name: '',
    categoryId: '',
    price: '',
    status: 'activo'
  });
  const [conceptFormError, setConceptFormError] = useState<string | null>(null);
  const [isSavingConcept, setIsSavingConcept] = useState(false);

  // Rubros Manager Modal state
  const [isRubrosManagerOpen, setIsRubrosManagerOpen] = useState(false);
  const [newRubroNameInput, setNewRubroNameInput] = useState('');
  const [editingRubroId, setEditingRubroId] = useState<string | null>(null);
  const [editingRubroName, setEditingRubroName] = useState('');
  const [rubroManagerError, setRubroManagerError] = useState<string | null>(null);

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

  // Selector de Entidad para Compra de Mercadería (Arquitectura de 3 Dimensiones)
  const [selectedPurchaseEntity, setSelectedPurchaseEntity] = useState<ExpenseEntity | null>(null);
  const [purchaseEntitySearch, setPurchaseEntitySearch] = useState('');
  const [isPurchaseEntityDropdownOpen, setIsPurchaseEntityDropdownOpen] = useState(false);
  const entityPurchaseDropdownRef = useRef<HTMLDivElement>(null);

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

    const unsubEntities = subscribeToExpenseEntities(targetId, (ents) => {
      setExpenseEntities(ents);
    });

    return () => {
      unsubCats();
      unsubProds();
      unsubExpCats();
      unsubExpItems();
      unsubEntities();
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
      if (entityPurchaseDropdownRef.current && !entityPurchaseDropdownRef.current.contains(e.target as Node)) {
        setIsPurchaseEntityDropdownOpen(false);
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

  const activeExpenseEntities = useMemo(() => {
    return expenseEntities.filter(e => e.status !== 'inactivo');
  }, [expenseEntities]);

  const filteredPurchaseEntities = useMemo(() => {
    const q = purchaseEntitySearch.trim().toLowerCase();
    if (!q) return activeExpenseEntities;
    return activeExpenseEntities.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.cuit && e.cuit.includes(q)) ||
      (e.phone && e.phone.includes(q)) ||
      (e.type && e.type.toLowerCase().includes(q))
    );
  }, [activeExpenseEntities, purchaseEntitySearch]);

  const handleSelectPurchaseEntity = (ent: ExpenseEntity) => {
    setSelectedPurchaseEntity(ent);
    setPurchaseEntitySearch(ent.name);
    setIsPurchaseEntityDropdownOpen(false);
  };

  const handleClearPurchaseEntity = () => {
    setSelectedPurchaseEntity(null);
    setPurchaseEntitySearch('');
    setIsPurchaseEntityDropdownOpen(false);
  };

  const handleOpenAddEntityFromPurchase = () => {
    setEntityForm({
      id: undefined,
      name: purchaseEntitySearch.trim(),
      type: 'Empresa',
      location: '',
      cuit: '',
      phone: '',
      email: '',
      notes: '',
      status: 'activo'
    });
    setEntityFormError(null);
    setEntityModalMode('create');
    setIsEntityModalOpen(true);
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
      stock: 0,
      purchasePrice: 0,
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

    setSelectedPurchaseEntity(null);
    setPurchaseEntitySearch('');
    setIsPurchaseEntityDropdownOpen(false);

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
      Number(productForm.salePrice) >= 0
    );
  }, [productForm]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProductFormValid) return;

    const finalStock = productModalMode === 'create'
      ? 0
      : (selectedProduct?.id === productForm.id ? selectedProduct.stock : Number(productForm.stock || 0));
    const finalPurchasePrice = productModalMode === 'create'
      ? 0
      : Number(productForm.purchasePrice || selectedProduct?.purchasePrice || 0);

    const payload: Partial<Product> = {
      ...(productForm.id ? { id: productForm.id } : {}),
      name: productForm.name.trim(),
      categoryId: productForm.categoryId.trim(),
      categoryName: productForm.categoryId.trim(),
      stock: finalStock,
      purchasePrice: finalPurchasePrice,
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
    showToast(productModalMode === 'create' ? 'Producto creado exitosamente' : 'Producto actualizado exitosamente');
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

  const hasPurchasePendingPayment = useMemo(() => {
    return purchasePayments.some(p => p.method === 'Pendiente' && (Number(p.amount) || 0) > 0);
  }, [purchasePayments]);

  const isPurchaseEntityBlocked = hasPurchasePendingPayment && !selectedPurchaseEntity;
  const canConfirmPurchase = totalPurchaseComputed > 0 && !isPurchaseFalta && !isPurchaseEntityBlocked;
  const canFinalizePurchase = canConfirmPurchase;

  // Estados para pantalla y sub-bottom sheet de pago de compras (idéntico a gastos/reservas/mostrador)
  const [deletePurchaseMenuRowId, setDeletePurchaseMenuRowId] = useState<string | null>(null);
  const [isPurchasePaymentSheetOpen, setIsPurchasePaymentSheetOpen] = useState(false);
  const [editingPurchasePaymentIndex, setEditingPurchasePaymentIndex] = useState<number | null>(null);
  const [orderedPurchaseMethods, setOrderedPurchaseMethods] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('jogo_payment_methods_order');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map((m: string) =>
              m === 'Fiado' ? 'Pendiente' : (m === 'Crédito' || m === 'Credito') ? 'Tarjeta' : m
            );
            const defs = ['Efectivo', 'Transferencia', 'Tarjeta', 'Pendiente'];
            defs.forEach(d => {
              if (!normalized.includes(d)) normalized.push(d);
            });
            return Array.from(new Set(normalized));
          }
        }
      } catch (e) {}
    }
    return ['Efectivo', 'Transferencia', 'Tarjeta', 'Pendiente'];
  });

  useEffect(() => {
    const handleOrderChange = () => {
      try {
        const saved = localStorage.getItem('jogo_payment_methods_order');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map((m: string) =>
              m === 'Fiado' ? 'Pendiente' : (m === 'Crédito' || m === 'Credito') ? 'Tarjeta' : m
            );
            const defs = ['Efectivo', 'Transferencia', 'Tarjeta', 'Pendiente'];
            defs.forEach(d => {
              if (!normalized.includes(d)) normalized.push(d);
            });
            const newOrder = Array.from(new Set(normalized));
            setOrderedPurchaseMethods(newOrder);
            setPurchasePayments(prev => prev.length === 1 ? [{ ...prev[0], method: newOrder[0] as any || 'Efectivo' }] : prev);
          }
        }
      } catch (e) {}
    };
    window.addEventListener('jogo_payment_methods_order_changed', handleOrderChange);
    return () => window.removeEventListener('jogo_payment_methods_order_changed', handleOrderChange);
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => {
      setDeletePurchaseMenuRowId(null);
    };
    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('touchstart', handleGlobalClick);
    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('touchstart', handleGlobalClick);
    };
  }, []);

  // Category rename modal state
  const [isRenameCategoryModalOpen, setIsRenameCategoryModalOpen] = useState(false);
  const [categoryToRename, setCategoryToRename] = useState<string>('');
  const [newRenamedCategoryTitle, setNewRenamedCategoryTitle] = useState<string>('');

  const handleOpenRenameCategory = (cat: string) => {
    setCategoryToRename(cat);
    setNewRenamedCategoryTitle(cat);
    setIsRenameCategoryModalOpen(true);
  };

  const handleSaveRenameCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRenamedCategoryTitle.trim();
    if (!clean || clean === categoryToRename) {
      setIsRenameCategoryModalOpen(false);
      return;
    }
    const updated = categories.map(c => c === categoryToRename ? clean : c);
    await saveInventoryCategories(targetId, updated);
    const affected = products.filter(p => p.categoryId === categoryToRename);
    for (const p of affected) {
      await saveProductInFirestore(targetId, { ...p, categoryId: clean, categoryName: clean });
    }
    if (selectedCategory === categoryToRename) {
      setSelectedCategory(clean);
    }
    setIsRenameCategoryModalOpen(false);
    showToast('Categoría actualizada');
  };

  // Historial de movimientos acordeón con persistencia
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem('jogo_product_history_expanded');
      return val !== null ? val === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleToggleHistory = () => {
    setIsHistoryExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem('jogo_product_history_expanded', String(next));
      } catch {}
      return next;
    });
  };

  const formatMovementDateShort = (dateStr: string, createdAt?: any) => {
    try {
      let d: Date | null = null;
      if (createdAt?.toDate) d = createdAt.toDate();
      else if (createdAt?.seconds) d = new Date(createdAt.seconds * 1000);
      else if (dateStr) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else {
          d = new Date(dateStr);
        }
      }
      if (!d || isNaN(d.getTime())) return dateStr || 'Reciente';
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      return `${d.getDate()} de ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return dateStr || 'Reciente';
    }
  };

  const getBatchOrdinalLabel = (idx: number) => {
    const ordinals = [
      'Primera en salir',
      'Segunda en salir',
      'Tercera en salir',
      'Cuarta en salir',
      'Quinta en salir',
      'Sexta en salir',
      'Séptima en salir',
      'Octava en salir',
      'Novena en salir',
      'Décima en salir'
    ];
    return ordinals[idx] || `${idx + 1}ª en salir`;
  };

  const handleSavePurchaseMethodsOrder = (newOrder: string[]) => {
    setOrderedPurchaseMethods(newOrder);
    try {
      localStorage.setItem('jogo_payment_methods_order', JSON.stringify(newOrder));
      window.dispatchEvent(new Event('jogo_payment_methods_order_changed'));
    } catch (e) {}
    setPurchasePayments(prev => prev.length === 1 ? [{ ...prev[0], method: newOrder[0] as any || 'Efectivo' }] : prev);
  };
  const purchaseSheetDragControls = useDragControls();

  const renderPurchaseMethodIcon = (method: string) => {
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
    const defaultMethod = (orderedPurchaseMethods[0] as any) || 'Efectivo';
    if (purchasePayments.length === 0 || (purchasePayments.length === 1 && (!purchasePayments[0].amount || purchasePayments[0].amount === 0))) {
      setPurchasePayments([{ id: `purch_p_${Date.now()}`, method: defaultMethod, amount: tot }]);
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

    if (isPurchaseEntityBlocked) {
      alert('Debés asignar una entidad para registrar un saldo pendiente.');
      return;
    }

    if (isPurchaseFalta) {
      alert(`Faltan $${purchaseFaltante.toLocaleString()} por asignar para completar el total de la compra ($${totalPurchaseComputed.toLocaleString()}).`);
      return;
    }

    // Si sobra dinero y hay efectivo, autocorregir deduciendo el sobrante del efectivo
    if (isPurchaseSobra) {
      const cashIdx = purchasePayments.findIndex(p => p.method === 'Efectivo');
      if (cashIdx >= 0) {
        const curCash = Number(purchasePayments[cashIdx].amount) || 0;
        purchasePayments[cashIdx].amount = Math.max(0, curCash - purchaseSobrante);
      } else {
        const last = purchasePayments[purchasePayments.length - 1];
        last.amount = Math.max(0, (Number(last.amount) || 0) - purchaseSobrante);
      }
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
        supplierId: selectedPurchaseEntity?.id || purchaseForm.supplierId,
        expenseCategoryId: selectedPurchaseRubro?.id,
        expenseCategoryName: selectedPurchaseRubro?.name,
        expenseConceptId: selectedPurchaseConcept?.id,
        expenseConceptName: selectedPurchaseConcept?.name || purchaseForm.purchasePlace.trim(),
        entityId: selectedPurchaseEntity?.id || null,
        entityName: selectedPurchaseEntity?.name || null,
        entityType: selectedPurchaseEntity?.type || null,
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

      setSelectedPurchaseEntity(null);
      setPurchaseEntitySearch('');

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

  // Helper for WhatsApp links
  const getWhatsAppUrl = (phone?: string) => {
    if (!phone) return '#';
    const clean = phone.replace(/\D/g, '');
    if (!clean) return '#';
    if (clean.length === 10 && !clean.startsWith('54')) {
      return `https://wa.me/549${clean}`;
    }
    if (clean.startsWith('54') && !clean.startsWith('549') && clean.length === 12) {
      return `https://wa.me/549${clean.slice(2)}`;
    }
    return `https://wa.me/${clean}`;
  };

  // Helper for Entity Type badge classes
  const getEntityTypeBadgeClass = (type?: ExpenseEntityType | string) => {
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
      default:
        return 'bg-[#ef4444] text-white';
    }
  };

  // Concept Handlers
  const handleOpenCreateConcept = () => {
    const firstCat = expenseCategories.find(c => c.status !== 'inactivo')?.name || expenseCategories[0]?.name || 'Servicios';
    setConceptForm({
      name: '',
      categoryId: selectedRubroPill !== 'total' ? selectedRubroPill : firstCat,
      price: '',
      status: 'activo'
    });
    setConceptModalMode('create');
    setConceptFormError(null);
    setIsConceptModalOpen(true);
  };

  const handleOpenEditConcept = (concept: Product) => {
    setConceptForm({
      id: concept.id,
      name: concept.name,
      categoryId: concept.categoryName || concept.categoryId || '',
      price: Number(concept.purchasePrice || concept.price || 0) || '',
      status: concept.status || 'activo'
    });
    setConceptModalMode('edit');
    setConceptFormError(null);
    setIsConceptModalOpen(true);
  };

  const handleSaveConceptForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conceptForm.name.trim()) {
      setConceptFormError('El nombre del concepto es obligatorio.');
      return;
    }
    if (!conceptForm.categoryId.trim()) {
      setConceptFormError('Debes seleccionar o asignar un rubro.');
      return;
    }
    setIsSavingConcept(true);
    setConceptFormError(null);
    try {
      await saveExpenseItemInFirestore(targetId, {
        id: conceptForm.id,
        name: conceptForm.name.trim(),
        categoryId: conceptForm.categoryId.trim(),
        categoryName: conceptForm.categoryId.trim(),
        price: Number(conceptForm.price || 0),
        status: conceptForm.status
      });
      setIsConceptModalOpen(false);
      showToast(conceptForm.id ? 'Concepto actualizado' : 'Concepto creado exitosamente');
    } catch (err: any) {
      setConceptFormError(err.message || 'Error al guardar concepto');
    } finally {
      setIsSavingConcept(false);
    }
  };

  // Entity Handlers
  const handleOpenCreateEntity = () => {
    setEntityForm({
      name: '',
      type: 'Empresa',
      location: '',
      cuit: '',
      phone: '',
      email: '',
      notes: '',
      status: 'activo'
    });
    setEntityModalMode('create');
    setEntityFormError(null);
    setIsEntityModalOpen(true);
  };

  const handleOpenEditEntity = (entity: ExpenseEntity) => {
    setEntityForm({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      location: entity.location || '',
      cuit: entity.cuit || '',
      phone: entity.phone || '',
      email: entity.email || '',
      notes: entity.notes || '',
      status: entity.status || 'activo'
    });
    setEntityModalMode('edit');
    setEntityFormError(null);
    setIsEntityModalOpen(true);
  };

  const handleSaveEntityForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityForm.name.trim()) {
      setEntityFormError('El nombre de la entidad es obligatorio.');
      return;
    }
    setIsSavingEntity(true);
    setEntityFormError(null);
    try {
      const savedEntity = await saveExpenseEntityInFirestore(targetId, {
        id: entityForm.id,
        name: entityForm.name.trim(),
        type: entityForm.type,
        location: entityForm.location.trim() || undefined,
        cuit: entityForm.cuit.trim() || undefined,
        phone: entityForm.phone.trim() || undefined,
        email: entityForm.email.trim() || undefined,
        notes: entityForm.notes.trim() || undefined,
        status: entityForm.status
      });
      setIsEntityModalOpen(false);
      showToast(entityForm.id ? 'Entidad actualizada' : 'Entidad creada exitosamente');
      if (isProductModalOpen && editProductSubTab === 'compras') {
        setSelectedPurchaseEntity(savedEntity);
        setPurchaseEntitySearch(savedEntity.name);
      }
    } catch (err: any) {
      setEntityFormError(err.message || 'Error al guardar la entidad');
    } finally {
      setIsSavingEntity(false);
    }
  };

  const handleDeleteEntity = async (entityId: string) => {
    try {
      await deleteExpenseEntityInFirestore(entityId);
      setIsEntityModalOpen(false);
      showToast('Entidad eliminada');
    } catch (err: any) {
      setEntityFormError(err.message || 'Error al eliminar entidad');
    }
  };

  // Rubros Manager inline add/rename
  const handleCreateRubroFromManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRubroNameInput.trim()) return;
    setRubroManagerError(null);
    try {
      await saveExpenseCategoryInFirestore(targetId, {
        name: newRubroNameInput.trim(),
        status: 'activo'
      });
      setNewRubroNameInput('');
      showToast('Rubro creado exitosamente');
    } catch (err: any) {
      setRubroManagerError(err.message || 'Error al crear rubro');
    }
  };

  const handleSaveRenameRubro = async (rubro: ProductCategory) => {
    if (!editingRubroName.trim() || editingRubroName.trim() === rubro.name) {
      setEditingRubroId(null);
      return;
    }
    setRubroManagerError(null);
    try {
      await saveExpenseCategoryInFirestore(targetId, {
        id: rubro.id,
        name: editingRubroName.trim(),
        oldName: rubro.name,
        status: rubro.status || 'activo'
      });
      setEditingRubroId(null);
      showToast('Rubro renombrado');
    } catch (err: any) {
      setRubroManagerError(err.message || 'Error al renombrar');
    }
  };

  const handleDeleteRubro = async (rubro: ProductCategory) => {
    setRubroManagerError(null);
    try {
      await deleteExpenseCategoryInFirestore(rubro.id, targetId, true);
      if (selectedRubroPill === rubro.name || selectedRubroPill === rubro.id) {
        setSelectedRubroPill('total');
      }
      showToast(`Rubro "${rubro.name}" eliminado`);
    } catch (err: any) {
      setRubroManagerError(err?.message || 'Error al eliminar rubro');
    }
  };

  // Filtered lists for Gastos
  const expenseRubros = useMemo(() => {
    return expenseCategories.filter(c => c.catalogType === 'expense');
  }, [expenseCategories]);

  const catalogExpenseConcepts = useMemo(() => {
    return expenseItems.filter(i => i.catalogType === 'expense');
  }, [expenseItems]);

  const filteredConcepts = useMemo(() => {
    let list = catalogExpenseConcepts;
    if (selectedRubroPill !== 'total') {
      list = list.filter(c => (c.categoryName || c.categoryId) === selectedRubroPill);
    }
    if (expenseSearchQuery.trim()) {
      const q = expenseSearchQuery.toLowerCase().trim();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.categoryName || c.categoryId || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [catalogExpenseConcepts, selectedRubroPill, expenseSearchQuery]);

  const filteredEntities = useMemo(() => {
    let list = expenseEntities;
    if (entitySearchQuery.trim()) {
      const q = entitySearchQuery.toLowerCase().trim();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.phone || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (e.cuit || '').toLowerCase().includes(q) ||
        (e.type || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [expenseEntities, entitySearchQuery]);

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
          {mode === 'gastos' ? (
            <div className="px-5 pt-1 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpenseSubTab('rubros_conceptos')}
                  className={cn(
                    "text-sm font-bold transition-all cursor-pointer rounded-2xl",
                    expenseSubTab === 'rubros_conceptos'
                      ? "bg-[#e2e8f0] dark:bg-slate-700 text-slate-800 dark:text-white px-4 py-2"
                      : "text-slate-400 hover:text-slate-600 dark:text-slate-400 px-3 py-2"
                  )}
                >
                  Rubros y conceptos
                </button>
                <button
                  type="button"
                  onClick={() => setExpenseSubTab('entidades')}
                  className={cn(
                    "text-sm font-bold transition-all cursor-pointer rounded-2xl",
                    expenseSubTab === 'entidades'
                      ? "bg-[#e2e8f0] dark:bg-slate-700 text-slate-800 dark:text-white px-4 py-2"
                      : "text-slate-400 hover:text-slate-600 dark:text-slate-400 px-3 py-2"
                  )}
                >
                  Entidad
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Cerrar Gastos"
              >
                <X size={20} />
              </button>
            </div>
          ) : selectedCategory ? (
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory(null);
                  setSearchQuery('');
                }}
                className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                title="Volver"
              >
                <ChevronLeft size={26} strokeWidth={1.8} />
              </button>

              <div className="text-center">
                <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white leading-tight">
                  {selectedCategory}
                </h2>
                <p className="text-xs font-normal text-gray-400 dark:text-gray-500">
                  {displayedProducts.length} {displayedProducts.length === 1 ? 'producto' : 'productos'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleOpenRenameCategory(selectedCategory)}
                className="p-1.5 -mr-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                title="Editar nombre de categoría"
              >
                <Edit3 size={20} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Store size={18} />
                </div>
                <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                  Editar Mostrador
                </h2>
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
          )}

          {/* Search bar inside category or Switcher for Mostrador */}
          {selectedCategory ? (
            <div className="px-5 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder={`Buscar en ${selectedCategory}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          ) : mode === 'gastos' ? null : (
            /* Main Segmented Switcher: Categorías | Productos (Gastos oculto en modo mostrador) */
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
              </div>

              {activeTab === 'products' && (
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto px-5 py-4 pb-28 space-y-3">
            {/* 1. Vista "Categorías" */}
            {mode !== 'gastos' && activeTab === 'categories' && !selectedCategory && (
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
            {mode !== 'gastos' && (selectedCategory || activeTab === 'products') && (
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
                  <div className="grid grid-cols-2 gap-3">
                    {displayedProducts.map((prod) => {
                      return (
                        <div
                          key={`prod-card-${prod.id}`}
                          onClick={() => setSelectedProduct(prod)}
                          className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 shadow-xs hover:shadow-sm active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-between min-h-[92px]"
                        >
                          {/* Arriba: Nombre (izq) y Unidades (der) */}
                          <div className="flex items-start justify-between gap-1.5">
                            <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight truncate flex-1 min-w-0" title={prod.name}>
                              {prod.name}
                            </h4>
                            <span className={cn(
                              "text-xs font-bold shrink-0",
                              prod.stock > 0 ? "text-[#0BA70B]" : "text-rose-500"
                            )}>
                              {prod.stock}u
                            </span>
                          </div>

                          {/* Abajo: Precio de venta (izq) y Monto (der) */}
                          <div className="flex items-end justify-between gap-1.5 pt-3">
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                              Precio de venta
                            </span>
                            <span className="font-black text-slate-900 dark:text-white text-sm">
                              ${Number(prod.salePrice || 0).toLocaleString('es-AR')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* 3. Vista "Gastos" (Configurar Rubros y Conceptos de Gastos / Entidades) */}
            {(mode === 'gastos' || activeTab === 'expenses') && (
              <div className="pb-20 select-none">
                {expenseSubTab === 'rubros_conceptos' ? (
                  /* VISTA 1: RUBROS Y CONCEPTOS */
                  <div>
                    {/* Search bar */}
                    <div className="relative mb-5">
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={expenseSearchQuery}
                        onChange={(e) => setExpenseSearchQuery(e.target.value)}
                        placeholder="Buscar rubros o conceptos"
                        className="w-full pl-11 pr-4 py-3 rounded-full border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 shadow-xs"
                      />
                      {expenseSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setExpenseSearchQuery('')}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    {/* Section: Rubros */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                          Rubros
                        </h3>
                        <button
                          type="button"
                          onClick={() => setIsRubrosManagerOpen(true)}
                          className="text-xs sm:text-sm font-bold text-[#7c12e8] hover:underline cursor-pointer"
                        >
                          Editar rubros
                        </button>
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar">
                        {/* Pill Total */}
                        <button
                          type="button"
                          onClick={() => setSelectedRubroPill('total')}
                          className={cn(
                            "px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                            selectedRubroPill === 'total'
                              ? "bg-[#7c12e8] text-white shadow-xs"
                              : "bg-[#e2e8f0]/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#e2e8f0]"
                          )}
                        >
                          Total ({activeExpenseConcepts.length})
                        </button>

                        {/* Individual Rubro Pills */}
                        {expenseRubros.map((rubro) => {
                          const count = activeExpenseConcepts.filter(c => 
                            c.categoryId === rubro.name || c.categoryName === rubro.name || c.categoryId === rubro.id
                          ).length;
                          const isSelected = selectedRubroPill === rubro.name;
                          return (
                            <button
                              key={`rubro-pill-${rubro.id}`}
                              type="button"
                              onClick={() => setSelectedRubroPill(rubro.name)}
                              className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                                isSelected
                                  ? "bg-[#7c12e8] text-white shadow-xs"
                                  : "bg-[#e2e8f0]/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#e2e8f0]"
                              )}
                            >
                              {rubro.name} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Section: Conceptos */}
                    <div>
                      <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-3">
                        Conceptos
                      </h3>

                      {filteredConcepts.length === 0 ? (
                        <div className="py-12 text-center text-slate-400">
                          <p className="text-sm">No se encontraron conceptos.</p>
                          <button
                            type="button"
                            onClick={handleOpenCreateConcept}
                            className="mt-3 text-xs font-bold text-[#0BA70B] hover:underline cursor-pointer"
                          >
                            + Crear primer concepto
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {filteredConcepts.map((concept) => (
                            <div
                              key={`concept-card-${concept.id}`}
                              onClick={() => handleOpenEditConcept(concept)}
                              className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[76px]"
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                  {concept.name}
                                </h4>
                                <span className={cn(
                                  "text-[11px] font-semibold shrink-0",
                                  concept.status === 'inactivo' ? "text-slate-400" : "text-[#0BA70B]"
                                )}>
                                  {concept.status === 'inactivo' ? 'Inactivo' : 'Activo'}
                                </span>
                              </div>
                              <span className="text-xs text-slate-400 dark:text-slate-400 truncate mt-2">
                                {concept.categoryName || concept.categoryId}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* VISTA 2: ENTIDAD (TABLA) */
                  <div>
                    {/* Search bar */}
                    <div className="relative mb-5">
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={entitySearchQuery}
                        onChange={(e) => setEntitySearchQuery(e.target.value)}
                        placeholder="Buscar entidad, teléfono o correo"
                        className="w-full pl-11 pr-4 py-3 rounded-full border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs"
                      />
                      {entitySearchQuery && (
                        <button
                          type="button"
                          onClick={() => setEntitySearchQuery('')}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    {/* Table Container Card */}
                    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/90 dark:border-slate-700/80 overflow-hidden shadow-xs">
                      {/* Table Header */}
                      <div className="flex items-center px-4 py-2.5 border-b border-slate-100 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 font-medium">
                        <div className="w-[32%] shrink-0 pr-1">Nombre / Contacto</div>
                        <div className="w-[28%] shrink-0 pr-1">Correo</div>
                        <div className="w-[20%] shrink-0 text-center">Tipo</div>
                        <div className="w-[20%] shrink-0 text-right">CUIT</div>
                      </div>

                      {/* Table Rows */}
                      {filteredEntities.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-xs">
                          No hay entidades registradas. Creá una tocando el botón inferior.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                          {filteredEntities.map((entity) => {
                            const phoneClean = (entity.phone || '').trim();
                            const waUrl = getWhatsAppUrl(phoneClean);

                            return (
                              <div
                                key={`entity-row-${entity.id}`}
                                onClick={() => handleOpenEditEntity(entity)}
                                className="flex items-center px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-750 transition cursor-pointer text-xs"
                              >
                                {/* Nombre / Contacto (32%) */}
                                <div className="w-[32%] shrink-0 pr-1 min-w-0">
                                  <h5 className="font-bold text-slate-900 dark:text-white truncate">
                                    {entity.name}
                                  </h5>
                                  {phoneClean ? (
                                    <a
                                      href={waUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[#0BA70B] font-semibold hover:underline truncate block"
                                      title="Abrir WhatsApp"
                                    >
                                      {phoneClean}
                                    </a>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </div>

                                {/* Correo (28%) */}
                                <div className="w-[28%] shrink-0 pr-1 text-slate-600 dark:text-slate-300 truncate">
                                  {entity.email ? (
                                    <span title={entity.email} className="truncate block">{entity.email}</span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </div>

                                {/* Tipo Badge (20%) */}
                                <div className="w-[20%] shrink-0 flex justify-center">
                                  <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[11px] font-bold truncate max-w-[100px] text-center",
                                    getEntityTypeBadgeClass(entity.type)
                                  )}>
                                    {entity.type}
                                  </span>
                                </div>

                                {/* CUIT (20%) */}
                                <div className="w-[20%] shrink-0 text-right font-mono text-slate-600 dark:text-slate-400 truncate">
                                  {entity.cuit ? entity.cuit : <span className="text-slate-400">—</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Floating Action Button (FAB): Bottom Right Corner */}
          {mode === 'gastos' || activeTab === 'expenses' ? (
            <div className="absolute right-5 bottom-5 z-20">
              {expenseSubTab === 'rubros_conceptos' ? (
                <button
                  type="button"
                  onClick={handleOpenCreateConcept}
                  className="w-14 h-14 rounded-2xl bg-[#0BA70B] hover:bg-[#099609] active:scale-95 text-white shadow-xl shadow-green-950/20 flex items-center justify-center cursor-pointer transition-transform"
                  title="Nuevo concepto de gasto"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" stroke="none" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" stroke="none" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" stroke="none" />
                    <path d="M14 17.5h7M17.5 14v7" stroke="currentColor" strokeWidth="2.5" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenCreateEntity}
                  className="w-14 h-14 rounded-2xl bg-[#0BA70B] hover:bg-[#099609] active:scale-95 text-white shadow-xl shadow-green-950/20 flex items-center justify-center cursor-pointer transition-transform"
                  title="Nueva entidad"
                >
                  <div className="relative flex items-center justify-center">
                    <Building2 size={24} className="text-white" strokeWidth={2.3} />
                    <span className="absolute -bottom-1 -right-1 text-white font-black text-xs leading-none">+</span>
                  </div>
                </button>
              )}
            </div>
          ) : (
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
                className="w-14 h-14 rounded-2xl bg-[#0BA70B] hover:bg-[#099609] active:scale-95 text-white shadow-xl shadow-green-950/20 flex items-center justify-center cursor-pointer transition-transform"
                title={
                  activeTab === 'categories' && !selectedCategory
                    ? 'Nueva categoría de productos'
                    : 'Agregar producto'
                }
              >
                {activeTab === 'categories' && !selectedCategory ? (
                  <div className="relative flex items-center justify-center">
                    <Tag size={24} className="text-white" strokeWidth={2.2} />
                    <span className="absolute -bottom-1 -right-1 text-white font-black text-xs leading-none">+</span>
                  </div>
                ) : (
                  <div className="relative flex items-center justify-center">
                    <Package size={24} className="text-white" strokeWidth={2.2} />
                    <span className="absolute -bottom-1 -right-1 text-white font-black text-xs leading-none">+</span>
                  </div>
                )}
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

        {/* Modal: Renombrar Categoría de Producto */}
        <AnimatePresence>
          {isRenameCategoryModalOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsRenameCategoryModalOpen(false)}
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
                    Editar categoría
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsRenameCategoryModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveRenameCategory} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Nombre de la categoría
                    </label>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={newRenamedCategoryTitle}
                      onChange={(e) => setNewRenamedCategoryTitle(e.target.value)}
                      placeholder="Ej. Bebidas"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsRenameCategoryModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!newRenamedCategoryTitle.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-900/10 transition-all cursor-pointer"
                    >
                      Guardar
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

                {/* Encabezado: Volver (izq), Nombre + Categoría (centro), Editar (der) */}
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                    title="Volver"
                  >
                    <ChevronLeft size={26} strokeWidth={1.8} />
                  </button>

                  <div className="text-center">
                    <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
                      {selectedProduct.name}
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                      {selectedProduct.categoryId}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEditProduct(selectedProduct)}
                    className="p-1.5 -mr-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                    title="Editar producto"
                  >
                    <Edit3 size={20} strokeWidth={2} />
                  </button>
                </div>

                {/* Body: Desplazable internamente */}
                <div className="p-5 overflow-y-auto space-y-5 pb-20">
                  {/* Dos tarjetas superiores centradas: unidades (stock) y Precio de venta */}
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      onClick={() => {
                        setAdjustType('adjustment');
                        setAdjustQuantity(1);
                        setAdjustReason('');
                        setIsAdjustStockOpen(true);
                      }}
                      className="p-4 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-100 dark:border-slate-800/80 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-700 cursor-pointer text-center transition-all group active:scale-[0.98]"
                      title="Registrar pérdida de mercadería"
                    >
                      <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                        {selectedProduct.stock}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                        unidades
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-100 dark:border-slate-800/80 shadow-xs text-center">
                      <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                        ${Number(selectedProduct.salePrice || 0).toLocaleString('es-AR')}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                        Precio de venta
                      </div>
                    </div>
                  </div>

                  {/* ------------------------------------------------------------- */}
                  {/* SECCIÓN INVENTARIO (TANDAS PEPS ACTIVAS quantity > 0)          */}
                  {/* ------------------------------------------------------------- */}
                  <div className="space-y-3">
                    <h4 className="text-base font-black text-gray-900 dark:text-white">
                      Inventario
                    </h4>

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

                            return (
                              <div
                                key={`batch-card-${batch.id || bIdx}`}
                                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 shadow-xs space-y-1.5"
                              >
                                {/* Renglón 1: Círculo numerado + Orden en gris oscuro + Unidades en gris oscuro */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[#0BA70B] dark:text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0">
                                      {bIdx + 1}
                                    </span>
                                    <span className="font-bold text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                                      {getBatchOrdinalLabel(bIdx)}
                                    </span>
                                  </div>

                                  <span className="font-bold text-xs sm:text-sm text-slate-600 dark:text-slate-300 shrink-0">
                                    {batch.quantity} {batch.quantity === 1 ? 'unidad' : 'unidades'}
                                  </span>
                                </div>

                                {/* Renglón 2: Ícono Building2 + Entidad o n/n (sin rubro) */}
                                <div className="pl-7 flex items-center gap-1.5 text-xs font-normal text-gray-400 dark:text-slate-400">
                                  <Building2 size={13} className="text-gray-400 dark:text-slate-400 shrink-0" />
                                  <span className="truncate">
                                    {batch.entityName && batch.entityName.trim() !== '' ? batch.entityName : 'n/n'}
                                  </span>
                                </div>

                                {/* Renglón 3: Costo unitario en ROJO, Ganancia en VERDE y Márgen en GRIS OSCURO */}
                                <div className="flex items-center justify-between text-xs pl-7 pt-0.5">
                                  <span className="text-gray-400 dark:text-slate-400">
                                    Costo unitario <span className="text-rose-500 font-semibold ml-1">${unitCost.toLocaleString('es-AR')}</span>
                                  </span>
                                  <span className="text-gray-400 dark:text-slate-400">
                                    Ganancia <span className="text-[#0BA70B] font-semibold ml-1">${unitGrossProfit.toLocaleString('es-AR')}</span>
                                  </span>
                                  <span className="text-gray-400 dark:text-slate-400">
                                    Márgen <span className="text-slate-600 dark:text-slate-300 font-bold ml-1">%{Math.round(marginPercent)}</span>
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* ------------------------------------------------------------- */}
                  {/* SECCIÓN HISTORIAL DE MOVIMIENTOS (ACORDEÓN COLAPSABLE)        */}
                  {/* ------------------------------------------------------------- */}
                  <div className="space-y-3 pt-2">
                    <button
                      type="button"
                      onClick={handleToggleHistory}
                      className="w-full flex items-center justify-between text-base font-black text-gray-900 dark:text-white cursor-pointer py-1"
                    >
                      <span className="font-black text-gray-900 dark:text-white">Historial</span>
                      <ChevronDown
                        size={18}
                        className={cn("text-slate-400 transition-transform duration-200", isHistoryExpanded ? "rotate-180" : "")}
                      />
                    </button>

                    {isHistoryExpanded && (
                      <div>
                        {productMovements.length === 0 ? (
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400">
                            Aún no hay movimientos de inventario registrados para este producto.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {productMovements.map((mov) => {
                              const isPositive = mov.quantity > 0;
                              const isPurchase = mov.type === 'purchase' || mov.type === 'restock' || mov.typeLabel === 'Reposición de stock' || mov.typeLabel?.toLowerCase().includes('compra');
                              const isSale = !isPurchase && (mov.type === 'sale' || mov.typeLabel === 'Venta' || mov.typeLabel?.toLowerCase().includes('venta'));
                              const isAdjustment = !isPurchase && !isSale;

                              const matchedBatch = (selectedProduct.batches || []).find(
                                (b) => b.operationId && mov.operationId && b.operationId === mov.operationId
                              );
                              const entityDisplay = (mov as any).entityName?.trim() || matchedBatch?.entityName?.trim() || 'n/n';

                              const rawActor = (mov.actorName || '').trim();
                              const clientDisplay =
                                !rawActor ||
                                rawActor.toUpperCase() === 'NN' ||
                                rawActor === 'Punto de Venta' ||
                                rawActor === 'Administrador'
                                  ? 'n/n'
                                  : rawActor;

                              return (
                                <div
                                  key={`mov-${mov.id}`}
                                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="space-y-0.5 min-w-0">
                                    {isPurchase ? (
                                      <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm">
                                        <span className="font-bold text-slate-600 dark:text-slate-300">
                                          Reposición de stock
                                        </span>
                                        <span className="text-gray-400 dark:text-slate-500">•</span>
                                        <span className="inline-flex items-center gap-1 font-normal text-gray-400 dark:text-slate-400">
                                          <Building2 size={13} className="text-gray-400 dark:text-slate-400 shrink-0" />
                                          <span>{entityDisplay}</span>
                                        </span>
                                      </div>
                                    ) : isSale ? (
                                      <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm">
                                        <span className="font-bold text-slate-600 dark:text-slate-300">
                                          Venta en mostrador
                                        </span>
                                        <span className="text-gray-400 dark:text-slate-500">•</span>
                                        <span className="inline-flex items-center gap-1 font-normal text-gray-400 dark:text-slate-400">
                                          <UserIcon size={13} className="text-gray-400 dark:text-slate-400 shrink-0" />
                                          <span>{clientDisplay}</span>
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm">
                                        <span className="font-bold text-slate-600 dark:text-slate-300">
                                          Ajuste de stock
                                        </span>
                                      </div>
                                    )}

                                    <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-slate-400 mt-0.5">
                                      <span className="flex items-center gap-1">
                                        <Calendar size={12} />
                                        <span>{formatMovementDateShort(mov.date, mov.createdAt)}</span>
                                      </span>
                                      {mov.time && (
                                        <span className="flex items-center gap-1">
                                          <Clock size={12} />
                                          <span>{mov.time}</span>
                                        </span>
                                      )}
                                    </div>

                                    {isAdjustment && mov.notes && (
                                      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-slate-400 italic mt-0.5">
                                        <FileText size={12} className="text-gray-400 dark:text-slate-400 shrink-0 not-italic" />
                                        <span>{mov.notes}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-right shrink-0">
                                    <div className={cn("font-bold text-xs", isPositive ? "text-[#0BA70B]" : "text-rose-500")}>
                                      {isPositive ? `+${mov.quantity}u` : `${mov.quantity}u`}
                                    </div>
                                    {mov.resultingStock !== undefined && (
                                      <div className="text-[10px] text-gray-400 font-medium">
                                        Stock, {mov.resultingStock}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal: Pérdida de mercadería */}
        <AnimatePresence>
          {isAdjustStockOpen && selectedProduct && (
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAdjustStockOpen(false)}
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
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Pérdida de mercadería
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedProduct.name} · Stock actual: {selectedProduct.stock}u
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAdjustStockOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleConfirmStockAdjustment();
                  }}
                  className="space-y-3.5"
                >
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Unidades perdidas / retiradas *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={Math.max(1, selectedProduct.stock)}
                      required
                      value={adjustQuantity}
                      onChange={(e) => setAdjustQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Motivo de la pérdida
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Rotura, Vencimiento, Consumo interno"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAdjustStockOpen(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingStock || !adjustQuantity || Number(adjustQuantity) <= 0 || Number(adjustQuantity) > selectedProduct.stock}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-900/10 transition-all cursor-pointer"
                    >
                      {isSavingStock ? 'Guardando...' : 'Confirmar pérdida'}
                    </button>
                  </div>
                </form>
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
            <div 
              className="fixed inset-0 z-[70] flex flex-col justify-end sm:justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 select-none"
              onClick={() => setIsProductModalOpen(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletePurchaseMenuRowId(null);
                }}
                className="bg-[#f8fafc] dark:bg-slate-900 w-full max-w-2xl max-h-[96vh] sm:max-h-[90vh] rounded-t-[32px] sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-slate-800 flex flex-col overflow-hidden mx-auto relative"
              >
                {/* Pastilla gris superior de arrastre */}
                <div className="w-12 h-1.5 bg-gray-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0" />

                {!(productModalMode === 'edit' && editProductSubTab === 'compras' && purchaseStep === 2) && (
                  <>
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
                  </>
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
                      {/* Fila 1: Nombre (izq) y Categoría (der) */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Nombre del producto *
                          </label>
                          <input
                            type="text"
                            placeholder="Ej. Coca-Cola 500 ml"
                            value={productForm.name}
                            onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                            className="w-full h-9.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Categoría *
                          </label>
                          {categories.length > 0 ? (
                            <select
                              value={productForm.categoryId}
                              onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                              className="w-full h-9.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
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
                              className="w-full h-9.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                            />
                          )}
                        </div>
                      </div>

                      {/* Fila 2: Precio de venta (col 1) y Estado (col 2) */}
                      <div className="grid grid-cols-2 gap-2.5 items-end">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Precio de venta ($) *
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Ej. 1500"
                            value={productForm.salePrice}
                            onChange={(e) => setProductForm({ ...productForm, salePrice: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-full h-9.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Estado
                          </label>
                          <div className="inline-flex w-full items-center p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl gap-1 h-9.5">
                            <button
                              type="button"
                              onClick={() => setProductForm({ ...productForm, status: 'activo' })}
                              className={cn(
                                "flex-1 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer text-center",
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
                                "flex-1 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer text-center",
                                productForm.status === 'inactivo'
                                  ? "bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs"
                                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                              )}
                            >
                              Inactivo
                            </button>
                          </div>
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

                          {/* Fila 1: Cantidad y Costo por unidad */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Cantidad *
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
                                Costo unitario ($) *
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

                          {/* Fila 2: Rubro y Concepto */}
                          <div className="grid grid-cols-2 gap-2.5">
                            {/* Selector 1: Rubro de Gastos */}
                            <div className="relative" ref={rubroDropdownRef}>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Rubro
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Elegir o buscar rubro..."
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
                                  className="w-full px-3 py-2.5 pr-7 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
                                />
                                {purchaseRubroSearch ? (
                                  <button
                                    type="button"
                                    onClick={handleClearPurchaseRubro}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                    title="Limpiar rubro"
                                  >
                                    <X size={13} />
                                  </button>
                                ) : (
                                  <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                )}
                              </div>

                              {/* Dropdown Rubros */}
                              {isPurchaseRubroDropdownOpen && (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
                                  {filteredPurchaseRubros.length > 0 ? (
                                    filteredPurchaseRubros.map((r) => {
                                      const isSelected = selectedPurchaseRubro?.id === r.id;
                                      return (
                                        <button
                                          key={`purch-bs-rubro-${r.id}`}
                                          type="button"
                                          onClick={() => handleSelectPurchaseRubro(r)}
                                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-slate-700/80 transition-colors cursor-pointer ${
                                            isSelected ? 'bg-emerald-50/70 dark:bg-slate-700 font-bold text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'
                                          }`}
                                        >
                                          <span className="truncate">{r.name}</span>
                                          {isSelected && <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 ml-1" />}
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <div className="p-2.5 text-center text-xs text-slate-400 dark:text-slate-400">
                                      Sin resultados
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Selector 2: Concepto de Gasto / Proveedor */}
                            <div className="relative" ref={conceptDropdownRef}>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Concepto
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder={selectedPurchaseRubro ? `Concepto en ${selectedPurchaseRubro.name}...` : "Elegir concepto..."}
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
                                  className="w-full px-3 py-2.5 pr-7 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
                                />
                                {purchaseConceptSearch ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedPurchaseConcept(null);
                                      setPurchaseConceptSearch('');
                                      setPurchaseForm(prev => ({ ...prev, purchasePlace: '', supplierId: undefined }));
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                  >
                                    <X size={13} />
                                  </button>
                                ) : (
                                  <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                )}
                              </div>

                              {/* Dropdown Conceptos */}
                              {isPurchaseConceptDropdownOpen && (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
                                  {filteredPurchaseConcepts.length > 0 ? (
                                    filteredPurchaseConcepts.map((c) => {
                                      const isSelected = selectedPurchaseConcept?.id === c.id;
                                      return (
                                        <button
                                          key={`purch-bs-concept-${c.id}`}
                                          type="button"
                                          onClick={() => handleSelectPurchaseConcept(c)}
                                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-slate-700/80 transition-colors cursor-pointer ${
                                            isSelected ? 'bg-emerald-50/70 dark:bg-slate-700 font-bold text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'
                                          }`}
                                        >
                                          <div className="flex flex-col min-w-0 pr-1">
                                            <span className="truncate">{c.name}</span>
                                            <span className="text-[10px] text-slate-400 truncate">
                                              {c.categoryName || c.categoryId}
                                            </span>
                                          </div>
                                          {isSelected && <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 ml-1" />}
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <div className="p-2.5 text-center text-xs text-slate-400 dark:text-slate-400">
                                      Sin resultados
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
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
                        /* PASO 2: REGISTRAR EL PAGO DE LA COMPRA (UNIFICADO CON GASTOS/MOSTRADOR/RESERVAS) */
                        <form onSubmit={handleConfirmPurchase} className="flex flex-col">
                          {/* Cabecera Paso 2 unificada */}
                          <div className="shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 z-20">
                            <button
                              type="button"
                              onClick={() => setPurchaseStep(1)}
                              className="p-1 -ml-1 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-full transition-colors cursor-pointer"
                            >
                              <ChevronLeft size={24} />
                            </button>
                            <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white flex-1 text-center pr-6">
                              Pago de compras
                            </h3>
                          </div>

                          <div className="p-4 sm:p-5 space-y-4">
                            {/* Resumen central */}
                            <div className="text-center pt-1 pb-2">
                              <span className="text-xs text-gray-400 font-medium lowercase block">total a pagar</span>
                              <span className="text-4xl font-black text-gray-900 dark:text-white font-mono tracking-tight block my-1">
                                ${totalPurchaseComputed.toLocaleString()}
                              </span>
                              <div className="max-w-[240px] sm:max-w-[260px] mx-auto pt-1.5 flex items-start justify-between gap-4 border-t border-gray-100 dark:border-slate-800">
                                <div className="text-left min-w-0">
                                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 truncate leading-tight block">
                                    {selectedProduct?.name || 'Mercadería'}
                                  </span>
                                  <span className="text-[10px] text-gray-400 dark:text-slate-500 leading-tight block mt-0.5">
                                    {purchaseForm.quantity}u x ${Number(purchaseForm.unitCost || 0).toLocaleString()} c/u
                                  </span>
                                </div>
                                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 shrink-0 leading-tight">
                                  ${totalPurchaseComputed.toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {/* Fila Entidad idéntica a POSModal.tsx */}
                            <div ref={entityPurchaseDropdownRef} className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                              {!selectedPurchaseEntity ? (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => setIsPurchaseEntityDropdownOpen(!isPurchaseEntityDropdownOpen)}
                                    className={`text-left font-bold text-sm cursor-pointer block ${
                                      isPurchaseEntityBlocked
                                        ? 'text-red-600'
                                        : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                  >
                                    {isPurchaseEntityBlocked ? '+ Añadir entidad (Obligatorio) *' : '+ Añadir entidad (opcional)'}
                                  </button>

                                  {isPurchaseEntityDropdownOpen && (
                                    <div className="mt-2 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg space-y-2">
                                      <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                          type="text"
                                          placeholder="Buscar por nombre, CUIT o teléfono..."
                                          value={purchaseEntitySearch}
                                          onChange={(e) => setPurchaseEntitySearch(e.target.value)}
                                          className="w-full h-8 pl-8 pr-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-[#7c12e8]"
                                          autoFocus
                                        />
                                      </div>

                                      <div className="max-h-28 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700 text-xs">
                                        {filteredPurchaseEntities.length === 0 ? (
                                          <p className="p-2 text-gray-400 text-center">No hay entidades disponibles</p>
                                        ) : (
                                          filteredPurchaseEntities.map((ent) => (
                                            <div
                                              key={`purch-ent-opt-${ent.id}`}
                                              onClick={() => {
                                                setSelectedPurchaseEntity(ent);
                                                setIsPurchaseEntityDropdownOpen(false);
                                                setPurchaseEntitySearch('');
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
                                        {selectedPurchaseEntity.name}
                                      </p>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                                        {selectedPurchaseEntity.type}
                                      </span>
                                    </div>
                                    <p className="text-xs font-mono text-[#0BA70B]">
                                      {selectedPurchaseEntity.phone || selectedPurchaseEntity.cuit || '-'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPurchaseEntity(null)}
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
                                {purchasePayments.map((p, idx) => {
                                  const isDeleteOpen = deletePurchaseMenuRowId === p.id;

                                  return (
                                    <div
                                      key={`purch-pay-block-${p.id}`}
                                      className={cn("bg-transparent border-none shadow-none py-1.5 relative", isDeleteOpen ? "z-40" : "z-10")}
                                    >
                                      {/* Fila principal en una sola línea horizontal */}
                                      <div className="flex items-center justify-between w-full">
                                        {/* Zona 1: Icono + Nombre del método */}
                                        <div 
                                          onClick={() => {
                                            setEditingPurchasePaymentIndex(idx);
                                            setIsPurchasePaymentSheetOpen(true);
                                          }}
                                          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer py-1"
                                        >
                                          {renderPurchaseMethodIcon(p.method)}
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
                                              setPurchasePayments((prev) => {
                                                const copy = [...prev];
                                                copy[idx] = { ...copy[idx], amount: val === '' ? '' : Number(val) };
                                                return copy;
                                              });
                                            }}
                                            className={`border-0 border-none ring-0 focus:ring-0 outline-none rounded-lg px-3 py-1.5 w-24 text-center font-bold text-xs sm:text-sm text-gray-900 dark:text-white transition-colors ${
                                              isPurchaseFalta 
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
                                                setDeletePurchaseMenuRowId(isDeleteOpen ? null : p.id);
                                              }}
                                              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer transition-colors"
                                            >
                                              <ChevronRight size={18} />
                                            </button>

                                            {isDeleteOpen && (
                                              <div className="absolute right-0 top-full mt-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemovePurchasePaymentBlock(p.id);
                                                    setDeletePurchaseMenuRowId(null);
                                                  }}
                                                  disabled={purchasePayments.length <= 1}
                                                  className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-300 hover:text-gray-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
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
                                      {purchaseFaltante > 0 && (
                                        <div className="text-right pr-7 mt-0.5">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setPurchasePayments((prev) => {
                                                const copy = [...prev];
                                                const cur = Number(copy[idx].amount) || 0;
                                                copy[idx] = { ...copy[idx], amount: cur + purchaseFaltante };
                                                return copy;
                                              });
                                            }}
                                            className="text-[11px] font-bold text-rose-600 underline cursor-pointer"
                                          >
                                            Faltan ${purchaseFaltante.toLocaleString()}
                                          </button>
                                        </div>
                                      )}

                                      {purchaseSobrante > 0 && (
                                        <div className="text-right pr-7 mt-0.5">
                                          <button
                                            type="button"
                                            onClick={handleAutocorrectPurchaseSobrante}
                                            className="text-[11px] font-bold text-[#7c12e8] underline cursor-pointer"
                                          >
                                            Sobran ${purchaseSobrante.toLocaleString()}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Botón "+ agregar método de pago" con fondo transparente */}
                              {purchaseFaltante > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPurchasePaymentIndex(null);
                                    setIsPurchasePaymentSheetOpen(true);
                                  }}
                                  className="w-full py-2.5 rounded-xl bg-transparent border border-gray-200 dark:border-slate-700 text-center font-bold text-xs sm:text-sm text-gray-700 dark:text-slate-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                                >
                                  + agregar método de pago
                                </button>
                              )}
                            </div>

                            {/* Botón Principal Inferior en Paso 2 de Compras */}
                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => handleConfirmPurchase()}
                                disabled={!canFinalizePurchase}
                                className={`w-full py-4 px-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg transition-all ${
                                  canFinalizePurchase
                                    ? 'bg-[#7c12e8] hover:bg-[#680fc5] text-white shadow-[#7c12e8]/25 active:scale-98 cursor-pointer'
                                    : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                                }`}
                              >
                                {isRegisteringPurchase ? (
                                  <>
                                    <RefreshCw size={18} className="animate-spin" />
                                    <span>Registrando compra...</span>
                                  </>
                                ) : (
                                  <span>
                                    {isPurchaseFalta
                                      ? `Faltan $${purchaseFaltante.toLocaleString()}`
                                      : isPurchaseEntityBlocked
                                      ? 'Asigná una entidad para saldo pendiente'
                                      : 'Finalizar compra'}
                                  </span>
                                )}
                              </button>
                            </div>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </motion.div>

                {/* Sub-bottom sheet para seleccionar método de pago en Compra */}
                <AnimatePresence>
                  {isPurchasePaymentSheetOpen && (
                    <div
                      className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/60 backdrop-blur-xs select-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsPurchasePaymentSheetOpen(false);
                        setEditingPurchasePaymentIndex(null);
                      }}
                    >
                      <motion.div
                        drag="y"
                        dragListener={false}
                        dragControls={purchaseSheetDragControls}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.9 }}
                        onDragEnd={(_, info) => {
                          if (info.offset.y > 100) {
                            setIsPurchasePaymentSheetOpen(false);
                            setEditingPurchasePaymentIndex(null);
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
                          onPointerDown={(e) => purchaseSheetDragControls.start(e)}
                          className="touch-none cursor-grab active:cursor-grabbing text-center space-y-1 -mt-1 mb-2"
                        >
                          <div className="w-12 h-1.5 bg-gray-300 dark:bg-slate-700 rounded-full mx-auto mb-2 shrink-0" />
                          <h4 className="font-black text-base text-gray-900 dark:text-white">
                            {editingPurchasePaymentIndex !== null ? 'Cambiar método de pago' : 'Agregar método de pago'}
                          </h4>
                          <p className="text-xs text-gray-400">
                            mantené presionado para ordenar los métodos de pago según tu preferencia
                          </p>
                        </div>

                        <Reorder.Group
                          axis="y"
                          values={orderedPurchaseMethods}
                          onReorder={handleSavePurchaseMethodsOrder}
                          className="space-y-2 py-2"
                        >
                          {orderedPurchaseMethods.map((m) => (
                            <Reorder.Item
                              key={`reorder-purch-sheet-${m}`}
                              value={m}
                              className="p-3.5 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:border-gray-400 transition-colors shadow-2xs"
                              onClick={() => {
                                const targetMethod = (m === 'Tarjeta' ? 'Crédito' : m) as 'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente';
                                if (editingPurchasePaymentIndex !== null) {
                                  handleChangePurchaseBlockMethod(editingPurchasePaymentIndex, targetMethod);
                                } else {
                                  handleAddNewPurchasePaymentMethod(targetMethod);
                                }
                                setIsPurchasePaymentSheetOpen(false);
                                setEditingPurchasePaymentIndex(null);
                              }}
                            >
                              <div className="flex items-center gap-3">
                                {renderPurchaseMethodIcon(m)}
                                <span className="font-black text-sm text-gray-900 dark:text-white">
                                  {m}
                                </span>
                              </div>
                              <div
                                onPointerDown={(e) => e.stopPropagation()}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-grab active:cursor-grabbing touch-none"
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
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* ========================================================= */}
        {/* MODAL 1: NUEVA / EDITAR ENTIDAD                           */}
        {/* ========================================================= */}
        <AnimatePresence>
          {isEntityModalOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsEntityModalOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="relative max-w-md w-full p-4 rounded-3xl space-y-2.5 bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 z-10"
              >
                {/* 1. Cabecera compacta */}
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                    {entityModalMode === 'create' ? 'Nueva entidad' : 'Editar entidad'}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {entityModalMode === 'edit' && entityForm.id && (
                      <button
                        type="button"
                        onClick={() => handleDeleteEntity(entityForm.id!)}
                        className="p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                        title="Eliminar entidad"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsEntityModalOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>

                {entityFormError && (
                  <div className="py-1 px-2.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                    <AlertCircle size={14} className="shrink-0" />
                    <span className="truncate">{entityFormError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveEntityForm} className="space-y-2.5">
                  {/* Fila 1 — Nombre * (izquierda) y CUIT / CUIL (derecha) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5 block">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. EDENOR"
                        value={entityForm.name}
                        onChange={(e) => setEntityForm({ ...entityForm, name: e.target.value })}
                        className="w-full h-8.5 px-2.5 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5 block">
                        CUIT / CUIL
                      </label>
                      <input
                        type="text"
                        placeholder="30-00000000-0"
                        value={entityForm.cuit}
                        onChange={(e) => setEntityForm({ ...entityForm, cuit: e.target.value })}
                        className="w-full h-8.5 px-2.5 py-1 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Fila 2 — Dirección ocupando todo el ancho */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5 block">
                      Dirección / Ubicación
                    </label>
                    <input
                      type="text"
                      placeholder="Calle, número, localidad..."
                      value={entityForm.location}
                      onChange={(e) => setEntityForm({ ...entityForm, location: e.target.value })}
                      className="w-full h-8.5 px-2.5 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Fila 3 — Teléfono (izquierda) y Correo (derecha) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5 block">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        placeholder="11 2345-6789"
                        value={entityForm.phone}
                        onChange={(e) => setEntityForm({ ...entityForm, phone: e.target.value })}
                        className="w-full h-8.5 px-2.5 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5 block">
                        Correo
                      </label>
                      <input
                        type="email"
                        placeholder="correo@entidad.com"
                        value={entityForm.email}
                        onChange={(e) => setEntityForm({ ...entityForm, email: e.target.value })}
                        className="w-full h-8.5 px-2.5 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Fila 4 — Tipo * con los 5 tipos en UNA SOLA LÍNEA horizontal */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5 block">
                      Tipo de entidad *
                    </label>
                    <div className="grid grid-cols-5 gap-1">
                      {([
                        { type: 'Empresa', label: 'Empresa', activeClass: 'bg-[#2563eb] text-white shadow-2xs' },
                        { type: 'Sector Público', label: 'S. Público', activeClass: 'bg-[#eab308] text-slate-900 shadow-2xs' },
                        { type: 'Persona', label: 'Persona', activeClass: 'bg-[#cbd5e1] text-slate-800 shadow-2xs' },
                        { type: 'ONG', label: 'ONG', activeClass: 'bg-[#9333ea] text-white shadow-2xs' },
                        { type: 'Otro', label: 'Otro', activeClass: 'bg-[#ef4444] text-white shadow-2xs' }
                      ] as { type: ExpenseEntityType; label: string; activeClass: string }[]).map((t) => {
                        const isSelected = entityForm.type === t.type;
                        return (
                          <button
                            key={`compact-entity-type-${t.type}`}
                            type="button"
                            onClick={() => setEntityForm({ ...entityForm, type: t.type })}
                            className={cn(
                              "py-1.5 px-1 rounded-lg text-[10px] sm:text-[11px] font-bold text-center truncate whitespace-nowrap transition-all cursor-pointer",
                              isSelected
                                ? t.activeClass
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                            )}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Fila 5 — Observaciones (compacto en 1 línea) */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5 block">
                      Observaciones
                    </label>
                    <input
                      type="text"
                      placeholder="Notas u observaciones opcionales..."
                      value={entityForm.notes}
                      onChange={(e) => setEntityForm({ ...entityForm, notes: e.target.value })}
                      className="w-full h-8.5 px-2.5 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Fila 6 — Botón Activo / Inactivo */}
                  <div className="grid grid-cols-2 gap-1.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl h-8 items-center">
                    <button
                      type="button"
                      onClick={() => setEntityForm({ ...entityForm, status: 'activo' })}
                      className={cn(
                        "h-7 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center",
                        entityForm.status === 'activo'
                          ? "bg-white dark:bg-slate-900 text-[#0BA70B] shadow-2xs"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                      )}
                    >
                      Activo
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntityForm({ ...entityForm, status: 'inactivo' })}
                      className={cn(
                        "h-7 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center",
                        entityForm.status === 'inactivo'
                          ? "bg-white dark:bg-slate-900 text-red-500 shadow-2xs"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                      )}
                    >
                      Inactivo
                    </button>
                  </div>

                  {/* Fila 7 — Botones Cancelar y Guardar */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEntityModalOpen(false)}
                      className="h-9 flex-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingEntity}
                      className="h-9 flex-1 rounded-xl text-xs font-bold bg-[#0BA70B] hover:bg-[#099609] active:scale-95 text-white shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isSavingEntity ? 'Guardando...' : (entityModalMode === 'create' ? 'Crear Entidad' : 'Guardar Cambios')}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ========================================================= */}
        {/* MODAL 2: NUEVO / EDITAR CONCEPTO DE GASTO                  */}
        {/* ========================================================= */}
        <AnimatePresence>
          {isConceptModalOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsConceptModalOpen(false)}
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
                    {conceptModalMode === 'create' ? 'Nuevo concepto' : 'Editar concepto'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsConceptModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveConceptForm} className="space-y-4">
                  {conceptFormError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-xs flex items-center gap-2">
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{conceptFormError}</span>
                    </div>
                  )}

                  {/* Nombre del concepto */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Nombre del concepto *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Bebida, Luz, Gas, Mantenimiento"
                      value={conceptForm.name}
                      onChange={(e) => setConceptForm({ ...conceptForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  {/* Rubro */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Rubro *
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsRubrosManagerOpen(true)}
                        className="text-[11px] font-bold text-[#7c12e8] hover:underline cursor-pointer"
                      >
                        + Administrar rubros
                      </button>
                    </div>
                    {expenseRubros.length > 0 ? (
                      <select
                        value={conceptForm.categoryId}
                        onChange={(e) => setConceptForm({ ...conceptForm, categoryId: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                      >
                        {expenseRubros.map((r) => (
                          <option key={`opt-rubro-${r.id}`} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="Ej. Servicios, Proveedores"
                        value={conceptForm.categoryId}
                        onChange={(e) => setConceptForm({ ...conceptForm, categoryId: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                      />
                    )}
                  </div>

                  {/* Precio / Importe sugerido */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Importe / Precio sugerido ($ opcional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={conceptForm.price}
                      onChange={(e) => setConceptForm({ ...conceptForm, price: e.target.value === '' ? '' : Number(e.target.value) })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  {/* Estado: Activo / Inactivo */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Estado
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setConceptForm({ ...conceptForm, status: 'activo' })}
                        className={cn(
                          "py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                          conceptForm.status === 'activo'
                            ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                        )}
                      >
                        Activo
                      </button>
                      <button
                        type="button"
                        onClick={() => setConceptForm({ ...conceptForm, status: 'inactivo' })}
                        className={cn(
                          "py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                          conceptForm.status === 'inactivo'
                            ? "bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                        )}
                      >
                        Inactivo
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {conceptModalMode === 'edit' && conceptForm.id && (
                      <button
                        type="button"
                        onClick={() => {
                          handleDeleteExpenseItem(conceptForm.id!);
                          setIsConceptModalOpen(false);
                        }}
                        className="p-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 text-xs font-bold transition-colors cursor-pointer"
                        title="Eliminar concepto"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsConceptModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingConcept}
                      className="flex-1 py-2.5 rounded-xl bg-[#0BA70B] hover:bg-[#099609] active:scale-95 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isSavingConcept ? 'Guardando...' : (conceptModalMode === 'create' ? 'Crear' : 'Guardar')}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ========================================================= */}
        {/* MODAL 3: ADMINISTRAR RUBROS DE GASTO ("Editar rubros")    */}
        {/* ========================================================= */}
        <AnimatePresence>
          {isRubrosManagerOpen && (
            <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsRubrosManagerOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md max-h-[85vh] bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 z-10 flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Editar rubros
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsRubrosManagerOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {rubroManagerError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-xs flex items-center gap-2 mt-3">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{rubroManagerError}</span>
                  </div>
                )}

                {/* Formulario rápido para crear nuevo rubro */}
                <form onSubmit={handleCreateRubroFromManager} className="pt-3 pb-4 border-b border-slate-100 dark:border-slate-800 flex gap-2">
                  <input
                    type="text"
                    placeholder="Nuevo rubro (ej. Proveedor, Servicios)"
                    value={newRubroNameInput}
                    onChange={(e) => setNewRubroNameInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                  <button
                    type="submit"
                    disabled={!newRubroNameInput.trim()}
                    className="px-4 py-2 rounded-xl bg-[#7c12e8] hover:bg-[#680ec7] disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    Agregar
                  </button>
                </form>

                {/* Lista de rubros existentes */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 py-2">
                  {expenseRubros.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-6">No hay rubros creados aún.</p>
                  ) : (
                    expenseRubros.map((rubro) => {
                      const isEditingThis = editingRubroId === rubro.id;
                      return (
                        <div key={`mgr-rubro-${rubro.id}`} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                          {isEditingThis ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                autoFocus
                                value={editingRubroName}
                                onChange={(e) => setEditingRubroName(e.target.value)}
                                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveRenameRubro(rubro)}
                                className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingRubroId(null)}
                                className="p-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-slate-900 dark:text-white truncate">
                                  {rubro.name}
                                </span>
                                <span className={cn(
                                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                  rubro.status === 'inactivo'
                                    ? "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                    : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                                )}>
                                  {rubro.status === 'inactivo' ? 'Inactivo' : 'Activo'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRubroId(rubro.id);
                                    setEditingRubroName(rubro.name);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                  title="Renombrar rubro"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleExpenseCatStatus(rubro)}
                                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  {rubro.status === 'inactivo' ? 'Activar' : 'Desactivar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRubro(rubro)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                                  title="Eliminar rubro"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsRubrosManagerOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Listo
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </AnimatePresence>
  );
};
