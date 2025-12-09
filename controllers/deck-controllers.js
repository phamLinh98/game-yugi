import * as deckService from '../services/deck-services.js'

export const getDeckController = async (req, res) => {
    try {
        const player = req.query.player || req.body.player;
        if (!player) {
            return res.status(400).json({ error: "Player parameter is required" });
        }
        const result = await deckService.getDeckService(player);
        res.status(200).json(result[0]?.deck || []);
    } catch (error) {
        console.error("Error querying the database:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}