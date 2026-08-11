import sql from '../configs/db.js';

await sql.query(`
  ALTER TABLE player_deck
    ADD COLUMN IF NOT EXISTS phase VARCHAR(4) NOT NULL DEFAULT 'SP',
    ADD COLUMN IF NOT EXISTS current_turn TEXT NOT NULL DEFAULT 'player1',
    ADD COLUMN IF NOT EXISTS turn_count INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
`);

await sql.query(`
  UPDATE player_deck
  SET hand = COALESCE(NULLIF(hand, ''), '[]'),
      graveyard = COALESCE(NULLIF(graveyard, ''), '[]'),
      field = COALESCE(NULLIF(field, ''), '{"monsters":[],"spellsTraps":[]}')
`);

console.log('Duel migration complete');
