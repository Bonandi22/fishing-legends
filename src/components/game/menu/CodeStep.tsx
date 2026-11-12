import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/game/i18n';
import { useAuth } from '@/game/auth/AuthProvider';
import { ApiError } from '@/api/client';
import { checkPassword } from '@/game/passwordPolicy';
import PasswordStrength from './PasswordStrength';

const RESEND_SECONDS = 60;

interface Props {
  challengeId: string;
  /** `reset` also asks for the new password (and needs `email`/`username` for the personal-info check). */
  kind: 'register' | 'login' | 'reset';
  email?: string;
  /** Known only if the player typed it in this modal; the server checks it regardless. */
  username?: string;
  /** Epoch ms when resend becomes available; owned by the parent so a remount resumes it. */
  resendAvailableAt: number;
  /** The parent owns the current challenge: called with the new id and the new cooldown deadline. */
  onResent(challengeId: string, resendAvailableAt: number): void;
  onDone(): void;
  /** `message`: why the step was left (the challenge is gone), to show on the screen returned to. */
  onBack(message?: string): void;
}

export default function CodeStep({ challengeId, kind, email = '', username, resendAvailableAt, onResent, onDone, onBack }: Props) {
  const { t } = useI18n();
  const { completeChallenge, resendCode, resetPassword } = useAuth();
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  // Checked here so a weak password never spends the (single-use) code.
  const passwordIssue = kind === 'reset' ? checkPassword(newPassword, { email, username }) : null;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  // One interval for the whole countdown (keyed on running/stopped, not on every tick).
  const counting = seconds > 0;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  const errText = (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.code === 'WEAK_PASSWORD' && e.reason) {
        const reasonKey = `auth.pw.${e.reason}`;
        const reasonMsg = t(reasonKey as never);
        if (reasonMsg !== reasonKey) return reasonMsg;
      }
      const key = `auth.err.${e.code}`;
      const msg = t(key as never);
      return msg === key ? t('auth.err.GENERIC') : msg;
    }
    return t('auth.err.NETWORK');
  };

  const canSubmit = code.length === 6 && (kind !== 'reset' || (newPassword.length > 0 && passwordIssue === null));

  const submit = async () => {
    if (!canSubmit || busy) return;
    setError(null); setNotice(null); setBusy(true);
    try {
      if (kind === 'reset') await resetPassword(challengeId, code, newPassword);
      else await completeChallenge(kind, challengeId, code);
      onDone();
    } catch (e) {
      // The challenge is gone: leave the step, carrying the message to the next screen.
      if (e instanceof ApiError && e.code === 'CHALLENGE_NOT_FOUND') { onBack(errText(e)); return; }
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (seconds > 0 || busy) return;
    setError(null); setNotice(null); setBusy(true);
    try {
      const nextId = await resendCode(challengeId);
      setCode('');
      setNow(Date.now());
      onResent(nextId, Date.now() + RESEND_SECONDS * 1000);
      setNotice(t('auth.code.sent'));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CHALLENGE_NOT_FOUND') { onBack(errText(e)); return; }
      setError(errText(e));
      if (e instanceof ApiError && e.code === 'RESEND_TOO_SOON' && seconds === 0) {
        setNow(Date.now());
        onResent(challengeId, Date.now() + RESEND_SECONDS * 1000);
      }
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
        {t(kind === 'register' ? 'auth.code.titleRegister' : kind === 'reset' ? 'auth.reset.title' : 'auth.code.titleLogin')}
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

      {kind === 'reset' && (
        <>
          <label className="block text-xs text-muted-foreground" htmlFor="acc-newpw">{t('auth.reset.newPassword')}</label>
          <Input id="acc-newpw" type="password" autoComplete="new-password" value={newPassword} placeholder="••••••••"
            onChange={e => setNewPassword(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>
          <PasswordStrength password={newPassword} email={email} username={username} />
        </>
      )}

      <Button type="submit" disabled={busy || !canSubmit} className="w-full">
        {t(kind === 'reset' ? 'auth.reset.submit' : 'auth.code.submit')}
      </Button>
      <Button type="button" variant="outline" disabled={busy || seconds > 0} onClick={() => void resend()} className="w-full">
        {resendLabel}
      </Button>
      <button type="button" onClick={() => onBack()} className="block w-full text-center text-sm text-lure hover:underline">
        {t('auth.code.back')}
      </button>
    </form>
  );
}
