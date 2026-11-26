# Baztab — Phase 1 Design Scope

This design scope translates the current Persian HTML prototype and English product specification into screen and interaction requirements.

## Objective and users

Help digital signature support teams see which problems callers report most often and inspect the evidence behind the findings. Baztab analyzes manually uploaded Persian recordings, identifies the reason for the call, the issue and its outcome, and scores how the agent handled the call.

| User | Main tasks |
| --- | --- |
| Authorized support team member | Access the organization workspace, upload recordings, and check processing status. |
| Support manager or quality reviewer | Explore recurring issues, inspect transcripts and scores, and optionally correct individual calls. |

## Navigation and screen scope

| Screen | Content and interactions | Required states |
| --- | --- | --- |
| **ورود به بازتاب** | Password sign-in for allowlisted members. Enter **شناسه ملی سازمان**, **شماره همراه** and **رمز عبور**. On first sign-in with the initial password from the operator, the member must set **رمز عبور جدید** and **تکرار رمز عبور جدید** before entering the workspace. Show the password rules next to the field: at least 10 characters, using only English letters, English digits and symbols. If the member types a Persian character or Persian digit, show at once that the keyboard is set to Persian and that the password must be typed in English, on both the sign-in and change-password fields. A forgotten-password link explains that support issues a new initial password. Successful sign-in opens **گزارش مشکلات**. | Initial form, invalid identifier or number format, incorrect credentials (one generic message), too many attempts (try again later), initial password expired, password change required, new password not accepted, Persian characters in password, passwords do not match, signing in, access failure. |
| **گزارش مشکلات** | Show **تماس‌های تحلیل‌شده** and **گروه‌های مشکل** for the selected date range. Rank issues by the number of distinct calls. Selecting an issue opens **فهرست تماس‌ها** filtered to that issue and date range. | Data available, no analyzed calls in range, analyzed calls with no reportable issue, loading and report unavailable. |
| **فهرست تماس‌ها** | Show call ID, date, issue or filename, outcome, processing status, and optional review status. Mark dates taken from the upload with **تاریخ بارگذاری**. Allow search by call ID, filename, or issue and filtering by processing status. Keep the active issue filter visible and removable. | Calls available, empty library, no filter matches, loading and error. |
| **بارگذاری فایل‌های تماس** | From the workspace, upload one or more Persian MP3 recordings exported from the phone system (up to 50 files per batch and 10 MiB per file in the pilot). Show the selected file count. The call date comes from the filename, or the upload date when the filename has none. A file with any name, including Persian characters, spaces or no leading date, is accepted without an error or warning. Only its date label changes to **تاریخ بارگذاری**. Show each file's result separately: accepted, duplicate (skipped) or rejected. After submission, tell the member when results will be ready, for example «نتایج تا ساعت ۹ صبح فردا، ۱۴۰۵/۰۷/۲۸، آماده می‌شود». Files uploaded after midnight show the following day's date. On submission, show new records in the call list. | No selection, selected files, unsupported, empty, corrupt or oversized file, duplicate skipped, upload in progress, storage limit reached (uploads paused), submission failure and successful submission. |
| **جزئیات تماس** | Show **یافته‌های تماس**, **امتیاز تماس با هوش مصنوعی**, and **متن و فایل صوتی**. Timestamp links take the reviewer to the matching transcript segment and audio position where available. Back navigation restores the call list context. | Queued, processing, ready, failed with retry, failed with no usable speech (no retry), missing evidence, audio and transcript expired (findings and scores still shown), optional review and save feedback. |

The right-side navigation contains **گزارش مشکلات**, **فهرست تماس‌ها**, and **خروج**. The prototype’s **ورود به نسخه آزمایشی** button is a preview shortcut. In production, workspace access requires password sign-in by an allowlisted member.

## Call details

### Findings

| Label | What appears |
| --- | --- |
| **دلیل تماس** | What the caller wanted to accomplish or ask about. |
| **مشکل** | What blocked the caller or prompted the request. One call can contain multiple distinct issues. |
| **نتیجه تماس** | What happened by the end of the recording, shown per issue. Show a short explanation and link to evidence where available. |

| Outcome label | Meaning |
| --- | --- |
| **حل‌شده** | The recording shows that the issue was resolved. |
| **حل‌نشده** | The issue remained open at the end of the recording, including when it was escalated or handed to another team or specialist. |
| **نامشخص** | The recording provides insufficient evidence to determine the outcome. |

### Agent score

| Criterion | What the reviewer sees |
| --- | --- |
| **درک مشکل** | Whether the agent established what the customer was trying to do and what went wrong. |
| **اطلاعات یا اقدام درست** | Whether the agent gave correct information or took the correct action for the issue. |
| **پایان روشن تماس** | Whether the agent confirmed the result or clearly explained what would happen next. |

