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
