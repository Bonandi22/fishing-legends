import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type Lang = 'pt' | 'en';

const translations = {
  // Main Menu
  'menu.subtitle': { pt: 'Explore os mares, rios e lagos do mundo', en: 'Explore the seas, rivers and lakes of the world' },
  'menu.level': { pt: 'Nível', en: 'Level' },
  'menu.fish': { pt: 'peixes', en: 'fish' },
  'menu.play': { pt: '🐟 Pescar', en: '🐟 Fish' },
  'menu.collection': { pt: '📦 Coleção', en: '📦 Collection' },
  'menu.warehouse': { pt: '🏠 Armazém', en: '🏠 Warehouse' },
  'menu.reset': { pt: 'Resetar Progresso', en: 'Reset Progress' },

  // Location Select
  'loc.title': { pt: 'Escolha o Local', en: 'Choose Location' },
  'loc.level': { pt: 'Nível', en: 'Level' },
  'loc.unlocked': { pt: 'desbloqueados', en: 'unlocked' },
  'loc.back': { pt: '← Voltar', en: '← Back' },
  'loc.ocean': { pt: '🌊 Mar', en: '🌊 Sea' },
  'loc.river': { pt: '🏞️ Rio', en: '🏞️ River' },
  'loc.lake': { pt: '🏔️ Lago', en: '🏔️ Lake' },
  'loc.fishCount': { pt: 'peixes', en: 'fish' },

  // Fishing Screen
  'fish.castPrompt': { pt: 'Clique na água para lançar a linha! 🎣', en: 'Click on the water to cast! 🎣' },
  'fish.casting': { pt: 'Lançando...', en: 'Casting...' },
  'fish.waiting': { pt: 'Esperando o peixe morder... 🐟', en: 'Waiting for a bite... 🐟' },
  'fish.hooked': { pt: 'Um peixe mordeu! 🐟💥', en: 'A fish bit! 🐟💥' },
  'fish.pull': { pt: '🎣 PUXAR!', en: '🎣 PULL!' },
  'fish.caught': { pt: 'Capturado!', en: 'Caught!' },
  'fish.escaped': { pt: 'Escapou!', en: 'Escaped!' },
  'fish.escapedMsg': { pt: 'fugiu...', en: 'got away...' },
  'fish.tryAgain': { pt: 'Tente novamente!', en: 'Try again!' },
  'fish.fishAgain': { pt: 'Pescar Novamente 🎣', en: 'Fish Again 🎣' },
  'fish.tryAgainBtn': { pt: 'Tentar Novamente 🎣', en: 'Try Again 🎣' },
  'fish.back': { pt: '← Voltar', en: '← Back' },
  'fish.lucky': { pt: '✨ 2x SORTE ✨', en: '✨ 2x LUCK ✨' },

  // Pull Minigame
  'pull.instruction': { pt: 'Clique em PUXAR quando a linha estiver no verde!', en: 'Click PULL when the line is in the green!' },
  'pull.capture': { pt: '✅ Captura', en: '✅ Capture' },
  'pull.escape': { pt: '❌ Escape', en: '❌ Escape' },

  // Collection
  'col.title': { pt: 'Coleção', en: 'Collection' },
  'col.species': { pt: 'espécies', en: 'species' },
  'col.caught': { pt: 'peixes pescados', en: 'fish caught' },
  'col.level': { pt: 'Nível', en: 'Level' },
  'col.totalCaught': { pt: 'Total Pescado', en: 'Total Caught' },
  'col.speciesCount': { pt: 'Espécies', en: 'Species' },
  'col.heaviest': { pt: 'Mais Pesado', en: 'Heaviest' },
  'col.record': { pt: 'Recorde', en: 'Record' },
  'col.all': { pt: 'Todos', en: 'All' },

  // Warehouse
  'wh.title': { pt: '🏠 Armazém', en: '🏠 Warehouse' },
  'wh.stored': { pt: 'peixes armazenados', en: 'fish stored' },
  'wh.empty': { pt: 'Armazém vazio', en: 'Warehouse empty' },
  'wh.emptyMsg': { pt: 'Pesque peixes para armazená-los aqui!', en: 'Catch fish to store them here!' },
  'wh.sell': { pt: '💰 Vender', en: '💰 Sell' },

  // Rarity
  'rarity.common': { pt: 'Comum', en: 'Common' },
  'rarity.uncommon': { pt: 'Incomum', en: 'Uncommon' },
  'rarity.mythic': { pt: 'Mítico', en: 'Mythic' },
  'rarity.legendary': { pt: 'Lendário', en: 'Legendary' },
  'rarity.abyssal': { pt: 'Abissal', en: 'Abyssal' },

  // Settings
  'settings.language': { pt: 'Idioma', en: 'Language' },
  'settings.music': { pt: 'Música', en: 'Music' },
} as const;

type TransKey = keyof typeof translations;

interface I18nContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TransKey) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'pt',
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem('game-lang') as Lang) || 'pt';
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('game-lang', l);
  }, []);

  const t = useCallback((key: TransKey) => {
    return translations[key]?.[lang] ?? key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

// Helper to get rarity label by lang
export function getRarityLabel(rarity: string, lang: Lang): string {
  const key = `rarity.${rarity}` as TransKey;
  return translations[key]?.[lang] ?? rarity;
}
