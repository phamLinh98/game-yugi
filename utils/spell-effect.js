export const destroyAllCard = (array) => {
    array.splice(0, array.length);
}

export const destroyOneMonster = (card) => {
    const index = hand.findIndex(c => c.guid_id === card.guid_id);
    if (index !== -1) {
        hand.splice(index, 1);
    }
}