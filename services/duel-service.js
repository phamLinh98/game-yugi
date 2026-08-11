import crypto from 'crypto';
import sql from '../configs/db.js';
import { effectAttack, resolveEffect } from './effect-engine.js';

export const PHASES = ['SP', 'DP', 'MP1', 'BF', 'MP2', 'EP'];

const parseJson = (value, fallback) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const withGuid = (card) => ({ ...card, guid_id: card.guid_id || crypto.randomUUID() });
const normalizeRow = (row) => ({
  ...row,
  deck: (parseJson(row.deck, []) || []).map(withGuid),
  hand: (parseJson(row.hand, []) || []).map(withGuid),
  graveyard: (parseJson(row.graveyard, []) || []).map(withGuid),
  field: { monsters: [], spellsTraps: [], ...parseJson(row.field, {}) },
  lifepoint: Number(row.lifepoint || 8000),
});

const getRows = async () => {
  const rows = await sql`SELECT * FROM player_deck ORDER BY id LIMIT 2`;
  if (rows.length < 2) throw Object.assign(new Error('Cần đủ player1 và player2'), { statusCode: 409 });
  return rows.map(normalizeRow);
};

const persist = async (player, shared) => {
  await sql`
    UPDATE player_deck SET
      deck = ${JSON.stringify(player.deck)}::json,
      hand = ${JSON.stringify(player.hand)},
      graveyard = ${JSON.stringify(player.graveyard)},
      field = ${JSON.stringify(player.field)},
      lifepoint = ${player.lifepoint},
      phase = ${shared.phase},
      current_turn = ${shared.currentTurn},
      turn_count = ${shared.turnCount},
      game_status = ${shared.status},
      winner = ${shared.winner},
      end_reason = ${shared.endReason},
      updated_at = NOW()
    WHERE player = ${player.player}
  `;
};

const publicPlayer = (player, opponent, isSelf) => ({
  player: player.player,
  lifepoint: player.lifepoint,
  deckCount: player.deck.length,
  hand: isSelf ? player.hand : player.hand.map(() => ({ hidden: true })),
  handCount: player.hand.length,
  graveyard: player.graveyard,
  field: {
    ...player.field,
    monsters: player.field.monsters.map((card) => ({
      ...card,
      effective_attack: effectAttack(card, player, opponent),
    })),
  },
});

const loadGame = async (playerName) => {
  const players = await getRows();
  const self = players.find((item) => item.player === playerName);
  if (!self) throw Object.assign(new Error('Player không tồn tại'), { statusCode: 404 });
  const opponent = players.find((item) => item.player !== playerName);
  const shared = {
    phase: PHASES.includes(self.phase) ? self.phase : 'SP',
    currentTurn: self.current_turn || players[0].player,
    turnCount: Number(self.turn_count || 1),
    status: self.game_status || 'ACTIVE',
    winner: self.winner || null,
    endReason: self.end_reason || null,
  };
  return { self, opponent, shared };
};

const initializeHand = async (self, shared) => {
  if (self.hand.length || !self.deck.length) return;
  self.deck = self.deck.map(withGuid).sort(() => Math.random() - 0.5);
  self.hand = self.deck.splice(0, 5);
  await persist(self, shared);
};

export const getDuelState = async (playerName) => {
  const game = await loadGame(playerName);
  await initializeHand(game.self, game.shared);
  await initializeHand(game.opponent, game.shared);
  return {
    phase: game.shared.phase,
    phases: PHASES,
    currentTurn: game.shared.currentTurn,
    turnCount: game.shared.turnCount,
    status: game.shared.status,
    winner: game.shared.winner,
    endReason: game.shared.endReason,
    canAct: game.shared.currentTurn === playerName,
    self: publicPlayer(game.self, game.opponent, true),
    opponent: publicPlayer(game.opponent, game.self, false),
  };
};

const requireTurn = (player, shared, phases) => {
  if (shared.currentTurn !== player.player) throw Object.assign(new Error('Chưa đến lượt của bạn'), { statusCode: 403 });
  if (phases && !phases.includes(shared.phase)) throw Object.assign(new Error(`Không thể thao tác trong phase ${shared.phase}`), { statusCode: 409 });
};

const takeCard = (cards, guid) => {
  const index = cards.findIndex((card) => card.guid_id === guid);
  if (index < 0) throw Object.assign(new Error('Không tìm thấy lá bài'), { statusCode: 404 });
  return cards.splice(index, 1)[0];
};

