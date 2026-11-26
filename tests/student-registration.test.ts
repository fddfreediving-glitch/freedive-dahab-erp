import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { removeTemporaryDirectory } from './test-cleanup.js';

const originalDirectory = process.cwd();
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'freedive-student-registration-test-'));
process.chdir(temporaryDirectory);

const [{ db, initializeDatabase }, { seedInitialData }, { apiRouter }, expressModule] = await Promise.all([
  import('../server/db.js'),
  import('../server/seed.js'),
  import('../server/api.js'),
  import('express'),
]);

const express = expressModule.default;
let server: ReturnType<ReturnType<typeof express>['listen']>;
let baseUrl = '';
const ownerToken = 'student-registration-owner-token';
const frontDeskToken = 'student-registration-front-desk-token';
const instructorToken = 'student-registration-instructor-token';

before(async () => {
  initializeDatabase();
  seedInitialData();
  const insertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)');
  const createdAt = new Date().toISOString();
  insertSession.run(ownerToken, 'usr_owner_01', Date.now() + 60_000, createdAt);
  insertSession.run(frontDeskToken, 'usr_crm_01', Date.now() + 60_000, createdAt);
  insertSession.run(instructorToken, 'usr_inst_01', Date.now() + 60_000, createdAt);

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  process.chdir(originalDirectory);
  await removeTemporaryDirectory(temporaryDirectory);
});

