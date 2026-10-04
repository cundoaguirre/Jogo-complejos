import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Product, User } from '../types';
import { 
  subscribeToProducts, 
  subscribeToInventoryCategories, 
  subscribeToClients,
  executePOSSale 
} from '../lib/firestoreSync';
import { usePOSCart } from './POSCartContext';

interface POSViewProps {
  complexId?: string;
  onNavigateToCatalog?: () => void;
  onNavigateToDebts?: () => void;
}

export const POSView: React.FC<POSViewProps> = ({ 
  complexId = 'B',
  onNavigateToCatalog,
  onNavigateToDebts
}) => {
  const targetId = (!complexId || complexId === 'complejo_central') ? 'B' : complexId;

  const { 
    items: cartItems, 
    addToCart, 
    updateQuantity, 
    removeItem, 
    clearCart, 
    total: cartTotal, 
    totalUnits 
  } = usePOSCart();

  // State: Catalog
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // State: Clients
  const [clients, setClients] = useState<User[]>([]);
  const [selectedClient, setSelectedClient] = useState<User | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  // State: Payment configuration
  // Payment methods: 'efectivo' | 'transferencia' | 'tarjeta' | 'fiado'
  const [paymentMode, setPaymentMode] = useState<'single' | 'split'>('single');
  const [singleMethod, setSingleMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'fiado'>('efectivo');
  
  // For split payments
  const [splitAmounts, setSplitAmounts] = useState<{
    efectivo: number;
    transferencia: number;
    tarjeta: number;
    fiado: number;
  }>({
    efectivo: 0,
    transferencia: 0,
    tarjeta: 0,
    fiado: 0
  });

  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saleSuccessData, setSaleSuccessData] = useState<{
    txId: string;
    total: number;
    payments: { method: string; amount: number }[];
    clientName?: string;
    itemsCount: number;
  } | null>(null);

  // Mobile cart sheet visibility
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Subscriptions to Firestore
  useEffect(() => {
    const unsubProds = subscribeToProducts(targetId, (prods) => {
      setProducts(prods);
    });

    const unsubCats = subscribeToInventoryCategories(targetId, (cats) => {
      setCategories(cats);
    });

    const unsubClients = subscribeToClients(targetId, (cls) => {
      setClients(cls);
    });

    return () => {
      unsubProds();
      unsubCats();
      unsubClients();
    };
  }, [targetId]);

  // Filtered products (only active products for POS sales)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const isActive = p.status !== 'inactivo';
      const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
      const matchesSearch = !searchQuery.trim() || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.categoryId.toLowerCase().includes(searchQuery.toLowerCase());
      return isActive && matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Filtered clients for quick search
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 10);
    const q = clientSearch.toLowerCase();
    return clients.filter(c => 
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    ).slice(0, 10);
  }, [clients, clientSearch]);

  // Calculate split payment sum and remaining
  const splitTotalAssigned = useMemo(() => {
    return (
      Number(splitAmounts.efectivo || 0) +
      Number(splitAmounts.transferencia || 0) +
      Number(splitAmounts.tarjeta || 0) +
      Number(splitAmounts.fiado || 0)
    );
  }, [splitAmounts]);

  const splitRemaining = cartTotal - splitTotalAssigned;

  // Set single method preset
  const handleSelectSingleMethod = (method: 'efectivo' | 'transferencia' | 'tarjeta' | 'fiado') => {
    setSingleMethod(method);
    setPaymentMode('single');
  };

  // Helper to get active payments array
  const getPaymentsPayload = (): { method: 'efectivo' | 'transferencia' | 'tarjeta' | 'fiado'; amount: number }[] => {
    if (paymentMode === 'single') {
      return [{ method: singleMethod, amount: cartTotal }];
    } else {
      const list: { method: 'efectivo' | 'transferencia' | 'tarjeta' | 'fiado'; amount: number }[] = [];
      if (splitAmounts.efectivo > 0) list.push({ method: 'efectivo', amount: splitAmounts.efectivo });
      if (splitAmounts.transferencia > 0) list.push({ method: 'transferencia', amount: splitAmounts.transferencia });
      if (splitAmounts.tarjeta > 0) list.push({ method: 'tarjeta', amount: splitAmounts.tarjeta });
      if (splitAmounts.fiado > 0) list.push({ method: 'fiado', amount: splitAmounts.fiado });
      return list;
    }
  };

  // Check if current sale involves 'fiado'
  const hasFiado = paymentMode === 'single' ? singleMethod === 'fiado' : splitAmounts.fiado > 0;

  // Process and submit POS sale
  const handleConfirmSale = async () => {
    if (cartItems.length === 0) {
      alert('El carrito está vacío. Agregá al menos un producto.');
      return;
    }

    if (cartTotal <= 0) {
      alert('El total debe ser mayor a cero.');
      return;
    }

    // Split validation
    if (paymentMode === 'split' && Math.abs(splitRemaining) > 0.01) {
      alert(`El total asignado ($${splitTotalAssigned.toLocaleString()}) no coincide con el total de la venta ($${cartTotal.toLocaleString()}). Resta asignar: $${splitRemaining.toLocaleString()}`);
      return;
    }

    // Fiado validation: client is required to track debt
    if (hasFiado && !selectedClient) {
      alert('Para ventas a fiado (cuenta corriente) es obligatorio seleccionar o asociar un cliente para imputar la deuda.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payments = getPaymentsPayload();
      const transactionItems = cartItems.map(it => ({
        productId: it.product.id,
        name: it.product.name,
        quantity: it.quantity,
        unitPrice: Number(it.product.salePrice || 0),
        subtotal: Number(it.product.salePrice || 0) * it.quantity
      }));

      const txId = await executePOSSale({
        complejoId: targetId,
        items: transactionItems,
        payments,
        total: cartTotal,
        userId: selectedClient?.id ? String(selectedClient.id) : undefined,
        userName: selectedClient?.name || (clientSearch.trim() || undefined),
        notes: notes.trim() || undefined
      });

      // Show success modal
      setSaleSuccessData({
        txId,
        total: cartTotal,
        payments,
        clientName: selectedClient?.name,
        itemsCount: totalUnits
      });

      // Clear local state
      clearCart();
      setSelectedClient(null);
      setClientSearch('');
      setNotes('');
      setSplitAmounts({ efectivo: 0, transferencia: 0, tarjeta: 0, fiado: 0 });
      setIsMobileCartOpen(false);
    } catch (err: any) {
      console.error('Error al registrar venta POS:', err);
      alert(`Error al procesar la venta: ${err?.message || 'Reintentá nuevamente.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Quick Access Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <ShoppingCart size={22} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Punto de Venta (Mostrador)
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold">
                Caja Rápida
              </span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Registrá ventas directas de kiosco, buffet y bebidas con actualización de stock y deudas en tiempo real.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onNavigateToDebts && (
            <button
              type="button"
              onClick={onNavigateToDebts}
              className="px-3 py-2 text-xs font-bold text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Clock size={14} className="text-amber-500" />
              <span>Cuentas Corrientes</span>
            </button>
          )}
          {onNavigateToCatalog && (
            <button
              type="button"
              onClick={onNavigateToCatalog}
              className="px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-950 border border-emerald-200/60 dark:border-emerald-800 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Package size={14} />
              <span>Editar Catálogo</span>
            </button>
          )}
        </div>
      </div>

      {/* Main POS Interface: Split into Products (Left) and Cart/Checkout (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* =================================================================== */}
        {/* LEFT COLUMN: PRODUCT BROWSER (Cols 1-7)                             */}
        {/* =================================================================== */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search and Category Pills */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 space-y-3 shadow-xs">
            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por producto o categoría..."
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

            {/* Category Filter Pills */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                Todos ({products.filter(p => p.status !== 'inactivo').length})
              </button>

              {categories.map((cat) => {
                const count = products.filter(p => p.status !== 'inactivo' && p.categoryId === cat).length;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    type="button"
                    key={`pos-cat-${cat}`}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-emerald-700/80 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Products Grid */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-8 text-center">
              <Package size={40} className="mx-auto text-gray-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200">No se encontraron productos activos</p>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                {products.length === 0 
                  ? 'Aún no cargaste productos en el catálogo de este complejo.' 
                  : 'Probá con otra categoría o término de búsqueda.'}
              </p>
              {onNavigateToCatalog && products.length === 0 && (
                <button
                  type="button"
                  onClick={onNavigateToCatalog}
                  className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} /> Ir a Cargar Productos
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.map((product) => {
                const cartMatch = cartItems.find(it => it.product.id === product.id);
                const isOutOfStock = product.stock <= 0;
                const isLowStock = product.stock > 0 && product.stock <= 5;

                return (
                  <motion.div
                    key={`prod-pos-card-${product.id}`}
                    whileTap={!isOutOfStock ? { scale: 0.97 } : undefined}
                    onClick={() => {
                      if (!isOutOfStock) {
                        addToCart(product);
                      }
                    }}
                    className={`bg-white dark:bg-slate-900 rounded-2xl border p-3.5 flex flex-col justify-between transition-all select-none relative group ${
                      isOutOfStock
                        ? 'opacity-60 border-gray-200 dark:border-slate-800 cursor-not-allowed'
                        : 'border-gray-200/80 dark:border-slate-800 hover:border-emerald-500 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    {/* Badge if item in cart */}
                    {cartMatch && (
                      <div className="absolute -top-2 -right-2 bg-emerald-600 text-white font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-slate-900 z-10 animate-scale">
                        {cartMatch.quantity}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 truncate">
                          {product.categoryId}
                        </span>
                        {/* Stock indicator badge */}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isOutOfStock
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300'
                            : isLowStock
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        }`}>
                          {isOutOfStock ? 'Agotado' : `${product.stock} u.`}
                        </span>
                      </div>

                      <h4 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white line-clamp-2 min-h-[2.5rem]">
                        {product.name}
                      </h4>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-800/80 flex items-center justify-between">
                      <span className="text-sm sm:text-base font-black text-gray-900 dark:text-white tracking-tight">
                        ${Number(product.salePrice || 0).toLocaleString()}
                      </span>
                      
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs transition-colors ${
                          isOutOfStock 
                            ? 'bg-gray-100 dark:bg-slate-800 text-gray-400' 
                            : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
                        }`}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* RIGHT COLUMN: CART & CHECKOUT TICKET (Cols 8-12)                   */}
        {/* =================================================================== */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-5 space-y-5 shadow-sm sticky top-4">
          
          {/* Header Ticket */}
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Receipt size={20} className="text-emerald-600" />
              <h3 className="font-bold text-base text-gray-900 dark:text-white">
                Ticket de Venta
              </h3>
            </div>
            {cartItems.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Vaciar</span>
              </button>
            )}
          </div>

          {/* Cart Item List */}
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {cartItems.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-slate-500">
                <ShoppingCart size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs font-medium">El carrito está vacío</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Tocá cualquier producto de la izquierda para sumar.</p>
              </div>
            ) : (
              cartItems.map((item) => {
                const itemSubtotal = Number(item.product.salePrice || 0) * item.quantity;
                return (
                  <div
                    key={`cart-item-${item.product.id}`}
                    className="flex items-center justify-between gap-2 p-2.5 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-700/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                        {item.product.name}
                      </p>
                      <p className="text-[11px] text-gray-500 font-mono">
                        ${Number(item.product.salePrice || 0).toLocaleString()} c/u
                      </p>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-gray-900 dark:text-white font-mono">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {/* Item subtotal & delete */}
                    <div className="text-right shrink-0 min-w-[60px]">
                      <p className="text-xs font-black text-gray-900 dark:text-white font-mono">
                        ${itemSubtotal.toLocaleString()}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer"
                      >
                        quitar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Total Bar */}
          <div className="bg-emerald-50 dark:bg-emerald-950/50 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-900/60 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Total a Cobrar
              </span>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                {totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'}
              </p>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
              ${cartTotal.toLocaleString()}
            </div>
          </div>

          {/* Client Selector (Required for Fiado, Optional for other methods) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-gray-600 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <UserIcon size={14} className="text-gray-400" />
                <span>Cliente {hasFiado ? <strong className="text-red-500">* (Obligatorio)</strong> : '(Opcional)'}</span>
              </span>
              {selectedClient && (
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="text-gray-400 hover:text-red-500 cursor-pointer"
                >
                  Desvincular
                </button>
              )}
            </div>

            {selectedClient ? (
              <div className="p-3 bg-gray-50 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">
                    {selectedClient.name}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {selectedClient.phone || 'Sin teléfono'}
                  </p>
                </div>
                {Number(selectedClient.debt || 0) > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300">
                    Deuda: ${Number(selectedClient.debt).toLocaleString()}
                  </span>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar cliente registrado o escribir nombre..."
                  value={clientSearch}
                  onFocus={() => setIsClientDropdownOpen(true)}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setIsClientDropdownOpen(true);
                  }}
                  className="w-full h-9.5 px-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />

                {isClientDropdownOpen && filteredClients.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
                    {filteredClients.map((c) => (
                      <button
                        type="button"
                        key={`pos-client-opt-${c.id}`}
                        onClick={() => {
                          setSelectedClient(c);
                          setClientSearch(c.name);
                          setIsClientDropdownOpen(false);
                        }}
                        className="w-full text-left p-2.5 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center justify-between transition-colors cursor-pointer text-xs"
                      >
                        <div>
                          <span className="font-bold text-gray-900 dark:text-white block">
                            {c.name}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {c.phone || c.email || 'Cliente registrado'}
                          </span>
                        </div>
                        {Number(c.debt || 0) > 0 && (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-950/60 px-1.5 py-0.5 rounded">
                            Debe ${Number(c.debt).toLocaleString()}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-gray-600 dark:text-slate-400">
              <span>Método de Pago</span>
              <button
                type="button"
                onClick={() => {
                  if (paymentMode === 'single') {
                    setPaymentMode('split');
                    setSplitAmounts({
                      efectivo: cartTotal,
                      transferencia: 0,
                      tarjeta: 0,
                      fiado: 0
                    });
                  } else {
                    setPaymentMode('single');
                  }
                }}
                className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                {paymentMode === 'single' ? '+ Pago Mixto / Dividir' : 'Volver a Pago Simple'}
              </button>
            </div>

            {paymentMode === 'single' ? (
              /* Single Payment Buttons */
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'efectivo', label: 'Efectivo', icon: DollarSign },
                  { id: 'transferencia', label: 'Transferencia / MP', icon: ArrowRightLeft },
                  { id: 'tarjeta', label: 'Tarjeta Débito/Créd.', icon: CreditCard },
                  { id: 'fiado', label: 'Fiado (Cta. Corriente)', icon: Clock }
                ].map((item) => {
                  const isSelected = singleMethod === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={`single-pay-${item.id}`}
                      type="button"
                      onClick={() => handleSelectSingleMethod(item.id as any)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? item.id === 'fiado'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                            : 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon size={15} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Split Payment Inputs */
              <div className="p-3 bg-gray-50 dark:bg-slate-800/80 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-2.5">
                {[
                  { key: 'efectivo', label: 'Efectivo', icon: DollarSign },
                  { key: 'transferencia', label: 'Transferencia / MP', icon: ArrowRightLeft },
                  { key: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
                  { key: 'fiado', label: 'Fiado (Deuda)', icon: Clock }
                ].map((m) => (
                  <div key={`split-row-${m.key}`} className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-gray-700 dark:text-slate-300 flex items-center gap-1.5 w-36">
                      <m.icon size={13} className="text-gray-400" />
                      <span>{m.label}</span>
                    </span>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">$</span>
                      <input
                        type="number"
                        min={0}
                        value={splitAmounts[m.key as keyof typeof splitAmounts] || ''}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setSplitAmounts(prev => ({ ...prev, [m.key]: val }));
                        }}
                        placeholder="0"
                        className="w-full h-8 pl-6 pr-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                  </div>
                ))}

                <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between text-xs font-bold">
                  <span>Asignado: ${splitTotalAssigned.toLocaleString()}</span>
                  <span className={Math.abs(splitRemaining) < 0.01 ? 'text-emerald-600' : 'text-red-500'}>
                    {Math.abs(splitRemaining) < 0.01 
                      ? '✓ Cuadrado' 
                      : `Falta: $${splitRemaining.toLocaleString()}`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes input */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-slate-400 mb-1">
              Notas u Observaciones (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Turno 20hs, retiro por cantina..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-8.5 px-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleConfirmSale}
            disabled={isSubmitting || cartItems.length === 0 || (paymentMode === 'split' && Math.abs(splitRemaining) > 0.01)}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-900/20 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Impactando Venta en Firestore...</span>
              </>
            ) : (
              <>
                <Check size={18} />
                <span>Confirmar y Cobrar (${cartTotal.toLocaleString()})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL: SALE SUCCESS CONFIRMATION                                      */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {saleSuccessData && (
          <div 
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setSaleSuccessData(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-sm text-center space-y-4"
            >
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white">
                  ¡Venta Registrada!
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  La transacción y el descuento de stock se impactaron en Firestore con éxito.
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-slate-800/80 rounded-2xl border border-gray-100 dark:border-slate-700/60 text-left text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-gray-500">
                  <span>Comprobante:</span>
                  <span className="font-bold text-gray-700 dark:text-slate-300 truncate max-w-[150px]">
                    {saleSuccessData.txId}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Artículos:</span>
                  <span className="font-bold text-gray-800 dark:text-white">{saleSuccessData.itemsCount} u.</span>
                </div>
                {saleSuccessData.clientName && (
                  <div className="flex justify-between text-gray-500">
                    <span>Cliente:</span>
                    <span className="font-bold text-gray-800 dark:text-white">{saleSuccessData.clientName}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between text-sm font-black text-emerald-600">
                  <span>Total Cobrado:</span>
                  <span>${saleSuccessData.total.toLocaleString()}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSaleSuccessData(null)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Nueva Venta
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
