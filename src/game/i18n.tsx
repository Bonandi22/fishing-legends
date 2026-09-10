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
  'menu.storage': { pt: 'Armazém', en: 'Storage', es: 'Almacén', fr: 'Entrepôt', de: 'Lager', ja: '倉庫' },
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
  'menu.tutorialTitle': { pt: 'Como jogar', en: 'How to play', es: 'Cómo jugar', fr: 'Comment jouer', de: 'So wird gespielt', ja: '遊び方' },
  'menu.tutorialBody': { pt: 'Escolha um local, clique na água para lançar e toque em PUXAR quando a linha entrar na área verde.', en: 'Choose a location, click the water to cast, then tap PULL when the line enters the green zone.', es: 'Elige un lugar, haz clic en el agua y pulsa TIRAR cuando la línea entre en la zona verde.', fr: 'Choisissez un lieu, cliquez sur l’eau puis appuyez sur TIRER quand la ligne entre dans la zone verte.', de: 'Wähle einen Ort, wirf aus und tippe ZIEHEN, sobald die Linie im grünen Bereich ist.', ja: '場所を選び、水をクリックして投げ、線が緑の範囲に入ったら「引く」をタップ。' },
  'menu.tutorialDismiss': { pt: 'Entendi', en: 'Got it', es: 'Entendido', fr: 'Compris', de: 'Verstanden', ja: 'わかりました' },
  'menu.tagline': { pt: 'A pesca começa aqui', en: 'The catch starts here', es: 'La pesca empieza aquí', fr: 'La pêche commence ici', de: 'Hier beginnt der Fang', ja: '釣りはここから' },
  'menu.sectionBoat': { pt: 'O barco', en: 'The boat', es: 'El barco', fr: 'Le bateau', de: 'Das Boot', ja: '船' },
  'menu.sectionLuck': { pt: 'Sorte & economia', en: 'Luck & economy', es: 'Suerte y economía', fr: 'Chance & économie', de: 'Glück & Wirtschaft', ja: '運と経済' },
  'menu.worldLabel': { pt: 'Mundo', en: 'World', es: 'Mundo', fr: 'Monde', de: 'Welt', ja: 'ワールド' },
  'menu.unlockAt': { pt: 'Desbloqueia no nível', en: 'Unlocks at level', es: 'Se desbloquea en el nivel', fr: 'Débloqué au niveau', de: 'Freigeschaltet ab Level', ja: '解放レベル' },
  'menu.settingsTitle': { pt: 'Definições', en: 'Settings', es: 'Ajustes', fr: 'Réglages', de: 'Einstellungen', ja: '設定' },
  'menu.musicTrack': { pt: 'Faixa', en: 'Track', es: 'Pista', fr: 'Piste', de: 'Titel', ja: 'トラック' },
  'menu.species': { pt: 'espécies', en: 'species', es: 'especies', fr: 'espèces', de: 'Arten', ja: '種' },
  'menu.close': { pt: 'Fechar', en: 'Close', es: 'Cerrar', fr: 'Fermer', de: 'Schließen', ja: '閉じる' },
  'menu.dailyGifts': { pt: 'Presentes', en: 'Gifts', es: 'Regalos', fr: 'Cadeaux', de: 'Geschenke', ja: 'プレゼント' },

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
  'rank.loading': { pt: 'Carregando ranking…', en: 'Loading ranking…', es: 'Cargando clasificación…', fr: 'Chargement du classement…', de: 'Rangliste wird geladen…', ja: 'ランキングを読み込み中…' },
  'rank.season.active': { pt: 'Temporada ativa', en: 'Active season', es: 'Temporada activa', fr: 'Saison active', de: 'Aktive Saison', ja: 'アクティブシーズン' },
  'rank.season.scheduled': { pt: 'Próxima temporada', en: 'Upcoming season', es: 'Próxima temporada', fr: 'Prochaine saison', de: 'Kommende Saison', ja: '次のシーズン' },
  'rank.season.closed': { pt: 'Temporada encerrada', en: 'Season closed', es: 'Temporada cerrada', fr: 'Saison terminée', de: 'Saison beendet', ja: 'シーズン終了' },

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
  'loc.charted': { pt: 'cartografados', en: 'charted', es: 'cartografiados', fr: 'cartographiés', de: 'kartiert', ja: '踏破' },
  'loc.reachLevel': { pt: 'Alcança o nível', en: 'Reach level', es: 'Alcanza el nivel', fr: 'Atteignez le niveau', de: 'Erreiche Level', ja: 'レベル' },
  'loc.world': { pt: 'Mundo', en: 'World', es: 'Mundo', fr: 'Monde', de: 'Welt', ja: 'ワールド' },

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
  'fish.castNet': { pt: 'Lançar a rede', en: 'Cast the net', es: 'Lanzar la red', fr: 'Lancer le filet', de: 'Netz auswerfen', ja: '網を投げる' },
  'fish.nets': { pt: 'Redes', en: 'Nets', es: 'Redes', fr: 'Filets', de: 'Netze', ja: '網' },
  'fish.netShop': { pt: 'Loja', en: 'Shop', es: 'Tienda', fr: 'Boutique', de: 'Laden', ja: 'ショップ' },

  // Pull Minigame
  'pull.instruction': { pt: 'Clique em PUXAR quando a linha estiver no verde!', en: 'Click PULL when the line is in the green!', es: '¡Haz clic en TIRAR cuando la línea esté en verde!', fr: 'Cliquez TIRER quand la ligne est dans le vert !', de: 'Klicke ZIEHEN wenn die Linie im Grünen ist!', ja: '緑のゾーンで「引け」をクリック！' },
  'pull.capture': { pt: '✅ Captura', en: '✅ Capture', es: '✅ Captura', fr: '✅ Capture', de: '✅ Fang', ja: '✅ 捕獲' },
  'pull.escape': { pt: '❌ Escape', en: '❌ Escape', es: '❌ Escape', fr: '❌ Échappée', de: '❌ Entkommen', ja: '❌ 逃走' },
  'pull.tapHint': { pt: 'Toque ou pressione Enter quando estiver no verde', en: 'Tap or press Enter while in the green zone', es: 'Toca o pulsa Enter en la zona verde', fr: 'Touchez ou appuyez sur Entrée dans le vert', de: 'Tippe oder drücke Enter im grünen Bereich', ja: '緑の範囲でタップまたはEnter' },

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
  'wh.name': { pt: 'Armazém', en: 'Warehouse', es: 'Almacén', fr: 'Entrepôt', de: 'Lager', ja: '倉庫' },
  'wh.sellAll': { pt: 'Vender tudo', en: 'Sell everything', es: 'Vender todo', fr: 'Tout vendre', de: 'Alles verkaufen', ja: 'すべて売る' },
  'wh.totalWeight': { pt: 'Peso total', en: 'Total weight', es: 'Peso total', fr: 'Poids total', de: 'Gesamtgewicht', ja: '総重量' },
  'wh.yield': { pt: 'Rendimento', en: 'Yield', es: 'Rendimiento', fr: 'Rendement', de: 'Ertrag', ja: '収益' },

  // Rarity
  'rarity.common': { pt: 'Comum', en: 'Common', es: 'Común', fr: 'Commun', de: 'Gewöhnlich', ja: 'コモン' },
  'rarity.uncommon': { pt: 'Incomum', en: 'Uncommon', es: 'Poco Común', fr: 'Peu commun', de: 'Ungewöhnlich', ja: 'アンコモン' },
  'rarity.mythic': { pt: 'Mítico', en: 'Mythic', es: 'Mítico', fr: 'Mythique', de: 'Mythisch', ja: 'ミシック' },
  'rarity.legendary': { pt: 'Lendário', en: 'Legendary', es: 'Legendario', fr: 'Légendaire', de: 'Legendär', ja: 'レジェンダリー' },
  'rarity.abyssal': { pt: 'Abissal', en: 'Abyssal', es: 'Abisal', fr: 'Abyssal', de: 'Abyssal', ja: 'アビサル' },
  'rarity.volcanic': { pt: 'Vulcânica', en: 'Volcanic', es: 'Volcánica', fr: 'Volcanique', de: 'Vulkanisch', ja: 'ボルカニック' },
  'rarity.platinum': { pt: 'Platina', en: 'Platinum', es: 'Platino', fr: 'Platine', de: 'Platin', ja: 'プラチナ' },
  'rarity.cosmic': { pt: 'Cósmica', en: 'Cosmic', es: 'Cósmica', fr: 'Cosmique', de: 'Kosmisch', ja: 'コスミック' },
  'rarity.legends': { pt: 'Lendas', en: 'Legends', es: 'Leyendas', fr: 'Légendes', de: 'Legenden', ja: 'レジェンズ' },

  // Settings
  'settings.language': { pt: 'Idioma', en: 'Language', es: 'Idioma', fr: 'Langue', de: 'Sprache', ja: '言語' },
  'settings.music': { pt: 'Música', en: 'Music', es: 'Música', fr: 'Musique', de: 'Musik', ja: '音楽' },

  // Submarine fishing
  'sub.title': { pt: 'Pesca Submarina', en: 'Submarine Fishing', es: 'Pesca Submarina', fr: 'Pêche sous-marine', de: 'Unterwasserfischen', ja: '水中漁' },
  'sub.hint': { pt: 'Clique em um peixe para lançar o arpão! 🔱', en: 'Click a fish to launch the harpoon! 🔱', es: '¡Haz clic en un pez para lanzar el arpón! 🔱', fr: 'Cliquez sur un poisson pour lancer le harpon ! 🔱', de: 'Klicke auf einen Fisch um die Harpune zu werfen! 🔱', ja: '魚をクリックしてモリを投げよう！🔱' },
  'sub.back': { pt: '← Voltar', en: '← Back', es: '← Volver', fr: '← Retour', de: '← Zurück', ja: '← 戻る' },
  'sub.unavailable': { pt: 'Mergulho indisponível de momento.', en: 'The dive is unavailable right now.', es: 'La inmersión no está disponible ahora.', fr: "La plongée est indisponible pour l'instant.", de: 'Der Tauchgang ist gerade nicht verfügbar.', ja: 'ダイブは現在利用できません。' },

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
  'skins.name': { pt: 'Skins de vara', en: 'Rod skins', es: 'Skins de caña', fr: 'Skins de canne', de: 'Ruten-Skins', ja: 'ロッドスキン' },
  'skins.boatLink': { pt: 'Visuais do barco', en: 'Boat visuals', es: 'Visuales del barco', fr: 'Visuels du bateau', de: 'Boot-Designs', ja: 'ボートビジュアル' },
  'boat.title': { pt: '🛶 Visuais do Barco', en: '🛶 Boat Visuals', es: '🛶 Visuales del Barco', fr: '🛶 Visuels du Bateau', de: '🛶 Boot-Designs', ja: '🛶 ボートビジュアル' },
  'boat.name': { pt: 'Visuais do barco', en: 'Boat visuals', es: 'Visuales del barco', fr: 'Visuels du bateau', de: 'Boot-Designs', ja: 'ボートビジュアル' },
  'mult.name': { pt: 'Multiplicadores', en: 'Multipliers', es: 'Multiplicadores', fr: 'Multiplicateurs', de: 'Multiplikatoren', ja: 'マルチプライヤー' },
  'net.name': { pt: 'Paiol de redes', en: 'Net locker', es: 'Pañol de redes', fr: 'Casier à filets', de: 'Netzspind', ja: '網ロッカー' },
  'net.subtitle': { pt: 'Cada rede custa {n} moedas', en: 'Each net costs {n} coins', es: 'Cada red cuesta {n} monedas', fr: 'Chaque filet coûte {n} pièces', de: 'Jedes Netz kostet {n} Münzen', ja: '網1つ {n} コイン' },
  'net.available': { pt: 'Redes disponíveis', en: 'Nets available', es: 'Redes disponibles', fr: 'Filets disponibles', de: 'Verfügbare Netze', ja: '利用可能な網' },
  'net.buyOne': { pt: 'Comprar 1 rede', en: 'Buy 1 net', es: 'Comprar 1 red', fr: 'Acheter 1 filet', de: '1 Netz kaufen', ja: '網を1つ購入' },
  'net.full': { pt: 'Limite máximo atingido', en: 'At maximum', es: 'Límite máximo alcanzado', fr: 'Limite atteinte', de: 'Maximum erreicht', ja: '上限に達しました' },
  'net.castTitle': { pt: 'Lançar a rede', en: 'Cast the net', es: 'Lanzar la red', fr: 'Lancer le filet', de: 'Netz auswerfen', ja: '網を投げる' },
  'net.type': { pt: 'Rede', en: 'Net', es: 'Red', fr: 'Filet', de: 'Netz', ja: '網' },
  'net.pieces': { pt: 'peixes', en: 'fish', es: 'peces', fr: 'poissons', de: 'Fische', ja: '匹' },
  'net.random': { pt: 'Rede sorteada aleatoriamente', en: 'Net drawn at random', es: 'Red sorteada al azar', fr: 'Filet tiré au hasard', de: 'Netz zufällig gezogen', ja: 'ランダムに引いた網' },
  'net.pullHint': { pt: 'Toque em PUXAR quando a barra branca estiver na zona verde', en: 'Tap PULL when the white bar is in the green zone', es: 'Pulsa TIRAR cuando la barra blanca esté en la zona verde', fr: 'Appuyez sur TIRER quand la barre blanche est dans la zone verte', de: 'Tippe ZIEHEN, wenn der weiße Balken in der grünen Zone ist', ja: '白いバーが緑の範囲にきたら「引く」をタップ' },
  'net.strengthActive': { pt: 'Força ativa', en: 'Strength active', es: 'Fuerza activa', fr: 'Force active', de: 'Stärke aktiv', ja: '力が有効' },
  'net.pull': { pt: 'Puxar', en: 'Pull', es: 'Tirar', fr: 'Tirer', de: 'Ziehen', ja: '引く' },
  'net.pulled': { pt: 'Rede puxada!', en: 'Net pulled!', es: '¡Red recogida!', fr: 'Filet remonté !', de: 'Netz eingeholt!', ja: '網を引いた！' },
  'net.pulledMsg': { pt: 'algo se move lá dentro...', en: 'something moves inside...', es: 'algo se mueve dentro...', fr: 'quelque chose bouge à l\'intérieur...', de: 'da drin bewegt sich etwas...', ja: '中で何かが動いている...' },
  'net.open': { pt: 'Abrir a rede', en: 'Open the net', es: 'Abrir la red', fr: 'Ouvrir le filet', de: 'Netz öffnen', ja: '網を開ける' },
  'net.received': { pt: 'Recebeste {n} peixes', en: 'You got {n} fish', es: 'Recibiste {n} peces', fr: 'Vous avez reçu {n} poissons', de: 'Du hast {n} Fische bekommen', ja: '{n} 匹を獲得' },
  'net.receivedMsg': { pt: 'Os peixes foram para o armazém.', en: 'The fish went to the warehouse.', es: 'Los peces fueron al almacén.', fr: 'Les poissons sont allés à l\'entrepôt.', de: 'Die Fische gingen ins Lager.', ja: '魚は倉庫へ送られました。' },
  'net.castAnother': { pt: 'Lançar outra rede', en: 'Cast another net', es: 'Lanzar otra red', fr: 'Lancer un autre filet', de: 'Weiteres Netz auswerfen', ja: 'もう一度網を投げる' },
  'net.noNets': { pt: 'Sem redes', en: 'No nets', es: 'Sin redes', fr: 'Plus de filets', de: 'Keine Netze', ja: '網がありません' },
  'net.noNetsMsg': { pt: 'Compra mais redes na loja para continuar.', en: 'Buy more nets in the shop to continue.', es: 'Compra más redes en la tienda para continuar.', fr: 'Achetez plus de filets en boutique pour continuer.', de: 'Kaufe im Laden mehr Netze, um fortzufahren.', ja: 'ショップで網を買って続けよう。' },
  'net.escaped': { pt: 'A rede escapou!', en: 'The net slipped!', es: '¡La red se escapó!', fr: 'Le filet a filé !', de: 'Das Netz ist entwischt!', ja: '網が逃げた！' },
  'net.escapedMsg': { pt: 'Puxaste fora da zona verde.', en: 'You pulled outside the green zone.', es: 'Tiraste fuera de la zona verde.', fr: 'Vous avez tiré hors de la zone verte.', de: 'Du hast außerhalb der grünen Zone gezogen.', ja: '緑の範囲の外で引いてしまった。' },
  'net.retry': { pt: 'Tentar de novo', en: 'Try again', es: 'Reintentar', fr: 'Réessayer', de: 'Nochmal', ja: 'もう一度' },
  'rank.boatsOwned': { pt: 'Visuais de barco', en: 'Boat visuals', es: 'Visuales de barco', fr: 'Visuels de bateau', de: 'Boot-Designs', ja: 'ボートビジュアル' },

  // Roulette
  'roulette.title': { pt: '🎰 Roleta Diária', en: '🎰 Daily Roulette', es: '🎰 Ruleta Diaria', fr: '🎰 Roulette Quotidienne', de: '🎰 Tägliches Roulette', ja: '🎰 デイリールーレット' },
  'roulette.name': { pt: 'Roleta diária', en: 'Daily roulette', es: 'Ruleta diaria', fr: 'Roulette quotidienne', de: 'Tägliches Roulette', ja: 'デイリールーレット' },
  'skinRoulette.name': { pt: 'Roleta de skins', en: 'Skin roulette', es: 'Ruleta de skins', fr: 'Roulette de skins', de: 'Skin-Roulette', ja: 'スキンルーレット' },
  'roulette.spin': { pt: '🎰 Girar!', en: '🎰 Spin!', es: '🎰 ¡Girar!', fr: '🎰 Tourner !', de: '🎰 Drehen!', ja: '🎰 回す！' },
  'roulette.spinning': { pt: 'Girando...', en: 'Spinning...', es: 'Girando...', fr: 'En cours...', de: 'Dreht sich...', ja: '回転中...' },
  'roulette.won': { pt: 'Você ganhou!', en: 'You won!', es: '¡Ganaste!', fr: 'Vous avez gagné !', de: 'Du hast gewonnen!', ja: '当たり！' },
  'roulette.used': { pt: 'Você já girou a roleta hoje! Volte amanhã.', en: 'You already spun today! Come back tomorrow.', es: '¡Ya giraste hoy! Vuelve mañana.', fr: 'Vous avez déjà tourné aujourd\'hui ! Revenez demain.', de: 'Du hast heute schon gedreht! Komm morgen wieder.', ja: '今日はもう回しました！明日また来てね。' },
  'roulette.daily': { pt: 'Você pode girar a roleta 1 vez por dia', en: 'You can spin the roulette once per day', es: 'Puedes girar la ruleta 1 vez al día', fr: 'Vous pouvez tourner la roulette 1 fois par jour', de: 'Du kannst das Roulette 1 mal pro Tag drehen', ja: 'ルーレットは1日1回回せます' },
  'roulette.failed': { pt: 'Não deu para girar agora. Tenta de novo.', en: 'Could not spin right now. Try again.', es: 'No se pudo girar ahora. Inténtalo de nuevo.', fr: 'Impossible de tourner maintenant. Réessayez.', de: 'Drehen gerade nicht möglich. Versuch es erneut.', ja: '今は回せませんでした。もう一度お試しください。' },
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
  'aquarium.pickSectorFirst': { pt: 'Escolha um setor acima, depois toque num peixe.', en: 'Pick a sector above, then tap a fish.', es: 'Elige un sector arriba y luego toca un pez.', fr: 'Choisissez un secteur ci-dessus, puis touchez un poisson.', de: 'Wähle oben einen Sektor, dann tippe einen Fisch an.', ja: '上でセクターを選び、魚をタップ。' },
  'aquarium.sectorSelected': { pt: 'Setor {n} selecionado — toque num peixe para enviá-lo (um de cada vez).', en: 'Sector {n} selected — tap a fish to send it (one at a time).', es: 'Sector {n} seleccionado — toca un pez para enviarlo (uno a la vez).', fr: 'Secteur {n} sélectionné — touchez un poisson pour l\'envoyer (un à la fois).', de: 'Sektor {n} gewählt — tippe einen Fisch an, um ihn zu senden (einzeln).', ja: 'セクター{n}を選択 — 魚をタップして送る（1匹ずつ）。' },
  'aquarium.reward': { pt: 'Recompensa', en: 'Reward', es: 'Recompensa', fr: 'Récompense', de: 'Belohnung', ja: '報酬' },

  // Daily gifts
  'daily.name': { pt: 'Presentes diários', en: 'Daily gifts', es: 'Regalos diarios', fr: 'Cadeaux quotidiens', de: 'Tägliche Geschenke', ja: 'デイリーギフト' },
  'daily.subtitleFirst': { pt: 'Resgate uma recompensa por dia. Os dois últimos dias dão skins exclusivas.', en: 'Claim one reward a day. The last two days grant exclusive skins.', es: 'Reclama una recompensa al día. Los dos últimos días dan skins exclusivas.', fr: 'Réclamez une récompense par jour. Les deux derniers jours offrent des skins exclusifs.', de: 'Fordere täglich eine Belohnung an. Die letzten beiden Tage geben exklusive Skins.', ja: '1日1つ報酬を受け取ろう。最後の2日は限定スキン。' },
  'daily.subtitleRotation': { pt: 'Semana {n} — moedas e multiplicadores. Volte todo dia.', en: 'Week {n} — coins and multipliers. Come back every day.', es: 'Semana {n} — monedas y multiplicadores. Vuelve cada día.', fr: 'Semaine {n} — pièces et multiplicateurs. Revenez chaque jour.', de: 'Woche {n} — Münzen und Multiplikatoren. Komm täglich wieder.', ja: '第{n}週 — コインとマルチプライヤー。毎日来てね。' },
  'daily.day': { pt: 'Dia', en: 'Day', es: 'Día', fr: 'Jour', de: 'Tag', ja: '日' },
  'daily.today': { pt: 'Hoje', en: 'Today', es: 'Hoy', fr: "Aujourd'hui", de: 'Heute', ja: '今日' },
  'daily.exclusive': { pt: 'Exclusivo', en: 'Exclusive', es: 'Exclusivo', fr: 'Exclusif', de: 'Exklusiv', ja: '限定' },
  'daily.claimDay': { pt: 'Resgatar dia', en: 'Claim day', es: 'Reclamar día', fr: 'Réclamer jour', de: 'Tag einlösen', ja: '受け取る 日' },
  'daily.comeBack': { pt: 'Volte amanhã', en: 'Come back tomorrow', es: 'Vuelve mañana', fr: 'Revenez demain', de: 'Komm morgen wieder', ja: 'また明日' },
  'daily.claimedSuffix': { pt: 'resgatado!', en: 'claimed!', es: '¡reclamado!', fr: 'réclamé !', de: 'eingelöst!', ja: '受け取り済み！' },
  'daily.continue': { pt: 'Continuar', en: 'Continue', es: 'Continuar', fr: 'Continuer', de: 'Weiter', ja: '続ける' },
  'daily.coins': { pt: 'moedas', en: 'coins', es: 'monedas', fr: 'pièces', de: 'Münzen', ja: 'コイン' },
  'daily.rewardLuck': { pt: '2x Sorte (1 min)', en: '2x Luck (1 min)', es: '2x Suerte (1 min)', fr: '2x Chance (1 min)', de: '2x Glück (1 Min)', ja: '2x 幸運 (1分)' },
  'daily.rewardStrength': { pt: '2x Força (1 min)', en: '2x Strength (1 min)', es: '2x Fuerza (1 min)', fr: '2x Force (1 min)', de: '2x Stärke (1 Min)', ja: '2x 力 (1分)' },
  'daily.boatSkin': { pt: 'Skin de barco', en: 'Boat skin', es: 'Skin de barco', fr: 'Skin de bateau', de: 'Bootsskin', ja: '船スキン' },
  'daily.rodSkin': { pt: 'Skin de vara', en: 'Rod skin', es: 'Skin de caña', fr: 'Skin de canne', de: 'Rutenskin', ja: '竿スキン' },
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
  'auth.emailLabel': { pt: 'E-mail', en: 'Email', es: 'Correo', fr: 'E-mail', de: 'E-Mail', ja: 'メール' },
  'auth.passwordLabel': { pt: 'Palavra-passe', en: 'Password', es: 'Contraseña', fr: 'Mot de passe', de: 'Passwort', ja: 'パスワード' },
  'auth.passwordHint': { pt: 'Mínimo 12 caracteres', en: 'At least 12 characters', es: 'Mínimo 12 caracteres', fr: 'Au moins 12 caractères', de: 'Mindestens 12 Zeichen', ja: '12文字以上' },
  'auth.usernameLabel': { pt: 'Nome de utilizador', en: 'Username', es: 'Usuario', fr: "Nom d'utilisateur", de: 'Benutzername', ja: 'ユーザー名' },
  'auth.usernameHint': { pt: '3 a 20 caracteres: letras, números e _', en: '3 to 20 characters: letters, numbers and _', es: '3 a 20 caracteres: letras, números y _', fr: '3 à 20 caractères : lettres, chiffres et _', de: '3 bis 20 Zeichen: Buchstaben, Zahlen und _', ja: '3〜20文字：英数字とアンダースコア' },
  'auth.emailHint': { pt: 'Introduz um e-mail válido', en: 'Enter a valid email', es: 'Introduce un correo válido', fr: 'Saisissez un e-mail valide', de: 'Gib eine gültige E-Mail ein', ja: '有効なメールアドレスを入力してください' },
  'auth.countryLabel': { pt: 'País', en: 'Country', es: 'País', fr: 'Pays', de: 'Land', ja: '国' },
  'auth.signupCta': { pt: 'Criar conta', en: 'Create account', es: 'Crear cuenta', fr: 'Créer un compte', de: 'Konto erstellen', ja: 'アカウント作成' },
  'auth.loginCta': { pt: 'Entrar', en: 'Log in', es: 'Entrar', fr: 'Se connecter', de: 'Anmelden', ja: 'ログイン' },
  'auth.logoutCta': { pt: 'Sair', en: 'Log out', es: 'Salir', fr: 'Se déconnecter', de: 'Abmelden', ja: 'ログアウト' },
  'auth.haveAccount': { pt: 'Já tenho conta', en: 'I already have an account', es: 'Ya tengo cuenta', fr: "J'ai déjà un compte", de: 'Ich habe schon ein Konto', ja: 'アカウントを持っています' },
  'auth.needAccount': { pt: 'Criar uma conta nova', en: 'Create a new account', es: 'Crear una cuenta nueva', fr: 'Créer un nouveau compte', de: 'Neues Konto erstellen', ja: '新しいアカウントを作成' },
  'auth.err.INVALID_CREDENTIALS': { pt: 'E-mail ou palavra-passe inválidos', en: 'Invalid email or password', es: 'Correo o contraseña inválidos', fr: 'E-mail ou mot de passe invalide', de: 'E-Mail oder Passwort ungültig', ja: 'メールまたはパスワードが違います' },
  'auth.err.ACCOUNT_ALREADY_EXISTS': { pt: 'Já existe uma conta com esse e-mail', en: 'An account with that email already exists', es: 'Ya existe una cuenta con ese correo', fr: 'Un compte avec cet e-mail existe déjà', de: 'Ein Konto mit dieser E-Mail existiert bereits', ja: 'そのメールのアカウントは既に存在します' },
  'auth.err.USERNAME_TAKEN': { pt: 'Esse nome de utilizador já está em uso', en: 'That username is already taken', es: 'Ese usuario ya está en uso', fr: "Ce nom d'utilisateur est déjà pris", de: 'Dieser Benutzername ist vergeben', ja: 'そのユーザー名は使われています' },
  'auth.err.VALIDATION_ERROR': { pt: 'Verifica os campos', en: 'Check the fields', es: 'Revisa los campos', fr: 'Vérifiez les champs', de: 'Prüfe die Felder', ja: '入力を確認してください' },
  'auth.err.SIGNUP_INVALID': { pt: 'Verifica os campos destacados: palavra-passe 12+, nome de utilizador 3–20 (letras, números e _)', en: 'Check the highlighted fields: password 12+, username 3–20 (letters, numbers and _)', es: 'Revisa los campos destacados: contraseña 12+, usuario 3–20 (letras, números y _)', fr: 'Vérifiez les champs en surbrillance : mot de passe 12+, nom d\'utilisateur 3–20 (lettres, chiffres et _)', de: 'Prüfe die markierten Felder: Passwort 12+, Benutzername 3–20 (Buchstaben, Zahlen und _)', ja: 'ハイライトされた項目を確認：パスワード12文字以上、ユーザー名3〜20文字（英数字とアンダースコア）' },
  'auth.err.NETWORK': { pt: 'Sem ligação ao servidor', en: 'No connection to the server', es: 'Sin conexión al servidor', fr: 'Pas de connexion au serveur', de: 'Keine Verbindung zum Server', ja: 'サーバーに接続できません' },
  'auth.err.CSRF_FAILED': { pt: 'Sessão expirada, recarrega a página', en: 'Session expired, reload the page', es: 'Sesión expirada, recarga la página', fr: 'Session expirée, rechargez la page', de: 'Sitzung abgelaufen, Seite neu laden', ja: 'セッションが切れました。ページを再読み込みしてください' },
  'auth.err.RATE_LIMITED': { pt: 'Demasiadas tentativas, tenta daqui a um bocado', en: 'Too many attempts, try again in a moment', es: 'Demasiados intentos, inténtalo en un momento', fr: 'Trop de tentatives, réessayez dans un instant', de: 'Zu viele Versuche, versuche es gleich erneut', ja: '試行が多すぎます。少し時間をおいてください' },
  'auth.err.GENERIC': { pt: 'Algo correu mal, tenta de novo', en: 'Something went wrong, try again', es: 'Algo salió mal, inténtalo de nuevo', fr: "Une erreur s'est produite, réessayez", de: 'Etwas ist schiefgelaufen, versuche es erneut', ja: '問題が発生しました。もう一度お試しください' },
  'auth.importTitle': { pt: 'Importar o teu progresso local?', en: 'Import your local progress?', es: '¿Importar tu progreso local?', fr: 'Importer votre progression locale ?', de: 'Lokalen Fortschritt importieren?', ja: 'ローカルの進行状況をインポートしますか？' },
  'auth.importBody': { pt: 'Nível {level}, {coins} moedas, {fish} peixes.', en: 'Level {level}, {coins} coins, {fish} fish.', es: 'Nivel {level}, {coins} monedas, {fish} peces.', fr: 'Niveau {level}, {coins} pièces, {fish} poissons.', de: 'Level {level}, {coins} Münzen, {fish} Fische.', ja: 'レベル{level}、{coins}コイン、{fish}匹。' },
  'auth.importYes': { pt: 'Importar', en: 'Import', es: 'Importar', fr: 'Importer', de: 'Importieren', ja: 'インポート' },
  'auth.importNo': { pt: 'Agora não', en: 'Not now', es: 'Ahora no', fr: 'Pas maintenant', de: 'Jetzt nicht', ja: '後で' },
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
