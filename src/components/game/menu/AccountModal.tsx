import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/game/i18n';
import { checkPassword } from '@/game/passwordPolicy';
import { useAuth } from '@/game/auth/AuthProvider';
import { ApiError } from '@/api/client';
import { COUNTRIES, flagToIso2 } from '@/game/auth/countries';
import { TUTORIAL_KEY } from './account';
import CodeStep from './CodeStep';
import PasswordStrength from './PasswordStrength';
import ForgotPassword from './ForgotPassword';

type Mode = 'signup' | 'login';

interface Props { open: boolean; onClose: () => void; }

export default function AccountModal({ open, onClose }: Props) {
  const { t, lang } = useI18n();
  const { status, user, login, register, logout } = useAuth();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [flag, setFlag] = useState('🌍');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; kind: 'register' | 'login' | 'reset'; resendAvailableAt: number } | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tutorialVisible, setTutorialVisible] = useState(() => localStorage.getItem(TUTORIAL_KEY) !== '1');

  const dismissTutorial = () => { localStorage.setItem(TUTORIAL_KEY, '1'); setTutorialVisible(false); };

  // Client-side signup validation — mirrors the backend registerSchema so we
  // never fire a request the server will reject with VALIDATION_ERROR.
  const emailTrimmed = email.trim();
  const usernameTrimmed = username.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const passwordIssue = checkPassword(password, { email: emailTrimmed, username: usernameTrimmed });
  const usernameValid = /^[a-zA-Z0-9_]{3,20}$/.test(usernameTrimmed);
  const signupValid = emailValid && passwordIssue === null && usernameValid;

  const errText = (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.code === 'VALIDATION_ERROR' && mode === 'signup') return t('auth.err.SIGNUP_INVALID');
      if (e.code === 'WEAK_PASSWORD' && e.reason) {
        const reasonKey = `auth.pw.${e.reason}`;
        const reasonMsg = t(reasonKey as never);
        if (reasonMsg !== reasonKey) return reasonMsg;
      }
      const key = `auth.err.${e.code}` as const;
      const msg = t(key as never);
      // An unmapped code is not necessarily a bad form — stay neutral.
      return msg === key ? t('auth.err.GENERIC') : msg;
    }
    return t('auth.err.NETWORK');
  };

  const canSubmit = !busy && !!email && !!password && (mode === 'login' || signupValid);

  // Forget everything typed into the form, so the next person on this device
  // does not find the previous account's email or password pre-filled.
  const resetForm = () => {
    setMode('login'); setEmail(''); setPassword(''); setUsername(''); setFlag('🌍');
    setError(null); setNotice(null); setChallenge(null); setForgotOpen(false);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setError(null); setBusy(true);
    try {
      if (mode === 'login') {
        const { challengeId } = await login(email.trim(), password, lang);
        setChallenge({ id: challengeId, kind: 'login', resendAvailableAt: Date.now() + 60_000 });
      } else {
        const { challengeId } = await register({ email: email.trim(), password, username: username.trim(), country: flagToIso2(flag), locale: lang });
        setChallenge({ id: challengeId, kind: 'register', resendAvailableAt: Date.now() + 60_000 });
      }
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs"
        >
          {/* min-h-full + justify-center centres short content but lets tall
              content (tutorial + signup form) grow and scroll instead of being
              clipped above and below the viewport. */}
          <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4">
          {tutorialVisible && (
            <div className="max-w-sm rounded-xl border border-lure/40 bg-card/90 p-4 text-left shadow-lg backdrop-blur-sm" role="status" onClick={e => e.stopPropagation()}>
              <h2 className="mb-1 text-base font-bold text-foreground">{t('menu.tutorialTitle')}</h2>
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{t('menu.tutorialBody')}</p>
              <Button type="button" size="sm" onClick={dismissTutorial} className="min-h-10">{t('menu.tutorialDismiss')}</Button>
            </div>
          )}

          <motion.div
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="account-modal-title"
            className="w-full max-w-sm rounded-2xl border-2 border-lure bg-card p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="account-modal-title" className="flex items-center gap-2 text-xl font-bold text-foreground">
                <User className="h-5 w-5 text-lure" /> {t('account.title')}
              </h2>
              <button onClick={onClose} aria-label={t('menu.close')} className="text-2xl leading-none text-muted-foreground hover:text-foreground">×</button>
            </div>

            {status === 'authenticated' && user ? (
              <div className="space-y-3 text-center">
                <p className="text-lg font-semibold text-foreground">{user.username}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <Button variant="outline" className="w-full" onClick={() => { void logout(); resetForm(); onClose(); }}>{t('auth.logoutCta')}</Button>
              </div>
            ) : challenge ? (
              <CodeStep
                challengeId={challenge.id} kind={challenge.kind} email={emailTrimmed}
                username={usernameValid ? usernameTrimmed : undefined} resendAvailableAt={challenge.resendAvailableAt}
                onResent={(id, at) => setChallenge(c => c && { ...c, id, resendAvailableAt: at })}
                onDone={() => {
                  const wasReset = challenge.kind === 'reset';
                  setChallenge(null); setPassword('');
                  if (wasReset) {
                    // Recovery never logs in: back to the login form, email kept.
                    setForgotOpen(false); setMode('login'); setNotice(t('auth.reset.done'));
                  } else {
                    onClose();
                  }
                }}
                onBack={message => { setChallenge(null); setError(message ?? null); if (challenge.kind !== 'reset') setForgotOpen(false); }}
              />
            ) : forgotOpen ? (
              <ForgotPassword
                initialEmail={email}
                initialError={error}
                onSent={(sentEmail, id) => { setEmail(sentEmail); setError(null); setChallenge({ id, kind: 'reset', resendAvailableAt: Date.now() + 60_000 }); }}
                onBack={() => { setForgotOpen(false); setError(null); }}
              />
            ) : (
              <form className="space-y-3" onSubmit={submit} noValidate>
                {notice && <p role="status" className="rounded-lg bg-lure/10 px-3 py-2 text-sm text-foreground">{notice}</p>}
                {error &&<p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                <label className="block text-xs text-muted-foreground" htmlFor="acc-email">{t('auth.emailLabel')}</label>
                <Input id="acc-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
                {mode === 'signup' && emailTrimmed.length > 0 && !emailValid && (
                  <p className="text-xs text-destructive">{t('auth.emailHint')}</p>
                )}

                <label className="block text-xs text-muted-foreground" htmlFor="acc-pw">{t('auth.passwordLabel')}</label>
                <Input id="acc-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  minLength={mode === 'signup' ? 12 : undefined} maxLength={mode === 'signup' ? 128 : undefined} />
                {mode === 'signup' && (
                  <>
                    <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>
                    <PasswordStrength password={password} email={emailTrimmed} username={usernameTrimmed} />
                  </>
                )}

                {mode === 'signup' && (
                  <>
                    <label className="block text-xs text-muted-foreground" htmlFor="acc-user">{t('auth.usernameLabel')}</label>
                    <Input id="acc-user" type="text" value={username} onChange={e => setUsername(e.target.value)} maxLength={20}
                      pattern="[a-zA-Z0-9_]+" inputMode="text" placeholder="MyAngler" />
                    <p className={`text-xs ${usernameTrimmed.length > 0 && !usernameValid ? 'text-destructive' : 'text-muted-foreground'}`}>{t('auth.usernameHint')}</p>
                    <span className="block text-xs text-muted-foreground">{t('auth.countryLabel')}</span>
                    <div className="grid grid-cols-8 gap-1.5">
                      {COUNTRIES.map(c => (
                        <button key={c} type="button" aria-label={c} onClick={() => setFlag(c)}
                          className={`rounded border-2 p-1.5 text-xl ${flag === c ? 'border-lure bg-lure/10' : 'border-transparent hover:border-border'}`}>{c}</button>
                      ))}
                    </div>
                  </>
                )}

                <Button type="submit" disabled={!canSubmit} className="w-full">
                  {mode === 'signup' ? t('auth.signupCta') : t('auth.loginCta')}
                </Button>
                {mode === 'login' && (
                  <button type="button" onClick={() => { setForgotOpen(true); setError(null); setNotice(null); }}
                    className="block w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline">
                    {t('auth.forgot.link')}
                  </button>
                )}
                <button type="button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null); setNotice(null); }}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 text-sm text-lure hover:underline">
                  <LogIn className="h-3.5 w-3.5" />
                  {mode === 'signup' ? t('auth.haveAccount') : t('auth.needAccount')}
                </button>
              </form>
            )}
          </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
