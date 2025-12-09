import express from "express";
const app = express();
app.use(express.json());
const port = 3000;

// ==================== HELPER FUNCTIONS ====================
const shuffleDeck = (arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

const createPlayerState = (playerId) => ({
    id: playerId,
    deckZone: [],
    cardInHand: [],
    monsterZone: [],
    spellTrapZone: [],
    graveZone: [],
    lifePoints: 8000,
    isReady: false
});

// ==================== GAME ROOMS STORAGE ====================
// Map: roomId -> gameState
const gameRooms = new Map();

// Map: playerId -> roomId (để track player đang ở room nào)
const playerRooms = new Map();

// Tự động xóa rooms không hoạt động sau 30 phút
const ROOM_TIMEOUT = 30 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [roomId, game] of gameRooms.entries()) {
        if (now - game.lastActivity > ROOM_TIMEOUT) {
            // Xóa player khỏi tracking
            if (game.player1) playerRooms.delete(game.player1.id);
            if (game.player2) playerRooms.delete(game.player2.id);
            gameRooms.delete(roomId);
            console.log(`Room ${roomId} deleted (inactive)`);
        }
    }
}, 5 * 60 * 1000); // Check mỗi 5 phút

// ==================== GAME STATE STRUCTURE ====================
const createGameRoom = (roomId, player1Id) => ({
    roomId,
    player1: createPlayerState(player1Id),
    player2: null,
    currentTurn: null, // 'player1' or 'player2'
    phase: 'waiting', // waiting, draw, main1, battle, main2, end
    turnCount: 0,
    winner: null,
    createdAt: Date.now(),
    lastActivity: Date.now()
});

// ==================== ROOM MANAGEMENT ENDPOINTS ====================

