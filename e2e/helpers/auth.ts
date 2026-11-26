import { expect, type Page } from '@playwright/test';
import { t } from '../../src/lib/t';
import { MEMBER_PASSWORD, provisionMember, type Credentials, E2E_ORG } from './operator';

/** Fill the sign-in form and submit. Does not wait for navigation. */
export async function fillSignIn(page: Page, credentials: Credentials) {
  await page.goto('/login');
  await page.getByLabel(t('auth.login.nationalId')).fill(credentials.nationalId);
  await page.getByLabel(t('auth.login.mobile')).fill(credentials.mobile);
  await page.getByLabel(t('auth.login.password'), { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: t('auth.login.submit') }).click();
}

/** Complete the forced change on /change-password. */
export async function changeInitialPassword(page: Page, password = MEMBER_PASSWORD) {
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel(t('auth.changePassword.newPassword'), { exact: true }).fill(password);
  await page.getByLabel(t('auth.changePassword.confirmPassword'), { exact: true }).fill(password);
  await page.getByRole('button', { name: t('auth.changePassword.submit') }).click();
  await page.waitForURL('/reports/issues');
}

/** Provision a fresh member, sign in, replace the initial password; returns the final credentials. */
export async function signInAsNewMember(page: Page, org = E2E_ORG): Promise<Credentials> {
  const initial = provisionMember(org);
  await fillSignIn(page, initial);
  await changeInitialPassword(page);
  return { ...initial, password: MEMBER_PASSWORD };
}

/** Sign out through the header account menu. */
export async function logout(page: Page) {
  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: t('auth.logout') }).click();
  await page.waitForURL('/login');
}