export const performAction = async (playerName, action, payload = {}) => {
  const { self, opponent, shared } = await loadGame(playerName);

  if (action === 'START_DUEL') {
    if (shared.status === 'FINISHED') {
      const resetPlayer = (player) => {
        const cards = [
          ...player.deck,
          ...player.hand,
          ...player.graveyard,
          ...player.field.monsters,
          ...player.field.spellsTraps,
        ].map(({ position, mode, status, has_attacked, effect_negated, effective_attack, activation_pending, activation_started_at, activation_target_guid, ...card }) => withGuid(card));
        player.deck = cards.sort(() => Math.random() - 0.5);
        player.hand = [];
        player.graveyard = [];
        player.field = { monsters: [], spellsTraps: [] };
        player.lifepoint = 8000;
      };
      resetPlayer(self);
      resetPlayer(opponent);
      shared.phase = 'SP';
      shared.currentTurn = 'player1';
      shared.turnCount = 1;
      shared.status = 'ACTIVE';
      shared.winner = null;
      shared.endReason = null;
    }
  } else if (shared.status === 'FINISHED') {
    throw Object.assign(new Error('Trận đấu đã kết thúc'), { statusCode: 409 });
  } else if (action === 'SURRENDER') {
    self.lifepoint = 0;
    shared.status = 'FINISHED';
    shared.winner = opponent.player;
    shared.endReason = 'SURRENDER';

  } else if (action === 'CHANGE_PHASE') {
    requireTurn(self, shared);
    const currentIndex = PHASES.indexOf(shared.phase);
    const requested = String(payload.phase || '').toUpperCase();
    if (requested !== PHASES[currentIndex + 1]) throw Object.assign(new Error('Phase phải chuyển theo đúng thứ tự'), { statusCode: 409 });
    shared.phase = requested;
    if (requested === 'DP' && self.deck.length) self.hand.push(self.deck.shift());
    if (requested === 'EP') {
      shared.currentTurn = opponent.player;
      shared.turnCount += 1;
      shared.phase = 'SP';
      [...self.field.monsters, ...opponent.field.monsters].forEach((card) => { card.has_attacked = false; });
    }
  } else if (action === 'SUMMON' || action === 'SET_CARD') {
    requireTurn(self, shared, ['MP1', 'MP2']);
    const card = takeCard(self.hand, payload.cardGuid);
    if (card.type === 'monster') {
      if (self.field.monsters.length >= 5) throw Object.assign(new Error('Monster zone đã đầy'), { statusCode: 409 });
      card.position = 'monster_zone';
      card.mode = action === 'SET_CARD' ? 'defense' : (payload.mode === 'defense' ? 'defense' : 'attack');
      card.status = action === 'SET_CARD' ? 'set' : 'open';
      card.has_attacked = false;
      self.field.monsters.push(card);
    } else {
      if (self.field.spellsTraps.length >= 5) throw Object.assign(new Error('Spell/Trap zone đã đầy'), { statusCode: 409 });
      card.position = 'spell_trap_zone';
      card.status = action === 'SET_CARD' ? 'set' : 'open';
      self.field.spellsTraps.push(card);
    }
  } else if (action === 'CHANGE_POSITION') {
    requireTurn(self, shared, ['MP1', 'MP2']);
    const card = self.field.monsters.find((item) => item.guid_id === payload.cardGuid);
    if (!card) throw Object.assign(new Error('Không tìm thấy quái thú'), { statusCode: 404 });
    card.mode = card.mode === 'attack' ? 'defense' : 'attack';
    card.status = 'open';
  } else if (action === 'ATTACK') {
    requireTurn(self, shared, ['BF']);
    const attacker = self.field.monsters.find((item) => item.guid_id === payload.cardGuid);
    if (!attacker || attacker.mode !== 'attack' || attacker.has_attacked) throw Object.assign(new Error('Quái thú không thể tấn công'), { statusCode: 409 });
    const defender = opponent.field.monsters.find((item) => item.guid_id === payload.targetGuid);
    attacker.has_attacked = true;
    if (!defender) {
      if (opponent.field.monsters.length) throw Object.assign(new Error('Phải chọn quái thú đối thủ'), { statusCode: 409 });
      opponent.lifepoint = Math.max(0, opponent.lifepoint - effectAttack(attacker, self, opponent));
    } else {
      const defenseValue = defender.mode === 'defense'
        ? Number(defender.defense || 0)
        : effectAttack(defender, opponent, self);
      const diff = effectAttack(attacker, self, opponent) - defenseValue;
      if (diff > 0) {
        opponent.field.monsters = opponent.field.monsters.filter((item) => item.guid_id !== defender.guid_id);
        opponent.graveyard.push(defender);
        if (defender.mode !== 'defense') opponent.lifepoint = Math.max(0, opponent.lifepoint - diff);
      } else if (diff < 0) {
        self.lifepoint = Math.max(0, self.lifepoint - Math.abs(diff));
        if (defender.mode !== 'defense') {
          self.field.monsters = self.field.monsters.filter((item) => item.guid_id !== attacker.guid_id);
          self.graveyard.push(attacker);
        }
      } else if (defender.mode !== 'defense') {
        self.field.monsters = self.field.monsters.filter((item) => item.guid_id !== attacker.guid_id);
        opponent.field.monsters = opponent.field.monsters.filter((item) => item.guid_id !== defender.guid_id);
        self.graveyard.push(attacker);
        opponent.graveyard.push(defender);
      }
    }
  } else if (action === 'ACTIVATE_CARD' || action === 'ACTIVATE_TRAP') {
    let card = self.field.spellsTraps.find((item) => item.guid_id === payload.cardGuid);
    let fromHand = false;
    if (!card) {
      card = self.hand.find((item) => item.guid_id === payload.cardGuid);
      fromHand = Boolean(card);
    }
    if (!card && action === 'ACTIVATE_CARD') card = self.field.monsters.find((item) => item.guid_id === payload.cardGuid);
    if (!card) throw Object.assign(new Error('Không tìm thấy lá bài để kích hoạt'), { statusCode: 404 });
    if (card.type !== 'trap') requireTurn(self, shared, ['MP1', 'MP2']);
    if (card.type === 'trap' && fromHand) throw Object.assign(new Error('Trap phải được úp trên sân trước khi kích hoạt'), { statusCode: 409 });
    if (self.field.spellsTraps.some((item) => item.activation_pending)) {
      throw Object.assign(new Error('Hãy chờ lá bài đang kích hoạt resolve'), { statusCode: 409 });
    }
    if (fromHand && card.type === 'spell') {
      if (self.field.spellsTraps.length >= 5) throw Object.assign(new Error('Spell/Trap zone đã đầy'), { statusCode: 409 });
      self.hand = self.hand.filter((item) => item.guid_id !== card.guid_id);
      self.field.spellsTraps.push(card);
    }
    card.status = 'open';
    card.activation_pending = true;
    card.activation_started_at = Date.now();
    card.activation_target_guid = payload.targetGuid || null;
    shared.lastAction = `${card.name} đang kích hoạt`;
  } else if (action === 'RESOLVE_CARD') {
    let card = self.field.spellsTraps.find((item) => item.guid_id === payload.cardGuid && item.activation_pending);
    if (!card) card = self.field.monsters.find((item) => item.guid_id === payload.cardGuid && item.activation_pending);
    if (!card) throw Object.assign(new Error('Không tìm thấy card đang chờ resolve'), { statusCode: 404 });
    if (Date.now() - Number(card.activation_started_at || 0) < 800) {
      throw Object.assign(new Error('Card cần hiển thị tối thiểu 1 giây'), { statusCode: 409 });
    }
    const effectMessage = resolveEffect({
      self,
      opponent,
      card,
      payload: { targetGuid: card.activation_target_guid || payload.targetGuid },
    });
    delete card.activation_pending;
    delete card.activation_started_at;
    delete card.activation_target_guid;
    if (card.type === 'spell' || card.type === 'trap') {
      self.field.spellsTraps = self.field.spellsTraps.filter((item) => item.guid_id !== card.guid_id);
      self.graveyard.push({ ...card, status: 'open' });
    }
    shared.lastAction = effectMessage;
  } else {
    throw Object.assign(new Error('Hành động không hợp lệ'), { statusCode: 400 });
  }

  if (shared.status !== 'FINISHED' && (self.lifepoint <= 0 || opponent.lifepoint <= 0)) {
    shared.status = 'FINISHED';
    shared.winner = self.lifepoint > opponent.lifepoint
      ? self.player
      : opponent.lifepoint > self.lifepoint ? opponent.player : null;
    shared.endReason = 'LIFE_POINT_ZERO';
  }

  await Promise.all([persist(self, shared), persist(opponent, shared)]);
  const state = await getDuelState(playerName);
  return { ...state, effectMessage: shared.lastAction || null };
};

