import express from "express";
import { shuffleDeck } from "./utils/shuffle-deck.js";
import router from "./routers/router.js";
import corsMiddleware from './middlewares/cors.js';
const app = express();
app.use(express.json());
app.use(corsMiddleware);
app.use(router);
const port = 3000;

const playerGameStates = new Map();
const gameSessions = new Map();

// State quản lý chung cho 2 player
const createPlayerState = () => {
  return {
    monsterZone: [],
    spellTrapZone: [],
    graveZone: [],
    deckZone: [],
    cardInHand: [],
    lifePoint: 8000,
    isPlayerTurn: false,
    gameId: null,
  };
};

// Khởi tạo state cho Player
const initializePlayer = (playerId) => {
  {
    if (!playerGameStates.has(playerId)) {
      playerGameStates.set(playerId, createPlayerState());
    }
    return playerGameStates.get(playerId);
  }
};

// Tìm state của Player này
const getPlayerState = (playerId) => {
  return playerGameStates.get(playerId);
};

const createGameSession = (gameId, player1, player2, firstPlayer) => {
  return {
    gameId,
    players: {
      player1,
      player2,
    },
    currentTurn: firstPlayer,
    turnCount: 0,
    battlePhase: false,
  };
};

app.get("/card-remain-in-deck", async (req, res) => {
  try {
    const player = req.query.player;
    if (!player) {
      return res.status(400).json({ error: "Player ID is required" });
    }
    // Kiểm tra xem player đã có state chưa
    let playerState = getPlayerState(player);

    if (playerState) {
      return res.status(200).json(playerState.deckZone);
    }

    // Chưa có thì mới khởi tạo
    playerState = initializePlayer(player);

    //const data = await fetch(`https://game-yugi.vercel.app/deck?player=${player}`);
    const data = await fetch(`http://localhost:4000/${player}`);
    const cardData = await data.json();
    const cardsRemainInDeck = cardData.map((card) => ({
      ...card,
      guid_id: crypto.randomUUID(),
    }));
    playerState.deckZone = [...cardsRemainInDeck];

    console.log(
      `Player ${player} - deckZone initialized:`,
      playerState.deckZone.length
    );
    res.status(200).json(playerState.deckZone);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.post("/start-game", (req, res) => {
  try {
    const { player1, player2, gameId } = req.body;

    if (!player1 || !player2 || !gameId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Random ai đi trước
    const firstPlayer = Math.random() < 0.5 ? player1 : player2;

    // Tạo game session
    const gameSession = createGameSession(
      gameId,
      player1,
      player2,
      firstPlayer
    );
    gameSessions.set(gameId, gameSession);

    // Initialize và set turn cho mỗi player
    const player1State = initializePlayer(player1);
    const player2State = initializePlayer(player2);

    player1State.isPlayerTurn = firstPlayer === player1;
    player2State.isPlayerTurn = firstPlayer === player2;
    player1State.gameId = gameId;
    player2State.gameId = gameId;
    player1State.lifePoint = 8000;
    player2State.lifePoint = 8000;

    res.status(200).json({
      gameId,
      firstPlayer,
      players: {
        [player1]: {
          isPlayerTurn: player1State.isPlayerTurn,
          lifePoint: player1State.lifePoint,
        },
        [player2]: {
          isPlayerTurn: player2State.isPlayerTurn,
          lifePoint: player2State.lifePoint,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to start game" });
  }
});

// End turn, switch role
app.post("/end-turn", (req, res) => {
  try {
    const { playerId, gameId } = req.body;
    const gameSession = gameSessions.get(gameId);

    if (!gameSession) {
      return res.status(404).json({ error: "Game not found" });
    }

    let playerState = getPlayerState(playerId);

    if (!playerState.isPlayerTurn) {
      return res.status(400).json({ error: "Not your turn" });
    }

    // Tìm opponent
    const opponentId =
      gameSession.players.player1 === playerId
        ? gameSession.players.player2
        : gameSession.players.player1;

    const opponentState = getPlayerState(opponentId);

    // Chuyển turn
    playerState.isPlayerTurn = false;
    opponentState.isPlayerTurn = true;
    gameSession.currentTurn = opponentId;
    gameSession.turnCount++;
    gameSession.battlePhase = false;

    res.status(200).json({
      currentTurn: opponentId,
      turnCount: gameSession.turnCount,
      players: {
        [playerId]: { isPlayerTurn: false },
        [opponentId]: { isPlayerTurn: true },
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to end turn" });
  }
});

app.post("/battle-monster-vs-monster", (req, res) => {
  
  const dataMock = {
    "gameId": "12345",
    "attackerId": "player1",
    "attackerMonsterGuid": {
      "id": "2",
      "name": "Blue-Eyes White Dragon",
      "type": "monster",
      "attribute": "Light",
      "tribute_count": 2,
      "archtype": "Dragon",
      "attack": 3000,
      "defense": 2500,
      "level": 8,
      "description": "A legendary dragon known for its immense power.",
      "image_url": "https://i.pinimg.com/736x/48/ae/69/48ae691c6eeed63ed1feaecdbca85e22.jpg",
      "effect": "0",
      "guid_id": "40b772e1-2853-4fce-bd72-65baebdc9cc4",
      "position": "monster_zone",
      "mode": "attack"
    },
    "defenderMonsterGuid": {
      "id": "10",
      "name": "Dark Paladin",
      "type": "monster",
      "attribute": "Dark",
      "archtype": "Spellcaster",
      "tribute_count": 2,
      "attack": 2900,
      "defense": 2400,
      "level": 8,
      "description": "A fusion swordsman who cancels and absorbs the power of dragons.",
      "image_url": "https://i.pinimg.com/736x/09/2c/8a/092c8a72710a998d92d4d4314a1c0f64.jpg",
      "effect": "0",
      "guid_id": "55c7cc38-622b-4dd6-a987-b06283709985",
      "position": "monster_zone",
      "mode": "attack"
    }
  }

  try {
    const {
      gameId,
      attackerId, // ID của player tấn công
      attackerMonsterGuid, // Object chứa toàn bộ data quái tấn công
      defenderMonsterGuid // Object chứa toàn bộ data quái bị tấn công
    } = dataMock

    //const gameSession = gameSessions.get(gameId);
    const gameSession = {
      gameId,
      players: {
        player1: "player1",
        player2: "player2",
      },
      currentTurn: "player1",
      turnCount: 0,
      battlePhase: false,
    }
    if (!gameSession) {
      return res.status(404).json({ error: "Game not found" });
    }

    //const attackerState = getPlayerState(attackerId);
    const attackerState = {
      monsterZone: [{
        "id": "2",
        "name": "Blue-Eyes White Dragon",
        "type": "monster",
        "attribute": "Light",
        "tribute_count": 2,
        "archtype": "Dragon",
        "attack": 0,
        "defense": 3000,
        "level": 8,
        "description": "A legendary dragon known for its immense power.",
        "image_url": "https://i.pinimg.com/736x/48/ae/69/48ae691c6eeed63ed1feaecdbca85e22.jpg",
        "effect": "0",
        "guid_id": "40b772e1-2853-4fce-bd72-65baebdc9cc4",
        "position": "monster_zone",
        "mode": "attack"
      }],
      spellTrapZone: [],
      graveZone: [],
      deckZone: [],
      cardInHand: [],
      lifePoint: 8000,
      isPlayerTurn: true,
      gameId: 12345,
    }

    // Kiểm tra có phải turn của attacker không
    if (!attackerState.isPlayerTurn) {
      return res.status(400).json({ error: "Not your turn" });
    }

    // Tìm defender
    const defenderId = gameSession.players.player1 === attackerId
      ? gameSession.players.player2
      : gameSession.players.player1;

    //const defenderState = getPlayerState(defenderId);
    const defenderState = {
      monsterZone: [{
        "id": "10",
        "name": "Dark Paladin",
        "type": "monster",
        "attribute": "Dark",
        "archtype": "Spellcaster",
        "tribute_count": 2,
        "attack": 2900,
        "defense": 2400,
        "level": 8,
        "description": "A fusion swordsman who cancels and absorbs the power of dragons.",
        "image_url": "https://i.pinimg.com/736x/09/2c/8a/092c8a72710a998d92d4d4314a1c0f64.jpg",
        "effect": "0",
        "guid_id": "55c7cc38-622b-4dd6-a987-b06283709985",
        "position": "monster_zone",
        "mode": "attack"
      }],
      spellTrapZone: [],
      graveZone: [],
      deckZone: [],
      cardInHand: [],
      lifePoint: 8000,
      isPlayerTurn: false,
      gameId: 12345,
    }

    // Lấy guid_id từ object
    const attackerGuid = attackerMonsterGuid.guid_id;
    const defenderGuid = defenderMonsterGuid.guid_id;
    // Tìm quái tấn công trong monsterZone
    const attackerMonster = attackerState.monsterZone.find(
      m => m.guid_id === attackerGuid
    );

    if (!attackerMonster) {
      return res.status(404).json({ error: "Attacker monster not found in monster zone" });
    }

    // Tìm quái bị tấn công trong monsterZone
    const defenderMonster = defenderState.monsterZone.find(
      m => m.guid_id === defenderGuid
    );

    if (!defenderMonster) {
      return res.status(404).json({ error: "Defender monster not found in monster zone" });
    }

    let battleResult = {
      attackerMonster: attackerMonster.name,
      defenderMonster: defenderMonster.name,
      attackerDamage: 0,
      defenderDamage: 0,
      destroyedMonsters: []
    };

    // Case 1: Defender ở Attack Position
    if (defenderMonster.mode === "attack") {
      const attackDiff = attackerMonster.attack - defenderMonster.attack;

      if (attackDiff > 0) {
        // Attacker thắng
        defenderState.lifePoint -= attackDiff;
        battleResult.defenderDamage = attackDiff;
        battleResult.destroyedMonsters.push(defenderMonster.name);

        // Gửi quái bị hủy vào graveyard
        defenderState.graveZone.push(defenderMonster);
        defenderState.monsterZone = defenderState.monsterZone.filter(
          m => m.guid_id !== defenderGuid
        );

      } else if (attackDiff < 0) {
        // Defender thắng
        attackerState.lifePoint -= Math.abs(attackDiff);
        battleResult.attackerDamage = Math.abs(attackDiff);
        battleResult.destroyedMonsters.push(attackerMonster.name);

        // Gửi quái tấn công vào graveyard
        attackerState.graveZone.push(attackerMonster);
        attackerState.monsterZone = attackerState.monsterZone.filter(
          m => m.guid_id !== attackerGuid
        );

      } else {
        // Hòa - cả 2 bị hủy
        battleResult.destroyedMonsters.push(attackerMonster.name, defenderMonster.name);

        attackerState.graveZone.push(attackerMonster);
        attackerState.monsterZone = attackerState.monsterZone.filter(
          m => m.guid_id !== attackerGuid
        );

        defenderState.graveZone.push(defenderMonster);
        defenderState.monsterZone = defenderState.monsterZone.filter(
          m => m.guid_id !== defenderGuid
        );
      }
    }
    // Case 2: Defender ở Defense Position
    else if (defenderMonster.mode === "defense") {
      const attackVsDefense = attackerMonster.attack - defenderMonster.defense;

      if (attackVsDefense > 0) {
        // Attacker thắng - hủy defender, không mất máu
        battleResult.destroyedMonsters.push(defenderMonster.name);

        defenderState.graveZone.push(defenderMonster);
        defenderState.monsterZone = defenderState.monsterZone.filter(
          m => m.guid_id !== defenderGuid
        );

      } else if (attackVsDefense < 0) {
        // Defense thắng - attacker mất máu
        attackerState.lifePoint -= Math.abs(attackVsDefense);
        battleResult.attackerDamage = Math.abs(attackVsDefense);

      } else {
        // Hòa - không ai mất máu, không ai bị hủy
        battleResult.result = "Draw - No damage";
      }
    }

    // Check win condition
    let winner = null;
    if (attackerState.lifePoint <= 0) {
      winner = defenderId;
    } else if (defenderState.lifePoint <= 0) {
      winner = attackerId;
    }

    res.status(200).json({
      battleResult,
      winner,
      players: {
        [attackerId]: {
          lifePoint: attackerState.lifePoint,
          monsterZone: attackerState.monsterZone.length,
          graveZone: attackerState.graveZone.length
        },
        [defenderId]: {
          lifePoint: defenderState.lifePoint,
          monsterZone: defenderState.monsterZone.length,
          graveZone: defenderState.graveZone.length
        }
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Battle failed" });
  }
});

app.get("/draw-one-card", async (req, res) => {
  try {
    const player = req.query.player;
    let playerState = getPlayerState(player);
    if (playerState.deckZone.length === 0) {
      return res.status(400).json({ message: "Deck is empty. You Lost" });
    }
    const shuffleBeforeDraw = await shuffleDeck(playerState.deckZone);
    playerState.drawFirstCard = await shuffleBeforeDraw[0];
    playerState.cardInHand.push(playerState.drawFirstCard);
    playerState.deckZone = playerState.deckZone.filter(
      (card) => card.guid_id !== playerState.drawFirstCard.guid_id
    );
    res.status(200).json({
      drawFirstCard: playerState.drawFirstCard,
      cardInHand: playerState.cardInHand,
      monsterZone: playerState.monsterZone,
      deckZone: playerState.deckZone,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/get-first-5-cards", async (req, res) => {
  try {
    const player = req.query.player;
    let playerState = getPlayerState(player);
    // Shuffle và lấy 5 lá từ deckZone hiện tại
    if (playerState.deckZone.length === 0) {
      return res.status(400).json({ error: "Deck is empty. You Lost" });
    }
    // Shuffle deckZone
    const shuffled = playerState.deckZone.sort(() => Math.random() - 0.5);

    // Draw 5 cards first
    const deckZonefirst5Cards = shuffled.slice(0, 5);

    // Add 5 cards to hand
    playerState.cardInHand = [...deckZonefirst5Cards];

    // Loại bỏ 5 lá khỏi deck (dùng id gốc thay vì guid_id)
    const drawnIds = deckZonefirst5Cards.map((card) => card.id);
    playerState.deckZone = playerState.deckZone.filter(
      (card) => !drawnIds.includes(card.id)
    );

    console.log("Cards drawn:", deckZonefirst5Cards.length);
    console.log("Cards remaining in deck:", playerState.deckZone.length);

    res.status(200).json({
      cardInHand: playerState.cardInHand,
      deckZone: playerState.deckZone,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/set-card-to-field", async (req, res) => {
  try {
    const { player, mode } = req.query;
    let playerState = getPlayerState(player);
    for (const card of playerState.monsterZone) {
      card.position = "monster_zone";
      card.mode = mode;
    }

    for (const card of playerState.spellTrapZone) {
      card.position = "spell_trap_zone";
    }

    for (const card of playerState.graveZone) {
      card.position = "grave_zone";
    }
    res.status(200).json({
      monsterZone: playerState.monsterZone,
      spellTrapZone: playerState.spellTrapZone,
      graveZone: playerState.graveZone,
      deckZone: player.deckZone,
      cardInHand: player.cardInHand,
    });
  } catch (error) {
    res.status(500).json({ error: "No data To Show Cards" });
  }
});

app.post("/status-card-in-field", async (req, res) => {
  try {
    const card = req.body;
    const player = req.query.player;
    let playerState = getPlayerState(player);

    const { guid_id: guid_id } = card;
    // Kiểm tra card có tồn tại không
    if (!card || !card.type) {
      return res.status(400).json({ error: "Invalid card data" });
    }
    // Check type và add vào mảng tương ứng
    if (card.type === "monster") {
      playerState.monsterZone.push(card);
    } else {
      playerState.spellTrapZone.push(card);
    }
    // Loại bỏ thẻ khỏi tay người chơi
    playerState.cardInHand = playerState.cardInHand.filter(
      (c) => c.guid_id !== guid_id
    );

    res.status(200).json({
      monsterZone: playerState.monsterZone,
      spellTrapZone: playerState.spellTrapZone,
      graveZone: playerState.graveZone,
      cardInHand: playerState.cardInHand,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to process card" });
  }
});

app.post("/sent-card-to-graveyard", async (req, res) => {
  try {
    const card = req.body;
    const player = req.query.player;
    let playerState = getPlayerState(player);
    const { position: position } = card;
    if (position === "monster_zone") {
      const index = playerState.monsterZone.findIndex(
        (c) => c.guid_id === card.guid_id
      );
      if (index !== -1) {
        const [removedCard] = playerState.monsterZone.splice(index, 1);
        playerState.graveZone.push(removedCard);
      }
    } else if (position === "spell_trap_zone") {
      const index = playerState.spellTrapZone.findIndex(
        (c) => c.guid_id === card.guid_id
      );
      if (index !== -1) {
        const [removedCard] = playerState.spellTrapZone.splice(index, 1);
        playerState.graveZone.push(removedCard);
      }
    }
    res.status(200).json({
      monsterZone: playerState.monsterZone,
      spellTrapZone: playerState.spellTrapZone,
      graveZone: playerState.graveZone,
    });
  } catch (error) {
    res.status(500).json({ error: "No data To Show Cards" });
  }
});

app.post("/normal-summon", async (req, res) => {
  try {
    const card = req.body;
    const player = req.query.player;
    let playerState = getPlayerState(player);
    const { guid_id } = card;

    // Loại bỏ card khỏi cardInHand (card đang được summon)
    const handIndex = playerState.cardInHand.findIndex(
      (c) => c.guid_id === guid_id
    );
    if (handIndex !== -1) {
      playerState.cardInHand.splice(handIndex, 1);
    }

    // Thêm card vào monsterZone
    playerState.monsterZone.push(card);

    res.status(200).json({
      monsterZone: playerState.monsterZone,
      spellTrapZone: playerState.spellTrapZone,
      graveZone: playerState.graveZone,
      cardInHand: playerState.cardInHand,
    });
  } catch (error) {
    res.status(500).json({ error: "No data To Show Cards" });
  }
});

app.post("/special-summon", async (req, res) => {
  try {
    const card = req.body;
    const player = req.query.player;
    let playerState = getPlayerState(player);
    const { guid_id } = card;
    // Loại bỏ card khỏi cardInHand (card đang được summon)
    const handIndex = playerState.cardInHand.findIndex(
      (c) => c.guid_id === guid_id
    );
    if (handIndex !== -1) {
      playerState.cardInHand.splice(handIndex, 1);
    }

    // Thêm card vào monsterZone
    playerState.monsterZone.push(card);

    res.status(200).json({
      monsterZone: playerState.monsterZone,
      spellTrapZone: playerState.spellTrapZone,
      graveZone: playerState.graveZone,
      cardInHand: playerState.cardInHand,
    });
  } catch (error) {
    res.status(500).json({ error: "No data To Show Cards" });
  }
});

app.post("/tribute-summon", async (req, res) => {
  try {
    const { card, tributeGuidIds } = req.body;
    const { guid_id, tribute_count } = card;
    const player = req.query.player;
    let playerState = getPlayerState(player);

    // Nếu tribute_count = 2, loại bỏ 2 monsters từ monsterZone
    if (tribute_count === 2) {
      // Lọc và loại bỏ 2 monsters có guid_id được chỉ định
      for (let i = 0; i < tributeGuidIds.length; i++) {
        const index = playerState.monsterZone.findIndex(
          (c) => c.guid_id === tributeGuidIds[i]
        );
        if (index !== -1) {
          const [removedCard] = playerState.monsterZone.splice(index, 1);
          playerState.graveZone.push(removedCard);
        }
      }
    }

    // Loại bỏ card khỏi cardInHand (card đang được summon)
    const handIndex = playerState.cardInHand.findIndex(
      (c) => c.guid_id === guid_id
    );
    if (handIndex !== -1) {
      playerState.cardInHand.splice(handIndex, 1);
    }

    // Thêm card vào monsterZone
    playerState.monsterZone.push(card);

    res.status(200).json({
      monsterZone: playerState.monsterZone,
      spellTrapZone: playerState.spellTrapZone,
      graveZone: playerState.graveZone,
      cardInHand: playerState.cardInHand,
    });
  } catch (error) {
    res.status(500).json({ error: "No data To Show Cards" });
  }
});

app.get("/monster-zone-list", (req, res) => {
  const player = req.query.player;
  let playerState = getPlayerState(player);
  res.status(200).json(playerState.monsterZone);
});

app.get("/spell-trap-zone-list", (req, res) => {
  const player = req.query.player;
  let playerState = getPlayerState(player);
  res.status(200).json(playerState.spellTrapZone);
});

app.get("/graveyard-zone-list", (req, res) => {
  const player = req.query.player;
  let playerState = getPlayerState(player);
  res.status(200).json(playerState.graveZone);
});

app.get("/card-in-hand-list", (req, res) => {
  const player = req.query.player;
  let playerState = getPlayerState(player);
  res.status(200).json(playerState.cardInHand);
});

app.get("/card-in-deck-list", (req, res) => {
  const player = req.query.player;
  let playerState = getPlayerState(player);
  res.status(200).json(playerState.deckZone);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
