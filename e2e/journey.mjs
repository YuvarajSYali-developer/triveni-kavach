// End-to-end smoke test of the main user journey against running services.
// Usage: node e2e/journey.mjs  (needs backend on :8000 with seeded demo data, frontend on :5173,
// DEMO_PASSWORD set to the password used when seeding, and Playwright available).
import { createRequire } from 'node:module';
// CommonJS require honours NODE_PATH, so a globally installed Playwright also works.
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const BASE = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const PASSWORD = process.env.DEMO_PASSWORD;
const SHOTS = process.env.SCREENSHOT_DIR ?? 'e2e/screenshots';
if (!PASSWORD) throw new Error('Set DEMO_PASSWORD');
mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '-', e.message.split('\n')[0]); }
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const dayOffset = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

async function login(email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${BASE}/dashboard`);
}
async function logout() { await page.getByRole('button', { name: /Sign out/ }).click(); await page.waitForURL(/login/); }
async function addRecord(tab, button, fill) {
  await page.getByRole('tab', { name: tab }).click();
  await page.getByRole('button', { name: button }).click();
  const dialog = page.getByRole('dialog');
  await fill(dialog);
  await dialog.getByRole('button', { name: 'Add record' }).click();
  await dialog.waitFor({ state: 'detached' });
}

let farmUrl;
await step('0. landing page renders and leads to sign-in', async () => {
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.getByText('Preview · sample values').waitFor();
  await shot('00-landing');
  await page.getByRole('link', { name: 'Sign in to the portal' }).click();
  await page.waitForURL(/\/login$/);
});
await step('1. backend health visible on login page', async () => {
  await page.goto(`${BASE}/login`);
  await page.getByText(/Backend connected · database ok/).waitFor();
  await shot('01-login');
});
await step('1b. wrong password rejected', async () => {
  await page.getByLabel('E-mail').fill('farmer.ravi@demo.triveni-kavach.example');
  await page.getByLabel('Password').fill('not-the-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Incorrect e-mail or password.').waitFor();
});
await step('2. farmer signs in and sees own dashboard', async () => {
  await login('farmer.ravi@demo.triveni-kavach.example');
  await page.getByText('My farm dashboard', { exact: true }).waitFor();
  await page.getByRole('heading', { name: /Good (morning|afternoon|evening), Ravi/ }).waitFor();
  await page.getByText('fictional demonstration records').waitFor();
  await page.getByText('Recorded mortality per week').waitFor();
  await shot('02-farmer-dashboard');
});
await step('3. create a farm', async () => {
  await page.getByRole('link', { name: 'Farms' }).click();
  await page.getByRole('button', { name: 'Register farm' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Farm name').fill('E2E Test Piggery');
  await d.getByLabel('Taluk').fill('Haveri');
  await d.getByLabel('Pigs').fill('-3');
  await d.getByRole('button', { name: 'Register farm' }).click();
  await d.getByText('Cannot be negative').waitFor(); // client-side validation
  await d.getByLabel('Pigs').fill('60');
  await d.getByRole('button', { name: 'Register farm' }).click();
  await page.getByRole('heading', { name: 'E2E Test Piggery' }).waitFor();
  farmUrl = page.url();
});
await step('3b. update the farm', async () => {
  await page.getByRole('button', { name: 'Edit farm' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Pigs').fill('80');
  await d.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Farm updated.').waitFor();
  await page.locator('text=Pigs').locator('..').getByText('80').waitFor();
});
await step('4. add vaccination records (one overdue)', async () => {
  await addRecord('Vaccinations', 'Add vaccination record', async (d) => {
    await d.getByLabel('Vaccine').fill('CSF vaccine (test)');
    await d.getByLabel('Animals covered').fill('80');
  });
  await addRecord('Vaccinations', 'Add vaccination record', async (d) => {
    await d.getByLabel('Status').selectOption('scheduled');
    await d.getByLabel('Vaccine').fill('CSF booster (test)');
    await d.getByLabel('Due date').fill(dayOffset(-3));
  });
  await page.getByText('Overdue').first().waitFor();
});
await step('5. record mortality (nil report + deaths)', async () => {
  for (const [d, n] of [[-20, 0], [-13, 0], [-1, 4]]) {
    await addRecord('Mortality', 'Add mortality record', async (dlg) => {
      await dlg.getByLabel('Date observed').fill(dayOffset(d));
      await dlg.getByLabel('Number of deaths').fill(String(n));
    });
  }
  await page.getByText('0 (nil report)').first().waitFor();
});
await step('6. hygiene inspection (fail) and visitor entry', async () => {
  await addRecord('Hygiene', 'Add hygiene inspection', async (d) => {
    for (const l of ['Shed cleaned', 'Disinfectant applied', 'Waste / carcasses disposed properly', 'Protective clothing available']) await d.getByLabel(l).check();
  });
  await page.getByRole('cell', { name: 'Fail', exact: true }).waitFor();
  await addRecord('Visitors', 'Add visitor entry', async (d) => {
    await d.getByLabel('Visitor name').fill('Feed supplier (test)');
    await d.getByLabel('Purpose').fill('Delivery');
    await d.getByLabel('Footwear changed / boot covers used').check();
  });
  await page.getByText('Incomplete').waitFor();
});
await step('8. environmental reading stored with source manual; simulated telemetry labelled', async () => {
  await addRecord('Environment', 'Add environmental reading', async (d) => {
    await d.getByLabel('Temperature (°C)').fill('27.5');
    await d.getByLabel('Relative humidity (%)').fill('64');
  });
  await page.getByRole('tabpanel').getByText('Manual').first().waitFor();
  await page.getByRole('button', { name: 'Simulate telemetry' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel(/Include an out-of-range excursion/).check();
  await d.getByRole('button', { name: 'Generate' }).click();
  await page.getByText(/This period contains simulated values/).waitFor();
  await page.getByRole('tabpanel').getByText('Simulated').first().waitFor();
  await shot('03-environment');
});
await step('7. run biosecurity assessment and review alerts', async () => {
  await page.getByRole('button', { name: 'Run biosecurity assessment' }).click();
  await page.getByText(/Assessment complete/).waitFor();
  await page.getByRole('tab', { name: /Overview/ }).click();
  await page.getByText('Scheduled vaccination overdue').first().waitFor();
  await page.getByText('Latest hygiene inspection failed').first().waitFor();
  await page.getByText(/not a probability of disease/).first().waitFor();
  await shot('04-farm-overview');
  // re-running must not duplicate alerts
  const before = await page.getByRole('button', { name: 'Acknowledge' }).count();
  await page.getByRole('button', { name: 'Run biosecurity assessment' }).click();
  await page.getByText(/0 new alert\(s\)/).waitFor();
  await page.getByRole('tab', { name: /Overview/ }).click();
  await page.getByText('Scheduled vaccination overdue').first().waitFor();
  const after = await page.getByRole('button', { name: 'Acknowledge' }).count();
  if (before !== after) throw new Error(`alert count changed ${before} -> ${after}`);
});
await step('7b. acknowledge an alert from the alerts page', async () => {
  await page.getByRole('link', { name: 'Alerts', exact: true }).click();
  await page.getByRole('heading', { name: 'Biosecurity alerts' }).waitFor();
  await page.getByRole('button', { name: 'Acknowledge' }).first().waitFor();
  const n = await page.getByRole('button', { name: 'Acknowledge' }).count();
  await page.getByRole('button', { name: 'Acknowledge' }).first().click();
  await page.waitForFunction((n) => document.querySelectorAll('button').length && [...document.querySelectorAll('button')].filter(b => b.textContent.includes('Acknowledge')).length === n - 1, n);
  if (await page.getByRole('button', { name: 'Resolve' }).count()) throw new Error('farmer should not see Resolve');
  await shot('05-alerts');
});
await step('10-11. pig screening returns model output and is stored', async () => {
  await page.getByRole('link', { name: 'Health screening' }).click();
  await page.getByText('Poultry — not supported').waitFor({ state: 'attached' });
  await page.getByLabel('Body temperature (°C)').fill('41');
  await page.getByLabel('Heart rate (beats/min)').fill('110');
  await page.getByLabel('Respiratory rate (breaths/min)').fill('40');
  await page.getByLabel(/Activity level/).fill('20');
  for (const s of ['Skin lesions', 'Fever chills', 'Lameness']) await page.getByLabel(s, { exact: true }).check();
  await page.getByRole('button', { name: 'Run screening' }).click();
  await page.getByText('Swine Erysipelas').first().waitFor();
  await page.getByText(/not a diagnosis/).first().waitFor();
  await page.getByRole('cell', { name: 'Swine Erysipelas' }).waitFor();
  await shot('06-screening');
});
await step('12. farmer cannot open another farmer\'s farm or admin pages', async () => {
  await page.goto(`${BASE}/farms/3`); // seeded farm owned by another farmer
  await page.getByText('Farm not found.').waitFor();
  await page.goto(`${BASE}/users`);
  await page.getByText('My farm dashboard', { exact: true }).waitFor();
  if (await page.getByRole('link', { name: 'Users' }).count()) throw new Error('Users link visible to farmer');
});
await step('9. admin dashboard uses backend data', async () => {
  await logout();
  await login('admin@demo.triveni-kavach.example');
  await page.getByText('Department dashboard', { exact: true }).waitFor();
  await page.getByText('Farms and active alerts by taluk').waitFor();
  await page.getByText('E2E Test Piggery').first().waitFor(); // follow-up list or activity feed
  await shot('07-admin-dashboard');
});
await step('7c. admin resolves an alert with a note', async () => {
  await page.getByRole('link', { name: 'Alerts', exact: true }).click();
  await page.getByRole('button', { name: 'Resolve' }).first().click();
  const d = page.getByRole('dialog');
  await d.getByRole('textbox').fill('Checked on site during e2e test');
  await d.getByRole('button', { name: 'Mark resolved' }).click();
  await d.waitFor({ state: 'detached' });
  await page.getByLabel('Status').selectOption('resolved');
  await page.getByText('Resolution: Checked on site during e2e test').waitFor();
});
await step('admin records an official notice; farm page shows it as an advisory', async () => {
  await page.getByRole('link', { name: 'Disease notices' }).click();
  await page.getByRole('button', { name: 'Add notice' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Disease (as named in the notice)').fill('E2E test disease');
  await d.getByLabel('Link to the official notice').fill('not-a-link');
  await d.getByLabel('Source (publishing authority)').fill('E2E test authority');
  await d.getByRole('button', { name: 'Save notice' }).click();
  await d.getByText(/Enter the full link/).waitFor(); // source link is mandatory and validated
  await d.getByLabel('Link to the official notice').fill('https://example.gov.in/e2e-notice');
  await d.getByRole('button', { name: 'Save notice' }).click();
  await d.waitFor({ state: 'detached' });
  await page.getByRole('cell', { name: 'E2E test disease' }).waitFor();
  await page.goto(farmUrl); // pig farm in Haveri district
  await page.getByText(/Official disease notice/).waitFor();
  await page.getByRole('link', { name: /E2E test authority/ }).waitFor();
  await shot('11-advisory');
});
await step('farm weather card shows live data or an honest error', async () => {
  await page.getByText('Local weather (live)').waitFor();
  await page.getByText(/Weather data by Open-Meteo|could not be reached|Live weather is disabled/).first().waitFor({ timeout: 15000 });
});
await step('admin enters an official statistic with source', async () => {
  await page.getByRole('link', { name: 'Livestock statistics' }).click();
  await page.getByRole('button', { name: 'Add figure' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('District').fill('E2E District');
  await d.getByLabel('Population').fill('4321');
  await d.getByLabel('Source publication').fill('E2E test census table');
  await d.getByLabel('Link to the source').fill('https://example.gov.in/census');
  await d.getByRole('button', { name: 'Save' }).click();
  await d.waitFor({ state: 'detached' });
  await page.getByRole('cell', { name: '4,321' }).waitFor();
  await page.getByRole('link', { name: /E2E test census table/ }).waitFor();
  await shot('12-statistics');
});
await step('admin users page and delete-confirmation', async () => {
  await page.getByRole('link', { name: 'Users' }).click();
  await page.getByRole('cell', { name: /Demo Farmer Ravi/ }).waitFor();
  await page.goto(farmUrl);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByText(/cannot be undone/).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
});
await step('veterinarian sees only assigned farms', async () => {
  await logout();
  await login('vet.kavya@demo.triveni-kavach.example');
  await page.getByText('Veterinarian dashboard', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Farms' }).click();
  await page.getByRole('link', { name: 'Demo Hilltop Layers' }).waitFor();
  if (await page.getByText('E2E Test Piggery').count()) throw new Error('vet sees unassigned farm');
  await shot('08-vet-farms');
});
await step('IoT concept page renders', async () => {
  await page.getByRole('link', { name: 'IoT concept' }).click();
  await page.getByText('Proposed future device contract').waitFor();
  await shot('09-iot');
});
await step('mobile layout renders', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await page.getByText('Veterinarian dashboard', { exact: true }).waitFor();
  await shot('10-mobile-dashboard');
});

await browser.close();
const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (consoleErrors.length) console.log('Browser console errors:', consoleErrors.slice(0, 5));
process.exit(failed.length ? 1 : 0);
