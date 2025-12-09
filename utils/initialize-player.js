// Khởi tạo state cho Player
export const initializePlayer = (playerId) => {
  {
    if (!playerGameStates.has(playerId)) {
      playerGameStates.set(playerId, createPlayerState());
    }
    return playerGameStates.get(playerId);
  }
};

// Tìm state của Player này
export const getPlayerState = (playerId) => {
  return playerGameStates.get(playerId);
};