

## 🎣 Jogo de Pesca 3D - Plano de Implementação

### Visão Geral
Jogo de pesca 3D com React Three Fiber, 10+ locais reais do mundo, variedade de peixes classificados por raridade, mecânica de puxar com barra verde/vermelha, e sistema de progressão com níveis.

---

### 🌊 Locais de Pesca (12 locais)
**Mares:** Oceano Atlântico, Mar do Caribe, Mar Mediterrâneo, Oceano Pacífico
**Rios:** Rio Amazonas, Rio Nilo, Rio Mississippi, Rio Danúbio
**Lagos:** Lago Titicaca, Lago Baikal, Lago Vitória, Lago de Como

Cada local terá cenário 3D com água animada, cores e ambiente distintos. Locais avançados são desbloqueados com nível.

---

### 🐟 Sistema de Peixes (4 Classes de Raridade)
- **Comum** (60% chance) — Tilápia, Sardinha, Carpa, Bagre, etc.
- **Incomum** (25% chance) — Tucunaré, Dourado, Robalo, Truta, etc.
- **Lendário/Raro** (12% chance) — Pirarucu, Atum, Espadarte, Salmão-rei, etc.
- **Abissal/Extra Raro** (3% chance) — Celacanto, Peixe-lua, Tamboril, Marlim-azul, etc.

Peixes diferentes por tipo de água (salgada/doce). Cada peixe com nome, peso, imagem e classe.

---

### 🎮 Mecânica de Jogo
1. **Tela de seleção de local** — mapa mundial com locais desbloqueados
2. **Cena 3D do local** — água animada, cenário temático
3. **Clique na água** para lançar a linha
4. **Espera** (3-10s aleatório) até peixe morder
5. **Botão "PUXAR"** aparece ao fisgar
6. **Mini-game de puxar:**
   - Barra horizontal com zona verde e vermelha
   - Linha branca vertical oscilando automaticamente
   - Ficar 10s no verde = pega o peixe ✅
   - Ficar 15s no vermelho = perde o peixe ❌
   - Peixes raros têm zona verde menor e linha mais rápida

---

### 📈 Sistema de Progressão
- **XP** por peixe pescado (mais XP = peixe mais raro)
- **Níveis** (1-20) que desbloqueiam novos locais e aumentam chances de peixes raros
- **Coleção** — inventário com todos os peixes já pescados
- **Recordes** — maior peixe, mais pesado, etc.

---

### 🖥️ Telas
1. **Menu Principal** — Jogar, Coleção, Configurações
2. **Mapa Mundial** — Seleção de local com preview
3. **Cena de Pesca** — Vista 3D com HUD (nível, XP, local)
4. **Mini-game de Puxar** — Overlay com barra verde/vermelha
5. **Resultado** — Peixe capturado com detalhes (nome, peso, classe, XP ganho)
6. **Coleção/Inventário** — Grid de peixes organizados por raridade

---

### 🛠️ Tecnologias
- **React Three Fiber** (@react-three/fiber@^8.18 + @react-three/drei@^9.122.0) para cenas 3D
- **Three.js** para água, iluminação e cenários
- **localStorage** para salvar progresso do jogador
- **Framer Motion** para animações de UI

