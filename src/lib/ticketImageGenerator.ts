import { safeFormatDate } from './utils';
import { es } from 'date-fns/locale';

export interface TicketImageData {
  ticketCode: string;
  creationDate: any;
  complexName: string;
  complexPhone?: string;
  operationType: string;
  categoryOrRubro?: string;
  clientOrEntityLabel: 'Cliente' | 'Entidad';
  clientOrEntityName: string;
  clientOrEntityPhone?: string;
  players?: Array<{
    name: string;
    phone?: string;
    isHost?: boolean;
    amountPaid?: number;
  }>;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  bookingInfo?: {
    courtName: string;
    date: string;
    timeRange: string;
    isCancelled?: boolean;
  };
  expenseInfo?: {
    concept: string;
    category: string;
  };
  contractualAmount: number;
  totalCollected: number;
  amountPending: number;
  isExpenseOrPurchase: boolean;
  movements?: Array<{
    method: string;
    date?: any;
    amount: number;
  }>;
}

export const JOGO_LOGO_URL = '/assets/aistudio/Photoroom-20260208_161338_e1bc74ca.png';

function loadLogoImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 800);
  });
}

// ============================================================================
// CANVAS VECTOR ICONS (Zero emojis, zero stickers, crisp canvas paths)
// ============================================================================
function drawStoreIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Canopy
  ctx.beginPath();
  ctx.moveTo(x + 1.5, y + size * 0.42);
  ctx.lineTo(x + size * 0.22, y + 2);
  ctx.lineTo(x + size * 0.78, y + 2);
  ctx.lineTo(x + size - 1.5, y + size * 0.42);
  ctx.closePath();
  ctx.stroke();
  // Building base
  ctx.strokeRect(x + size * 0.16, y + size * 0.42, size * 0.68, size * 0.52);
  // Door
  ctx.strokeRect(x + size * 0.38, y + size * 0.58, size * 0.24, size * 0.36);
  ctx.restore();
}

function drawPhoneIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.25, y + size * 0.35);
  ctx.bezierCurveTo(x + size * 0.2, y + size * 0.7, x + size * 0.45, y + size * 0.95, x + size * 0.8, y + size * 0.82);
  ctx.lineTo(x + size * 0.88, y + size * 0.65);
  ctx.lineTo(x + size * 0.68, y + size * 0.55);
  ctx.lineTo(x + size * 0.58, y + size * 0.65);
  ctx.bezierCurveTo(x + size * 0.45, y + size * 0.55, x + size * 0.4, y + size * 0.45, x + size * 0.45, y + size * 0.35);
  ctx.lineTo(x + size * 0.35, y + size * 0.2);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTicketIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const w = size;
  const h = size * 0.72;
  const topY = y + (size - h) / 2;
  ctx.beginPath();
  ctx.moveTo(x + 2, topY);
  ctx.lineTo(x + w * 0.55, topY);
  ctx.arc(x + w * 0.55, topY, 2.5, 0, Math.PI, false);
  ctx.lineTo(x + w - 2, topY);
  ctx.lineTo(x + w - 2, topY + h);
  ctx.lineTo(x + w * 0.55, topY + h);
  ctx.arc(x + w * 0.55, topY + h, 2.5, 0, Math.PI, true);
  ctx.lineTo(x + 2, topY + h);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawUserIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const r = size * 0.22;
  const cx = x + size / 2;
  const cy = y + size * 0.28;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, y + size * 0.95, size * 0.42, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();
}

function drawBuildingIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeRect(x + 2, y + 2, size * 0.58, size - 4);
  // Windows
  ctx.strokeRect(x + 5, y + 5, 2.5, 2.5);
  ctx.strokeRect(x + 5, y + 9.5, 2.5, 2.5);
  // Side wing
  ctx.strokeRect(x + size * 0.58 + 2, y + size * 0.4, size * 0.35 - 3, size * 0.6 - 2);
  ctx.restore();
}

function drawCalendarIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeRect(x + 2, y + size * 0.22, size - 4, size * 0.72);
  ctx.beginPath();
  ctx.moveTo(x + 2, y + size * 0.46);
  ctx.lineTo(x + size - 2, y + size * 0.46);
  ctx.moveTo(x + size * 0.3, y + 1);
  ctx.lineTo(x + size * 0.3, y + size * 0.26);
  ctx.moveTo(x + size * 0.7, y + 1);
  ctx.lineTo(x + size * 0.7, y + size * 0.26);
  ctx.stroke();
  ctx.restore();
}

function drawClockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2 - 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - r * 0.58);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.48, cy);
  ctx.stroke();
  ctx.restore();
}

function drawCircleDollarIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2 - 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(size * 0.65)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', cx, cy + 0.5);
  ctx.restore();
}

function drawLandmarkIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Roof pediment
  ctx.beginPath();
  ctx.moveTo(x + 2, y + size * 0.35);
  ctx.lineTo(x + size / 2, y + 2);
  ctx.lineTo(x + size - 2, y + size * 0.35);
  ctx.closePath();
  ctx.stroke();
  // Columns
  ctx.beginPath();
  ctx.moveTo(x + 1, y + size - 2);
  ctx.lineTo(x + size - 1, y + size - 2);
  ctx.moveTo(x + size * 0.25, y + size * 0.35);
  ctx.lineTo(x + size * 0.25, y + size - 2);
  ctx.moveTo(x + size * 0.5, y + size * 0.35);
  ctx.lineTo(x + size * 0.5, y + size - 2);
  ctx.moveTo(x + size * 0.75, y + size * 0.35);
  ctx.lineTo(x + size * 0.75, y + size - 2);
  ctx.stroke();
  ctx.restore();
}

function drawCreditCardIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const h = size * 0.72;
  const topY = y + (size - h) / 2;
  ctx.strokeRect(x + 1.5, topY, size - 3, h);
  ctx.beginPath();
  ctx.moveTo(x + 1.5, topY + h * 0.35);
  ctx.lineTo(x + size - 1.5, topY + h * 0.35);
  ctx.stroke();
  ctx.restore();
}

// Header box large vector icons (28x28 in 56x56 box)
function drawCalendarHeaderIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + size * 0.2, size - 4, size * 0.75, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 2, y + size * 0.45);
  ctx.lineTo(x + size - 2, y + size * 0.45);
  ctx.moveTo(x + size * 0.3, y + 1);
  ctx.lineTo(x + size * 0.3, y + size * 0.25);
  ctx.moveTo(x + size * 0.7, y + 1);
  ctx.lineTo(x + size * 0.7, y + size * 0.25);
  ctx.stroke();
  ctx.restore();
}

function drawShoppingBagHeaderIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + size * 0.3, size - 4, size * 0.65, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size * 0.3, size * 0.24, Math.PI, 0, false);
  ctx.stroke();
  ctx.restore();
}

function drawWalletHeaderIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 4, size - 4, size - 8, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(x + size * 0.55, y + size * 0.32, size * 0.45 - 2, size * 0.36, [3, 0, 0, 3]);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + size * 0.7, y + size * 0.5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPaymentMethodIcon(ctx: CanvasRenderingContext2D, method: string, x: number, y: number, size: number, color: string) {
  const lower = method.toLowerCase();
  if (lower.includes('transf')) {
    drawLandmarkIcon(ctx, x, y, size, color);
  } else if (lower.includes('tarj') || lower.includes('credit') || lower.includes('debit') || lower.includes('mercadopago') || lower.includes('mercado_pago')) {
    drawCreditCardIcon(ctx, x, y, size, color);
  } else if (lower.includes('fiado') || lower.includes('pend') || lower.includes('cuenta corriente')) {
    drawClockIcon(ctx, x, y, size, color);
  } else {
    drawCircleDollarIcon(ctx, x, y, size, color);
  }
}

