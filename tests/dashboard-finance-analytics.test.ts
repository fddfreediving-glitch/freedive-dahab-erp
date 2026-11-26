import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFinanceCounterpartyActivity, getFinancePeriodSummary, getInvoiceServiceMix } from '../src/utils/financeAnalytics.ts';
import type { InvoiceItem } from '../src/types';

test('finance period summary groups only in-range payments and non-rejected expenses in one currency', () => {
  const invoices = [{
    currency: 'EUR',
    status: 'partially_paid' as const,
    total_amount: 250,
    paid_amount: 75,
    due_date: '2026-11-08',
    payments: [
      { currency: 'EUR', payment_date: '2026-11-10', amount: 25 },
      { currency: 'EUR', payment_date: '2026-11-09', amount: 50 },
      { currency: 'USD', payment_date: '2026-11-10', amount: 100 },
      { currency: 'EUR', payment_date: '2026-09-01', amount: 20 },
    ],
  }];
  const expenses = [
    { currency: 'EUR', status: 'approved' as const, expense_date: '2026-11-10', amount: 8.5 },
    { currency: 'EUR', status: 'rejected' as const, expense_date: '2026-11-10', amount: 30 },
    { currency: 'USD', status: 'approved' as const, expense_date: '2026-11-10', amount: 15 },
  ];

  const summary = getFinancePeriodSummary(invoices, expenses, 'EUR', '2026-11-10');
  const today = summary.points.at(-1);
  assert.equal(summary.points.length, 30);
  assert.equal(summary.points[0].date, '2026-10-12');
  assert.deepEqual(today, {
    date: '2026-11-10',
    label: 'Nov 10',
    income: 25,
    adjustments: 0,
    expenses: 8.5,
  });
  assert.equal(summary.income, 75);
  assert.equal(summary.expenses, 8.5);
  assert.equal(summary.net, 66.5);
  assert.equal(summary.outstanding, 175);
  assert.equal(summary.overdue, 175);
});

test('finance period summary excludes cancelled invoices from receivables', () => {
  const invoices = [{
    currency: 'EGP',
    status: 'cancelled' as const,
    total_amount: 500,
    paid_amount: 0,
    due_date: '2026-11-01',
    payments: [{
      currency: 'EGP',
      payment_date: '2026-11-10',
      amount: 100,
      adjustments: [{ direction: 'debit' as const, amount: 40, adjustment_date: '2026-11-10' }],
    }],
  }];

  const summary = getFinancePeriodSummary(invoices, [], 'EGP', '2026-11-10');
  assert.equal(summary.outstanding, 0);
  assert.equal(summary.overdue, 0);
  assert.equal(summary.income, 100);
  assert.equal(summary.adjustments, -40);
  assert.equal(summary.net, 60);
});

test('finance period summary follows the selected reporting range', () => {
  const invoices = [{
    currency: 'EUR',
    status: 'paid' as const,
    total_amount: 80,
    paid_amount: 80,
    due_date: '2026-11-10',
    payments: [
      { currency: 'EUR', payment_date: '2026-11-10', amount: 25 },
      { currency: 'EUR', payment_date: '2026-11-03', amount: 55 },
    ],
  }];

  const summary = getFinancePeriodSummary(invoices, [], 'EUR', '2026-11-10', 7);
  assert.equal(summary.points.length, 7);
  assert.equal(summary.points[0].date, '2026-11-04');
  assert.equal(summary.income, 25);
});

test('invoice service mix groups issued line totals by five service families', () => {
  const serviceItem = (category: InvoiceItem['category'], total_price: number): InvoiceItem => ({
    category,
    description: category || 'other',
    quantity: 1,
    unit_price: total_price,
    total_price,
  });
  const invoices = [
    {
      currency: 'EUR',
      status: 'issued' as const,
      issue_date: '2026-11-10',
      items: [
        serviceItem('course', 300),
        serviceItem('training', 80),
        serviceItem('activity', 120),
        serviceItem('gear_rental', 40),
        serviceItem('shop', 30),
        serviceItem('accommodation', 200),
      ],
    },
    {
      currency: 'EUR',
      status: 'draft' as const,
      issue_date: '2026-11-10',
      items: [serviceItem('course', 900)],
    },
    {
      currency: 'USD',
      status: 'paid' as const,
      issue_date: '2026-11-10',
      items: [serviceItem('course', 500)],
    },
  ];

  assert.deepEqual(
    getInvoiceServiceMix(invoices, 'EUR', '2026-11-01', '2026-11-30'),
    [
      { group: 'training', label: 'Training & courses', amount: 380 },
      { group: 'activities', label: 'Activities & packages', amount: 120 },
      { group: 'stays', label: 'Accommodation', amount: 200 },
      { group: 'gear', label: 'Gear rental', amount: 40 },
      { group: 'products', label: 'Products & other', amount: 30 },
    ],
  );
});

test('finance counterparty activity separates customers and suppliers by payment method', () => {
  const invoices = [
    {
      currency: 'EUR',
      status: 'paid' as const,
      total_amount: 140,
      paid_amount: 140,
      due_date: '2026-11-10',
      first_name: 'Ahmed',
      last_name: 'Mansour',
      payments: [
        { currency: 'EUR', payment_date: '2026-11-10', amount: 100, payment_method: 'Cash EUR', adjustments: [{ direction: 'debit' as const, amount: 20, adjustment_date: '2026-11-10', payment_method: 'Cash EUR' }] },
        { currency: 'USD', payment_date: '2026-11-10', amount: 500, payment_method: 'Bank Transfer' },
        { currency: 'EUR', payment_date: '2026-11-01', amount: 25, payment_method: 'Cash EUR' },
      ],
    },
    {
      currency: 'EUR',
      status: 'paid' as const,
      total_amount: 40,
      paid_amount: 40,
      due_date: '2026-11-10',
      first_name: 'Sara',
      last_name: 'Nassar',
      payments: [{ currency: 'EUR', payment_date: '2026-11-10', amount: 40, payment_method: 'Bank Transfer' }],
    },
  ];
  const expenses = [
    { currency: 'EUR', status: 'approved' as const, expense_date: '2026-11-10', amount: 12, vendor_name: 'Bluewater Supplies', payment_method: 'Bank Transfer' },
    { currency: 'EUR', status: 'approved' as const, expense_date: '2026-11-10', amount: 15, vendor_name: 'Octopus Service Hub', payment_method: 'Cash EUR' },
    { currency: 'EUR', status: 'rejected' as const, expense_date: '2026-11-10', amount: 90, vendor_name: 'Rejected Supplier', payment_method: 'Bank Transfer' },
  ];

  assert.deepEqual(
    getFinanceCounterpartyActivity(invoices, expenses, 'EUR', '2026-11-10', '2026-11-10'),
    [
      { counterparty: 'Ahmed Mansour', paymentMethod: 'Cash EUR', income: 100, adjustments: -20, expenses: 0, net: 80 },
      { counterparty: 'Bluewater Supplies', paymentMethod: 'Bank Transfer', income: 0, adjustments: 0, expenses: 12, net: -12 },
      { counterparty: 'Octopus Service Hub', paymentMethod: 'Cash EUR', income: 0, adjustments: 0, expenses: 15, net: -15 },
      { counterparty: 'Sara Nassar', paymentMethod: 'Bank Transfer', income: 40, adjustments: 0, expenses: 0, net: 40 },
    ],
  );
});
