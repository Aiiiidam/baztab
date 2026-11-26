import { stat } from 'node:fs/promises';
import type { Speaker } from '@prisma/client';
import { ANALYSIS_SCHEMA_VERSION, type AnalysisOutput } from '@/lib/validations/analysis';
import { probeMp3 } from '@/services/media.service';
import {
  TransientInferenceError,
  type AnalysisInput,
  type Analyzer,
  type InferenceEngine,
  type JobContext,
  type TranscriptionResult,
  type Transcriber,
} from './types';

/**
 * Deterministic fake inference for development, tests and synthetic staging
 * (INFERENCE_ENGINE=fake). It never looks at the audio content: the scenario
 * comes from the fixture's ID3 comment `baztab-fake:<scenario>`
 * (scripts/make-fixtures.mjs), otherwise from the file size. Each scenario is a
 * short Persian dialogue whose timestamps are spread over the real duration,
 * plus the structured analysis a good model would return for it.
 */

type Line = [Speaker, string];
type Script = { lines: Line[]; analysis: Omit<AnalysisOutput, 'schemaVersion'> | 'invalid' };

const s = (index: number) => `s${index}`;
const met = (explanation: string, ...evidence: number[]) => ({
  rating: 'MET' as const,
  explanation,
  evidence: evidence.map(s),
});

