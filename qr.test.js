// npm test
const test = require('node:test');
const assert = require('node:assert');
const qr = require('./qr');

test('qr: 37x37 with the three corner squares, and too-long text refused', () => {
  const m = qr.matrix('https://rush.rxtm.net/invite/' + 'x'.repeat(43));
  assert.equal(m.length, 37);
  assert.ok(m.every((row) => row.length === 37 && row.every((v) => v === 0 || v === 1)));
  const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
  for (const [r0, c0] of [[0, 0], [0, 30], [30, 0]]) assert.deepEqual(finder.map((_, r) => m[r0 + r].slice(c0, c0 + 7).join('')), finder);
  assert.throws(() => qr.matrix('x'.repeat(107)), /too long/);
});

test('qr: terminal art is 23 lines of 45 characters', () => {
  const lines = qr.terminal('hi').split('\n');
  assert.equal(lines.length, 23);
  for (const l of lines) assert.equal(l.replace(/\x1b\[[\d;]*m/g, '').length, 45);
});
