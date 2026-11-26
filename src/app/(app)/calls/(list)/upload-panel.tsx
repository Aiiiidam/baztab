'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleCheck, CircleX, Copy, FileAudio, LoaderCircle, Upload } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Progress,
} from '@/components/UiComponents';
import { readyTimeMessage } from '@/lib/ready-time';
import { t, tp } from '@/lib/t';
import { toLocaleDigits } from '@/lib/persian';
import { cn } from '@/lib/utils';

/**
 * بارگذاری فایل‌های تماس (design scope, tech spec §6, plan M2-T7 / M5-T1).
 * Each file is posted on its own to /api/calls/uploads with bounded
 * concurrency, so one bad file never blocks the rest. Any filename is accepted
 * without a warning; only the server decides accepted / duplicate / rejected.
 */

type UploadErrorCode =
  | 'too_large'
  | 'empty_file'
  | 'unsupported_type'
  | 'invalid_media'
  | 'storage_limit'
  | 'inactive_access'
  | 'transient_failure'
  | 'network'
  | 'session';

type FileStatus =
  'pending' | 'uploading' | 'accepted' | 'duplicate' | 'rejected' | 'in_progress' | 'skipped';

type Row = {
  key: string;
  file: File;
  status: FileStatus;
  callId?: string;
  readyAt?: string;
  errorCode?: UploadErrorCode;
};

type ServerResult =
  | { status: 'accepted' | 'duplicate'; callId: string; readyAt: string }
  | { status: 'in_progress'; callId: string }
  | { status: 'rejected'; errorCode: UploadErrorCode };

const RETRY_IN_PROGRESS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postFile(file: File): Promise<ServerResult> {
  for (let attempt = 0; ; attempt++) {
    const body = new FormData();
    body.append('file', file, file.name);
    let response: Response;
    try {
      response = await fetch('/api/calls/uploads', { method: 'POST', body });
    } catch {
      return { status: 'rejected', errorCode: 'network' };
    }
    if (response.status === 401 || response.status === 403) {
      const payload = (await response.json().catch(() => null)) as { errorCode?: string } | null;
      if (payload?.errorCode === 'inactive_access')
        return { status: 'rejected', errorCode: 'inactive_access' };
      return { status: 'rejected', errorCode: 'session' };
    }
    const result = (await response.json().catch(() => null)) as ServerResult | null;
    if (!result) return { status: 'rejected', errorCode: 'transient_failure' };
    if (result.status === 'in_progress' && attempt < RETRY_IN_PROGRESS) {
      await sleep(Number(response.headers.get('retry-after') ?? 5) * 1000);
      continue;
    }
    return result;
  }
}

