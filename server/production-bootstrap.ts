import crypto from 'crypto';
import { db } from './db.js';
import { hashPassword, logAudit } from './auth.js';

interface InitialOwnerConfig {
  email?: string;
  name?: string;
  password?: string;
}

/**
 * Create only the first production owner. Demo users and operational fixtures
 * remain exclusive to local development and tests.
 */
export function bootstrapProductionOwner(config: InitialOwnerConfig = {
  email: process.env.INITIAL_OWNER_EMAIL,
  name: process.env.INITIAL_OWNER_NAME,
  password: process.env.INITIAL_OWNER_PASSWORD,
}): boolean {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUsers.count > 0) return false;

  const email = config.email?.trim().toLowerCase();
  const name = config.name?.trim() || 'Freedive Dahab Owner';
  const password = config.password;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new Error('Production has no owner account. Set INITIAL_OWNER_EMAIL to a valid address for the first startup.');
  }
  if (name.length > 120) {
    throw new Error('INITIAL_OWNER_NAME must be 120 characters or fewer.');
  }
  if (!password || password.length < 16) {
    throw new Error('Production has no owner account. Set INITIAL_OWNER_PASSWORD to a unique password of at least 16 characters for the first startup.');
  }

  const { hash, salt } = hashPassword(password);
  const now = new Date().toISOString();
  const userId = `usr_owner_${crypto.randomUUID()}`;
  const createOwner = db.transaction(() => {
    const currentUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (currentUsers.count > 0) return false;
    db.prepare(`
      INSERT INTO users (id, email, password_hash, salt, full_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'owner', 1, ?, ?)
    `).run(userId, email, hash, salt, name, now, now);
    logAudit({
      userId,
      userEmail: email,
      userRole: 'owner',
      action: 'PRODUCTION_OWNER_BOOTSTRAPPED',
      entityType: 'ERP_SYSTEM',
      entityId: userId,
      details: { message: 'Initial production owner account created from deployment secrets.' },
    });
    return true;
  });

  const created = createOwner();
  if (created) {
    console.info(`Created the initial production owner account for ${email}. Remove INITIAL_OWNER_PASSWORD from the deployment environment after confirming sign-in.`);
  }
  return created;
}
