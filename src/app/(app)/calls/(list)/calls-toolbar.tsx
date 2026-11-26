'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/UiComponents';
import { normalizeInput } from '@/lib/persian';
import { t } from '@/lib/t';

const STATES = ['QUEUED', 'PROCESSING', 'READY', 'FAILED'] as const;
const ALL = 'all';

export type ActiveFilter = { param: string[]; label: string };

/**
 * Search and filters for فهرست تماس‌ها. Everything lives in the URL, so back
 * navigation and the report drill-down restore the same view. Active issue and
 * range filters from the report are shown as removable chips.
 */
export function CallsToolbar({ chips }: { chips: ActiveFilter[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');

  function navigate(change: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    next.delete('cursor');
    change(next);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <form
          role="search"
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const term = normalizeInput(search);
            navigate((next) => (term ? next.set('q', term) : next.delete('q')));
          }}
        >
          <label htmlFor="calls-search" className="sr-only">
            {t('calls.search.label')}
          </label>
          <Input
            id="calls-search"
            type="search"
            dir="auto"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('calls.search.placeholder')}
            className="flex-1"
          />
          <Button type="submit" variant="outline" aria-label={t('calls.search.submit')}>
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">{t('calls.search.submit')}</span>
          </Button>
        </form>

        <div className="sm:w-48">
          <Select
            value={params.get('state') ?? ALL}
            onValueChange={(value) =>
              navigate((next) => (value === ALL ? next.delete('state') : next.set('state', value)))
            }
          >
            <SelectTrigger aria-label={t('calls.filter.state')}>
              <SelectValue>
                {STATES.find((state) => state === params.get('state'))
                  ? t(`callState.${params.get('state') as (typeof STATES)[number]}`)
                  : t('calls.filter.allStates')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('calls.filter.allStates')}</SelectItem>
              {STATES.map((state) => (
                <SelectItem key={state} value={state}>
                  {t(`callState.${state}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="active-filters">
          {chips.map((chip) => (
            <Badge key={chip.label} variant="brand" className="gap-1 py-1 ps-2.5 pe-1 text-xs">
              {chip.label}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-brand-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('calls.filter.remove', { label: chip.label })}
                onClick={() => navigate((next) => chip.param.forEach((key) => next.delete(key)))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
