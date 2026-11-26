import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { signInAsNewMember } from './helpers/auth';
import { clearRateLimits, disconnect } from './helpers/operator';

const authDir = path.join(__dirname, '.auth');
const authFile = path.join(authDir, 'user.json');
export const memberFile = path.join(authDir, 'member.json');

setup('provision a member and sign in', async ({ page }) => {
  // With SKIP_AUTH=true the app serves a mock member and has no sign-in form,
  // so the stored state is simply an empty context (no database needed).
  if (process.env.SKIP_AUTH !== 'true') {
    await clearRateLimits();
    const member = await signInAsNewMember(page);
    // Specs in other worker processes read the run's organization from here.
    writeFileSync(memberFile, JSON.stringify(member));
    await disconnect();
  }
  await page.context().storageState({ path: authFile });
});
