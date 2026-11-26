'use client';

import { useActionState, useState } from 'react';
import { CircleHelp, LogIn } from 'lucide-react';
import { signInAction } from '@/actions/auth.actions';
import { PasswordField } from '@/components/auth/PasswordField';
import { Alert, AlertDescription, Button, FormField, Input } from '@/components/UiComponents';
import { Logo } from '@/components/layout/Logo';
import { APP_NAME } from '@/lib/app-config';
import { t } from '@/lib/t';

/** ورود به بازتاب (design scope): national ID, mobile and password. */
export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signInAction, null);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-10" />
          <h1 className="text-lg font-semibold text-foreground">{t('auth.login.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.login.subtitle')}</p>
        </div>

        {/* key: remount with the echoed identifiers after each submission (React resets forms). */}
        <form
          key={JSON.stringify(state?.values ?? {})}
          action={formAction}
          className="space-y-5"
          noValidate
        >
          <FormField label={t('auth.login.nationalId')} error={state?.fieldErrors?.nationalId}>
            <Input
              name="nationalId"
              inputMode="numeric"
              autoComplete="organization"
              autoFocus
              dir="ltr"
              className="text-start"
              placeholder="۱۰۳۸۰۲۸۴۷۹۰"
              defaultValue={state?.values?.nationalId}
            />
          </FormField>

          <FormField label={t('auth.login.mobile')} error={state?.fieldErrors?.mobile}>
            <Input
              name="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="username"
              dir="ltr"
              className="text-start"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              defaultValue={state?.values?.mobile}
            />
          </FormField>

          <PasswordField
            name="password"
            label={t('auth.login.password')}
            autoComplete="current-password"
            error={state?.fieldErrors?.password}
          />

          {state?.error && (
            <Alert variant="destructive" data-testid="login-error" data-code={state.code}>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" loading={isPending} className="h-11 w-full">
            <LogIn className="h-4 w-4 rtl:rotate-180" />
            {isPending ? t('auth.login.submitting') : t('auth.login.submit')}
          </Button>
        </form>

        <div className="space-y-2 text-center">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={showHelp}
            aria-controls="forgot-password-help"
            onClick={() => setShowHelp((value) => !value)}
          >
            <CircleHelp className="h-4 w-4" aria-hidden="true" />
            {t('auth.login.forgotPassword')}
          </button>
          {showHelp && (
            <p
              id="forgot-password-help"
              className="rounded-md bg-muted/50 px-3 py-2 text-start text-sm text-muted-foreground"
            >
              {t('auth.login.forgotPasswordHelp')}
            </p>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground/50">{APP_NAME}</p>
      </div>
    </div>
  );
}
