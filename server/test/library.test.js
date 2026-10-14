import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE = ':memory:';
const { upsertProduct, searchProducts, ftsQuery, seed } = await import('../library.js');
const { parseProducts, parseDims, robotsAllows, assertPublicUrl, isPrivateIp } = await import('../scrape.js');
const { guessType } = await import('../../shared/furnitureTypes.js');

test('live search matches prefixes, accents and several words', () => {
  seed();
  upsertProduct({ source: 'test', source_key: 'a', name: 'Chaise de bureau Slim', name_de: 'Bürostuhl Slim', name_en: 'Slim office chair', brand: 'Haworth', type: 'armchair' });
  upsertProduct({ source: 'test', source_key: 'b', name: 'Armoire haute 2 portes', name_de: 'Hochschrank', brand: 'Montel', type: 'wardrobe' });
  assert.equal(searchProducts({ q: 'chai', source: 'test' })[0].source_key, 'a');
  assert.equal(searchProducts({ q: 'burostuhl', source: 'test' }).length, 1);       // diacritics folded
  assert.equal(searchProducts({ q: 'office slim', source: 'test' })[0].source_key, 'a'); // AND of prefixes
  assert.equal(searchProducts({ q: '', type: 'wardrobe', source: 'test' })[0].source_key, 'b');
  assert.equal(searchProducts({ q: 'zzzz' }).length, 0);
  assert.equal(searchProducts({ q: 'Bürostuhl', source: 'test' }).length, 1); // umlaut typed as such
});

test('FTS input is sanitised', () => {
  assert.equal(ftsQuery('a"b OR NEAR( c'), '"a"* AND "b"* AND "OR"* AND "NEAR"* AND "c"*');
  assert.equal(ftsQuery('   '), '');
});

test('JSON-LD products are parsed with dimensions and price', () => {
  const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Oak desk 140 x 70 x 75 cm","brand":{"name":"Acme"},
    "image":"https://x.test/i.jpg","offers":{"@type":"Offer","price":"249,90","priceCurrency":"EUR"},"width":{"@type":"QuantitativeValue","value":140,"unitCode":"CMT"}}</script></html>`;
  const [p] = parseProducts(html, 'https://shop.test/desk');
  assert.equal(p.name, 'Oak desk 140 x 70 x 75 cm');
  assert.equal(p.brand, 'Acme');
  assert.equal(p.price, 249.9);
  assert.ok(Math.abs(p.w - 1.4) < 1e-9 && Math.abs(p.d - 0.7) < 1e-9 && Math.abs(p.h - 0.75) < 1e-9);
});

test('dimension strings in mm / cm / m', () => {
  assert.deepEqual(parseDims('B 1200 x 800 x 750 mm'), { w: 1.2, d: 0.8, h: 0.75 });
  assert.deepEqual(parseDims('2,0 x 0,9 m'), { w: 2, d: 0.9 });
  assert.deepEqual(parseDims('no size here'), {});
});

test('robots.txt: specific agent beats *, longest rule wins', () => {
  const txt = 'User-agent: *\nDisallow: /shop/\nAllow: /shop/public/\n\nUser-agent: usablespaceresearchbot\nDisallow: /private\n';
  assert.equal(robotsAllows(txt, '/shop/x'), true);          // bot group only forbids /private
  assert.equal(robotsAllows(txt, '/private/a'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /shop/\nAllow: /shop/public/', '/shop/public/a'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /shop/', '/shop/a'), false);
  assert.equal(robotsAllows('', '/anything'), true);
});

test('SSRF guard rejects private targets and odd schemes', async () => {
  for (const u of ['http://127.0.0.1/x', 'http://localhost:4000/api', 'http://10.1.2.3/', 'http://169.254.169.254/latest', 'http://[::1]/', 'file:///etc/passwd', 'ftp://example.com/x', 'http://user:pw@example.com/'])
    await assert.rejects(() => assertPublicUrl(u), undefined, u);
  assert.ok(isPrivateIp('192.168.0.5') && isPrivateIp('172.20.1.1') && !isPrivateIp('8.8.8.8'));
});

test('product names map to base types in fr / en / de', () => {
  assert.equal(guessType('Chaise de bureau'), 'armchair');
  assert.equal(guessType('Office Chairs'), 'armchair');
  assert.equal(guessType('Stationary Shelving Cabinet'), 'shelf');
  assert.equal(guessType('Armoire haute'), 'wardrobe');
  assert.equal(guessType('Schreibtisch 140'), 'desk');
  assert.equal(guessType('Turnstile gate'), null);
});
