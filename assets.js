// Content fingerprints for the store's bundled images. Each URL carries ?v=<hash of the
// file>, so replacing a photo changes its URL: browsers fetch the new one at once and can
// cache every version for a year. Fingerprints are taken at startup, like the stylesheet's.

const IMAGE_DIR = "./public/images";
const versions = new Map();

for await (const entry of Deno.readDir(IMAGE_DIR)) {
  if (!entry.isFile) continue;
  const bytes = await Deno.readFile(`${IMAGE_DIR}/${entry.name}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  versions.set(`/images/${entry.name}`, Array.from(digest.slice(0, 6), byte => byte.toString(16).padStart(2, "0")).join(""));
}

// The fingerprint for a bundled image path such as "/images/logo.png", or null.
export function imageVersion(path) {
  return versions.get(path) ?? null;
}

// "/images/logo.png" -> "/images/logo.png?v=1a2b3c4d5e6f". Unknown paths are returned as-is.
export function asset(path) {
  const version = versions.get(path);
  return version ? `${path}?v=${version}` : path;
}

// Fingerprints every bundled image path written in a template.
export function versionImagePaths(text) {
  return text.replace(/\/images\/[\w.-]+(?![\w.?-])/g, path => asset(path));
}
