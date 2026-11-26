import { redirect } from 'next/navigation';

/** The landing page is the issue report (design scope: sign-in opens گزارش مشکلات). */
export default function HomePage() {
  redirect('/reports/issues');
}
