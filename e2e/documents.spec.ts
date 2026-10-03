import { expect, test } from '@playwright/test';
import { authFile } from './support/auth';

const fileName = `informe-${Date.now().toString(36)}.pdf`;
const content = Buffer.from('%PDF-1.4\n% documento de prueba E2E\n%%EOF\n');

test('el admin sube un documento; el inversor con posición lo descarga y el que no la tiene recibe 403', async ({
  browser,
}) => {
  // Admin sube el documento al bono E2E-ACT-1 (storage real: RustFS local o fs en CI).
  const adminCtx = await browser.newContext({ storageState: authFile('admin') });
  const admin = await adminCtx.newPage();
  await admin.goto('/admin/bonds');
  await admin.getByTestId('bond-link-E2E-ACT-1').click();
  await admin.getByTestId('doc-kind').selectOption('use_of_funds');
  await admin
    .getByTestId('doc-file')
    .setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: content });
  await admin.getByTestId('doc-upload').click();
  await expect(admin.getByTestId('toast-success')).toContainText('Documento subido');
  const row = admin.getByTestId('doc-row').filter({ hasText: fileName });
  await expect(row).toBeVisible();
  const href = (await row.getByTestId('doc-download').getAttribute('href'))!;
  expect(href).toMatch(/^\/api\/documents\/[0-9a-f]{24}\/download$/);

  // El admin también puede generar el reporte de la emisión.
  await admin.getByTestId('generate-report').click();
  await expect(admin.getByTestId('doc-row').filter({ hasText: /reporte-E2E-ACT-1/ })).toBeVisible();
  const downloadAsAdmin = await adminCtx.request.get(href);
  expect(downloadAsAdmin.status()).toBe(200);
  await adminCtx.close();

  // investor1 posee E2E-ACT-1: descarga por URL firmada de corta duración.
  const holderCtx = await browser.newContext({ storageState: authFile('investor1') });
  const holder = await holderCtx.newPage();
  await holder.goto('/investor/documents');
  await expect(holder.getByTestId('document-row').filter({ hasText: fileName })).toBeVisible();
  const ok = await holderCtx.request.get(href);
  expect(ok.status()).toBe(200);
  expect((await ok.body()).toString().startsWith('%PDF-1.4')).toBe(true);
  await holderCtx.close();

  // investor2 no posee ese bono: ni lo ve ni lo descarga.
  const outsiderCtx = await browser.newContext({ storageState: authFile('investor2') });
  const outsider = await outsiderCtx.newPage();
  await outsider.goto('/investor/documents');
  await expect(outsider.getByTestId('document-row').filter({ hasText: fileName })).toHaveCount(0);
  const denied = await outsiderCtx.request.get(href, { maxRedirects: 0 });
  expect(denied.status()).toBe(403);
  await outsiderCtx.close();
});

test('rechaza tipos de archivo no permitidos', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('admin') });
  const page = await ctx.newPage();
  await page.goto('/admin/bonds');
  await page.getByTestId('bond-link-E2E-ACT-1').click();
  const res = await ctx.request.post('/api/admin/documents', {
    multipart: {
      bondId: page.url().split('/').pop()!,
      kind: 'fiscal',
      file: {
        name: 'malware.exe',
        mimeType: 'application/x-msdownload',
        buffer: Buffer.from('MZ'),
      },
    },
  });
  expect(res.status()).toBe(400);
  await ctx.close();
});
