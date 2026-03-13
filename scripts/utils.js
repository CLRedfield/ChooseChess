function generateRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    for (let index = 0; index < 6; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return code;
}

function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const PLAYER_ID_STORAGE_KEY = "choosechess-player-session-id";
const OWNED_ROOMS_STORAGE_KEY = "choosechess-owned-room-codes";

function createPlayerId() {
    return `player-${Math.random().toString(36).slice(2, 10)}`;
}

function getPlayerId() {
    const existing = window.sessionStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (existing) {
        return existing;
    }

    const created = createPlayerId();
    window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, created);
    return created;
}

function setPlayerId(playerId) {
    window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
    return playerId;
}

function rotatePlayerId() {
    return setPlayerId(createPlayerId());
}

function getOwnedOnlineRoomCodes() {
    const stored = window.sessionStorage.getItem(OWNED_ROOMS_STORAGE_KEY);
    if (!stored) {
        return [];
    }

    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("Failed to parse owned room list:", error);
        return [];
    }
}

function rememberOwnedOnlineRoom(roomCode) {
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return;
    }

    const nextCodes = getOwnedOnlineRoomCodes();
    if (!nextCodes.includes(normalizedCode)) {
        nextCodes.push(normalizedCode);
        window.sessionStorage.setItem(OWNED_ROOMS_STORAGE_KEY, JSON.stringify(nextCodes));
    }
}

function isOwnedOnlineRoom(roomCode) {
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return false;
    }

    return getOwnedOnlineRoomCodes().includes(normalizedCode);
}

function inferPromotion(move) {
    if (move.promotion) {
        return move.promotion;
    }

    if (move.flags && move.flags.includes("p")) {
        return "q";
    }

    return "q";
}

function squareToIndices(square) {
    const file = square[0];
    const rank = Number(square[1]);

    return {
        row: 8 - rank,
        col: FILES.indexOf(file)
    };
}

function getLastMoveSquares(moves) {
    if (!Array.isArray(moves) || moves.length === 0) {
        return [];
    }

    const lastMove = moves[moves.length - 1];
    return [lastMove.from, lastMove.to];
}

function getCurrentHistory() {
    if (isCardModeSessionActive() && state.cardMode) {
        return state.cardMode.history;
    }

    if (state.mode === "online" && state.online.roomData && Array.isArray(state.online.roomData.moves)) {
        return state.online.roomData.moves;
    }

    return state.localHistory;
}

function isOnlineCardRoom(roomCandidate) {
    const room = roomCandidate || (state && state.online ? state.online.roomData : null);
    return Boolean(room && room.gameType === "card" && room.cardState);
}

function isCardModeSessionActive() {
    return Boolean(state && state.cardMode && (state.mode === "card" || isOnlineCardRoom()));
}

function getBoardOrientation() {
    return state.mode === "online" && state.playerColor === "b" ? "b" : "w";
}

function getRenderFiles() {
    return getBoardOrientation() === "w" ? FILES : FILES.slice().reverse();
}

function getRenderRanks() {
    return getBoardOrientation() === "w" ? RANKS : RANKS.slice().reverse();
}

function findKingSquareInCheck() {
    if (!state.chess.in_check()) {
        return null;
    }

    const boardMatrix = state.chess.board();
    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const piece = boardMatrix[row][col];
            if (piece && piece.type === "k" && piece.color === state.chess.turn()) {
                return `${FILES[col]}${8 - row}`;
            }
        }
    }

    return null;
}
