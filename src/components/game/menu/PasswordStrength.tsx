import { useEffect, useState } from 'react';
import { useI18n } from '@/game/i18n';
import { checkPassword } from '@/game/passwordPolicy';
import { COMMON_PASSWORDS } from '@/game/data/commonPasswords';

interface Props { password: string; email: string; username?: string; }

type Scorer = (password: string, userInputs: string[]) => number;

// zxcvbn-ts (core + language pack) is loaded on first use — i.e. when the signup
// form mounts this component — so it stays out of the main bundle.
let scorerPromise: Promise<Scorer> | null = null;
function loadScorer(): Promise<Scorer> {
  scorerPromise ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
  ]).then(([core, common]) => {
    core.zxcvbnOptions.setOptions({
      dictionary: { ...common.dictionary, commonPasswords: [...COMMON_PASSWORDS] },
      graphs: common.adjacencyGraphs,
    });
    return (password, userInputs) => core.zxcvbn(password, userInputs).score;
  });
  return scorerPromise;
}

const BAR_COLORS = ['bg-destructive', 'bg-destructive', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];

export default function PasswordStrength({ password, email, username }: Props) {
  const { t } = useI18n();
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (!password) { setScore(null); return; }
    let alive = true;
    const userInputs = [email.split('@')[0] ?? '', username ?? ''].filter(Boolean);
    loadScorer()
      .then(scorer => { if (alive) setScore(scorer(password.slice(0, 128), userInputs)); })
      .catch(() => { if (alive) setScore(null); }); // visual only: never block on a load failure
    return () => { alive = false; };
  }, [password, email, username]);

  if (!password) return null;
  const issue = checkPassword(password, { email, username });

  return (
    <div className="space-y-1">
      {score !== null && (
        <div
          role="meter" aria-label={t('auth.pw.strength')} aria-valuemin={0} aria-valuemax={4} aria-valuenow={score}
          className="flex gap-1"
        >
          {[0, 1, 2, 3].map(i => (
            <span key={i} className={`h-1.5 flex-1 rounded ${i < Math.max(score, 1) ? BAR_COLORS[score] : 'bg-muted'}`} />
          ))}
        </div>
      )}
      {issue && issue !== 'SAME_AS_CURRENT' && (
        <p role="status" className="text-xs text-destructive">{t(`auth.pw.${issue}` as never)}</p>
      )}
    </div>
  );
}
