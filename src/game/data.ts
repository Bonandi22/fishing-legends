import { Fish, FishingLocation } from './types';

export const FISH: Fish[] = [
  // === FRESHWATER COMMON ===
  { id: 'tilapia', name: 'Tilápia', rarity: 'common', waterType: 'freshwater', minWeight: 0.3, maxWeight: 2.5, xp: 10, description: 'Peixe comum de água doce, muito popular.', emoji: '🐟' },
  { id: 'carpa', name: 'Carpa', rarity: 'common', waterType: 'freshwater', minWeight: 1, maxWeight: 8, xp: 12, description: 'Peixe resistente encontrado em rios e lagos.', emoji: '🐟' },
  { id: 'bagre', name: 'Bagre', rarity: 'common', waterType: 'freshwater', minWeight: 0.5, maxWeight: 5, xp: 11, description: 'Peixe de fundo com bigodes característicos.', emoji: '🐡' },
  { id: 'lambari', name: 'Lambari', rarity: 'common', waterType: 'freshwater', minWeight: 0.05, maxWeight: 0.3, xp: 5, description: 'Pequeno peixe prateado de cardume.', emoji: '🐟' },
  { id: 'piranha', name: 'Piranha', rarity: 'common', waterType: 'freshwater', minWeight: 0.2, maxWeight: 1.5, xp: 15, description: 'Famosa pelo apetite voraz.', emoji: '🦈' },

  // === SALTWATER COMMON ===
  { id: 'sardinha', name: 'Sardinha', rarity: 'common', waterType: 'saltwater', minWeight: 0.05, maxWeight: 0.2, xp: 8, description: 'Peixe pequeno que anda em grandes cardumes.', emoji: '🐟' },
  { id: 'tainha', name: 'Tainha', rarity: 'common', waterType: 'saltwater', minWeight: 0.5, maxWeight: 3, xp: 10, description: 'Peixe costeiro muito apreciado.', emoji: '🐟' },
  { id: 'corvina', name: 'Corvina', rarity: 'common', waterType: 'saltwater', minWeight: 1, maxWeight: 5, xp: 12, description: 'Peixe de carne branca e sabor suave.', emoji: '🐟' },
  { id: 'anchova', name: 'Anchova', rarity: 'common', waterType: 'saltwater', minWeight: 0.1, maxWeight: 0.5, xp: 7, description: 'Pequena mas muito saborosa.', emoji: '🐟' },

  // === FRESHWATER UNCOMMON ===
  { id: 'tucunare', name: 'Tucunaré', rarity: 'uncommon', waterType: 'freshwater', minWeight: 2, maxWeight: 12, xp: 35, description: 'Predador agressivo, excelente para pesca esportiva.', emoji: '🐠' },
  { id: 'dourado', name: 'Dourado', rarity: 'uncommon', waterType: 'freshwater', minWeight: 3, maxWeight: 15, xp: 40, description: 'O rei dos rios, brilhante como ouro.', emoji: '🐠' },
  { id: 'truta', name: 'Truta', rarity: 'uncommon', waterType: 'freshwater', minWeight: 0.5, maxWeight: 5, xp: 30, description: 'Peixe de águas frias e cristalinas.', emoji: '🐠' },
  { id: 'pacu', name: 'Pacu', rarity: 'uncommon', waterType: 'freshwater', minWeight: 2, maxWeight: 10, xp: 32, description: 'Parente da piranha, mas herbívoro.', emoji: '🐠' },
  { id: 'pintado', name: 'Pintado', rarity: 'uncommon', waterType: 'freshwater', minWeight: 5, maxWeight: 30, xp: 45, description: 'Grande bagre com manchas escuras.', emoji: '🐠' },

  // === SALTWATER UNCOMMON ===
  { id: 'robalo', name: 'Robalo', rarity: 'uncommon', waterType: 'saltwater', minWeight: 2, maxWeight: 12, xp: 35, description: 'Excelente peixe esportivo costeiro.', emoji: '🐠' },
  { id: 'garoupa', name: 'Garoupa', rarity: 'uncommon', waterType: 'saltwater', minWeight: 3, maxWeight: 20, xp: 38, description: 'Peixe de recife muito saboroso.', emoji: '🐠' },
  { id: 'pargo', name: 'Pargo', rarity: 'uncommon', waterType: 'saltwater', minWeight: 1, maxWeight: 8, xp: 30, description: 'Peixe vermelho de águas profundas.', emoji: '🐠' },
  { id: 'cavala', name: 'Cavala', rarity: 'uncommon', waterType: 'saltwater', minWeight: 2, maxWeight: 10, xp: 33, description: 'Rápida nadadora de mar aberto.', emoji: '🐠' },

  // === FRESHWATER MYTHIC ===
  { id: 'arapaima', name: 'Arapaima', rarity: 'mythic', waterType: 'freshwater', minWeight: 40, maxWeight: 150, xp: 70, description: 'Predador ancestral dos rios amazônicos.', emoji: '✨' },
  { id: 'dourado-real', name: 'Dourado Real', rarity: 'mythic', waterType: 'freshwater', minWeight: 8, maxWeight: 35, xp: 65, description: 'Variante rara do Dourado com escamas brilhantes.', emoji: '✨' },
  { id: 'pirarara', name: 'Pirarara', rarity: 'mythic', waterType: 'freshwater', minWeight: 15, maxWeight: 60, xp: 60, description: 'Bagre gigante de cauda vermelha.', emoji: '✨' },
  { id: 'matrinxa', name: 'Matrinxã', rarity: 'mythic', waterType: 'freshwater', minWeight: 2, maxWeight: 8, xp: 55, description: 'Peixe acrobático que salta fora da água.', emoji: '✨' },

  // === SALTWATER MYTHIC ===
  { id: 'barracuda', name: 'Barracuda', rarity: 'mythic', waterType: 'saltwater', minWeight: 5, maxWeight: 30, xp: 65, description: 'Torpedo prateado dos recifes tropicais.', emoji: '✨' },
  { id: 'wahoo', name: 'Wahoo', rarity: 'mythic', waterType: 'saltwater', minWeight: 8, maxWeight: 45, xp: 70, description: 'Um dos peixes mais rápidos do oceano.', emoji: '✨' },
  { id: 'olhete', name: 'Olhete', rarity: 'mythic', waterType: 'saltwater', minWeight: 5, maxWeight: 25, xp: 58, description: 'Lutador feroz das águas costeiras.', emoji: '✨' },
  { id: 'dourado-do-mar', name: 'Dourado-do-mar', rarity: 'mythic', waterType: 'saltwater', minWeight: 4, maxWeight: 20, xp: 62, description: 'Brilha como ouro sob o sol tropical.', emoji: '✨' },
  { id: 'arraia', name: 'Arraia', rarity: 'mythic', waterType: 'saltwater', minWeight: 10, maxWeight: 60, xp: 68, description: 'Desliza silenciosamente pelas águas salgadas com sua cauda venenosa.', emoji: '✨' },
  { id: 'lucio', name: 'Lúcio', rarity: 'mythic', waterType: 'freshwater', minWeight: 3, maxWeight: 25, xp: 63, description: 'Predador de emboscada dos rios e lagos europeus.', emoji: '✨' },

  // === FRESHWATER LEGENDARY ===
  { id: 'pirarucu', name: 'Pirarucu', rarity: 'legendary', waterType: 'freshwater', minWeight: 50, maxWeight: 200, xp: 150, description: 'O gigante da Amazônia, um dos maiores peixes de água doce.', emoji: '🏆' },
  { id: 'jaú', name: 'Jaú', rarity: 'legendary', waterType: 'freshwater', minWeight: 30, maxWeight: 120, xp: 120, description: 'Gigante silencioso das profundezas dos rios.', emoji: '🏆' },
  { id: 'surubim', name: 'Surubim', rarity: 'legendary', waterType: 'freshwater', minWeight: 10, maxWeight: 60, xp: 100, description: 'Nobre bagre de rios brasileiros.', emoji: '🏆' },
  { id: 'arraia-doce', name: 'Arraia de Água Doce', rarity: 'legendary', waterType: 'freshwater', minWeight: 15, maxWeight: 80, xp: 130, description: 'Majestosa arraia dos rios amazônicos com padrões hipnotizantes.', emoji: '🏆' },

  // === SALTWATER LEGENDARY ===
  { id: 'atum', name: 'Atum', rarity: 'legendary', waterType: 'saltwater', minWeight: 20, maxWeight: 300, xp: 160, description: 'Rei dos oceanos, velocidade e força.', emoji: '🏆' },
  { id: 'espadarte', name: 'Espadarte', rarity: 'legendary', waterType: 'saltwater', minWeight: 50, maxWeight: 400, xp: 180, description: 'Guerreiro dos mares com sua espada.', emoji: '🏆' },
  { id: 'salmao-rei', name: 'Salmão-rei', rarity: 'legendary', waterType: 'saltwater', minWeight: 5, maxWeight: 30, xp: 110, description: 'O mais nobre dos salmões.', emoji: '🏆' },
  { id: 'mero', name: 'Mero', rarity: 'legendary', waterType: 'saltwater', minWeight: 30, maxWeight: 200, xp: 140, description: 'Gigante dos recifes, protegido e raro.', emoji: '🏆' },
  { id: 'peixe-vela', name: 'Peixe-vela', rarity: 'legendary', waterType: 'saltwater', minWeight: 25, maxWeight: 100, xp: 170, description: 'O peixe mais rápido do oceano, com sua vela majestosa.', emoji: '🏆' },

  // === FRESHWATER ABYSSAL ===
  { id: 'peixe-lua-doce', name: 'Peixe-lua Gigante', rarity: 'abyssal', waterType: 'freshwater', minWeight: 100, maxWeight: 500, xp: 500, description: 'Criatura mítica das profundezas lacustres.', emoji: '🌟' },
  { id: 'esturjao', name: 'Esturjão Beluga', rarity: 'abyssal', waterType: 'freshwater', minWeight: 200, maxWeight: 1000, xp: 600, description: 'Fóssil vivo, o maior peixe de água doce do mundo.', emoji: '🌟' },

  // === SALTWATER ABYSSAL ===
  { id: 'celacanto', name: 'Celacanto', rarity: 'abyssal', waterType: 'saltwater', minWeight: 30, maxWeight: 90, xp: 500, description: 'Fóssil vivo dos oceanos, 400 milhões de anos.', emoji: '🌟' },
  { id: 'peixe-lua', name: 'Peixe-lua Oceânico', rarity: 'abyssal', waterType: 'saltwater', minWeight: 200, maxWeight: 2000, xp: 550, description: 'O maior peixe ósseo do mundo.', emoji: '🌟' },
  { id: 'tamboril', name: 'Tamboril Abissal', rarity: 'abyssal', waterType: 'saltwater', minWeight: 5, maxWeight: 50, xp: 480, description: 'Criatura das trevas com sua luz hipnotizante.', emoji: '🌟' },
  { id: 'marlim-azul', name: 'Marlim-azul', rarity: 'abyssal', waterType: 'saltwater', minWeight: 100, maxWeight: 800, xp: 650, description: 'O troféu supremo da pesca oceânica.', emoji: '🌟' },
  { id: 'dragao-negro', name: 'Dragão Negro', rarity: 'abyssal', waterType: 'saltwater', minWeight: 2, maxWeight: 15, xp: 520, description: 'Criatura bioluminescente das trevas abissais, com presas terríveis.', emoji: '🌟' },
];

