import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  Tag, 
  AlertTriangle, 
  Check, 
  X, 
  DollarSign, 
  Archive,
  Layers,
  Wallet,
  PackagePlus,
  ShoppingBag,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Product, ProductCategory, FinancialPaymentMethod, ExpenseEntity, ExpenseEntityType } from '../types';
import { 
  subscribeToInventoryCategories, 
  saveInventoryCategories, 
  subscribeToProducts, 
  saveProductInFirestore, 
  deleteProductInFirestore,
  registerMerchandisePurchaseInFirestore,
  subscribeToExpenseCategories,
  saveExpenseCategoryInFirestore,
  deleteExpenseCategoryInFirestore,
  toggleExpenseCategoryStatus,
  subscribeToExpenseItems,
  saveExpenseItemInFirestore,
  deleteExpenseItemInFirestore,
  toggleExpenseItemStatus,
  seedDefaultExpenseCategoriesInFirestore,
  subscribeToExpenseEntities,
  saveExpenseEntityInFirestore
} from '../lib/firestoreSync';

export interface CatalogInventorySectionProps {
  complexId?: string;
  initialTab?: 'sales' | 'expenses';
  hideTopTabs?: boolean;
}

export const CatalogInventorySection: React.FC<CatalogInventorySectionProps> = ({ 
  complexId = 'B',
  initialTab = 'sales',
  hideTopTabs = false
}) => {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;

  // Pestaña principal: 'sales' (Ventas) vs 'expenses' (Gastos)
  const [activeCatalogSection, setActiveCatalogSection] = useState<'sales' | 'expenses'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveCatalogSection(initialTab);
    }
  }, [initialTab]);

  // -------------------------------------------------------------
  // ESTADOS DE VENTAS
  // -------------------------------------------------------------
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ oldName: string; newName: string } | null>(null);
  const [catDeleteWarning, setCatDeleteWarning] = useState<{ category: string; count: number } | null>(null);

  // -------------------------------------------------------------
  // ESTADOS DE COMPRA DE MERCADERÍA / REPOSICIÓN CON MEDIOS MIXTOS
  // -------------------------------------------------------------
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState<1 | 2>(1);
  const [selectedProductForPurchase, setSelectedProductForPurchase] = useState<Product | null>(null);
  const [purchaseQty, setPurchaseQty] = useState<number | string>(10);
  const [purchaseUnitCost, setPurchaseUnitCost] = useState<number | string>('');
  const [purchasePlace, setPurchasePlace] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const [purchasePayments, setPurchasePayments] = useState<Array<{
    id: string;
    method: 'Efectivo' | 'Transferencia' | 'Crédito' | 'Pendiente';
    amount: number | '';
  }>>([
    { id: 'cat_purch_0', method: 'Efectivo', amount: '' }
  ]);

  // Estados para selectores de Rubro y Concepto en Compra de Mercadería
  const [selectedPurchaseRubro, setSelectedPurchaseRubro] = useState<ProductCategory | null>(null);
  const [purchaseRubroSearch, setPurchaseRubroSearch] = useState('');
  const [isPurchaseRubroDropdownOpen, setIsPurchaseRubroDropdownOpen] = useState(false);

  const [selectedPurchaseConcept, setSelectedPurchaseConcept] = useState<Product | null>(null);
  const [purchaseConceptSearch, setPurchaseConceptSearch] = useState('');
  const [isPurchaseConceptDropdownOpen, setIsPurchaseConceptDropdownOpen] = useState(false);

  // Selector de Entidad para Compra de Mercadería (Arquitectura de 3 Dimensiones)
  const [expenseEntities, setExpenseEntities] = useState<ExpenseEntity[]>([]);
  const [selectedPurchaseEntity, setSelectedPurchaseEntity] = useState<ExpenseEntity | null>(null);
  const [purchaseEntitySearch, setPurchaseEntitySearch] = useState('');
  const [isPurchaseEntityDropdownOpen, setIsPurchaseEntityDropdownOpen] = useState(false);
  const [isQuickEntityModalOpen, setIsQuickEntityModalOpen] = useState(false);
  const [quickEntityForm, setQuickEntityForm] = useState<{
    name: string;
    type: ExpenseEntityType;
    phone: string;
    cuit: string;
  }>({
    name: '',
    type: 'Empresa',
    phone: '',
    cuit: ''
  });
  const [quickEntityError, setQuickEntityError] = useState<string | null>(null);
  const [isSavingQuickEntity, setIsSavingQuickEntity] = useState(false);

  const rubroDropdownRef = useRef<HTMLDivElement>(null);
  const conceptDropdownRef = useRef<HTMLDivElement>(null);
  const entityDropdownRef = useRef<HTMLDivElement>(null);
  const hasInitializedPurchaseRubroRef = useRef(false);

  // -------------------------------------------------------------
  // ESTADOS DE GASTOS (RUBROS Y CONCEPTOS)
  // -------------------------------------------------------------
  const [expenseRubros, setExpenseRubros] = useState<ProductCategory[]>([]);
  const [expenseConcepts, setExpenseConcepts] = useState<Product[]>([]);
  const [selectedRubroTab, setSelectedRubroTab] = useState<string>('all');
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [expenseRubroFilterStatus, setExpenseRubroFilterStatus] = useState<'all' | 'active'>('active');

  const [isRubroModalOpen, setIsRubroModalOpen] = useState(false);
  const [newRubroName, setNewRubroName] = useState('');
  const [editingRubro, setEditingRubro] = useState<{ id: string; oldName: string; newName: string; status?: 'activo' | 'inactivo' } | null>(null);

  const [isConceptModalOpen, setIsConceptModalOpen] = useState(false);
  const [editingConcept, setEditingConcept] = useState<{
    id?: string;
    name: string;
    categoryId: string;
    price: number | '';
    status: 'activo' | 'inactivo';
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'rubro' | 'concept' | 'product';
    id: string;
    name: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Suscripciones a Firestore en tiempo real para Ventas, Gastos y Entidades
  useEffect(() => {
    const unsubCats = subscribeToInventoryCategories(targetId, (cats) => {
      setCategories(cats);
    });

    const unsubProds = subscribeToProducts(targetId, (prods) => {
      setProducts(prods);
    });

    const unsubExpCats = subscribeToExpenseCategories(targetId, (cats) => {
      setExpenseRubros(cats);
    });

    const unsubExpItems = subscribeToExpenseItems(targetId, (items) => {
      setExpenseConcepts(items);
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
  }, [targetId]);

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
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(e.target as Node)) {
        setIsPurchaseEntityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Preselección inicial de compra: solo una vez por apertura del modal, y solo si existe preferencia válida
  useEffect(() => {
    if (!isPurchaseModalOpen) {
      hasInitializedPurchaseRubroRef.current = false;
      return;
    }
    if (!hasInitializedPurchaseRubroRef.current && expenseRubros.length > 0) {
      hasInitializedPurchaseRubroRef.current = true;
      try {
        const lastRubroName = localStorage.getItem('jogo_last_purchase_rubro');
        if (lastRubroName) {
          const match = expenseRubros.find(r => r.name.toLowerCase() === lastRubroName.toLowerCase() && r.status !== 'inactivo');
          if (match) {
            setSelectedPurchaseRubro(match);
            setPurchaseRubroSearch(match.name);
          }
        }
      } catch {}
    }
  }, [isPurchaseModalOpen, expenseRubros]);

  const activeExpenseRubros = useMemo(() => {
    return expenseRubros.filter(r => r.status !== 'inactivo');
  }, [expenseRubros]);

  const filteredPurchaseRubros = useMemo(() => {
    const q = normalizeFilterText(purchaseRubroSearch);
    if (!q) return activeExpenseRubros;
    return activeExpenseRubros.filter(r => normalizeFilterText(r.name).includes(q));
  }, [activeExpenseRubros, purchaseRubroSearch]);

  const activeExpenseConcepts = useMemo(() => {
    return expenseConcepts.filter(c => c.status !== 'inactivo');
  }, [expenseConcepts]);

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
        setPurchasePlace('');
      } else {
        setPurchasePlace(`${rubro.name} - ${selectedPurchaseConcept.name}`);
      }
    }
  };

  const handleClearPurchaseRubro = () => {
    setSelectedPurchaseRubro(null);
    setPurchaseRubroSearch('');
    setIsPurchaseRubroDropdownOpen(false);
    if (selectedPurchaseConcept) {
      setPurchasePlace(selectedPurchaseConcept.name);
    } else {
      setPurchasePlace('');
    }
  };

  const handleSelectPurchaseConcept = (concept: Product) => {
    setSelectedPurchaseConcept(concept);
    setPurchaseConceptSearch(concept.name);
    setIsPurchaseConceptDropdownOpen(false);

    // Auto-asignar rubro si no hay uno seleccionado o es diferente
    const catName = concept.categoryName || concept.categoryId;
    let rubroNameToUse = selectedPurchaseRubro?.name || '';
    if (catName) {
      const matched = expenseRubros.find(r => 
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
    setPurchasePlace(placeVal);

    const conceptPrice = Number(concept.purchasePrice || concept.price || 0);
    if (conceptPrice > 0 && (!purchaseUnitCost || Number(purchaseUnitCost) === 0)) {
      setPurchaseUnitCost(conceptPrice);
    }
  };

  const handleOpenAddRubroFromPurchase = () => {
    setNewRubroName(purchaseRubroSearch.trim());
    setActionError(null);
    setIsRubroModalOpen(true);
  };

  const handleOpenAddConceptFromPurchase = () => {
    handleOpenAddConcept(selectedPurchaseRubro?.name || purchaseRubroSearch.trim() || undefined);
    if (purchaseConceptSearch.trim()) {
      setEditingConcept(prev => prev ? ({ ...prev, name: purchaseConceptSearch.trim() }) : prev);
    }
  };

  // Handlers para Rubros de Gastos
  const handleAddRubro = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRubroName.trim();
    if (!clean) return;
    if (expenseRubros.some(r => r.name.toLowerCase() === clean.toLowerCase())) {
      setActionError('Ya existe un rubro con ese nombre.');
      return;
    }
    setActionError(null);
    try {
      const savedId = await saveExpenseCategoryInFirestore(targetId, { name: clean, status: 'activo' });
      setNewRubroName('');
      setIsRubroModalOpen(false);
      if (isPurchaseModalOpen) {
        setPurchaseRubroSearch(clean);
        setSelectedPurchaseRubro({ id: savedId, complejoId: targetId, name: clean, status: 'activo', catalogType: 'expense' });
        try {
          localStorage.setItem('jogo_last_purchase_rubro', clean);
        } catch {}
      }
    } catch (err: any) {
      setActionError(err?.message || 'Error al guardar rubro');
    }
  };

  const handleRenameRubro = async () => {
    if (!editingRubro) return;
    const clean = editingRubro.newName.trim();
    if (!clean || clean === editingRubro.oldName) {
      setEditingRubro(null);
      return;
    }
    setActionError(null);
    try {
      await saveExpenseCategoryInFirestore(targetId, {
        id: editingRubro.id,
        name: clean,
        oldName: editingRubro.oldName,
        status: editingRubro.status || 'activo'
      });
      setEditingRubro(null);
    } catch (err: any) {
      setActionError(err?.message || 'Error al renombrar rubro');
    }
  };

  const handleToggleRubro = async (rubro: ProductCategory) => {
    const nextStatus = rubro.status === 'inactivo' ? 'activo' : 'inactivo';
    await toggleExpenseCategoryStatus(rubro.id, nextStatus);
  };

  const handleDeleteRubro = (rubro: ProductCategory) => {
    setDeleteConfirm({
      type: 'rubro',
      id: rubro.id,
      name: rubro.name
    });
  };

  // Handlers para Conceptos de Gastos
  const handleOpenAddConcept = (defaultRubro?: string) => {
    const rubroName = defaultRubro || (expenseRubros.find(r => r.status !== 'inactivo')?.name) || expenseRubros[0]?.name || 'Servicios';
    setActionError(null);
    setEditingConcept({
      name: '',
      categoryId: rubroName,
      price: '',
      status: 'activo'
    });
    setIsConceptModalOpen(true);
  };

  const handleOpenEditConcept = (concept: Product) => {
    setActionError(null);
    setEditingConcept({
      id: concept.id,
      name: concept.name,
      categoryId: concept.categoryId || concept.categoryName || '',
      price: Number(concept.purchasePrice || concept.price || 0) || '',
      status: concept.status || 'activo'
    });
    setIsConceptModalOpen(true);
  };

  const handleSaveConcept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConcept || !editingConcept.name.trim() || !editingConcept.categoryId) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const cleanName = editingConcept.name.trim();
      const cleanCat = editingConcept.categoryId.trim();
      const savedId = await saveExpenseItemInFirestore(targetId, {
        id: editingConcept.id,
        name: cleanName,
        categoryId: cleanCat,
        categoryName: cleanCat,
        price: Number(editingConcept.price || 0),
        status: editingConcept.status
      });
      setIsConceptModalOpen(false);
      setEditingConcept(null);
      if (isPurchaseModalOpen) {
        setPurchaseConceptSearch(cleanName);
        const placeVal = cleanCat ? `${cleanCat} - ${cleanName}` : cleanName;
        setPurchasePlace(placeVal);
        setSelectedPurchaseConcept({
          id: savedId,
          complejoId: targetId,
          name: cleanName,
          categoryId: cleanCat,
          categoryName: cleanCat,
          purchasePrice: Number(editingConcept.price || 0),
          salePrice: Number(editingConcept.price || 0),
          stock: 0,
          status: editingConcept.status,
          catalogType: 'expense'
        });
        setPurchaseRubroSearch(cleanCat);
        try {
          localStorage.setItem('jogo_last_purchase_rubro', cleanCat);
        } catch {}
        const matched = expenseRubros.find(r => r.name.toLowerCase() === cleanCat.toLowerCase());
        if (matched) {
          setSelectedPurchaseRubro(matched);
        } else {
          setSelectedPurchaseRubro({ id: cleanCat, complejoId: targetId, name: cleanCat, status: 'activo', catalogType: 'expense' });
        }
        if (Number(editingConcept.price || 0) > 0 && (!purchaseUnitCost || Number(purchaseUnitCost) === 0)) {
          setPurchaseUnitCost(Number(editingConcept.price));
        }
      }
    } catch (err: any) {
      console.error('Error guardando concepto de gasto:', err);
      setActionError(err?.message || 'Error al guardar concepto de gasto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleConcept = async (concept: Product) => {
    const nextStatus = concept.status === 'inactivo' ? 'activo' : 'inactivo';
    await toggleExpenseItemStatus(concept.id, nextStatus);
  };

  const handleDeleteConcept = (concept: Product) => {
    setDeleteConfirm({
      type: 'concept',
      id: concept.id,
      name: concept.name
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'rubro') {
        await deleteExpenseCategoryInFirestore(deleteConfirm.id, targetId, true);
        if (selectedRubroTab === deleteConfirm.name) setSelectedRubroTab('all');
      } else if (deleteConfirm.type === 'concept') {
        await deleteExpenseItemInFirestore(deleteConfirm.id, targetId, true);
      } else if (deleteConfirm.type === 'product') {
        await deleteProductInFirestore(deleteConfirm.id, targetId);
      }
    } catch (err: any) {
      console.error('Error al eliminar:', err);
      setActionError(err?.message || 'Error al eliminar');
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Manejo de Categorías de Venta
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCatName.trim();
    if (!clean) return;
    if (categories.map(c => c.toLowerCase()).includes(clean.toLowerCase())) {
      setActionError('Ya existe una categoría con ese nombre.');
      return;
    }
    const updated = [...categories, clean];
    await saveInventoryCategories(targetId, updated);
    setNewCatName('');
    setIsCategoryModalOpen(false);
  };

  const handleRenameCategory = async () => {
    if (!editingCategory) return;
    const clean = editingCategory.newName.trim();
    if (!clean || clean === editingCategory.oldName) {
      setEditingCategory(null);
      return;
    }
    const updated = categories.map(c => c === editingCategory.oldName ? clean : c);
    await saveInventoryCategories(targetId, updated);

    // Actualizar productos asociados a la categoría renombrada
    const associated = products.filter(p => p.categoryId === editingCategory.oldName);
    for (const p of associated) {
      await saveProductInFirestore(targetId, { ...p, categoryId: clean });
    }

    setEditingCategory(null);
  };

  const handleRequestDeleteCategory = (cat: string) => {
    const associatedCount = products.filter(p => p.categoryId === cat).length;
    if (associatedCount > 0) {
      setCatDeleteWarning({ category: cat, count: associatedCount });
    } else {
      executeDeleteCategory(cat);
    }
  };

  const executeDeleteCategory = async (cat: string) => {
    const updated = categories.filter(c => c !== cat);
    await saveInventoryCategories(targetId, updated);
    if (selectedCategoryTab === cat) setSelectedCategoryTab('all');
    setCatDeleteWarning(null);
  };

  // Manejo de Productos
  const handleOpenAddProduct = () => {
    setEditingProduct({
      name: '',
      categoryId: categories[0] || 'Kiosco',
      purchasePrice: 0,
      salePrice: 0,
      stock: 10,
      status: 'activo'
    });
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct({ ...prod });
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.name?.trim()) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await saveProductInFirestore(targetId, editingProduct);
      setIsProductModalOpen(false);
      setEditingProduct(null);
    } catch (err: any) {
      console.error('Error guardando producto:', err);
      setActionError(err?.message || 'Error al guardar el producto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = (prod: Product) => {
    setDeleteConfirm({
      type: 'product',
      id: prod.id,
      name: prod.name
    });
  };

  // -------------------------------------------------------------
  // MANEJO DE COMPRAS DE MERCADERÍA CON PAGOS MIXTOS (PEPS)
  // -------------------------------------------------------------
  const totalPurchaseComputed = useMemo(() => {
    const q = Math.floor(Number(purchaseQty) || 0);
    const c = Math.max(0, Number(purchaseUnitCost) || 0);
    return q * c;
  }, [purchaseQty, purchaseUnitCost]);

  useEffect(() => {
    if (isPurchaseModalOpen && purchasePayments.length <= 1) {
      setPurchasePayments([
        {
          id: purchasePayments[0]?.id || `purch_p_${Date.now()}`,
          method: purchasePayments[0]?.method || 'Efectivo',
          amount: totalPurchaseComputed > 0 ? totalPurchaseComputed : ''
        }
      ]);
    }
  }, [totalPurchaseComputed, isPurchaseModalOpen]);

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

  const handleOpenPurchaseModal = (prod: Product) => {
    setSelectedProductForPurchase(prod);
    setPurchaseStep(1);
    setPurchaseQty(10);
    const cost = Number(prod.purchasePrice || 0);
    setPurchaseUnitCost(cost > 0 ? cost : '');
    setPurchasePlace('');
    // Cargar de manera predeterminada el último rubro usado solo si existe preferencia válida
    let defaultRubro: ProductCategory | null = null;
    try {
      const lastRubroName = localStorage.getItem('jogo_last_purchase_rubro');
      if (lastRubroName) {
        defaultRubro = expenseRubros.find(r => r.name.toLowerCase() === lastRubroName.toLowerCase() && r.status !== 'inactivo') || null;
      }
    } catch {}

    if (defaultRubro) {
      setSelectedPurchaseRubro(defaultRubro);
      setPurchaseRubroSearch(defaultRubro.name);
    } else {
      setSelectedPurchaseRubro(null);
      setPurchaseRubroSearch('');
    }
    hasInitializedPurchaseRubroRef.current = true;
    setIsPurchaseRubroDropdownOpen(false);
    setSelectedPurchaseConcept(null);
    setPurchaseConceptSearch('');
    setIsPurchaseConceptDropdownOpen(false);
    setSelectedPurchaseEntity(null);
    setPurchaseEntitySearch('');
    setIsPurchaseEntityDropdownOpen(false);
    setPurchasePayments([
      { id: `purch_p_${Date.now()}`, method: 'Efectivo', amount: cost * 10 > 0 ? cost * 10 : '' }
    ]);
    setIsPurchaseModalOpen(true);
  };

  const handleProceedPurchaseToPayment = () => {
    const q = Math.floor(Number(purchaseQty) || 0);
    if (isNaN(q) || q <= 0) {
      alert('La cantidad a ingresar debe ser un número entero mayor a 0.');
      return;
    }
    const c = Number(purchaseUnitCost);
    if (isNaN(c) || c < 0) {
      alert('El costo unitario debe ser mayor o igual a 0.');
      return;
    }
    if (totalPurchaseComputed <= 0) {
      alert('El total de la compra debe ser mayor a $0.');
      return;
    }

    if (purchasePayments.length <= 1 && (!purchasePayments[0]?.amount || Number(purchasePayments[0]?.amount) === 0)) {
      setPurchasePayments([
        { id: `purch_p_${Date.now()}`, method: 'Efectivo', amount: totalPurchaseComputed }
      ]);
    } else if (purchasePayments.length === 1) {
      setPurchasePayments([
        { ...purchasePayments[0], amount: totalPurchaseComputed }
      ]);
    }
    setPurchaseStep(2);
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
      { id: `purch_p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, method: selMethod!, amount: newAmt }
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

  const handleConfirmPurchase = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedProductForPurchase) return;

    const qty = Math.floor(Number(purchaseQty));
    if (isNaN(qty) || qty <= 0) {
      alert('La cantidad a comprar debe ser un número entero mayor a 0.');
      return;
    }
    const cost = Number(purchaseUnitCost);
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

    setIsSubmittingPurchase(true);
    try {
      const mapMethod = (m: string): FinancialPaymentMethod => {
        const lower = m.toLowerCase();
        if (lower.includes('efectivo') || lower === 'cash') return 'cash';
        if (lower.includes('transf') || lower === 'transfer') return 'transfer';
        if (lower.includes('tarjeta') || lower.includes('crédito') || lower.includes('credit')) return 'credit';
        return 'cash';
      };

      const finalConceptName = selectedPurchaseConcept?.name || purchaseConceptSearch.trim() || 'Proveedor';
      const finalRubroName = selectedPurchaseRubro?.name || purchaseRubroSearch.trim() || undefined;
      const finalPlace = purchasePlace.trim() || (finalRubroName ? `${finalRubroName} - ${finalConceptName}` : finalConceptName);

      // Guardar en localStorage únicamente si el rubro seleccionado existe y es válido
      if (selectedPurchaseRubro?.name) {
        const isValid = expenseRubros.some(r => r.name.toLowerCase() === selectedPurchaseRubro.name.toLowerCase() && r.status !== 'inactivo');
        if (isValid) {
          try {
            localStorage.setItem('jogo_last_purchase_rubro', selectedPurchaseRubro.name);
          } catch {}
        }
      }

      const paidPayments = purchasePayments
        .filter(p => p.method !== 'Pendiente' && (Number(p.amount) || 0) > 0)
        .map(p => ({
          amount: Number(p.amount),
          paymentMethod: mapMethod(p.method),
          notes: `Pago compra (${p.method}) · ${finalPlace}`
        }));

      await registerMerchandisePurchaseInFirestore({
        complexId: targetId,
        productId: selectedProductForPurchase.id,
        quantity: qty,
        unitCost: cost,
        purchasePlace: finalPlace,
        supplierId: selectedPurchaseEntity?.id || selectedPurchaseConcept?.id,
        expenseCategoryId: selectedPurchaseRubro?.id,
        expenseCategoryName: finalRubroName,
        expenseConceptId: selectedPurchaseConcept?.id,
        expenseConceptName: finalConceptName,
        entityId: selectedPurchaseEntity?.id,
        entityName: selectedPurchaseEntity?.name,
        entityType: selectedPurchaseEntity?.type,
        payments: paidPayments,
        operatorId: 'administrador',
        notes: purchaseNotes.trim() || undefined
      });

      setIsPurchaseModalOpen(false);
      setPurchaseStep(1);
      setSelectedProductForPurchase(null);
      setSelectedPurchaseEntity(null);
    } catch (err: any) {
      console.error('Error registrando compra:', err);
      alert(err?.message || 'Error al registrar la compra.');
    } finally {
      setIsSubmittingPurchase(false);
    }
  };

  const activeExpenseEntities = useMemo(() => {
    return expenseEntities.filter(e => e.status !== 'inactivo');
  }, [expenseEntities]);

  const filteredPurchaseEntities = useMemo(() => {
    const q = normalizeFilterText(purchaseEntitySearch);
    if (!q) return activeExpenseEntities;
    return activeExpenseEntities.filter(e => 
      normalizeFilterText(e.name).includes(q) ||
      (e.cuit && e.cuit.includes(q)) ||
      (e.phone && e.phone.includes(q))
    );
  }, [activeExpenseEntities, purchaseEntitySearch]);

  const handleSelectPurchaseEntity = (entity: ExpenseEntity) => {
    setSelectedPurchaseEntity(entity);
    setPurchaseEntitySearch(entity.name);
    setIsPurchaseEntityDropdownOpen(false);
  };

  const handleCreateQuickEntityFromPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEntityForm.name.trim()) {
      setQuickEntityError('El nombre es obligatorio.');
      return;
    }
    setIsSavingQuickEntity(true);
    setQuickEntityError(null);
    try {
      const cleanName = quickEntityForm.name.trim();
      const savedEntity = await saveExpenseEntityInFirestore(targetId, {
        name: cleanName,
        type: quickEntityForm.type,
        phone: quickEntityForm.phone.trim() || undefined,
        cuit: quickEntityForm.cuit.trim() || undefined,
        status: 'activo'
      });
      setSelectedPurchaseEntity(savedEntity);
      setPurchaseEntitySearch(cleanName);
      setIsQuickEntityModalOpen(false);
      setIsPurchaseEntityDropdownOpen(false);
      setQuickEntityForm({ name: '', type: 'Empresa', phone: '', cuit: '' });
    } catch (err: any) {
      setQuickEntityError(err?.message || 'Error al guardar entidad.');
    } finally {
      setIsSavingQuickEntity(false);
    }
  };

  // Filtrado de productos
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategoryTab === 'all' || p.categoryId === selectedCategoryTab;
    const matchesSearch = searchQuery === '' || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.categoryId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Filtrado de Conceptos de Gasto
  const filteredExpenseConcepts = expenseConcepts.filter((c) => {
    const matchesRubro = selectedRubroTab === 'all' || c.categoryId === selectedRubroTab || c.categoryName === selectedRubroTab;
    const matchesStatus = expenseRubroFilterStatus === 'all' || c.status !== 'inactivo';
    const matchesSearch = expenseSearchQuery === '' || 
      c.name.toLowerCase().includes(expenseSearchQuery.toLowerCase()) ||
      (c.categoryId && c.categoryId.toLowerCase().includes(expenseSearchQuery.toLowerCase())) ||
      (c.categoryName && c.categoryName.toLowerCase().includes(expenseSearchQuery.toLowerCase()));
    return matchesRubro && matchesStatus && matchesSearch;
  });

  return (
    <div className={`bg-white dark:bg-slate-900 space-y-6 ${hideTopTabs ? 'p-0 shadow-none border-0' : 'rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-5 md:p-6'}`}>
      {/* Selector Principal de Sección: Ventas vs Gastos */}
      {!hideTopTabs && (
        <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-2xl w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setActiveCatalogSection('sales')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeCatalogSection === 'sales'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-800'
            }`}
          >
            Ventas (Catálogo de Mostrador)
          </button>
          <button
            type="button"
            onClick={() => setActiveCatalogSection('expenses')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeCatalogSection === 'expenses'
                ? 'bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-xs'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-800'
            }`}
          >
            <Wallet size={15} />
            <span>Gastos (Rubros y Conceptos)</span>
          </button>
        </div>
      )}

      {activeCatalogSection === 'sales' ? (
        <>
          {/* Cabecera de la Sección de Ventas */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Package size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  Editar Mostrador
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold">
                    Catálogo e Inventario
                  </span>
                </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Administrá categorías, precios de venta, costos y stock para el Punto de Venta (Finanzas).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3.5 py-2 text-xs font-bold text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Tag size={14} className="text-gray-500" />
            <span>Categorías</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (products.length > 0) handleOpenPurchaseModal(products[0]);
            }}
            className="px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Registrar compra o reposición de stock con medios mixtos"
          >
            <PackagePlus size={15} />
            <span>Comprar Stock</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAddProduct}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>Nuevo Producto</span>
          </button>
        </div>
      </div>

      {/* 2.A Categorías (Pills) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
          <span>Categorías de Mostrador ({categories.length})</span>
          <button 
            type="button" 
            onClick={() => setIsCategoryModalOpen(true)}
            className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer lowercase first-letter:uppercase"
          >
            + gestionar categorías
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => setSelectedCategoryTab('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategoryTab === 'all'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            Todas ({products.length})
          </button>

          {categories.map((cat) => {
            const count = products.filter(p => p.categoryId === cat).length;
            const isSelected = selectedCategoryTab === cat;
            return (
              <button
                type="button"
                key={`cat-pill-${cat}`}
                onClick={() => setSelectedCategoryTab(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{cat}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-emerald-700/80 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Buscador de Productos */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar producto por nombre o categoría..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-10 pr-4 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
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

      {/* 2.B Lista / Tabla de Productos */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-6">
          <Archive size={36} className="mx-auto text-gray-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-bold text-gray-700 dark:text-slate-300">No hay productos en esta selección</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Agregá tus bebidas, snacks o artículos de kiosco para que tus operadores puedan registrar ventas rápidas desde Finanzas.
          </p>
          <button
            type="button"
            onClick={handleOpenAddProduct}
            className="mt-3 px-4 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl hover:bg-emerald-100 transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus size={14} /> Crear primer producto
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 sm:mx-0">
          <div className="min-w-[620px] px-5 sm:px-0">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-slate-800/80 text-gray-500 dark:text-slate-400 font-bold border-y border-gray-100 dark:border-slate-700/60">
                <tr>
                  <th className="py-2.5 px-3">Producto</th>
                  <th className="py-2.5 px-3">Categoría</th>
                  <th className="py-2.5 px-3">Costo</th>
                  <th className="py-2.5 px-3">Venta</th>
                  <th className="py-2.5 px-3">Margen</th>
                  <th className="py-2.5 px-3">Stock</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {filteredProducts.map((prod) => {
                  const margin = Number(prod.salePrice || 0) - Number(prod.purchasePrice || 0);
                  const marginPct = prod.salePrice > 0 ? Math.round((margin / prod.salePrice) * 100) : 0;
                  const isLowStock = prod.stock <= 5 && prod.stock > 0;
                  const isZeroStock = prod.stock <= 0;

                  return (
                    <tr 
                      key={`prod-row-${prod.id}`}
                      className="hover:bg-gray-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-3">
                        <span className="font-bold text-gray-900 dark:text-white block truncate max-w-[180px]">
                          {prod.name}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300">
                          {prod.categoryId}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-gray-600 dark:text-slate-400">
                        ${Number(prod.purchasePrice || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-gray-900 dark:text-white">
                        ${Number(prod.salePrice || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <span className={`text-[11px] font-bold ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {marginPct}% (+${margin.toLocaleString()})
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                          isZeroStock 
                            ? 'bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-400' 
                            : isLowStock 
                            ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400' 
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {prod.stock} u.
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const newStatus = prod.status === 'activo' ? 'inactivo' : 'activo';
                            saveProductInFirestore(targetId, { ...prod, status: newStatus });
                          }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                            prod.status === 'activo'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                          title="Clic para alternar estado"
                        >
                          {prod.status}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPurchaseModal(prod)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Comprar / Reponer stock con medios mixtos"
                          >
                            <PackagePlus size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditProduct(prod)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Editar producto"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(prod)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            title="Eliminar producto"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 0: REGISTRAR COMPRA DE MERCADERÍA CON MEDIOS MIXTOS (PEPS)          */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isPurchaseModalOpen && selectedProductForPurchase && (
          <div 
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 select-none"
            onClick={() => setIsPurchaseModalOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-lg p-4 sm:p-5 space-y-3.5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  {purchaseStep === 2 && (
                    <button
                      type="button"
                      onClick={() => setPurchaseStep(1)}
                      className="p-1 text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Volver a los datos de la compra"
                    >
                      <ChevronLeft size={20} />
                    </button>
                  )}
                  <div>
                    <h4 className="font-black text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-1.5">
                      <PackagePlus className="text-emerald-600" size={18} />
                      <span>{purchaseStep === 1 ? 'Registrar Compra de Mercadería' : 'Registrar Pago de Compra'}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 ml-1">
                        Paso {purchaseStep} de 2
                      </span>
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {purchaseStep === 1 
                        ? `${selectedProductForPurchase.name} · Stock actual: ${selectedProductForPurchase.stock} u.`
                        : `Distribución de pago · Total: $${totalPurchaseComputed.toLocaleString()}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPurchaseModalOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* PASO 1: DATOS DE LA COMPRA (PRODUCTO, CANTIDAD, COSTO, PROVEEDOR) */}
              {purchaseStep === 1 ? (
                <div className="space-y-3.5">
                  {/* Selector si hay múltiples productos */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Producto a Reponer
                    </label>
                    <select
                      value={selectedProductForPurchase.id}
                      onChange={(e) => {
                        const found = products.find(p => p.id === e.target.value);
                        if (found) {
                          setSelectedProductForPurchase(found);
                          const cost = Number(found.purchasePrice || 0);
                          if (cost > 0) setPurchaseUnitCost(cost);
                        }
                      }}
                      className="w-full h-9.5 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-bold text-gray-900 dark:text-white outline-none"
                    >
                      {products.map(p => (
                        <option key={`purch-opt-${p.id}`} value={p.id}>
                          {p.name} (Stock: {p.stock} u.)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Cantidad y Costo Unitario */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Cantidad a Ingresar *
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={purchaseQty}
                        onChange={(e) => setPurchaseQty(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full h-9.5 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 font-mono text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Costo Unitario ($) *
                      </label>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={purchaseUnitCost}
                        onChange={(e) => setPurchaseUnitCost(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full h-9.5 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 font-mono text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* SELECTORES DE RUBRO Y CONCEPTO DE GASTO / PROVEEDOR */}
                  <div className="space-y-2.5">
                    {/* Selector 1: Rubro de Gasto */}
                    <div className="relative" ref={rubroDropdownRef}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                          <span>Rubro</span>
                          {selectedPurchaseRubro ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                              <span>{selectedPurchaseRubro.name}</span>
                              <button
                                type="button"
                                onClick={handleClearPurchaseRubro}
                                className="hover:text-red-500 cursor-pointer ml-0.5"
                                title="Quitar rubro seleccionado"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ) : (
                            <span className="text-[9px] text-gray-400 font-normal">
                              (Sin seleccionar)
                            </span>
                          )}
                        </label>
                        <button
                          type="button"
                          onClick={handleOpenAddRubroFromPurchase}
                          className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                          title="Crear nuevo rubro de gastos"
                        >
                          <Plus size={12} className="stroke-[3]" />
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
                                setPurchasePlace(selectedPurchaseConcept.name);
                              } else {
                                setPurchasePlace('');
                              }
                            }
                          }}
                          className="w-full h-9.5 pl-3 pr-8 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        {purchaseRubroSearch ? (
                          <button
                            type="button"
                            onClick={handleClearPurchaseRubro}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 cursor-pointer"
                            title="Limpiar búsqueda y quitar selección"
                          >
                            <X size={13} />
                          </button>
                        ) : (
                          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        )}
                      </div>

                      {/* Dropdown Rubros */}
                      {isPurchaseRubroDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700/50">
                          {filteredPurchaseRubros.length > 0 ? (
                            filteredPurchaseRubros.map((r) => {
                              const isSelected = selectedPurchaseRubro?.id === r.id;
                              return (
                                <button
                                  key={`purch-rubro-${r.id}`}
                                  type="button"
                                  onClick={() => handleSelectPurchaseRubro(r)}
                                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-slate-700/80 transition-colors cursor-pointer ${
                                    isSelected ? 'bg-emerald-50/70 dark:bg-slate-700 font-bold text-emerald-700 dark:text-emerald-300' : 'text-gray-700 dark:text-slate-200'
                                  }`}
                                >
                                  <span>{r.name}</span>
                                  {isSelected && <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                </button>
                              );
                            })
                          ) : (
                            <div className="p-3 text-center text-xs text-gray-400 dark:text-slate-400">
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
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                          <span>Concepto</span>
                          {selectedPurchaseConcept && (
                            <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded">
                              {selectedPurchaseConcept.categoryName || selectedPurchaseConcept.categoryId}
                            </span>
                          )}
                        </label>
                        <button
                          type="button"
                          onClick={handleOpenAddConceptFromPurchase}
                          className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                          title="Crear nuevo concepto de gastos"
                        >
                          <Plus size={12} className="stroke-[3]" />
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
                            setPurchasePlace(val);
                            setIsPurchaseConceptDropdownOpen(true);
                            if (!val) {
                              setSelectedPurchaseConcept(null);
                            }
                          }}
                          className="w-full h-9.5 pl-3 pr-8 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        {purchaseConceptSearch ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPurchaseConcept(null);
                              setPurchaseConceptSearch('');
                              setPurchasePlace('');
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        ) : (
                          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        )}
                      </div>

                      {/* Dropdown Conceptos */}
                      {isPurchaseConceptDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700/50">
                          {filteredPurchaseConcepts.length > 0 ? (
                            filteredPurchaseConcepts.map((c) => {
                              const isSelected = selectedPurchaseConcept?.id === c.id;
                              const cRubro = c.categoryName || c.categoryId || '';
                              const cPrice = Number(c.purchasePrice || c.price || 0);
                              return (
                                <button
                                  key={`purch-concept-${c.id}`}
                                  type="button"
                                  onClick={() => handleSelectPurchaseConcept(c)}
                                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-slate-700/80 transition-colors cursor-pointer ${
                                    isSelected ? 'bg-emerald-50/70 dark:bg-slate-700 font-bold text-emerald-700 dark:text-emerald-300' : 'text-gray-700 dark:text-slate-200'
                                  }`}
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="truncate font-semibold">{c.name}</div>
                                    <div className="text-[10px] text-gray-400 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                                      <span className="px-1.5 py-0.2 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">{cRubro}</span>
                                      {cPrice > 0 && <span className="font-mono">${cPrice.toLocaleString()} ref.</span>}
                                    </div>
                                  </div>
                                  {isSelected && <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                </button>
                              );
                            })
                          ) : (
                            <div className="p-3 text-center text-xs text-gray-400 dark:text-slate-400">
                              <p className="mb-1.5">No se encontraron conceptos con "{purchaseConceptSearch}".</p>
                              <button
                                type="button"
                                onClick={handleOpenAddConceptFromPurchase}
                                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={12} />
                                <span>Crear "{purchaseConceptSearch || 'nuevo'}" como Concepto</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3ra Dimensión: Entidad / Proveedor (opcional) */}
                    <div className="relative" ref={entityDropdownRef}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                          <span>Entidad (opcional)</span>
                          {selectedPurchaseEntity && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              {selectedPurchaseEntity.type}
                            </span>
                          )}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setQuickEntityForm({
                              name: purchaseEntitySearch.trim(),
                              type: 'Empresa',
                              phone: '',
                              cuit: ''
                            });
                            setQuickEntityError(null);
                            setIsQuickEntityModalOpen(true);
                          }}
                          className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                          title="Crear nueva entidad al vuelo"
                        >
                          <Plus size={12} className="stroke-[3]" />
                          <span>+ Agregar entidad</span>
                        </button>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Elegir o buscar «Entidad» (empresa, proveedor, persona)..."
                          value={purchaseEntitySearch}
                          onFocus={() => setIsPurchaseEntityDropdownOpen(true)}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPurchaseEntitySearch(val);
                            setIsPurchaseEntityDropdownOpen(true);
                            if (!val) {
                              setSelectedPurchaseEntity(null);
                            }
                          }}
                          className="w-full h-9.5 pl-3 pr-8 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        {purchaseEntitySearch ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPurchaseEntity(null);
                              setPurchaseEntitySearch('');
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        ) : (
                          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        )}
                      </div>

                      {/* Dropdown Entidades */}
                      {isPurchaseEntityDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700/50">
                          {filteredPurchaseEntities.length > 0 ? (
                            filteredPurchaseEntities.map((ent) => {
                              const isSelected = selectedPurchaseEntity?.id === ent.id;
                              return (
                                <button
                                  key={`purch-ent-${ent.id}`}
                                  type="button"
                                  onClick={() => handleSelectPurchaseEntity(ent)}
                                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-slate-700/80 transition-colors cursor-pointer ${
                                    isSelected ? 'bg-emerald-50/70 dark:bg-slate-700 font-bold text-emerald-700 dark:text-emerald-300' : 'text-gray-700 dark:text-slate-200'
                                  }`}
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="truncate font-semibold">{ent.name}</div>
                                    <div className="text-[10px] text-gray-400 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                                      <span className="px-1.5 py-0.2 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">{ent.type}</span>
                                      {ent.cuit && <span className="font-mono">{ent.cuit}</span>}
                                      {ent.phone && <span>Tel: {ent.phone}</span>}
                                    </div>
                                  </div>
                                  {isSelected && <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                </button>
                              );
                            })
                          ) : (
                            <div className="p-3 text-center text-xs text-gray-400 dark:text-slate-400">
                              <p className="mb-1.5">No se encontraron entidades con "{purchaseEntitySearch}".</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setQuickEntityForm({
                                    name: purchaseEntitySearch.trim(),
                                    type: 'Empresa',
                                    phone: '',
                                    cuit: ''
                                  });
                                  setQuickEntityError(null);
                                  setIsQuickEntityModalOpen(true);
                                }}
                                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={12} />
                                <span>Crear "{purchaseEntitySearch || 'nueva'}" como Entidad</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Nota / Factura */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Nota / Factura (opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Factura A-0001-000492, Remito #4492"
                        value={purchaseNotes}
                        onChange={(e) => setPurchaseNotes(e.target.value)}
                        className="w-full h-9.5 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Resumen del Subtotal del Paso 1 */}
                  <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-800/40 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Total de la Compra
                      </span>
                      <span className="text-xl font-black text-gray-900 dark:text-white font-mono">
                        ${totalPurchaseComputed.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                      Ingresarán <strong className="text-gray-800 dark:text-slate-200">{purchaseQty || 0} u.</strong> al inventario valuadas a <strong className="text-gray-800 dark:text-slate-200">${Number(purchaseUnitCost || 0).toLocaleString()} c/u</strong> (lógica PEPS).
                    </p>
                  </div>

                  {/* Botón para continuar a Paso 2 */}
                  <button
                    type="button"
                    onClick={handleProceedPurchaseToPayment}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Continuar al Pago</span>
                    <ChevronRight size={17} />
                  </button>
                </div>
              ) : (
                /* PASO 2: REGISTRAR EL PAGO DE LA COMPRA (IDÉNTICO A VENTAS DE MOSTRADOR) */
                <div className="space-y-3.5">
                  {/* Tarjeta Resumen de la Compra */}
                  <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-800/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                          Total a Pagar
                        </span>
                        <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white font-mono">
                          ${totalPurchaseComputed.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-800 dark:text-slate-200 block truncate max-w-[180px]">
                          {selectedProductForPurchase.name}
                        </span>
                        <span className="text-[11px] font-mono text-gray-500 dark:text-slate-400">
                          {purchaseQty} u. x ${Number(purchaseUnitCost).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-between text-[11px] text-gray-600 dark:text-slate-300">
                      <span>
                        Concepto: <strong className="text-gray-900 dark:text-white">{selectedPurchaseConcept?.name || purchaseConceptSearch.trim() || purchasePlace.trim() || 'Proveedor'}</strong>
                        {(selectedPurchaseRubro?.name || purchaseRubroSearch.trim()) && (
                          <span className="ml-1 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/70 px-1.5 py-0.5 rounded-md font-semibold">
                            {selectedPurchaseRubro?.name || purchaseRubroSearch.trim()}
                          </span>
                        )}
                        {selectedPurchaseEntity && (
                          <span className="ml-1 text-[10px] text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/70 px-1.5 py-0.5 rounded-md font-semibold">
                            {selectedPurchaseEntity.name}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-gray-500">
                        Asignado: ${totalAssignedPurchasePayments.toLocaleString()} / ${totalPurchaseComputed.toLocaleString()}
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
                      className="py-1.5 px-1 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-slate-300 transition-colors text-center cursor-pointer"
                    >
                      100% Efectivo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPurchasePayments([{ id: `purch_p_${Date.now()}`, method: 'Transferencia', amount: totalPurchaseComputed }]);
                      }}
                      className="py-1.5 px-1 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-slate-300 transition-colors text-center cursor-pointer"
                    >
                      100% Transf.
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPurchasePayments([{ id: `purch_p_${Date.now()}`, method: 'Pendiente', amount: totalPurchaseComputed }]);
                      }}
                      className="py-1.5 px-1 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 transition-colors text-center cursor-pointer"
                    >
                      100% Pendiente
                    </button>
                  </div>

              {/* Distribución de Pagos Mixtos */}
              {totalPurchaseComputed > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-gray-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-gray-700 dark:text-slate-300">
                      Distribución de Medios de Pago
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">
                      Asignado: ${totalAssignedPurchasePayments.toLocaleString()} / ${totalPurchaseComputed.toLocaleString()}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {purchasePayments.map((p, idx) => (
                      <div
                        key={`cat-purch-row-${p.id}`}
                        className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-2xs space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            {(['Efectivo', 'Transferencia', 'Crédito', 'Pendiente'] as const).map((m) => {
                              const isSelected = p.method === m;
                              const isPend = m === 'Pendiente';
                              return (
                                <button
                                  key={`cat-purch-m-${p.id}-${m}`}
                                  type="button"
                                  onClick={() => handleChangePurchaseBlockMethod(idx, m)}
                                  className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    isSelected
                                      ? isPend
                                        ? 'bg-amber-600 text-white shadow-2xs'
                                        : 'bg-emerald-600 text-white shadow-2xs'
                                      : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                  }`}
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
                              className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer shrink-0"
                              title="Eliminar método"
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
                                setPurchasePayments(prev => {
                                  const copy = [...prev];
                                  copy[idx] = { ...copy[idx], amount: totalPurchaseComputed };
                                  return copy;
                                });
                              }}
                              className="text-[11px] font-bold text-gray-400 hover:text-gray-900 dark:hover:text-white underline cursor-pointer"
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
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                            <input
                              type="number"
                              min={0}
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
                              className="w-full h-9 pl-6 pr-2.5 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs sm:text-sm font-black text-gray-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {isPurchaseSobra && (
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={handleAutocorrectPurchaseSobrante}
                        className="text-xs font-black text-emerald-600 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <span>Sobran ${purchaseSobrante.toLocaleString()}</span>
                        <span className="text-[10px] text-gray-400 font-normal">(Tocar para autocorregir)</span>
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
                        <span className="text-[10px] text-gray-400 font-normal underline ml-1">(Tocar para autocompletar)</span>
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
                        className="text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={13} />
                        <span>Dividir con otro medio</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Botón de Confirmar Compra y Volver en Paso 2 */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPurchaseStep(1)}
                  className="py-3 px-3.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={isSubmittingPurchase || !isPurchaseMathExact}
                  onClick={() => handleConfirmPurchase()}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <ShoppingBag size={17} />
                  <span>
                    {isSubmittingPurchase 
                      ? 'Procesando Compra...' 
                      : isPurchaseFalta
                      ? `Faltan $${purchaseFaltante.toLocaleString()} por asignar`
                      : isPurchaseSobra
                      ? `Sobran $${purchaseSobrante.toLocaleString()}`
                      : `Confirmar Compra · $${totalPurchaseComputed.toLocaleString()}`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    )}
  </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 1: ALTA / EDICIÓN DE PRODUCTO (ULTRA-COMPACTO MOBILE)                */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isProductModalOpen && editingProduct && (
          <div 
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
            onClick={() => setIsProductModalOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md p-3.5 sm:p-4.5 space-y-2.5 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                <h4 className="font-black text-sm sm:text-base text-gray-900 dark:text-white">
                  {editingProduct.id ? 'Editar Producto' : 'Nuevo Producto'}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                    Nombre del Producto *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Agua Mineral 500ml"
                    value={editingProduct.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full h-8 px-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-gray-900 dark:text-white font-medium text-xs"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                    Categoría *
                  </label>
                  <select
                    value={editingProduct.categoryId || (categories[0] || 'Kiosco')}
                    onChange={(e) => setEditingProduct({ ...editingProduct, categoryId: e.target.value })}
                    className="w-full h-8 px-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-gray-900 dark:text-white font-medium text-xs"
                  >
                    {categories.map((c) => (
                      <option key={`opt-cat-${c}`} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                      Precio Costo ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={editingProduct.purchasePrice ?? ''}
                        onChange={(e) => setEditingProduct({ ...editingProduct, purchasePrice: Number(e.target.value) })}
                        className="w-full h-8 pl-6 pr-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-gray-900 dark:text-white font-bold text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                      Precio Venta ($) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-xs">$</span>
                      <input
                        type="number"
                        min={0}
                        required
                        placeholder="0"
                        value={editingProduct.salePrice ?? ''}
                        onChange={(e) => setEditingProduct({ ...editingProduct, salePrice: Number(e.target.value) })}
                        className="w-full h-8 pl-6 pr-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-gray-900 dark:text-white font-bold text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                      Stock Actual
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editingProduct.stock ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })}
                      className="w-full h-8 px-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-gray-900 dark:text-white font-bold text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                      Estado
                    </label>
                    <div className="flex bg-gray-100 dark:bg-slate-800 p-0.5 rounded-lg h-8">
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...editingProduct, status: 'activo' })}
                        className={`flex-1 rounded-md text-[11px] font-bold transition-all ${
                          editingProduct.status === 'activo'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-gray-500 dark:text-slate-400'
                        }`}
                      >
                        Activo
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...editingProduct, status: 'inactivo' })}
                        className={`flex-1 rounded-md text-[11px] font-bold transition-all ${
                          editingProduct.status === 'inactivo'
                            ? 'bg-gray-600 text-white shadow-2xs'
                            : 'text-gray-500 dark:text-slate-400'
                        }`}
                      >
                        Inactivo
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="flex-1 py-2 rounded-xl font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 transition-colors text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !editingProduct.name || !editingProduct.salePrice}
                    className="flex-[1.5] py-2 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50 text-xs cursor-pointer"
                  >
                    {isSubmitting ? 'Guardando...' : 'Guardar Producto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2: GESTIÓN DE CATEGORÍAS (ABM)                                      */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div 
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
            onClick={() => setIsCategoryModalOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md p-5 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                <h4 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <Tag size={16} className="text-emerald-600" />
                  <span>Gestionar Categorías</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Formulario Agregar */}
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nombre de categoría (ej: Paletas, Merchandising)..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 h-9.5 px-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!newCatName.trim()}
                  className="px-4 h-9.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                >
                  Agregar
                </button>
              </form>

              {/* Lista de Categorías Existentes con Renombrar y Eliminar */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {categories.map((cat) => {
                  const associatedCount = products.filter(p => p.categoryId === cat).length;
                  const isEditingThis = editingCategory?.oldName === cat;

                  return (
                    <div 
                      key={`cat-manage-item-${cat}`}
                      className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-700/60 gap-2"
                    >
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            value={editingCategory.newName}
                            onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                            className="flex-1 h-8 px-2 bg-white dark:bg-slate-800 border border-emerald-500 rounded-lg text-xs font-bold text-gray-900 dark:text-white outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleRenameCategory}
                            className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCategory(null)}
                            className="p-1.5 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-300"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-xs text-gray-900 dark:text-white truncate">
                              {cat}
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium">
                              ({associatedCount} {associatedCount === 1 ? 'producto' : 'productos'})
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingCategory({ oldName: cat, newName: cat })}
                              className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
                              title="Renombrar categoría"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRequestDeleteCategory(cat)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
                              title="Eliminar categoría"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Advertencia si hay productos asociados al intentar eliminar */}
              {catDeleteWarning && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-900 dark:text-amber-200">
                      La categoría <strong>"{catDeleteWarning.category}"</strong> tiene{' '}
                      <strong>{catDeleteWarning.count}</strong> productos asociados. Si la eliminás, esos productos quedarán huérfanos.
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setCatDeleteWarning(null)}
                      className="px-2.5 py-1 text-xs font-bold text-gray-600 hover:text-gray-800"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => executeDeleteCategory(catDeleteWarning.category)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Eliminar de todas formas
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 text-right">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      ) : (
        /* ========================================================================= */
        /* VISTA DE GASTOS (RUBROS Y CONCEPTOS)                                      */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Cabecera de la Sección de Gastos */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400">
                <Wallet size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  Rubros y Conceptos de Gastos
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 font-bold">
                    Egresos
                  </span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Configuración de rubros y conceptos para registrar egresos del complejo.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsRubroModalOpen(true)}
                className="px-3.5 py-2 text-xs font-bold text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Tag size={14} className="text-gray-500" />
                <span>Rubros</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenAddConcept(selectedRubroTab === 'all' ? undefined : selectedRubroTab)}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus size={15} />
                <span>Nuevo Concepto</span>
              </button>
            </div>
          </div>

          {/* Rubros (Pills) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              <span>Rubros de Gasto ({expenseRubros.length})</span>
              <button 
                type="button" 
                onClick={() => setIsRubroModalOpen(true)}
                className="text-red-600 dark:text-red-400 hover:underline cursor-pointer lowercase first-letter:uppercase"
              >
                + gestionar rubros
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              <button
                type="button"
                onClick={() => setSelectedRubroTab('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedRubroTab === 'all'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                Todos ({expenseConcepts.length})
              </button>

              {expenseRubros.map((rubro) => {
                const count = expenseConcepts.filter(c => c.categoryId === rubro.name || c.categoryName === rubro.name).length;
                const isSelected = selectedRubroTab === rubro.name;
                const isInactive = rubro.status === 'inactivo';
                return (
                  <button
                    type="button"
                    key={`rubro-pill-${rubro.id}`}
                    onClick={() => setSelectedRubroTab(rubro.name)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-red-600 text-white shadow-sm'
                        : isInactive
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{rubro.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-red-700/80 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200'}`}>
                      {count}
                    </span>
                    {isInactive && (
                      <span className="text-[9px] uppercase font-bold text-amber-600">Pausado</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Buscador de Conceptos */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar concepto o rubro de gasto..."
              value={expenseSearchQuery}
              onChange={(e) => setExpenseSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
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

          {/* Grilla / Lista de Conceptos de Gasto */}
          {filteredExpenseConcepts.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-6">
              <Wallet className="mx-auto text-gray-300 dark:text-slate-600 mb-3" size={40} />
              <h4 className="font-bold text-gray-700 dark:text-slate-300 text-sm">No se encontraron conceptos de gasto</h4>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                {expenseConcepts.length === 0
                  ? 'Todavía no hay conceptos configurados. Hacé clic en "Nuevo Concepto" para dar de alta uno.'
                  : 'Probá seleccionando otro rubro o limpiá la búsqueda.'}
              </p>
              <button
                type="button"
                onClick={() => handleOpenAddConcept()}
                className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus size={14} />
                <span>Nuevo Concepto</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredExpenseConcepts.map((concept) => {
                const isInactive = concept.status === 'inactivo';
                const refPrice = Number(concept.purchasePrice || concept.price || 0);

                return (
                  <div
                    key={`concept-card-${concept.id}`}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                      isInactive
                        ? 'bg-amber-50/20 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/40 opacity-75'
                        : 'bg-white dark:bg-slate-800/80 border-gray-100 dark:border-slate-800 hover:border-gray-200 shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 truncate max-w-[150px]">
                          {concept.categoryName || concept.categoryId || 'General'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleConcept(concept)}
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                            isInactive
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                          title="Alternar estado activo/inactivo"
                        >
                          {isInactive ? 'Inactivo' : 'Activo'}
                        </button>
                      </div>

                      <h4 className="font-bold text-sm text-gray-900 dark:text-white line-clamp-1">
                        {concept.name}
                      </h4>
                    </div>

                    <div className="pt-2 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-gray-400 block font-medium">Importe Predefinido</span>
                        <span className="font-mono font-bold text-xs text-gray-900 dark:text-white">
                          {refPrice > 0 ? `$${refPrice.toLocaleString()}` : 'Monto libre'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditConcept(concept)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          title="Editar concepto"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConcept(concept)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                          title="Eliminar concepto"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: GESTIÓN DE RUBROS DE GASTO                                         */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isRubroModalOpen && (
          <div 
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
            onClick={() => setIsRubroModalOpen(false)}
          >
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md p-5 space-y-4"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                    <h4 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                      <Tag size={16} className="text-red-600" />
                      <span>Gestionar Rubros de Gasto</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsRubroModalOpen(false)}
                      className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {actionError && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 font-bold flex items-center justify-between">
                      <span>{actionError}</span>
                      <button type="button" onClick={() => setActionError(null)} className="p-1 text-red-400 hover:text-red-600">
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* Formulario nuevo rubro */}
                  <form onSubmit={handleAddRubro} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nuevo rubro (ej. Proveedores, Servicios)..."
                      value={newRubroName}
                      onChange={(e) => setNewRubroName(e.target.value)}
                      className="flex-1 h-9 px-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button
                      type="submit"
                      disabled={!newRubroName.trim()}
                      className="px-3.5 h-9 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      Agregar
                    </button>
                  </form>

                  {/* Lista de rubros existentes */}
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {expenseRubros.map((rubro) => {
                      const associatedCount = expenseConcepts.filter(c => c.categoryId === rubro.name || c.categoryName === rubro.name).length;
                      const isEditing = editingRubro?.id === rubro.id;
                      const isInactive = rubro.status === 'inactivo';

                      return (
                        <div 
                          key={`rubro-row-${rubro.id}`}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                            isInactive ? 'bg-amber-50/30 border-amber-200/60' : 'bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700'
                          }`}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                type="text"
                                value={editingRubro.newName}
                                onChange={(e) => setEditingRubro({ ...editingRubro, newName: e.target.value })}
                                className="flex-1 h-8 px-2 bg-white dark:bg-slate-800 border border-red-500 rounded-lg text-xs font-bold text-gray-900 dark:text-white outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={handleRenameRubro}
                                className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingRubro(null)}
                                className="p-1.5 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-300 cursor-pointer"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-xs text-gray-900 dark:text-white truncate">
                                  {rubro.name}
                                </span>
                                <span className="text-[10px] text-gray-400 font-medium">
                                  ({associatedCount} {associatedCount === 1 ? 'concepto' : 'conceptos'})
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleRubro(rubro)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                    isInactive
                                      ? 'text-amber-600 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100'
                                      : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100'
                                  }`}
                                  title={isInactive ? 'Activar rubro' : 'Pausar rubro'}
                                >
                                  {isInactive ? 'Pausado' : 'Activo'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRubro({ id: rubro.id, oldName: rubro.name, newName: rubro.name, status: rubro.status })}
                                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                  title="Renombrar rubro"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRubro(rubro)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                  title="Eliminar rubro"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 text-right">
                    <button
                      type="button"
                      onClick={() => setIsRubroModalOpen(false)}
                      className="px-4 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cerrar
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* ========================================================================= */}
          {/* MODAL: ALTA / EDICIÓN DE CONCEPTO DE GASTO (CAMPOS EXCLUSIVOS DE GASTO)   */}
          {/* ========================================================================= */}
          <AnimatePresence>
            {isConceptModalOpen && editingConcept && (
              <div 
                className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
                onClick={() => setIsConceptModalOpen(false)}
              >
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md p-5 space-y-4"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                    <h4 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                      <Wallet size={16} className="text-red-600" />
                      <span>{editingConcept.id ? 'Editar Concepto de Gasto' : 'Nuevo Concepto de Gasto'}</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsConceptModalOpen(false)}
                      className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {actionError && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 font-bold flex items-center justify-between">
                      <span>{actionError}</span>
                      <button type="button" onClick={() => setActionError(null)} className="p-1 text-red-400 hover:text-red-600">
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSaveConcept} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                        Nombre del Concepto *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Factura de Luz, Reparación de reflectores..."
                        value={editingConcept.name}
                        onChange={(e) => setEditingConcept({ ...editingConcept, name: e.target.value })}
                        className="w-full h-10 px-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                        Rubro *
                      </label>
                      <select
                        value={editingConcept.categoryId}
                        onChange={(e) => setEditingConcept({ ...editingConcept, categoryId: e.target.value })}
                        className="w-full h-10 px-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none"
                      >
                        {expenseRubros.map((r) => (
                          <option key={`opt-rubro-${r.id}`} value={r.name}>
                            {r.name} {r.status === 'inactivo' ? '(Pausado)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                        Importe Predefinido ($ opcional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0 (o dejar en blanco para monto libre al registrar)"
                        value={editingConcept.price}
                        onChange={(e) => setEditingConcept({ ...editingConcept, price: e.target.value === '' ? '' : Number(e.target.value) })}
                        className="w-full h-10 px-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                        Estado *
                      </label>
                      <select
                        value={editingConcept.status}
                        onChange={(e) => setEditingConcept({ ...editingConcept, status: e.target.value as 'activo' | 'inactivo' })}
                        className="w-full h-10 px-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none"
                      >
                        <option value="activo">Activo</option>
                        <option value="inactivo">Inactivo</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsConceptModalOpen(false)}
                        className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || !editingConcept.name.trim()}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer"
                      >
                        {isSubmitting ? 'Guardando...' : 'Guardar Concepto'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Modal de Confirmación de Eliminación In-App */}
          <AnimatePresence>
            {deleteConfirm && (
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
                onClick={() => setDeleteConfirm(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-sm p-5 space-y-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center shrink-0">
                      <Trash2 size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                        Eliminar {deleteConfirm.type === 'rubro' ? 'Rubro' : deleteConfirm.type === 'concept' ? 'Concepto' : 'Producto'}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        ¿Confirmás la eliminación de <strong className="text-gray-900 dark:text-white font-bold">{deleteConfirm.name}</strong>?
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(null)}
                      className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md cursor-pointer"
                    >
                      Eliminar
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: ALTA RÁPIDA DE ENTIDAD (COMPRA DE MERCADERÍA)                       */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isQuickEntityModalOpen && (
          <div 
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setIsQuickEntityModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-sm space-y-3.5"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                <h4 className="font-black text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <Building2 size={18} className="text-[#0BA70B]" />
                  <span>Nueva Entidad</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsQuickEntityModalOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {quickEntityError && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{quickEntityError}</span>
                </div>
              )}

              <form onSubmit={handleCreateQuickEntityFromPurchase} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Nombre o Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Distribuidora Quilmes SRL, Mayorista Sur..."
                    value={quickEntityForm.name}
                    onChange={(e) => setQuickEntityForm({ ...quickEntityForm, name: e.target.value })}
                    className="w-full h-9 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Tipo de Entidad *
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['Empresa', 'Sector Público', 'Persona', 'ONG', 'Otro'] as ExpenseEntityType[]).map((t) => (
                      <button
                        key={`quick-purch-type-${t}`}
                        type="button"
                        onClick={() => setQuickEntityForm({ ...quickEntityForm, type: t })}
                        className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all truncate cursor-pointer ${
                          quickEntityForm.type === t
                            ? 'bg-[#0BA70B] text-white shadow-2xs'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Teléfono
                    </label>
                    <input
                      type="text"
                      placeholder="11 2345-6789"
                      value={quickEntityForm.phone}
                      onChange={(e) => setQuickEntityForm({ ...quickEntityForm, phone: e.target.value })}
                      className="w-full h-9 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      CUIT / CUIL
                    </label>
                    <input
                      type="text"
                      placeholder="30-12345678-9"
                      value={quickEntityForm.cuit}
                      onChange={(e) => setQuickEntityForm({ ...quickEntityForm, cuit: e.target.value })}
                      className="w-full h-9 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-mono text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0BA70B]"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsQuickEntityModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-bold text-xs hover:bg-gray-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingQuickEntity || !quickEntityForm.name.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-[#0BA70B] hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    {isSavingQuickEntity ? 'Guardando...' : 'Guardar y Usar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
