import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import ScreenHeader from './ScreenHeader';
import { screenStagger } from './motion';

type Width = 'narrow' | 'default' | 'wide';

const MAX_WIDTH: Record<Width, string> = {
  narrow: 'max-w-2xl',
  default: 'max-w-4xl',
  wide: 'max-w-5xl',
};

interface Props {
  title: string;
  onBack: () => void;
  subtitle?: ReactNode;
  coins?: number;
  /** Sticky bar pinned to the bottom of the screen, e.g. a "sell all" button. */
  action?: ReactNode;
  width?: Width;
  children: ReactNode;
}

/**
 * The common frame for every non-menu game screen: deep-water ground, a
 * ScreenHeader, a width-bounded content column with the shared page-load
 * sink, and an optional pinned action bar.
 */
export default function GameScreen({
  title,
  onBack,
  subtitle,
  coins,
  action,
  width = 'default',
  children,
}: Props) {
  const reduce = useReducedMotion();

  return (
    <div className="screen-shell deep-shell relative overflow-y-auto">
      <div className={`relative z-10 mx-auto ${MAX_WIDTH[width]} ${action ? 'pb-32' : ''}`}>
        <ScreenHeader title={title} subtitle={subtitle} coins={coins} onBack={onBack} />
        <motion.div variants={screenStagger} initial={reduce ? 'show' : 'hidden'} animate="show">
          {children}
        </motion.div>
      </div>

      {action && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto w-full max-w-md">{action}</div>
        </div>
      )}
    </div>
  );
}