// 1. Tạo room mới
app.post("/create-room", async (req, res) => {
    try {
        const { playerId } = req.body;

        if (!playerId) {
            return res.status(400).json({ error: "playerId is required" });
        }

        // Check nếu player đã ở trong room khác
        if (playerRooms.has(playerId)) {
            const existingRoomId = playerRooms.get(playerId);
            return res.status(400).json({
                error: "Already in a room",
                roomId: existingRoomId
            });
        }

        const roomId = crypto.randomUUID().slice(0, 8); // Short room code
        const gameRoom = createGameRoom(roomId, playerId);

        gameRooms.set(roomId, gameRoom);
        playerRooms.set(playerId, roomId);

        res.status(200).json({
            message: "Room created",
            roomId,
            gameState: gameRoom
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to create room" });
    }
});

// 2. Join room
app.post("/join-room", async (req, res) => {
    try {
        const { roomId, playerId } = req.body;

        if (!roomId || !playerId) {
            return res.status(400).json({ error: "roomId and playerId required" });
        }

        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        if (game.player2) {
            return res.status(400).json({ error: "Room is full" });
        }

        if (game.player1.id === playerId) {
            return res.status(400).json({ error: "Already in this room" });
        }

        // Add player 2
        game.player2 = createPlayerState(playerId);
        game.lastActivity = Date.now();
        playerRooms.set(playerId, roomId);

        res.status(200).json({
            message: "Joined room successfully",
            gameState: game
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to join room" });
    }
});

// 3. Get game state (dùng để polling)
app.get("/game-state/:roomId", (req, res) => {
    try {
        const { roomId } = req.params;
        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        game.lastActivity = Date.now();

        res.status(200).json(game);
    } catch (error) {
        res.status(500).json({ error: "Failed to get game state" });
    }
});

// 4. Initialize deck cho player
app.post("/initialize-deck", async (req, res) => {
    try {
        const { roomId, playerId } = req.body;
        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        const player = game.player1.id === playerId ? game.player1 : game.player2;

        if (!player) {
            return res.status(404).json({ error: "Player not found" });
        }

        // Fetch cards từ card service
        const data = await fetch("http://localhost:4000/card");
        const cardData = await data.json();

        const cardsWithGuid = cardData.map((card) => ({
            ...card,
            guid_id: crypto.randomUUID(),
        }));

        player.deckZone = shuffleDeck(cardsWithGuid);
        player.isReady = true;
        game.lastActivity = Date.now();

        // Nếu cả 2 players đã ready, bắt đầu game
        if (game.player1.isReady && game.player2?.isReady) {
            game.currentTurn = 'player1';
            game.phase = 'draw';
            game.turnCount = 1;
        }

        res.status(200).json({
            message: "Deck initialized",
            gameState: game
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to initialize deck" });
    }
});

// 5. Draw first 5 cards
app.post("/draw-initial-hand", async (req, res) => {
    try {
        const { roomId, playerId } = req.body;
        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        const player = game.player1.id === playerId ? game.player1 : game.player2;

        if (!player || player.deckZone.length < 5) {
            return res.status(400).json({ error: "Invalid player or not enough cards" });
        }

        // Draw 5 cards
        player.cardInHand = player.deckZone.splice(0, 5);
        game.lastActivity = Date.now();

        res.status(200).json({
            message: "Initial hand drawn",
            gameState: game
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to draw initial hand" });
    }
});

// ==================== GAME ACTION ENDPOINTS ====================

// 6. Draw 1 card
app.post("/draw-card", (req, res) => {
    try {
        const { roomId, playerId } = req.body;
        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        const playerKey = game.player1.id === playerId ? 'player1' : 'player2';
        const player = game[playerKey];

        if (!player) {
            return res.status(404).json({ error: "Player not found" });
        }

        // Check turn
        if (game.currentTurn !== playerKey) {
            return res.status(403).json({ error: "Not your turn" });
        }

        if (player.deckZone.length === 0) {
            game.winner = playerKey === 'player1' ? 'player2' : 'player1';
            return res.status(200).json({
                message: "Deck empty - You lost!",
                gameState: game
            });
        }

        const drawnCard = player.deckZone.shift();
        player.cardInHand.push(drawnCard);
        game.lastActivity = Date.now();

        res.status(200).json({
            message: "Card drawn",
            drawnCard,
            gameState: game
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to draw card" });
    }
});

// 7. Summon card to field
app.post("/summon-card", (req, res) => {
    try {
        const { roomId, playerId, cardGuidId } = req.body;
        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        const playerKey = game.player1.id === playerId ? 'player1' : 'player2';
        const player = game[playerKey];

        if (game.currentTurn !== playerKey) {
            return res.status(403).json({ error: "Not your turn" });
        }

        const cardIndex = player.cardInHand.findIndex(c => c.guid_id === cardGuidId);

        if (cardIndex === -1) {
            return res.status(404).json({ error: "Card not in hand" });
        }

        const card = player.cardInHand[cardIndex];

        // Check zone limits
        if (card.type === 'monster' && player.monsterZone.length >= 5) {
            return res.status(400).json({ error: "Monster zone full" });
        }
        if (card.type !== 'monster' && player.spellTrapZone.length >= 5) {
            return res.status(400).json({ error: "Spell/Trap zone full" });
        }

        // Remove from hand
        player.cardInHand.splice(cardIndex, 1);

        // Add to field
        card.position = card.type === 'monster' ? 'monster_zone' : 'spell_trap_zone';

        if (card.type === 'monster') {
            player.monsterZone.push(card);
        } else {
            player.spellTrapZone.push(card);
        }

        game.lastActivity = Date.now();

        res.status(200).json({
            message: "Card summoned",
            gameState: game
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to summon card" });
    }
});

// 8. Tribute Summon
app.post("/tribute-summon", (req, res) => {
    try {
        const { roomId, playerId, monsterGuidId, tributeGuidIds } = req.body;
        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        const playerKey = game.player1.id === playerId ? 'player1' : 'player2';
        const player = game[playerKey];

        if (game.currentTurn !== playerKey) {
            return res.status(403).json({ error: "Not your turn" });
        }

        // Check if already normal summoned this turn
        if (player.normalSummonUsed) {
            return res.status(400).json({ error: "Already normal summoned this turn" });
        }

        // Find monster in hand
        const monsterIndex = player.cardInHand.findIndex(c => c.guid_id === monsterGuidId);
        if (monsterIndex === -1) {
            return res.status(404).json({ error: "Monster not in hand" });
        }

        const monster = player.cardInHand[monsterIndex];

        // Validate monster type
        if (monster.type !== 'monster') {
            return res.status(400).json({ error: "Card is not a monster" });
        }

        // Determine required tributes based on level
        let requiredTributes = 0;
        if (monster.level >= 5 && monster.level <= 6) {
            requiredTributes = 1;
        } else if (monster.level >= 7) {
            requiredTributes = 2;
        }

        // Validate tribute count
        if (!tributeGuidIds || tributeGuidIds.length !== requiredTributes) {
            return res.status(400).json({
                error: `Monster level ${monster.level} requires ${requiredTributes} tribute(s)`,
                requiredTributes
            });
        }

        // Validate and remove tributes from monster zone
        const tributedMonsters = [];
        for (const tributeId of tributeGuidIds) {
            const index = player.monsterZone.findIndex(c => c.guid_id === tributeId);
            if (index === -1) {
                return res.status(400).json({ error: `Tribute monster ${tributeId} not found on field` });
            }
            const [tributedMonster] = player.monsterZone.splice(index, 1);
            tributedMonster.position = 'grave_zone';
            player.graveZone.push(tributedMonster);
            tributedMonsters.push(tributedMonster);
        }

        // Check monster zone limit
        if (player.monsterZone.length >= 5) {
            // Restore tributed monsters if zone full
            tributedMonsters.forEach(m => {
                player.graveZone.pop();
                m.position = 'monster_zone';
                player.monsterZone.push(m);
            });
            return res.status(400).json({ error: "Monster zone full" });
        }

        // Remove monster from hand and add to field
        player.cardInHand.splice(monsterIndex, 1);
        monster.position = 'monster_zone';
        monster.battlePosition = 'attack'; // Default: attack position
        monster.hasAttacked = false;
        player.monsterZone.push(monster);
        player.normalSummonUsed = true;

        game.lastActivity = Date.now();

        res.status(200).json({
            message: "Tribute summon successful",
            tributedMonsters,
            summonedMonster: monster,
            gameState: game
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to tribute summon" });
    }
});

// 9. Send card to graveyard
app.post("/send-to-graveyard", (req, res) => {
    try {
        const { roomId, playerId, cardGuidId, fromZone } = req.body;
        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        const player = game.player1.id === playerId ? game.player1 : game.player2;
        let card = null;

        if (fromZone === 'monster_zone') {
            const index = player.monsterZone.findIndex(c => c.guid_id === cardGuidId);
            if (index !== -1) {
                [card] = player.monsterZone.splice(index, 1);
            }
        } else if (fromZone === 'spell_trap_zone') {
            const index = player.spellTrapZone.findIndex(c => c.guid_id === cardGuidId);
            if (index !== -1) {
                [card] = player.spellTrapZone.splice(index, 1);
            }
        }

        if (card) {
            card.position = 'grave_zone';
            player.graveZone.push(card);
            game.lastActivity = Date.now();
        }

        res.status(200).json({
            message: "Card sent to graveyard",
            gameState: game
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to send card to graveyard" });
    }
});

// 9. End turn
app.post("/end-turn", (req, res) => {
    try {
        const { roomId, playerId } = req.body;
        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        const playerKey = game.player1.id === playerId ? 'player1' : 'player2';

        if (game.currentTurn !== playerKey) {
            return res.status(403).json({ error: "Not your turn" });
        }

        // Switch turn
        game.currentTurn = playerKey === 'player1' ? 'player2' : 'player1';
        game.phase = 'draw';
        game.turnCount++;
        game.lastActivity = Date.now();

        res.status(200).json({
            message: "Turn ended",
            gameState: game
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to end turn" });
    }
});

// 10. Leave room / Forfeit
app.post("/leave-room", (req, res) => {
    try {
        const { roomId, playerId } = req.body;
        const game = gameRooms.get(roomId);

        if (!game) {
            return res.status(404).json({ error: "Room not found" });
        }

        const playerKey = game.player1.id === playerId ? 'player1' : 'player2';
        game.winner = playerKey === 'player1' ? 'player2' : 'player1';
        game.lastActivity = Date.now();

        playerRooms.delete(playerId);

        res.status(200).json({
            message: "Player left - Opponent wins",
            gameState: game
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to leave room" });
    }
});

// ==================== UTILITY ENDPOINTS ====================

// List all active rooms (for debugging)
app.get("/rooms", (req, res) => {
    const rooms = Array.from(gameRooms.entries()).map(([id, game]) => ({
        roomId: id,
        players: [
            game.player1?.id,
            game.player2?.id
        ].filter(Boolean),
        phase: game.phase,
        turn: game.currentTurn
    }));

    res.status(200).json({ rooms, total: rooms.length });
});

app.listen(port, () => {
    console.log(`Yu-Gi-Oh Server listening on port ${port}`);
    console.log(`Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
});