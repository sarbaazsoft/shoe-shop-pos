import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  DEFAULT_PUBLISHED_APP_URL,
  calculatePeChecksum,
  patchDesktopSetupExe,
  resolveDesktopTargetUrl,
} from '../src/server/utils/windowsExePatcher.ts';

function reconstructPatchedExeUrl(buf: Buffer): string {
  const slots = [
    { immOffset: 0x0d2d, bufStart: 0 },
    { immOffset: 0x0d37, bufStart: 8 },
    { immOffset: 0x0d51, bufStart: 16 },
    { immOffset: 0x0d6b, bufStart: 24 },
    { immOffset: 0x0d7d, bufStart: 32 },
    { immOffset: 0x0d8f, bufStart: 40 },
    { immOffset: 0x0da1, bufStart: 48 },
    { immOffset: 0x0db3, bufStart: 56 },
    { immOffset: 0x0dc5, bufStart: 63 },
  ];
  const stack = Buffer.alloc(71, 0);
  for (const s of slots) {
    buf.copy(stack, s.bufStart, s.immOffset, s.immOffset + 8);
  }
  const nulIdx = stack.indexOf(0);
  return stack.subarray(0, nulIdx >= 0 ? nulIdx : stack.length).toString('ascii');
}

test('windowsExePatcher: resolveDesktopTargetUrl handles custom domains, localhost fallback, and length cap', () => {
  assert.equal(
    resolveDesktopTargetUrl({ hostHeader: 'localhost:3000' }),
    DEFAULT_PUBLISHED_APP_URL
  );
  assert.equal(
    resolveDesktopTargetUrl({ hostHeader: 'sarbaazsoft.cloud.run' }),
    'https://sarbaazsoft.cloud.run'
  );
  assert.equal(
    resolveDesktopTargetUrl({
      envUrl: 'https://pos.example.com/',
      hostHeader: 'localhost:3000',
    }),
    'https://pos.example.com'
  );
  assert.equal(
    resolveDesktopTargetUrl({
      hostHeader: 'very-long-subdomain-that-exceeds-seventy-bytes-limit-for-stack-slot.run.app',
    }),
    DEFAULT_PUBLISHED_APP_URL
  );
});

test('windowsExePatcher: static Desktop-Setup.exe targets published domain and patches cleanly with valid PE checksum', () => {
  const exePath = path.join(process.cwd(), 'public', 'assets', 'SarbaazSoft-POS-Desktop-Setup.exe');
  assert.equal(fs.existsSync(exePath), true);

  const staticBuf = fs.readFileSync(exePath);
  assert.equal(reconstructPatchedExeUrl(staticBuf), DEFAULT_PUBLISHED_APP_URL);
  assert.equal(staticBuf.includes('bgzwxvuxagqs5bvujpe223'), false);

  const customPatched = patchDesktopSetupExe(staticBuf, {
    targetUrl: 'https://ais-pre-zeqapufe4yj453mdcb6wye-343247648175.asia-east1.run.app',
    shortcutBaseName: 'SarbaazSoft-Admin',
  });
  assert.equal(
    reconstructPatchedExeUrl(customPatched),
    'https://ais-pre-zeqapufe4yj453mdcb6wye-343247648175.asia-east1.run.app'
  );
  assert.equal(
    customPatched.subarray(31997, 31997 + 22).toString('utf8').startsWith('SarbaazSoft-Admin.url\0'),
    true
  );

  const eLfanew = customPatched.readUInt32LE(0x3c);
  const storedChecksum = customPatched.readUInt32LE(eLfanew + 24 + 64);
  assert.equal(storedChecksum, calculatePeChecksum(customPatched));
});

test('windows packages & service worker assets exist and sw.js compiles cleanly', () => {
  const requiredWindowsFiles = [
    'public/assets/SarbaazSoft-POS-Desktop-Setup.exe',
    'public/assets/windows/SarbaazSoft-Shoe-POS.msixbundle',
    'public/assets/windows/SarbaazSoft-Shoe-POS.sideload.msix',
    'public/assets/windows/SarbaazSoft-Shoe-POS.classic.appxbundle',
  ];
  for (const rel of requiredWindowsFiles) {
    assert.equal(fs.existsSync(path.join(process.cwd(), rel)), true, `Missing ${rel}`);
  }

  for (const swRel of ['public/sw.js', 'public/firebase-messaging-sw.js', 'public/sw-background-sync.js']) {
    const code = fs.readFileSync(path.join(process.cwd(), swRel), 'utf8');
    new vm.Script(code, { filename: swRel });
  }

  const swSource = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
  const match = swSource.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(match, 'PRECACHE_ASSETS array should exist in public/sw.js');

  const entries = Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
  assert.ok(entries.length > 0);
  for (const assetPath of entries) {
    if (assetPath === '/') continue;
    if (assetPath === '/index.html') {
      assert.equal(fs.existsSync(path.join(process.cwd(), 'index.html')), true, 'Missing root index.html');
      continue;
    }
    const diskPath = path.join(process.cwd(), 'public', assetPath.replace(/^\//, ''));
    assert.equal(fs.existsSync(diskPath), true, `Precache asset missing on disk: ${assetPath}`);
  }
});
