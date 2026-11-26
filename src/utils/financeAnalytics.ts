import { Expense, Invoice, Payment } from '../types';

type AnalyticsAdjustment = {
  direction?: 'debit' | 'credit';
  amount?: number;
  amount_cents?: number;
  adjustment_date?: string;
  payment_method?: string | null;
};
type AnalyticsPayment = Pick<Payment, 'currency' | 'payment_date' | 'amount'> & {
  payment_method?: string | null;
  net_amount?: number;
  adjustments?: AnalyticsAdjustment[];
};
type AnalyticsInvoice = Pick<Invoice, 'currency' | 'status' | 'total_amount' | 'paid_amount' | 'due_date' | 'first_name' | 'last_name'> & {
  payments?: AnalyticsPayment[];
};
type AnalyticsExpense = Pick<Expense, 'currency' | 'status' | 'expense_date' | 'amount'> & {
  vendor_name?: string;
  payment_method?: string | null;
};

export interface DailyFinancePoint {
  date: string;
  label: string;
  income: number;
  adjustments: number;
  expenses: number;
}

export interface FinancePeriodSummary {
  points: DailyFinancePoint[];
  income: number;
  adjustments: number;
  expenses: number;
  net: number;
  outstanding: number;
  overdue: number;
}

export type InvoiceServiceGroup = 'training' | 'activities' | 'stays' | 'gear' | 'products';

export interface InvoiceServiceMixPoint {
  group: InvoiceServiceGroup;
  label: string;
  amount: number;
}

export function getFinancePeriodSummary(
  invoices: AnalyticsInvoice[],
  expenses: AnalyticsExpense[],
  currency: string,
  endDate: string,
  periodDays = 30,
): FinancePeriodSummary {
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const days = Math.max(1, Math.floor(periodDays));
  const points = Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - index));
    const value = date.toISOString().slice(0, 10);
    return {
      date: value,
      label: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date),
      income: 0,
      adjustments: 0,
      expenses: 0,
    };
  });
  const pointByDate = new Map(points.map((point) => [point.date, point]));
  let outstanding = 0;
  let overdue = 0;

  for (const invoice of invoices) {
    if (invoice.currency !== currency) continue;
    if (invoice.status !== 'cancelled') {
      const balance = Math.max(0, invoice.total_amount - invoice.paid_amount);
      outstanding += balance;
      if (balance > 0 && invoice.due_date < endDate) overdue += balance;
    }
    for (const payment of invoice.payments || []) {
      if (payment.currency !== currency) continue;
      const adjustments = payment.adjustments || [];
      const point = pointByDate.get(payment.payment_date);
      const paymentAmount = adjustments.length > 0 ? payment.amount : payment.net_amount ?? payment.amount;
      if (point && Number.isFinite(paymentAmount)) point.income += Math.round(paymentAmount * 100) / 100;
      for (const adjustment of adjustments) {
        if (!adjustment.adjustment_date) continue;
        const adjustmentPoint = pointByDate.get(adjustment.adjustment_date);
        if (!adjustmentPoint || (adjustment.direction !== 'debit' && adjustment.direction !== 'credit')) continue;
        const amount = adjustment.amount ?? (adjustment.amount_cents === undefined ? NaN : adjustment.amount_cents / 100);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        adjustmentPoint.adjustments += (adjustment.direction === 'credit' ? 1 : -1) * Math.round(amount * 100) / 100;
      }
    }
  }

  for (const expense of expenses) {
    if (expense.currency !== currency || expense.status === 'rejected') continue;
    const point = pointByDate.get(expense.expense_date);
    if (point) point.expenses += expense.amount;
  }

  const income = points.reduce((total, point) => total + point.income, 0);
  const adjustments = points.reduce((total, point) => total + point.adjustments, 0);
  const expenseTotal = points.reduce((total, point) => total + point.expenses, 0);
  return {
    points,
    income: Math.round(income * 100) / 100,
    adjustments: Math.round(adjustments * 100) / 100,
    expenses: Math.round(expenseTotal * 100) / 100,
    net: Math.round((income + adjustments - expenseTotal) * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    overdue: Math.round(overdue * 100) / 100,
  };
}