const SCRIPTS: Record<string, Script> = {
  standard: {
    lines: [
      ['AGENT', 'سلام، پشتیبانی امضای دیجیتال، بفرمایید.'],
      ['CUSTOMER', 'سلام، گواهی امضای من منقضی شده و نمی‌دانم چطور تمدیدش کنم.'],
      ['AGENT', 'گواهی برای شرکت ثبت شده یا شخصی است؟'],
      ['CUSTOMER', 'برای شرکت است.'],
      ['AGENT', 'درخواست تمدید را برایتان ثبت کردم؛ از منوی گواهی‌ها هم می‌توانید پیگیری کنید.'],
      ['CUSTOMER', 'بله، پیام تمدید آمد. ممنون.'],
    ],
    analysis: {
      reason: { text: 'تمدید گواهی امضای منقضی‌شده', evidence: [s(1)] },
      issues: [
        {
          summary: 'گواهی امضای شرکت منقضی شده بود',
          categoryKey: 'certificate_issue',
          outcome: 'RESOLVED',
          outcomeExplanation: 'درخواست تمدید ثبت شد و مشتری پیام تمدید را دریافت کرد.',
          evidence: [s(1)],
          outcomeEvidence: [s(4), s(5)],
        },
      ],
      scores: {
        UNDERSTANDING: met('کارشناس نوع گواهی را پرسید و مشکل را روشن کرد.', 2),
        CORRECT_ACTION: met('درخواست تمدید را درست ثبت کرد.', 4),
        CLEAR_CLOSURE: {
          rating: 'PARTLY_MET',
          explanation: 'نتیجه تأیید شد اما مسیر پیگیری فقط کوتاه گفته شد.',
          evidence: [s(4)],
        },
      },
    },
  },
  escalated: {
    lines: [
      ['AGENT', 'سلام، پشتیبانی امضای دیجیتال، در خدمتم.'],
      ['CUSTOMER', 'می‌خواهم قرارداد را امضا کنم ولی کد تأیید پیامکی برایم نمی‌آید.'],
      ['AGENT', 'شماره همراه ثبت‌شده همان شمارهٔ فعلی شماست؟ چند بار درخواست کد دادید؟'],
      ['CUSTOMER', 'بله همان است، سه بار درخواست دادم و پیامکی نیامد.'],
      ['AGENT', 'مشکل از سرویس پیامک است؛ موضوع را به تیم فنی ارجاع دادم.'],
      ['AGENT', 'تا دو ساعت دیگر با شما تماس می‌گیرند. تا آن زمان امضا ممکن نیست.'],
      ['CUSTOMER', 'باشه، منتظر تماس می‌مانم.'],
    ],
    analysis: {
      reason: { text: 'امضای قرارداد با کد تأیید پیامکی', evidence: [s(1)] },
      issues: [
        {
          summary: 'کد تأیید پیامکی برای امضا نمی‌رسد',
          categoryKey: 'otp_not_received',
          outcome: 'UNRESOLVED',
          outcomeExplanation: 'به تیم فنی ارجاع شد و مشتری هنوز نمی‌تواند امضا کند.',
          evidence: [s(1), s(3)],
          outcomeEvidence: [s(4), s(5)],
        },
      ],
      scores: {
        UNDERSTANDING: met('کارشناس شماره و تعداد درخواست‌ها را پرسید.', 2),
        CORRECT_ACTION: met('علت را تشخیص داد و به تیم فنی ارجاع داد.', 4),
        CLEAR_CLOSURE: met('گام بعدی و زمان تماس تیم فنی را روشن گفت.', 5),
      },
    },
  },
  multi: {
    lines: [
      ['AGENT', 'سلام، پشتیبانی امضای دیجیتال، بفرمایید.'],
      ['CUSTOMER', 'اول اینکه نمی‌توانم وارد حسابم بشوم.'],
      ['AGENT', 'رمز را بازنشانی کردم؛ الان دوباره امتحان کنید.'],
      ['CUSTOMER', 'وارد شدم. ولی وقتی سند را امضا می‌کنم خطا می‌دهد.'],
      ['AGENT', 'این خطا را همکاران فنی بررسی می‌کنند؛ برایتان تیکت ثبت کردم.'],
      ['CUSTOMER', 'باز هم از حساب بیرون پرید و وارد نمی‌شوم.'],
      ['AGENT', 'دوباره بازنشانی کردم و ورود درست شد. نتیجهٔ تیکت امضا پیامک می‌شود.'],
    ],
    analysis: {
      reason: { text: 'ورود به حساب و امضای سند', evidence: [s(1), s(3)] },
      issues: [
        {
          summary: 'ورود به حساب کاربری ممکن نبود',
          categoryKey: 'login_failed',
          outcome: 'RESOLVED',
          outcomeExplanation: 'با بازنشانی رمز ورود انجام شد.',
          evidence: [s(1)],
          outcomeEvidence: [s(2), s(3)],
        },
        {
          summary: 'امضای سند با خطا متوقف می‌شود',
          categoryKey: 'signing_failed',
          outcome: 'UNRESOLVED',
          outcomeExplanation: 'برای تیم فنی تیکت ثبت شد و مشکل باز ماند.',
          evidence: [s(3)],
          outcomeEvidence: [s(4)],
        },
        {
          summary: 'دوباره از حساب خارج شد و ورود ممکن نبود',
          categoryKey: 'login_failed',
          outcome: 'RESOLVED',
          outcomeExplanation: 'بازنشانی دوباره مشکل ورود را حل کرد.',
          evidence: [s(5)],
          outcomeEvidence: [s(6)],
        },
      ],
      scores: {
        UNDERSTANDING: {
          rating: 'PARTLY_MET',
          explanation: 'متن خطای امضا پرسیده نشد.',
          evidence: [s(4)],
        },
        CORRECT_ACTION: met('رمز را بازنشانی کرد و برای خطای امضا تیکت ثبت کرد.', 2, 4),
        CLEAR_CLOSURE: met('نتیجهٔ ورود را تأیید کرد و گفت پیگیری امضا پیامک می‌شود.', 6),
      },
    },
  },
  insufficient: {
    lines: [
      ['UNKNOWN', '… الو … صدا قطع و وصل می‌شود …'],
      ['UNKNOWN', '… سند … امضا نمی‌شه …'],
      ['UNKNOWN', '… قطع شد …'],
    ],
    analysis: {
      reason: { text: 'تماس دربارهٔ امضای سند (صدا نامفهوم است)', evidence: [s(1)] },
      issues: [
        {
          summary: 'احتمالاً مشکلی در امضای سند',
          categoryKey: 'signing_failed',
          outcome: 'UNKNOWN',
          outcomeExplanation: null,
          evidence: [],
          outcomeEvidence: [],
        },
      ],
      scores: {
        UNDERSTANDING: { rating: 'INSUFFICIENT_EVIDENCE', explanation: null, evidence: [] },
        // The model guessed from an unattributed segment; the validator downgrades it.
        CORRECT_ACTION: { rating: 'PARTLY_MET', explanation: 'نامشخص', evidence: [s(1)] },
        CLEAR_CLOSURE: { rating: 'INSUFFICIENT_EVIDENCE', explanation: null, evidence: [] },
      },
    },
  },
  uncategorized: {
    lines: [
      ['AGENT', 'سلام، پشتیبانی امضای دیجیتال.'],
      ['CUSTOMER', 'پرینتر بعد از امضا سند را چاپ نمی‌کند.'],
      ['AGENT', 'تنظیمات چاپ را با هم بررسی کردیم و درست شد.'],
      ['CUSTOMER', 'حالا چاپ می‌شود، ممنون.'],
    ],
    analysis: {
      reason: { text: 'چاپ سند امضاشده', evidence: [s(1)] },
      issues: [
        {
          summary: 'سند امضاشده چاپ نمی‌شود',
          categoryKey: 'printer_driver',
          outcome: 'RESOLVED',
          outcomeExplanation: 'با تغییر تنظیمات چاپ حل شد.',
          evidence: [s(1)],
          outcomeEvidence: [s(3)],
        },
      ],
      scores: {
        UNDERSTANDING: met('مشکل چاپ را روشن کرد.', 2),
        CORRECT_ACTION: met('تنظیمات چاپ را اصلاح کرد.', 2),
        CLEAR_CLOSURE: met('نتیجه را با مشتری تأیید کرد.', 2),
      },
    },
  },
  invalid: {
    lines: [
      ['AGENT', 'سلام، بفرمایید.'],
      ['CUSTOMER', 'سؤالی دربارهٔ صورت‌حساب داشتم.'],
    ],
    analysis: 'invalid',
  },
};
SCRIPTS.transient = SCRIPTS.standard;

