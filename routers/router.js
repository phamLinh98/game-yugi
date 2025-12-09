import express from 'express';
import * as deckController from '../controllers/deck-controllers.js';

const router = express.Router();
router.get('/deck', deckController.getDeckController);
export default router;