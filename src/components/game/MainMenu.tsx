import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerState } from '@/game/types';
import { useI18n, Lang, LANG_LABELS } from '@/game/i18n';
import { findAccountByUsername } from '@/game/leaderboard';
import { Volume2, VolumeX, Globe, ChevronDown, User, LogIn, Lock, Gift, Music } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { MusicTrackId } from '@/game/useBackgroundMusic';
import { MUSIC_TRACKS } from '@/game/useBackgroundMusic';


interface Props {
  player: PlayerState;
  onPlay: () => void;
  onCollection: () => void;
  onWarehouse: () => void;
  onSubmarine: () => void;
  onMultiplier: () => void;
  onSkins: () => void;
  onRoulette: () => void;
  onSkinRoulette: () => void;
  onRanking: () => void;
  onAquarium: () => void;
  onDailyGifts: () => void;
  onReset: () => void;
  musicPlaying: boolean;
  onToggleMusic: () => void;
  musicTrack: MusicTrackId;
  onSetMusicTrack: (id: MusicTrackId) => void;
  world: 1 | 2 | 3;
  onSwitchWorld: () => void;
  onSetWorld: (w: 1 | 2 | 3) => void;
}

const LANGS: Lang[] = ['pt', 'en', 'es', 'fr', 'de', 'ja'];

const ACCOUNT_KEY = 'fishing-game-account';
const TUTORIAL_KEY = 'fishing-game-tutorial-seen';

interface Account { email: string; birthdate: string; username?: string; country?: string; }

const COUNTRIES = ['🇧🇷', '🇵🇹', '🇺🇸', '🇪🇸', '🇫🇷', '🇩🇪', '🇮🇹', '🇬🇧', '🇯🇵', '🇰🇷', '🇲🇽', '🇦🇷', '🇨🇦', '🇦🇺', '🇨🇳', '🌍'];

function loadAccount(): Account | null {
  try {
    const saved = localStorage.getItem(ACCOUNT_KEY);
    if (saved) return JSON.parse(saved) as Account;
  } catch {
    return null;
  }
  return null;
}

function saveAccount(acc: Account) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
}

