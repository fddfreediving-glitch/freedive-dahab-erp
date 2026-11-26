import { ErpDateTimePicker } from './ui/date-time-picker';
import { ErpSelect } from './ui/erp-select';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pencil, Plus, Printer, Receipt, X } from 'lucide-react';
import { Invoice, InvoiceUpdateInput, Payment, UserRole } from '../types';
import { BrandMark } from './BrandMark';
import { downloadCsv } from '../utils/csv';
import { countAccommodationNights } from '../utils/accommodationPricing';

interface InvoiceBillDialogProps {
  invoice: Invoice;
  requestId?: string;
  sidePanel?: boolean;
  userRole: UserRole;
  onClose: () => void;
  onSave: (invoiceId: string, changes: InvoiceUpdateInput) => Promise<void>;
  onRecordPayment: (invoice: Invoice, requestId?: string) => void;
  onAdjustPayment: (payment: Payment, invoice: Invoice) => void;
}

type InvoiceCategory = NonNullable<NonNullable<Invoice['items']>[number]['category']>;
type InvoiceDraftItem = InvoiceUpdateInput['items'][number] & { source_item_id?: string; service_start_date?: string | null };
type InvoiceDraft = Omit<InvoiceUpdateInput, 'items'> & { items: InvoiceDraftItem[] };

const serviceCategories: InvoiceCategory[] = [
  'course',
  'package',
  'accommodation',
  'activity',
  'workshop',
  'training',
  'gear_rental',
  'shop',
  'other',
];

const serviceCategoryLabels: Record<InvoiceCategory, string> = {
  course: 'Course',
  package: 'Package',
  accommodation: 'Accommodation',
  activity: 'Activity',
  workshop: 'Workshop',
  training: 'Training session',
  gear_rental: 'Gear rental',
  shop: 'Shop product',
  other: 'Other',
};

const serviceOptions: Record<InvoiceCategory, string[]> = {
  course: ['SSI Basic Freediver', 'SSI Freediver', 'Advanced Freediver', 'Performance Freediver'],
  package: ['Beginner Week', 'Advanced Week', 'Beginner + Advanced Combo', 'Training Week'],
  accommodation: ['Lighthouse Room', 'Blue Hole Room', 'Eel Garden Room', 'Islands Room'],
  activity: ['Blue Hole guided fun dive', 'Ras Mohamed dive trip', 'Night Freedive', 'Desert BBQ'],
  workshop: ['Equalisation workshop', 'Breathing workshop'],
  training: ['Group training session', 'Private training session', 'Training Techniques', 'Monofin class', 'No-Fins', 'Variable Weight'],
  gear_rental: ['Gear rental'],
  shop: ['Freedive Dahab nose clip', 'Freedive Dahab T-shirt', 'Freedive Dahab poncho'],
  other: [],
};

const CUSTOM_DESCRIPTION = '__custom_description__';

const currencyAmount = (currency: string, amount: number) =>
  new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const formatInvoiceDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));

function getInvoiceDraft(invoice: Invoice): InvoiceDraft {
  return {
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    tax_rate: invoice.tax_rate,
    notes: invoice.notes || '',
    items: (invoice.items || []).map((item) => ({
      source_item_id: item.id,
      category: item.category || 'other',
      description: item.description,
      quantity: item.category === 'accommodation'
        ? countAccommodationNights(item.check_in_date || '', item.check_out_date || '') || item.quantity
        : item.quantity,
      unit_price: item.unit_price,
      service_start_date: item.service_start_date || '',
      ...(item.category === 'accommodation'
        ? { check_in_date: item.check_in_date || '', check_out_date: item.check_out_date || '' }
        : {}),
    })),
  };
}

function daysUntil(dueDate: string): number {
  const [year, month, day] = dueDate.split('-').map(Number);
  const due = Date.UTC(year, month - 1, day);
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const today = Object.fromEntries(nowParts.map(({ type, value }) => [type, value]));
  const todayUtc = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day));
  return Math.round((due - todayUtc) / 86_400_000);
}

