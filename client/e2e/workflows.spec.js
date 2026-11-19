import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

async function signIn(page, email = 'john@excellium.com', management = false, password = 'password123') {
  await page.goto('/');
  if (management) await page.getByRole('button', { name: /Admin \/ Management/ }).click();
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

const navigation = (page, name) => page.locator('nav').getByRole('button', { name, exact: true }).click();

async function adminPage(browser) {
  const context = await browser.newContext({ baseURL: 'http://localhost:4173', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'sara@excellium.com', true);
  return { page, context };
}

test('employee prepares and edits an invoice, downloads its PDF, and management approves it', async ({ page, browser }) => {
  await signIn(page);
  await expect(page.locator('nav').getByRole('button', { name: 'Employee profiles' })).toHaveCount(0);
  await navigation(page, 'My invoices');
  await page.getByRole('button', { name: 'Prepare invoice', exact: true }).click();
  await page.getByLabel('Invoice month / period').fill('December 2026');
  await page.getByLabel('Description 1', { exact: true }).fill('Portal preparation test');
  await page.getByLabel('Quantity 1', { exact: true }).fill('2');
  await page.getByLabel('Unit rate 1', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Add line item', exact: true }).click();
  await page.getByLabel('Description 2', { exact: true }).fill('Training services');
  await page.getByLabel('Unit rate 2', { exact: true }).fill('50');
  await page.getByLabel('Tax rate (%)').fill('10');
  const created = page.waitForResponse((response) => response.url().endsWith('/api/invoices') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const invoice = (await (await created).json()).invoice;
  const row = page.getByRole('row').filter({ hasText: invoice.id });
  await expect(row).toContainText('Draft');
  await expect(row).toContainText('275.00');
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Remove line item 2', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(row).toContainText('220.00');
  const downloading = page.waitForEvent('download');
  await row.getByRole('button', { name: 'PDF', exact: true }).click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe(`${invoice.id}.pdf`);
  expect((await readFile(await downloaded.path())).subarray(0, 5).toString()).toBe('%PDF-');
  await row.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(row).toContainText('Pending');
  const admin = await adminPage(browser);
  try {
    await navigation(admin.page, 'Invoice approvals');
    const review = admin.page.getByRole('row').filter({ hasText: invoice.id });
    await review.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(review).toContainText('Approved');
  } finally { await admin.context.close(); }
  await page.reload();
  await navigation(page, 'My invoices');
  await expect(page.getByRole('row').filter({ hasText: invoice.id })).toContainText('Approved');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Prepare invoice', exact: true }).click();
  await expect(page.getByLabel('Description 1', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('Invoice month / period').fill('Mobile test period');
  await page.getByLabel('Description 1', { exact: true }).fill('Mobile services');
  await page.getByLabel('Unit rate 1', { exact: true }).fill('75');
  await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Mobile test period' })).toContainText('Pending');
});

test('employee applies for leave; admin accepts or rejects it and the employee sees the decision', async ({ page, browser }) => {
  await signIn(page);
  await navigation(page, 'My leave');
  await page.getByRole('button', { name: 'Apply for leave', exact: true }).click();
  await page.getByLabel('Start date', { exact: true }).fill('2026-12-01');
  await page.getByLabel('End date', { exact: true }).fill('2026-12-03');
  await page.getByLabel('Reason', { exact: true }).fill('E2E family commitments');
  await expect(page.getByText('3 calendar days requested')).toBeVisible();
  await page.getByRole('button', { name: 'Send application' }).click();
  const employeeRow = page.getByRole('row').filter({ hasText: '2026-12-01' });
  await expect(employeeRow).toContainText('Pending');
  const admin = await adminPage(browser);
  try {
    await navigation(admin.page, 'Leave approvals');
    await admin.page.getByLabel('Filter leave status').selectOption('All');
    const row = admin.page.getByRole('row').filter({ hasText: '2026-12-01' });
    await row.getByRole('button', { name: 'Approve', exact: true }).click();
    await admin.page.getByLabel('Note to employee (optional)').fill('Approved, enjoy your time off.');
    await admin.page.getByRole('button', { name: 'Approve leave', exact: true }).click();
    await expect(row).toContainText('Approved');
    await page.reload();
    await navigation(page, 'My leave');
    await expect(employeeRow).toContainText('Approved, enjoy your time off.');
    await page.getByRole('button', { name: 'Apply for leave', exact: true }).click();
    await page.getByLabel('Leave type', { exact: true }).selectOption('Casual');
    await page.getByLabel('Start date', { exact: true }).fill('2026-12-10');
    await page.getByLabel('End date', { exact: true }).fill('2026-12-10');
    await page.getByLabel('Reason', { exact: true }).fill('E2E personal appointment');
    await page.getByRole('button', { name: 'Send application' }).click();
    await expect(page.getByRole('row').filter({ hasText: '2026-12-10' })).toContainText('Pending');
    await admin.page.reload();
    await navigation(admin.page, 'Leave approvals');
    await admin.page.getByLabel('Filter leave status').selectOption('All');
    const rejected = admin.page.getByRole('row').filter({ hasText: '2026-12-10' });
    await rejected.getByRole('button', { name: 'Reject', exact: true }).click();
    await admin.page.getByLabel('Reason for rejection (required)').fill('Please arrange team coverage first.');
    await admin.page.getByRole('button', { name: 'Reject leave', exact: true }).click();
    await expect(rejected).toContainText('Rejected');
    await page.reload();
    await navigation(page, 'My leave');
    await expect(page.getByRole('row').filter({ hasText: '2026-12-10' })).toContainText('Please arrange team coverage first.');
  } finally { await admin.context.close(); }
});

test('admin creates a department, role and profile; the new employee can sign into the assigned portal', async ({ page, browser }) => {
  await signIn(page, 'sara@excellium.com', true);
  await navigation(page, 'Employee profiles');
  await navigation(page, 'Departments');
  await page.getByRole('button', { name: 'Create department', exact: true }).click();
  await page.getByLabel('Department name', { exact: true }).fill('E2E Customer Success');
  await page.getByRole('dialog').getByRole('button', { name: 'Create department', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'E2E Customer Success' })).toBeVisible();
  await navigation(page, 'Roles & permissions');
  await page.getByRole('button', { name: 'Create role', exact: true }).click();
  await page.getByLabel('Role name', { exact: true }).fill('E2E Support Trainer');
  await page.getByLabel('Permission level', { exact: true }).selectOption('trainer');
  await page.getByRole('dialog').getByRole('button', { name: 'Create role', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'E2E Support Trainer' })).toBeVisible();
  await page.getByRole('button', { name: 'Create employee profile', exact: true }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Browser Test Employee');
  await page.getByLabel('Work email', { exact: true }).fill('browser.employee@excellium.com');
  await page.getByLabel('Job title', { exact: true }).fill('Support Trainer');
  await page.getByLabel('Role', { exact: true }).selectOption({ label: 'E2E Support Trainer' });
  await page.getByLabel('Department', { exact: true }).selectOption({ label: 'E2E Customer Success' });
  await page.getByLabel('Initial password', { exact: true }).fill('BrowserTest!234');
  await page.getByRole('button', { name: 'Create portal', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigation(page, 'Employee profiles');
  const row = page.getByRole('row').filter({ hasText: 'browser.employee@excellium.com' });
  await expect(row).toContainText('E2E Support Trainer');
  await expect(row).toContainText('E2E Customer Success');
  const context = await browser.newContext({ baseURL: 'http://localhost:4173' });
  const employee = await context.newPage();
  try {
    await signIn(employee, 'browser.employee@excellium.com', false, 'BrowserTest!234');
    await expect(employee.getByRole('heading', { name: 'Trainer overview' })).toBeVisible();
    await expect(employee.locator('nav').getByRole('button', { name: 'Employee profiles' })).toHaveCount(0);
    await navigation(employee, 'My invoices');
    await expect(employee.getByRole('button', { name: 'Prepare invoice', exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await page.getByLabel('Job title', { exact: true }).fill('Senior Support Trainer');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(row).toContainText('Senior Support Trainer');
    await row.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await page.getByRole('checkbox').uncheck();
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(row).toContainText('Inactive');
    await employee.reload();
    await expect(employee.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  } finally { await context.close(); }
});
