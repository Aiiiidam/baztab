import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { t } from '../../src/lib/t';
import type { Credentials } from './operator';

export const AUDIO = path.join(__dirname, '..', 'fixtures', 'audio');
export const fixture = (name: string) => path.join(AUDIO, name);

/** The member provisioned by auth.setup.ts for this run. */
export function storedMember(): Credentials {
  return JSON.parse(readFileSync(path.join(__dirname, '..', '.auth', 'member.json'), 'utf8'));
}

type CallJson = { id: string; state: string; failureCode: string | null };

/** Poll GET /api/calls/:id until the call reaches `state` (the worker polls every second in e2e). */
export async function waitForState(
  request: APIRequestContext,
  callId: string,
  state: 'READY' | 'FAILED',
  timeoutMs = 60_000,
): Promise<CallJson> {
  let last: CallJson | null = null;
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/calls/${callId}`);
        last = (await response.json()) as CallJson;
        return last.state;
      },
      { timeout: timeoutMs, intervals: [500, 1000] },
    )
    .toBe(state);
  return last as unknown as CallJson;
}

/** Upload files through the upload dialog and wait until every row has a result. */
export async function uploadThroughDialog(page: Page, files: string[]) {
  await page.goto('/calls');
  await page.getByRole('button', { name: t('upload.open') }).click();
  await page.getByLabel(t('upload.inputLabel')).setInputFiles(files);
  await page.getByRole('button', { name: t('upload.submit') }).click();
  await expect(page.getByRole('button', { name: t('upload.close') })).toBeVisible({
    timeout: 60_000,
  });
}

/** Call IDs of the "view call" links in the upload results, in row order. */
export async function uploadedCallIds(page: Page): Promise<Record<string, string>> {
  const rows = page.getByTestId('upload-results').locator('li');
  const ids: Record<string, string> = {};
  for (const row of await rows.all()) {
    const name = (await row.locator('p').first().textContent())?.trim() ?? '';
    const link = row.getByRole('link');
    const href = (await link.count()) > 0 ? await link.getAttribute('href') : null;
    if (href) ids[name] = href.split('/').pop() as string;
  }
  return ids;
}
