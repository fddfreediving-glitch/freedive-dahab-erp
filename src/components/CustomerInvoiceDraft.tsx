import { ErpDateTimePicker } from './ui/date-time-picker';
import { ErpSelect } from './ui/erp-select';
import { useMemo, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import type { PosCatalogItem, Student } from '../types';
import { calculateCustomerDraftTotal, countAccommodationNights } from '../utils/accommodationPricing';

export interface CustomerInvoiceDraftPayload {
  customer: { student_id: string; first_name: string; last_name: string; email: string; phone: string; whatsapp: string; whatsapp_status: 'available' | 'not_available' | 'confirm_later' | 'contacted' | ''; transfer_status: 'required' | 'not_required' | 'confirm_later' | 'arranged' | ''; needs_accommodation: boolean | null; needs_airport_transfer: boolean | null; arrival_date: string; departure_date: string; flight_number: string; airline_name: string; flight_arrival_at: string; transportation_requirements: string; hotel_name: string; assigned_driver: string; notes: string; course_start_date: string };
  invoice: { issue_date: string; due_date: string; currency: string; tax_rate: number; items: Array<{ category: string; description: string; quantity: number; unit_price: number; check_in_date?: string; check_out_date?: string; service_start_date?: string }> };
}

interface DraftItem { catalogId: string; description: string; category: string; price: string; currency: string; startDate: string; }
interface Props { catalog: PosCatalogItem[]; students: Student[]; onSave: (payload: CustomerInvoiceDraftPayload) => Promise<void>; onCancel: () => void; }

const inputClass = 'w-full min-w-28 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const selectClass = `${inputClass} cursor-pointer`;
const blankItem = (): DraftItem => ({ catalogId: '', description: '', category: 'other', price: '', currency: '', startDate: '' });
const categoryForGroup = (group: string) => group === 'Courses' ? 'course' : group === 'Packages' ? 'package' : group === 'Training' ? 'training' : group === 'Activities' ? 'activity' : group === 'Accommodation' ? 'accommodation' : group === 'Shop' ? 'shop' : 'gear_rental';
const noAccommodationValue = '__not_required__';
const transferModes = ['Airport transfer', 'Hotel transfer', 'Taxi', 'Own transport'];

export function CustomerInvoiceDraft({ catalog, students, onSave, onCancel }: Props) {
  const activeCatalog = useMemo(() => catalog.filter((item) => item.is_active), [catalog]);
  const [date, setDate] = useState('');
  const [studentId, setStudentId] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [accommodation, setAccommodation] = useState('');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [transferStatus, setTransferStatus] = useState<'required' | 'not_required' | 'confirm_later' | 'arranged' | ''>('');
  const [transport, setTransport] = useState('');
  const [transportNotes, setTransportNotes] = useState('');
  const [flight, setFlight] = useState('');
  const [airline, setAirline] = useState('');
  const [flightDate, setFlightDate] = useState('');
  const [flightTime, setFlightTime] = useState('');
  const [hotel, setHotel] = useState('');
  const [driver, setDriver] = useState('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedStudent = students.find((student) => student.id === studentId);
  const phoneOptions = Array.from(new Set(students.map((student) => student.whatsapp).filter((value): value is string => Boolean(value))));
  const accommodationNights = countAccommodationNights(arrival, departure);
  const accommodationOptions = activeCatalog.filter((item) => item.group === 'Accommodation' || item.category === 'accommodation');
  const currency = items.find((item) => item.currency)?.currency || 'EUR';
  const total = calculateCustomerDraftTotal(items, accommodationNights);

  const changeItem = (index: number, value: string) => setItems((current) => current.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const selected = activeCatalog.find((catalogItem) => catalogItem.id === value);
    return selected ? { catalogId: selected.id, description: selected.name, category: selected.category || categoryForGroup(selected.group), price: selected.price == null ? '0' : String(selected.price), currency: selected.price_currency || currency, startDate: item.startDate } : value === '__custom__' ? { ...blankItem(), catalogId: value } : blankItem();
  }));
  const changeAccommodation = (catalogId: string) => {
    setAccommodation(catalogId);
    if (catalogId === noAccommodationValue || !catalogId) {
      setItems((current) => current.filter((item) => item.category !== 'accommodation'));
      return;
    }
    const room = accommodationOptions.find((item) => item.id === catalogId);
    if (!room) return;
    setItems((current) => [
      ...current.filter((item) => item.category !== 'accommodation'),
      {
        catalogId: room.id,
        description: room.name,
        category: 'accommodation',
        price: room.price == null ? '0' : String(room.price),
        currency: room.price_currency || currency,
        startDate: arrival,
      },
    ]);
  };
  const updateItem = (index: number, updates: Partial<DraftItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item));
  const selectCustomer = (id: string) => {
    const customer = students.find((entry) => entry.id === id);
    setStudentId(id);
    setWhatsapp(customer?.whatsapp || '');
    setArrival(customer?.arrival_date || '');
    setDeparture(customer?.departure_date || '');
    setAccommodation(customer?.needs_accommodation === 0 ? noAccommodationValue : '');
    const nextTransferStatus = customer?.transfer_status || (customer?.needs_airport_transfer ? 'required' : customer?.needs_airport_transfer === 0 ? 'not_required' : '');
    setTransferStatus(nextTransferStatus);
    const savedTransport = customer?.transportation_requirements?.trim() || '';
    setTransport(transferModes.includes(savedTransport) ? savedTransport : (nextTransferStatus === 'required' ? 'Airport transfer' : ''));
    setTransportNotes(savedTransport && !transferModes.includes(savedTransport) && savedTransport !== 'Not required' ? savedTransport : '');
    setFlight(customer?.flight_number || '');
    setAirline(customer?.airline_name || '');
    setFlightDate(customer?.flight_arrival_at?.slice(0, 10) || '');
    setFlightTime(customer?.flight_arrival_at?.slice(11, 16) || '');
    setHotel(customer?.hotel_name || '');
    setDriver(customer?.assigned_driver || '');
    setComments(customer?.notes || '');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!date || !selectedStudent) { setError('Choose a registered customer and invoice date.'); return; }
    if (items.some((item) => !item.description.trim() || item.price === '' || !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) { setError('Choose an item and enter a valid price. Free items may be entered as 0.'); return; }
    if (items.some((item) => item.category === 'accommodation') && accommodationNights < 1) { setError('Enter valid arrival and check-out dates for accommodation.'); return; }
    if (new Set(items.map((item) => item.currency).filter(Boolean)).size > 1) { setError('Invoice items must use the same currency.'); return; }
    if (arrival && departure && departure < arrival) { setError('Check-out date cannot be before arrival.'); return; }
    setSaving(true);
    try {
      const payload: CustomerInvoiceDraftPayload = { customer: {
        student_id: selectedStudent.id, first_name: selectedStudent.first_name, last_name: selectedStudent.last_name, email: selectedStudent.email, phone: selectedStudent.phone || '', whatsapp,
        whatsapp_status: whatsapp ? (selectedStudent.whatsapp_status || 'available') : 'not_available', transfer_status: transferStatus,
        needs_accommodation: accommodation === noAccommodationValue ? false : accommodation || items.some((item) => item.category === 'accommodation') ? true : null,
        needs_airport_transfer: transferStatus === 'required' && transport === 'Airport transfer' ? true : transferStatus === 'not_required' ? false : null, arrival_date: arrival, departure_date: departure,
        flight_number: flight, airline_name: airline, flight_arrival_at: flightDate && flightTime ? `${flightDate}T${flightTime}` : '',
        transportation_requirements: transferStatus === 'not_required' ? 'Not required' : [transport, transportNotes].filter(Boolean).join(' · '), hotel_name: hotel, assigned_driver: driver, notes: comments,
        course_start_date: items.find((item) => item.startDate)?.startDate || '',
      }, invoice: { issue_date: date, due_date: date, currency, tax_rate: 0, items: items.map((item) => ({ category: item.category, description: item.description.trim(), quantity: item.category === 'accommodation' ? accommodationNights : 1, unit_price: Number(item.price), ...(item.category === 'accommodation' ? { check_in_date: arrival, check_out_date: departure } : {}), ...(item.startDate ? { service_start_date: item.startDate } : {}) })) } };
      await onSave(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the customer and invoice.'); }
    finally { setSaving(false); }
  };

  const itemSelect = (item: DraftItem, index: number) => <ErpSelect aria-label={`Invoice item ${index + 1}`} className={selectClass} value={item.catalogId} onChange={(event) => changeItem(index, event.target.value)}>
    <option value="">Choose item…</option>
    {(['Courses', 'Training', 'Packages', 'Specialties', 'Activities', 'Shop', 'Gear rental'] as const).map((group) => {
      const specialtyIds = new Set(['marine-ecology', 'equalization-online', 'mouthfill']);
      const groupItems = activeCatalog.filter((entry) => group === 'Specialties' ? specialtyIds.has(entry.id) || entry.category === 'workshop' : entry.group === group && !(group === 'Courses' && (specialtyIds.has(entry.id) || entry.category === 'workshop')));
      return groupItems.length ? <optgroup key={group} label={group === 'Training' ? 'Training sessions' : group}>{groupItems.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.price == null ? '' : ` · ${entry.price} ${entry.price_currency}`}</option>)}</optgroup> : null;
    })}
    <option value="__custom__">Custom item…</option>
  </ErpSelect>;
  const statusClass = `${selectClass} ${transferStatus === 'required' ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : transferStatus === 'not_required' ? 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100' : ''}`;

  return <tr className="bg-blue-50/60 align-top dark:bg-slate-900/70">
    <td className="sticky left-0 z-[1] bg-blue-50 px-2 py-2 dark:bg-slate-900"><div className="flex gap-1"><button type="button" onClick={submit as unknown as React.MouseEventHandler<HTMLButtonElement>} aria-label="Save customer and create invoice" disabled={saving} className="rounded-md bg-emerald-600 p-1.5 text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}</button><button type="button" onClick={onCancel} aria-label="Cancel new row" className="rounded-md bg-slate-200 p-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><X size={16} /></button></div></td>
    <td className="p-2"><ErpDateTimePicker aria-label="Date" type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></td>
    <td className="min-w-56 p-2"><ErpSelect aria-label="Customer name and email" className={selectClass} value={studentId} onChange={(event) => selectCustomer(event.target.value)}><option value="">Choose customer…</option>{students.map((student) => <option key={student.id} value={student.id}>{student.first_name} {student.last_name} · {student.email}</option>)}</ErpSelect>{selectedStudent && <div className="mt-1 text-[10px] text-slate-500">{selectedStudent.first_name} {selectedStudent.last_name}<br />{selectedStudent.email}</div>}</td>
    <td className="min-w-48 p-2"><ErpSelect aria-label="Customer WhatsApp number" className={`${selectClass} rounded-full font-semibold ${selectedStudent?.whatsapp_status === 'contacted' ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200' : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'}`} value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)}><option value="">{selectedStudent?.whatsapp ? 'No WhatsApp' : 'Choose number…'}</option>{phoneOptions.map((phone) => <option key={phone} value={phone}>{phone}</option>)}</ErpSelect></td>
    <td className="min-w-64 space-y-2 p-2">{items.map((item, index) => <div key={index} className="space-y-1 rounded-md border border-slate-200 p-1.5 dark:border-slate-700">{itemSelect(item, index)}{item.catalogId === '__custom__' && <input aria-label="Custom item description" className={inputClass} placeholder="Description" value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} />}<div className="flex gap-1"><input aria-label={`Item ${index + 1} price`} type="number" min="0" step="0.01" className={inputClass} placeholder="Price (0 allowed)" value={item.price} onChange={(event) => updateItem(index, { price: event.target.value })} /><ErpSelect aria-label={`Item ${index + 1} currency`} className={selectClass} value={item.currency || currency} onChange={(event) => updateItem(index, { currency: event.target.value })}><option>EUR</option><option>EGP</option></ErpSelect></div>{item.category === 'accommodation' && accommodationNights > 0 && <p className="text-[10px] text-violet-700 dark:text-violet-300">{accommodationNights} nights · total {new Intl.NumberFormat('en', { style: 'currency', currency: item.currency || currency }).format(accommodationNights * Number(item.price || 0))}</p>}<ErpDateTimePicker aria-label={`Item ${index + 1} start date`} type="date" className={inputClass} value={item.startDate} onChange={(event) => updateItem(index, { startDate: event.target.value })} />{items.length > 1 && <button type="button" className="text-[10px] text-rose-600" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>Remove item</button>}</div>)}<button type="button" className="inline-flex items-center gap-1 px-1 py-1 text-[11px] font-semibold text-blue-700" onClick={() => setItems((current) => [...current, blankItem()])}><Plus size={13} />Add item</button></td>
    <td className="min-w-36 p-2 text-xs text-slate-600">{items.filter((item) => item.startDate).map((item, index) => <div key={`${item.description}-${index}`} className="mb-1 whitespace-nowrap">{item.description}: {item.startDate}</div>)}{!items.some((item) => item.startDate) && <span className="text-slate-400">Set dates per item</span>}</td>
    <td className="min-w-56 space-y-1 p-2"><ErpSelect aria-label="Accommodation room" className={selectClass} value={accommodation} onChange={(event) => changeAccommodation(event.target.value)}><option value="">Choose room…</option><option value={noAccommodationValue}>No accommodation</option>{accommodationOptions.map((room) => <option key={room.id} value={room.id}>{room.name}{room.price == null ? '' : ` · ${room.price} ${room.price_currency} / night`}</option>)}</ErpSelect><ErpDateTimePicker aria-label="Accommodation check-in date" type="date" className={inputClass} value={arrival} onChange={(event) => { setArrival(event.target.value); setItems((current) => current.map((item) => item.category === 'accommodation' ? { ...item, startDate: event.target.value } : item)); }} /><ErpDateTimePicker aria-label="Accommodation check-out date" type="date" min={arrival || undefined} className={inputClass} value={departure} onChange={(event) => setDeparture(event.target.value)} />{accommodationNights > 0 && <span className="block text-[10px] text-slate-500">{accommodationNights} {accommodationNights === 1 ? 'night' : 'nights'}{items.find((item) => item.category === 'accommodation') ? ` · ${new Intl.NumberFormat('en', { style: 'currency', currency: items.find((item) => item.category === 'accommodation')?.currency || currency }).format(accommodationNights * Number(items.find((item) => item.category === 'accommodation')?.price || 0))}` : ''}</span>}</td>
    <td className="min-w-40 p-2 text-xs text-slate-600">{arrival || departure ? <span className="whitespace-nowrap">{arrival || '—'} → {departure || '—'}</span> : <span className="text-slate-400">Dates not set</span>}</td>
    <td className="min-w-64 space-y-1 p-2"><ErpSelect aria-label="Transportation status" className={statusClass} value={transferStatus} onChange={(event) => setTransferStatus(event.target.value as typeof transferStatus)}><option value="">Choose transfer…</option><option value="required">Airport transfer · Required</option><option value="not_required">Not required</option><option value="confirm_later">Confirm later</option><option value="arranged">Arranged</option></ErpSelect>{transferStatus === 'required' && <ErpSelect aria-label="Transfer type" className={selectClass} value={transport} onChange={(event) => setTransport(event.target.value)}><option value="">Choose type…</option>{transferModes.map((mode) => <option key={mode}>{mode}</option>)}</ErpSelect>}<input aria-label="Transportation details" className={inputClass} placeholder="Pickup or transport details" value={transportNotes} onChange={(event) => setTransportNotes(event.target.value)} /><input aria-label="Flight number and airline" className={inputClass} placeholder="Flight number | Airline" value={[flight, airline].filter(Boolean).join(' | ')} onChange={(event) => { const [nextFlight = '', ...rest] = event.target.value.split('|'); setFlight(nextFlight.trim()); setAirline(rest.join('|').trim()); }} /><div className="flex gap-1"><ErpDateTimePicker aria-label="Flight arrival date" type="date" className={inputClass} value={flightDate} onChange={(event) => setFlightDate(event.target.value)} /><ErpDateTimePicker aria-label="Flight arrival time" type="time" className={inputClass} value={flightTime} onChange={(event) => setFlightTime(event.target.value)} /></div><div className="flex gap-1"><input aria-label="Hotel name" className={inputClass} placeholder="Hotel" value={hotel} onChange={(event) => setHotel(event.target.value)} /><input aria-label="Assigned driver" className={inputClass} placeholder="Driver" value={driver} onChange={(event) => setDriver(event.target.value)} /></div></td>
    <td className="p-2 text-right font-data text-slate-500">{total ? new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(0) : '—'}</td><td className="p-2 text-right font-data text-slate-700 dark:text-slate-200">{total ? new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(total) : '—'}</td>
    <td className="min-w-48 p-2"><textarea aria-label="Comments" className={inputClass} rows={2} placeholder="Comments" value={comments} onChange={(event) => setComments(event.target.value)} />{error && <div role="alert" className="mt-2 min-w-48 text-[11px] font-medium text-rose-600">{error}</div>}</td>
  </tr>;
}