export default function MainMenu({ player, onPlay, onCollection, onWarehouse, onSubmarine, onMultiplier, onSkins, onRoulette, onSkinRoulette, onRanking, onAquarium, onDailyGifts, onReset, musicPlaying, onToggleMusic, musicTrack, onSetMusicTrack, world, onSwitchWorld, onSetWorld }: Props) {
  const { lang, setLang, t } = useI18n();
  const [langOpen, setLangOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(loadAccount);
  const [email, setEmail] = useState(account?.email || '');
  const [password, setPassword] = useState('');
  const [birthdate, setBirthdate] = useState(account?.birthdate || '');
  const [username, setUsername] = useState(account?.username || '');
  const [country, setCountry] = useState(account?.country || '🌍');
  const [savedMsg, setSavedMsg] = useState(false);
  // After credentials are saved, prompt for username if missing
  const needsUsername = !!account && !account.username;
  const [step, setStep] = useState<'credentials' | 'username' | 'login'>(needsUsername ? 'username' : 'credentials');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(() => localStorage.getItem(TUTORIAL_KEY) !== '1');

  const dismissTutorial = () => {
    localStorage.setItem(TUTORIAL_KEY, '1');
    setTutorialVisible(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // When opening modal, jump to right step
  useEffect(() => {
    if (accountModalOpen) {
      setStep(account && !account.username ? 'username' : 'credentials');
      setLoginError(false);
    }
  }, [accountModalOpen, account]);

  const handleSaveCredentials = () => {
    if (!email || !birthdate || !password) return;
    const acc: Account = { email, birthdate, username: account?.username, country: account?.country };
    saveAccount(acc);
    setAccount(acc);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
    if (!acc.username) setStep('username');
  };

  const handleSaveUsername = () => {
    if (!username.trim() || !account) return;
    const acc: Account = { ...account, username: username.trim().slice(0, 20), country };
    saveAccount(acc);
    setAccount(acc);
    setSavedMsg(true);
    setTimeout(() => { setSavedMsg(false); setAccountModalOpen(false); }, 1200);
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
    setAccount(acc);
    setEmail(acc.email);
    setUsername(acc.username || '');
    setCountry(acc.country || '🌍');
    setSavedMsg(true);
    setLoginError(false);
    setTimeout(() => { setSavedMsg(false); setAccountModalOpen(false); }, 1200);
  };

  return (
    <div className={`relative flex min-h-screen flex-col items-center justify-start overflow-x-hidden overflow-y-auto px-3 pb-8 pt-24 sm:px-6 md:justify-center md:py-10 ${world === 2 ? 'world-bg-2' : world === 3 ? 'world-bg-3' : 'bg-background'}`}>
      {/* Animated background waves */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-[200%] h-24 rounded-[50%] bg-primary/30"
            style={{ bottom: `${i * 40 - 20}px`, left: '-50%' }}
            animate={{ x: [0, 80, 0], y: [0, -10, 0] }}
            transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
          />
        ))}
      </div>

      {/* Settings bar */}
      <div className="absolute top-2 right-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-1.5 sm:top-4 sm:right-4 sm:gap-3">
        <div ref={langRef} className="relative">
          <Button variant="outline" size="sm" onClick={() => setLangOpen(!langOpen)} className="bg-background/80 backdrop-blur gap-1.5">
            <Globe className="w-4 h-4" />
            {lang.toUpperCase()}
            <ChevronDown className="w-3 h-3" />
          </Button>
          {langOpen && (
            <div className="absolute right-0 mt-1 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[140px] z-50">
              {LANGS.map(l => (
                <button
                  key={l}
                  onClick={() => { setLang(l); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${l === lang ? 'font-bold text-primary' : 'text-foreground'}`}
                >
                  {LANG_LABELS[l]}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onToggleMusic} className="bg-background/80 backdrop-blur gap-1.5">
          {musicPlaying ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          {t('settings.music')}
        </Button>
        <div ref={trackRef} className="relative">
          <Button variant="outline" size="sm" onClick={() => setTrackOpen(o => !o)} className="bg-background/80 backdrop-blur gap-1.5">
            <Music className="w-4 h-4" />
            {MUSIC_TRACKS.find(t => t.id === musicTrack)?.label ?? 'Música'}
            <ChevronDown className="w-3 h-3" />
          </Button>
          {trackOpen && (
            <div className="absolute right-0 mt-1 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[170px] z-50">
              {MUSIC_TRACKS.map(tr => (
                <button
                  key={tr.id}
                  onClick={() => { onSetMusicTrack(tr.id); setTrackOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${tr.id === musicTrack ? 'font-bold text-primary' : 'text-foreground'}`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* Coins display + World toggle */}
      <div className="absolute top-2 left-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5 sm:top-4 sm:left-4 sm:gap-2">
        <div className="surface-glass rounded-lg px-3 py-2 text-sm font-bold text-foreground">
          💰 {player.coins} {t('mult.coins')}
        </div>
        <Button
          variant={world === 2 ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSetWorld(world === 2 ? 1 : 2)}
          disabled={player.level < 12}
          className="bg-background/80 backdrop-blur gap-1.5"
          title={player.level < 12 ? 'Desbloqueia no nível 12' : ''}
        >
          {player.level < 12 ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
          {world === 2 ? 'Mundo 1' : 'Mundo 2'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDailyGifts}
          className="bg-background/80 backdrop-blur gap-1.5 relative"
        >
          <Gift className="w-3.5 h-3.5" />
          Presentes
          {player.dailyGiftsLastClaim !== new Date().toISOString().slice(0, 10) && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-pink-500 rounded-full animate-pulse" />
          )}
        </Button>
      </div>

      {/* World 3 button - below coins counter */}
      <div className="absolute top-16 left-4 z-20">
        <Button
          variant={world === 3 ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSetWorld(world === 3 ? 2 : 3)}
          disabled={player.level < 20}
          className="bg-background/80 backdrop-blur gap-1.5"
          title={player.level < 20 ? 'Desbloqueia no nível 20' : ''}
        >
          {player.level < 20 ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
          {world === 3 ? 'Voltar ao Mundo 2' : 'Mundo 3'}
        </Button>
      </div>

      {/* Register button - bottom left */}
      <div className="absolute bottom-2 left-2 z-20 sm:bottom-4 sm:left-4">
        <Button onClick={() => setAccountModalOpen(true)} variant="outline" size="sm" className="bg-background/80 backdrop-blur gap-1.5">
          <User className="w-4 h-4" />
          {account ? <span className="truncate max-w-[140px]">{account.username ? `${account.country || ''} ${account.username}` : account.email}</span> : t('menu.register')}
        </Button>
      </div>

      {/* Account modal */}
      <AnimatePresence>
        {accountModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setAccountModalOpen(false)}
          >
            {tutorialVisible && (
              <div className="mb-5 rounded-xl border border-primary/40 bg-card/90 p-4 text-left shadow-lg backdrop-blur" role="status">
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
              className="bg-card border-2 border-primary rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  {t('account.title')}
                </h2>
                <button onClick={() => setAccountModalOpen(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
              </div>

              {savedMsg && (
                <p className="text-sm text-primary font-medium mb-3 bg-primary/10 rounded-lg px-3 py-2">{t('account.saved')}</p>
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
                    className="w-full text-sm text-primary hover:underline mt-1 flex items-center justify-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5" />
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
                    <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{t('account.loginNotFound')}</p>
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
                    <div className="grid grid-cols-8 gap-1.5 mt-1">
                      {COUNTRIES.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCountry(c)}
                          className={`text-xl p-1.5 rounded border-2 transition-colors ${country === c ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border'}`}
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

      <motion.div
        className="z-10 w-full max-w-3xl text-center"
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <motion.div
          className="mb-4 text-6xl sm:text-7xl"
          animate={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          🎣
        </motion.div>
        <h1 className="mb-2 text-4xl font-black tracking-tight text-foreground sm:text-5xl md:text-7xl">
          PESCA<span className="text-primary">3D</span>
        </h1>
        <p className="mx-auto mb-6 max-w-xl text-muted-foreground text-lg">
          {t('menu.subtitle')}
        </p>

        <motion.div
          className="surface-glass mx-auto mb-6 grid w-full max-w-2xl grid-cols-3 gap-2 rounded-2xl p-3 text-left sm:gap-4 sm:p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="rounded-xl bg-primary/10 p-2.5 sm:p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('menu.level')}</p>
            <p className="text-xl font-black text-primary sm:text-2xl">{player.level}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (player.xp / Math.max(1, player.xpToNextLevel)) * 100)}%` }} />
            </div>
          </div>
          <div className="rounded-xl bg-secondary/70 p-2.5 sm:p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">🐟 {t('menu.fish')}</p>
            <p className="text-xl font-black text-foreground sm:text-2xl">{player.totalFishCaught.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{player.collection.length} {t('col.species')}</p>
          </div>
          <div className="rounded-xl bg-secondary/70 p-2.5 sm:p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">💰 {t('mult.coins')}</p>
            <p className="text-xl font-black text-foreground sm:text-2xl">{player.coins.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{player.warehouse?.length || 0}/15 {t('menu.warehouse')}</p>
          </div>
        </motion.div>

        <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-3 sm:gap-4">
          <Button onClick={onPlay} size="lg" className="col-span-2 h-14 w-full text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25">
            {t('menu.play')}
          </Button>
          <Button onClick={onSubmarine} size="lg" className="col-span-2 h-12 w-full bg-cyan-700 text-cyan-50 hover:bg-cyan-600 font-bold">
            {t('menu.submarine')}
          </Button>
            <Button onClick={onCollection} variant="secondary" size="lg" className="h-12 w-full text-xs">
              {t('menu.collection')} ({player.collection.length})
            </Button>
            <Button onClick={onWarehouse} variant="secondary" size="lg" className="h-12 w-full text-xs">
              {t('menu.warehouse')} ({player.warehouse?.length || 0}/15)
            </Button>
            <Button onClick={onMultiplier} variant="secondary" size="lg" className="h-12 w-full text-xs">
              {t('menu.multiplier')}
            </Button>
            <Button onClick={onSkins} variant="secondary" size="lg" className="h-12 w-full text-xs">
              {t('menu.skins')}
            </Button>
            <Button onClick={onRoulette} variant="outline" size="lg" className="h-12 w-full text-xs font-bold">
              {t('menu.roulette')}
            </Button>
            <Button onClick={onRanking} variant="outline" size="lg" className="h-12 w-full text-xs font-bold">
              {t('menu.ranking')}
            </Button>
          <Button onClick={onSkinRoulette} variant="outline" size="lg" className="col-span-2 h-12 w-full text-sm font-bold border-primary text-primary hover:bg-primary/10">
            {t('menu.skinRoulette')}
          </Button>
          <Button onClick={onAquarium} size="lg" className="col-span-2 h-12 w-full text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white">
            {t('menu.aquarium')} ({(player.aquariumWarehouse?.length || 0)} + {Object.values(player.aquariumSectors || {}).reduce((s, a) => s + (a?.length || 0), 0)})
          </Button>
          {player.level > 1 && (
            <Button onClick={onReset} variant="ghost" size="sm" className="text-muted-foreground mt-2">
              {t('menu.reset')}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
