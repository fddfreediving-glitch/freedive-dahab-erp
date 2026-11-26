import { ErpDateTimePicker } from './ui/date-time-picker';
import { ErpSelect } from './ui/erp-select';
import { PhoneNumberInput } from './ui/phone-number-input';
import React, { useEffect, useMemo, useState } from 'react';
import { Student, Inquiry, StudentRegistrationInput, UserRole, Invoice, PosCatalogItem } from '../types';
import { Search, Plus, X, ShieldCheck, Lock, UserRoundPlus, Pencil } from 'lucide-react';
import { CustomerInvoiceDraft, CustomerInvoiceDraftPayload } from './CustomerInvoiceDraft';
import { StudentRegistrationPage } from './StudentRegistrationPage';

const formatShortDate = (value?: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

const formatLocalDateTime = (value?: string | null) =>
  value
    ? new Date(`${value}:00`).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const formatEuro = (value?: number | null) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(value ?? 0);

const activitySummary = (student: Student) => {
  const titles = Array.from(new Set((student.activities ?? []).map((activity) => activity.title)));
  if (titles.length === 0) return '—';
  if (titles.length <= 2) return titles.join(', ');
  return `${titles.slice(0, 2).join(', ')} +${titles.length - 2}`;
};

interface CustomerRecordUpdate {
  first_name: string;
  last_name: string;
  email: string;
  whatsapp: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  needs_accommodation: number;
  needs_airport_transfer: number;
  flight_number: string | null;
  airline_name: string | null;
  flight_arrival_at: string | null;
  transportation_requirements: string | null;
  hotel_name: string | null;
  assigned_driver: string | null;
  notes: string | null;
}

type MedicalClearanceStatus = 'unknown' | 'cleared' | 'physician_approved';
function isMedicalClearanceStatus(value: string): value is MedicalClearanceStatus {
  return ['unknown', 'cleared', 'physician_approved'].includes(value);
}

const CLEARANCE_LABEL: Record<MedicalClearanceStatus, string> = {
  unknown: 'Unknown / not cleared',
  cleared: 'Cleared',
  physician_approved: 'Physician approved',
};

interface StudentsCrmViewProps {
  students: Student[];
  inquiries: Inquiry[];
  userRole: UserRole;
  onRefresh: () => void;
  onUpdateWaiver: (studentId: string, signed: boolean, notes?: string) => Promise<void>;
  onUpdateMedicalClearance: (studentId: string, status: MedicalClearanceStatus) => Promise<void>;
  onUpdateStay: (studentId: string, details: CustomerRecordUpdate) => Promise<void>;
  onCreateInquiry: (inquiryData: any) => Promise<void>;
  onUpdateInquiryStatus: (inquiryId: string, status: string) => Promise<void>;
  lang: string;
  invoices: Invoice[];
  catalogItems: PosCatalogItem[];
  onCreateCustomerInvoice: (payload: CustomerInvoiceDraftPayload) => Promise<void>;
  onRegisterStudent: (student: StudentRegistrationInput) => Promise<void>;
  onRecordDeposit: (invoice: Invoice, amount: number, paymentDate: string) => Promise<void>;
  onUpdateValidation: (studentId: string, values: { whatsapp_status?: Student['whatsapp_status']; transfer_status?: Student['transfer_status'] }) => Promise<void>;
  onOpenInvoice: (invoice: Invoice) => void;
}

export const StudentsCrmView: React.FC<StudentsCrmViewProps> = ({
  students,
  inquiries,
  userRole,
  onRefresh,
  onUpdateWaiver,
  onUpdateMedicalClearance,
  onUpdateStay,
  invoices,
  catalogItems,
  onCreateCustomerInvoice,
  onRegisterStudent,
  onRecordDeposit,
  onUpdateValidation,
  onOpenInvoice,
}) => {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isRegisteringStudent, setIsRegisteringStudent] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [identityForm, setIdentityForm] = useState({ first_name: '', last_name: '', email: '' });
  const [stayForm, setStayForm] = useState({
    whatsapp: '',
    arrival_date: '',
    departure_date: '',
    needs_accommodation: false,
    needs_airport_transfer: false,
    flight_number: '',
    airline_name: '',
    flight_arrival_at: '',
    transportation_requirements: '',
    hotel_name: '',
    assigned_driver: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [depositInvoiceId, setDepositInvoiceId] = useState<string | null>(null);
  const [depositAmountInput, setDepositAmountInput] = useState('');
  const [depositDateInput, setDepositDateInput] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [validationSavingId, setValidationSavingId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<{ studentId: string; message: string } | null>(null);
  const [invoiceCreated, setInvoiceCreated] = useState(false);

  const isHealthAuthorized = ['owner', 'operations_manager', 'hr'].includes(userRole);
  const canEditWaiver = ['owner', 'operations_manager', 'front_desk_crm'].includes(userRole);

  const customerStudents = useMemo(() => {
    const customerIds = new Set(invoices.map((invoice) => invoice.student_id));
    return students.filter((student) => customerIds.has(student.id) || Boolean(student.activities?.length));
  }, [students, invoices]);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customerStudents.filter((student) => {
      if (!term) return true;
      const haystack = [
        student.first_name,
        student.last_name,
        student.email,
        student.phone,
        student.whatsapp,
        student.flight_number,
        student.airline_name,
        student.transportation_requirements,
        student.hotel_name,
        student.assigned_driver,
        student.notes,
        student.certification_agency,
        student.certification_level,
        ...(student.activities ?? []).map((activity) => activity.title),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [customerStudents, search]);

  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / rowsPerPage));
  const safePage = Math.min(currentPage, pageCount);
  const pageStart = (safePage - 1) * rowsPerPage;
  const pageRows = filteredStudents.slice(pageStart, pageStart + rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, rowsPerPage]);

  const handleMedicalClearanceChange = async (status: MedicalClearanceStatus) => {
    if (!selectedStudent) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await onUpdateMedicalClearance(selectedStudent.id, status);
      setSelectedStudent({ ...selectedStudent, medical_clearance_status: status });
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update medical clearance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWaiverToggle = async () => {
    if (!selectedStudent) return;
    const nextSigned = !selectedStudent.medical_waiver_signed;
    setSubmitting(true);
    setFormError(null);
    try {
      await onUpdateWaiver(selectedStudent.id, nextSigned);
      setSelectedStudent({
        ...selectedStudent,
        medical_waiver_signed: nextSigned ? 1 : 0,
        medical_waiver_date: nextSigned ? new Date().toISOString().slice(0, 10) : undefined,
      });
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update the waiver');
    } finally {
      setSubmitting(false);
    }
  };

  const openStudentRecord = (student: Student) => {
    setFormError(null);
    setSelectedStudent(student);
    setIdentityForm({ first_name: student.first_name, last_name: student.last_name, email: student.email });
    setStayForm({
      whatsapp: student.whatsapp ?? '',
      arrival_date: student.arrival_date ?? '',
      departure_date: student.departure_date ?? '',
      needs_accommodation: Boolean(student.needs_accommodation),
      needs_airport_transfer: Boolean(student.needs_airport_transfer),
      flight_number: student.flight_number ?? '',
      airline_name: student.airline_name ?? '',
      flight_arrival_at: student.flight_arrival_at ?? '',
      transportation_requirements: student.transportation_requirements ?? '',
      hotel_name: student.hotel_name ?? '',
      assigned_driver: student.assigned_driver ?? '',
      notes: student.notes ?? '',
    });
  };

  const handleStaySave = async () => {
    if (!selectedStudent) return;
    if (!identityForm.first_name.trim() || !identityForm.last_name.trim()) {
      setFormError('Enter both the customer’s first and last name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identityForm.email.trim())) {
      setFormError('Enter a valid customer email address.');
      return;
    }
    if (stayForm.arrival_date && stayForm.departure_date && stayForm.departure_date < stayForm.arrival_date) {
      setFormError('Check-out date cannot be before the arrival date.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const details: CustomerRecordUpdate = {
        first_name: identityForm.first_name.trim(),
        last_name: identityForm.last_name.trim(),
        email: identityForm.email.trim(),
        whatsapp: stayForm.whatsapp.trim() || null,
        arrival_date: stayForm.arrival_date || null,
        departure_date: stayForm.departure_date || null,
        needs_accommodation: stayForm.needs_accommodation ? 1 : 0,
        needs_airport_transfer: stayForm.needs_airport_transfer ? 1 : 0,
        flight_number: stayForm.flight_number.trim() || null,
        airline_name: stayForm.airline_name.trim() || null,
        flight_arrival_at: stayForm.flight_arrival_at || null,
        transportation_requirements: stayForm.transportation_requirements.trim() || null,
        hotel_name: stayForm.hotel_name.trim() || null,
        assigned_driver: stayForm.assigned_driver.trim() || null,
        notes: stayForm.notes.trim() || null,
      };
      await onUpdateStay(selectedStudent.id, details);
      setSelectedStudent({
        ...selectedStudent,
        first_name: details.first_name,
        last_name: details.last_name,
        email: details.email,
        whatsapp: details.whatsapp ?? undefined,
        arrival_date: details.arrival_date ?? undefined,
        departure_date: details.departure_date ?? undefined,
        needs_accommodation: details.needs_accommodation,
        needs_airport_transfer: details.needs_airport_transfer,
        flight_number: details.flight_number ?? undefined,
        airline_name: details.airline_name ?? undefined,
        flight_arrival_at: details.flight_arrival_at ?? undefined,
        transportation_requirements: details.transportation_requirements ?? undefined,
        hotel_name: details.hotel_name ?? undefined,
        assigned_driver: details.assigned_driver ?? undefined,
        notes: details.notes ?? undefined,
      });
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save the trip details');
    } finally {
      setSubmitting(false);
    }
  };

  const firstRow = filteredStudents.length === 0 ? 0 : pageStart + 1;
  const lastRow = Math.min(pageStart + rowsPerPage, filteredStudents.length);
  const canRecordDeposit = ['owner', 'finance'].includes(userRole);
  const canEditCustomerDetails = ['owner', 'finance', 'operations_manager', 'front_desk_crm'].includes(userRole);

  const saveValidation = async (studentId: string, values: { whatsapp_status?: Student['whatsapp_status']; transfer_status?: Student['transfer_status'] }) => {
    setValidationSavingId(studentId);
    setValidationError(null);
    try {
      await onUpdateValidation(studentId, values);
      await onRefresh();
    } catch (error) {
      setValidationError({ studentId, message: error instanceof Error ? error.message : 'Could not save this status.' });
    } finally {
      setValidationSavingId(null);
    }
  };

  const handleDepositSave = async (invoice: Invoice) => {
    const amount = Number(depositAmountInput);
    const balance = Math.max(0, invoice.total_amount - invoice.paid_amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      setDepositError(`Enter an amount greater than zero and no more than ${new Intl.NumberFormat('en', { style: 'currency', currency: invoice.currency }).format(balance)}.`);
      return;
    }
    setDepositSaving(true);
    setDepositError(null);
    try {
      await onRecordDeposit(invoice, amount, depositDateInput);
      setDepositInvoiceId(null);
      setDepositAmountInput('');
    } catch (error) {
      setDepositError(error instanceof Error ? error.message : 'Could not record the deposit.');
    } finally {
      setDepositSaving(false);
    }
  };

  if (isRegisteringStudent) {
    return (
      <StudentRegistrationPage
        userRole={userRole}
        onRegister={onRegisterStudent}
        onCancel={() => setIsRegisteringStudent(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="w-full space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 pb-1">
            <div>
              <h1 className="text-2xl font-extrabold text-[#28334E] dark:text-white tracking-tight">Customers</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customer records — {customerStudents.length} {customerStudents.length === 1 ? 'record' : 'records'} with saved invoices or activities.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto"><label htmlFor="customer-search" className="sr-only">Search customers</label><div className="relative min-w-[240px] flex-1 sm:flex-none"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" /><input id="customer-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone" className="min-h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-xs text-slate-900 focus:border-[#4C8BF5] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></div><button
              type="button"
              onClick={() => { setIsCreatingCustomer(false); setIsRegisteringStudent(true); }}
              disabled={isCreatingCustomer}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#4C8BF5] px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Register Student
              <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
            </button></div>

          </div>
          {invoiceCreated && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">Customer saved and invoice created. It is linked to the customer below.</p>}

          <div className="erp-card erp-card--sky rounded-2xl border border-[#E8EEF7] dark:border-slate-800 shadow-[0_2px_12px_rgba(40,51,78,0.02)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[2300px] w-full text-left rtl:text-right text-xs">
                <thead>
                  <tr className="border-b border-[#E8EEF7] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-800/50 text-[10px] font-bold text-[#4C8BF5] uppercase tracking-wider">
                    <th scope="col" className="sticky left-0 z-10 bg-[#F8FAFC] px-2 py-3.5 dark:bg-slate-800/80"><button type="button" onClick={() => setIsCreatingCustomer(true)} disabled={isCreatingCustomer || !['owner', 'finance'].includes(userRole)} title={!['owner', 'finance'].includes(userRole) ? 'Customer and invoice creation is restricted to Finance roles' : 'Add an empty customer row'} aria-label="Add empty customer row" className="rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-40"><Plus size={16} /></button></th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 font-bold">Date</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 font-bold">Customer Name &amp; Email</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 font-bold">WhatsApp</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 font-bold">Item / Description</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 font-bold">Course Start Date</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 font-bold">Accommodation / Room / Dates</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 font-bold">Arrival &amp; Check-out</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 font-bold">Transportation</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 text-right font-bold">Deposit</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 text-right font-bold">Due Payment</th>
                    <th scope="col" className="whitespace-nowrap py-3.5 px-4 font-bold">Comments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] dark:divide-slate-800/80">
                  {isCreatingCustomer && <CustomerInvoiceDraft students={students} catalog={catalogItems} onCancel={() => setIsCreatingCustomer(false)} onSave={async (payload) => { await onCreateCustomerInvoice(payload); setIsCreatingCustomer(false); setInvoiceCreated(true); await onRefresh(); }} />}
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 px-4 text-center text-slate-500 dark:text-slate-400">
                        {customerStudents.length === 0
                          ? 'No customer rows yet. Add a row, choose a contact, and enter their visit details.'
                          : 'No customers match your search. Clear the search and try again.'}
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((student) => {
                      const customerInvoices = invoices.filter((invoice) => invoice.student_id === student.id).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
                      const latestInvoice = customerInvoices.find((invoice) => invoice.status !== 'cancelled');
                      const invoiceStartDate = latestInvoice?.items?.find((item) => item.service_start_date)?.service_start_date;
                      const money = (amount: number, currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount || 0);
                      const whatsappStatus = student.whatsapp_status === 'contacted' ? 'contacted' : 'available';
                      const transferStatus = student.transfer_status || (student.needs_airport_transfer ? 'required' : '');
                      const whatsappDigits = (student.whatsapp || '').replace(/\D/g, '');
                      const whatsappNumber = whatsappDigits.startsWith('0') ? `20${whatsappDigits.slice(1)}` : whatsappDigits.startsWith('00') ? whatsappDigits.slice(2) : whatsappDigits;
                      const whatsappColor = whatsappStatus === 'contacted'
                        ? 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900';
                      return (
                        <tr key={student.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/50 transition-colors">
                          <td className="sticky left-0 z-[1] bg-white px-2 dark:bg-[#1E293B]">
                            <button
                              type="button"
                              onClick={() => openStudentRecord(student)}
                              disabled={!canEditCustomerDetails}
                              aria-label={`Edit customer row for ${student.first_name} ${student.last_name}`}
                              title="Edit customer row"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-slate-800 dark:hover:text-blue-300"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">{student.created_at ? formatShortDate(student.created_at.slice(0, 10)) : '—'}</td>
                          <td className="py-3.5 px-4 font-semibold text-[#28334E] dark:text-white">
                            <button
                              type="button"
                              onClick={() => openStudentRecord(student)}
                              className="text-left rtl:text-right hover:text-[#4C8BF5] transition-colors cursor-pointer"
                            >
                              {student.first_name} {student.last_name}
                            </button>
                            <div className="text-[11px] font-normal text-slate-400 truncate max-w-[190px]">{student.email}</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            <div className={`flex min-w-44 items-center overflow-hidden rounded-full border ${whatsappColor}`}>
                              {whatsappNumber ? <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" aria-label={`Message ${student.first_name} ${student.last_name} on WhatsApp`} title={`Open WhatsApp chat with ${student.whatsapp}`} className="min-w-0 flex-1 truncate px-3 py-1.5 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{student.whatsapp}</a> : <span className="min-w-0 flex-1 truncate px-3 py-1.5 text-[11px] font-semibold">No WhatsApp number</span>}
                              <span className="w-10 shrink-0 border-l border-current/15">
                                <ErpSelect aria-label={`WhatsApp follow-up status for ${student.first_name} ${student.last_name}`} title="Change WhatsApp follow-up status" menuWidth={224} className="!min-h-10 !w-10 !min-w-0 !justify-center !gap-0 !rounded-none !border-0 !bg-transparent !p-0 !text-current !shadow-none hover:!bg-black/5 dark:hover:!bg-white/10" displayValue={<span className="sr-only">WhatsApp follow-up status</span>} value={whatsappStatus} disabled={!canEditCustomerDetails || !student.whatsapp || validationSavingId === student.id} onChange={(event) => void saveValidation(student.id, { whatsapp_status: event.target.value as Student['whatsapp_status'] })}>
                                  <option value="available" data-tone="green">Saved · not contacted</option><option value="contacted" data-tone="blue">Contacted on WhatsApp</option>
                                </ErpSelect>
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            {customerInvoices.length ? <div className="min-w-52 space-y-2">{customerInvoices.map((invoice) => <div key={invoice.id} className="border-b border-slate-100 pb-1.5 last:border-0 dark:border-slate-700"><button type="button" className="font-semibold text-blue-600 hover:underline dark:text-blue-400" title={`${invoice.invoice_number} · ${invoice.status}`} onClick={() => onOpenInvoice(invoice)}>{invoice.invoice_number} · {invoice.status.replace('_', ' ')}</button><ul className="mt-0.5 space-y-1 text-[11px]">{(invoice.items ?? []).map((item) => <li key={item.id} className="max-w-[240px]" title={`${item.description} · Qty ${item.quantity}`}><span className="block truncate">{item.description}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</span><span className="block text-[10px] text-slate-400">{item.service_start_date ? formatShortDate(item.service_start_date) : 'Start date not set'}</span></li>)}</ul></div>)}</div> : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatShortDate(invoiceStartDate)}</td>
                          <td className="py-3.5 px-4">
                            {student.needs_accommodation ? <><span className="text-slate-600 dark:text-slate-300">{[...(latestInvoice?.items ?? [])].filter(i=>i.category==='accommodation').map(i=>i.description).join(', ') || 'Required'}</span><div className="mt-1 text-[10px] text-slate-400">{formatShortDate(student.arrival_date)} → {formatShortDate(student.departure_date)}</div></> : <span className="text-slate-400">No</span>}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {student.arrival_date || student.departure_date ? <>{formatShortDate(student.arrival_date)}<span className="text-slate-400"> → </span>{formatShortDate(student.departure_date)}</> : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            <div>{[student.flight_number, student.airline_name].filter(Boolean).join(' | ') || '—'}</div><div className="mt-1 text-[10px]">{formatLocalDateTime(student.flight_arrival_at)}</div><div className="mt-1 text-[10px]">{[student.hotel_name, student.assigned_driver].filter(Boolean).join(' | ')}</div><div className="mt-1 text-[10px]">{student.transportation_requirements}</div><div className="mt-1 text-[10px]">{transferStatus==='required'?'Airport transfer':transferStatus==='arranged'?'Transfer arranged':''}</div>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap font-data text-slate-600 dark:text-slate-300">
                            {latestInvoice ? <>
                              {latestInvoice.payments?.length ? <div aria-label="Deposit payment history" className="space-y-1">{latestInvoice.payments.slice().sort((a, b) => b.payment_date.localeCompare(a.payment_date)).map((payment) => <div key={payment.id} className="whitespace-nowrap text-[10px] leading-4" title={`Payment recorded ${formatShortDate(payment.payment_date)} · ${payment.payment_method || 'Payment'}`}><span className="text-slate-500">{formatShortDate(payment.payment_date)}</span><br /><span>{money(payment.amount, payment.currency)}</span></div>)}</div> : <span className="text-slate-400">No payments</span>}
                              {canRecordDeposit && latestInvoice.total_amount > latestInvoice.paid_amount && <button type="button" className="ml-2 rounded-md px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800" onClick={() => { setDepositInvoiceId(depositInvoiceId === latestInvoice.id ? null : latestInvoice.id); setDepositAmountInput(''); setDepositError(null); }}>Add deposit</button>}
                              {depositInvoiceId === latestInvoice.id && <div className="mt-2 grid min-w-48 gap-1.5 text-left">
                                <label className="sr-only" htmlFor={`deposit-amount-${latestInvoice.id}`}>Deposit amount in {latestInvoice.currency}</label>
                                <input id={`deposit-amount-${latestInvoice.id}`} type="number" min="0.01" max={Math.max(0, latestInvoice.total_amount - latestInvoice.paid_amount)} step="0.01" required value={depositAmountInput} onChange={(event) => setDepositAmountInput(event.target.value)} placeholder={`Amount (${latestInvoice.currency})`} className="min-h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                                <label className="sr-only" htmlFor={`deposit-date-${latestInvoice.id}`}>Payment date</label>
                                <ErpDateTimePicker id={`deposit-date-${latestInvoice.id}`} type="date" required value={depositDateInput} onChange={(event) => setDepositDateInput(event.target.value)} className="min-h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                                <div className="flex gap-1"><button type="button" onClick={() => void handleDepositSave(latestInvoice)} disabled={depositSaving} className="min-h-8 rounded-md bg-blue-600 px-2 text-[10px] font-semibold text-white disabled:opacity-50">{depositSaving ? 'Saving…' : 'Record'}</button><button type="button" onClick={() => { setDepositInvoiceId(null); setDepositError(null); }} className="min-h-8 rounded-md px-2 text-[10px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button></div>
                                {depositError && <p role="alert" className="text-left text-[10px] text-rose-600">{depositError}</p>}
                              </div>}
                            </> : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap font-data text-slate-600 dark:text-slate-300">{latestInvoice ? money(Math.max(0, latestInvoice.total_amount - latestInvoice.paid_amount), latestInvoice.currency) : '—'}</td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            <button type="button" onClick={() => openStudentRecord(student)} className="block max-w-[220px] truncate text-left hover:text-[#4C8BF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5]" title={student.notes || 'Open customer record'}>{student.notes || '—'}</button>
                          </td>
                          {/* legacy cells replaced by ordered customer fields */}
                          {false && <>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            <span
                              className="block max-w-[220px] truncate"
                              title={(student.activities ?? []).map((activity) => activity.title).join(', ')}
                            >
                              {activitySummary(student)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {(() => {
                              const starts = (student.activities ?? [])
                                .map((activity) => activity.start_date)
                                .filter((date): date is string => Boolean(date))
                                .sort();
                              return starts.length > 0 ? (
                                <span className="font-medium text-slate-800 dark:text-slate-200">{formatShortDate(starts[0])}</span>
                              ) : (
                                <span className="text-slate-400">Not set</span>
                              );
                            })()}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {student.arrival_date || student.departure_date ? (
                              <>
                                <span className="font-medium text-slate-800 dark:text-slate-200">{formatShortDate(student.arrival_date)}</span>
                                <span className="text-slate-400"> → </span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">{formatShortDate(student.departure_date)}</span>
                              </>
                            ) : (
                              <span className="text-slate-400">Not set</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                student.needs_accommodation
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {student.needs_accommodation ? 'Yes' : 'No'}
                            </span>
                            {student.needs_accommodation && (student.arrival_date || student.departure_date) && (
                              <div className="mt-1 whitespace-nowrap font-data text-[10px] text-slate-500 dark:text-slate-400">
                                {formatShortDate(student.arrival_date)} → {formatShortDate(student.departure_date)}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-data text-slate-600 dark:text-slate-300">
                            {student.flight_number || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            {student.airline_name || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                            {formatLocalDateTime(student.flight_arrival_at)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            <span className="block max-w-[240px] truncate" title={student.transportation_requirements || undefined}>
                              {student.transportation_requirements || (student.needs_airport_transfer ? 'Airport pickup' : '—')}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            {student.hotel_name || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            {student.assigned_driver || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {student.whatsapp || <span className="text-slate-400">—</span>}
                          </td>
                          <td className={`py-3.5 px-4 text-right whitespace-nowrap font-data ${student.deposit_paid_eur ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>
                            {formatEuro(student.deposit_paid_eur)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                            <button
                              type="button"
                              onClick={() => openStudentRecord(student)}
                              className="block max-w-[240px] truncate text-left hover:text-[#4C8BF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5]"
                              title={student.notes || 'Open customer record'}
                            >
                              {student.notes || '—'}
                            </button>
                          </td>
                          </>}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-[#E8EEF7] dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 gap-3">
              <span>
                Showing {firstRow}–{lastRow} of {filteredStudents.length}
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={safePage === 1}
                  onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                  className="px-2.5 py-1 rounded-lg hover:text-slate-900 dark:hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  &lt; Prev
                </button>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Page {safePage} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={safePage === pageCount}
                  onClick={() => setCurrentPage(Math.min(pageCount, safePage + 1))}
                  className="px-2.5 py-1 rounded-lg hover:text-slate-900 dark:hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next &gt;
                </button>

                <label className="flex items-center gap-2">
                  <span className="sr-only">Rows per page</span>
                  <ErpSelect
                    value={rowsPerPage}
                    onChange={(event) => setRowsPerPage(Number(event.target.value))}
                    className="bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:border-[#4C8BF5]"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </ErpSelect>
                  per page
                </label>
              </div>
            </div>
          </div>
        </section>

      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="customer-record-title" className="bg-white dark:bg-[#1E293B] rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 id="customer-record-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedStudent.first_name} {selectedStudent.last_name}
                </h2>
                <p className="text-xs text-slate-400">
                  {selectedStudent.certification_agency && selectedStudent.certification_agency !== 'None'
                    ? `${selectedStudent.certification_agency} ${selectedStudent.certification_level || ''}`
                    : 'Not certified yet'}{' '}
                  • ID: {selectedStudent.id}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close student record"
                onClick={() => setSelectedStudent(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Personal best depth</span>
                  <div className="text-lg font-bold text-[#4C8BF5] mt-1 font-mono">
                    {selectedStudent.total_depth_pb ? `${selectedStudent.total_depth_pb}m` : '—'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Static apnea</span>
                  <div className="text-lg font-bold text-[#4C8BF5] mt-1 font-mono">
                    {selectedStudent.static_apnea_pb || '—'}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Customer details</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Edit the customer fields shown in this row. Open an invoice number in the row to edit its services, dates, and billing details.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="record-first-name" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">First name</label>
                    <input id="record-first-name" required maxLength={100} value={identityForm.first_name} onChange={(event) => setIdentityForm({ ...identityForm, first_name: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label htmlFor="record-last-name" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Last name</label>
                    <input id="record-last-name" required maxLength={100} value={identityForm.last_name} onChange={(event) => setIdentityForm({ ...identityForm, last_name: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="record-email" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Email</label>
                    <input id="record-email" type="email" required maxLength={120} value={identityForm.email} onChange={(event) => setIdentityForm({ ...identityForm, email: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="record-whatsapp" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">WhatsApp</label>
                    <PhoneNumberInput id="record-whatsapp" aria-label="WhatsApp number" value={stayForm.whatsapp} onChange={(value) => setStayForm({ ...stayForm, whatsapp: value })} className="w-full" />
                  </div>
                  <div>
                    <label htmlFor="record-arrival" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Arrival</label>
                    <ErpDateTimePicker id="record-arrival" type="date" value={stayForm.arrival_date} onChange={(event) => setStayForm({ ...stayForm, arrival_date: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label htmlFor="record-departure" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Check-out</label>
                    <ErpDateTimePicker id="record-departure" type="date" min={stayForm.arrival_date || undefined} value={stayForm.departure_date} onChange={(event) => setStayForm({ ...stayForm, departure_date: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={stayForm.needs_accommodation} onChange={(event) => setStayForm({ ...stayForm, needs_accommodation: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-[#4C8BF5]" />
                    Accommodation needed
                  </label>
                  <div>
                    <label htmlFor="record-hotel" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Hotel name</label>
                    <input id="record-hotel" maxLength={150} value={stayForm.hotel_name} onChange={(event) => setStayForm({ ...stayForm, hotel_name: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label htmlFor="record-flight-number" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Flight number</label>
                    <input id="record-flight-number" maxLength={50} value={stayForm.flight_number} onChange={(event) => setStayForm({ ...stayForm, flight_number: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 font-data text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label htmlFor="record-airline" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Airline name</label>
                    <input id="record-airline" maxLength={100} value={stayForm.airline_name} onChange={(event) => setStayForm({ ...stayForm, airline_name: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label htmlFor="record-flight-arrival" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Flight arrival date and time</label>
                    <ErpDateTimePicker id="record-flight-arrival" type="datetime-local" value={stayForm.flight_arrival_at} onChange={(event) => setStayForm({ ...stayForm, flight_arrival_at: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label htmlFor="record-driver" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Assigned driver</label>
                    <input id="record-driver" maxLength={150} value={stayForm.assigned_driver} onChange={(event) => setStayForm({ ...stayForm, assigned_driver: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={stayForm.needs_airport_transfer} onChange={(event) => setStayForm({ ...stayForm, needs_airport_transfer: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-[#4C8BF5]" />
                    Airport pickup required
                  </label>
                  <div className="sm:col-span-2">
                    <label htmlFor="record-transportation" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Transportation requirements</label>
                    <textarea id="record-transportation" rows={3} maxLength={1000} value={stayForm.transportation_requirements} onChange={(event) => setStayForm({ ...stayForm, transportation_requirements: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="record-comments" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Comments</label>
                    <textarea id="record-comments" rows={4} maxLength={4000} value={stayForm.notes} onChange={(event) => setStayForm({ ...stayForm, notes: event.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleStaySave}
                    className="inline-flex min-h-11 items-center rounded-lg bg-[#4C8BF5] px-4 py-2 text-[11px] font-semibold text-white hover:bg-[#3B7BE8] disabled:opacity-50 cursor-pointer"
                  >
                    Save customer details
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
                <ShieldCheck className={`w-4 h-4 mt-0.5 ${selectedStudent.medical_waiver_signed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} aria-hidden="true" />
                <div className="flex-1">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    Medical waiver {selectedStudent.medical_waiver_signed ? 'signed' : 'pending'}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {selectedStudent.medical_waiver_signed
                      ? `On file${selectedStudent.medical_waiver_date ? ` since ${selectedStudent.medical_waiver_date}` : ''}.`
                      : 'Do not take this student in the water until the waiver is signed.'}
                  </div>
                  {canEditWaiver && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleWaiverToggle}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-[#4C8BF5] hover:text-[#4C8BF5] disabled:opacity-50 cursor-pointer"
                    >
                      {selectedStudent.medical_waiver_signed ? 'Revoke waiver' : 'Mark waiver signed'}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <label htmlFor="medical-clearance-status" className="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">
                  Medical clearance
                </label>
                {isHealthAuthorized ? (
                  <ErpSelect
                    id="medical-clearance-status"
                    value={selectedStudent.medical_clearance_status || 'unknown'}
                    disabled={submitting}
                    onChange={(event) => {
                      if (isMedicalClearanceStatus(event.target.value)) {
                        void handleMedicalClearanceChange(event.target.value);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                  >
                    <option value="unknown">{CLEARANCE_LABEL.unknown}</option>
                    <option value="cleared">{CLEARANCE_LABEL.cleared}</option>
                    <option value="physician_approved">{CLEARANCE_LABEL.physician_approved}</option>
                  </ErpSelect>
                ) : (
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {selectedStudent.medical_clearance_status
                      ? CLEARANCE_LABEL[selectedStudent.medical_clearance_status]
                      : 'Restricted / not available'}
                  </div>
                )}
              </div>
              {formError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{formError}</p>}

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900 dark:text-white">Activities &amp; payments</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Paid to date: <strong className="font-data text-slate-900 dark:text-white">{formatEuro(selectedStudent.paid_total_eur)}</strong>
                  </div>
                </div>
                {(selectedStudent.activities ?? []).length === 0 ? (
                  <div className="text-slate-500 dark:text-slate-400">No activity booked yet.</div>
                ) : (
                  <ul className="space-y-2">
                    {(selectedStudent.activities ?? []).map((activity, index) => (
                      <li key={`${activity.title}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-100">{activity.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {activity.start_date || activity.end_date
                              ? `${formatShortDate(activity.start_date)} → ${formatShortDate(activity.end_date)}`
                              : 'Dates not scheduled'}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#EEF4FF] dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#4C8BF5]">
                          {activity.status.replace('_', ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-semibold text-slate-900 dark:text-white">Contact &amp; safety</div>
                <div className="text-slate-600 dark:text-slate-300 space-y-1">
                  <div>Email: <strong>{selectedStudent.email}</strong></div>
                  <div>Phone: <strong>{selectedStudent.phone || '—'}</strong></div>
                  <div>WhatsApp: <strong>{selectedStudent.whatsapp || '—'}</strong></div>
                  <div>Emergency contact: <strong>{selectedStudent.emergency_contact_name || 'None'}</strong></div>
                  <div>Emergency phone: <strong>{selectedStudent.emergency_contact_phone || '—'}</strong></div>
                  <div>Insurance: <strong>{selectedStudent.insurance_details || '—'}</strong></div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="px-4 py-2 rounded-xl bg-[#4C8BF5] text-white font-medium text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