const DEFAULT_ROTATION = ['standard', 'escalated', 'multi'] as const;
const MODEL = 'fake-asr@1';

async function scenarioFor(audioPath: string): Promise<string> {
  const { size } = await stat(audioPath);
  const media = await probeMp3(audioPath, size);
  const tagged = /^baztab-fake:([a-z]+)$/.exec(media.comment ?? '')?.[1];
  if (tagged === 'silent' || (tagged && SCRIPTS[tagged])) return tagged;
  return DEFAULT_ROTATION[size % DEFAULT_ROTATION.length];
}

export class FakeTranscriber implements Transcriber {
  readonly modelVersion = MODEL;

  async transcribe(audioPath: string, context: JobContext): Promise<TranscriptionResult> {
    const scenario = await scenarioFor(audioPath);
    if (scenario === 'transient' && context.attempt === 1) {
      throw new TransientInferenceError('fake transient failure on the first attempt');
    }
    if (scenario === 'silent') return { usableSpeech: false, segments: [] };

    const { size } = await stat(audioPath);
    const { durationMs } = await probeMp3(audioPath, size);
    const { lines } = SCRIPTS[scenario];
    const slot = Math.floor(durationMs / lines.length);
    return {
      usableSpeech: true,
      segments: lines.map(([speaker, text], index) => ({
        speaker,
        text,
        startMs: index * slot,
        endMs: Math.max(index * slot + 1, (index + 1) * slot - 20),
      })),
    };
  }
}

export class FakeAnalyzer implements Analyzer {
  readonly modelVersion = 'fake-analyzer@1';
  readonly promptVersion = 'fake-prompt@1';

  async analyze(input: AnalysisInput): Promise<unknown> {
    const texts = input.segments.map((segment) => segment.text).join('\n');
    const script = Object.values(SCRIPTS).find(
      (candidate) => candidate.lines.map(([, text]) => text).join('\n') === texts,
    );
    if (script?.analysis === 'invalid') {
      // Cites a segment that does not exist: the validator must refuse it.
      return {
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        reason: { text: 'صورت‌حساب', evidence: ['s99'] },
        issues: [],
        scores: {},
      };
    }
    if (script) return { schemaVersion: ANALYSIS_SCHEMA_VERSION, ...script.analysis };
    const insufficient = { rating: 'INSUFFICIENT_EVIDENCE', explanation: null, evidence: [] };
    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      reason: { text: input.segments[0]?.text.slice(0, 120) ?? 'نامشخص', evidence: ['s0'] },
      issues: [],
      scores: {
        UNDERSTANDING: insufficient,
        CORRECT_ACTION: insufficient,
        CLEAR_CLOSURE: insufficient,
      },
    };
  }
}

export function createFakeEngine(): InferenceEngine {
  return { transcriber: new FakeTranscriber(), analyzer: new FakeAnalyzer() };
}
