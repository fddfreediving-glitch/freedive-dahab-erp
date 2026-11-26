import React, { useMemo, useState } from 'react';
import { Download, FileText, Search } from 'lucide-react';
import { Invoice, InvoiceUpdateInput, Payment, UserRole } from '../types';
import { downloadCsv } from '../utils/csv';
import { InvoiceBillDialog } from './InvoiceBillDialog';

interface InvoiceReportsViewProps {
  invoices: Invoice[];
  userRole: UserRole;
  onUpdateInvoice: (invoiceId: string, changes: InvoiceUpdateInput) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const money = (currency: string, amount: number) => new Intl.NumberFormat('en', {
  style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount);

const dateLabel = (value: string) => new Intl.DateTimeFormat('en', {
  day: '2-digit', month: 'short', year: 'numeric',
}).format(new Date(`${value}T12:00:00`));

const isOverdue = (invoice: Invoice) => invoice.total_amount > invoice.paid_amount && invoice.status !== 'cancelled' &&
  invoice.due_date < new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

export const InvoiceReportsView: React.FC<InvoiceReportsViewProps> = ({ invoices, userRole, onUpdateInvoice, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [currency, setCurrency] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'issue_date' | 'customer' | 'total' | 'status'>('issue_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const currencies = useMemo(() => Array.from(new Set(invoices.map((invoice) => invoice.currency))).sort(), [invoices]);
  const filtered = useMemo(() => invoices.filter((invoice) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [invoice.invoice_number, invoice.first_name, invoice.last_name, invoice.student_email]
      .some((value) => value?.toLowerCase().includes(query));
    const matchesStatus = status === 'all' || (status === 'overdue' ? isOverdue(invoice) : invoice.status === status);
    return matchesSearch && matchesStatus && (currency === 'all' || invoice.currency === currency) &&
      (!fromDate || invoice.issue_date >= fromDate) && (!toDate || invoice.issue_date <= toDate);
  }).sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'issue_date') comparison = a.issue_date.localeCompare(b.issue_date);
    if (sortBy === 'customer') comparison = `${a.first_name || ''} ${a.last_name || ''}`.localeCompare(`${b.first_name || ''} ${b.last_name || ''}`);
    if (sortBy === 'total') comparison = a.total_amount - b.total_amount;
    if (sortBy === 'status') comparison = (isOverdue(a) ? 'overdue' : a.status).localeCompare(isOverdue(b) ? 'overdue' : b.status);
    return (sortDirection === 'asc' ? comparison : -comparison) || b.invoice_number.localeCompare(a.invoice_number);
  }), [invoices, search, status, currency, fromDate, toDate, sortBy, sortDirection]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleInvoices = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const updateSort = (key: typeof sortBy) => {
    if (sortBy === key) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDirection(key === 'issue_date' ? 'desc' : 'asc'); }
    setPage(1);
  };

  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, { total: number; paid: number; remaining: number }>();
    for (const invoice of filtered) {
      if (invoice.status === 'cancelled') continue;
      const current = totals.get(invoice.currency) || { total: 0, paid: 0, remaining: 0 };
      current.total += invoice.total_amount;
      current.paid += invoice.paid_amount;
      current.remaining += Math.max(0, invoice.total_amount - invoice.paid_amount);
      totals.set(invoice.currency, current);
    }
    return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const openInvoice = invoices.find((invoice) => invoice.id === openInvoiceId) || null;
  const exportCsv = () => downloadCsv('customer-invoice-report.csv', [
    ['Invoice', 'Customer', 'Email', 'Issued', 'Due', 'Currency', 'Total', 'Paid', 'Balance', 'Status'],
    ...filtered.map((invoice) => [invoice.invoice_number, `${invoice.first_name || ''} ${invoice.last_name || ''}`.trim(),
      invoice.student_email || '', invoice.issue_date, invoice.due_date, invoice.currency, invoice.total_amount,
      invoice.paid_amount, Math.max(0, invoice.total_amount - invoice.paid_amount), isOverdue(invoice) ? 'overdue' : invoice.status]),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Reports</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">Customer invoices</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Search and review every customer bill, payment, and outstanding balance.</p>
        </div>
        <button type="button" onClick={exportCsv} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <Download className="h-4 w-4" aria-hidden="true" /> Export filtered invoices
        </button>
      </header>

      <section aria-label="Invoice filters" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.6fr)_170px_130px_160px_160px_auto]">
        <label className="relative block">
          <span className="sr-only">Search invoices</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Invoice number, customer, or email" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        </label>
        <label className="sr-only" htmlFor="invoice-report-status">Invoice status</label>
        <select id="invoice-report-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="issued">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option>
        </select>
        <label className="sr-only" htmlFor="invoice-report-currency">Currency</label>
        <select id="invoice-report-currency" value={currency} onChange={(event) => { setCurrency(event.target.value); setPage(1); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
          <option value="all">All currencies</option>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">From <input aria-label="Invoice issue date from" type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">To <input aria-label="Invoice issue date to" type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1); }} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
        <button type="button" onClick={() => { setSearch(''); setStatus('all'); setCurrency('all'); setFromDate(''); setToDate(''); setPage(1); }} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800">Clear</button>
      </section>

      <section aria-label="Invoice report totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="erp-card erp-card--pinot rounded-2xl border border-blue-100 bg-white p-5 shadow-[0_2px_12px_rgba(40,51,78,0.04)] dark:border-blue-900/50 dark:bg-[#1E293B]">
          <p className="erp-card-heading text-[11px] font-bold uppercase tracking-wide">Invoiced</p>
          <div className="mt-2 space-y-1">
            {totalsByCurrency.length ? totalsByCurrency.map(([code, values]) => (
              <p key={code} className="erp-card-value break-words text-2xl font-extrabold leading-none tabular-nums">{money(code, values.total)}</p>
            )) : <p className="erp-card-value text-2xl font-extrabold leading-none tabular-nums">—</p>}
          </div>
          <p className="mt-2 text-sm opacity-80">By invoice currency</p>
        </article>
        <article className="erp-card erp-card--moss rounded-2xl border border-emerald-100 bg-white p-5 shadow-[0_2px_12px_rgba(40,51,78,0.04)] dark:border-emerald-900/50 dark:bg-[#1E293B]">
          <p className="erp-card-heading text-[11px] font-bold uppercase tracking-wide">Collected revenue</p>
          <div className="mt-2 space-y-1">
            {totalsByCurrency.length ? totalsByCurrency.map(([code, values]) => (
              <p key={code} className="erp-card-value break-words text-2xl font-extrabold leading-none tabular-nums">{money(code, values.paid)}</p>
            )) : <p className="erp-card-value text-2xl font-extrabold leading-none tabular-nums">—</p>}
          </div>
          <p className="mt-2 text-sm opacity-80">By invoice currency</p>
        </article>
        <article className="erp-card erp-card--peach rounded-2xl border border-rose-100 bg-white p-5 shadow-[0_2px_12px_rgba(40,51,78,0.04)] dark:border-rose-900/50 dark:bg-[#1E293B]">
          <p className="erp-card-heading text-[11px] font-bold uppercase tracking-wide">Outstanding receivable</p>
          <div className="mt-2 space-y-1">
            {totalsByCurrency.length ? totalsByCurrency.map(([code, values]) => (
              <p key={code} className="erp-card-value break-words text-2xl font-extrabold leading-none tabular-nums">{money(code, values.remaining)}</p>
            )) : <p className="erp-card-value text-2xl font-extrabold leading-none tabular-nums">—</p>}
          </div>
          <p className="mt-2 text-sm opacity-80">Balance on active bills</p>
        </article>
        <article className="erp-card erp-card--influenza rounded-2xl border border-red-100 bg-white p-5 shadow-[0_2px_12px_rgba(40,51,78,0.04)] dark:border-red-900/50 dark:bg-[#1E293B]">
          <p className="erp-card-heading text-[11px] font-bold uppercase tracking-wide">Invoices shown</p>
          <p className="erp-card-value mt-2 text-3xl font-extrabold leading-none tabular-nums">{filtered.length}</p>
          <p className="mt-2 text-sm opacity-80">Matching the current filters</p>
        </article>
      </section>

      <section aria-label="Customer invoice list" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" aria-hidden="true" /><h2 className="font-bold text-slate-900 dark:text-white">Customer bills</h2></div>
          <span className="text-xs text-slate-500 dark:text-slate-400">{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
        </div>
        {filtered.length ? <><div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr>
              <th className="px-4 py-3">Invoice</th><th className="px-4 py-3"><button type="button" onClick={() => updateSort('customer')}>Customer ↕</button></th><th className="px-4 py-3"><button type="button" onClick={() => updateSort('issue_date')}>Issued / due ↕</button></th><th className="px-4 py-3 text-right"><button type="button" onClick={() => updateSort('total')}>Total ↕</button></th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3"><button type="button" onClick={() => updateSort('status')}>Status ↕</button></th><th className="px-4 py-3 text-right">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibleInvoices.map((invoice) => {
              const balance = Math.max(0, invoice.total_amount - invoice.paid_amount);
              const overdue = isOverdue(invoice);
              return <tr key={invoice.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                <td className="px-4 py-4"><button type="button" onClick={() => setOpenInvoiceId(invoice.id)} className="font-semibold text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-300">{invoice.invoice_number}</button>{invoice.customer_request_number && <p className="mt-1 text-xs text-slate-500">Request {invoice.customer_request_number}</p>}</td>
                <td className="px-4 py-4"><p className="font-semibold text-slate-900 dark:text-white">{invoice.first_name} {invoice.last_name}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{invoice.student_email || 'No email on file'}</p></td>
                <td className="px-4 py-4 text-xs text-slate-600 dark:text-slate-300"><p>Issued {dateLabel(invoice.issue_date)}</p><p className="mt-1">Due {dateLabel(invoice.due_date)}</p></td>
                <td className="px-4 py-4 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{money(invoice.currency, invoice.total_amount)}</td>
                <td className="px-4 py-4 text-right tabular-nums text-slate-700 dark:text-slate-200">{money(invoice.currency, invoice.paid_amount)}</td>
                <td className="px-4 py-4 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{money(invoice.currency, balance)}</td>
                <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${invoice.status === 'cancelled' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : balance <= 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : overdue ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>{overdue ? 'Overdue' : invoice.status.replace('_', ' ')}</span></td>
                <td className="px-4 py-4 text-right"><button type="button" onClick={() => setOpenInvoiceId(invoice.id)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">View bill</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div><div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><p className="text-slate-500 dark:text-slate-400">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} invoices</p><div className="flex items-center gap-2"><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">Previous</button><span aria-live="polite" className="min-w-20 text-center text-xs text-slate-500">Page {currentPage} of {pageCount}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">Next</button></div></div></> : <div className="px-6 py-16 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-800 dark:text-slate-200">No invoices match these filters</p><p className="mt-1 text-sm text-slate-500">Try changing your search, status, currency, or issue date range.</p></div>}
      </section>

      {openInvoice && <InvoiceBillDialog invoice={openInvoice} sidePanel userRole={userRole} onClose={() => setOpenInvoiceId(null)} onSave={async (id, changes) => { await onUpdateInvoice(id, changes); await onRefresh(); }} onRecordPayment={(_invoice, _requestId) => {}} onAdjustPayment={(_payment: Payment, _invoice: Invoice) => {}} />}
    </div>
  );
};
