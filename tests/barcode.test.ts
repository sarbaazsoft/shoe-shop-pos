import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import { generateCode128Barcode, analyzeBarcode } from '../src/utils/barcode.ts';
import { parseCategoryPrefix, generateSuggestedArticle } from '../src/utils/footwear.ts';
import { pgClient } from '../src/db/index.ts';
import { ensureSaasControlPlane } from '../src/db/schemaInit.ts';
import { generateToken } from '../src/server/auth.ts';
import productRoutes from '../src/server/routes/productRoutes.ts';

test('barcode unit: generateCode128Barcode formatting and legacy prefix fallback', () => {
  const menSingle = generateCode128Barcode(1, 'Men');
  assert.equal(menSingle.barcode, 'MN-01');
  assert.equal(menSingle.prefix, 'MN');
  assert.equal(menSingle.paddedProductId, '01');
  assert.equal(menSingle.format, 'CODE128');

  const menNine = generateCode128Barcode(9, 'Men');
  assert.equal(menNine.barcode, 'MN-09');

  const menTen = generateCode128Barcode(10, 'Men');
  assert.equal(menTen.barcode, 'MN-10');
  assert.equal(menTen.paddedProductId, '10');

  const toddlerTwelve = generateCode128Barcode(12, 'Toddler');
  assert.equal(toddlerTwelve.barcode, 'TD-12');

  // Legacy numeric 7-digit barcode prefixes fall back cleanly to CA
  const legacyFallback = generateCode128Barcode(129, '0108923');
  assert.equal(legacyFallback.barcode, 'CA-129');
  assert.equal(legacyFallback.prefix, 'CA');

  const emptyCategoryFallback = generateCode128Barcode(5, '');
  assert.equal(emptyCategoryFallback.barcode, 'CA-05');
});

test('barcode unit: parseCategoryPrefix and generateSuggestedArticle consistency', () => {
  assert.equal(parseCategoryPrefix('Men'), 'MN');
  assert.equal(parseCategoryPrefix('Women'), 'WM');
  assert.equal(parseCategoryPrefix('Kids'), 'KD');
  assert.equal(parseCategoryPrefix('Toddler'), 'TD');
  assert.equal(parseCategoryPrefix('Infant'), 'IN');
  assert.equal(parseCategoryPrefix('Sports Shoes'), 'SS');
  assert.equal(parseCategoryPrefix(''), 'CA');

  assert.equal(generateSuggestedArticle('Men', 1), 'MN-01');
  assert.equal(generateSuggestedArticle('Women', 9), 'WM-09');
  assert.equal(generateSuggestedArticle('Toddler', 12), 'TD-12');
  assert.equal(generateSuggestedArticle('Men', 129), 'MN-129');
});

test('barcode unit: analyzeBarcode validates STORE_CODE128, CODE128, and rejects invalid codes', () => {
  const storeCode = analyzeBarcode('MN-01');
  assert.equal(storeCode.isValid, true);
  assert.equal(storeCode.standard, 'STORE_CODE128');

  const numericCode = analyzeBarcode('890100000001');
  assert.equal(numericCode.isValid, true);
  assert.equal(numericCode.standard, 'CODE128');

  const customAlnum = analyzeBarcode('NK-AIR-90.V2');
  assert.equal(customAlnum.isValid, true);
  assert.equal(customAlnum.standard, 'CODE128');

  const blank = analyzeBarcode('   ');
  assert.equal(blank.isValid, false);
  assert.equal(blank.standard, 'INVALID');

  const tooLong = analyzeBarcode('A'.repeat(65));
  assert.equal(tooLong.isValid, false);
  assert.equal(tooLong.standard, 'INVALID');

  const controlChars = analyzeBarcode('MN-01\nBAD');
  assert.equal(controlChars.isValid, false);
  assert.equal(controlChars.standard, 'INVALID');

  const nonAscii = analyzeBarcode('MN-01-✓');
  assert.equal(nonAscii.isValid, false);
  assert.equal(nonAscii.standard, 'INVALID');
});

