async function createOnlineRoom(roomSetup) {
    if (!await ensureOnlineReady("创建房间")) {
        return;
    }

    const setup = normalizeOnlineRoomSetup(roomSetup);
    const roomCode = generateRoomCode();
    const roomRef = window.database.ref(`rooms/${roomCode}`);

    try {
        const snapshot = await roomRef.once("value");
        if (snapshot.exists()) {
            return createOnlineRoom(setup);
        }

        const roomData = setup.gameType === "card"
            ? buildOnlineCardRoomData(setup)
            : buildOnlineClassicRoomData();

        await roomRef.set(roomData);
        rememberOwnedOnlineRoom(roomCode);
        attachToRoom(roomCode, "w");
        initializeOnlineLocalStateFromRoom(roomData);
        showGameScreen();
        renderBoard();
        updatePanels(roomData);
        const modeLabel = setup.gameType === "card" ? "选卡模式" : "普通模式";
        showToast(`房间 ${roomCode} 已创建，模式：${modeLabel}。`, "success");
    } catch (error) {
        console.error(error);
        showToast(formatOnlineError(error, "创建房间"), "error");
    }
}

function buildOnlineClassicRoomData() {
    return {
        gameType: "classic",
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        status: "waiting",
        fen: new Chess().fen(),
        moves: [],
        players: {
            white: {
                id: state.online.playerId,
                connected: true,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            },
            black: null
        },
        turn: "w",
        result: null,
        pendingUndo: null,
        lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
    };
}

function buildOnlineCardRoomData(setup) {
    const cardState = createInitialOnlineCardState(setup.cardSettings);

    return {
        gameType: "card",
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        status: "waiting",
        players: {
            white: {
                id: state.online.playerId,
                connected: true,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            },
            black: null
        },
        cardState: serializeCardModeRoomState(cardState),
        cardUndoStack: [],
        cardLastMoveSquares: [],
        pendingUndo: null,
        lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
    };
}

function createInitialOnlineCardState(settingsCandidate) {
    const cardState = createCardModeEmptyState({
        ...createCardModeSettings(settingsCandidate),
        opponentType: "local",
        aiDifficulty: "medium"
    });
    cardState.board = createCardModeInitialBoard();
    cardState.offers = createCardModeOffers(cardState.settings);
    initializeCardModeTurnState(cardState);
    return cardState;
}

function normalizeOnlineRoomSetup(roomSetup) {
    const setup = roomSetup || state.onlineRoomSetup || createOnlineRoomSetupState();
    return {
        gameType: setup.gameType === "card" ? "card" : "classic",
        cardSettings: createCardModeSettings({
            ...(setup.cardSettings || {}),
            opponentType: "local",
            aiDifficulty: "medium"
        })
    };
}

function roomHasProgress(room) {
    if (!room) {
        return false;
    }

    if (room.gameType === "card") {
        return Boolean(
            room.cardState &&
            Array.isArray(room.cardState.history) &&
            room.cardState.history.length > 0
        );
    }

    return Boolean(Array.isArray(room.moves) && room.moves.length > 0);
}

function canClaimBlackSeat(room) {
    const blackPlayer = room && room.players ? room.players.black : null;
    if (!blackPlayer) {
        return true;
    }

    if (blackPlayer.id === state.online.playerId) {
        return true;
    }

    if (blackPlayer.connected !== false) {
        return false;
    }

    return !roomHasProgress(room);
}

function resolveOnlineRoomStatusAfterJoin(room) {
    if (room && room.gameType === "card") {
        return room.cardState && room.cardState.status === "finished" ? "finished" : "playing";
    }

    return "playing";
}

function fixJoinIdentityCollision(roomCode, room) {
    if (!room || !room.players || !room.players.white) {
        return false;
    }

    if (room.players.white.id !== state.online.playerId) {
        return false;
    }

    if (isOwnedOnlineRoom(roomCode)) {
        return false;
    }

    state.online.playerId = rotatePlayerId();
    return true;
}

