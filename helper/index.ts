function generateRoomNumber() {
    const TABLE = `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`;
    let result = ``;
    for (let i = 0; i < 4; i++) {
        result += TABLE[Math.floor(TABLE.length * Math.random())];
    }
    return result;
}

export {
    generateRoomNumber
};
