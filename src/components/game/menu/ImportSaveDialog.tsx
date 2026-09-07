import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/game/i18n';
import type { ImportPreview } from '@/game/auth/importFlow';

interface Props {
  preview: ImportPreview | null;
  onImport: () => void;
  onDismiss: () => void;
}

export default function ImportSaveDialog({ preview, onImport, onDismiss }: Props) {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {preview && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true"
            className="menu-panel w-full max-w-sm rounded-2xl border border-lure/40 p-6 text-center"
          >
            <h2 className="mb-2 font-display text-xl font-bold text-foreground">{t('auth.importTitle')}</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              {t('auth.importBody')
                .replace('{level}', String(preview.localLevel))
                .replace('{coins}', String(preview.localCoins))
                .replace('{fish}', String(preview.summary.accepted))}
            </p>
            <div className="flex gap-3">
              <Button className="flex-1 bg-lure font-semibold text-lure-foreground hover:bg-lure/90" onClick={onImport}>{t('auth.importYes')}</Button>
              <Button variant="outline" className="flex-1 border-lure/25" onClick={onDismiss}>{t('auth.importNo')}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
