/**
 * Issue taxonomy v0 — DRAFT categories for a digital-signature support line
 * (plan assumption A12). Stable keys; Persian labels. The support-approved
 * taxonomy (open decision D5) replaces this before the pilot; keys that
 * survive keep their meaning so historical findings stay comparable.
 */
export const TAXONOMY_VERSION = 'v0-draft';

export const TAXONOMY_V0 = [
  { key: 'otp_not_received', label: 'کد تأیید پیامکی نمی‌رسد' },
  { key: 'signing_failed', label: 'امضای سند انجام نمی‌شود' },
  { key: 'certificate_issue', label: 'صدور یا تمدید گواهی امضا' },
  { key: 'login_failed', label: 'ورود به حساب کاربری ممکن نیست' },
  { key: 'identity_verification', label: 'احراز هویت انجام نمی‌شود' },
  { key: 'document_upload', label: 'بارگذاری یا نمایش سند' },
  { key: 'payment_billing', label: 'پرداخت و صورت‌حساب' },
  { key: 'app_error', label: 'خطا یا کندی برنامه' },
  { key: 'how_to', label: 'راهنمایی در استفاده از امکانات' },
] as const;

export type TaxonomyKey = (typeof TAXONOMY_V0)[number]['key'];
