import React, { useState, useEffect } from 'react';
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
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Product } from '../types';
import { 
  subscribeToInventoryCategories, 
  saveInventoryCategories, 
  subscribeToProducts, 
  saveProductInFirestore, 
  deleteProductInFirestore 
} from '../lib/firestoreSync';

export const CatalogInventorySection: React.FC<{ complexId?: string }> = ({ complexId = 'B' }) => {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;

  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modales y estados de edición
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ oldName: string; newName: string } | null>(null);
  const [catDeleteWarning, setCatDeleteWarning] = useState<{ category: string; count: number } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Suscripciones a Firestore en tiempo real
  useEffect(() => {
    const unsubCats = subscribeToInventoryCategories(targetId, (cats) => {
      setCategories(cats);
    });

    const unsubProds = subscribeToProducts(targetId, (prods) => {
      setProducts(prods);
    });

    return () => {
      uncats();
      unsubProds();
    };
    function uncats() { unsubCats(); }
  }, [targetId]);

  // Manejo de Categorías
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCatName.trim();
    if (!clean) return;
    if (categories.map(c => c.toLowerCase()).includes(clean.toLowerCase())) {
      alert('Ya existe una categoría con ese nombre.');
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
    try {
      await saveProductInFirestore(targetId, editingProduct);
      setIsProductModalOpen(false);
      setEditingProduct(null);
    } catch (err) {
      console.error('Error guardando producto:', err);
      alert('Error al guardar el producto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (prod: Product) => {
    if (!window.confirm(`¿Deseas eliminar el producto "${prod.name}"? Si posee ventas históricas pasará a estado Inactivo.`)) {
      return;
    }
    try {
      await deleteProductInFirestore(prod.id, targetId);
    } catch (err) {
      console.error('Error al eliminar producto:', err);
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

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-5 md:p-6 space-y-6">
      {/* Cabecera de la Sección */}
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
    </div>
  );
};
