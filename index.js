import express from "express";
import { shuffleDeck } from "./utils/shuffle-deck.js";
import router from "./routers/router.js";
const app = express();
app.use(express.json());
app.use(router);
const port = 3000;

const playerGameStates = new Map();

// State quản lý chung cho 2 player
const createPlayerState = () => {
  return {
    monsterZone: [],
    spellTrapZone: [],
    graveZone: [],
    deckZone: [],
    cardInHand: [],
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

    const data = await fetch(`http://localhost:4000/${player}`);
    const cardData = await data.json();
    const cardsRemainInDeck = cardData.map((card) => ({
      ...card,
      guid_id: crypto.randomUUID(),
    }));
    playerState.deckZone = [...cardsRemainInDeck];

    console.log(`Player ${player} - deckZone initialized:`, playerState.deckZone.length);
    res.status(200).json(playerState.deckZone);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/draw-one-card", async (req, res) => {
  try {
    const player = req.query.player;
    const playerState = getPlayerState(player);
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
      cardInHand:playerState.cardInHand,
      monsterZone:playerState.monsterZone,
      deckZone:playerState.deckZone,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/get-first-5-cards", async (req, res) => {
  try {
    const player = req.query.player;
    const playerState = getPlayerState(player);
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
    playerState.deckZone = playerState.deckZone.filter((card) => !drawnIds.includes(card.id));

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
    const player = req.query.player;
    const playerState = getPlayerState(player);
    for (const card of playerState.monsterZone) {
      card.position = "monster_zone";
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
      deckZone:player.deckZone,
      cardInHand: player.cardInHand
    });
  } catch (error) {
    res.status(500).json({ error: "No data To Show Cards" });
  }
});

app.post("/status-card-in-field", async (req, res) => {
  try {
    const card = req.body;
    const player = req.query.player;
    const playerState = getPlayerState(player);

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
    playerState.cardInHand = playerState.cardInHand.filter((c) => c.guid_id !== guid_id);

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
    const playerState = getPlayerState(player);
    const { position: position } = card;
    if (position === "monster_zone") {
      const index = playerState.monsterZone.findIndex((c) => c.guid_id === card.guid_id);
      if (index !== -1) {
        const [removedCard] = playerState.monsterZone.splice(index, 1);
        playerState.graveZone.push(removedCard);
      }
    } else if (position === "spell_trap_zone") {
      const index = playerState.spellTrapZone.findIndex((c) => c.guid_id === card.guid_id);
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
    const playerState = getPlayerState(player);
    const { guid_id } = card;

    // Loại bỏ card khỏi cardInHand (card đang được summon)
    const handIndex = playerState.cardInHand.findIndex((c) => c.guid_id === guid_id);
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
    const playerState = getPlayerState(player);
    const { guid_id } = card;
    // Loại bỏ card khỏi cardInHand (card đang được summon)
    const handIndex = playerState.cardInHand.findIndex((c) => c.guid_id === guid_id);
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
    const playerState = getPlayerState(player);

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
    const handIndex = playerState.cardInHand.findIndex((c) => c.guid_id === guid_id);
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
  const playerState = getPlayerState(player);
  res.status(200).json(playerState.monsterZone);
});

app.get("/spell-trap-zone-list", (req, res) => {
  const player = req.query.player;
  const playerState = getPlayerState(player);
  res.status(200).json(playerState.spellTrapZone);
});

app.get("/graveyard-zone-list", (req, res) => {
  const player = req.query.player;
  const playerState = getPlayerState(player);
  res.status(200).json(playerState.graveZone);
});

app.get("/card-in-hand-list", (req, res) => {
  const player = req.query.player;
  const playerState = getPlayerState(player);
  res.status(200).json(playerState.cardInHand);
});

app.get("/card-in-deck-list", (req, res) => {
  const player = req.query.player;
  const playerState = getPlayerState(player);
  res.status(200).json(playerState.deckZone);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
