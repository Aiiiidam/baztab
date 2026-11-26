/**
 * Persian (fa-IR) UI strings.
 *
 * Flat, dot-namespaced keys grouped by screen. Plural strings come in
 * `<base>.one` / `<base>.other` pairs and are read through `tp()`.
 * Placeholders use `{name}` and are filled by `t()` / `tp()`; their names are
 * inferred from the text, so a missing param is a type error at the call site.
 */
export const fa = {
  // ── App shell ──────────────────────────────────────────────
  'shell.skipToContent': 'رفتن به محتوای اصلی',
  'shell.logoAlt': 'لوگو',
  'shell.openMenu': 'منوی ناوبری',
  'shell.expandSidebar': 'باز کردن منوی کناری',
  'shell.collapseSidebar': 'بستن منوی کناری',
  'shell.accountMenu': 'حساب کاربری',

  // ── Navigation (sidebar) ───────────────────────────────────
  'nav.menuTitle': 'منوی ناوبری',
  'nav.reports': 'گزارش مشکلات',
  'nav.calls': 'فهرست تماس‌ها',

  // ── Theme toggle ───────────────────────────────────────────
  'theme.switchToLight': 'حالت روشن',
  'theme.switchToDark': 'حالت تاریک',

  // ── Sign-in (ورود به بازتاب) ───────────────────────────────
  'auth.logout': 'خروج',
  'auth.login.title': 'ورود به بازتاب',
  'auth.login.subtitle': 'با شناسه ملی سازمان، شماره همراه و رمز عبور وارد شوید.',
  'auth.login.nationalId': 'شناسه ملی سازمان',
  'auth.login.mobile': 'شماره همراه',
  'auth.login.password': 'رمز عبور',
  'auth.login.showPassword': 'نمایش رمز عبور',
  'auth.login.hidePassword': 'پنهان کردن رمز عبور',
  'auth.login.submit': 'ورود',
  'auth.login.submitting': 'در حال ورود…',
  'auth.login.forgotPassword': 'رمز عبور را فراموش کرده‌اید؟',
  'auth.login.forgotPasswordHelp':
    'بازتاب رمز عبور را با پیامک یا ایمیل بازیابی نمی‌کند. با پشتیبانی بازتاب تماس بگیرید تا پس از تأیید هویت، رمز عبور اولیهٔ تازه‌ای برایتان صادر شود. با صدور رمز تازه، رمز قبلی و همهٔ نشست‌های باز شما از کار می‌افتد.',
  'auth.errors.invalidCredentials': 'شناسه ملی سازمان، شماره همراه یا رمز عبور درست نیست.',
  'auth.errors.tooManyAttempts':
    'تلاش‌های ناموفق زیاد است. {minutes} دقیقه دیگر دوباره امتحان کنید.',
  'auth.errors.initialPasswordExpired':
    'رمز عبور اولیهٔ شما منقضی شده است. برای دریافت رمز اولیهٔ تازه با پشتیبانی بازتاب تماس بگیرید.',
  'auth.errors.passwordChangeNotRequired': 'رمز عبور شما پیش‌تر تغییر کرده است.',
  'auth.errors.accessFailure': 'ورود ممکن نشد. چند لحظه بعد دوباره تلاش کنید.',
  'auth.errors.nationalIdRequired': 'شناسه ملی سازمان را وارد کنید',
  'auth.errors.nationalIdInvalid': 'شناسه ملی سازمان باید ۱۱ رقم معتبر باشد',
  'auth.errors.mobileRequired': 'شماره همراه را وارد کنید',
  'auth.errors.mobileInvalid': 'شماره همراه معتبر نیست؛ مانند ۰۹۱۲۳۴۵۶۷۸۹',

  // ── Forced password change ─────────────────────────────────
  'auth.changePassword.title': 'تعیین رمز عبور جدید',
  'auth.changePassword.description':
    'رمز عبوری که پشتیبانی به شما داده، فقط برای اولین ورود است. برای ادامه، رمز عبور جدیدی انتخاب کنید.',
  'auth.changePassword.newPassword': 'رمز عبور جدید',
  'auth.changePassword.confirmPassword': 'تکرار رمز عبور جدید',
  'auth.changePassword.submit': 'ذخیره و ورود',
  'auth.changePassword.submitting': 'در حال ذخیره…',

  // ── Password policy (sign-in and change-password) ──────────
  'password.rules':
    'دست‌کم ۱۰ نویسه، فقط با حروف انگلیسی، رقم‌های انگلیسی و نمادها (مانند ! @ # -)',
  'password.keyboardWarning': 'صفحه‌کلید روی فارسی است. رمز عبور را با صفحه‌کلید انگلیسی بنویسید.',
  'password.errors.tooShort': 'رمز عبور باید دست‌کم {min} نویسه باشد',
  'password.errors.tooLong': 'رمز عبور حداکثر {max} نویسه است',
  'password.errors.persianLetters':
    'رمز عبور حروف فارسی دارد. صفحه‌کلید را انگلیسی کنید و دوباره بنویسید.',
  'password.errors.persianDigits':
    'رمز عبور رقم فارسی دارد. صفحه‌کلید را انگلیسی کنید و رقم‌ها را دوباره بنویسید.',
  'password.errors.nonAscii':
    'رمز عبور فقط می‌تواند حروف انگلیسی، رقم‌های انگلیسی و نمادهای استاندارد داشته باشد',
  'password.errors.matchesIdentifier':
    'رمز عبور نباید با شناسه ملی سازمان یا شماره همراه یکسان باشد',
  'password.errors.common': 'این رمز عبور رایج و حدس‌زدنی است. رمز دیگری انتخاب کنید.',
  'password.errors.mismatch': 'تکرار رمز عبور با رمز عبور جدید یکسان نیست',
  'password.errors.reusedInitial':
    'رمز عبور جدید نباید همان رمز اولیه باشد. رمز دیگری انتخاب کنید.',

  // ── Issue report (گزارش مشکلات) ───────────────────────────
  'report.title': 'گزارش مشکلات',

  // ── Call list (فهرست تماس‌ها) ─────────────────────────────
  'calls.title': 'فهرست تماس‌ها',

  // ── Call detail (جزئیات تماس) ─────────────────────────────
  'callDetail.title': 'جزئیات تماس',

  // ── Validation (zod messages, shared by server and client) ─
  'validation.required': 'این فیلد الزامی است',
  'validation.invalid': 'ورودی نامعتبر است',
  'validation.passwordRequired': 'رمز عبور را وارد کنید',

  // ── Generic action errors ──────────────────────────────────
  'errors.unexpected': 'خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.',
  'errors.notFound': 'موردی یافت نشد',

  // ── Error boundary ─────────────────────────────────────────
  'error.title': 'خطایی رخ داد',
  'error.description': 'مشکلی در بارگذاری این صفحه پیش آمده است. لطفاً دوباره تلاش کنید.',
  'error.code': 'کد خطا: {digest}',
  'error.retry': 'تلاش مجدد',

  // ── Not found ──────────────────────────────────────────────
  'notFound.code': '۴۰۴',
  'notFound.title': 'صفحه یافت نشد',
  'notFound.description': 'صفحه‌ای که به دنبال آن هستید وجود ندارد یا منتقل شده است.',
  'notFound.backHome': 'بازگشت به گزارش مشکلات',

  // ── UI primitives ──────────────────────────────────────────
  'ui.close': 'بستن',
  'ui.loading': 'در حال بارگذاری',
  'ui.pagination.label': 'صفحه‌بندی',
  'ui.pagination.previous': 'قبلی',
  'ui.pagination.next': 'بعدی',
  'ui.pagination.morePages': 'صفحات بیشتر',
  'ui.itemCount.one': '{count} مورد',
  'ui.itemCount.other': '{count} مورد',
  'ui.datePicker.placeholder': 'انتخاب تاریخ',
  'ui.datePicker.rangePlaceholder': 'انتخاب بازهٔ زمانی',
  'ui.datePicker.rangeLabel': '{from} تا {to}',
} as const;
