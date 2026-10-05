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
  ArrowRight
} from 'lucide-react';
import type { Product, ProductCategory, InventoryMovement } from '../types';
import { 
  subscribeToInventoryCategories, 
  saveInventoryCategories, 
  subscribeToProducts, 
  saveProductInFirestore, 
  deleteProductInFirestore,
  subscribeToProductMovements,
  adjustProductStockInFirestore
} from '../lib/firestoreSync';
import { cn } from '../lib/utils';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

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

  // View state: 'categories' | 'products'
  const [activeTab, setActiveTab] = useState<'categories' | 'products'>('categories');
  // Selected category context when navigating into a specific category
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Data states
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals inside the Mostrador
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productModalMode, setProductModalMode] = useState<'create' | 'edit'>('create');
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

  // Selected product for Detail Bottom Sheet
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Stock Adjustment inline modal
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

    return () => {
      unsubCats();
      unsubProds();
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
    setProductForm({
      id: prod.id,
      name: prod.name,
      categoryId: prod.categoryId,
      stock: prod.stock,
      purchasePrice: prod.purchasePrice,
      salePrice: prod.salePrice,
      status: prod.status || 'activo'
    });
    setIsProductModalOpen(true);
  };

  const isProductFormValid = useMemo(() => {
    return (
      productForm.name.trim().length > 0 &&
      productForm.categoryId.trim().length > 0 &&
      productForm.purchasePrice !== '' &&
      Number(productForm.purchasePrice) >= 0 &&
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
      purchasePrice: Number(productForm.purchasePrice),
      salePrice: Number(productForm.salePrice),
      status: productForm.status
    };

    const savedId = await saveProductInFirestore(targetId, payload);
    setIsProductModalOpen(false);

    // If currently viewing detail of this product, update it
    if (selectedProduct && selectedProduct.id === savedId) {
      setSelectedProduct({
        ...selectedProduct,
        ...payload,
        id: savedId
      } as Product);
    }
  };

  // Stock manual adjustment handler
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
    } catch (e) {
      console.error('Error adjusting stock:', e);
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
      if (isYesterday(movementDate)) {
        return `Ayer${timePart}`;
      }
      return `${format(movementDate, 'dd/MM/yyyy')}${timePart}`;
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        {/* Backdrop: closes modal on tap */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        />

        {/* Bottom Sheet Container: 70% to 85% screen height */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full h-[82vh] max-h-[85vh] min-h-[70vh] bg-white dark:bg-slate-900 rounded-t-[2.5rem] shadow-2xl border-t border-slate-200/80 dark:border-slate-800 flex flex-col overflow-hidden z-10"
        >
          {/* Top Drag Indicator */}
          <div className="w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-5 pt-1 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {selectedCategory ? (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
                >
                  <ChevronLeft size={18} />
                  <span>Categorías</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                    <Store size={18} />
                  </div>
                  <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                    Mostrador
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
            /* Main Segmented Switcher: Categorías | Productos */
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl flex-1 max-w-sm">
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
                <div className="relative flex-1 max-w-xs">
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

          {/* Main Content Area (Vertically Scrollable) */}
          <div className="flex-1 overflow-y-auto px-5 py-4 pb-28 space-y-3">
            {/* 1. Vista "Categorías" (default) */}
            {activeTab === 'categories' && !selectedCategory && (
              <>
                {categories.length === 0 ? (
                  /* Empty state: Todavía no hay categorías */
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
                  /* Compact categories list */
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
                            {/* Nombre en negro y negrita */}
                            <h4 className="font-bold text-slate-900 dark:text-white text-base">
                              {cat}
                            </h4>
                            {/* Cantidad de productos en gris, menor tamaño */}
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

            {/* 2. Vista de productos dentro de una categoría O pestaña general Productos */}
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
                          {/* Two-column distribution: Lado izquierdo | Lado derecho */}
                          <div className="grid grid-cols-2 gap-4 items-center">
                            {/* Lado izquierdo */}
                            <div className="space-y-2">
                              {/* Nombre del producto como elemento visual principal */}
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
                              {/* Unidades */}
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
          </div>

          {/* Floating Action Button (FAB): Bottom Right Corner */}
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
                  ? 'Nueva categoría'
                  : 'Agregar producto'
              }
            >
              <Plus size={24} className="group-hover:rotate-90 transition-transform duration-200" />
            </button>
          </div>
        </motion.div>

        {/* Modal / Card Flotante: Nueva Categoría */}
        <AnimatePresence>
          {isCategoryModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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

        {/* Modal: Nuevo Producto / Editar Producto */}
        <AnimatePresence>
          {isProductModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsProductModalOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 z-10 space-y-4 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {productModalMode === 'create' ? 'Nuevo producto' : 'Editar producto'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveProduct} className="space-y-3.5">
                  {/* Nombre */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Coca-Cola 500 ml"
                      value={productForm.name}
                      onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  {/* Categoría: predeterminada automáticamente */}
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
                          <option key={`opt-cat-${c}`} value={c}>
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

                  {/* Unidades (default: 10) */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Unidades {productModalMode === 'create' && '(Predeterminado: 10)'} *
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={productForm.stock}
                      onChange={(e) => setProductForm({ ...productForm, stock: e.target.value === '' ? '' : Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  {/* Costo & Precio de venta */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Costo ($) *
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

                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Precio de venta ($) *
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
                  </div>

                  {/* Estado (default: Activo) */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Estado
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
                      {productModalMode === 'create' ? 'Agregar' : 'Guardar cambios'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 9. Detalle del Producto (Bottom Sheet) */}
        <AnimatePresence>
          {selectedProduct && (
            <div className="fixed inset-0 z-[70] flex flex-col justify-end">
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
                className="relative w-full max-h-[85vh] bg-white dark:bg-slate-900 rounded-t-[2.5rem] shadow-2xl border-t border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden z-10"
              >
                {/* Drag handle */}
                <div className="w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
                  <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                </div>

                {/* Encabezado: Nombre grande y destacado, Categoría debajo en gris */}
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
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
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
                <div className="p-6 overflow-y-auto space-y-6">
                  {/* 10. Resumen financiero del producto: Costo | Venta | Margen */}
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

                  {/* 11. Stock actual & Acciones */}
                  <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">
                          Stock disponible
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
                          + Agregar stock
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
                          − Retirar stock
                        </button>
                      </div>
                    </div>

                    {/* Stock adjustment inline form */}
                    {isAdjustStockOpen && (
                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {adjustType === 'restock' ? 'Agregar reposición' : 'Retirar unidades (Ajuste)'}
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
                              placeholder={adjustType === 'restock' ? 'Ej. Compra mayorista' : 'Ej. Merma o rotura'}
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
                          {isSavingStock ? 'Guardando...' : 'Confirmar movimiento'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 12. Historial del producto */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">
                      Historial
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
      </div>
    </AnimatePresence>
  );
};