test('barcode integration: generate, validate (tenant isolation + excludeId), and POS barcode lookup', async () => {
  await pgClient.waitReady;
  await ensureSaasControlPlane();

  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  let createdProductId: number | null = null;
  const tenant1Token = generateToken({
    id: 2,
    tenantId: 1,
    name: 'Store Admin',
    email: 'admin@balochshoes.com',
    role: 'ADMIN',
    status: 'APPROVED',
  });
  const tenant2Token = generateToken({
    id: 3,
    tenantId: 2,
    name: 'StepUp Owner',
    email: 'owner@stepupfootwear.com',
    role: 'ADMIN',
    status: 'APPROVED',
  });

  const headersT1 = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tenant1Token}`,
    'X-Tenant-Id': '1',
  };
  const headersT2 = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tenant2Token}`,
    'X-Tenant-Id': '2',
  };

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // 1. Generate barcode for Men category
    const genRes = await fetch(`${baseUrl}/api/products/generate-barcode?category=Men`, { headers: headersT1 });
    assert.equal(genRes.status, 200);
    const genBody = (await genRes.json()) as { barcode: string; prefix: string };
    assert.match(genBody.barcode, /^MN-\d+$/);
    assert.equal(genBody.prefix, 'MN');

    // 2. Create a product with a distinct Code 128 barcode
    const uniqueSuffix = Date.now().toString().slice(-5);
    const customBarcode = `SN-${uniqueSuffix}`;
    const customArticle = `ART-${uniqueSuffix}`;

    const createRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: headersT1,
      body: JSON.stringify({
        article: customArticle,
        brand: 'Service',
        category: 'Men',
        barcode: customBarcode,
        costPrice: 1400,
        maxPrice: 2100,
        totalStock: 12,
      }),
    });
    assert.equal(createRes.status, 201);
    const createdBody = (await createRes.json()) as { productId: number; barcode: string };
    createdProductId = createdBody.productId;
    assert.equal(createdBody.barcode, customBarcode);

    // 3. Validate duplicate barcode in same tenant -> rejected
    const dupRes = await fetch(`${baseUrl}/api/products/validate-barcode`, {
      method: 'POST',
      headers: headersT1,
      body: JSON.stringify({ barcode: customBarcode }),
    });
    assert.equal(dupRes.status, 200);
    const dupBody = (await dupRes.json()) as { valid: boolean; isDuplicate: boolean };
    assert.equal(dupBody.valid, false);
    assert.equal(dupBody.isDuplicate, true);

    // 4. Validate same barcode with excludeId matching same product -> allowed
    const selfRes = await fetch(`${baseUrl}/api/products/validate-barcode`, {
      method: 'POST',
      headers: headersT1,
      body: JSON.stringify({ barcode: customBarcode, excludeId: createdProductId }),
    });
    assert.equal(selfRes.status, 200);
    const selfBody = (await selfRes.json()) as { valid: boolean; isDuplicate: boolean };
    assert.equal(selfBody.valid, true);
    assert.equal(selfBody.isDuplicate, false);

    // 5. Validate same barcode in Tenant 2 -> allowed (tenant isolation)
    const crossTenantValRes = await fetch(`${baseUrl}/api/products/validate-barcode`, {
      method: 'POST',
      headers: headersT2,
      body: JSON.stringify({ barcode: customBarcode }),
    });
    assert.equal(crossTenantValRes.status, 200);
    const crossTenantBody = (await crossTenantValRes.json()) as { valid: boolean; isDuplicate: boolean };
    assert.equal(crossTenantBody.valid, true);
    assert.equal(crossTenantBody.isDuplicate, false);

    // 6. POS Barcode Lookup by exact barcode and by article code
    const lookupByBarcode = await fetch(`${baseUrl}/api/products/barcode/${encodeURIComponent(customBarcode)}`, {
      headers: headersT1,
    });
    assert.equal(lookupByBarcode.status, 200);
    const lookupBody1 = (await lookupByBarcode.json()) as { product: { id: number; barcode: string; article: string } };
    assert.equal(lookupBody1.product.id, createdProductId);
    assert.equal(lookupBody1.product.barcode, customBarcode);

    const lookupByArticle = await fetch(`${baseUrl}/api/products/lookup/${encodeURIComponent(customArticle.toLowerCase())}`, {
      headers: headersT1,
    });
    assert.equal(lookupByArticle.status, 200);
    const lookupBody2 = (await lookupByArticle.json()) as { product: { id: number } };
    assert.equal(lookupBody2.product.id, createdProductId);

    // 7. Tenant 2 cannot look up Tenant 1's product barcode
    const lookupCrossTenant = await fetch(`${baseUrl}/api/products/barcode/${encodeURIComponent(customBarcode)}`, {
      headers: headersT2,
    });
    assert.equal(lookupCrossTenant.status, 404);
  } finally {
    if (createdProductId) {
      await fetch(
        `http://127.0.0.1:${(server.address() as any).port}/api/products/${createdProductId}`,
        { method: 'DELETE', headers: headersT1 }
      ).catch(() => {});
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
