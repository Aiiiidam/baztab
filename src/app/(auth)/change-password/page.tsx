import { redirect } from 'next/navigation';
import { requireSessionForPasswordChange } from '@/lib/auth';
import { ChangePasswordForm } from './change-password-form';

/** Forced replacement of the operator-issued initial password (tech spec §4.3). */
export default async function ChangePasswordPage() {
  const member = await requireSessionForPasswordChange();
  if (!member.mustChangePassword) redirect('/reports/issues');

  return <ChangePasswordForm />;
}
