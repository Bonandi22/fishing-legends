import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { User, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/game/i18n';
import { findAccountByUsername } from '@/game/leaderboard';
import { Account, COUNTRIES, TUTORIAL_KEY, saveAccount } from './account';

interface Props {
  open: boolean;
  onClose: () => void;
  account: Account | null;
  onAccountChange: (acc: Account) => void;
}

type Step = 'credentials' | 'username' | 'login';

export default function AccountModal({ open, onClose, account, onAccountChange }: Props) {
  const { t } = useI18n();

  const [email, setEmail] = useState(account?.email || '');
  const [password, setPassword] = useState('');
  const [birthdate, setBirthdate] = useState(account?.birthdate || '');
  const [username, setUsername] = useState(account?.username || '');
  const [country, setCountry] = useState(account?.country || '🌍');
  const [savedMsg, setSavedMsg] = useState(false);
  const needsUsername = !!account && !account.username;
  const [step, setStep] = useState<Step>(needsUsername ? 'username' : 'credentials');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(() => localStorage.getItem(TUTORIAL_KEY) !== '1');

  const dismissTutorial = () => {
    localStorage.setItem(TUTORIAL_KEY, '1');
    setTutorialVisible(false);
  };

  useEffect(() => {
    if (open) {
      setStep(account && !account.username ? 'username' : 'credentials');
      setLoginError(false);
    }
  }, [open, account]);

  const handleSaveCredentials = () => {
    if (!email || !birthdate || !password) return;
    const acc: Account = { email, birthdate, username: account?.username, country: account?.country };
    saveAccount(acc);
    onAccountChange(acc);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
    if (!acc.username) setStep('username');
  };

  const handleSaveUsername = () => {
    if (!username.trim() || !account) return;
    const acc: Account = { ...account, username: username.trim().slice(0, 20), country };
    saveAccount(acc);
    onAccountChange(acc);
    setSavedMsg(true);
    setTimeout(() => { setSavedMsg(false); onClose(); }, 1200);
  };

  const handleLogin = () => {
    const found = findAccountByUsername(loginUsername);
    if (!found) {
      setLoginError(true);
      return;
    }
    const acc: Account = {
      email: found.email,
      birthdate: '',
      username: found.username,
      country: found.country,
    };
    saveAccount(acc);
    onAccountChange(acc);
    setEmail(acc.email);
    setUsername(acc.username || '');
    setCountry(acc.country || '🌍');
    setSavedMsg(true);
    setLoginError(false);
    setTimeout(() => { setSavedMsg(false); onClose(); }, 1200);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          {tutorialVisible && (
            <div
              className="max-w-sm rounded-xl border border-lure/40 bg-card/90 p-4 text-left shadow-lg backdrop-blur"
              role="status"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-1 text-base font-bold text-foreground">{t('menu.tutorialTitle')}</h2>
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{t('menu.tutorialBody')}</p>
              <Button type="button" size="sm" onClick={dismissTutorial} className="min-h-10 touch-manipulation">
                {t('menu.tutorialDismiss')}
              </Button>
            </div>
          )}
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-modal-title"
            className="w-full max-w-sm rounded-2xl border-2 border-lure bg-card p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="account-modal-title" className="flex items-center gap-2 text-xl font-bold text-foreground">
                <User className="h-5 w-5 text-lure" />
                {t('account.title')}
              </h2>
              <button
                onClick={onClose}
                aria-label={t('menu.close')}
                className="text-2xl leading-none text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>

            {savedMsg && (
              <p className="mb-3 rounded-lg bg-lure/10 px-3 py-2 text-sm font-medium text-lure">{t('account.saved')}</p>
            )}

            {step === 'credentials' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('account.email')}</label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('account.password')}</label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('account.birthdate')}</label>
                  <Input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} />
                </div>
                <Button onClick={handleSaveCredentials} disabled={!email || !password || !birthdate} className="w-full">
                  {t('account.save')}
                </Button>
                {account?.username && (
                  <Button variant="outline" onClick={() => setStep('username')} className="w-full">
                    {t('account.editUsername')}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => { setStep('login'); setLoginError(false); }}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 text-sm text-lure hover:underline"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {t('account.haveAccount')}
                </button>
              </div>
            )}

            {step === 'login' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('account.loginTitle')}</p>
                <div>
                  <label className="text-xs text-muted-foreground">{t('account.loginUsername')}</label>
                  <Input
                    type="text"
                    value={loginUsername}
                    onChange={e => { setLoginUsername(e.target.value); setLoginError(false); }}
                    placeholder="MyAngler"
                    maxLength={20}
                    autoFocus
                  />
                </div>
                {loginError && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{t('account.loginNotFound')}</p>
                )}
                <Button onClick={handleLogin} disabled={!loginUsername.trim()} className="w-full">
                  {t('account.login')}
                </Button>
                <Button variant="outline" onClick={() => setStep('credentials')} className="w-full">
                  {t('account.newAccount')}
                </Button>
              </div>
            )}

            {step === 'username' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('account.chooseUsername')}</p>
                <div>
                  <label className="text-xs text-muted-foreground">{t('account.username')}</label>
                  <Input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="MyAngler"
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('account.country')}</label>
                  <div className="mt-1 grid grid-cols-8 gap-1.5">
                    {COUNTRIES.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCountry(c)}
                        className={`rounded border-2 p-1.5 text-xl transition-colors ${country === c ? 'border-lure bg-lure/10' : 'border-transparent hover:border-border'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={handleSaveUsername} disabled={!username.trim()} className="w-full">
                  {t('account.confirmUsername')}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
