import * as deckDAL from '../DAL/deck-DAL.js';

export const getDeckService = async (player) => {
    const rows = await deckDAL.getPlayerDeck(player);
    return rows;
}