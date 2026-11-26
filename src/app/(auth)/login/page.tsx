import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  // A valid session goes straight on. A stale cookie stays here and is
  // overwritten on the next successful sign-in, so there is no redirect loop.
  const member = await getSession();
  if (member) redirect(member.mustChangePassword ? '/change-password' : '/reports/issues');

  return <LoginForm />;
}
