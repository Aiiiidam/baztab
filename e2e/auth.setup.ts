import path from 'node:path';
import { test as setup } from '@playwright/test';
import { signInAsNewMember } from './helpers/auth';
import { clearRateLimits, disconnect } from './helpers/operator';

const authFile = path.join(__dirname, '.auth/user.json');

setup('provision a member and sign in', async ({ page }) => {
  // With SKIP_AUTH=true the app serves a mock member and has no sign-in form,
  // so the stored state is simply an empty context (no database needed).
  if (process.env.SKIP_AUTH !== 'true') {
    await clearRateLimits();
    await signInAsNewMember(page);
    await disconnect();
  }
  await page.context().storageState({ path: authFile });
});