export function getInvoiceServiceMix(
  invoices: Array<Pick<Invoice, 'currency' | 'status' | 'issue_date' | 'items'>>,
  currency: string,
  startDate: string,
  endDate: string,
): InvoiceServiceMixPoint[] {
  const groups: InvoiceServiceMixPoint[] = [
    { group: 'training', label: 'Training & courses', amount: 0 },
    { group: 'activities', label: 'Activities & packages', amount: 0 },
    { group: 'stays', label: 'Accommodation', amount: 0 },
    { group: 'gear', label: 'Gear rental', amount: 0 },
    { group: 'products', label: 'Products & other', amount: 0 },
  ];
  const groupByCategory: Record<string, InvoiceServiceGroup> = {
    course: 'training',
    training: 'training',
    workshop: 'training',
    activity: 'activities',
    package: 'activities',
    accommodation: 'stays',
    gear_rental: 'gear',
    shop: 'products',
    other: 'products',
  };
  const groupById = new Map(groups.map((group) => [group.group, group]));

  for (const invoice of invoices) {
    if (
      invoice.currency !== currency ||
      invoice.status === 'cancelled' ||
      invoice.status === 'draft' ||
      invoice.issue_date < startDate ||
      invoice.issue_date > endDate
    ) continue;

    for (const item of invoice.items || []) {
      const group = groupById.get(groupByCategory[item.category || 'other']);
      if (group) group.amount += item.total_price;
    }
  }

  return groups.map((group) => ({ ...group, amount: Math.round(group.amount * 100) / 100 }));
}

export interface FinanceCounterpartyActivity {
  counterparty: string;
  paymentMethod: string;
  income: number;
  adjustments: number;
  expenses: number;
  net: number;
}

export function getFinanceCounterpartyActivity(
  invoices: AnalyticsInvoice[],
  expenses: AnalyticsExpense[],
  currency: string,
  startDate: string,
  endDate: string,
): FinanceCounterpartyActivity[] {
  const totals = new Map<string, { counterparty: string; paymentMethod: string; income: number; adjustments: number; expenses: number }>();
  const getTotals = (counterpartyValue: string | null | undefined, methodValue: string | null | undefined) => {
    const counterparty = counterpartyValue?.trim() || 'Unnamed customer or supplier';
    const paymentMethod = methodValue?.trim() || 'Unspecified method';
    const key = `${counterparty}\u0000${paymentMethod}`;
    let value = totals.get(key);
    if (!value) {
      value = { counterparty, paymentMethod, income: 0, adjustments: 0, expenses: 0 };
      totals.set(key, value);
    }
    return value;
  };

  for (const invoice of invoices) {
    if (invoice.currency !== currency) continue;
    const customerName = [invoice.first_name, invoice.last_name].filter(Boolean).join(' ');
    for (const payment of invoice.payments || []) {
      if (payment.currency !== currency) continue;
      const adjustments = payment.adjustments || [];
      if (adjustments.length === 0) {
        if (payment.payment_date >= startDate && payment.payment_date <= endDate) {
          const amount = payment.net_amount ?? payment.amount;
          if (Number.isFinite(amount)) getTotals(customerName, payment.payment_method).income += Math.round(amount * 100);
        }
        continue;
      }

      if (payment.payment_date >= startDate && payment.payment_date <= endDate && Number.isFinite(payment.amount)) {
        getTotals(customerName, payment.payment_method).income += Math.round(payment.amount * 100);
      }
      for (const adjustment of adjustments) {
        if (!adjustment.adjustment_date || adjustment.adjustment_date < startDate || adjustment.adjustment_date > endDate) continue;
        if (adjustment.direction !== 'debit' && adjustment.direction !== 'credit') continue;
        const amount = adjustment.amount ?? (adjustment.amount_cents === undefined ? NaN : adjustment.amount_cents / 100);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const cents = Math.round(amount * 100) * (adjustment.direction === 'credit' ? 1 : -1);
        getTotals(customerName, adjustment.payment_method ?? payment.payment_method).adjustments += cents;
      }
    }
  }

  for (const expense of expenses) {
    if (expense.currency !== currency || expense.status === 'rejected' || expense.expense_date < startDate || expense.expense_date > endDate) continue;
    const amount = Number(expense.amount);
    if (Number.isFinite(amount)) getTotals(expense.vendor_name, expense.payment_method).expenses += Math.round(amount * 100);
  }

  return [...totals.values()]
    .map((total) => ({
      counterparty: total.counterparty,
      paymentMethod: total.paymentMethod,
      income: total.income / 100,
      adjustments: total.adjustments / 100,
      expenses: total.expenses / 100,
      net: (total.income + total.adjustments - total.expenses) / 100,
    }))
    .sort((a, b) => a.counterparty.localeCompare(b.counterparty) || a.paymentMethod.localeCompare(b.paymentMethod));
}
