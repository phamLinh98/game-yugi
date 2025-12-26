export const destroyAllCard = (array) => {
    array.splice(0, array.length);
}

export const destroyOneCardOnField = (array, guid) => {
    const index = array.findIndex(card => card.guid_id === guid);
    if (index !== -1) {
        array.splice(index, 1);
    }
}