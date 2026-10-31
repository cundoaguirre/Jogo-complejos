import { safeFormatDate } from './utils';

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
    date: any;
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
    // Timeout fallback after 800ms so generation is instant
    setTimeout(() => resolve(null), 800);
  });
}

export async function generateThermalTicketBlob(data: TicketImageData): Promise<Blob | null> {
  const width = 640;
  
  // Estimate height dynamically based on players, items, and movements
  const playersCount = data.players && data.players.length > 0 ? data.players.length : 1;
  const itemsCount = data.items && data.items.length > 0 ? data.items.length : 1;
  const movementsCount = data.movements && data.movements.length > 0 ? data.movements.length : 1;
  
  const estimatedHeight = 540 + (playersCount * 28) + (itemsCount * 26) + (movementsCount * 26);
  const height = Math.max(760, estimatedHeight);

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
  const notchRadius = 7;
  const numNotches = 25;

  // Draw thermal paper with punched top edge
  ctx.save();
  ctx.beginPath();
  // Start at top-left below notch
  ctx.moveTo(cardX, cardY + notchRadius + 4);
  
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

  // Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // Draw subtle inner border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(cardX, cardY + notchRadius + 4, cardW, cardH - notchRadius - 4);

  const leftX = cardX + 38;
  const rightX = cardX + cardW - 38;
  let y = cardY + 44;

  const drawDivider = (currentY: number) => {
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftX, currentY);
    ctx.lineTo(rightX, currentY);
    ctx.stroke();
  };

  // =========================================================================
  // 1. ENCABEZADO: Icon Square + Title + Complex name / phone + Date
  // =========================================================================
  const isBooking = data.operationType.toLowerCase().includes('reserva');
  const isExpense = data.operationType.toLowerCase().includes('gasto');
  const isPurchase = data.operationType.toLowerCase().includes('compra');

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
    headerTitle = data.categoryOrRubro ? `Compra • ${data.categoryOrRubro}` : 'Compra';
  } else if (isExpense) {
    iconBg = '#fef2f2';
    iconFg = '#e53e3e';
    headerTitle = data.categoryOrRubro ? `Gasto • ${data.categoryOrRubro}` : 'Gasto';
  }

  // Draw icon box (56x56)
  const boxSize = 56;
  const boxRadius = 16;
  ctx.fillStyle = iconBg;
  ctx.beginPath();
  ctx.roundRect(leftX, y, boxSize, boxSize, boxRadius);
  ctx.fill();

  // Draw simple stylized symbol inside icon box
  ctx.fillStyle = iconFg;
  ctx.font = '900 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const iconLetter = isBooking ? '📅' : isExpense || isPurchase ? '💳' : '🛍️';
  ctx.fillText(iconLetter, leftX + boxSize / 2, y + boxSize / 2 + 1);

  // Right texts
  const textLeftX = leftX + boxSize + 16;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Title
  ctx.fillStyle = '#111827';
  ctx.font = '800 17px system-ui, -apple-system, sans-serif';
  ctx.fillText(headerTitle, textLeftX, y + 2);

  // Complex name + phone
  ctx.fillStyle = '#374151';
  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.fillText(`🏟 ${data.complexName}`, textLeftX, y + 24);

  if (data.complexPhone) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4b5563';
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(`📞 ${data.complexPhone}`, rightX, y + 24);
    ctx.textAlign = 'left';
  }

  // Creation date
  const emissionStr = safeFormatDate(data.creationDate, 'dd/MM/yyyy HH:mm') || 'Reciente';
  ctx.fillStyle = '#6b7280';
  ctx.font = '500 12px system-ui, -apple-system, sans-serif';
  ctx.fillText(emissionStr, textLeftX, y + 42);

  y += 76;
  drawDivider(y);
  y += 20;

  // =========================================================================
  // 2. SECCIÓN INFORMACIÓN
  // =========================================================================
  ctx.fillStyle = '#111827';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText('Información', leftX, y);
  y += 24;

  // Ticket code
  const cleanCode = data.ticketCode.replace(/^#/, '').toUpperCase();
  ctx.fillStyle = '#374151';
  ctx.font = '600 13px monospace';
  ctx.fillText(`🎟 #${cleanCode}`, leftX, y);
  y += 22;

  // Client / Entity / Players
  if (isBooking && data.players && data.players.length > 0) {
    data.players.forEach(p => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#374151';
      ctx.font = '600 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(`👤 ${p.name || 'Jugador'}`, leftX, y);

      if (p.phone) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#4b5563';
        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        ctx.fillText(`📞 ${p.phone}`, rightX, y);
      }
      y += 22;
    });
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#374151';
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    const icon = data.isExpenseOrPurchase ? '🏢' : '👤';
    ctx.fillText(`${icon} ${data.clientOrEntityName}`, leftX, y);

    if (data.clientOrEntityPhone) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#4b5563';
      ctx.font = '600 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(`📞 ${data.clientOrEntityPhone}`, rightX, y);
    }
    y += 22;
  }

  y += 10;
  drawDivider(y);
  y += 20;

  // =========================================================================
  // 3. SECCIÓN CONCEPTO
  // =========================================================================
  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText('Concepto', leftX, y);
  y += 24;

  if (isBooking && data.bookingInfo) {
    ctx.fillStyle = '#374151';
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    const desc = `${data.bookingInfo.courtName} • ${data.bookingInfo.timeRange} • ${data.bookingInfo.date}`;
    ctx.fillText(desc, leftX, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#111827';
    ctx.font = '700 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(`$${data.contractualAmount.toLocaleString('es-AR')}`, rightX, y);
    y += 24;
  } else if (isExpense && data.expenseInfo) {
    ctx.fillStyle = '#374151';
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(data.expenseInfo.concept || 'Gasto Operativo', leftX, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#111827';
    ctx.font = '700 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(`$${data.contractualAmount.toLocaleString('es-AR')}`, rightX, y);
    y += 24;
  } else if (data.items && data.items.length > 0) {
    data.items.forEach(it => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#374151';
      ctx.font = '600 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${it.quantity}x ${it.name}`, leftX, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#111827';
      ctx.font = '700 14px system-ui, -apple-system, sans-serif';
      ctx.fillText(`$${it.subtotal.toLocaleString('es-AR')}`, rightX, y);
      y += 22;
    });
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#374151';
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(data.operationType, leftX, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#111827';
    ctx.font = '700 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(`$${data.contractualAmount.toLocaleString('es-AR')}`, rightX, y);
    y += 24;
  }

  // Total line
  y += 4;
  ctx.strokeStyle = '#f3f4f6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(rightX, y);
  ctx.stroke();
  y += 18;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827';
  ctx.font = '800 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('Total', leftX, y);

  ctx.textAlign = 'right';
  ctx.font = '800 16px system-ui, -apple-system, sans-serif';
  ctx.fillText(`$${data.contractualAmount.toLocaleString('es-AR')}`, rightX, y);
  y += 24;

  drawDivider(y);
  y += 20;

  // =========================================================================
  // 4. SECCIÓN MÉTODO DE PAGO / COBRO
  // =========================================================================
  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.isExpenseOrPurchase ? 'Método de pago' : 'Método de cobro', leftX, y);
  y += 24;

  if (data.movements && data.movements.length > 0) {
    data.movements.forEach(m => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#111827';
      ctx.font = '700 13px system-ui, -apple-system, sans-serif';
      const mDateStr = safeFormatDate(m.date, 'dd/MM/yyyy HH:mm') || '';
      ctx.fillText(m.method, leftX, y);

      if (mDateStr) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '500 11px system-ui, -apple-system, sans-serif';
        ctx.fillText(` (${mDateStr})`, leftX + ctx.measureText(m.method).width + 20, y + 1);
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = '#111827';
      ctx.font = '700 14px system-ui, -apple-system, sans-serif';
      ctx.fillText(`$${m.amount.toLocaleString('es-AR')}`, rightX, y);
      y += 22;
    });
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9ca3af';
    ctx.font = '500 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(data.isExpenseOrPurchase ? 'Sin pagos registrados' : 'Sin cobros registrados', leftX, y);
    ctx.textAlign = 'right';
    ctx.fillText('$0', rightX, y);
    y += 22;
  }

  // Falta cobrar / Falta pagar
  y += 4;
  ctx.strokeStyle = '#f3f4f6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(rightX, y);
  ctx.stroke();
  y += 18;

  ctx.textAlign = 'left';
  ctx.fillStyle = data.amountPending > 0 ? '#dc2626' : '#111827';
  ctx.font = '800 13px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.isExpenseOrPurchase ? 'Falta pagar' : 'Falta cobrar', leftX, y);

  ctx.textAlign = 'right';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(`$${data.amountPending.toLocaleString('es-AR')}`, rightX, y);
  y += 32;

  // =========================================================================
  // 5. PIE DEL TICKET: NOS VEMOS EN LA CANCHA! + JOGO LOGO
  // =========================================================================
  // Dashed divider
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(rightX, y);
  ctx.stroke();
  ctx.setLineDash([]);

  y += 24;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = '900 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('NOS VEMOS EN LA CANCHA!', cardX + cardW / 2, y);

  y += 22;
  // Load and draw Jogo logo
  const logoImg = await loadLogoImage(JOGO_LOGO_URL);
  if (logoImg) {
    const logoW = 100;
    const aspect = logoImg.height / (logoImg.width || 1);
    const logoH = logoW * aspect;
    ctx.drawImage(logoImg, (cardX + cardW / 2) - (logoW / 2), y, logoW, logoH);
  } else {
    // Fallback: green Jogo brand text
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
