import { expect, test } from '@playwright/test';

const navigation = (page, name) => page.locator('nav').getByRole('button', { name, exact: true }).click();

async function signIn(page, email, management = false, password = 'password123') {
  await page.goto('/');
  if (management) await page.getByRole('button', { name: /Admin \/ Management/ }).click();
  await page.getByLabel('Work email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

async function anotherUser(browser, email, management = false, password = 'password123') {
  const context = await browser.newContext({ baseURL: 'http://localhost:4173', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, email, management, password);
  return { page, context };
}

async function apply(page, start, end, reason) {
  await navigation(page, 'My leave');
  await page.getByRole('button', { name: 'Apply for leave', exact: true }).click();
  await page.getByLabel('Start date', { exact: true }).fill(start);
  await page.getByLabel('End date', { exact: true }).fill(end);
  await page.getByLabel('Reason', { exact: true }).fill(reason);
  await page.getByRole('button', { name: 'Send application', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: start })).toContainText('Pending');
}

async function focusRefresh(page) {
  const refreshed = page.waitForResponse((response) => response.url().endsWith('/api/portal') && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
}

test('Daniel receives both employee and trainer leave, decides it, and each applicant sees only their own decision', async ({ page, browser }) => {
  await signIn(page, 'daniel@excellium.com', true);
  await navigation(page, 'Leave approvals');
  await expect(page.getByRole('button', { name: 'Apply for leave', exact: true })).toHaveCount(0);
  const employee = await anotherUser(browser, 'john@excellium.com');
  const trainer = await anotherUser(browser, 'priya@excellium.com');
  try {
    await apply(employee.page, '2026-12-14', '2026-12-15', 'Management review of employee leave');
    await apply(trainer.page, '2026-12-17', '2026-12-18', 'Management review of trainer leave');
    await focusRefresh(page);
    const john = page.getByRole('row').filter({ hasText: '2026-12-14' });
    const priya = page.getByRole('row').filter({ hasText: '2026-12-17' });
    await expect(john).toContainText('John Carter');
    await expect(priya).toContainText('Priya Nair');
    await expect(priya).toContainText('Management review of trainer leave');
    await page.screenshot({ path: '../.cache/management-leave-approvals.png', fullPage: true });
    await page.getByLabel('Filter leave status').selectOption('All');
    await john.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByLabel('Note to employee (optional)').fill('Daniel approved employee coverage');
    await page.getByRole('button', { name: 'Approve leave', exact: true }).click();
    await expect(john).toContainText('Approved');
    await priya.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByLabel('Reason for rejection (required)').fill('Daniel needs revised trainer coverage');
    await page.getByRole('button', { name: 'Reject leave', exact: true }).click();
    await expect(priya).toContainText('Rejected');
    await expect(priya).toContainText('By Daniel Okafor');
    await focusRefresh(employee.page);
    await expect(employee.page.getByRole('row').filter({ hasText: '2026-12-14' })).toContainText('Daniel approved employee coverage');
    await expect(employee.page.getByRole('row').filter({ hasText: '2026-12-17' })).toHaveCount(0);
    await focusRefresh(trainer.page);
    await expect(trainer.page.getByRole('row').filter({ hasText: '2026-12-17' })).toContainText('Daniel needs revised trainer coverage');
    await expect(trainer.page.getByRole('row').filter({ hasText: '2026-12-14' })).toHaveCount(0);
    await expect(trainer.page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  } finally { await employee.context.close(); await trainer.context.close(); }
});

test('role-specific sidebars, actions, deep links and responsive navigation are enforced', async ({ browser }) => {
  for (const role of ['employee', 'trainer', 'manager', 'admin']) {
    const accounts = { employee: 'john', trainer: 'priya', manager: 'daniel', admin: 'sara' };
    const management = ['manager', 'admin'].includes(role);
    const session = await anotherUser(browser, `${accounts[role]}@excellium.com`, management);
    const page = session.page;
    try {
      const nav = page.locator('nav');
      await expect(nav.getByRole('button', { name: 'Employee profiles', exact: true })).toHaveCount(management ? 1 : 0);
      await expect(nav.getByRole('button', { name: 'Roles & permissions', exact: true })).toHaveCount(role === 'admin' ? 1 : 0);
      await expect(nav.getByRole('button', { name: 'Organization settings', exact: true })).toHaveCount(role === 'admin' ? 1 : 0);
      await expect(nav.getByRole('button', { name: 'Audit trail', exact: true })).toHaveCount(role === 'admin' ? 1 : 0);
      await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toHaveCount(management ? 0 : 1);
      await navigation(page, management ? 'Team attendance' : 'My attendance');
      await expect(page.getByRole('button', { name: 'Raise a correction', exact: true })).toHaveCount(management ? 0 : 1);
      await navigation(page, management ? 'Invoice approvals' : 'My invoices');
      await expect(page.getByRole('button', { name: 'Prepare invoice', exact: true })).toHaveCount(management ? 0 : 1);
      await navigation(page, management ? 'Equipment requests' : 'My equipment');
      await expect(page.getByRole('button', { name: 'Request change', exact: true })).toHaveCount(management ? 0 : 1);
      await navigation(page, management ? 'Meeting management' : role === 'trainer' ? 'Training sessions' : 'My meetings');
      await expect(page.getByRole('button', { name: 'Schedule meeting', exact: true })).toHaveCount(management ? 1 : 0);
      await expect(page.getByRole('button', { name: 'Request training session', exact: true })).toHaveCount(role === 'trainer' ? 1 : 0);
      if (!management) {
        await page.goto('/#users');
        await expect(page.getByRole('heading', { name: role === 'trainer' ? 'Training overview' : 'Good day, John', exact: true })).toBeVisible();
        await expect(page).toHaveURL(/#dashboard$/);
        expect((await page.request.get('/api/admin/users')).status()).toBe(403);
      }
      if (role === 'manager') {
        await page.setViewportSize({ width: 800, height: 1000 });
        await expect(nav).toBeVisible();
        await expect(page.getByRole('button', { name: 'Toggle menu', exact: true })).not.toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'Toggle menu', exact: true }).click();
        await expect(nav.getByRole('button', { name: 'Employee profiles', exact: true })).toBeVisible();
        await navigation(page, 'Leave approvals');
        await expect(page.getByRole('heading', { name: 'Leave approvals', exact: true }).last()).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expect(page.locator('#workspace-sidebar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -264, 0)');
        await page.screenshot({ path: '../.cache/management-mobile.png', fullPage: true });
      }
      if (role === 'admin') {
        await navigation(page, 'Roles & permissions');
        await expect(page.getByRole('button', { name: 'Create role', exact: true })).toBeVisible();
        await navigation(page, 'Organization settings');
        await expect(page.getByRole('button', { name: 'Save organization settings', exact: true })).toBeVisible();
        await navigation(page, 'Audit trail');
        await expect(page.getByRole('table')).toBeVisible();
      }
    } finally { await session.context.close(); }
  }
});

test('management creates an employee profile and the new account signs into only its assigned workspace', async ({ page, browser }) => {
  await signIn(page, 'daniel@excellium.com', true);
  await navigation(page, 'Employee profiles');
  await expect(page.getByRole('row').filter({ hasText: 'sara@excellium.com' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create employee profile', exact: true }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Management Created Employee');
  await page.getByLabel('Work email', { exact: true }).fill('management.employee@example.test');
  await page.getByLabel('Job title', { exact: true }).fill('Operations Associate');
  await expect(page.getByLabel('Role', { exact: true }).getByRole('option', { name: 'Management', exact: true })).toHaveCount(0);
  await page.getByLabel('Initial password', { exact: true }).fill('ManagementCreated!234');
  await page.getByRole('button', { name: 'Create portal', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'management.employee@example.test' })).toContainText('Employee / Trainer');
  const context = await browser.newContext({ baseURL: 'http://localhost:4173' });
  const employee = await context.newPage();
  try {
    await employee.goto('/');
    await employee.getByRole('button', { name: /Admin \/ Management/ }).click();
    await employee.getByLabel('Work email', { exact: true }).fill('management.employee@example.test');
    await employee.getByLabel('Password', { exact: true }).fill('ManagementCreated!234');
    await employee.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(employee.getByRole('alert')).toContainText(/selected sign-in group/i);
    await expect(employee.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
    await employee.getByRole('button', { name: /Employee \/ Trainer/ }).click();
    await employee.getByLabel('Work email', { exact: true }).fill('management.employee@example.test');
    await employee.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(employee.getByRole('heading', { name: 'Good day, Management', exact: true })).toBeVisible();
    await expect(employee.locator('nav').getByRole('button', { name: 'Employee profiles', exact: true })).toHaveCount(0);
    await navigation(employee, 'My profile');
    await expect(employee.getByText('Assigned role', { exact: true })).toBeVisible();
    await expect(employee.getByText('Employee / Trainer', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('trainer requests a training session and management confirms it while employees have invitation-only access', async ({ page, browser }) => {
  await signIn(page, 'priya@excellium.com');
  await navigation(page, 'Training sessions');
  await page.getByRole('button', { name: 'Request training session', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Role-separated onboarding session');
  await page.getByLabel('Date and time (your local time)', { exact: true }).fill('2026-12-21T10:00');
  await page.getByLabel('Participants (optional)', { exact: true }).fill('john@excellium.com');
  await page.getByRole('button', { name: 'Send session request', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const manager = await anotherUser(browser, 'daniel@excellium.com', true);
  try {
    await navigation(manager.page, 'Meeting management');
    const row = manager.page.getByRole('row').filter({ hasText: 'Role-separated onboarding session' });
    await expect(row).toContainText('Priya Nair');
    await row.getByRole('button', { name: 'Confirm session', exact: true }).click();
    await expect(row).toHaveCount(0);
    await focusRefresh(page);
    await expect(page.getByText('Role-separated onboarding session', { exact: true }).locator('..').locator('..')).toContainText('Confirmed');
    const employee = await anotherUser(browser, 'john@excellium.com');
    try {
      await navigation(employee.page, 'My meetings');
      await expect(employee.page.getByText('Role-separated onboarding session', { exact: true })).toBeVisible();
      await expect(employee.page.getByRole('button', { name: 'Schedule meeting', exact: true })).toHaveCount(0);
    } finally { await employee.context.close(); }
  } finally { await manager.context.close(); }
});

test('management approval queue updates on the automatic 30-second refresh without reload or sign-out', async ({ page, browser }) => {
  await signIn(page, 'daniel@excellium.com', true);
  await navigation(page, 'Leave approvals');
  const employee = await anotherUser(browser, 'john@excellium.com');
  try {
    await page.bringToFront();
    await focusRefresh(page);
    await page.clock.install();
    expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
    const result = await employee.page.request.post('/api/leaves', { data: { type: 'Casual', startDate: '2026-12-28', endDate: '2026-12-28', reason: 'Automatic refresh integration regression' } });
    expect(result.status()).toBe(201);
    const refreshed = page.waitForResponse((response) => response.url().endsWith('/api/portal') && response.ok());
    await page.clock.runFor(31_000);
    await refreshed;
    await expect(page.getByRole('row').filter({ hasText: '2026-12-28' })).toContainText('John Carter');
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  } finally { await employee.context.close(); }
});
