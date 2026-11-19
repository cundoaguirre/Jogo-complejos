import { timeStringToMinutes, intervalsOverlap } from './firestoreSync';

export { timeStringToMinutes, intervalsOverlap };

export const DURATION_OPTIONS = [30, 60, 90] as const;

export const areCourtsMutuallyBlocked = (
  courtAId: string | number | undefined | null,
  courtBId: string | number | undefined | null,
  courtsList: any[]
): boolean => {
  if (!courtAId || !courtBId) return false;
  const strA = String(courtAId);
  const strB = String(courtBId);
  if (strA === strB) return false;

  const courtA = (courtsList || []).find((c) => String(c.id) === strA);
  const courtB = (courtsList || []).find((c) => String(c.id) === strB);

  const aBlocksB =
    Array.isArray(courtA?.blockedCourts) &&
    courtA.blockedCourts.map(String).includes(strB);
  const bBlocksA =
    Array.isArray(courtB?.blockedCourts) &&
    courtB.blockedCourts.map(String).includes(strA);

  return Boolean(aBlocksB || bBlocksA);
};

export function getCourtDefaultDuration(court?: any): number {
  const saved = Number(court?.defaultDurationMinutes);
  if (saved === 30 || saved === 60 || saved === 90) return saved;
  const sportText = String(court?.sport || court?.type || '').toLowerCase();
  if (sportText.includes('pádel') || sportText.includes('padel')) return 90;
  return 60;
}

export function computeEndTime(startTime: string, durationMinutes: number): string {
  const startMin = timeStringToMinutes(startTime || '18:00');
  const endMin = (startMin + Math.max(15, Number(durationMinutes) || 60)) % (24 * 60);
  const hh = String(Math.floor(endMin / 60)).padStart(2, '0');
  const mm = String(endMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function computeProportionalPrice(
  pricePerHour: number,
  durationMinutes: number
): number {
  return Math.round((Number(pricePerHour || 0) * Number(durationMinutes || 60)) / 60);
}

export function sanitizePricesByDuration(
  raw?: any
): { 30?: number; 60?: number; 90?: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const cleaned: { 30?: number; 60?: number; 90?: number } = {};
  for (const dur of DURATION_OPTIONS) {
    const val = Number(raw[dur] ?? raw[String(dur)]);
    if (Number.isFinite(val) && val > 0) {
      cleaned[dur] = val;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function getCourtPriceForDuration(
  court: any,
  durationMinutes: number
): number {
  const dur = Number(durationMinutes) || 60;
  const map = court?.pricesByDuration;
  const exact = Number(map?.[dur] ?? map?.[String(dur)]);
  if (Number.isFinite(exact) && exact > 0) return exact;

  const legacyHourPrice = Number(court?.price_per_hour ?? court?.price ?? 0);
  if (dur === 60 && Number.isFinite(legacyHourPrice) && legacyHourPrice > 0) {
    return legacyHourPrice;
  }

  const p60 = Number(map?.[60] ?? map?.['60']);
  const base60 = Number.isFinite(p60) && p60 > 0 ? p60 : legacyHourPrice;
  const defaultDur = getCourtDefaultDuration(court);
  const pDefault = Number(map?.[defaultDur] ?? map?.[String(defaultDur)]);
  const baseDefault =
    Number.isFinite(pDefault) && pDefault > 0
      ? pDefault
      : defaultDur === 60
      ? legacyHourPrice
      : 0;
  const p30 = Number(map?.[30] ?? map?.['30']);
  const p90 = Number(map?.[90] ?? map?.['90']);

  const candidates: Array<{ baseDur: number; basePrice: number }> = [
    { baseDur: 60, basePrice: base60 },
    { baseDur: defaultDur, basePrice: baseDefault },
    { baseDur: 30, basePrice: Number.isFinite(p30) ? p30 : 0 },
    { baseDur: 90, basePrice: Number.isFinite(p90) ? p90 : 0 },
  ];

  for (const candidate of candidates) {
    if (
      Number.isFinite(candidate.basePrice) &&
      candidate.basePrice > 0 &&
      candidate.baseDur > 0
    ) {
      return Math.round((candidate.basePrice * dur) / candidate.baseDur);
    }
  }

  return 0;
}

export function generateHalfHourSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  const startMin = startHour * 60;
  const endMin = endHour * 60;
  for (let m = startMin; m < endMin; m += 30) {
    const hh = String(Math.floor((m / 60) % 24)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}