export function UploadPanel({
  maxFiles,
  maxBytes,
  concurrency,
}: {
  maxFiles: number;
  maxBytes: number;
  concurrency: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [storagePaused, setStoragePaused] = useState(false);
  const sizeMb = toLocaleDigits(Math.round(maxBytes / (1024 * 1024)));

  const tooMany = rows.length > maxFiles;
  const done = rows.filter((row) => !['pending', 'uploading'].includes(row.status)).length;
  const counts = {
    accepted: rows.filter((row) => row.status === 'accepted').length,
    duplicate: rows.filter((row) => row.status === 'duplicate').length,
    rejected: rows.filter((row) => ['rejected', 'skipped', 'in_progress'].includes(row.status))
      .length,
  };
  const firstReady = rows.find((row) => row.readyAt && row.status === 'accepted')?.readyAt;

  function reset() {
    setRows([]);
    setFinished(false);
    setStoragePaused(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function choose(files: FileList | null) {
    setFinished(false);
    setStoragePaused(false);
    setRows(
      Array.from(files ?? []).map((file, index) => ({
        key: `${index}-${file.name}-${file.size}`,
        file,
        status: 'pending' as const,
      })),
    );
  }

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  async function submit() {
    if (rows.length === 0 || tooMany) return;
    setRunning(true);
    const queue = [...rows];
    let paused = false;

    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        if (paused) {
          update(row.key, { status: 'skipped', errorCode: 'storage_limit' });
          continue;
        }
        if (row.file.size > maxBytes) {
          // The server enforces the same limit; this only saves the round trip.
          update(row.key, { status: 'rejected', errorCode: 'too_large' });
          continue;
        }
        update(row.key, { status: 'uploading' });
        const result = await postFile(row.file);
        if (result.status === 'rejected') {
          if (result.errorCode === 'storage_limit') {
            paused = true;
            setStoragePaused(true);
          }
          update(row.key, { status: 'rejected', errorCode: result.errorCode });
        } else if (result.status === 'in_progress') {
          update(row.key, { status: 'in_progress', callId: result.callId });
        } else {
          update(row.key, {
            status: result.status,
            callId: result.callId,
            readyAt: result.readyAt,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
    setRunning(false);
    setFinished(true);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (running) return;
        setOpen(value);
        if (!value) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload className="h-4 w-4" />
          {t('upload.open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('upload.title')}</DialogTitle>
          <DialogDescription>
            {t('upload.description', { files: toLocaleDigits(maxFiles), size: sizeMb })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent focus-within:ring-2 focus-within:ring-ring',
                running && 'pointer-events-none opacity-50',
              )}
            >
              <FileAudio className="h-4 w-4" aria-hidden="true" />
              {finished ? t('upload.chooseOthers') : t('upload.choose')}
              <input
                ref={inputRef}
                type="file"
                accept=".mp3,audio/mpeg"
                multiple
                className="sr-only"
                aria-label={t('upload.inputLabel')}
                disabled={running}
                onChange={(event) => choose(event.target.files)}
              />
            </label>
            <span
              className="text-sm text-muted-foreground"
              aria-live="polite"
              data-testid="upload-selected"
            >
              {rows.length === 0 ? t('upload.noSelection') : tp('upload.selected', rows.length)}
            </span>
          </div>

          {tooMany && (
            <Alert variant="destructive">
              <AlertDescription>
                {t('upload.tooMany', { max: toLocaleDigits(maxFiles) })}
              </AlertDescription>
            </Alert>
          )}

          {(running || finished) && rows.length > 0 && (
            <div className="space-y-1.5">
              <Progress
                value={(done / rows.length) * 100}
                aria-label={t('upload.progress', { done, total: rows.length })}
              />
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {running
                  ? t('upload.progress', { done, total: rows.length })
                  : t('upload.summary', {
                      accepted: counts.accepted,
                      duplicate: counts.duplicate,
                      rejected: counts.rejected,
                    })}
              </p>
            </div>
          )}

          {storagePaused && (
            <Alert variant="destructive" data-testid="upload-storage-paused">
              <AlertDescription>{t('upload.storagePaused')}</AlertDescription>
            </Alert>
          )}

          {finished && firstReady && (
            <Alert data-testid="upload-ready-time">
              <AlertDescription>{readyTimeMessage(firstReady)}</AlertDescription>
            </Alert>
          )}

          {rows.length > 0 && !tooMany && (
            <ul
              className="max-h-72 divide-y overflow-y-auto rounded-md border"
              data-testid="upload-results"
            >
              {rows.map((row) => (
                <UploadRow key={row.key} row={row} sizeMb={sizeMb} />
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          {finished ? (
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              {t('upload.close')}
            </Button>
          ) : (
            <Button onClick={submit} loading={running} disabled={rows.length === 0 || tooMany}>
              <Upload className="h-4 w-4" />
              {running ? t('upload.submitting') : t('upload.submit')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function errorText(code: UploadErrorCode, sizeMb: string): string {
  switch (code) {
    case 'too_large':
      return t('upload.errors.too_large', { size: sizeMb });
    case 'network':
      return t('upload.errors.network');
    case 'session':
      return t('upload.errors.session');
    default:
      return t(`upload.errors.${code}`);
  }
}

function UploadRow({ row, sizeMb }: { row: Row; sizeMb: string }) {
  const icon =
    row.status === 'accepted' ? (
      <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
    ) : row.status === 'duplicate' ? (
      <Copy className="h-4 w-4 text-info" aria-hidden="true" />
    ) : row.status === 'uploading' ? (
      <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
    ) : row.status === 'pending' ? (
      <FileAudio className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    ) : (
      <CircleX className="h-4 w-4 text-error" aria-hidden="true" />
    );

  return (
    <li className="flex items-start gap-3 px-3 py-2 text-sm" data-status={row.status}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-medium" dir="auto" title={row.file.name}>
          {row.file.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(`upload.status.${row.status}`)}
          {row.errorCode && ` — ${errorText(row.errorCode, sizeMb)}`}
          {row.status === 'duplicate' && ` — ${t('upload.duplicateOf')}`}
        </p>
      </div>
      {row.callId && (row.status === 'accepted' || row.status === 'duplicate') && (
        <Link
          href={`/calls/${row.callId}`}
          className="shrink-0 text-xs text-primary hover:underline"
        >
          {t('upload.viewCall')}
        </Link>
      )}
    </li>
  );
}
