import express from "express";
const app = express();
app.use(express.json());
const port = 3000;
const shuffleDeck = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Monster Zone show monster card
const monsterZone = [];

// Spell Trap Zone show S/T card
const spellTrapZone = [];

// Grave Yard Zone show card has been destroyed
const graveZone = [];

// Deck Zone show card remain in deck
let deckZone = [];

// Card in Hand show card player have in hand
let cardInHand = [];

// Draw first card from deck
let drawFirstCard = {};

app.get("/card-remain-in-deck", async (req, res) => {
  try {
    const data = await fetch("http://localhost:4000/card");
    const cardData = await data.json();
    const cardsRemainInDeck = cardData.map((card) => ({
      ...card,
      guid_id: crypto.randomUUID(),
    }));
    deckZone = [...cardsRemainInDeck];
    console.log("deckZone initialized", deckZone.length);
    res.status(200).json(deckZone);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/draw-one-card", async (req, res) => {
  try {
    if (deckZone.length === 0) {
      return res.status(400).json({ message: "Deck is empty. You Lost" });
    }
    const shuffleBeforeDraw = await shuffleDeck(deckZone);
    drawFirstCard = await shuffleBeforeDraw[0];
    cardInHand.push(drawFirstCard);
    deckZone = deckZone.filter(
      (card) => card.guid_id !== drawFirstCard.guid_id
    );
    res.status(200).json({
      drawFirstCard,
      cardInHand,
      deckZone,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/get-first-5-cards", async (req, res) => {
  try {
    // Shuffle và lấy 5 lá từ deckZone hiện tại
    if (deckZone.length === 0) {
      return res.status(400).json({ error: "Deck is empty. You Lost" });
    }

    // Shuffle deckZone
    const shuffled = deckZone.sort(() => Math.random() - 0.5);

    // Draw 5 cards first
    const deckZonefirst5Cards = shuffled.slice(0, 5);

    // Add 5 cards to hand
    cardInHand = [...deckZonefirst5Cards];

    // Loại bỏ 5 lá khỏi deck (dùng id gốc thay vì guid_id)
    const drawnIds = deckZonefirst5Cards.map((card) => card.id);
    deckZone = deckZone.filter((card) => !drawnIds.includes(card.id));

    console.log("Cards drawn:", deckZonefirst5Cards.length);
    console.log("Cards remaining in deck:", deckZone.length);

    res.status(200).json({
      cardInHand,
      deckZone,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/set-card-to-field", async (req, res) => {
  try {
    for (const card of monsterZone) {
      card.position = "monster_zone";
    }

    for (const card of spellTrapZone) {
      card.position = "spell_trap_zone";
    }

    for (const card of graveZone) {
      card.position = "grave_zone";
    }
    res.status(200).json({
      monsterZone,
      spellTrapZone,
      graveZone,
    });
  } catch (error) {
    res.status(500).json({ error: "No data To Show Cards" });
  }
});

app.post("/status-card-in-field", async (req, res) => {
  try {
    const card = req.body;
    const { guid_id: guid_id } = card;
    // Kiểm tra card có tồn tại không
    if (!card || !card.type) {
      return res.status(400).json({ error: "Invalid card data" });
    }
    // Check type và add vào mảng tương ứng
    if (card.type === "monster") {
      monsterZone.push(card);
    } else {
      spellTrapZone.push(card);
    }
    // Loại bỏ thẻ khỏi tay người chơi
    cardInHand = cardInHand.filter((c) => c.guid_id !== guid_id);

    res.status(200).json({
      monsterZone,
      spellTrapZone,
      graveZone,
      cardInHand,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to process card" });
  }
});

app.post("/sent-card-to-graveyard", async (req, res) => {
  try {
    const card = req.body;
    const { position: position } = card;
    if (position === "monster_zone") {
      const index = monsterZone.findIndex((c) => c.guid_id === card.guid_id);
      if (index !== -1) {
        const [removedCard] = monsterZone.splice(index, 1);
        graveZone.push(removedCard);
      }
    } else if (position === "spell_trap_zone") {
      const index = spellTrapZone.findIndex((c) => c.guid_id === card.guid_id);
      if (index !== -1) {
        const [removedCard] = spellTrapZone.splice(index, 1);
        graveZone.push(removedCard);
      }
    }
    res.status(200).json({
      monsterZone,
      spellTrapZone,
      graveZone,
    });
  } catch (error) {
    res.status(500).json({ error: "No data To Show Cards" });
  }
});

// còn BUG
app.post("/tribute-summon", async (req, res) => {
  try {
    const card = req.body;
    const { guid_id, tribute_count } = card;
    const tributeGuidIds = req.query.tributeGuidIds;

    // // Mock 2 guid_id của monsters cần tribute (thay thế sau)
    // const tributeGuidIds = [
    //   "0ea0c01e-5904-4139-8316-d6095aa96a84",
    //   "0ea0c01e-5904-4139-8316-d6095aa96a85"  // Sửa lại cho khác nhau
    // ];

    // Nếu tribute_count = 2, loại bỏ 2 monsters từ monsterZone
    if (tribute_count === 2) {
      // Lọc và loại bỏ 2 monsters có guid_id được chỉ định
      for (let i = 0; i < tributeGuidIds.length; i++) {
        const index = monsterZone.findIndex((c) => c.guid_id === tributeGuidIds[i]);
        if (index !== -1) {
          const [removedCard] = monsterZone.splice(index, 1);
          graveZone.push(removedCard);
        }
      }
    }

    // Loại bỏ card khỏi cardInHand (card đang được summon)
    const handIndex = cardInHand.findIndex((c) => c.guid_id === guid_id);
    if (handIndex !== -1) {
      cardInHand.splice(handIndex, 1);
    }

    // Thêm card vào monsterZone
    monsterZone.push(card);

    res.status(200).json({
      monsterZone,
      spellTrapZone,
      graveZone,
      cardInHand
    });
  } catch (error) {
    res.status(500).json({ error: "No data To Show Cards" });
  }
});

app.get("/monster-zone-list", (req, res) => {
  res.status(200).json(monsterZone);
});

app.get("/spell-trap-zone-list", (req, res) => {
  res.status(200).json(spellTrapZone);
});

app.get("/graveyard-zone-list", (req, res) => {
  res.status(200).json(graveZone);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
