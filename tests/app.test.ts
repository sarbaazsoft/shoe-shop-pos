import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import * as productSchema from '../src/schemas/productSchema.ts';
import { generateSampleProductsCsv, parseAndValidateProductsCsv } from '../src/utils/csvImport.ts';
import { pgClient } from '../src/db/index.ts';
import { ensureSaasControlPlane } from '../src/db/schemaInit.ts';
import { generateToken } from '../src/server/auth.ts';
import productRoutes from '../src/server/routes/productRoutes.ts';
import settingsRoutes from '../src/server/routes/settingsRoutes.ts';
import notificationRoutes from '../src/server/routes/notificationRoutes.ts';

test('productSchema: deprecated threshold helpers are removed and pricing rules hold', () => {
  assert.equal((productSchema as Record<string, unknown>).calculateLowStockPairs, undefined);
  assert.equal((productSchema as Record<string, unknown>).extractCartonThreshold, undefined);

  // FIXED pricing normalizes minPrice = maxPrice = sellingPrice
  const fixedValid = productSchema.validateAndNormalizeProductPricing({
    pricingMode: 'FIXED',
    costPrice: 1200,
    maxPrice: 1850,
  });
  assert.equal(fixedValid.success, true);
  assert.deepEqual(fixedValid.data, {
    costPrice: 1200,
    sellingPrice: 1850,
    minPrice: 1850,
    maxPrice: 1850,
  });

  // FIXED pricing rejects price below cost
  const fixedInvalid = productSchema.validateAndNormalizeProductPricing({
    pricingMode: 'FIXED',
    costPrice: 2000,
    maxPrice: 1500,
  });
  assert.equal(fixedInvalid.success, false);
  assert.ok(fixedInvalid.fieldErrors.maxPrice);

  // NEGOTIABLE pricing requires maxPrice > minPrice >= costPrice
  const negValid = productSchema.validateAndNormalizeProductPricing({
    pricingMode: 'NEGOTIABLE',
    costPrice: 1000,
    minPrice: 1300,
    maxPrice: 1700,
  });
  assert.equal(negValid.success, true);
  assert.deepEqual(negValid.data, {
    costPrice: 1000,
    sellingPrice: 1700,
    minPrice: 1300,
    maxPrice: 1700,
  });

  const negEqual = productSchema.validateAndNormalizeProductPricing({
    pricingMode: 'NEGOTIABLE',
    costPrice: 1000,
    minPrice: 1500,
    maxPrice: 1500,
  });
  assert.equal(negEqual.success, false);
  assert.ok(negEqual.fieldErrors.maxPrice);
});

test('productSchema: brand normalization and calculateMinSaleQuantity rules', () => {
  assert.deepEqual(productSchema.validateProductBrand('   '), { success: true, brand: 'Unbranded' });
  assert.deepEqual(productSchema.validateProductBrand('  Bata  '), { success: true, brand: 'Bata' });

  // Retail always sells minimum 1 pair
  assert.equal(
    productSchema.calculateMinSaleQuantity(
      { pairsPerCarton: 12, allowHalfCarton: false },
      { businessType: 'RETAIL', allowHalfCarton: false }
    ),
    1
  );

  // Wholesale with half carton allowed
  assert.equal(
    productSchema.calculateMinSaleQuantity(
      { pairsPerCarton: 12 },
      { businessType: 'WHOLESALE', allowHalfCarton: true }
    ),
    6
  );

  // Wholesale with product-level full carton override
  assert.equal(
    productSchema.calculateMinSaleQuantity(
      { pairsPerCarton: 16, allowHalfCarton: false },
      { businessType: 'WHOLESALE', allowHalfCarton: true }
    ),
    16
  );
});

test('csvImport: sample templates and parser omit low_stock_limit and Title', () => {
  const retailFixedCsv = generateSampleProductsCsv({ businessType: 'RETAIL', pricingMode: 'FIXED' });
  const wholesaleCsv = generateSampleProductsCsv({ businessType: 'WHOLESALE', pricingMode: 'FIXED' });

  assert.equal(retailFixedCsv.toLowerCase().includes('low_stock'), false);
  assert.equal(retailFixedCsv.toLowerCase().includes('title'), false);
  assert.equal(wholesaleCsv.toLowerCase().includes('low_stock'), false);
  assert.ok(wholesaleCsv.includes('Pairs Per Carton'));

  const inputCsv = [
    'Article Code,Product Name,Title,Brand,Category,Cost Price,Sale Price,Stock (Pairs)',
    'SN-101,Court Pro Runner,Ignored Legacy Title,Ndure,Men,1800,2500,24',
    'SN-102,,Ignored Legacy Title 2,,Women,2000,2700,12',
  ].join('\n');

  const parsed = parseAndValidateProductsCsv(inputCsv, [], { pricingMode: 'FIXED' }, 10);
  assert.equal(parsed.parseError, undefined);
  assert.equal(parsed.rows.length, 2);

  const row1 = parsed.rows[0];
  assert.equal(row1.isValid, true);
  assert.equal(row1.article, 'SN-101');
  assert.equal(row1.name, 'Court Pro Runner');
  assert.equal('low_stock_limit' in (row1 as unknown as Record<string, unknown>), false);

  // When Product Name is empty, name falls back to article (Title column is ignored)
  const row2 = parsed.rows[1];
  assert.equal(row2.isValid, true);
  assert.equal(row2.name, 'SN-102');
  assert.equal(row2.brand, 'Unbranded');
});