async function refreshOnlineRoomSnapshot(roomRef) {
    const snapshot = await roomRef.once("value");
    return snapshot.exists() ? snapshot.val() : null;
}

async function markOnlinePlayerConnected(roomRef, colorKey, room) {
    await roomRef.update({
        [`players/${colorKey}/id`]: state.online.playerId,
        [`players/${colorKey}/connected`]: true,
        lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
    });

    if (colorKey === "black") {
        await roomRef.update({
            status: resolveOnlineRoomStatusAfterJoin(room),
            lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
        });
    }

    return refreshOnlineRoomSnapshot(roomRef);
}

async function claimOnlineBlackSeat(roomRef, room) {
    const allowDisconnectedTakeover = !roomHasProgress(room);
    const seatRef = roomRef.child("players/black");
    const result = await seatRef.transaction((current) => {
        if (!current || current.id === state.online.playerId) {
            return {
                ...(current || {}),
                id: state.online.playerId,
                connected: true,
                joinedAt: current && current.joinedAt ? current.joinedAt : firebase.database.ServerValue.TIMESTAMP
            };
        }

        if (allowDisconnectedTakeover && current.connected === false) {
            return {
                id: state.online.playerId,
                connected: true,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            };
        }

        return;
    });

    if (!result.committed || !result.snapshot.exists()) {
        return null;
    }

    await roomRef.update({
        status: resolveOnlineRoomStatusAfterJoin(room),
        lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
    });

    return refreshOnlineRoomSnapshot(roomRef);
}

async function joinOnlineRoom() {
    if (!await ensureOnlineReady("加入房间")) {
        return;
    }

    const roomCode = elements.roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
        showToast("请先输入房间码。", "error");
        return;
    }

    if (roomCode.length !== 6) {
        showToast("房间码应为 6 位，请检查后再加入。", "error");
        return;
    }

    const roomRef = window.database.ref(`rooms/${roomCode}`);

    try {
        const previewSnapshot = await roomRef.once("value");
        if (!previewSnapshot.exists()) {
            showToast("房间不存在，请检查房间码。", "error");
            return;
        }

        const previewRoom = previewSnapshot.val();
        if (fixJoinIdentityCollision(roomCode, previewRoom)) {
            showToast("检测到当前页面与房主身份冲突，已自动切换身份后继续加入。", "success");
        }

        let room = null;
        if (previewRoom.players && previewRoom.players.white && previewRoom.players.white.id === state.online.playerId) {
            room = await markOnlinePlayerConnected(roomRef, "white", previewRoom);
        } else if (previewRoom.players && previewRoom.players.black && previewRoom.players.black.id === state.online.playerId) {
            room = await markOnlinePlayerConnected(roomRef, "black", previewRoom);
        } else if (!canClaimBlackSeat(previewRoom)) {
            showToast("房间已满员。", "error");
            return;
        } else {
            room = await claimOnlineBlackSeat(roomRef, previewRoom);
        }

        if (!room) {
            const latestRoom = await refreshOnlineRoomSnapshot(roomRef);
            if (!latestRoom) {
                showToast("房间不存在，请检查房间码。", "error");
                return;
            }

            if (fixJoinIdentityCollision(roomCode, latestRoom)) {
                showToast("检测到当前页面与房主身份冲突，请再点一次加入。", "error");
                return;
            }

            if (!canClaimBlackSeat(latestRoom)) {
                showToast("房间已满员。", "error");
                return;
            }

            showToast("加入房间失败，请稍后重试。", "error");
            return;
        }

        const playerColor = room.players.white && room.players.white.id === state.online.playerId ? "w" : "b";
        attachToRoom(roomCode, playerColor);
        initializeOnlineLocalStateFromRoom(room);
        elements.roomCodeInput.value = "";
        showGameScreen();
        renderBoard();
        updatePanels(room);
        showToast(`已加入房间 ${roomCode}。`, "success");
    } catch (error) {
        console.error(error);
        showToast(formatOnlineError(error, "加入房间"), "error");
    }
}