function getBalanceSummary(invoice: Invoice, balance: number, days: number): string {
  if (invoice.status === 'cancelled') return 'This invoice has been cancelled.';
  if (balance <= 0) return 'Paid in full. Thank you for diving with us.';
  const timing = days < 0
    ? `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`
    : days === 0
      ? 'Due today'
      : `Due in ${days} ${days === 1 ? 'day' : 'days'}`;
  if (invoice.paid_amount > 0) {
    return `${timing}, with ${currencyAmount(invoice.currency, invoice.paid_amount)} of ${currencyAmount(invoice.currency, invoice.total_amount)} paid.`;
  }
  return `${timing}.`;
}

export const InvoiceBillDialog: React.FC<InvoiceBillDialogProps> = ({
  invoice,
  requestId,
  sidePanel = false,
  userRole,
  onClose,
  onSave,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canEdit = ['owner', 'finance'].includes(userRole) && invoice.status !== 'cancelled';
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft>(() => getInvoiceDraft(invoice));

  const exportInvoiceCsv = () => {
    const rows: (string | number)[][] = [
      ['Invoice', invoice.invoice_number],
      ['Order', invoice.customer_request_number || ''],
      ['Customer', `${invoice.first_name} ${invoice.last_name}`],
      ['Email', invoice.student_email || ''],
      ['Issued', invoice.issue_date],
      ['Due', invoice.due_date],
      ['Currency', invoice.currency],
      ['Subtotal', invoice.subtotal],
      ['Tax', invoice.tax_amount],
      ['Total', invoice.total_amount],
      ['Paid', invoice.paid_amount],
      ['Status', invoice.status],
      [],
      ['Line items'],
      ['Event start date', 'Category', 'Description', 'Quantity', 'Unit price', 'Line total'],
      ...(invoice.items || []).map((item) => [
        item.service_start_date || '',
        item.category || 'other',
        item.description,
        item.quantity,
        item.unit_price,
        item.total_price,
      ]),
      [],
      ['Payments'],
      ['Date', 'Method', 'Account', 'Currency', 'Amount', 'EUR amount', 'Reference', 'Notes'],
      ...(invoice.payments || []).map((payment) => [
        payment.payment_date,
        payment.payment_method,
        payment.payment_account || '',
        payment.currency,
        payment.amount,
        payment.eur_amount_cents != null ? payment.eur_amount_cents / 100 : '',
        payment.reference_number || '',
        payment.notes || '',
      ]),
    ];
    downloadCsv(`${invoice.invoice_number}.csv`, rows);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const subtotal = useMemo(
    () => draft.items.reduce((amount, item) => amount + Math.round(item.quantity * item.unit_price * 100), 0) / 100,
    [draft.items],
  );
  const taxAmount = Math.round(subtotal * draft.tax_rate) / 100;
  const total = subtotal + taxAmount;
  const displayedTotal = editing ? total : invoice.total_amount;
  const balance = Math.max(0, displayedTotal - invoice.paid_amount);
  const totalBelowRecordedPayments = editing && Math.round(total * 100) < Math.round(invoice.paid_amount * 100);
  const allocatedPaidAmount = (invoice.items || []).reduce((amount, item) => amount + (item.paid_amount || 0), 0);
  const unallocatedPaymentAmount = Math.max(0, Math.round((invoice.paid_amount - allocatedPaidAmount) * 100) / 100);
  const daysUntilDue = daysUntil(editing ? draft.due_date : invoice.due_date);
  const isOverdue = balance > 0 && daysUntilDue < 0 && invoice.status !== 'cancelled';
  const summary = getBalanceSummary({ ...invoice, total_amount: displayedTotal }, balance, daysUntilDue);
  const updateItem = (index: number, patch: Partial<InvoiceUpdateInput['items'][number]>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const beginEditing = () => {
    setDraft(getInvoiceDraft(invoice));
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(getInvoiceDraft(invoice));
    setError(null);
    setEditing(false);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(invoice.id, {
        ...draft,
        items: draft.items.map(({ source_item_id: _sourceItemId, ...item }) => item),
      });
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The invoice could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="invoice-bill-title"
      onClose={onClose}
      className={`invoice-print-dialog m-0 fixed ${sidePanel ? 'inset-y-0 left-auto right-0 h-full w-full max-w-none sm:w-[min(900px,88vw)]' : 'inset-0 h-full w-full max-w-none'} max-h-none overflow-hidden rounded-none border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/70`}
    >
      <form id="invoice-bill-form" onSubmit={handleSave} className="flex h-full flex-col">
        <div className="invoice-print-actions sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f7f9fc] px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-2">
            <Receipt className="h-5 w-5 shrink-0 text-[#3069C4]" aria-hidden="true" />
            <h2 id="invoice-bill-title" className="truncate text-sm font-bold text-slate-900">
              Invoice · {invoice.invoice_number}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print invoice
            </button>
            <button
              type="button"
              onClick={exportInvoiceCsv}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </button>
            {canEdit && (editing ? (
              <button
                type="button"
                disabled
                aria-live="polite"
                className="inline-flex min-h-10 min-w-[132px] items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 text-xs font-semibold text-blue-800 disabled:opacity-100"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Editing invoice
              </button>
            ) : (
              <button
                type="button"
                onClick={beginEditing}
                className="inline-flex min-h-10 min-w-[132px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit invoice
              </button>
            ))}
            {editing && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={cancelEditing}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="invoice-bill-form"
                  disabled={saving || draft.items.length === 0 || !Number.isFinite(total) || totalBelowRecordedPayments}
                  className="min-h-10 rounded-lg bg-[#3069C4] px-4 text-xs font-semibold text-white hover:bg-[#2459ad] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </>
            )}
            <button
              type="button"
              aria-label="Close invoice"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3069C4]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="invoice-print-scroll min-h-0 flex-1 overflow-y-auto">
          <article className="invoice-print-document mx-auto max-w-[880px] space-y-8 px-5 py-7 sm:px-10 sm:py-10">
            <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:items-start">
              <div className="flex items-start gap-3">
                <div>
                  <BrandMark tone="black" className="h-16 w-auto" />
                  <p className="mt-2 text-sm text-slate-600">Dahab, Egypt</p>
                </div>
              </div>
              <div className="sm:text-right">
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <h1 id="invoice-document-heading" className="text-xl font-bold tracking-tight text-slate-950">Invoice</h1>
                  <span className={`inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-semibold capitalize ${
                    isOverdue
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : balance <= 0
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                  }`}>
                    {isOverdue ? 'Overdue' : balance <= 0 ? 'Paid' : invoice.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-700 [font-family:Arial,sans-serif]">{invoice.invoice_number}</p>
                {(invoice.customer_request_number || requestId) && (
                  <p className="mt-1 text-xs text-slate-500">Order {invoice.customer_request_number || requestId}</p>
                )}
              </div>
            </header>

            <section aria-labelledby="invoice-balance-heading" className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <h2 id="invoice-balance-heading" className="text-sm font-semibold text-slate-600">
                  {balance <= 0 ? 'Amount paid' : 'Amount due'}
                </h2>
                <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-slate-950 sm:text-4xl">
                  {currencyAmount(invoice.currency, balance <= 0 ? invoice.total_amount : balance)}
                </p>
                <p className={`mt-2 max-w-[62ch] text-sm ${isOverdue ? 'font-medium text-rose-800' : 'text-slate-600'}`}>
                  {summary}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-slate-200 pt-4 text-sm sm:min-w-[280px] sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <dt className="text-slate-500">Issued</dt>
                <dd className="text-right font-medium text-slate-800">{formatInvoiceDate(invoice.issue_date)}</dd>
                <dt className="text-slate-500">Due</dt>
                <dd className="text-right font-medium text-slate-800">
                  {editing ? (
                    <ErpDateTimePicker
                      aria-label="Due date"
                      required
                      type="date"
                      value={draft.due_date}
                      onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
                      className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                    />
                  ) : formatInvoiceDate(invoice.due_date)}
                </dd>
                <dt className="text-slate-500">Currency</dt>
                <dd className="text-right font-medium text-slate-800">{invoice.currency}</dd>
              </dl>
            </section>

            {editing && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                <label htmlFor="invoice-issue-date" className="font-medium text-slate-700">Invoice date</label>
                <ErpDateTimePicker
                  id="invoice-issue-date"
                  required
                  type="date"
                  value={draft.issue_date}
                  onChange={(event) => setDraft({ ...draft, issue_date: event.target.value })}
                  className="min-h-9 rounded-md border border-slate-300 bg-white px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                />
              </div>
            )}

            <section aria-label="Invoice parties" className="grid gap-8 border-y border-slate-200 py-6 sm:grid-cols-2">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</h2>
                <p className="mt-2 font-semibold text-slate-900">Freedive Dahab</p>
                <p className="mt-1 text-sm text-slate-600">Dahab, Egypt</p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</h2>
                <p className="mt-2 font-semibold text-slate-900">{invoice.first_name} {invoice.last_name}</p>
                {invoice.student_email && <p className="mt-1 break-all text-sm text-slate-600">{invoice.student_email}</p>}
                {invoice.student_phone && <p className="mt-1 text-sm text-slate-600">{invoice.student_phone}</p>}
              </div>
            </section>

            <section aria-labelledby="invoice-lines-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 id="invoice-lines-heading" className="text-base font-semibold text-slate-900">Line items</h2>
                {editing && (
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      items: [...current.items, { category: 'other', description: '', quantity: 1, unit_price: 1 }],
                    }))}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add service
                  </button>
                )}
              </div>
              <div className="overflow-x-auto border-y border-slate-200">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <tr>
                      <th scope="col" className="w-32 py-3 pr-3">Event start date</th>
                      <th scope="col" className="py-3 pr-4">Description</th>
                      <th scope="col" className="w-16 px-2 py-3 text-right">Qty</th>
                      <th scope="col" className="w-32 px-2 py-3 text-right">{editing ? 'Unit price' : 'Line total'}</th>
                      {editing && <th scope="col" className="w-20 py-3 pl-3 text-right"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draft.items.map((item, index) => {
                      return (
                      <tr key={item.source_item_id || `service-${index}`} className="align-top">
                        <td className="py-4 pr-3 text-sm text-slate-700">
                          {editing ? (
                            <ErpDateTimePicker
                              aria-label={`Event start date for ${item.description || `service ${index + 1}`}`}
                              type="date"
                              value={item.service_start_date || ''}
                              onChange={(event) => updateItem(index, { service_start_date: event.target.value || null })}
                              className="min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                            />
                          ) : item.service_start_date ? formatInvoiceDate(item.service_start_date) : '—'}
                        </td>
                        <td className="py-4 pr-4">
                          {editing ? (
                            <div className="grid gap-2 sm:grid-cols-[140px_minmax(180px,1fr)]">
                              <label className="sr-only" htmlFor={`bill-category-${index}`}>Service category</label>
                              <ErpSelect
                                id={`bill-category-${index}`}
                                value={item.category}
                                onChange={(event) => {
                                  const category = event.target.value as NonNullable<Invoice['items']>[number]['category'];
                                  const checkInDate = new Date();
                                  const checkOutDate = new Date();
                                  checkOutDate.setDate(checkOutDate.getDate() + 1);
                                  const formatLocalDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                                  updateItem(index, {
                                    category,
                                    check_in_date: category === 'accommodation' ? item.check_in_date || formatLocalDate(checkInDate) : undefined,
                                    check_out_date: category === 'accommodation' ? item.check_out_date || formatLocalDate(checkOutDate) : undefined,
                                  });
                                }}
                                className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-xs capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                              >
                                {serviceCategories.map((category) => <option key={category} value={category}>{serviceCategoryLabels[category]}</option>)}
                              </ErpSelect>
                              {(() => {
                                const category = item.category || 'other';
                                const options = serviceOptions[category];
                                const isKnownDescription = options.includes(item.description);
                                const descriptionSelection = isKnownDescription ? item.description : CUSTOM_DESCRIPTION;
                                return (
                                  <div className="min-w-0 space-y-2">
                                    <label className="sr-only" htmlFor={`bill-description-${index}`}>Product or service</label>
                                    <ErpSelect
                                      id={`bill-description-${index}`}
                                      value={descriptionSelection}
                                      onChange={(event) => updateItem(index, {
                                        description: event.target.value === CUSTOM_DESCRIPTION ? '' : event.target.value,
                                      })}
                                      className="min-h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                                    >
                                      {options.map((option) => <option key={option} value={option}>{option}</option>)}
                                      <option value={CUSTOM_DESCRIPTION}>Other — enter a description</option>
                                    </ErpSelect>
                                    {descriptionSelection === CUSTOM_DESCRIPTION && (
                                      <>
                                        <label className="sr-only" htmlFor={`bill-description-custom-${index}`}>Custom product or service description</label>
                                        <input
                                          id={`bill-description-custom-${index}`}
                                          required
                                          maxLength={200}
                                          value={item.description}
                                          onChange={(event) => updateItem(index, { description: event.target.value })}
                                          className="min-h-10 w-full min-w-0 rounded-md border border-slate-300 px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                                        />
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                              {item.category === 'accommodation' && (
                                <div className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div>
                                    <label className="sr-only" htmlFor={`bill-check-in-${index}`}>Check-in date</label>
                                    <ErpDateTimePicker
                                      id={`bill-check-in-${index}`}
                                      required
                                      type="date"
                                      value={item.check_in_date || ''}
                                      onChange={(event) => {
                                        const nights = Math.round((Date.parse(`${item.check_out_date}T00:00:00.000Z`) - Date.parse(`${event.target.value}T00:00:00.000Z`)) / 86_400_000);
                                        updateItem(index, {
                                          check_in_date: event.target.value,
                                          ...(Number.isFinite(nights) && nights > 0 ? { quantity: nights } : {}),
                                        });
                                      }}
                                      className="min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                                    />
                                  </div>
                                  <div>
                                    <label className="sr-only" htmlFor={`bill-check-out-${index}`}>Check-out date</label>
                                    <ErpDateTimePicker
                                      id={`bill-check-out-${index}`}
                                      required
                                      type="date"
                                      min={item.check_in_date}
                                      value={item.check_out_date || ''}
                                      onChange={(event) => {
                                        const nights = Math.round((Date.parse(`${event.target.value}T00:00:00.000Z`) - Date.parse(`${item.check_in_date}T00:00:00.000Z`)) / 86_400_000);
                                        updateItem(index, {
                                          check_out_date: event.target.value,
                                          ...(Number.isFinite(nights) && nights > 0 ? { quantity: nights } : {}),
                                        });
                                      }}
                                      className="min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <p className="font-medium text-slate-900">{item.description}</p>
                              <p className="mt-1 text-xs capitalize text-slate-500">{item.category?.replace('_', ' ') || 'service'}</p>
                              {item.category === 'accommodation' && item.check_in_date && item.check_out_date && (
                                <p className="mt-1 text-xs text-slate-600">
                                  Check-in {formatInvoiceDate(item.check_in_date)} · Check-out {formatInvoiceDate(item.check_out_date)}
                                </p>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums text-slate-700">
                          {editing ? (
                            <input
                              aria-label={`Quantity for ${item.description || `service ${index + 1}`}`}
                              required
                              type="number"
                              min="0.01"
                              max="1000"
                              step="0.01"
                              value={item.quantity}
                              onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}
                              className="min-h-10 w-20 rounded-md border border-slate-300 px-2 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                            />
                          ) : item.category === 'accommodation' ? `${item.quantity} ${item.quantity === 1 ? 'night' : 'nights'}` : item.quantity}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums text-slate-700">
                          {editing ? (
                            <input
                              aria-label={`Unit price for ${item.description || `service ${index + 1}`}`}
                              required
                              type="number"
                              min="0.01"
                              max="10000000"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })}
                              className="min-h-10 w-28 rounded-md border border-slate-300 px-2 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                            />
                          ) : currencyAmount(invoice.currency, item.quantity * item.unit_price)}
                        </td>
                        {editing && (
                          <td className="py-4 pl-3 text-right">
                            <button
                              type="button"
                              aria-label={`Remove ${item.description || `service ${index + 1}`}`}
                              disabled={draft.items.length === 1}
                              onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}
                              className="min-h-9 rounded px-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600"
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                      );
                    })}
                    {draft.items.length === 0 && (
                      <tr><td colSpan={editing ? 5 : 4} className="py-8 text-center text-sm text-slate-500">Add a service or product to this invoice.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {unallocatedPaymentAmount > 0 && (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {currencyAmount(invoice.currency, unallocatedPaymentAmount)} in payments are not assigned to a single line item and are excluded from per-item amounts.
                </p>
              )}
            </section>

            <div className="border-b border-slate-200 pb-7">
              <section aria-label="Invoice totals" className="ml-auto max-w-[420px] space-y-3 text-sm">
                <div className="invoice-total-lines space-y-3">
                  <div className="flex justify-between gap-4 text-slate-600">
                    <span>Subtotal</span>
                    <span className="tabular-nums text-slate-900">{currencyAmount(invoice.currency, editing ? subtotal : invoice.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-slate-600">
                    {editing ? (
                      <label htmlFor="bill-tax-rate">Sales tax</label>
                    ) : <span>Sales tax ({invoice.tax_rate}%)</span>}
                    {editing ? (
                      <span className="flex items-center gap-2">
                        <input
                          id="bill-tax-rate"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={draft.tax_rate}
                          onChange={(event) => setDraft({ ...draft, tax_rate: Number(event.target.value) })}
                          className="min-h-9 w-20 rounded-md border border-slate-300 px-2 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                        />
                        <span>%</span>
                        <span className="tabular-nums text-slate-900">{currencyAmount(invoice.currency, taxAmount)}</span>
                      </span>
                    ) : <span className="tabular-nums text-slate-900">{currencyAmount(invoice.currency, invoice.tax_amount)}</span>}
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 font-semibold text-slate-900">
                    <span>Total</span>
                    <span className="tabular-nums">{currencyAmount(invoice.currency, editing ? total : invoice.total_amount)}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-slate-600">
                    <span>Customer paid to date</span>
                    <span className="tabular-nums text-slate-900">{currencyAmount(invoice.currency, invoice.paid_amount)}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-base font-bold text-slate-950">
                    <span>Amount remaining</span>
                    <span className="tabular-nums">{currencyAmount(invoice.currency, editing ? Math.max(0, total - invoice.paid_amount) : balance)}</span>
                  </div>
                </div>
                <div className="border-t border-slate-200 pt-3 text-slate-600">
                  <span className="font-medium text-slate-700">Payment history</span>
                  {invoice.payments?.length ? (
                    <ul className="mt-2 divide-y divide-slate-100" aria-label="Payment history">
                      {invoice.payments
                        .slice()
                        .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
                        .map((payment) => {
                          const invoiceCredit = payment.invoice_amount_cents != null
                            ? payment.invoice_amount_cents / 100
                            : payment.currency === invoice.currency ? payment.amount : null;
                          return (
                          <li key={payment.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs tabular-nums text-slate-700">
                            <div>
                              <time dateTime={payment.payment_date.slice(0, 10)} className="font-medium">{formatInvoiceDate(payment.payment_date.slice(0, 10))}</time>
                              <p className="mt-0.5 text-[11px] text-slate-500">{payment.payment_method}{payment.payment_account && payment.payment_account !== payment.payment_method ? ` · ${payment.payment_account}` : ''}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-slate-900">{currencyAmount(payment.currency, payment.amount)}</p>
                              {payment.currency !== invoice.currency && invoiceCredit !== null && <p className="text-[11px] text-slate-500">Credited: {currencyAmount(invoice.currency, invoiceCredit)}</p>}
                            </div>
                          </li>
                        );})}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No payments recorded</p>
                  )}
                </div>
              </section>
            </div>

            {totalBelowRecordedPayments && (
              <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                The invoice total cannot be lower than payments already recorded ({currencyAmount(invoice.currency, invoice.paid_amount)}). Adjustments to recorded payments must be made from the payment record.
              </p>
            )}

            <div className="grid gap-7">
              <section aria-labelledby="invoice-notes-heading">
                <h2 id="invoice-notes-heading" className="text-sm font-semibold text-slate-900">Notes</h2>
                {editing ? (
                  <textarea
                    aria-label="Invoice notes"
                    maxLength={2000}
                    rows={4}
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    className="mt-2 min-h-24 w-full rounded-md border border-slate-300 p-3 text-sm leading-6 text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3069C4]"
                  />
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {invoice.notes || 'Thank you for choosing Freedive Dahab.'}
                  </p>
                )}
              </section>
            </div>

            {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

            <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
              <p className="font-medium text-slate-700">Freedive Dahab · Dahab, Egypt</p>
            </footer>
          </article>
        </div>
      </form>
    </dialog>
  );
};
