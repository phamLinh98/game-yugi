import * as getPlayerDeckModel from '../models/deck-model.js';
import sql from '../configs/db.js';

export const getPlayerDeck = async (player) => {
    const playerValue = getPlayerDeckModel.getPlayerDeck(player);
    const rows = await sql`SELECT deck FROM player_deck WHERE player = ${playerValue}`;
    return rows;
}