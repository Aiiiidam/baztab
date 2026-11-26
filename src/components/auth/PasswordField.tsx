'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff, Keyboard } from 'lucide-react';
import { Input } from '@/components/UiComponents';
import { t } from '@/lib/t';
import { detectPersianKeyboard } from '@/lib/validations/password';

type PasswordFieldProps = {
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  error?: string;
  /** Show the password rules under the field (change-password step). */
  showRules?: boolean;
  autoFocus?: boolean;
};

/**
 * Password input with a show/hide toggle and an immediate warning when the
 * keyboard is on Persian (design scope: sign-in and change-password fields).
 * Uncontrolled, so React's post-action form reset clears it; the warning is
 * recomputed from every input event.
 */
export function PasswordField({
  name,
  label,
  autoComplete,
  error,
  showRules = false,
  autoFocus,
}: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [persianKeyboard, setPersianKeyboard] = useState(false);
  const warningId = `${id}-keyboard`;
  const messageId = `${id}-message`;
  const rulesId = `${id}-rules`;
  const describedBy =
    [persianKeyboard && warningId, error && messageId, showRules && rulesId]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          dir="ltr"
          spellCheck={false}
          autoCapitalize="off"
          // dir=ltr: the logical end padding is on the right, where the toggle sits (start of the RTL row).
          className="pe-10 text-start"
          aria-invalid={error || persianKeyboard ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) =>
            setPersianKeyboard(detectPersianKeyboard(event.target.value) !== null)
          }
          onFocus={(event) =>
            setPersianKeyboard(detectPersianKeyboard(event.target.value) !== null)
          }
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute start-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={visible ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {persianKeyboard && (
        <p
          id={warningId}
          role="alert"
          data-testid="persian-keyboard-warning"
          className="flex items-start gap-1.5 text-sm font-medium text-warning"
        >
          <Keyboard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t('password.keyboardWarning')}
        </p>
      )}
      {error && (
        <p id={messageId} className="text-sm text-error" aria-live="polite">
          {error}
        </p>
      )}
      {showRules && (
        <p id={rulesId} className="text-xs text-muted-foreground">
          {t('password.rules')}
        </p>
      )}
    </div>
  );
}
