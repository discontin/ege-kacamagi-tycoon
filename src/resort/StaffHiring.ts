import type { Role } from './types';
export const STAFF_AREAS = [
  // Left side of the reception desk: this is the clear red-marked spot in front of reception.
  { id: 'receptionHire', target: 'receptionWorker', role: 'reception', label: 'Resepsiyon çalışanı', x: 16, y: 44 },
  { id: 'roomsHire', target: 'roomsWorker', role: 'rooms', label: 'Oda temizlikçisi', x: 14, y: 37 },
  { id: 'haulingHire', target: 'haulingWorker', role: 'hauling', label: 'Çamaşırhane görevlisi', x: 10, y: 49 },
  { id: 'poolHire', target: 'poolWorker', role: 'pool', label: 'Havuz ve bar görevlisi', x: 18, y: 11 },
] as const;
export const staffRole = (target: string): Role | undefined => STAFF_AREAS.find(a => a.target === target)?.role;
export const staffHireCost = (currentWorkers: number) => 200 + currentWorkers * 100;

/** Department pictograms share one style, but distinct silhouettes. */
export function staffIconSvg(role: Role): string {
  const shapes: Record<Role, string> = {
    bartender: '<path d="M5 5h22L16 18 5 5Zm11 13v9m-6 0h12M9 9h14m-3-5 4-3"/>',
    reception: '<path d="M5 18V9Q16 2 27 9v9Z" fill="currentColor" fill-opacity=".18"/><path d="M5 15h22M5 18h22l-3 5H8Z"/><path d="M13 10h6M16 8v4"/>',
    rooms: '<path d="m22 5-9 14M10 16l7 4-5 9-10-6Z" fill="currentColor" fill-opacity=".18"/><path d="m6 22 7 4m-3-2 4-5M23 22v6m-3-3h6"/>',
    hauling: '<path d="M4 14h24l-3 14H7Z" fill="currentColor" fill-opacity=".18"/><path d="m9 14 3-7h8l3 7M10 18v6m6-6v6m6-6v6M8 10h16"/>',
    pool: '<circle cx="16" cy="16" r="12" fill="currentColor" fill-opacity=".18"/><circle cx="16" cy="16" r="6"/><path d="m7.5 7.5 4.2 4.2m8.6 8.6 4.2 4.2M7.5 24.5l4.2-4.2m8.6-8.6 4.2-4.2"/>',
  };
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[role]}</svg>`;
}
