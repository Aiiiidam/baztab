import { expect, test } from '@playwright/test';
import { t } from '../src/lib/t';
import { fillSignIn, changeInitialPassword } from './helpers/auth';
import {
  fixture,
  storedMember,
  uploadedCallIds,
  uploadThroughDialog,
  waitForState,
} from './helpers/calls';
import { disconnect, provisionMember, randomOrg } from './helpers/operator';

/**
 * The vertical slice of tech spec §12 step 2 and design handoff checks 2–6:
 * batch upload → worker → ready → report → drill-down → playback → review →
 * retry → isolation. Runs against the real dev server, worker and database.
 */
test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.afterAll(disconnect);

const ESCALATED = '20261020-escalated.mp3';
const PERSIAN = 'تماس پشتیبانی بدون تاریخ.mp3';
const ids: Record<string, string> = {};

test('a mixed batch gives one result per file and the expected ready time', async ({ page }) => {
  await uploadThroughDialog(page, [
    fixture(ESCALATED),
    fixture(PERSIAN),
    fixture('corrupt.mp3'),
    fixture('empty.mp3'),
    fixture('silence.mp3'),
    fixture('invalid-output.mp3'),
  ]);
  const results = page.getByTestId('upload-results');
  await expect(page.getByTestId('upload-selected')).toHaveText(
    t('upload.selected.other', { count: 6 }).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]),
  );
  await expect(results.locator('li[data-status="accepted"]')).toHaveCount(4);
  await expect(results.locator('li[data-status="rejected"]')).toHaveCount(2);
  await expect(results.getByText(t('upload.errors.invalid_media'))).toBeVisible();
  await expect(results.getByText(t('upload.errors.empty_file'))).toBeVisible();
  // Persian names and names without a date raise no warning; only results are shown.
  await expect(results.locator('li', { hasText: PERSIAN })).toHaveAttribute(
    'data-status',
    'accepted',
  );
  await expect(page.getByTestId('upload-ready-time')).toContainText('نتایج تا ساعت ۹ صبح');
  Object.assign(ids, await uploadedCallIds(page));
  expect(ids[ESCALATED]).toBeTruthy();

  // The same file again is skipped as a duplicate of the existing call.
  await page.getByRole('button', { name: t('upload.close') }).click();
  await uploadThroughDialog(page, [fixture(ESCALATED)]);
  await expect(
    page.getByTestId('upload-results').locator('li[data-status="duplicate"]'),
  ).toHaveCount(1);
  expect((await uploadedCallIds(page))[ESCALATED]).toBe(ids[ESCALATED]);
});

test('new calls appear in the list with the upload-date label for date-less names', async ({
  page,
}) => {
  await page.goto('/calls');
  const table = page.getByTestId('call-table');
  await expect(table.locator(`tr[data-call-id="${ids[PERSIAN]}"]`)).toContainText(
    t('calls.uploadDateLabel'),
  );
  await expect(table.locator(`tr[data-call-id="${ids[ESCALATED]}"]`)).toContainText('۱۴۰۵/۰۷/۲۸');
});

test('a queued call shows the ready time, then becomes ready with findings and scores', async ({
  page,
  request,
}) => {
  await page.goto(`/calls/${ids[ESCALATED]}`);
  // Either still waiting (with the ready time) or already processed by the fast worker.
  const pending = page.getByTestId('call-pending');
  if (await pending.isVisible()) await expect(pending).toContainText('نتایج تا ساعت ۹ صبح');

  await waitForState(request, ids[ESCALATED], 'READY');
  await page.reload();
  const findings = page.getByTestId('findings-panel');
  await expect(findings).toContainText('کد تأیید پیامکی نمی‌رسد');
  // Handoff check 4: escalated → حل‌نشده, yet a full closing score; the two stay apart.
  await expect(findings.locator('[data-outcome="UNRESOLVED"]')).toBeVisible();
  const scores = page.getByTestId('score-panel');
  await expect(scores.locator('[data-criterion="CLEAR_CLOSURE"]')).toHaveAttribute(
    'data-rating',
    'MET',
  );
  await expect(page.getByTestId('score-total')).toHaveText(t('score.total', { total: 6 }));
  await expect(page.getByTestId('removal-date')).toBeVisible();
});

test('an evidence timestamp highlights the segment and seeks the audio over Range', async ({
  page,
}) => {
  const ranges: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/calls/${ids[ESCALATED]}/audio`))
      ranges.push(response.status());
  });
  await page.goto(`/calls/${ids[ESCALATED]}`);
  await expect(page.getByTestId('call-audio')).toBeVisible();
  await page.getByTestId('findings-panel').getByTestId('seek-button').last().click();
  await expect(page.getByTestId('transcript').locator('li[data-active="true"]')).toHaveCount(1);
  await expect
    .poll(() => page.getByTestId('call-audio').evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0);
  expect(ranges.some((status) => status === 206 || status === 200)).toBe(true);

  const response = await page.request.get(`/api/calls/${ids[ESCALATED]}/audio`, {
    headers: { Range: 'bytes=0-99' },
  });
  expect(response.status()).toBe(206);
  expect(response.headers()['content-range']).toMatch(/^bytes 0-99\/\d+$/);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  const unsatisfiable = await page.request.get(`/api/calls/${ids[ESCALATED]}/audio`, {
    headers: { Range: 'bytes=999999999-' },
  });
  expect(unsatisfiable.status()).toBe(416);
});

test('no usable speech fails permanently without a retry', async ({ page, request }) => {
  const callId = ids['silence.mp3'];
  await waitForState(request, callId, 'FAILED');
  await page.goto(`/calls/${callId}`);
  await expect(page.getByTestId('call-failed')).toContainText(t('failure.no_usable_speech'));
  await expect(page.getByRole('button', { name: t('failure.retry') })).toHaveCount(0);
});

test('a recoverable failure can be retried and keeps the same call', async ({ page, request }) => {
  const callId = ids['invalid-output.mp3'];
  await waitForState(request, callId, 'FAILED', 90_000);
  await page.goto(`/calls/${callId}`);
  await expect(page.getByTestId('call-failed')).toContainText(t('failure.invalid_output'));
  const retry = page.getByRole('button', { name: t('failure.retry') });
  await retry.dblclick();
  await expect(page.getByText(t('failure.retryQueued')).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/calls/${callId}$`));
  // The fake model's output is always invalid, so it fails again — on the same record.
  await waitForState(request, callId, 'FAILED', 90_000);
  const list = await (await request.get('/api/calls?limit=100')).json();
  expect(list.items.filter((item: { id: string }) => item.id === callId)).toHaveLength(1);
});