const allOwnedCards = (player) => [
  ...player.deck,
  ...player.hand,
  ...player.graveyard,
  ...player.field.monsters,
  ...player.field.spellsTraps,
];

export const getDeckEditor = async (playerName) => {
  const { self, opponent } = await loadGame(playerName);
  const clean = (card) => {
    const { position, mode, status, has_attacked, effect_negated, effective_attack, activation_pending, activation_started_at, activation_target_guid, ...result } = card;
    return result;
  };
  const deck = allOwnedCards(self).map(clean);
  const catalogMap = new Map([...allOwnedCards(self), ...allOwnedCards(opponent)].map((card) => [card.id, clean(card)]));
  return { player: self.player, deck, catalog: [...catalogMap.values()] };
};

export const addCardToDeck = async (playerName, cardId) => {
  const { self, opponent, shared } = await loadGame(playerName);
  const source = [...allOwnedCards(self), ...allOwnedCards(opponent)].find((card) => Number(card.id) === Number(cardId));
  if (!source) throw Object.assign(new Error('Không tìm thấy card trong catalog'), { statusCode: 404 });
  const { position, mode, status, has_attacked, effect_negated, effective_attack, activation_pending, activation_started_at, activation_target_guid, ...card } = source;
  self.deck.push(withGuid(card));
  await persist(self, shared);
  return getDeckEditor(playerName);
};