function attachToRoom(roomCode, playerColor) {
    cleanupOnlineRoom({ preserveRoom: false, silentPresence: true });
    state.mode = "online";
    state.aiDifficulty = null;
    state.aiThinking = false;
    state.playerColor = playerColor;
    state.online.roomCode = roomCode;
    state.online.roomRef = window.database.ref(`rooms/${roomCode}`);
    state.online.roomData = null;
    state.online.pendingUndoHandledId = null;
    state.localHistory = [];
    state.online.listener = handleRoomSnapshot;
    registerPresence();
    state.online.roomRef.on("value", state.online.listener);
}

function registerPresence() {
    if (!state.online.roomRef) {
        return;
    }

    const colorKey = state.playerColor === "w" ? "white" : "black";
    const playerRef = state.online.roomRef.child(`players/${colorKey}`);
    playerRef.update({
        id: state.online.playerId,
        connected: true,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
    playerRef.onDisconnect().update({
        connected: false
    });
}

function initializeOnlineLocalStateFromRoom(room) {
    state.selectedSquare = null;
    state.legalMoves = [];
    state.announcedResultKey = null;

    if (isOnlineCardRoom(room)) {
        state.cardMode = createCardModeStateFromRoomData(room.cardState);
        state.chess = new Chess();
        state.lastMoveSquares = (room.cardLastMoveSquares || []).slice();
        return;
    }

    state.cardMode = null;
    state.chess = new Chess();
    state.chess.load(room.fen || new Chess().fen());
    state.lastMoveSquares = getLastMoveSquares(room.moves);
}

function createCardModeStateFromRoomData(roomCardState) {
    const nextState = createCardModeEmptyState(roomCardState.settings);
    applyCardModeSnapshotToState(nextState, roomCardState);
    nextState.undoStack = [];
    nextState.pendingActionSnapshot = null;
    return nextState;
}

function sanitizeFirebasePayload(value) {
    if (value === undefined) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeFirebasePayload(item));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    const sanitized = {};
    Object.entries(value).forEach(([key, childValue]) => {
        sanitized[key] = sanitizeFirebasePayload(childValue);
    });
    return sanitized;
}

function serializeCardModeRoomState(cardState) {
    const snapshot = cloneCardModeSnapshot({
        settings: cardState.settings,
        board: cardState.board,
        turn: cardState.turn,
        turnCounts: cardState.turnCounts,
        drawCounts: cardState.drawCounts,
        offers: cardState.offers,
        hands: cardState.hands,
        selectedSquare: null,
        legalMoves: [],
        capturedBy: cardState.capturedBy,
        history: cardState.history,
        phase: cardState.phase,
        pendingOffer: cardState.pendingOffer,
        deploying: null,
        status: cardState.status,
        winner: cardState.winner,
        resultMessage: cardState.resultMessage,
        lastMoveSquares: []
    });

    snapshot.selectedSquare = null;
    snapshot.legalMoves = [];
    snapshot.deploying = null;
    return sanitizeFirebasePayload(snapshot);
}

function serializeCardModeUndoSnapshot(snapshot) {
    const sanitized = cloneCardModeSnapshot(snapshot);
    sanitized.selectedSquare = null;
    sanitized.legalMoves = [];
    sanitized.deploying = null;
    return sanitizeFirebasePayload(sanitized);
}

function limitCardUndoStack(undoStack) {
    const sanitizedStack = normalizeCardModeArray(undoStack).map((entry) => sanitizeFirebasePayload(entry));
    return sanitizedStack.length > 60
        ? sanitizedStack.slice(sanitizedStack.length - 60)
        : sanitizedStack;
}

function handleRoomSnapshot(snapshot) {
    const previousRoom = state.online.roomData;
    const room = snapshot.val();
    if (!room) {
        showToast("房间已不存在。", "error");
        cleanupOnlineRoom({ preserveRoom: false, silentPresence: true });
        returnToHome(true);
        return;
    }

    state.online.roomData = room;

    if (isOnlineCardRoom(room)) {
        const keepLocalDeploy = Boolean(
            state.cardMode &&
            state.cardMode.phase === "deploy" &&
            previousRoom &&
            isOnlineCardRoom(previousRoom) &&
            previousRoom.cardState &&
            room.cardState &&
            previousRoom.cardState.history.length === room.cardState.history.length &&
            previousRoom.cardState.turn === room.cardState.turn
        );

        if (!keepLocalDeploy) {
            state.cardMode = createCardModeStateFromRoomData(room.cardState);
            state.lastMoveSquares = (room.cardLastMoveSquares || []).slice();
        }

        renderBoard();
        updatePanels(room);
        handleUndoState(room);
        syncOnlineCardResultNotification(room);
        return;
    }

    if (room.fen && room.fen !== state.chess.fen()) {
        state.chess.load(room.fen);
    }

    state.cardMode = null;
    state.lastMoveSquares = getLastMoveSquares(room.moves);
    state.selectedSquare = null;
    state.legalMoves = [];
    renderBoard();
    updatePanels(room);
    handleUndoState(room);
    syncResultNotification();
}

function syncOnlineCardResultNotification(room) {
    if (!state.cardMode || state.cardMode.status !== "finished" || !state.cardMode.resultMessage) {
        state.announcedResultKey = null;
        return;
    }

    const key = `card:${room.lastUpdatedAt || state.cardMode.history.length}:${state.cardMode.resultMessage}`;
    if (state.announcedResultKey === key) {
        return;
    }

    state.announcedResultKey = key;
    showToast(state.cardMode.resultMessage, state.cardMode.winner ? "success" : "error");
}

function handleUndoState(room) {
    const pendingUndo = room.pendingUndo;
    if (!pendingUndo) {
        hideModal();
        return;
    }

    if (pendingUndo.status === "pending") {
        if (pendingUndo.requesterId === state.online.playerId) {
            hideModal();
            return;
        }

        const requesterLabel = pendingUndo.requesterColor === "w" ? "白方" : "黑方";
        showModal({
            label: "悔棋请求",
            title: `${requesterLabel} 请求悔棋`,
            message: "同意后会撤回对手刚刚完成的上一步。",
            actions: [
                { label: "拒绝", type: "secondary", onClick: () => resolveUndoRequest(false) },
                { label: "同意", type: "primary", onClick: () => resolveUndoRequest(true) }
            ]
        });
        return;
    }

    if (state.online.pendingUndoHandledId === pendingUndo.id) {
        hideModal();
        return;
    }

    state.online.pendingUndoHandledId = pendingUndo.id;
    hideModal();

    if (pendingUndo.status === "approved") {
        const message = pendingUndo.requesterId === state.online.playerId ? "对手同意了你的悔棋请求。" : "你已同意对手悔棋。";
        showToast(message, "success");
    } else if (pendingUndo.status === "rejected") {
        const message = pendingUndo.requesterId === state.online.playerId ? "对手拒绝了你的悔棋请求。" : "你已拒绝对手悔棋。";
        showToast(message, "error");
    }

    window.setTimeout(() => {
        if (!state.online.roomRef) {
            return;
        }
        state.online.roomRef.child("pendingUndo").transaction((current) => {
            if (!current || current.id !== pendingUndo.id || current.status === "pending") {
                return current;
            }
            return null;
        });
    }, 900);
}

async function resolveUndoRequest(approved) {
    if (!state.online.roomRef) {
        return;
    }

    try {
        await state.online.roomRef.transaction((room) => {
            if (!room || !room.pendingUndo || room.pendingUndo.status !== "pending") {
                return room;
            }

            if (room.pendingUndo.requesterId === state.online.playerId) {
                return room;
            }

            if (!approved) {
                room.pendingUndo.status = "rejected";
                room.lastUpdatedAt = firebase.database.ServerValue.TIMESTAMP;
                return room;
            }

            if (room.gameType === "card") {
                const nextUndoStack = Array.isArray(room.cardUndoStack) ? room.cardUndoStack.slice() : [];
                const undoEntry = nextUndoStack.pop();
                if (!undoEntry || !undoEntry.snapshot) {
                    return room;
                }

                room.cardState = serializeCardModeUndoSnapshot(undoEntry.snapshot);
                room.cardUndoStack = nextUndoStack;
                room.cardLastMoveSquares = (undoEntry.snapshot.lastMoveSquares || []).slice();
                room.status = room.cardState.status === "finished"
                    ? "finished"
                    : (room.players && room.players.black ? "playing" : "waiting");
                room.pendingUndo.status = "approved";
                room.lastUpdatedAt = firebase.database.ServerValue.TIMESTAMP;
                return room;
            }

            const nextMoves = Array.isArray(room.moves) ? room.moves.slice(0, -1) : [];
            const chess = new Chess();
            nextMoves.forEach((move) => {
                chess.move({
                    from: move.from,
                    to: move.to,
                    promotion: move.promotion || "q"
                });
            });

            room.moves = nextMoves;
            room.fen = chess.fen();
            room.turn = chess.turn();
            room.result = getGameResult(chess);
            room.status = room.result ? "finished" : (room.players && room.players.black ? "playing" : "waiting");
            room.pendingUndo.status = "approved";
            room.lastUpdatedAt = firebase.database.ServerValue.TIMESTAMP;
            return room;
        });
    } catch (error) {
        console.error(error);
        showToast(formatOnlineError(error, "处理悔棋请求"), "error");
    }
}

function cleanupOnlineRoom(options) {
    if (state.online.roomRef && state.online.listener) {
        state.online.roomRef.off("value", state.online.listener);
    }

    if (state.online.roomRef && !options.preserveRoom && !options.silentPresence && state.mode === "online") {
        const colorKey = state.playerColor === "w" ? "white" : "black";
        state.online.roomRef.child(`players/${colorKey}/connected`).set(false).catch(() => undefined);
    }

    if (!options.preserveRoom) {
        state.online.roomCode = null;
        state.online.roomRef = null;
        state.online.roomData = null;
        state.online.listener = null;
        state.online.pendingUndoHandledId = null;
    }
}

async function submitOnlineMove(move) {
    if (isOnlineCardRoom()) {
        await submitOnlineCardMove(move);
        return;
    }

    if (!state.online.roomRef) {
        return;
    }

    const promotion = move.promotion || inferPromotion(move);

    try {
        const result = await state.online.roomRef.transaction((room) => {
            if (!room || room.status !== "playing") {
                return room;
            }

            if (room.pendingUndo && room.pendingUndo.status === "pending") {
                return;
            }

            const chess = new Chess();
            chess.load(room.fen || new Chess().fen());
            if (chess.turn() !== state.playerColor) {
                return;
            }

            const applied = chess.move({
                from: move.from,
                to: move.to,
                promotion
            });

            if (!applied) {
                return;
            }

            const nextMoves = Array.isArray(room.moves) ? room.moves.slice() : [];
            nextMoves.push({
                from: applied.from,
                to: applied.to,
                san: applied.san,
                color: applied.color,
                piece: applied.piece,
                captured: applied.captured || null,
                promotion: applied.promotion || null
            });

            room.moves = nextMoves;
            room.fen = chess.fen();
            room.turn = chess.turn();
            room.result = getGameResult(chess);
            room.status = room.result ? "finished" : "playing";
            room.lastUpdatedAt = firebase.database.ServerValue.TIMESTAMP;
            return room;
        });

        if (!result.committed) {
            showToast("当前无法落子，请稍后再试。", "error");
        }
    } catch (error) {
        console.error(error);
        showToast(formatOnlineError(error, "同步联机落子"), "error");
    }
}

async function submitOnlineCardDraftChoice(cardId) {
    if (!state.online.roomRef) {
        return;
    }

    try {
        const result = await state.online.roomRef.transaction((room) => {
            if (!isOnlineCardRoom(room) || room.status !== "playing") {
                return room;
            }

            if (room.pendingUndo && room.pendingUndo.status === "pending") {
                return;
            }

            const cardState = createCardModeStateFromRoomData(room.cardState);
            if (cardState.turn !== state.playerColor || cardState.phase !== "draft") {
                return;
            }

            const selected = applyCardModeDraftChoiceToState(cardState, cardId);
            if (!selected) {
                return;
            }

            room.cardState = serializeCardModeRoomState(cardState);
            room.cardLastMoveSquares = [];
            room.status = room.players && room.players.black ? "playing" : "waiting";
            room.lastUpdatedAt = firebase.database.ServerValue.TIMESTAMP;
            return room;
        });

        if (!result.committed) {
            showToast("当前不能选择这张卡。", "error");
        }
    } catch (error) {
        console.error(error);
        showToast(formatOnlineError(error, "提交选卡"), "error");
    }
}

async function submitOnlineCardMove(move) {
    if (!state.online.roomRef) {
        return;
    }

    try {
        const result = await state.online.roomRef.transaction((room) => {
            if (!isOnlineCardRoom(room) || room.status !== "playing") {
                return room;
            }

            if (room.pendingUndo && room.pendingUndo.status === "pending") {
                return;
            }

            const cardState = createCardModeStateFromRoomData(room.cardState);
            if (cardState.turn !== state.playerColor || cardState.phase !== "action") {
                return;
            }

            const legalMove = getCardModeLegalMoves(cardState.board, move.from)
                .find((candidate) => candidate.to === move.to);
            if (!legalMove) {
                return;
            }

            const undoSnapshot = serializeCardModeUndoSnapshot(room.cardState);
            applyCardModeMoveActionToState(cardState, legalMove);

            room.cardUndoStack = limitCardUndoStack(
                (Array.isArray(room.cardUndoStack) ? room.cardUndoStack.slice() : []).concat({
                    actorColor: state.playerColor,
                    snapshot: undoSnapshot
                })
            );
            room.cardState = serializeCardModeRoomState(cardState);
            room.cardLastMoveSquares = [legalMove.from, legalMove.to];
            room.status = cardState.status === "finished" ? "finished" : "playing";
            room.lastUpdatedAt = firebase.database.ServerValue.TIMESTAMP;
            return room;
        });

        if (!result.committed) {
            showToast("当前无法完成这一步。", "error");
        }
    } catch (error) {
        console.error(error);
        showToast(formatOnlineError(error, "同步选卡落子"), "error");
    }
}

async function submitOnlineCardDeploy(cardId, placements) {
    if (!state.online.roomRef) {
        return;
    }

    try {
        const result = await state.online.roomRef.transaction((room) => {
            if (!isOnlineCardRoom(room) || room.status !== "playing") {
                return room;
            }

            if (room.pendingUndo && room.pendingUndo.status === "pending") {
                return;
            }

            const cardState = createCardModeStateFromRoomData(room.cardState);
            if (cardState.turn !== state.playerColor || cardState.phase !== "action") {
                return;
            }

            const undoSnapshot = serializeCardModeUndoSnapshot(room.cardState);
            const applyResult = applyCardModeDeployActionToState(cardState, cardId, placements);
            if (!applyResult && cardState.history.length === room.cardState.history.length) {
                return;
            }

            room.cardUndoStack = limitCardUndoStack(
                (Array.isArray(room.cardUndoStack) ? room.cardUndoStack.slice() : []).concat({
                    actorColor: state.playerColor,
                    snapshot: undoSnapshot
                })
            );
            room.cardState = serializeCardModeRoomState(cardState);
            room.cardLastMoveSquares = placements.length ? [placements[placements.length - 1].square] : [];
            room.status = cardState.status === "finished" ? "finished" : "playing";
            room.lastUpdatedAt = firebase.database.ServerValue.TIMESTAMP;
            return room;
        });

        if (!result.committed) {
            showToast("当前无法完成本次布阵。", "error");
        }
    } catch (error) {
        console.error(error);
        showToast(formatOnlineError(error, "同步选卡布阵"), "error");
    }
}

async function requestOnlineUndo() {
    if (!state.online.roomRef || !state.online.roomData) {
        return;
    }

    try {
        const result = await state.online.roomRef.transaction((room) => {
            if (!room) {
                return room;
            }

            if (room.pendingUndo && room.pendingUndo.status === "pending") {
                return;
            }

            if (room.gameType === "card") {
                const undoStack = Array.isArray(room.cardUndoStack) ? room.cardUndoStack : [];
                const lastEntry = undoStack[undoStack.length - 1];
                if (!lastEntry || lastEntry.actorColor !== state.playerColor) {
                    return;
                }
                if (!room.cardState || room.cardState.turn === state.playerColor) {
                    return;
                }
            } else {
                if (!Array.isArray(room.moves) || room.moves.length === 0) {
                    return room;
                }

                const lastMove = room.moves[room.moves.length - 1];
                if (!lastMove || lastMove.color !== state.playerColor) {
                    return;
                }
            }

            room.pendingUndo = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                requesterId: state.online.playerId,
                requesterColor: state.playerColor,
                requestedAt: firebase.database.ServerValue.TIMESTAMP,
                status: "pending"
            };
            room.lastUpdatedAt = firebase.database.ServerValue.TIMESTAMP;
            return room;
        });

        if (!result.committed) {
            showToast("当前不能发起悔棋请求。", "error");
            return;
        }

        showToast("已向对手发起悔棋请求。", "success");
    } catch (error) {
        console.error(error);
        showToast(formatOnlineError(error, "发送悔棋请求"), "error");
    }
}

