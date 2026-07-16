/**
 * v0.4 password hashing (compatibility mode).
 *
 * Staff passwords were historically stored in plaintext in `users.password`.
 * This module introduces bcrypt hashing while remaining backwards compatible:
 * plaintext passwords keep working until each user next logs in, at which point
 * their stored password is transparently upgraded to a bcrypt hash.
 *
 * No database schema change is required — the existing TEXT `password` column
 * stores either a legacy plaintext value or a bcrypt hash.
 */

const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 10;

// bcrypt hashes look like: $2a$10$...  / $2b$... / $2y$...
const BCRYPT_HASH_RE = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Whether a stored password value is already a bcrypt hash. */
function isHashedPassword(stored) {
  return typeof stored === "string" && BCRYPT_HASH_RE.test(stored);
}

/** Hash a plaintext password. */
async function hashPassword(plaintext) {
  return bcrypt.hash(String(plaintext), BCRYPT_ROUNDS);
}

/**
 * Ensure a value is stored hashed. If it is already a bcrypt hash (e.g. the
 * admin UI submitted the existing stored value unchanged), it is returned
 * as-is to avoid double-hashing. Otherwise it is hashed.
 */
async function toStoredPassword(value) {
  if (isHashedPassword(value)) return value;
  return hashPassword(value);
}

/**
 * Verify a submitted plaintext password against the stored value.
 * Supports both legacy plaintext and bcrypt-hashed stored passwords.
 */
async function verifyPassword(submittedPlaintext, storedValue) {
  const submitted = String(submittedPlaintext);
  if (isHashedPassword(storedValue)) {
    try {
      return await bcrypt.compare(submitted, storedValue);
    } catch {
      return false;
    }
  }
  // Legacy plaintext comparison (unchanged from historical behaviour).
  return submitted === String(storedValue);
}

module.exports = {
  isHashedPassword,
  hashPassword,
  toStoredPassword,
  verifyPassword,
  BCRYPT_ROUNDS,
};
