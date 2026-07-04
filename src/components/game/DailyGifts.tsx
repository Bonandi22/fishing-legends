import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, DailyGiftReward, ROD_SKINS, BOAT_SKINS, getDailyGiftsForWeek } from '@/game/types';
import { Gift, Coins, Zap, Sparkles, Ship, Anchor, Lock, Check } from 'lucide-react';

interface Props {
  player: PlayerState;
  onClaim: () => { reward: DailyGiftReward; day: number } | null;
  onBack: () => void;
}

function rewardLabel(r: DailyGiftReward): string {
  if (r.type === 'coins') return `${r.amount} moedas`;
  if (r.type === 'multiplier') return r.kind === 'luck' ? '2x Sorte (1min)' : '2x Força (1min)';
  if (r.type === 'boatSkin') {
    const b = BOAT_SKINS.find(s => s.id === r.skinId);
    return `Skin de Barco: ${b?.name || r.skinId}`;
  }
  const s = ROD_SKINS.find(s => s.id === r.skinId);
  return `Skin de Vara: ${s?.name || r.skinId}`;
}

function RewardIcon({ r }: { r: DailyGiftReward }) {
  const cls = 'w-7 h-7';
  if (r.type === 'coins') return <Coins className={`${cls} text-yellow-400`} />;
  if (r.type === 'multiplier') return r.kind === 'luck'
    ? <Sparkles className={`${cls} text-pink-400`} />
    : <Zap className={`${cls} text-amber-400`} />;
  if (r.type === 'boatSkin') return <Ship className={`${cls} text-cyan-300`} />;
  return <Anchor className={`${cls} text-emerald-300`} />;
}

export default function DailyGifts({ player, onClaim, onBack }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const claimedToday = player.dailyGiftsLastClaim === today;
  const currentDay = player.dailyGiftsDay || 1;
  const currentWeek = player.dailyGiftsWeek || 1;
  const gifts = getDailyGiftsForWeek(currentWeek);
  const [popup, setPopup] = useState<{ reward: DailyGiftReward; day: number } | null>(null);

  const handleClaim = () => {
    const r = onClaim();
    if (r) setPopup(r);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 via-purple-950 to-slate-950 p-6 flex flex-col items-center">
      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" size="sm" onClick={onBack}>← Voltar</Button>
          <h1 className="text-3xl font-black text-white flex items-center gap-2">
            <Gift className="w-7 h-7 text-pink-400" /> Presentes Diários
          </h1>
          <div className="text-sm text-white/70">💰 {player.coins}</div>
        </div>

        <p className="text-center text-white/70 mb-6">
          Resgate uma recompensa todos os dias. Os dois últimos dias dão skins exclusivas!
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
          {DAILY_GIFTS.map((reward, i) => {
            const day = i + 1;
            const isCurrent = day === currentDay && !claimedToday;
            const isClaimed = day < currentDay || (day === currentDay && claimedToday);
            const isLocked = !isCurrent && !isClaimed;
            const isExclusive = reward.type === 'boatSkin' || reward.type === 'rodSkin';

            return (
              <motion.div
                key={day}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`relative rounded-xl border-2 p-3 text-center flex flex-col items-center gap-2 ${
                  isCurrent
                    ? 'border-pink-400 bg-pink-500/10 shadow-lg shadow-pink-500/30 ring-2 ring-pink-400/40'
                    : isClaimed
                      ? 'border-emerald-500/40 bg-emerald-500/5 opacity-70'
                      : isExclusive
                        ? 'border-amber-400/60 bg-gradient-to-b from-amber-500/15 to-purple-500/10'
                        : 'border-white/15 bg-white/5'
                }`}
              >
                <div className="text-xs font-bold text-white/90 uppercase tracking-wider">
                  Dia {day}
                </div>
                <div className="flex items-center justify-center h-12">
                  {isLocked ? <Lock className="w-6 h-6 text-white/40" />
                    : isClaimed ? <Check className="w-6 h-6 text-emerald-400" />
                    : <RewardIcon r={reward} />}
                </div>
                <div className="text-[11px] text-white/80 leading-tight min-h-[28px]">
                  {rewardLabel(reward)}
                </div>
                {isExclusive && (
                  <div className="text-[10px] font-bold text-amber-300 uppercase">Exclusivo</div>
                )}
                {isCurrent && (
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="absolute -top-2 -right-2 bg-pink-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5"
                  >
                    HOJE
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleClaim}
            disabled={claimedToday}
            className="w-72 h-14 text-lg font-bold bg-pink-500 hover:bg-pink-400 text-white disabled:bg-white/10 disabled:text-white/40"
          >
            {claimedToday ? 'Volte amanhã!' : `Resgatar Dia ${currentDay}`}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {popup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPopup(null)}
          >
            <motion.div
              initial={{ scale: 0.7, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.7 }}
              onClick={e => e.stopPropagation()}
              className="bg-gradient-to-br from-pink-600 to-purple-700 border-2 border-pink-300 rounded-2xl p-8 max-w-sm text-center shadow-2xl"
            >
              <div className="mb-3 flex justify-center">
                <RewardIcon r={popup.reward} />
              </div>
              <h2 className="text-2xl font-black text-white mb-1">Dia {popup.day} resgatado!</h2>
              <p className="text-white/90 mb-5">{rewardLabel(popup.reward)}</p>
              <Button onClick={() => setPopup(null)} className="bg-white text-purple-700 hover:bg-white/90 font-bold w-full">
                Continuar
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