async function request(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown,
  requestToken = ownerToken,
): Promise<{ status: number; data: any }> {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${requestToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}

test('student registration preserves lead status and the full contact and freediving profile', async () => {
  const payload = {
    first_name: 'Nadia',
    last_name: 'Example',
    email: 'nadia.registration@example.test',
    phone: '+20 100 000 0000',
    whatsapp: '+20 111 222 3333',
    arrival_date: '2026-12-01',
    departure_date: '2026-12-08',
    needs_accommodation: 1,
    needs_airport_transfer: 1,
    flight_number: 'MS020',
    airline_name: 'EgyptAir',
    flight_arrival_at: '2026-12-01T14:30',
    transportation_requirements: 'Airport pickup for two guests with freediving bags',
    hotel_name: 'Dahab Bay Hotel',
    assigned_driver: 'Ahmed Hassan',
    nationality: 'Egyptian',
    age: 31,
    date_of_birth: '1995-06-12',
    certification_agency: 'SSI',
    certification_level: 'Wave 2',
    total_depth_pb: 32.5,
    static_apnea_pb: '04:15',
    medical_waiver_signed: true,
    medical_waiver_date: new Date().toISOString().slice(0, 10),
    medical_clearance_status: 'physician_approved',
    medical_notes: 'Approved by physician',
    emergency_contact_name: 'Omar Example',
    emergency_contact_phone: '+20 100 000 0001',
    insurance_details: 'Travel policy',
    source_channel: 'Website',
    status: 'lead',
    notes: 'Interested in the next beginner course',
  };
  const created = await request('/students', 'POST', payload);
  assert.equal(created.status, 201);

  const saved = db.prepare('SELECT * FROM students WHERE id = ?').get(created.data.id) as Record<string, unknown>;
  assert.equal(saved.status, 'lead');
  assert.equal(saved.nationality, payload.nationality);
  assert.equal(saved.age, payload.age);
  assert.equal(saved.date_of_birth, payload.date_of_birth);
  assert.equal(saved.certification_level, payload.certification_level);
  assert.equal(saved.total_depth_pb, payload.total_depth_pb);
  assert.equal(saved.static_apnea_pb, payload.static_apnea_pb);
  assert.equal(saved.medical_clearance_status, payload.medical_clearance_status);
  assert.equal(saved.emergency_contact_name, payload.emergency_contact_name);
  assert.equal(saved.insurance_details, payload.insurance_details);
  assert.equal(saved.source_channel, payload.source_channel);
  assert.equal(saved.notes, payload.notes);
  assert.equal(saved.whatsapp, payload.whatsapp);
  assert.equal(saved.arrival_date, payload.arrival_date);
  assert.equal(saved.departure_date, payload.departure_date);
  assert.equal(saved.needs_accommodation, 1);
  assert.equal(saved.needs_airport_transfer, 1);
  assert.equal(saved.flight_number, payload.flight_number);
  assert.equal(saved.airline_name, payload.airline_name);
  assert.equal(saved.flight_arrival_at, payload.flight_arrival_at);
  assert.equal(saved.transportation_requirements, payload.transportation_requirements);
  assert.equal(saved.hotel_name, payload.hotel_name);
  assert.equal(saved.assigned_driver, payload.assigned_driver);
});

test('trip and stay details can be updated and reject a check-out before arrival', async () => {
  const created = await request('/students', 'POST', {
    first_name: 'Stay',
    last_name: 'Guest',
    email: 'stay.guest@example.test',
    arrival_date: '2027-01-10',
    departure_date: '2027-01-15',
  });
  assert.equal(created.status, 201);

  const invalid = await request('/students', 'POST', {
    first_name: 'Bad',
    last_name: 'Dates',
    email: 'bad.dates@example.test',
    arrival_date: '2027-02-10',
    departure_date: '2027-02-01',
  });
  assert.equal(invalid.status, 400);
  assert.equal(db.prepare('SELECT id FROM students WHERE email = ?').get('bad.dates@example.test'), undefined);

  const patched = await fetch(`${baseUrl}/students/${created.data.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      whatsapp: '+20 122 333 4444',
      arrival_date: '2027-01-12',
      departure_date: '2027-01-14',
      needs_accommodation: 0,
      needs_airport_transfer: 1,
      flight_number: 'TK694',
      airline_name: 'Turkish Airlines',
      flight_arrival_at: '2027-01-12T02:15',
      transportation_requirements: 'Pickup from Sharm airport, two large bags',
      hotel_name: 'Dahab Plaza',
      assigned_driver: 'Mahmoud Ali',
      notes: 'Guest prefers WhatsApp messages after 10:00',
    }),
  });
  assert.equal(patched.status, 200);

  const saved = db.prepare('SELECT * FROM students WHERE id = ?').get(created.data.id) as Record<string, unknown>;
  assert.equal(saved.whatsapp, '+20 122 333 4444');
  assert.equal(saved.arrival_date, '2027-01-12');
  assert.equal(saved.departure_date, '2027-01-14');
  assert.equal(saved.needs_accommodation, 0);
  assert.equal(saved.needs_airport_transfer, 1);
  assert.equal(saved.flight_number, 'TK694');
  assert.equal(saved.airline_name, 'Turkish Airlines');
  assert.equal(saved.flight_arrival_at, '2027-01-12T02:15');
  assert.equal(saved.transportation_requirements, 'Pickup from Sharm airport, two large bags');
  assert.equal(saved.hotel_name, 'Dahab Plaza');
  assert.equal(saved.assigned_driver, 'Mahmoud Ali');
  assert.equal(saved.notes, 'Guest prefers WhatsApp messages after 10:00');

  const reversed = await fetch(`${baseUrl}/students/${created.data.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ departure_date: '2027-01-01' }),
  });
  assert.equal(reversed.status, 400);

  const invalidFlightArrival = await fetch(`${baseUrl}/students/${created.data.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ flight_arrival_at: '2027-13-40T29:99' }),
  });
  assert.equal(invalidFlightArrival.status, 400);

  const oversizedTransport = await fetch(`${baseUrl}/students/${created.data.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transportation_requirements: 'x'.repeat(1001) }),
  });
  assert.equal(oversizedTransport.status, 400);

  const cleared = await fetch(`${baseUrl}/students/${created.data.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flight_number: null,
      airline_name: null,
      flight_arrival_at: null,
      transportation_requirements: null,
      hotel_name: null,
      assigned_driver: null,
      notes: null,
    }),
  });
  assert.equal(cleared.status, 200);
  const clearedStudent = db.prepare('SELECT * FROM students WHERE id = ?').get(created.data.id) as Record<string, unknown>;
  assert.equal(clearedStudent.flight_number, null);
  assert.equal(clearedStudent.transportation_requirements, null);
  assert.equal(clearedStudent.notes, null);
});

test('instructors cannot edit customer contact and travel details', async () => {
  const student = (await request('/students')).data.find((record: any) => record.email === 'maya.lindemann@gmail.com');
  assert.ok(student);
  const result = await request(`/students/${student.id}`, 'PATCH', { whatsapp: '+201234567890' }, instructorToken);
  assert.equal(result.status, 403);
  assert.match(result.data.error, /customer operations roles/);
});

test('customer WhatsApp and transfer validation choices are saved and checked', async () => {
  const created = await request('/students', 'POST', {
    first_name: 'Status', last_name: 'Guest', email: 'status.guest@example.test',
  });
  assert.equal(created.status, 201);

  const valid = await fetch(`${baseUrl}/students/${created.data.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ whatsapp_status: 'contacted', transfer_status: 'confirm_later' }),
  });
  assert.equal(valid.status, 200);
  const saved = db.prepare('SELECT whatsapp_status, transfer_status FROM students WHERE id = ?').get(created.data.id);
  assert.deepEqual(saved, { whatsapp_status: 'contacted', transfer_status: 'confirm_later' });

  const invalid = await fetch(`${baseUrl}/students/${created.data.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transfer_status: 'maybe' }),
  });
  assert.equal(invalid.status, 400);
});

test('customer list carries booked activities and the euro total paid', async () => {
  const response = await request('/students');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.data));

  const chloe = response.data.find((student: any) => student.email === 'chloe.martin.paris@wanadoo.fr');
  assert.ok(chloe, 'seeded customer should be listed');
  assert.equal(chloe.paid_total_eur, 310);
  assert.ok(Array.isArray(chloe.activities));
  assert.ok(chloe.activities.length >= 1);
  assert.equal(chloe.activities[0].title, 'SSI Freediver');
  assert.ok(chloe.arrival_date);
  assert.ok(chloe.departure_date);
  assert.equal(chloe.whatsapp, '+33 6 12 34 56 78');

  const luca = response.data.find((student: any) => student.email === 'luca.rossi.apnea@libero.it');
  assert.ok(luca);
  assert.equal(luca.paid_total_eur, 0);
});

test('front desk registration cannot set restricted medical clearance or notes', async () => {
  const forbidden = await request('/students', 'POST', {
    first_name: 'Front',
    last_name: 'Desk',
    email: 'frontdesk.registration@example.test',
    medical_clearance_status: 'cleared',
  }, frontDeskToken);
  assert.equal(forbidden.status, 403);
  assert.equal(db.prepare('SELECT id FROM students WHERE email = ?').get('frontdesk.registration@example.test'), undefined);

  const invalid = await request('/students', 'POST', {
    first_name: 'Invalid',
    last_name: 'Status',
    email: 'invalid.registration@example.test',
    status: 'not-a-student-status',
  }, ownerToken);
  assert.equal(invalid.status, 400);
});
