import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/game/i18n';
import { useAuth } from '@/game/auth/AuthProvider';
import { ApiError } from '@/api/client';

interface Props {
  initialEmail: string;
  /** The modal owns the challenge: called with the trimmed email and the new challenge id. */
  onSent(email: string, challengeId: string): void;
  onBack(): void;
}

/** Step 1 of password recovery: ask for the email; the code step is CodeStep with kind="reset". */
export default function ForgotPassword({ initialEmail, onSent, onBack }: Props) {
  const { t, lang } = useI18n();
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = email.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

  const submit = async () => {
    if (!valid || busy) return;
    setError(null); setBusy(true);
    try {
      const { challengeId } = await forgotPassword(trimmed, lang);
      onSent(trimmed, challengeId);
    } catch (e) {
      if (e instanceof ApiError) {
        const key = `auth.err.${e.code}`;
        const msg = t(key as never);
        setError(msg === key ? t('auth.err.GENERIC') : msg);
      } else {
        setError(t('auth.err.NETWORK'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <h3 className="text-base font-semibold text-foreground">{t('auth.forgot.title')}</h3>
      <p className="text-sm text-muted-foreground">{t('auth.forgot.body')}</p>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <label className="block text-xs text-muted-foreground" htmlFor="acc-forgot-email">{t('auth.emailLabel')}</label>
      <Input id="acc-forgot-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
      <Button type="submit" disabled={busy || !valid} className="w-full">{t('auth.forgot.submit')}</Button>
      <button type="button" onClick={onBack} className="block w-full text-center text-sm text-lure hover:underline">
        {t('auth.code.back')}
      </button>
    </form>
  );
}
