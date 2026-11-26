import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCustomerDraftTotal, countAccommodationNights } from '../src/utils/accommodationPricing';

test('accommodation draft totals multiply nightly price by nights between arrival and checkout', () => {
  const nights = countAccommodationNights('2026-11-21', '2026-11-30');
  assert.equal(nights, 9);
  assert.equal(calculateCustomerDraftTotal([
    { category: 'course', price: '360' },
    { category: 'accommodation', price: '40' },
  ], nights), 720);
});

test('stay night calculation handles month and year boundaries and invalid ranges', () => {
  assert.equal(countAccommodationNights('2026-12-30', '2027-01-02'), 3);
  assert.equal(countAccommodationNights('2027-02-29', '2027-03-01'), 0);
  assert.equal(countAccommodationNights('2027-03-02', '2027-03-01'), 0);
  assert.equal(countAccommodationNights('2027-03-01', '2027-03-01'), 0);
});