test('API & DB integration: settings low_stock_threshold, product CRUD without lowStockLimit, and deprecated routes return 404', async () => {
  await pgClient.waitReady;
  await ensureSaasControlPlane();

  // Verify database schema/mockStore uses low_stock_threshold and strips deprecated columns
  const settingsDb = await pgClient.query<Record<string, unknown>>(
    'SELECT * FROM company_settings WHERE tenant_id = $1 LIMIT 1',
    [1]
  );
  assert.equal(settingsDb.rows.length, 1);
  const csRow = settingsDb.rows[0];
  assert.ok('low_stock_threshold' in csRow);
  assert.equal('low_stock_limit' in csRow, false);
  assert.equal('pricing_policy_locked' in csRow, false);
  assert.equal('min_selling_quantity' in csRow, false);
  assert.equal('telegram_bot_token' in csRow, false);

  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint ${req.method} ${req.path} not found.`, code: 'ROUTE_NOT_FOUND' });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const adminToken = generateToken({
      id: 2,
      tenantId: 1,
      name: 'Store Admin',
      email: 'admin@balochshoes.com',
      role: 'ADMIN',
      status: 'APPROVED',
    });

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-Id': '1',
    };

    // 1. GET /api/settings returns lowStockThreshold and omits deprecated fields
    const getSettingsRes = await fetch(`${baseUrl}/api/settings`, { headers });
    assert.equal(getSettingsRes.status, 200);
    const getSettingsBody = (await getSettingsRes.json()) as { settings: Record<string, unknown> };
    assert.equal(typeof getSettingsBody.settings.lowStockThreshold, 'number');
    assert.equal('lowStockLimit' in getSettingsBody.settings, false);
    assert.equal('low_stock_limit' in getSettingsBody.settings, false);
    assert.equal('pricingPolicyLocked' in getSettingsBody.settings, false);
    assert.equal('minSellingQuantity' in getSettingsBody.settings, false);

    // 2. PUT /api/settings updates global low_stock_threshold
    const originalThreshold = Number(getSettingsBody.settings.lowStockThreshold || 5);
    const updatedThreshold = originalThreshold === 9 ? 7 : 9;

    const putSettingsRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        company_name: getSettingsBody.settings.name || 'Baloch Shoes',
        low_stock_threshold: updatedThreshold,
      }),
    });
    assert.equal(putSettingsRes.status, 200);
    const putSettingsBody = (await putSettingsRes.json()) as { settings: Record<string, unknown> };
    assert.equal(putSettingsBody.settings.lowStockThreshold, updatedThreshold);
    assert.equal(putSettingsBody.settings.low_stock_threshold, updatedThreshold);

    // Restore original threshold so seeded state stays unchanged
    await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        company_name: getSettingsBody.settings.name || 'Baloch Shoes',
        low_stock_threshold: originalThreshold,
      }),
    });

    // 3. POST /api/products creates product without title or lowStockLimit
    const uniqueArticle = `TST-${Date.now().toString().slice(-6)}`;
    const createProdRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        article: uniqueArticle,
        brand: 'Service',
        category: 'Men',
        costPrice: 1500,
        maxPrice: 2200,
        totalStock: 10,
      }),
    });
    assert.equal(createProdRes.status, 201);
    const createProdBody = (await createProdRes.json()) as { productId: number; barcode: string };
    assert.ok(typeof createProdBody.productId === 'number' && createProdBody.productId > 0);

    const getProdRes = await fetch(`${baseUrl}/api/products/${createProdBody.productId}`, { headers });
    assert.equal(getProdRes.status, 200);
    const getProdBody = (await getProdRes.json()) as { product: Record<string, unknown> };
    assert.equal(getProdBody.product.article, uniqueArticle);
    assert.equal(getProdBody.product.name, uniqueArticle);
    assert.equal('lowStockLimit' in getProdBody.product, false);
    assert.equal('lowStockAlert' in getProdBody.product, false);
    assert.equal('low_stock_limit' in getProdBody.product, false);

    // Verify lowStockOnly query executes cleanly with global threshold
    const lowStockListRes = await fetch(`${baseUrl}/api/products?lowStockOnly=true`, { headers });
    assert.equal(lowStockListRes.status, 200);

    // Clean up created product
    const deleteProdRes = await fetch(`${baseUrl}/api/products/${createProdBody.productId}`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(deleteProdRes.status, 200);

    // 4. Removed deprecated endpoints strictly return 404
    const removedEndpoints: Array<{ method: string; path: string }> = [
      { method: 'POST', path: '/api/products/ai-suggest' },
      { method: 'POST', path: '/api/products/ai-suggest-from-image' },
      { method: 'POST', path: '/api/settings/test-telegram' },
      { method: 'POST', path: '/api/settings/test-gmail' },
      { method: 'PUT', path: '/api/settings/alert-providers' },
      { method: 'GET', path: '/api/notifications/vapid-public-key' },
    ];

    for (const ep of removedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers,
        body: ep.method === 'GET' ? undefined : JSON.stringify({}),
      });
      assert.equal(res.status, 404, `Expected 404 for removed route ${ep.method} ${ep.path}, got ${res.status}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
