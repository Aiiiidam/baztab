'use client';

import { useActionState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { changePasswordAction, logoutAction } from '@/actions/auth.actions';
import { PasswordField } from '@/components/auth/PasswordField';
import { Alert, AlertDescription, Button } from '@/components/UiComponents';
import { Logo } from '@/components/layout/Logo';
import { t } from '@/lib/t';

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePasswordAction, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-10" />
          <h1 className="text-lg font-semibold text-foreground">
            {t('auth.changePassword.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('auth.changePassword.description')}</p>
        </div>

        <form action={formAction} className="space-y-5" noValidate>
          <PasswordField
            name="newPassword"
            label={t('auth.changePassword.newPassword')}
            autoComplete="new-password"
            error={state?.fieldErrors?.newPassword}
            showRules
            autoFocus
          />
          <PasswordField
            name="confirmPassword"
            label={t('auth.changePassword.confirmPassword')}
            autoComplete="new-password"
            error={state?.fieldErrors?.confirmPassword}
          />

          {state?.error && (
            <Alert variant="destructive" data-testid="change-password-error" data-code={state.code}>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" loading={isPending} className="h-11 w-full">
            <KeyRound className="h-4 w-4" />
            {isPending ? t('auth.changePassword.submitting') : t('auth.changePassword.submit')}
          </Button>
        </form>

        <form action={logoutAction} className="text-center">
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            <LogOut className="h-4 w-4 rtl:rotate-180" />
            {t('auth.logout')}
          </Button>
        </form>
      </div>
    </div>
  );
}