test('the issue report ranks issues and its drill-down lists exactly the counted calls', async ({
  page,
  request,
}) => {
  await waitForState(request, ids[PERSIAN], 'READY');
  await page.goto('/reports/issues?from=2020-01-01&to=2030-12-31');
  await expect(page.getByTestId('kpi-analyzed')).toHaveText('۲');
  const ranks = page.getByTestId('issue-rank');
  await expect(ranks).toHaveCount(3);
  await expect(page.getByTestId('report-generated')).toBeVisible();

  const otp = ranks.filter({ hasText: 'کد تأیید پیامکی نمی‌رسد' });
  await expect(otp).toHaveAttribute('data-calls', '1');
  await otp.click();
  await expect(page).toHaveURL(/\/calls\?issue=/);
  await expect(page.getByTestId('active-filters')).toContainText('کد تأیید پیامکی نمی‌رسد');
  await expect(page.getByTestId('call-table').locator('tbody tr')).toHaveCount(1);

  // The issue filter is removable; back from the detail page restores the filtered list.
  await page.getByTestId('call-table').getByRole('link').first().click();
  await page.getByRole('link', { name: t('callDetail.back') }).click();
  await expect(page.getByTestId('active-filters')).toBeVisible();
  await page
    .getByRole('button', {
      name: t('calls.filter.remove', {
        label: t('calls.filter.issue', { label: 'کد تأیید پیامکی نمی‌رسد' }),
      }),
    })
    .click();
  await expect(page).not.toHaveURL(/issue=/);
});

test('an optional correction creates history and updates the report count', async ({ page }) => {
  await page.goto(`/calls/${ids[ESCALATED]}`);
  await expect(page.getByTestId('review-panel')).toContainText(t('review.status.notReviewed'));
  await page.getByRole('button', { name: t('review.edit') }).click();
  await page.getByRole('combobox', { name: `${t('review.categoryLabel')} ۱` }).click();
  await page.getByRole('option', { name: 'خطا یا کندی برنامه' }).click();
  await page.getByRole('button', { name: t('review.save') }).click();
  await expect(page.getByText(t('review.saved')).first()).toBeVisible();
  await expect(page.getByTestId('findings-panel')).toContainText('خطا یا کندی برنامه');
  await expect(page.getByTestId('findings-panel')).toContainText(t('findings.humanSet'));
  await page.getByText(t('review.history')).click();
  await expect(page.getByTestId('review-history')).toContainText('کد تأیید پیامکی نمی‌رسد');

  await page.goto('/reports/issues?from=2020-01-01&to=2030-12-31');
  const ranks = page.getByTestId('issue-rank');
  await expect(ranks.filter({ hasText: 'کد تأیید پیامکی نمی‌رسد' })).toHaveCount(0);
  await expect(ranks.filter({ hasText: 'خطا یا کندی برنامه' })).toHaveAttribute('data-calls', '1');

  // Confirming the review is separate and needs no change.
  await page.goto(`/calls/${ids[ESCALATED]}`);
  await page.getByRole('button', { name: t('review.confirm') }).click();
  await expect(page.getByTestId('review-panel')).toContainText(t('review.status.reviewed'));
});

test('another organization cannot see this one’s calls, audio, API or report', async ({
  browser,
}) => {
  // Same mobile number, different organization (tech spec §12 P1-07).
  const mine = storedMember();
  const other = provisionMember(randomOrg('سازمان دیگر'), mine.mobile);
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await fillSignIn(page, other);
  await changeInitialPassword(page);

  const callId = ids[ESCALATED];
  expect((await page.goto(`/calls/${callId}`))?.status()).toBe(404);
  expect((await page.request.get(`/api/calls/${callId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/calls/${callId}/audio`)).status()).toBe(404);
  const list = await (await page.request.get('/api/calls?limit=100')).json();
  expect(list.items).toHaveLength(0);
  const report = await (
    await page.request.get('/api/reports/issues?from=2020-01-01&to=2030-12-31')
  ).json();
  expect(report.analyzedCalls).toBe(0);

  // Unauthenticated and cross-origin requests are refused by the route handlers themselves.
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  expect((await anonymous.request.get(`/api/calls/${callId}/audio`)).status()).toBe(401);
  const crossOrigin = await page.request.post('/api/calls/uploads', {
    headers: { Origin: 'https://evil.example' },
    multipart: { file: { name: 'x.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('x') } },
  });
  expect(crossOrigin.status()).toBe(403);
  await anonymous.close();
  await context.close();
});
