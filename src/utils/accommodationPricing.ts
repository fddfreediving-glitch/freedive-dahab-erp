export interface CustomerDraftLine {
  category: string;
  price: string;
}

export function countAccommodationNights(checkIn: string, checkOut: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return 0;
  const start = Date.parse(`${checkIn}T00:00:00.000Z`);
  const end = Date.parse(`${checkOut}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== checkIn || new Date(end).toISOString().slice(0, 10) !== checkOut) return 0;
  const nights = (end - start) / 86_400_000;
  return Number.isInteger(nights) && nights > 0 ? nights : 0;
}

export function calculateCustomerDraftTotal(items: CustomerDraftLine[], accommodationNights: number): number {
  const cents = items.reduce((sum, item) => {
    const price = Number(item.price) || 0;
    const quantity = item.category === 'accommodation' ? accommodationNights : 1;
    return sum + Math.round(price * quantity * 100);
  }, 0);
  return cents / 100;
}
