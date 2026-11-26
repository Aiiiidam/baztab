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
  'report.subtitle': 'مشکلات گزارش‌شده در تماس‌ها، به ترتیب تعداد تماس‌های متمایز',
  'report.range': 'بازهٔ زمانی',
  'report.rangeLabel': '{from} تا {to}',
  'report.analyzedCalls': 'تماس‌های تحلیل‌شده',
  'report.issueGroups': 'گروه‌های مشکل',
  'report.callsWithIssues': '{count} تماس دست‌کم یک مشکل قابل گزارش دارد',
  'report.generatedAt': 'زمان تهیهٔ گزارش: {time}',
  'report.ranking': 'رتبه‌بندی مشکلات',
  'report.rank': 'رتبهٔ {rank}',
  'report.callCount.one': '{count} تماس',
  'report.callCount.other': '{count} تماس',
  'report.share': '{percent} از تماس‌های تحلیل‌شده',
  'report.openCalls': 'مشاهدهٔ تماس‌های «{label}»',
  'report.countNote':
    'هر تماس برای هر مشکل یک بار شمرده می‌شود؛ یک تماس می‌تواند در چند گروه باشد. تماس‌های پیگیری جداگانه شمرده می‌شوند.',
  'report.empty.noCalls.title': 'در این بازه تماس تحلیل‌شده‌ای نیست',
  'report.empty.noCalls.description':
    'بازهٔ زمانی را تغییر دهید یا فایل‌های تماس را در «فهرست تماس‌ها» بارگذاری کنید.',
  'report.empty.noIssues.title': 'تماس‌های این بازه مشکل قابل گزارشی ندارند',
  'report.empty.noIssues.description':
    'تماس‌ها تحلیل شده‌اند، اما هیچ مشکلی با شواهد و دسته‌بندی مشخص پیدا نشد.',
  'report.unavailable.title': 'گزارش در دسترس نیست',
  'report.unavailable.description': 'تهیهٔ گزارش ممکن نشد. چند لحظه بعد دوباره تلاش کنید.',
  'report.goToCalls': 'رفتن به فهرست تماس‌ها',

  // ── Call list (فهرست تماس‌ها) ─────────────────────────────
  'calls.title': 'فهرست تماس‌ها',
  'calls.subtitle': 'تماس‌های بارگذاری‌شده، وضعیت پردازش و نتیجهٔ هر تماس',
  'calls.column.ref': 'شناسه تماس',
  'calls.column.date': 'تاریخ',
  'calls.column.issue': 'مشکل یا نام فایل',
  'calls.column.outcome': 'نتیجه',
  'calls.column.state': 'وضعیت پردازش',
  'calls.column.review': 'بازبینی',
  'calls.uploadDateLabel': 'تاریخ بارگذاری',
  'calls.search.label': 'جست‌وجو',
  'calls.search.placeholder': 'شناسه تماس، نام فایل یا مشکل',
  'calls.search.submit': 'جست‌وجو',
  'calls.filter.state': 'وضعیت پردازش',
  'calls.filter.allStates': 'همهٔ وضعیت‌ها',
  'calls.filter.issue': 'مشکل: {label}',
  'calls.filter.range': 'بازه: {from} تا {to}',
  'calls.filter.remove': 'حذف فیلتر {label}',
  'calls.filter.clear': 'پاک کردن همهٔ فیلترها',
  'calls.empty.title': 'هنوز تماسی بارگذاری نشده است',
  'calls.empty.description':
    'فایل‌های MP3 تماس‌ها را از سامانهٔ تلفن خروجی بگیرید و با دکمهٔ «بارگذاری فایل‌های تماس» اضافه کنید.',
  'calls.noMatch.title': 'تماسی با این فیلترها پیدا نشد',
  'calls.noMatch.description': 'عبارت جست‌وجو یا فیلترها را تغییر دهید.',
  'calls.error.title': 'فهرست تماس‌ها بارگذاری نشد',
  'calls.error.description': 'دوباره تلاش کنید. اگر مشکل ادامه داشت با پشتیبانی تماس بگیرید.',
  'calls.loadMore': 'نمایش تماس‌های بیشتر',
  'calls.backToFirst': 'بازگشت به ابتدای فهرست',
  'calls.openCall': 'باز کردن تماس {ref}',
  'calls.count.one': '{count} تماس',
  'calls.count.other': '{count} تماس',
  'calls.drillDown': '{count} تماس با این مشکل در این بازه',

  // ── Processing states ──────────────────────────────────────
  'callState.QUEUED': 'در صف',
  'callState.PROCESSING': 'در حال پردازش',
  'callState.READY': 'آماده',
  'callState.FAILED': 'ناموفق',
  'callState.UPLOADING': 'در حال بارگذاری',
  'callState.queuedDescription': 'فایل دریافت شده و در صف پردازش است.',
  'callState.processingDescription': 'تحلیل این تماس در جریان است.',
  'callState.stage.transcribing': 'در حال تبدیل گفتار به متن',
  'callState.stage.analyzing': 'در حال تحلیل یافته‌ها و امتیازها',
  'readyAt.tomorrow': 'نتایج تا ساعت ۹ صبح فردا، {date}، آماده می‌شود',
  'readyAt.today': 'نتایج تا ساعت ۹ صبح امروز، {date}، آماده می‌شود',
  'readyAt.date': 'نتایج تا ساعت ۹ صبح {date} آماده می‌شود',
  'readyAt.overdue':
    'پردازش این تماس بیش از زمان پیش‌بینی‌شده (ساعت ۹ صبح {date}) طول کشیده است. تیم بازتاب در جریان است.',

  // ── Failure reasons (stable codes from the worker) ─────────
  'failure.no_usable_speech':
    'در این فایل گفتار فارسی قابل استفاده‌ای پیدا نشد (سکوت، موسیقی یا زبان دیگر). این تماس دوباره پردازش نمی‌شود.',
  'failure.invalid_output': 'تحلیل خودکار نتیجهٔ معتبری نداد. می‌توانید دوباره تلاش کنید.',
  'failure.transient_failure': 'پردازش به دلیل خطای موقت متوقف شد. می‌توانید دوباره تلاش کنید.',
  'failure.recording_missing': 'فایل صوتی این تماس در دسترس نیست و پردازش ممکن نشد.',
  'failure.recording_expired':
    'مهلت نگهداری فایل صوتی پیش از پایان پردازش تمام شد و تحلیل ممکن نشد.',
  'failure.unknown': 'پردازش این تماس ناموفق بود.',
  'failure.retry': 'تلاش دوباره',
  'failure.retrying': 'در حال ثبت درخواست…',
  'failure.retryQueued': 'درخواست پردازش دوباره ثبت شد.',
  'failure.retryNotAllowed': 'این تماس قابل پردازش دوباره نیست.',

  // ── Upload (بارگذاری فایل‌های تماس) ───────────────────────
  'upload.open': 'بارگذاری فایل‌های تماس',
  'upload.title': 'بارگذاری فایل‌های تماس',
  'upload.description':
    'فایل‌های MP3 خروجی سامانهٔ تلفن را انتخاب کنید (حداکثر {files} فایل در هر نوبت و هر فایل تا {size} مگابایت). تاریخ تماس از ابتدای نام فایل خوانده می‌شود و اگر نام فایل تاریخ نداشته باشد، تاریخ بارگذاری ثبت می‌شود.',
  'upload.choose': 'انتخاب فایل‌ها',
  'upload.inputLabel': 'فایل‌های MP3 تماس',
  'upload.noSelection': 'هنوز فایلی انتخاب نشده است.',
  'upload.selected.one': '{count} فایل انتخاب شد',
  'upload.selected.other': '{count} فایل انتخاب شد',
  'upload.tooMany': 'در هر نوبت حداکثر {max} فایل قابل بارگذاری است. تعداد انتخاب را کم کنید.',
  'upload.submit': 'ارسال',
  'upload.submitting': 'در حال ارسال…',
  'upload.progress': '{done} از {total} فایل ارسال شد',
  'upload.close': 'پایان',
  'upload.chooseOthers': 'انتخاب فایل‌های دیگر',
  'upload.summary': '{accepted} پذیرفته، {duplicate} تکراری، {rejected} ردشده',
  'upload.status.pending': 'در انتظار ارسال',
  'upload.status.uploading': 'در حال ارسال',
  'upload.status.accepted': 'پذیرفته شد',
  'upload.status.duplicate': 'تکراری؛ نادیده گرفته شد',
  'upload.status.rejected': 'رد شد',
  'upload.status.in_progress': 'همین فایل در حال بارگذاری است',
  'upload.status.skipped': 'ارسال نشد',
  'upload.duplicateOf': 'این فایل پیش‌تر بارگذاری شده است.',
  'upload.viewCall': 'مشاهدهٔ تماس',
  'upload.errors.too_large': 'حجم فایل بیش از {size} مگابایت است.',
  'upload.errors.empty_file': 'فایل خالی است.',
  'upload.errors.unsupported_type': 'فقط فایل MP3 پذیرفته می‌شود.',
  'upload.errors.invalid_media': 'فایل خراب است یا MP3 معتبری نیست.',
  'upload.errors.storage_limit':
    'فضای ذخیره‌سازی پر است و بارگذاری فعلاً متوقف شده است. با پشتیبانی بازتاب تماس بگیرید.',
  'upload.errors.inactive_access': 'دسترسی سازمان شما فعال نیست.',
  'upload.errors.transient_failure': 'ذخیرهٔ فایل ممکن نشد. دوباره تلاش کنید.',
  'upload.errors.network': 'ارسال ناموفق بود. اتصال را بررسی کنید و دوباره تلاش کنید.',
  'upload.errors.session': 'نشست شما پایان یافته است. دوباره وارد شوید.',
  'upload.storagePaused':
    'بارگذاری متوقف شد: فضای ذخیره‌سازی پر است. فایل‌های باقی‌مانده ارسال نشدند.',

  // ── Call detail (جزئیات تماس) ─────────────────────────────
  'callDetail.title': 'جزئیات تماس',
  'callDetail.back': 'بازگشت به فهرست تماس‌ها',
  'callDetail.ref': 'شناسه تماس {ref}',
  'callDetail.filename': 'نام فایل',
  'callDetail.date': 'تاریخ تماس',
  'callDetail.acceptedAt': 'زمان بارگذاری',
  'callDetail.duration': 'مدت',
  'callDetail.removalDate': 'فایل صوتی و متن این تماس در {date} حذف می‌شود.',
  'callDetail.expired':
    'فایل صوتی، متن و توضیحات این تماس پس از {days} روز حذف شده است. یافته‌ها و امتیازها باقی می‌مانند.',
  'callDetail.notFound': 'این تماس پیدا نشد.',

  // ── Findings (یافته‌های تماس) ─────────────────────────────
  'findings.title': 'یافته‌های تماس',
  'findings.reason': 'دلیل تماس',
  'findings.issues': 'مشکل',
  'findings.outcome': 'نتیجه تماس',
  'findings.noIssues': 'در این تماس مشکل مشخصی گزارش نشده است.',
  'findings.uncategorized': 'بدون دسته‌بندی',
  'findings.notInReport': 'در گزارش شمرده نمی‌شود',
  'findings.notInReport.noCategory': 'دسته‌ای برای این مشکل تعیین نشده است.',
  'findings.notInReport.noEvidence': 'شاهدی در متن تماس برای این مشکل پیدا نشد.',
  'findings.missingEvidence': 'شاهد متنی در دسترس نیست',
  'findings.evidence': 'شواهد',
  'findings.humanSet': 'اصلاح‌شده توسط بازبین',
  'findings.expiredText': 'توضیح این یافته پس از پایان مهلت نگهداری حذف شده است.',
  'findings.pending': 'یافته‌ها پس از پایان پردازش نمایش داده می‌شوند.',
  'outcome.RESOLVED': 'حل‌شده',
  'outcome.UNRESOLVED': 'حل‌نشده',
  'outcome.UNKNOWN': 'نامشخص',

  // ── AI score (امتیاز تماس با هوش مصنوعی) ──────────────────
  'score.title': 'امتیاز تماس با هوش مصنوعی',
  'score.criterion.UNDERSTANDING': 'درک مشکل',
  'score.criterion.CORRECT_ACTION': 'اطلاعات یا اقدام درست',
  'score.criterion.CLEAR_CLOSURE': 'پایان روشن تماس',
  'score.criterionHint.UNDERSTANDING':
    'آیا کارشناس روشن کرد مشتری چه می‌خواست و چه مشکلی پیش آمده بود؟',
  'score.criterionHint.CORRECT_ACTION':
    'آیا کارشناس اطلاعات درست داد یا اقدام درست را برای این مشکل انجام داد؟',
  'score.criterionHint.CLEAR_CLOSURE':
    'آیا کارشناس نتیجه را تأیید کرد یا گام بعدی را روشن توضیح داد؟',
  'score.rating.MET': 'برآورده شد',
  'score.rating.PARTLY_MET': 'تا حدی برآورده شد',
  'score.rating.NOT_MET': 'برآورده نشد',
  'score.rating.INSUFFICIENT_EVIDENCE': 'شواهد ناکافی',
  'score.points': '{points} از ۲',
  'score.total': 'مجموع: {total} از ۶',
  'score.incomplete': 'ناقص',
  'score.incompleteHint': 'مجموع فقط وقتی نمایش داده می‌شود که هر سه معیار ارزیابی شده باشند.',
  'score.independentHint': 'امتیاز رفتار کارشناس مستقل از نتیجهٔ مشکل است.',
  'score.pending': 'امتیازها پس از پایان پردازش نمایش داده می‌شوند.',

  // ── Transcript (متن و فایل صوتی) ─────────────────────────
  'transcript.title': 'متن و فایل صوتی',
  'transcript.speaker.AGENT': 'کارشناس',
  'transcript.speaker.CUSTOMER': 'مشتری',
  'transcript.speaker.UNKNOWN': 'نامشخص',
  'transcript.empty': 'متنی برای این تماس ثبت نشده است.',
  'transcript.pending': 'متن تماس پس از پایان پردازش نمایش داده می‌شود.',
  'transcript.segment': 'بخش {index} از متن تماس',

  // ── Optional review (بازبینی) ─────────────────────────────
  'review.status.reviewed': 'بازبینی‌شده',
  'review.status.notReviewed': 'بازبینی نشده (اختیاری)',
  'review.confirm': 'تأیید بازبینی',
  'review.confirmed': 'بازبینی در {date} توسط {who} تأیید شد.',
  'review.edit': 'ویرایش یافته‌ها و امتیازها',
  'review.editTitle': 'ویرایش یافته‌ها و امتیازها',
  'review.editDescription':
    'تغییرات به‌صورت نسخهٔ جدید ذخیره می‌شود و نسخهٔ قبلی و سابقهٔ تغییر حفظ می‌شود.',
  'review.save': 'ذخیرهٔ تغییرات',
  'review.saving': 'در حال ذخیره…',
  'review.cancel': 'انصراف',
  'review.saved': 'تغییرات ذخیره شد و گزارش به‌روز شد.',
  'review.confirmedToast': 'بازبینی تأیید شد.',
  'review.noChanges': 'تغییری برای ذخیره وجود ندارد.',
  'review.stale':
    'این تماس در این فاصله توسط عضو دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید و دوباره تلاش کنید.',
  'review.reload': 'بارگذاری دوباره',
  'review.notEditable': 'این تماس هنوز نتیجهٔ آماده‌ای برای بازبینی ندارد.',
  'review.history': 'سابقهٔ بازبینی',
  'review.historyEmpty': 'تاکنون تغییری ثبت نشده است.',
  'review.historyEntry': '{who}، {date}: {field} از «{from}» به «{to}»',
  'review.historyConfirm': '{who}، {date}: بازبینی تأیید شد',
  'review.field.category': 'دستهٔ مشکل {index}',
  'review.field.outcome': 'نتیجهٔ مشکل {index}',
  'review.field.score': 'امتیاز «{criterion}»',
  'review.memberLabel': 'عضو {mobile}',
  'review.value.none': 'بدون دسته',
  'review.categoryLabel': 'دسته',
  'review.outcomeLabel': 'نتیجه',

  // ── Audio and transcript ───────────────────────────────────
  'audio.label': 'پخش فایل صوتی تماس',
  'audio.unavailable': 'فایل صوتی این تماس در دسترس نیست.',
  'audio.loadError': 'پخش فایل صوتی ممکن نشد. صفحه را دوباره بارگذاری کنید.',
  'audio.seekTo': 'پخش از {time}',

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
