// tiny QR encoder from v1: byte mode, version 5 (37x37), error level L, mask 0. fits text up to 106 bytes
function matrix(text) {
  const data = [...Buffer.from(text)];
  if (data.length > 106) throw new Error('qr: text too long');
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push(v >> i & 1); };
  put(4, 4); put(data.length, 8); data.forEach((b) => put(b, 8)); put(0, 4);
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; cw.length < 108; p ^= 1) cw.push(p ? 0x11 : 0xec);

  // reed-solomon: 26 error correction codewords over GF(256)
  const exp = [], log = [];
  for (let i = 0, x = 1; i < 255; i++) { exp[i] = x; log[x] = i; x = x << 1 ^ (x & 128 ? 0x11d : 0); }
  const mul = (a, b) => a && b ? exp[(log[a] + log[b]) % 255] : 0;
  let gen = [1];
  for (let i = 0; i < 26; i++) gen = [...gen, 0].map((g, j) => g ^ (j ? mul(gen[j - 1], exp[i]) : 0));
  const rem = [...cw, ...Array(26).fill(0)];
  for (let i = 0; i < 108; i++) { const f = rem[i]; if (f) for (let j = 0; j < 27; j++) rem[i + j] ^= mul(gen[j], f); }
  const all = [...cw, ...rem.slice(108)];

  // fixed patterns first (fn marks them so data and mask skip them)
  const n = 37, m = [...Array(n)].map(() => Array(n).fill(0)), fn = m.map((row) => row.map(() => false));
  const set = (r, c, v) => { m[r][c] = v ? 1 : 0; fn[r][c] = true; };
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]])
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      if (r0 + r >= 0 && c0 + c >= 0 && r0 + r < n && c0 + c < n) set(r0 + r, c0 + c, ring !== 2 && ring !== 4);
    }
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) set(30 + r, 30 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const fmt = 0b111011111000100, bit = (i) => fmt >> i & 1; // level L, mask 0
  for (let i = 0; i < 6; i++) set(i, 8, bit(i));
  set(7, 8, bit(6)); set(8, 8, bit(7)); set(8, 7, bit(8));
  for (let i = 9; i < 15; i++) set(8, 14 - i, bit(i));
  for (let i = 0; i < 8; i++) set(8, n - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) set(n - 15 + i, 8, bit(i));
  set(n - 8, 8, 1);

  // data zigzags up and down two columns at a time from the bottom right
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
      const c = right - j, r = (right + 1) & 2 ? v : n - 1 - v;
      if (!fn[r][c] && i < all.length * 8) m[r][c] = all[i >> 3] >> (7 - (i & 7)) & 1, i++;
    }
  }
  return m.map((row, r) => row.map((v, c) => v ^ (!fn[r][c] && (r + c) % 2 === 0 ? 1 : 0)));
}

// two rows per line with half blocks, black on white whatever the terminal's colors, 4 modules of white around it
function terminal(text) {
  const m = matrix(text), n = m.length, q = 4, dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && m[r][c] === 1;
  const lines = [];
  for (let r = -q; r < n + q; r += 2) {
    let line = '';
    for (let c = -q; c < n + q; c++) {
      const top = dark(r, c), bottom = dark(r + 1, c);
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(`\x1b[30;47m${line}\x1b[0m`);
  }
  return lines.join('\n');
}

module.exports = { matrix, terminal };
