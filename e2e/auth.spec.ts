import { expect, test } from '@playwright/test';
import { t } from '../src/lib/t';
import { changeInitialPassword, fillSignIn, logout } from './helpers/auth';
import {
  clearRateLimits,
  disconnect,
  E2E_ORG,
  expireInitialPassword,
  MEMBER_PASSWORD,
  provisionMember,
  randomMobile,
  resetMember,
} from './helpers/operator';

/** Design handoff check 1 (design scope) and the P1-07 sign-in rows of tech spec §12. */
test.describe('sign-in with an operator-issued initial password', () => {
  test.beforeAll(clearRateLimits);
  test.afterAll(disconnect);

  test('anonymous visitors are sent to /login', async ({ page }) => {
    await page.goto('/reports/issues');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: t('auth.login.title') })).toBeVisible();
  });

  test('first sign-in forces a password change, then later sign-ins go straight in', async ({
    page,
  }) => {
    const initial = provisionMember();
    await fillSignIn(page, initial);
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole('heading', { name: t('auth.changePassword.title') })).toBeVisible();
    await expect(page.getByText(t('password.rules'))).toBeVisible();

    // The restricted session reaches nothing else.
    await page.goto('/calls');
    await expect(page).toHaveURL(/\/change-password$/);

    // Persian keyboard warning appears while typing; mismatch is reported on the confirmation.
    const newPassword = page.getByLabel(t('auth.changePassword.newPassword'), { exact: true });
    await newPassword.fill('رمزجدید');
    await expect(page.getByTestId('persian-keyboard-warning')).toHaveText(
      t('password.keyboardWarning'),
    );
    await newPassword.fill(MEMBER_PASSWORD);
    await expect(page.getByTestId('persian-keyboard-warning')).toHaveCount(0);
    await page
      .getByLabel(t('auth.changePassword.confirmPassword'), { exact: true })
      .fill(`${MEMBER_PASSWORD}x`);
    await page.getByRole('button', { name: t('auth.changePassword.submit') }).click();
    await expect(page.getByText(t('password.errors.mismatch'))).toBeVisible();

    // Reusing the initial password is not accepted.
    await page
      .getByLabel(t('auth.changePassword.newPassword'), { exact: true })
      .fill(initial.password);
    await page
      .getByLabel(t('auth.changePassword.confirmPassword'), { exact: true })
      .fill(initial.password);
    await page.getByRole('button', { name: t('auth.changePassword.submit') }).click();
    await expect(page.getByText(t('password.errors.reusedInitial'))).toBeVisible();

    await changeInitialPassword(page);
    await expect(page.getByRole('heading', { level: 1, name: t('report.title') })).toBeVisible();

    await logout(page);
    await page.goto('/reports/issues');
    await expect(page).toHaveURL(/\/login$/);

    // The initial password no longer works; the new one opens the workspace directly.
    await fillSignIn(page, initial);
    await expect(page.getByTestId('login-error')).toHaveText(t('auth.errors.invalidCredentials'));
    await fillSignIn(page, { ...initial, password: MEMBER_PASSWORD });
    await page.waitForURL('/reports/issues');
  });

  test('wrong credentials and an unknown member get the same generic message', async ({ page }) => {
    const initial = provisionMember();
    await fillSignIn(page, { ...initial, password: 'Wrong-Password-1' });
    await expect(page.getByTestId('login-error')).toHaveText(t('auth.errors.invalidCredentials'));
    // The identifiers survive the round trip; the password does not.
    await expect(page.getByLabel(t('auth.login.mobile'))).toHaveValue(initial.mobile);
    await expect(page.getByLabel(t('auth.login.password'), { exact: true })).toHaveValue('');

    await fillSignIn(page, { ...initial, mobile: randomMobile() });
    await expect(page.getByTestId('login-error')).toHaveText(t('auth.errors.invalidCredentials'));
  });

  test('identifier format errors are shown next to the field', async ({ page }) => {
    await fillSignIn(page, { nationalId: '0013542419', mobile: '12345', password: 'x' });
    await expect(page.getByText(t('auth.errors.nationalIdInvalid'))).toBeVisible();
    await expect(page.getByText(t('auth.errors.mobileInvalid'))).toBeVisible();
  });

  test('Persian digits are accepted in the identifiers', async ({ page }) => {
    const initial = provisionMember();
    const toPersian = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    await fillSignIn(page, {
      nationalId: toPersian(initial.nationalId),
      mobile: toPersian(initial.mobile),
      password: initial.password,
    });
    await expect(page).toHaveURL(/\/change-password$/);
  });

  test('a Persian-keyboard password is flagged at once and on submit', async ({ page }) => {
    await page.goto('/login');
    const password = page.getByLabel(t('auth.login.password'), { exact: true });
    await password.fill('ثهسسصخقی');
    await expect(page.getByTestId('persian-keyboard-warning')).toBeVisible();
    await page.getByLabel(t('auth.login.nationalId')).fill(E2E_ORG.nationalId);
    await page.getByLabel(t('auth.login.mobile')).fill(randomMobile());
    await page.getByRole('button', { name: t('auth.login.submit') }).click();
    await expect(page.getByText(t('password.errors.persianLetters'))).toBeVisible();
  });

  test('an expired initial password explains that support issues a new one', async ({ page }) => {
    const initial = provisionMember();
    await expireInitialPassword(initial);
    await fillSignIn(page, initial);
    await expect(page.getByTestId('login-error')).toHaveText(
      t('auth.errors.initialPasswordExpired'),
    );

    // An operator reset issues a working initial password again.
    const reset = resetMember(initial);
    await fillSignIn(page, reset);
    await expect(page).toHaveURL(/\/change-password$/);
  });

  test('the forgotten-password link explains the support flow', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: t('auth.login.forgotPassword') }).click();
    await expect(page.getByText(t('auth.login.forgotPasswordHelp'))).toBeVisible();
  });

  test('repeated failures throttle the account with a retry time', async ({ page }) => {
    const initial = provisionMember();
    for (let attempt = 0; attempt < 5; attempt++) {
      await fillSignIn(page, { ...initial, password: `Wrong-Password-${attempt}` });
      await expect(page.getByTestId('login-error')).toHaveText(t('auth.errors.invalidCredentials'));
    }
    // Even the right password waits until the delay has passed.
    await fillSignIn(page, initial);
    await expect(page.getByTestId('login-error')).toHaveText(
      t('auth.errors.tooManyAttempts', { minutes: 1 }),
    );
  });

  test('a stale session cookie shows the sign-in page instead of looping', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: 'session', value: 'f'.repeat(64), domain: 'localhost', path: '/' },
    ]);
    const response = await page.goto('/login');
    expect(response?.status()).toBe(200);
    await page.goto('/calls');
    await expect(page).toHaveURL(/\/login$/);
  });
});