export async function generateThermalTicketBlob(data: TicketImageData): Promise<Blob | null> {
  const width = 640;
  
  const isBooking = data.operationType.toLowerCase().includes('reserva');
  const isExpense = data.operationType.toLowerCase().includes('gasto');
  const isPurchase = data.operationType.toLowerCase().includes('compra');

  // Estimate height dynamically based on players, items, and movements
  const playersCount = data.players && data.players.length > 0 ? data.players.length : 1;
  const itemsCount = data.items && data.items.length > 0 ? data.items.length : (isBooking ? 3 : 1);
  const movementsCount = data.movements && data.movements.length > 0 ? data.movements.length : 1;
  
  const estimatedHeight = 560 + (playersCount * 26) + (itemsCount * 36) + (movementsCount * 26);
  const height = Math.max(800, estimatedHeight);

  const canvas = document.createElement('canvas');
  const scale = 2; // High-res Retina 2x
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);

  // Background subtle canvas outer
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, width, height);

  // Card dimensions
  const cardX = 24;
  const cardY = 24;
  const cardW = width - 48;
  const cardH = height - 48;
  const numNotches = 25;

  // Draw thermal paper with punched top edge (NO DIVIDING LINE UNDER TEETH)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cardX, cardY + 10);
  
  // Top punched teeth (notches)
  const notchSpacing = cardW / numNotches;
  for (let i = 0; i < numNotches; i++) {
    const toothStartX = cardX + i * notchSpacing;
    const toothMidX = toothStartX + notchSpacing / 2;
    const toothEndX = toothStartX + notchSpacing;

    ctx.lineTo(toothStartX, cardY);
    ctx.arc(toothMidX, cardY, notchSpacing / 3, Math.PI, 0, true);
    ctx.lineTo(toothEndX, cardY);
  }

  // Right edge down
  ctx.lineTo(cardX + cardW, cardY + cardH);
  // Bottom edge
  ctx.lineTo(cardX, cardY + cardH);
  // Left edge up
  ctx.closePath();

  // Paper Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Subtle clean outer perimeter border (no cut across under the teeth!)
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const leftX = cardX + 38;
  const rightX = cardX + cardW - 38;
  let y = cardY + 36;

  const drawDivider = (currentY: number) => {
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftX, currentY);
    ctx.lineTo(rightX, currentY);
    ctx.stroke();
  };

  // =========================================================================
  // 1. ENCABEZADO: Icon Square + Title + Complex name / phone + Date
  // =========================================================================
  let iconBg = '#eff6ff';
  let iconFg = '#1d63b8';
  let headerTitle = 'Mostrador';

  if (isBooking) {
    iconBg = '#ecfdf5';
    iconFg = '#0BA70B';
    headerTitle = 'Reserva';
  } else if (isPurchase) {
    iconBg = '#f5f3ff';
    iconFg = '#7c12e8';
    const firstItem = Array.isArray(data.items) && data.items.length > 0 ? (data.items[0] as any) : null;
    const cat = firstItem?.categoryName || firstItem?.category || data.categoryOrRubro || 'Mercadería';
    headerTitle = `Compra • ${cat}`;
  } else if (isExpense) {
    iconBg = '#fef2f2';
    iconFg = '#e53e3e';
    headerTitle = data.categoryOrRubro ? `Gasto • ${data.categoryOrRubro}` : 'Gasto • Servicios';
  }

  // Draw icon box (56x56)
  const boxSize = 56;
  const boxRadius = 16;
  ctx.fillStyle = iconBg;
  ctx.beginPath();
  ctx.roundRect(leftX, y, boxSize, boxSize, boxRadius);
  ctx.fill();

  // Draw clean vector icon inside icon box
  const iconInnerSize = 28;
  const iconInnerX = leftX + (boxSize - iconInnerSize) / 2;
  const iconInnerY = y + (boxSize - iconInnerSize) / 2;

  if (isBooking) {
    drawCalendarHeaderIcon(ctx, iconInnerX, iconInnerY, iconInnerSize, iconFg);
  } else if (isPurchase || isExpense) {
    drawWalletHeaderIcon(ctx, iconInnerX, iconInnerY, iconInnerSize, iconFg);
  } else {
    // Mostrador: ShoppingBag icon (NEVER Store)
    drawShoppingBagHeaderIcon(ctx, iconInnerX, iconInnerY, iconInnerSize, iconFg);
  }

  // Right texts of header
  const textLeftX = leftX + boxSize + 16;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Title in black font-800
  ctx.fillStyle = '#111827';
  ctx.font = '800 17px system-ui, -apple-system, sans-serif';
  ctx.fillText(headerTitle, textLeftX, y + 2);

  // Sede (left) & complex phone (right) in unified gray #6b7280
  const sedeY = y + 26;
  drawStoreIcon(ctx, textLeftX, sedeY, 13, '#6b7280');
  ctx.fillStyle = '#6b7280';
  ctx.font = '500 12px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.complexName, textLeftX + 17, sedeY + 1);

  if (data.complexPhone) {
    ctx.textAlign = 'right';
    drawPhoneIcon(ctx, rightX - ctx.measureText(data.complexPhone).width - 15, sedeY, 12, '#6b7280');
    ctx.fillText(data.complexPhone, rightX, sedeY + 1);
    ctx.textAlign = 'left';
  }

  // Creation date in format d MMM, yyyy, HH:mm in unified gray #6b7280
  const emissionDate = data.creationDate?.toDate 
    ? data.creationDate.toDate() 
    : (data.creationDate ? new Date(data.creationDate) : new Date());
  const rawCreation = safeFormatDate(emissionDate, "d MMM, yyyy, HH:mm", { locale: es });
  const formattedCreationDate = rawCreation ? rawCreation.replace(/\./g, '') : 'Reciente';

  ctx.fillStyle = '#6b7280';
  ctx.font = '500 11px system-ui, -apple-system, sans-serif';
  ctx.fillText(formattedCreationDate, textLeftX, y + 44);

  y += 74;
  drawDivider(y);
  y += 18;

  // =========================================================================
  // 2. SECCIÓN INFORMACIÓN
  // =========================================================================
  ctx.fillStyle = '#111827';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText('Información', leftX, y);
  y += 24;

  // Ticket code with vector ticket icon in #6b7280
  const cleanCode = data.ticketCode.replace(/^#/, '').toUpperCase();
  drawTicketIcon(ctx, leftX, y, 14, '#6b7280');
  ctx.fillStyle = '#6b7280';
  ctx.font = '500 12px system-ui, -apple-system, sans-serif';
  ctx.fillText(`#${cleanCode}`, leftX + 20, y + 1);
  y += 22;

  // Client / Entity / Players in #6b7280
  if (isBooking && data.players && data.players.length > 0) {
    data.players.forEach(p => {
      ctx.textAlign = 'left';
      drawUserIcon(ctx, leftX, y, 14, '#6b7280');
      ctx.fillStyle = '#6b7280';
      ctx.font = '500 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(p.name || 'Jugador', leftX + 20, y + 1);

      if (p.phone) {
        ctx.textAlign = 'right';
        drawPhoneIcon(ctx, rightX - ctx.measureText(p.phone).width - 15, y, 12, '#6b7280');
        ctx.fillStyle = '#6b7280';
        ctx.fillText(p.phone, rightX, y + 1);
      }
      y += 22;
    });
  } else {
    ctx.textAlign = 'left';
    if (data.isExpenseOrPurchase) {
      drawBuildingIcon(ctx, leftX, y, 14, '#6b7280');
    } else {
      drawUserIcon(ctx, leftX, y, 14, '#6b7280');
    }
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(data.clientOrEntityName || (data.isExpenseOrPurchase ? 'Proveedor' : 'Consumidor final'), leftX + 20, y + 1);

    if (data.clientOrEntityPhone) {
      ctx.textAlign = 'right';
      drawPhoneIcon(ctx, rightX - ctx.measureText(data.clientOrEntityPhone).width - 15, y, 12, '#6b7280');
      ctx.fillStyle = '#6b7280';
      ctx.fillText(data.clientOrEntityPhone, rightX, y + 1);
    }
    y += 22;
  }

  y += 8;
  drawDivider(y);
  y += 18;

  // =========================================================================
  // 3. SECCIÓN CONCEPTO
  // =========================================================================
  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText('Concepto', leftX, y);
  y += 24;

  if (isBooking) {
    // A. RESERVA: Fila 1 Cancha (left) + Total (right) en #6b7280
    const courtTitle = data.bookingInfo?.courtName || 'Cancha 1';
    const isCancelled = data.bookingInfo?.isCancelled;
    const courtDisplay = isCancelled ? `${courtTitle} (cancelado)` : courtTitle;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(courtDisplay, leftX, y);

    ctx.textAlign = 'right';
    ctx.fillText(`$${data.contractualAmount.toLocaleString('es-AR')}`, rightX, y);
    y += 20;

    // Fila 2: Calendar icon + match date in d MMM, yyyy en #a8aeb8 (gris 370, 10px)
    let formattedBookingDate = data.bookingInfo?.date || '';
    if (formattedBookingDate.includes('-')) {
      try {
        const [year, month, day] = formattedBookingDate.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        const raw = safeFormatDate(d, "d MMM, yyyy", { locale: es });
        formattedBookingDate = raw ? raw.replace(/\./g, '') : formattedBookingDate;
      } catch {
        // Keep raw
      }
    }
    ctx.textAlign = 'left';
    drawCalendarIcon(ctx, leftX, y, 13, '#a8aeb8');
    ctx.fillStyle = '#a8aeb8';
    ctx.font = '400 10px system-ui, -apple-system, sans-serif';
    ctx.fillText(formattedBookingDate, leftX + 18, y + 1);
    y += 18;

    // Fila 3: Clock icon + match time range: De 20:00 a 21:00 en #a8aeb8 (gris 370, 10px)
    let formattedTime = data.bookingInfo?.timeRange || '20:00 a 21:00';
    if (!formattedTime.toLowerCase().startsWith('de ')) {
      formattedTime = `De ${formattedTime}`;
    }
    drawClockIcon(ctx, leftX, y, 13, '#a8aeb8');
    ctx.fillStyle = '#a8aeb8';
    ctx.font = '400 10px system-ui, -apple-system, sans-serif';
    ctx.fillText(formattedTime, leftX + 18, y + 1);
    y += 24;

  } else if (isExpense && data.expenseInfo) {
    // GASTO: Fila 1 Concepto + Monto en #6b7280
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(data.expenseInfo.concept || 'Gasto Operativo', leftX, y);

    ctx.textAlign = 'right';
    ctx.fillText(`$${data.contractualAmount.toLocaleString('es-AR')}`, rightX, y);
    y += 24;

  } else if (data.items && data.items.length > 0) {
    // B / C. MOSTRADOR O COMPRAS:
    // Fila 1: Nombre del producto (izq) y total (der) en #6b7280
    // Fila 2: Cantidad y precio/costo unitario: 2u x $5.000 c/u en #a8aeb8 (gris 370, 10px)
    data.items.forEach(it => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#6b7280';
      ctx.font = '500 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(it.name, leftX, y);

      ctx.textAlign = 'right';
      ctx.fillText(`$${it.subtotal.toLocaleString('es-AR')}`, rightX, y);
      y += 18;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#a8aeb8';
      ctx.font = '400 10px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${it.quantity}u x $${it.unitPrice.toLocaleString('es-AR')} c/u`, leftX, y);
      y += 22;
    });
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(isPurchase ? 'Compra de mercadería' : 'Venta de mostrador', leftX, y);

    ctx.textAlign = 'right';
    ctx.fillText(`$${data.contractualAmount.toLocaleString('es-AR')}`, rightX, y);
    y += 18;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a8aeb8';
    ctx.font = '400 10px system-ui, -apple-system, sans-serif';
    ctx.fillText(`1u x $${data.contractualAmount.toLocaleString('es-AR')} c/u`, leftX, y);
    y += 22;
  }

  // Renglón de Total en #111827 font-800
  y += 4;
  ctx.strokeStyle = '#f3f4f6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(rightX, y);
  ctx.stroke();
  y += 16;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827';
  ctx.font = '800 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('Total', leftX, y);

  ctx.textAlign = 'right';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(`$${data.contractualAmount.toLocaleString('es-AR')}`, rightX, y);
  y += 24;

  drawDivider(y);
  y += 18;

  // =========================================================================
  // 4. SECCIÓN MÉTODO DE PAGO / COBRO
  // =========================================================================
  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.isExpenseOrPurchase ? 'Método de pago' : 'Método de cobro', leftX, y);
  y += 24;

  // Métodos de pago: ícono representativo + método (izq), monto (der) en #6b7280 SIN fecha ni hora
  if (data.movements && data.movements.length > 0) {
    data.movements.forEach(m => {
      ctx.textAlign = 'left';
      drawPaymentMethodIcon(ctx, m.method, leftX, y, 14, '#6b7280');

      ctx.fillStyle = '#6b7280';
      ctx.font = '500 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(m.method, leftX + 20, y + 1);

      ctx.textAlign = 'right';
      ctx.fillText(`$${m.amount.toLocaleString('es-AR')}`, rightX, y + 1);
      y += 22;
    });
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(data.isExpenseOrPurchase ? 'Sin pagos registrados' : 'Sin cobros registrados', leftX, y);
    ctx.textAlign = 'right';
    ctx.fillText('$0', rightX, y);
    y += 22;
  }

  // Falta cobrar / Falta pagar como título uniforme (text-[15px] font-extrabold SIEMPRE NEGRO)
  y += 4;
  ctx.strokeStyle = '#f3f4f6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(rightX, y);
  ctx.stroke();
  y += 16;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827'; // SIEMPRE NEGRO
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.isExpenseOrPurchase ? 'Falta pagar' : 'Falta cobrar', leftX, y);

  ctx.textAlign = 'right';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = data.amountPending > 0 ? '#dc2626' : '#111827';
  ctx.fillText(`$${data.amountPending.toLocaleString('es-AR')}`, rightX, y);
  y += 32;

  // =========================================================================
  // 5. PIE DEL TICKET: NOS VEMOS EN LA CANCHA! (en gris claro) + LOGO
  // =========================================================================
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(rightX, y);
  ctx.stroke();
  ctx.setLineDash([]);

  y += 22;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9ca3af'; // Lema en gris claro
  ctx.font = '800 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('NOS VEMOS EN LA CANCHA!', cardX + cardW / 2, y);

  y += 20;
  // Load and draw Jogo logo
  const logoImg = await loadLogoImage(JOGO_LOGO_URL);
  if (logoImg) {
    const logoW = 100;
    const aspect = logoImg.height / (logoImg.width || 1);
    const logoH = logoW * aspect;
    ctx.drawImage(logoImg, (cardX + cardW / 2) - (logoW / 2), y, logoW, logoH);
  } else {
    ctx.fillStyle = '#0BA70B';
    ctx.font = '900 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('Jogo', cardX + cardW / 2, y + 16);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export async function shareOrDownloadTicketImage(data: TicketImageData, onToast?: (msg: string) => void): Promise<void> {
  const blob = await generateThermalTicketBlob(data);
  if (!blob) return;

  const cleanCode = data.ticketCode.replace(/^#/, '').toUpperCase();
  const fileName = `Ticket_${cleanCode}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  if (navigator.share && (navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `Ticket ${cleanCode} - ${data.complexName}`,
        files: [file]
      });
      return;
    } catch {
      // User cancelled
    }
  }

  // Auto download fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  onToast?.('Comprobante descargado');
}
