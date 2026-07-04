import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type Lang = 'pt' | 'en' | 'es' | 'fr' | 'de' | 'ja';

export const LANG_LABELS: Record<Lang, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ja: '日本語',
};

const translations = {
  // Main Menu
  'menu.subtitle': {
    pt: 'Explore os mares, rios e lagos do mundo',
    en: 'Explore the seas, rivers and lakes of the world',
    es: 'Explora los mares, ríos y lagos del mundo',
    fr: 'Explorez les mers, rivières et lacs du monde',
    de: 'Erkunde die Meere, Flüsse und Seen der Welt',
    ja: '世界の海、川、湖を探索しよう',
  },
  'menu.level': { pt: 'Nível', en: 'Level', es: 'Nivel', fr: 'Niveau', de: 'Level', ja: 'レベル' },
  'menu.fish': { pt: 'peixes', en: 'fish', es: 'peces', fr: 'poissons', de: 'Fische', ja: '匹' },
  'menu.play': { pt: '🐟 Pescar', en: '🐟 Fish', es: '🐟 Pescar', fr: '🐟 Pêcher', de: '🐟 Angeln', ja: '🐟 釣り' },
  'menu.collection': { pt: '📦 Coleção', en: '📦 Collection', es: '📦 Colección', fr: '📦 Collection', de: '📦 Sammlung', ja: '📦 コレクション' },
  'menu.warehouse': { pt: '🏠 Armazém', en: '🏠 Warehouse', es: '🏠 Almacén', fr: '🏠 Entrepôt', de: '🏠 Lager', ja: '🏠 倉庫' },
  'menu.reset': { pt: 'Resetar Progresso', en: 'Reset Progress', es: 'Reiniciar Progreso', fr: 'Réinitialiser', de: 'Fortschritt zurücksetzen', ja: '進行状況リセット' },
  'menu.submarine': { pt: '🤿 Pesca Submarina', en: '🤿 Submarine Fishing', es: '🤿 Pesca Submarina', fr: '🤿 Pêche sous-marine', de: '🤿 Unterwasserfischen', ja: '🤿 水中漁' },
  'menu.multiplier': { pt: '⚡ Multiplicador', en: '⚡ Multiplier', es: '⚡ Multiplicador', fr: '⚡ Multiplicateur', de: '⚡ Multiplikator', ja: '⚡ マルチプライヤー' },
  'menu.skins': { pt: '🎨 Skins', en: '🎨 Skins', es: '🎨 Skins', fr: '🎨 Skins', de: '🎨 Skins', ja: '🎨 スキン' },
  'menu.roulette': { pt: '🎰 Roleta', en: '🎰 Roulette', es: '🎰 Ruleta', fr: '🎰 Roulette', de: '🎰 Roulette', ja: '🎰 ルーレット' },
  'menu.ranking': { pt: '🏆 Ranking', en: '🏆 Ranking', es: '🏆 Clasificación', fr: '🏆 Classement', de: '🏆 Rangliste', ja: '🏆 ランキング' },
  'menu.register': { pt: '📝 Cadastro', en: '📝 Register', es: '📝 Registro', fr: '📝 Inscription', de: '📝 Registrieren', ja: '📝 登録' },

  // Ranking
  'rank.title': { pt: 'Ranking Global', en: 'Global Ranking', es: 'Clasificación Global', fr: 'Classement Global', de: 'Globale Rangliste', ja: 'グローバルランキング' },
  'rank.subtitle': { pt: 'Top 100 melhores pescadores do mundo', en: 'Top 100 anglers in the world', es: 'Top 100 mejores pescadores', fr: 'Top 100 des meilleurs pêcheurs', de: 'Top 100 der besten Angler', ja: '世界トップ100の釣り師' },
  'rank.player': { pt: 'Jogador', en: 'Player', es: 'Jugador', fr: 'Joueur', de: 'Spieler', ja: 'プレイヤー' },
  'rank.level': { pt: 'Nv.', en: 'Lv.', es: 'Nv.', fr: 'Niv.', de: 'Lv.', ja: 'Lv.' },
  'rank.fish': { pt: 'Peixes', en: 'Fish', es: 'Peces', fr: 'Poissons', de: 'Fische', ja: '魚' },
  'rank.profile': { pt: 'Ver Perfil', en: 'View Profile', es: 'Ver Perfil', fr: 'Voir Profil', de: 'Profil ansehen', ja: 'プロフィールを見る' },
  'rank.yourPosition': { pt: 'Sua Posição', en: 'Your Position', es: 'Tu Posición', fr: 'Votre Position', de: 'Deine Position', ja: 'あなたの順位' },
  'rank.fishCaught': { pt: 'Peixes pescados', en: 'Fish caught', es: 'Peces pescados', fr: 'Poissons pêchés', de: 'Gefangene Fische', ja: '釣った魚' },
  'rank.skinsOwned': { pt: 'Skins possuídas', en: 'Skins owned', es: 'Skins poseídas', fr: 'Skins possédés', de: 'Besessene Skins', ja: '所有スキン' },
  'rank.multipliersUsed': { pt: 'Multiplicadores usados', en: 'Multipliers used', es: 'Multiplicadores usados', fr: 'Multiplicateurs utilisés', de: 'Verwendete Multiplikatoren', ja: '使用したマルチプライヤー' },

  // Roulette extras
  'roulette.duplicate': { pt: 'Skin duplicada! Convertida em moedas.', en: 'Duplicate skin! Converted to coins.', es: '¡Skin duplicada! Convertida en monedas.', fr: 'Skin en double ! Converti en pièces.', de: 'Doppelter Skin! In Münzen umgewandelt.', ja: 'スキン重複！コインに変換しました。' },

  // Location Select
  'loc.title': { pt: 'Escolha o Local', en: 'Choose Location', es: 'Elige el Lugar', fr: 'Choisir le Lieu', de: 'Ort wählen', ja: '場所を選ぶ' },
  'loc.level': { pt: 'Nível', en: 'Level', es: 'Nivel', fr: 'Niveau', de: 'Level', ja: 'レベル' },
  'loc.unlocked': { pt: 'desbloqueados', en: 'unlocked', es: 'desbloqueados', fr: 'débloqués', de: 'freigeschaltet', ja: '解放済み' },
  'loc.back': { pt: '← Voltar', en: '← Back', es: '← Volver', fr: '← Retour', de: '← Zurück', ja: '← 戻る' },
  'loc.ocean': { pt: '🌊 Mar', en: '🌊 Sea', es: '🌊 Mar', fr: '🌊 Mer', de: '🌊 Meer', ja: '🌊 海' },
  'loc.river': { pt: '🏞️ Rio', en: '🏞️ River', es: '🏞️ Río', fr: '🏞️ Rivière', de: '🏞️ Fluss', ja: '🏞️ 川' },
  'loc.lake': { pt: '🏔️ Lago', en: '🏔️ Lake', es: '🏔️ Lago', fr: '🏔️ Lac', de: '🏔️ See', ja: '🏔️ 湖' },
  'loc.fishCount': { pt: 'peixes', en: 'fish', es: 'peces', fr: 'poissons', de: 'Fische', ja: '魚' },

  // Fishing Screen
  'fish.castPrompt': { pt: 'Clique na água para lançar a linha! 🎣', en: 'Click on the water to cast! 🎣', es: '¡Haz clic en el agua para lanzar! 🎣', fr: 'Cliquez sur l\'eau pour lancer ! 🎣', de: 'Klicke aufs Wasser zum Auswerfen! 🎣', ja: '水をクリックして投げよう！🎣' },
  'fish.casting': { pt: 'Lançando...', en: 'Casting...', es: 'Lanzando...', fr: 'Lancement...', de: 'Auswerfen...', ja: '投げています...' },
  'fish.waiting': { pt: 'Esperando o peixe morder... 🐟', en: 'Waiting for a bite... 🐟', es: 'Esperando que pique... 🐟', fr: 'En attente d\'une touche... 🐟', de: 'Warte auf einen Biss... 🐟', ja: 'アタリを待っています... 🐟' },
  'fish.hooked': { pt: 'Um peixe mordeu! 🐟💥', en: 'A fish bit! 🐟💥', es: '¡Un pez picó! 🐟💥', fr: 'Un poisson a mordu ! 🐟💥', de: 'Ein Fisch hat angebissen! 🐟💥', ja: '魚がかかった！🐟💥' },
  'fish.pull': { pt: '🎣 PUXAR!', en: '🎣 PULL!', es: '🎣 ¡TIRAR!', fr: '🎣 TIRER !', de: '🎣 ZIEHEN!', ja: '🎣 引け！' },
  'fish.caught': { pt: 'Capturado!', en: 'Caught!', es: '¡Capturado!', fr: 'Capturé !', de: 'Gefangen!', ja: '釣れた！' },
  'fish.escaped': { pt: 'Escapou!', en: 'Escaped!', es: '¡Escapó!', fr: 'Échappé !', de: 'Entkommen!', ja: '逃げられた！' },
  'fish.escapedMsg': { pt: 'fugiu...', en: 'got away...', es: 'se escapó...', fr: 's\'est enfui...', de: 'ist entkommen...', ja: '逃げた...' },
  'fish.tryAgain': { pt: 'Tente novamente!', en: 'Try again!', es: '¡Inténtalo de nuevo!', fr: 'Réessayez !', de: 'Versuch es nochmal!', ja: 'もう一度！' },
  'fish.fishAgain': { pt: 'Pescar Novamente 🎣', en: 'Fish Again 🎣', es: 'Pescar de Nuevo 🎣', fr: 'Pêcher encore 🎣', de: 'Nochmal Angeln 🎣', ja: 'もう一度釣る 🎣' },
  'fish.tryAgainBtn': { pt: 'Tentar Novamente 🎣', en: 'Try Again 🎣', es: 'Intentar de Nuevo 🎣', fr: 'Réessayer 🎣', de: 'Erneut versuchen 🎣', ja: 'リトライ 🎣' },
  'fish.back': { pt: '← Voltar', en: '← Back', es: '← Volver', fr: '← Retour', de: '← Zurück', ja: '← 戻る' },
  'fish.lucky': { pt: '✨ 2x SORTE ✨', en: '✨ 2x LUCK ✨', es: '✨ 2x SUERTE ✨', fr: '✨ 2x CHANCE ✨', de: '✨ 2x GLÜCK ✨', ja: '✨ 2倍ラッキー ✨' },

  // Pull Minigame
  'pull.instruction': { pt: 'Clique em PUXAR quando a linha estiver no verde!', en: 'Click PULL when the line is in the green!', es: '¡Haz clic en TIRAR cuando la línea esté en verde!', fr: 'Cliquez TIRER quand la ligne est dans le vert !', de: 'Klicke ZIEHEN wenn die Linie im Grünen ist!', ja: '緑のゾーンで「引け」をクリック！' },
  'pull.capture': { pt: '✅ Captura', en: '✅ Capture', es: '✅ Captura', fr: '✅ Capture', de: '✅ Fang', ja: '✅ 捕獲' },
  'pull.escape': { pt: '❌ Escape', en: '❌ Escape', es: '❌ Escape', fr: '❌ Échappée', de: '❌ Entkommen', ja: '❌ 逃走' },

  // Collection
  'col.title': { pt: 'Coleção', en: 'Collection', es: 'Colección', fr: 'Collection', de: 'Sammlung', ja: 'コレクション' },
  'col.species': { pt: 'espécies', en: 'species', es: 'especies', fr: 'espèces', de: 'Arten', ja: '種' },
  'col.caught': { pt: 'peixes pescados', en: 'fish caught', es: 'peces pescados', fr: 'poissons pêchés', de: 'gefangene Fische', ja: '釣った魚' },
  'col.level': { pt: 'Nível', en: 'Level', es: 'Nivel', fr: 'Niveau', de: 'Level', ja: 'レベル' },
  'col.totalCaught': { pt: 'Total Pescado', en: 'Total Caught', es: 'Total Pescado', fr: 'Total Pêché', de: 'Gesamt gefangen', ja: '合計' },
  'col.speciesCount': { pt: 'Espécies', en: 'Species', es: 'Especies', fr: 'Espèces', de: 'Arten', ja: '種類' },
  'col.heaviest': { pt: 'Mais Pesado', en: 'Heaviest', es: 'Más Pesado', fr: 'Plus Lourd', de: 'Schwerster', ja: '最重量' },
  'col.record': { pt: 'Recorde', en: 'Record', es: 'Récord', fr: 'Record', de: 'Rekord', ja: '記録' },
  'col.all': { pt: 'Todos', en: 'All', es: 'Todos', fr: 'Tous', de: 'Alle', ja: '全部' },

  // Warehouse
  'wh.title': { pt: '🏠 Armazém', en: '🏠 Warehouse', es: '🏠 Almacén', fr: '🏠 Entrepôt', de: '🏠 Lager', ja: '🏠 倉庫' },
  'wh.stored': { pt: 'peixes armazenados', en: 'fish stored', es: 'peces almacenados', fr: 'poissons stockés', de: 'gelagerte Fische', ja: '保管中の魚' },
  'wh.empty': { pt: 'Armazém vazio', en: 'Warehouse empty', es: 'Almacén vacío', fr: 'Entrepôt vide', de: 'Lager leer', ja: '倉庫は空です' },
  'wh.emptyMsg': { pt: 'Pesque peixes para armazená-los aqui!', en: 'Catch fish to store them here!', es: '¡Pesca peces para almacenarlos aquí!', fr: 'Pêchez des poissons pour les stocker ici !', de: 'Fange Fische um sie hier zu lagern!', ja: '魚を釣って保管しよう！' },
  'wh.sell': { pt: '💰 Vender', en: '💰 Sell', es: '💰 Vender', fr: '💰 Vendre', de: '💰 Verkaufen', ja: '💰 売る' },

  // Rarity
  'rarity.common': { pt: 'Comum', en: 'Common', es: 'Común', fr: 'Commun', de: 'Gewöhnlich', ja: 'コモン' },
  'rarity.uncommon': { pt: 'Incomum', en: 'Uncommon', es: 'Poco Común', fr: 'Peu commun', de: 'Ungewöhnlich', ja: 'アンコモン' },
  'rarity.mythic': { pt: 'Mítico', en: 'Mythic', es: 'Mítico', fr: 'Mythique', de: 'Mythisch', ja: 'ミシック' },
  'rarity.legendary': { pt: 'Lendário', en: 'Legendary', es: 'Legendario', fr: 'Légendaire', de: 'Legendär', ja: 'レジェンダリー' },
  'rarity.abyssal': { pt: 'Abissal', en: 'Abyssal', es: 'Abisal', fr: 'Abyssal', de: 'Abyssal', ja: 'アビサル' },
  'rarity.volcanic': { pt: 'Vulcânica', en: 'Volcanic', es: 'Volcánica', fr: 'Volcanique', de: 'Vulkanisch', ja: 'ボルカニック' },
  'rarity.platinum': { pt: 'Platina', en: 'Platinum', es: 'Platino', fr: 'Platine', de: 'Platin', ja: 'プラチナ' },
  'rarity.legends': { pt: 'Lendas', en: 'Legends', es: 'Leyendas', fr: 'Légendes', de: 'Legenden', ja: 'レジェンズ' },

  // Settings
  'settings.language': { pt: 'Idioma', en: 'Language', es: 'Idioma', fr: 'Langue', de: 'Sprache', ja: '言語' },
  'settings.music': { pt: 'Música', en: 'Music', es: 'Música', fr: 'Musique', de: 'Musik', ja: '音楽' },

  // Submarine fishing
  'sub.title': { pt: 'Pesca Submarina', en: 'Submarine Fishing', es: 'Pesca Submarina', fr: 'Pêche sous-marine', de: 'Unterwasserfischen', ja: '水中漁' },
  'sub.hint': { pt: 'Clique em um peixe para lançar o arpão! 🔱', en: 'Click a fish to launch the harpoon! 🔱', es: '¡Haz clic en un pez para lanzar el arpón! 🔱', fr: 'Cliquez sur un poisson pour lancer le harpon ! 🔱', de: 'Klicke auf einen Fisch um die Harpune zu werfen! 🔱', ja: '魚をクリックしてモリを投げよう！🔱' },
  'sub.back': { pt: '← Voltar', en: '← Back', es: '← Volver', fr: '← Retour', de: '← Zurück', ja: '← 戻る' },

  // Multiplier
  'mult.title': { pt: '⚡ Multiplicadores', en: '⚡ Multipliers', es: '⚡ Multiplicadores', fr: '⚡ Multiplicateurs', de: '⚡ Multiplikatoren', ja: '⚡ マルチプライヤー' },
  'mult.coins': { pt: 'moedas', en: 'coins', es: 'monedas', fr: 'pièces', de: 'Münzen', ja: 'コイン' },
  'mult.luck': { pt: 'Sorte', en: 'Luck', es: 'Suerte', fr: 'Chance', de: 'Glück', ja: '幸運' },
  'mult.luckDesc': { pt: 'Durante 1 minuto, pesque apenas peixes Míticos, Lendários e Abissais!', en: 'For 1 minute, catch only Mythic, Legendary and Abyssal fish!', es: 'Durante 1 minuto, ¡pesca solo peces Míticos, Legendarios y Abisales!', fr: 'Pendant 1 minute, pêchez uniquement des poissons Mythiques, Légendaires et Abyssaux !', de: 'Für 1 Minute nur Mythische, Legendäre und Abyssale Fische!', ja: '1分間、ミシック・レジェンダリー・アビサルの魚だけ！' },
  'mult.strength': { pt: 'Força', en: 'Strength', es: 'Fuerza', fr: 'Force', de: 'Stärke', ja: '力' },
  'mult.strengthDesc': { pt: 'Durante 1 minuto, a barrinha branca fica mais lenta em todas as raridades!', en: 'For 1 minute, the pull bar moves slower for all rarities!', es: 'Durante 1 minuto, ¡la barra blanca se mueve más lento!', fr: 'Pendant 1 minute, la barre blanche ralentit !', de: 'Für 1 Minute bewegt sich der weiße Balken langsamer!', ja: '1分間、全レアリティのバーが遅くなる！' },
  'mult.minute': { pt: 'minuto', en: 'minute', es: 'minuto', fr: 'minute', de: 'Minute', ja: '分' },
  'mult.active': { pt: 'Ativo!', en: 'Active!', es: '¡Activo!', fr: 'Actif !', de: 'Aktiv!', ja: '有効！' },
  'mult.buy': { pt: 'Comprar', en: 'Buy', es: 'Comprar', fr: 'Acheter', de: 'Kaufen', ja: '購入' },
  'mult.noCoins': { pt: 'Moedas insuficientes', en: 'Not enough coins', es: 'Monedas insuficientes', fr: 'Pas assez de pièces', de: 'Nicht genug Münzen', ja: 'コイン不足' },

  // Skins
  'skins.title': { pt: '🎨 Skins de Vara', en: '🎨 Rod Skins', es: '🎨 Skins de Caña', fr: '🎨 Skins de Canne', de: '🎨 Ruten-Skins', ja: '🎨 ロッドスキン' },
  'skins.buy': { pt: 'Comprar', en: 'Buy', es: 'Comprar', fr: 'Acheter', de: 'Kaufen', ja: '購入' },
  'skins.equip': { pt: 'Equipar', en: 'Equip', es: 'Equipar', fr: 'Équiper', de: 'Ausrüsten', ja: '装備' },
  'skins.equipped': { pt: 'Equipado', en: 'Equipped', es: 'Equipado', fr: 'Équipé', de: 'Ausgerüstet', ja: '装備中' },
  'skins.visual': { pt: '🛶 Visual do Barco', en: '🛶 Boat Visual', es: '🛶 Visual del Barco', fr: '🛶 Visuel du Bateau', de: '🛶 Boot-Design', ja: '🛶 ボートビジュアル' },
  'boat.title': { pt: '🛶 Visuais do Barco', en: '🛶 Boat Visuals', es: '🛶 Visuales del Barco', fr: '🛶 Visuels du Bateau', de: '🛶 Boot-Designs', ja: '🛶 ボートビジュアル' },
  'rank.boatsOwned': { pt: 'Visuais de barco', en: 'Boat visuals', es: 'Visuales de barco', fr: 'Visuels de bateau', de: 'Boot-Designs', ja: 'ボートビジュアル' },

  // Roulette
  'roulette.title': { pt: '🎰 Roleta Diária', en: '🎰 Daily Roulette', es: '🎰 Ruleta Diaria', fr: '🎰 Roulette Quotidienne', de: '🎰 Tägliches Roulette', ja: '🎰 デイリールーレット' },
  'roulette.spin': { pt: '🎰 Girar!', en: '🎰 Spin!', es: '🎰 ¡Girar!', fr: '🎰 Tourner !', de: '🎰 Drehen!', ja: '🎰 回す！' },
  'roulette.spinning': { pt: 'Girando...', en: 'Spinning...', es: 'Girando...', fr: 'En cours...', de: 'Dreht sich...', ja: '回転中...' },
  'roulette.won': { pt: 'Você ganhou!', en: 'You won!', es: '¡Ganaste!', fr: 'Vous avez gagné !', de: 'Du hast gewonnen!', ja: '当たり！' },
  'roulette.used': { pt: 'Você já girou a roleta hoje! Volte amanhã.', en: 'You already spun today! Come back tomorrow.', es: '¡Ya giraste hoy! Vuelve mañana.', fr: 'Vous avez déjà tourné aujourd\'hui ! Revenez demain.', de: 'Du hast heute schon gedreht! Komm morgen wieder.', ja: '今日はもう回しました！明日また来てね。' },
  'roulette.daily': { pt: 'Você pode girar a roleta 1 vez por dia', en: 'You can spin the roulette once per day', es: 'Puedes girar la ruleta 1 vez al día', fr: 'Vous pouvez tourner la roulette 1 fois par jour', de: 'Du kannst das Roulette 1 mal pro Tag drehen', ja: 'ルーレットは1日1回回せます' },
  'menu.skinRoulette': { pt: '🎡 Roleta de Skins', en: '🎡 Skin Roulette', es: '🎡 Ruleta de Skins', fr: '🎡 Roulette de Skins', de: '🎡 Skin-Roulette', ja: '🎡 スキンルーレット' },
  'menu.aquarium': { pt: '🐠 Aquário', en: '🐠 Aquarium', es: '🐠 Acuario', fr: '🐠 Aquarium', de: '🐠 Aquarium', ja: '🐠 水族館' },
  'aquarium.title': { pt: 'Aquário', en: 'Aquarium', es: 'Acuario', fr: 'Aquarium', de: 'Aquarium', ja: '水族館' },
  'aquarium.storage': { pt: 'Armazém do Aquário', en: 'Aquarium Storage', es: 'Almacén del Acuario', fr: 'Stockage Aquarium', de: 'Aquariumlager', ja: '水族館倉庫' },
  'aquarium.tank': { pt: 'Tanque', en: 'Tank', es: 'Tanque', fr: 'Aquarium', de: 'Tank', ja: 'タンク' },
  'aquarium.sector': { pt: 'Setor', en: 'Sector', es: 'Sector', fr: 'Secteur', de: 'Sektor', ja: 'セクター' },
  'aquarium.emptySector': { pt: 'Setor vazio', en: 'Empty sector', es: 'Sector vacío', fr: 'Secteur vide', de: 'Leerer Sektor', ja: '空のセクター' },
  'aquarium.emptySectorMsg': { pt: 'Mova peixes do armazém para este setor.', en: 'Move fish from storage into this sector.', es: 'Mueve peces del almacén a este sector.', fr: 'Déplacez des poissons du stockage vers ce secteur.', de: 'Bewege Fische aus dem Lager in diesen Sektor.', ja: '倉庫からこのセクターへ魚を移動。' },
  'aquarium.storageEmpty': { pt: 'Sem peixes em excesso. Encha o armazém principal primeiro!', en: 'No overflow fish. Fill the main warehouse first!', es: 'Sin peces sobrantes. ¡Llena primero el almacén principal!', fr: 'Pas de poissons en surplus. Remplissez d\'abord l\'entrepôt principal !', de: 'Keine Überlauf-Fische. Fülle zuerst das Hauptlager!', ja: '余剰魚なし。まずメイン倉庫を満杯に！' },
  'aquarium.pickSector': { pt: 'Escolha o setor para colocar este peixe:', en: 'Pick the sector to place this fish:', es: 'Elige el sector para este pez:', fr: 'Choisissez le secteur pour ce poisson :', de: 'Wähle den Sektor für diesen Fisch:', ja: 'この魚を置くセクターを選択：' },
  'skinRoulette.title': { pt: '🎡 Roleta de Skins', en: '🎡 Skin Roulette', es: '🎡 Ruleta de Skins', fr: '🎡 Roulette de Skins', de: '🎡 Skin-Roulette', ja: '🎡 スキンルーレット' },
  'skinRoulette.hint': { pt: 'Cada giro custa 1500 moedas. Você só pode ganhar skins de vara ou de barco.', en: 'Each spin costs 1500 coins. You can only win rod or boat skins.', es: 'Cada giro cuesta 1500 monedas. Solo puedes ganar skins de caña o barco.', fr: 'Chaque tour coûte 1500 pièces. Vous ne pouvez gagner que des skins de canne ou de bateau.', de: 'Jede Drehung kostet 1500 Münzen. Du kannst nur Ruten- oder Bootsskins gewinnen.', ja: '1回1500コイン。竿または船のスキンのみ獲得できます。' },
  'skinRoulette.noCoins': { pt: 'Moedas insuficientes!', en: 'Not enough coins!', es: '¡Monedas insuficientes!', fr: 'Pièces insuffisantes !', de: 'Nicht genug Münzen!', ja: 'コインが足りません！' },
  'skinRoulette.rodWon': { pt: '(Skin de vara — duplicada vira 500 💰)', en: '(Rod skin — duplicate becomes 500 💰)', es: '(Skin de caña — duplicada se convierte en 500 💰)', fr: '(Skin de canne — doublon devient 500 💰)', de: '(Rutenskin — Duplikat wird zu 500 💰)', ja: '(竿スキン — 重複は500💰に)' },
  'skinRoulette.boatWon': { pt: '(Skin de barco — duplicada vira 500 💰)', en: '(Boat skin — duplicate becomes 500 💰)', es: '(Skin de barco — duplicada se convierte en 500 💰)', fr: '(Skin de bateau — doublon devient 500 💰)', de: '(Bootsskin — Duplikat wird zu 500 💰)', ja: '(船スキン — 重複は500💰に)' },

  // Account
  'account.title': { pt: 'Minha Conta', en: 'My Account', es: 'Mi Cuenta', fr: 'Mon Compte', de: 'Mein Konto', ja: 'マイアカウント' },
  'account.email': { pt: 'E-mail', en: 'Email', es: 'Correo', fr: 'E-mail', de: 'E-Mail', ja: 'メール' },
  'account.password': { pt: 'Senha', en: 'Password', es: 'Contraseña', fr: 'Mot de passe', de: 'Passwort', ja: 'パスワード' },
  'account.birthdate': { pt: 'Data de Nascimento', en: 'Date of Birth', es: 'Fecha de Nacimiento', fr: 'Date de naissance', de: 'Geburtsdatum', ja: '生年月日' },
  'account.save': { pt: 'Salvar Conta', en: 'Save Account', es: 'Guardar Cuenta', fr: 'Sauvegarder', de: 'Konto speichern', ja: 'アカウント保存' },
  'account.saved': { pt: '✅ Conta salva!', en: '✅ Account saved!', es: '✅ ¡Cuenta guardada!', fr: '✅ Compte sauvegardé !', de: '✅ Konto gespeichert!', ja: '✅ アカウント保存済み！' },
  'account.loggedAs': { pt: 'Logado como', en: 'Logged in as', es: 'Conectado como', fr: 'Connecté en tant que', de: 'Angemeldet als', ja: 'ログイン中' },
  'account.username': { pt: 'Nome de usuário', en: 'Username', es: 'Nombre de usuario', fr: 'Nom d\'utilisateur', de: 'Benutzername', ja: 'ユーザー名' },
  'account.chooseUsername': { pt: 'Escolha um nome de usuário para aparecer no ranking.', en: 'Choose a username to appear in the ranking.', es: 'Elige un nombre de usuario para aparecer en el ranking.', fr: 'Choisissez un nom d\'utilisateur pour apparaître dans le classement.', de: 'Wähle einen Benutzernamen für die Rangliste.', ja: 'ランキングに表示されるユーザー名を選んでください。' },
  'account.country': { pt: 'País', en: 'Country', es: 'País', fr: 'Pays', de: 'Land', ja: '国' },
  'account.confirmUsername': { pt: 'Confirmar', en: 'Confirm', es: 'Confirmar', fr: 'Confirmer', de: 'Bestätigen', ja: '確認' },
  'account.editUsername': { pt: 'Editar nome de usuário', en: 'Edit username', es: 'Editar nombre de usuario', fr: 'Modifier le nom', de: 'Benutzername bearbeiten', ja: 'ユーザー名を編集' },
  'rank.empty': { pt: 'Nenhum jogador no ranking ainda. Cadastre-se e jogue para aparecer aqui!', en: 'No players in the ranking yet. Register and play to appear here!', es: '¡Aún no hay jugadores! Regístrate y juega para aparecer.', fr: 'Aucun joueur encore. Inscrivez-vous et jouez !', de: 'Noch keine Spieler. Registriere dich und spiele!', ja: 'まだプレイヤーがいません。登録してプレイしましょう！' },
  'account.haveAccount': { pt: 'Já tem conta? Entrar', en: 'Already have an account? Log in', es: '¿Ya tienes cuenta? Iniciar sesión', fr: 'Déjà un compte ? Se connecter', de: 'Schon ein Konto? Anmelden', ja: 'アカウントをお持ちですか？ログイン' },
  'account.newAccount': { pt: 'Criar nova conta', en: 'Create new account', es: 'Crear cuenta nueva', fr: 'Créer un compte', de: 'Neues Konto', ja: '新規アカウント作成' },
  'account.login': { pt: 'Entrar', en: 'Log in', es: 'Entrar', fr: 'Se connecter', de: 'Anmelden', ja: 'ログイン' },
  'account.loginTitle': { pt: 'Entrar na conta', en: 'Log in to account', es: 'Iniciar sesión', fr: 'Connexion', de: 'Anmeldung', ja: 'ログイン' },
  'account.loginUsername': { pt: 'Nome de utilizador da conta salva', en: 'Username of saved account', es: 'Nombre de usuario guardado', fr: 'Nom d\'utilisateur enregistré', de: 'Benutzername des gespeicherten Kontos', ja: '保存されたユーザー名' },
  'account.loginNotFound': { pt: 'Conta não encontrada com esse nome de utilizador.', en: 'No account found with that username.', es: 'No se encontró la cuenta.', fr: 'Compte introuvable.', de: 'Konto nicht gefunden.', ja: 'アカウントが見つかりません。' },
  'account.loggedIn': { pt: '✅ Entrou com sucesso!', en: '✅ Logged in successfully!', es: '✅ ¡Sesión iniciada!', fr: '✅ Connecté !', de: '✅ Angemeldet!', ja: '✅ ログインしました！' },
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

export function getRarityLabel(rarity: string, lang: Lang): string {
  const key = `rarity.${rarity}` as TransKey;
  return translations[key]?.[lang] ?? rarity;
}
