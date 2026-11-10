// Slows down password guessing: after 5 wrong passwords for the same email from the same
// address, further attempts are refused for 10 minutes. Kept in memory, so it resets on restart.
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const attempts = new Map();

const key = (req, email) => `${req.ip}|${email}`;

function isLocked(req, email) {
  const entry = attempts.get(key(req, email));
  if (!entry) return false;
  if (entry.until && entry.until > Date.now()) return true;
  if (entry.until) attempts.delete(key(req, email));
  return false;
}
function recordFailure(req, email) {
  const k = key(req, email);
  const entry = attempts.get(k) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILS) entry.until = Date.now() + LOCK_MS;
  attempts.set(k, entry);
}
const clear = (req, email) => attempts.delete(key(req, email));
const reset = () => attempts.clear();

module.exports = { isLocked, recordFailure, clear, reset, MAX_FAILS };
