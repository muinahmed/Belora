// A small ZIP writer for backups. Files are stored, not compressed (product photos are already
// compressed), and streamed one at a time, so a large photo folder never has to fit in memory.
// Each entry's size and checksum follow its data (a "data descriptor"), so nothing is read twice.

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

// Continues a CRC-32 across chunks: crc32(a + b) === crc32(b, crc32(a)).
export function crc32(bytes, previous = 0) {
  let c = previous ^ 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// MS-DOS date and time, as ZIP stores them.
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

const UTF8_NAMES = 0x0800;
const DATA_DESCRIPTOR = 0x0008;

function localHeader(name, when) {
  const bytes = new Uint8Array(30 + name.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true); // version needed
  view.setUint16(6, UTF8_NAMES | DATA_DESCRIPTOR, true);
  view.setUint16(8, 0, true); // stored
  view.setUint16(10, when.time, true);
  view.setUint16(12, when.day, true);
  view.setUint32(14, 0, true); // checksum follows in the data descriptor
  view.setUint32(18, 0, true);
  view.setUint32(22, 0, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  bytes.set(name, 30);
  return bytes;
}

function dataDescriptor(crc, size) {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x08074b50, true);
  view.setUint32(4, crc, true);
  view.setUint32(8, size, true);
  view.setUint32(12, size, true);
  return bytes;
}

function centralHeader(name, crc, size, offset, when) {
  const bytes = new Uint8Array(46 + name.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true); // version made by
  view.setUint16(6, 20, true); // version needed
  view.setUint16(8, UTF8_NAMES | DATA_DESCRIPTOR, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, when.time, true);
  view.setUint16(14, when.day, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  bytes.set(name, 46);
  return bytes;
}

function endRecord(count, size, offset) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  view.setUint16(20, 0, true);
  return bytes;
}

// entries: [{ name, modified: Date, chunks: () => AsyncIterable<Uint8Array> }]
// Yields the archive as byte chunks, ready for a Response body.
export async function* zipArchive(entries) {
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const when = dosDateTime(entry.modified ?? new Date());
    const header = localHeader(name, when);
    yield header;
    offset += header.length;

    let crc = 0;
    let size = 0;
    for await (const chunk of entry.chunks()) {
      crc = crc32(chunk, crc);
      size += chunk.length;
      yield chunk;
      offset += chunk.length;
    }
    const descriptor = dataDescriptor(crc, size);
    yield descriptor;
    central.push({ name, crc, size, when, localOffset: offset - (30 + name.length) - size });
    offset += descriptor.length;
  }

  const directoryStart = offset;
  for (const item of central) {
    const header = centralHeader(item.name, item.crc, item.size, item.localOffset, item.when);
    yield header;
    offset += header.length;
  }
  yield endRecord(central.length, offset - directoryStart, directoryStart);
}