Each assessed criterion shows a rating, a short explanation, and timestamped evidence. Show **شواهد ناکافی** when a criterion cannot be assessed. Under the pilot scale, use **برآورده شد** (۲), **تا حدی برآورده شد** (۱), and **برآورده نشد** (۰). Show a total out of ۶ only when all three criteria can be assessed. Otherwise show **ناقص** and retain the individual ratings. After the audio and transcript expire, show the ratings, outcomes and categories only, without explanations or evidence links. Tell the member clearly in place of the transcript and player, for example «فایل صوتی، متن و توضیحات این تماس پس از ۱۰ روز حذف شده است. یافته‌ها و امتیازها باقی می‌مانند.» Before expiry, show on the call detail the date the recording will be removed.

Keep the call outcome in the findings panel and the closing score in the score panel. An escalated issue shows **حل‌نشده** as its outcome but can still receive full marks for **پایان روشن تماس** when the agent explains the handoff and next step.

### Transcript and optional review

- Show the Persian transcript with timestamps and speaker labels. Use **نامشخص** where the speaker cannot be identified.
- Highlight the selected evidence segment. When audio is available, seek to the same position.
- Make findings and scores available as soon as AI analysis is ready. Include eligible issue findings in the report automatically.
- Offer **تأیید بازبینی** and **ویرایش یافته‌ها و امتیازها** on individual calls. Save corrections with reviewer and time information. Update affected issue counts after a correction.
- Keep optional review status separate from processing status. A ready call has no mandatory review task, and the report has no reviewed-call KPI.

## Status and report behavior

| Processing state | User-facing behavior |
| --- | --- |
| **در صف** | Show that the recording has been received and is waiting for processing, with the expected ready time (۹ صبح and the Jalali date). |
| **در حال پردازش** | Show that analysis is underway, with the same expected ready time. |
| **آماده** | Show the available findings, transcript, scores, and evidence. |
| **ناموفق** | Explain the failed analysis. Offer **تلاش دوباره** for recoverable failures while the recording is still retained. Retry uses the same call record. A recording with no usable speech shows the reason without a retry. |

Count each eligible call once per issue within the selected date range. A finding is eligible when it has supporting evidence and a mapped issue category, whatever its outcome. A call with distinct issues can contribute to several groups. A separate follow-up call counts as another call. Findings with insufficient evidence or no category stay out of the ranking. Counts do not change when a call's audio and transcript expire. The analysis count covers completed calls in the range, including completed calls without a reportable issue.

## Persian layout and accessibility

- Use Persian and right-to-left layout throughout the product, including sample data, messages, reports, and AI findings. Display Persian numerals and Solar Hijri dates where applicable. Keep the specification in English.
- Accept Persian and Latin digits for identifiers, mobile numbers, and call ID search. Keep digit sequences, timestamps, and filenames readable in mixed-direction layouts. Preserve the original filename and transcript wording.
- On desktop, place findings and scores side by side and the transcript below. On narrow screens, stack the panels and keep filtering and playback usable.
- Use visible focus, explicit field labels, readable contrast, and status text alongside color. Announce sign-in, upload, and save errors in Persian near the corresponding action.

## Design handoff checks

1. Demonstrate first sign-in with an initial password and the forced password change, a later sign-in, a generic failure for wrong credentials, an expired initial password, and the Persian-keyboard message for a password.
2. Upload a batch that includes Persian filenames and names without a date, see the expected ready time, follow processing states, and retry a failure without creating a duplicate call.
3. Open a ranked issue and verify that the filtered call list explains its count.
4. Open an escalated call (outcome **حل‌نشده**) with a strong closing score and verify that the two values are easy to distinguish.
5. Verify that a completed call enters the report without review and that an optional correction updates the count.
6. Check empty, failed, no-usable-speech, incomplete-score, missing-audio and expired-audio states on desktop and mobile.

## Open design decisions

Settled by the [technical specification](tech-spec.md): outcomes are per issue with labels **حل‌شده**, **حل‌نشده** and **نامشخص**. Uploads are MP3 with the pilot limits above. Calls without a filename date show **تاریخ بارگذاری**. There is no shared batch date, because exports almost always start with a date. Access is password sign-in for operator-allowlisted members. Still open:

- Final Persian wording of the password rules and the forgotten-password message.

Later-phase candidates include automatic phone-system ingestion, live coaching, FAQ suggestions, and customer satisfaction analysis.

## References

- Baztab Persian HTML prototype (not yet in the repository; add it and link it here). It still shows the SMS sign-in and the old outcome and score labels.
- [Baztab English product specification](product-spec.md)
- [Baztab technical specification](tech-spec.md)
