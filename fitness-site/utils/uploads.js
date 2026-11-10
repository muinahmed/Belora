// Photos uploaded in the admin panel. The browser shrinks the picture and sends it as a
// data URL; the server checks the real file type from its first bytes, then saves it under
// a random name in public/uploads (or UPLOAD_DIR in the tests).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fail } = require('./validate');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads');
const MAX_BYTES = 1.5 * 1024 * 1024;
const UPLOAD_PATH = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;
// Photos that ship with the project, e.g. /img/recipe-dal.jpg
const BUNDLED_PATH = /^\/img\/[a-z0-9-]+\.jpg$/;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function imageType(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function saveDataUrl(dataUrl) {
  const match = typeof dataUrl === 'string' && /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) fail('Choose a JPG, PNG or WebP image.');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > MAX_BYTES) fail('That image is too large. Use one under 1.5 MB.');
  const type = imageType(buffer);
  if (!type) fail('That file is not a JPG, PNG or WebP image.');
  const name = `${crypto.randomBytes(16).toString('hex')}.${type}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return `/uploads/${name}`;
}

// A photo path sent with a recipe or workout: '' for none, a photo that ships with the
// project, or a file this module saved.
function imagePath(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string' && BUNDLED_PATH.test(value) && fs.existsSync(path.join(PUBLIC_DIR, value.slice(1)))) return value;
  if (typeof value !== 'string' || !UPLOAD_PATH.test(value) || !fs.existsSync(path.join(UPLOAD_DIR, path.basename(value)))) {
    fail('Upload the photo again; the saved file could not be found.');
  }
  return value;
}

// Only uploaded files are ever deleted; photos that ship with the project stay.
function removeImage(webPath) {
  if (UPLOAD_PATH.test(webPath || '')) fs.rmSync(path.join(UPLOAD_DIR, path.basename(webPath)), { force: true });
}

module.exports = { UPLOAD_DIR, saveDataUrl, imagePath, removeImage };
