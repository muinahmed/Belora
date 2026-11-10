// Input checks shared by every route. Each helper returns the cleaned value or throws
// Invalid with a message the person can act on; server.js turns Invalid into a 400 reply.
class Invalid extends Error {}
const fail = message => { throw new Invalid(message); };

function text(value, label, { min = 1, max = 80 } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length < min) fail(min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`);
  if (s.length > max) fail(`${label} must be ${max} characters or fewer.`);
  return s;
}
function optionalText(value, label, max = 80) {
  return value === undefined || value === null ? '' : text(value, label, { min: 0, max });
}
function number(value, label, min, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) fail(`${label} must be a number from ${min} to ${max}.`);
  return n;
}
const integer = (value, label, min, max) => Math.round(number(value, label, min, max));
function oneOf(value, label, allowed) {
  if (!allowed.includes(value)) fail(`${label} must be one of: ${allowed.join(', ')}.`);
  return value;
}
function email(value) {
  const s = text(value, 'Email', { max: 100 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail('Enter a valid email address, like name@example.com.');
  return s;
}
function password(value, label = 'Password') {
  if (typeof value !== 'string' || value.length < 8) fail(`${label} must be at least 8 characters.`);
  if (value.length > 72) fail(`${label} must be 72 characters or fewer.`);
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) fail(`${label} must contain a letter and a number.`);
  return value;
}
const flag = value => (value === true || value === 1 || value === '1' || value === 'on' ? 1 : 0);
function list(value, label, max) {
  if (!Array.isArray(value)) fail(`${label} must be a list.`);
  if (value.length > max) fail(`${label} can have at most ${max} entries.`);
  return value;
}

module.exports = { Invalid, fail, text, optionalText, number, integer, oneOf, email, password, flag, list };
