import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/game/i18n';
import { useAuth } from '@/game/auth/AuthProvider';
import { ApiError } from '@/api/client';
import { COUNTRIES, flagToIso2 } from '@/game/auth/countries';
import { TUTORIAL_KEY } from './account';

type Mode = 'signup' | 'login';

interface Props { open: boolean; onClose: () => void; }

export default function AccountModal({ open, onClose }: Props) {
  const { t } = useI18n();
  const { status, user, login, register, logout } = useAuth();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [flag, setFlag] = useState('🌍');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(() => localStorage.getItem(TUTORIAL_KEY) !== '1');

  const dismissTutorial = () => { localStorage.setItem(TUTORIAL_KEY, '1'); setTutorialVisible(false); };

  // Client-side signup validation — mirrors the backend registerSchema so we
  // never fire a request the server will reject with VALIDATION_ERROR.
  const emailTrimmed = email.trim();
  const usernameTrimmed = username.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const passwordValid = password.length >= 12 && password.length <= 128;
  const usernameValid = /^[a-zA-Z0-9_]{3,20}$/.test(usernameTrimmed);
  const signupValid = emailValid && passwordValid && usernameValid;

  const errText = (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.code === 'VALIDATION_ERROR' && mode === 'signup') return t('auth.err.SIGNUP_INVALID');
      const key = `auth.err.${e.code}` as const;
      const msg = t(key as never);
      // An unmapped code is not necessarily a bad form — stay neutral.
      return msg === key ? t('auth.err.GENERIC') : msg;
    }
    return t('auth.err.NETWORK');
  };

  const submit = async () => {
    setError(null); setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register({ email: email.trim(), password, username: username.trim(), country: flagToIso2(flag) });
      onClose();
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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 p-4 backdrop-blur-xs"
        >
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
                <Button variant="outline" className="w-full" onClick={() => { void logout(); onClose(); }}>{t('auth.logoutCta')}</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                <label className="block text-xs text-muted-foreground" htmlFor="acc-email">{t('auth.emailLabel')}</label>
                <Input id="acc-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
                {mode === 'signup' && emailTrimmed.length > 0 && !emailValid && (
                  <p className="text-xs text-destructive">{t('auth.emailHint')}</p>
                )}

                <label className="block text-xs text-muted-foreground" htmlFor="acc-pw">{t('auth.passwordLabel')}</label>
                <Input id="acc-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  minLength={mode === 'signup' ? 12 : undefined} maxLength={mode === 'signup' ? 128 : undefined} />
                {mode === 'signup' && (
                  <p className={`text-xs ${password.length > 0 && !passwordValid ? 'text-destructive' : 'text-muted-foreground'}`}>{t('auth.passwordHint')}</p>
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

                <Button onClick={submit} disabled={busy || !email || !password || (mode === 'signup' && !signupValid)} className="w-full">
                  {mode === 'signup' ? t('auth.signupCta') : t('auth.loginCta')}
                </Button>
                <button type="button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null); }}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 text-sm text-lure hover:underline">
                  <LogIn className="h-3.5 w-3.5" />
                  {mode === 'signup' ? t('auth.haveAccount') : t('auth.needAccount')}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
