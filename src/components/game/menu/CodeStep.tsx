import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/game/i18n';
import { useAuth } from '@/game/auth/AuthProvider';
import { ApiError } from '@/api/client';

const RESEND_SECONDS = 60;

interface Props {
  challengeId: string;
  kind: 'register' | 'login';
  onDone(): void;
  onBack(): void;
}

export default function CodeStep({ challengeId, kind, onDone, onBack }: Props) {
  const { t } = useI18n();
  const { completeChallenge, resendCode } = useAuth();
  const [id, setId] = useState(challengeId);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => { setId(challengeId); }, [challengeId]);

  // One interval for the whole countdown (keyed on running/stopped, not on every tick).
  const counting = seconds > 0;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  const errText = (e: unknown): string => {
    if (e instanceof ApiError) {
      const key = `auth.err.${e.code}`;
      const msg = t(key as never);
      return msg === key ? t('auth.err.GENERIC') : msg;
    }
    return t('auth.err.NETWORK');
  };

  const submit = async () => {
    if (code.length !== 6 || busy) return;
    setError(null); setNotice(null); setBusy(true);
    try {
      await completeChallenge(kind, id, code);
      onDone();
    } catch (e) {
      setError(errText(e));
      if (e instanceof ApiError && e.code === 'CHALLENGE_NOT_FOUND') onBack();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (seconds > 0 || busy) return;
    setError(null); setNotice(null); setBusy(true);
    try {
      setId(await resendCode(id));
      setCode('');
      setSeconds(RESEND_SECONDS);
      setNotice(t('auth.code.sent'));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CHALLENGE_NOT_FOUND') { onBack(); return; }
      setError(errText(e));
      if (e instanceof ApiError && e.code === 'RESEND_TOO_SOON') setSeconds(s => (s > 0 ? s : RESEND_SECONDS));
    } finally {
      setBusy(false);
    }
  };

  const resendLabel = seconds > 0
    ? t('auth.code.resendIn').replace('{s}', String(seconds))
    : t('auth.code.resend');

  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <h3 className="text-base font-semibold text-foreground">
        {t(kind === 'register' ? 'auth.code.titleRegister' : 'auth.code.titleLogin')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('auth.code.body')}</p>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}

      <label className="block text-xs text-muted-foreground" htmlFor="acc-code">{t('auth.code.label')}</label>
      <Input
        id="acc-code" value={code} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={12}
        placeholder="123456" className="text-center text-lg tracking-[0.4em]"
        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />

      <Button type="submit" disabled={busy || code.length !== 6} className="w-full">{t('auth.code.submit')}</Button>
      <Button type="button" variant="outline" disabled={busy || seconds > 0} onClick={() => void resend()} className="w-full">
        {resendLabel}
      </Button>
      <button type="button" onClick={onBack} className="block w-full text-center text-sm text-lure hover:underline">
        {t('auth.code.back')}
      </button>
    </form>
  );
}
