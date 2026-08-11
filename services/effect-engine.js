const fail = (message, statusCode = 409) => {
  throw Object.assign(new Error(message), { statusCode });
};

const drawCards = (player, amount) => {
  const drawn = player.deck.splice(0, Math.min(amount, player.deck.length));
  player.hand.push(...drawn);
  return drawn.length;
};

const strongest = (cards) => [...cards].sort((a, b) => Number(b.attack || 0) - Number(a.attack || 0))[0];

const selectCard = (cards, guid, label) => {
  const card = guid ? cards.find((item) => item.guid_id === guid) : strongest(cards);
  if (!card) fail(label);
  return card;
};

const destroyMonster = (owner, card) => {
  owner.field.monsters = owner.field.monsters.filter((item) => item.guid_id !== card.guid_id);
  owner.graveyard.push(card);
};

const destroyAllMonsters = (...players) => {
  for (const player of players) {
    player.graveyard.push(...player.field.monsters);
    player.field.monsters = [];
  }
};

const EFFECT_BY_CODE = {
  '0': () => fail('Lá bài này không có effect'),
  '1': ({ opponent, payload }) => {
    const target = selectCard(opponent.field.monsters, payload.targetGuid, 'Đối thủ không có quái thú để phá');
    destroyMonster(opponent, target);
    return `Phá ${target.name}`;
  },
  '2': ({ self, payload }) => {
    const target = selectCard(self.field.monsters, payload.targetGuid, 'Bạn không có quái thú để tăng ATK');
    target.attack = Number(target.attack || 0) + 500;
    return `${target.name} tăng 500 ATK`;
  },
  '3': ({ self }) => `Rút ${drawCards(self, 2)} lá`,
  '4': ({ opponent, payload }) => {
    const target = selectCard(opponent.field.monsters, payload.targetGuid, 'Đối thủ không có quái thú để vô hiệu');
    target.effect_negated = true;
    return `Vô hiệu effect của ${target.name}`;
  },
  '5': ({ opponent }) => {
    opponent.lifepoint = Math.max(0, opponent.lifepoint - 1000);
    return 'Gây 1000 damage';
  },
  '6': ({ self, opponent }) => { destroyAllMonsters(self, opponent); return 'Phá toàn bộ quái thú'; },
  '7': ({ self, opponent, payload }) => {
    if (self.field.monsters.length >= 5) fail('Monster zone đã đầy');
    const pool = [...self.graveyard, ...opponent.graveyard].filter((card) => card.type === 'monster');
    const target = selectCard(pool, payload.targetGuid, 'Không có quái thú trong mộ để hồi sinh');
    const owner = self.graveyard.some((card) => card.guid_id === target.guid_id) ? self : opponent;
    owner.graveyard = owner.graveyard.filter((card) => card.guid_id !== target.guid_id);
    self.field.monsters.push({ ...target, mode: 'attack', status: 'open', has_attacked: false });
    return `Hồi sinh ${target.name}`;
  },
  '8': ({ opponent, payload }) => {
    const target = payload.targetGuid
      ? opponent.field.spellsTraps.find((card) => card.guid_id === payload.targetGuid)
      : opponent.field.spellsTraps[0];
    if (!target) fail('Đối thủ không có Spell/Trap để phá');
    opponent.field.spellsTraps = opponent.field.spellsTraps.filter((card) => card.guid_id !== target.guid_id);
    opponent.graveyard.push(target);
    return `Phá ${target.name}`;
  },
};

const EFFECT_BY_NAME = {
  'dark hole': ({ self, opponent }) => { destroyAllMonsters(self, opponent); return 'Dark Hole phá toàn bộ quái thú'; },
  'mystical space typhoon': EFFECT_BY_CODE['8'],
  'pot of greed': EFFECT_BY_CODE['3'],
  'mirror force': ({ opponent }) => {
    const attackers = opponent.field.monsters.filter((card) => card.mode !== 'defense');
    attackers.forEach((card) => destroyMonster(opponent, card));
    return `Mirror Force phá ${attackers.length} quái thú tấn công`;
  },
  'ring of destruction': ({ self, opponent, payload }) => {
    const target = selectCard(opponent.field.monsters, payload.targetGuid, 'Không có quái thú để Ring of Destruction phá');
    const damage = Number(target.attack || 0);
    destroyMonster(opponent, target);
    self.lifepoint = Math.max(0, self.lifepoint - damage);
    opponent.lifepoint = Math.max(0, opponent.lifepoint - damage);
    return `Phá ${target.name}, hai bên nhận ${damage} damage`;
  },
  'monster reborn': EFFECT_BY_CODE['7'],
  'raigeki': ({ opponent }) => { destroyAllMonsters(opponent); return 'Raigeki phá toàn bộ quái thú đối thủ'; },
  'graceful charity': ({ self }) => {
    const drawn = drawCards(self, 3);
    const discarded = self.hand.splice(Math.max(0, self.hand.length - 2), 2);
    self.graveyard.push(...discarded);
    return `Rút ${drawn} lá và bỏ ${discarded.length} lá xuống mộ`;
  },
  'torrential tribute': ({ self, opponent }) => { destroyAllMonsters(self, opponent); return 'Torrential Tribute phá toàn bộ quái thú'; },
  'magic cylinder': ({ opponent, payload }) => {
    const target = selectCard(opponent.field.monsters, payload.targetGuid, 'Không có quái thú tấn công để phản damage');
    const damage = Number(target.attack || 0);
    opponent.lifepoint = Math.max(0, opponent.lifepoint - damage);
    return `Magic Cylinder gây ${damage} damage`;
  },
};

export const resolveEffect = ({ self, opponent, card, payload = {} }) => {
  if (card.effect_negated) fail('Effect của lá bài đã bị vô hiệu');
  const byName = EFFECT_BY_NAME[String(card.name || '').toLowerCase()];
  const code = String(card.effect_types ?? card.effect ?? '0');
  const handler = byName || EFFECT_BY_CODE[code];
  if (!handler) fail(`Effect type ${code} chưa được hỗ trợ`);
  return handler({ self, opponent, card, payload });
};

export const effectAttack = (card, owner, opponent) => {
  let attack = Number(card.attack || 0);
  if (!card.effect_negated && String(card.name || '').toLowerCase() === 'buster blader') {
    const dragons = [...opponent.field.monsters, ...opponent.graveyard]
      .filter((item) => String(item.archtype || '').toLowerCase() === 'dragon').length;
    attack += dragons * 500;
  }
  return attack;
};