export const LOCATIONS: FishingLocation[] = [
  // OCEANS
  {
    id: 'atlantic', name: 'Oceano Atlântico', type: 'ocean', waterType: 'saltwater',
    description: 'Águas profundas e azuis do Atlântico.', requiredLevel: 1,
    waterColor: '#1e40af', skyColor: '#7dd3fc', ambientColor: '#bfdbfe',
    fishIds: ['sardinha', 'tainha', 'corvina', 'anchova', 'robalo', 'garoupa', 'barracuda', 'arraia', 'atum', 'peixe-vela', 'celacanto', 'dragao-negro'],
    emoji: '🌊'
  },
  {
    id: 'caribbean', name: 'Mar do Caribe', type: 'ocean', waterType: 'saltwater',
    description: 'Águas cristalinas e tropicais do Caribe.', requiredLevel: 3,
    waterColor: '#06b6d4', skyColor: '#a5f3fc', ambientColor: '#cffafe',
    fishIds: ['sardinha', 'corvina', 'robalo', 'garoupa', 'pargo', 'olhete', 'dourado-do-mar', 'arraia', 'espadarte', 'peixe-vela', 'marlim-azul', 'dragao-negro'],
    emoji: '🏝️'
  },
  {
    id: 'mediterranean', name: 'Mar Mediterrâneo', type: 'ocean', waterType: 'saltwater',
    description: 'Berço da civilização, águas históricas.', requiredLevel: 5,
    waterColor: '#2563eb', skyColor: '#93c5fd', ambientColor: '#dbeafe',
    fishIds: ['sardinha', 'anchova', 'corvina', 'cavala', 'pargo', 'wahoo', 'arraia', 'salmao-rei', 'mero', 'peixe-vela', 'tamboril', 'dragao-negro'],
    emoji: '⚓'
  },
  {
    id: 'pacific', name: 'Oceano Pacífico', type: 'ocean', waterType: 'saltwater',
    description: 'O maior oceano do planeta, águas imensas.', requiredLevel: 8,
    waterColor: '#1d4ed8', skyColor: '#60a5fa', ambientColor: '#93c5fd',
    fishIds: ['tainha', 'cavala', 'garoupa', 'barracuda', 'wahoo', 'arraia', 'atum', 'espadarte', 'salmao-rei', 'peixe-vela', 'peixe-lua', 'marlim-azul', 'dragao-negro'],
    emoji: '🌏'
  },

  // RIVERS
  {
    id: 'amazon', name: 'Rio Amazonas', type: 'river', waterType: 'freshwater',
    description: 'O maior rio do mundo, coração da Amazônia.', requiredLevel: 1,
    waterColor: '#854d0e', skyColor: '#86efac', ambientColor: '#bbf7d0',
    fishIds: ['tilapia', 'piranha', 'lambari', 'tucunare', 'pacu', 'arapaima', 'lucio', 'pirarara', 'pirarucu', 'arraia-doce', 'peixe-lua-doce'],
    emoji: '🌿'
  },
  {
    id: 'nile', name: 'Rio Nilo', type: 'river', waterType: 'freshwater',
    description: 'O rio dos faraós, berço do Egito antigo.', requiredLevel: 4,
    waterColor: '#a16207', skyColor: '#fde68a', ambientColor: '#fef3c7',
    fishIds: ['tilapia', 'bagre', 'carpa', 'tucunare', 'pintado', 'matrinxa', 'lucio', 'jaú', 'arraia-doce', 'esturjao'],
    emoji: '🏛️'
  },
  {
    id: 'mississippi', name: 'Rio Mississippi', type: 'river', waterType: 'freshwater',
    description: 'O grande rio da América do Norte.', requiredLevel: 6,
    waterColor: '#78716c', skyColor: '#d6d3d1', ambientColor: '#e7e5e4',
    fishIds: ['bagre', 'carpa', 'lambari', 'truta', 'dourado', 'dourado-real', 'lucio', 'surubim', 'arraia-doce', 'esturjao'],
    emoji: '🦅'
  },
  {
    id: 'danube', name: 'Rio Danúbio', type: 'river', waterType: 'freshwater',
    description: 'O rio azul da Europa, atravessa 10 países.', requiredLevel: 10,
    waterColor: '#4338ca', skyColor: '#c7d2fe', ambientColor: '#e0e7ff',
    fishIds: ['carpa', 'truta', 'bagre', 'dourado', 'pintado', 'pirarara', 'dourado-real', 'lucio', 'jaú', 'arraia-doce', 'peixe-lua-doce'],
    emoji: '🏰'
  },

  // LAKES
  {
    id: 'titicaca', name: 'Lago Titicaca', type: 'lake', waterType: 'freshwater',
    description: 'O lago navegável mais alto do mundo.', requiredLevel: 2,
    waterColor: '#0284c7', skyColor: '#e0f2fe', ambientColor: '#f0f9ff',
    fishIds: ['tilapia', 'carpa', 'lambari', 'truta', 'pacu', 'matrinxa', 'surubim'],
    emoji: '⛰️'
  },
  {
    id: 'baikal', name: 'Lago Baikal', type: 'lake', waterType: 'freshwater',
    description: 'O lago mais profundo do mundo, na Sibéria.', requiredLevel: 7,
    waterColor: '#164e63', skyColor: '#cffafe', ambientColor: '#ecfeff',
    fishIds: ['carpa', 'truta', 'bagre', 'dourado', 'pintado', 'arapaima', 'jaú', 'esturjao'],
    emoji: '❄️'
  },
  {
    id: 'victoria', name: 'Lago Vitória', type: 'lake', waterType: 'freshwater',
    description: 'O maior lago da África.', requiredLevel: 9,
    waterColor: '#059669', skyColor: '#a7f3d0', ambientColor: '#d1fae5',
    fishIds: ['tilapia', 'piranha', 'bagre', 'tucunare', 'pintado', 'pirarara', 'pirarucu', 'peixe-lua-doce'],
    emoji: '🌍'
  },
  {
    id: 'como', name: 'Lago de Como', type: 'lake', waterType: 'freshwater',
    description: 'O romântico lago italiano nos Alpes.', requiredLevel: 12,
    waterColor: '#0e7490', skyColor: '#bae6fd', ambientColor: '#e0f2fe',
    fishIds: ['carpa', 'truta', 'lambari', 'dourado', 'surubim', 'dourado-real', 'matrinxa', 'jaú', 'esturjao'],
    emoji: '🇮🇹'
  },
];

export function getFishById(id: string): Fish | undefined {
  return FISH.find(f => f.id === id);
}

export function getFishForLocation(location: FishingLocation): Fish[] {
  return location.fishIds.map(id => getFishById(id)).filter(Boolean) as Fish[];
}
