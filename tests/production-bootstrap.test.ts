import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { removeTemporaryDirectory } from './test-cleanup.js';

const originalDirectory = process.cwd();
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'freedive-production-bootstrap-test-'));
process.chdir(temporaryDirectory);

const [{ db, initializeDatabase }, { bootstrapProductionOwner }, { verifyPassword }] = await Promise.all([
  import('../server/db.js'),
  import('../server/production-bootstrap.js'),
  import('../server/auth.js'),
]);
initializeDatabase();

after(async () => {
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  process.chdir(originalDirectory);
  await removeTemporaryDirectory(temporaryDirectory);
});

test('production bootstrap refuses to create known-password demo accounts without explicit credentials', () => {
  assert.throws(
    () => bootstrapProductionOwner({ email: '', password: '' }),
    /Set INITIAL_OWNER_EMAIL/,
  );
  assert.equal((db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count, 0);
  assert.equal((db.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number }).count, 0);
});

test('production bootstrap creates one secure owner and no demo operational records', () => {
  const password = 'Unique-Production-Owner-Password-2026';
  assert.equal(bootstrapProductionOwner({
    email: 'OWNER@FREEDIVEDAHAB.COM',
    name: 'Production Owner',
    password,
  }), true);

  const owner = db.prepare('SELECT id, email, full_name, role, password_hash, salt FROM users').get() as {
    id: string;
    email: string;
    full_name: string;
    role: string;
    password_hash: string;
    salt: string;
  };
  assert.equal(owner.email, 'owner@freedivedahab.com');
  assert.equal(owner.full_name, 'Production Owner');
  assert.equal(owner.role, 'owner');
  assert.equal(verifyPassword(password, owner.password_hash, owner.salt), true);
  assert.equal((db.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number }).count, 0);
  assert.equal((db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE action = ?').get('PRODUCTION_OWNER_BOOTSTRAPPED') as { count: number }).count, 1);
});

test('production bootstrap never resets an existing account from deployment variables', () => {
  const currentHash = (db.prepare('SELECT password_hash FROM users').get() as { password_hash: string }).password_hash;
  assert.equal(bootstrapProductionOwner({ email: 'other@example.com', password: 'another-long-password-2026' }), false);
  assert.equal((db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count, 1);
  assert.equal((db.prepare('SELECT password_hash FROM users').get() as { password_hash: string }).password_hash, currentHash);
});
