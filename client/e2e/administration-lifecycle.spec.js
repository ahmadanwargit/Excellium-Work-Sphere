import { expect, test } from '@playwright/test';

const navigation = (page, name) => page.locator('nav').getByRole('button', { name, exact: true }).click();
const refresh = async (page) => {
  const pending = page.waitForResponse((response) => response.url().endsWith('/api/portal'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await pending;
};
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
async function createProfile(page, name, email, roleId = 'employee') {
  const catalog = await (await page.request.get('/api/admin/users')).json();
  const departmentId = catalog.departments.find((item) => item.name === 'Engineering').id;
  const result = await page.request.post('/api/admin/users', { data: { name, email, title: 'Lifecycle test specialist', roleId, departmentId, password: 'LifecyclePass!234' } });
  expect(result.status()).toBe(201);
  return (await result.json()).user;
}

test('profile deletion needs both confirmations; cancellation and incorrect email do not remove access', async ({ page, browser }) => {
  await signIn(page, 'sara@excellium.com', true);
  const person = await createProfile(page, 'Deletion Lifecycle Person', 'deletion.lifecycle@example.test');
  const staff = await anotherUser(browser, person.email, false, 'LifecyclePass!234');
  const deletionRequests = [];
  page.on('request', (request) => { if (request.method() === 'DELETE' && request.url().endsWith(`/api/admin/users/${person.id}`)) deletionRequests.push(request); });
  try {
    await navigation(page, 'Employee profiles');
    const row = page.getByRole('row').filter({ hasText: person.email });
    await row.getByRole('button', { name: 'Delete profile', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Delete profile · confirmation 1 of 2');
    await page.getByRole('button', { name: 'Continue to final confirmation', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Delete profile · final confirmation');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(row).toBeVisible(); expect(deletionRequests).toHaveLength(0);
    await row.getByRole('button', { name: 'Delete profile', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to final confirmation', exact: true }).click();
    await page.getByLabel('Type the profile’s work email to confirm', { exact: true }).fill('wrong@example.test');
    await page.getByRole('checkbox', { name: /I understand that access is removed/ }).check();
    await page.getByRole('button', { name: 'Delete profile permanently', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('exact work email');
    expect(deletionRequests).toHaveLength(0);
    await page.getByLabel('Type the profile’s work email to confirm', { exact: true }).fill(person.email);
    await page.getByRole('button', { name: 'Delete profile permanently', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row).toHaveCount(0); expect(deletionRequests).toHaveLength(1);
    await refresh(staff.page);
    await expect(staff.page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await page.reload(); await navigation(page, 'Employee profiles');
    await expect(row).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'sara@excellium.com' }).getByRole('button', { name: 'Delete profile', exact: true })).toBeDisabled();
  } finally { await staff.context.close(); }
});

test('role selection/deletion and department employee addition/removal update the assigned staff portal', async ({ page, browser }) => {
  await signIn(page, 'sara@excellium.com', true);
  await navigation(page, 'Roles & permissions');
  await page.getByRole('button', { name: 'Create role', exact: true }).click();
  await page.getByLabel('Role name', { exact: true }).fill('Lifecycle Named Trainer');
  await page.getByLabel('Permission level', { exact: true }).selectOption('trainer');
  await page.getByRole('dialog').getByRole('button', { name: 'Create role', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const role = (await (await page.request.get('/api/admin/users')).json()).roles.find((item) => item.name === 'Lifecycle Named Trainer');
  await page.getByLabel('Select role', { exact: true }).selectOption(role.id);
  await expect(page.getByText('Schedule meetings; trainers request a meeting with management', { exact: true })).toBeVisible();
  const person = await createProfile(page, 'Department Lifecycle Person', 'department.lifecycle@example.test', role.id);
  const staff = await anotherUser(browser, person.email, false, 'LifecyclePass!234');
  try {
    await navigation(page, 'Departments');
    await page.getByRole('button', { name: 'Create department', exact: true }).click();
    await page.getByLabel('Department name', { exact: true }).fill('Lifecycle Department');
    await page.getByRole('dialog').getByRole('button', { name: 'Create department', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const department = page.getByRole('row').filter({ hasText: 'Lifecycle Department' });
    await department.getByRole('button', { name: 'Add employees', exact: true }).click();
    await expect(page.getByLabel('Select department', { exact: true })).toHaveValue((await (await page.request.get('/api/admin/users')).json()).departments.find((item) => item.name === 'Lifecycle Department').id);
    await page.getByRole('checkbox', { name: /Department Lifecycle Person/ }).check();
    await page.getByRole('button', { name: 'Add 1 selected profiles', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await refresh(staff.page); await navigation(staff.page, 'My profile');
    expect((await (await staff.page.request.get('/api/me')).json()).user.department).toBe('Lifecycle Department');
    await navigation(page, 'Roles & permissions');
    await page.getByRole('checkbox', { name: 'Select role Lifecycle Named Trainer', exact: true }).check();
    await page.getByRole('button', { name: 'Delete selected (1)', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete roles', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'Lifecycle Named Trainer' })).toHaveCount(0);
    await refresh(staff.page);
    const own = (await (await staff.page.request.get('/api/me')).json()).user;
    expect(own.roleId).toBe('trainer'); expect(own.permissions).toContain('scheduleMeetings');
    await navigation(page, 'Departments');
    await department.getByRole('button', { name: 'Delete department', exact: true }).click();
    await page.getByLabel('Move existing profiles to', { exact: true }).selectOption({ label: 'Engineering' });
    await page.getByRole('dialog').getByRole('button', { name: 'Delete department', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(department).toHaveCount(0);
    await refresh(staff.page);
    expect((await (await staff.page.request.get('/api/me')).json()).user.department).toBe('Engineering');
    await page.reload(); await navigation(page, 'Departments'); await expect(department).toHaveCount(0);
  } finally { await staff.context.close(); }
});

test('management adds and reassigns equipment; the exact serial, status and issue date follow the current owner', async ({ page, browser }) => {
  await signIn(page, 'daniel@excellium.com', true);
  await navigation(page, 'Equipment requests');
  await page.getByRole('button', { name: 'Add / assign equipment', exact: true }).click();
  await page.getByLabel('Equipment name', { exact: true }).fill('Lifecycle Shared Laptop');
  await page.getByLabel('Equipment type', { exact: true }).fill('Laptop');
  await page.getByLabel('Serial number', { exact: true }).fill('BROWSER-LIFECYCLE-001');
  await page.getByLabel('Select employee / trainer', { exact: true }).selectOption('usr_john');
  await expect(page.getByLabel('Select employee / trainer', { exact: true }).getByRole('option', { name: /Sara Malik/ })).toHaveCount(0);
  await page.getByLabel('Issue date (UTC)', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Equipment status', { exact: true }).selectOption('In repair');
  await page.getByRole('button', { name: 'Save equipment assignment', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: 'BROWSER-LIFECYCLE-001' });
  await expect(row).toContainText('John Carter'); await expect(row).toContainText('In repair');
  const employee = await anotherUser(browser, 'john@excellium.com');
  const trainer = await anotherUser(browser, 'priya@excellium.com');
  try {
    await navigation(employee.page, 'My equipment'); await navigation(trainer.page, 'My equipment');
    const own = employee.page.getByRole('row').filter({ hasText: 'BROWSER-LIFECYCLE-001' });
    await expect(own).toContainText('Lifecycle Shared Laptop'); await expect(own).toContainText('2026-11-01'); await expect(own).toContainText('In repair');
    await expect(trainer.page.getByRole('row').filter({ hasText: 'BROWSER-LIFECYCLE-001' })).toHaveCount(0);
    await row.getByRole('button', { name: 'Edit assignment', exact: true }).click();
    await page.getByLabel('Select employee / trainer', { exact: true }).selectOption('usr_priya');
    await page.getByLabel('Issue date (UTC)', { exact: true }).fill('2026-11-02');
    await page.getByRole('button', { name: 'Save equipment assignment', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await refresh(employee.page); await refresh(trainer.page);
    await expect(own).toHaveCount(0);
    const trainerAsset = trainer.page.getByRole('row').filter({ hasText: 'BROWSER-LIFECYCLE-001' });
    await expect(trainerAsset).toContainText('2026-11-02'); await expect(trainerAsset).toContainText('In use');
    await page.reload(); await navigation(page, 'Asset inventory');
    await expect(row).toContainText('Priya Nair');
    const initialCount = (await (await page.request.get('/api/equipment')).json()).assets.length;
    await page.getByRole('button', { name: 'Add / assign equipment', exact: true }).click();
    await page.getByLabel('Equipment record', { exact: true }).selectOption('AST-2077');
    await page.getByLabel('Select employee / trainer', { exact: true }).selectOption('usr_priya');
    await page.getByRole('button', { name: 'Save equipment assignment', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await (await page.request.get('/api/equipment')).json()).assets.length).toBe(initialCount);
    await refresh(trainer.page);
    await expect(trainer.page.getByRole('row').filter({ hasText: 'TP-2077' })).toContainText('ThinkPad T14');
  } finally { await employee.context.close(); await trainer.context.close(); }
});

test('attendance-only ranking and charts match actual API data, support period selection and remain readable on mobile', async ({ page }) => {
  await signIn(page, 'john@excellium.com');
  await expect(page.locator('nav').getByRole('button', { name: 'Performance and rankings', exact: true })).toHaveCount(0);
  await navigation(page, 'Attendance ranking');
  const ranking = await (await page.request.get('/api/attendance/rankings?month=2026-11')).json();
  await page.getByLabel('Attendance month (UTC)', { exact: true }).fill('2026-11');
  const john = ranking.rows.find((row) => row.employee.id === 'usr_john');
  const row = page.getByRole('row').filter({ hasText: 'John Carter (you)' });
  await expect(row).toContainText(`${john.presentDays} / ${john.expectedDays}`);
  await expect(row).toContainText(`${john.attendanceRate.toFixed(1)}%`);
  await expect(page.locator('figure')).toHaveCount(1);
  await expect(page.locator('figure')).toContainText('fixed 0–100% scale');
  for (const department of ranking.departments) await expect(page.locator('figure')).toContainText(department.name);
  await page.screenshot({ path: '../.cache/attendance-ranking-desktop.png', fullPage: true });
  await page.getByLabel('Attendance month (UTC)', { exact: true }).fill('2026-10');
  await expect(page.getByText('2026-10-31', { exact: true })).toBeVisible();
  await expect(row).toContainText('Unranked');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('#workspace-sidebar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -264, 0)');
  await page.screenshot({ path: '../.cache/attendance-ranking-mobile.png', fullPage: true });
});