async function ensureOnlineReady(actionLabel) {
    if (!window.database) {
        showToast("未检测到 Firebase 数据库实例，无法使用联机功能。", "error");
        return false;
    }

    if (typeof window.ensureFirebaseReady !== "function") {
        showToast("Firebase 鉴权未初始化，无法使用联机功能。", "error");
        return false;
    }

    try {
        await window.ensureFirebaseReady();
        return true;
    } catch (error) {
        console.error(error);
        showToast(formatOnlineError(error, actionLabel), "error");
        return false;
    }
}

function formatOnlineError(error, actionLabel) {
    const actionText = actionLabel || "联机操作";
    const rawCode = String((error && error.code) || "").toLowerCase();
    const rawMessage = String((error && error.message) || "");
    const combined = `${rawCode} ${rawMessage}`.toLowerCase();

    if (combined.includes("permission_denied") || combined.includes("permission-denied")) {
        return `${actionText}失败：Firebase 数据库拒绝了当前账号的读写权限。请检查 Realtime Database 规则是否允许已登录用户访问 rooms 节点。`;
    }

    if (combined.includes("operation-not-allowed")) {
        return `${actionText}失败：Firebase 匿名登录没有开启。请到 Firebase Authentication 打开 Anonymous 登录。`;
    }

    if (combined.includes("network")) {
        return `${actionText}失败：网络连接异常，请稍后重试。`;
    }

    if (combined.includes("auth")) {
        return `${actionText}失败：Firebase 登录未完成，请刷新页面后重试。`;
    }

    return `${actionText}失败：${rawMessage || "请稍后重试。"}`
        .replace(/\s+/g, " ")
        .trim();
}
