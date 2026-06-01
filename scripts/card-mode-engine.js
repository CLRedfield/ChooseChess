function startCardModeGame(settingsCandidate) {
    const settings = createCardModeSettings(
        settingsCandidate || (state.cardModeSetup && state.cardModeSetup.settings)
    );

    cleanupOnlineRoom({ preserveRoom: false });
    state.mode = "card";
    state.aiDifficulty = settings.opponentType === "ai" ? settings.aiDifficulty : null;
    state.aiColor = "b";
    state.aiThinking = false;
    state.playerColor = "w";
    state.chess = new Chess();
    state.localHistory = [];
    state.selectedSquare = null;
    state.legalMoves = [];
    state.lastMoveSquares = [];
    state.announcedResultKey = null;
    state.hintThinking = false;
    state.hintSquares = [];
    state.hintText = "";
    state.cardModeSetup = { settings };
    state.cardMode = createCardModeEmptyState(settings);
    state.cardMode.board = createCardModeInitialBoard();
    state.cardMode.offers = createCardModeOffers(settings);

    showGameScreen();
    initializeCardModeTurn();
    renderBoard();
    updatePanels();

    const modeLabel = settings.opponentType === "ai"
        ? `对战 AI（${AI_LEVELS[settings.aiDifficulty].label}）`
        : "本地双人";
    showToast(`已开始选卡模式：${modeLabel}，每 ${settings.drawInterval} 回合发 1 组，共 ${settings.offerCount} 组。`, "success");
    scheduleCardModeAiTurn();
}

function initializeCardModeTurn() {
    if (!state.cardMode) {
        return;
    }

    initializeCardModeTurnState(state.cardMode);
}

function initializeCardModeTurnState(cardState) {
    clearCardModeStateSelection(cardState);
    cardState.phase = "action";
    cardState.pendingOffer = null;
    cardState.deploying = null;
    cardState.pendingActionSnapshot = null;
    cardState.turnCounts[cardState.turn] += 1;

    const currentColor = cardState.turn;
    const drawIndex = cardState.drawCounts[currentColor];
    const schedule = cardState.drawPlan.schedules[currentColor];
    if (drawIndex < schedule.length && schedule[drawIndex] === cardState.turnCounts[currentColor]) {
        cardState.drawCounts[currentColor] += 1;
        cardState.phase = "draft";
        cardState.pendingOffer = {
            offerIndex: drawIndex,
            cards: cloneCardModeOfferCards(cardState.offers[drawIndex])
        };
    }
}

function handleCardModeBoardClick(square) {
    const cardState = state.cardMode;
    if (!cardState || cardState.status !== "playing" || !canCardModeHumanInteract()) {
        return;
    }

    if (cardState.phase === "draft") {
        return;
    }

    if (cardState.phase === "deploy") {
        handleCardModeDeploySquare(square);
        return;
    }

    if (cardState.selectedSquare === square) {
        clearCardModeSelection();
        renderBoard();
        return;
    }

    if (cardState.selectedSquare) {
        const chosenMove = cardState.legalMoves.find((move) => move.to === square);
        if (chosenMove) {
            applyCardModeMove(chosenMove);
            return;
        }
    }

    const piece = cardState.board[square];
    if (!piece || piece.color !== cardState.turn) {
        clearCardModeSelection();
        renderBoard();
        return;
    }

    cardState.selectedSquare = square;
    cardState.legalMoves = getCardModeLegalMoves(cardState.board, square);
    renderBoard();
}

function chooseCardModeOffer(cardId) {
    const cardState = state.cardMode;
    if (!cardState || cardState.phase !== "draft" || !cardState.pendingOffer || !canCardModeHumanInteract()) {
        return;
    }

    if (isOnlineCardRoom()) {
        submitOnlineCardDraftChoice(cardId);
        return;
    }

    const snapshot = captureCardModeSnapshot(cardState);
    const selected = applyCardModeDraftChoiceToState(cardState, cardId);
    if (!selected) {
        return;
    }

    recordCardModeUndoSnapshot(snapshot, snapshot.turn);
    renderBoard();
    updatePanels();
    showToast(`已获得卡牌：${selected.title}`, "success");
    scheduleCardModeAiTurn();
}

function applyCardModeDraftChoiceToState(cardState, cardId) {
    if (!cardState || cardState.phase !== "draft" || !cardState.pendingOffer) {
        return null;
    }

    const selected = cardState.pendingOffer.cards.find((card) => card.id === cardId);
    if (!selected) {
        return null;
    }

    cardState.hands[cardState.turn].push(createCardInstance(selected));
    cardState.pendingOffer = null;
    cardState.phase = "action";
    clearCardModeStateSelection(cardState);
    return selected;
}

function startCardDeployment(cardId) {
    const cardState = state.cardMode;
    if (!cardState || cardState.phase !== "action" || !canCardModeHumanInteract()) {
        return;
    }

    const hand = cardState.hands[cardState.turn];
    const cardIndex = hand.findIndex((card) => card.instanceId === cardId);
    if (cardIndex === -1) {
        return;
    }

    const snapshot = captureCardModeSnapshot(cardState);
    const [card] = hand.splice(cardIndex, 1);
    const remainingPieces = expandCardPieces(card);
    cardState.phase = "deploy";
    cardState.pendingActionSnapshot = snapshot;
    cardState.deploying = {
        card,
        remainingPieces,
        selectedPieceType: remainingPieces[0] || null,
        originalCount: remainingPieces.length
    };
    clearCardModeStateSelection(cardState);
    renderBoard();
    updatePanels();
}

function cancelCardDeployment() {
    const cardState = state.cardMode;
    if (!cardState || cardState.phase !== "deploy" || !cardState.pendingActionSnapshot) {
        return;
    }

    restoreCardModeSnapshot(cardState.pendingActionSnapshot, {
        undoStack: cloneCardModeUndoStack(cardState.undoStack)
    });
    showToast("已取消本次出牌。", "success");
}

function finishCardDeployment() {
    const cardState = state.cardMode;
    if (!cardState || cardState.phase !== "deploy" || !cardState.deploying || !cardState.pendingActionSnapshot) {
        return;
    }

    const deployedCount = cardState.deploying.originalCount - cardState.deploying.remainingPieces.length;
    if (deployedCount === 0) {
        showToast("至少布置 1 枚棋子，或取消本次用牌。", "error");
        return;
    }

    if (isOnlineCardRoom()) {
        const placements = buildCardModeDeployPlacementsFromState(cardState);
        submitOnlineCardDeploy(cardState.deploying.card.instanceId, placements);
        return;
    }

    const snapshot = cardState.pendingActionSnapshot;
    const actionLabel = buildCardModeDeployLabel(cardState.deploying.card.title, deployedCount);
    recordCardModeUndoSnapshot(snapshot, snapshot.turn);
    cardState.pendingActionSnapshot = null;
    cardState.phase = "action";
    cardState.deploying = null;
    concludeCardModeAction(actionLabel);
}

function selectCardDeploymentPiece(pieceType) {
    const cardState = state.cardMode;
    if (!cardState || cardState.phase !== "deploy" || !cardState.deploying) {
        return;
    }

    if (!cardState.deploying.remainingPieces.includes(pieceType)) {
        return;
    }

    cardState.deploying.selectedPieceType = pieceType;
    renderBoard();
}

function handleCardModeDeploySquare(square) {
    const cardState = state.cardMode;
    if (!cardState || cardState.phase !== "deploy" || !cardState.deploying || !canCardModeHumanInteract()) {
        return;
    }

    if (!isCardModeDeploySquare(square, cardState.turn)) {
        return;
    }

    const selectedPieceType = cardState.deploying.selectedPieceType;
    if (!selectedPieceType) {
        return;
    }

    cardState.board[square] = {
        color: cardState.turn,
        type: selectedPieceType
    };
    removeCardModeRemainingPiece(cardState.deploying.remainingPieces, selectedPieceType);
    state.lastMoveSquares = [square];

    if (cardState.deploying.remainingPieces.length === 0) {
        finishCardDeployment();
        return;
    }

    if (!cardState.deploying.remainingPieces.includes(cardState.deploying.selectedPieceType)) {
        cardState.deploying.selectedPieceType = cardState.deploying.remainingPieces[0];
    }

    renderBoard();
    updatePanels();
}

function removeCardModeRemainingPiece(remainingPieces, pieceType) {
    const pieceIndex = remainingPieces.indexOf(pieceType);
    if (pieceIndex !== -1) {
        remainingPieces.splice(pieceIndex, 1);
    }
}

function isCardModeDeploySquare(square, color) {
    const cardState = state.cardMode;
    if (!cardState || cardState.board[square]) {
        return false;
    }

    return getCardModeHomeRanks(color).includes(square[1]);
}

function getCardModeAvailableDeploySquares(board, color) {
    return FILES.flatMap((file) => getCardModeHomeRanks(color).map((rank) => `${file}${rank}`))
        .filter((square) => !board[square]);
}

function applyCardModeMove(move) {
    const cardState = state.cardMode;
    if (!cardState) {
        return;
    }

    if (isOnlineCardRoom()) {
        submitOnlineCardMove(move);
        return;
    }

    const movingPiece = cardState.board[move.from];
    const snapshot = captureCardModeSnapshot(cardState);
    const result = applyCardModeMoveToBoard(cardState.board, move);
    clearCardModeSelection();
    state.lastMoveSquares = [move.from, move.to];

    if (result.captured) {
        cardState.capturedBy[movingPiece.color].push(result.captured);
    }

    recordCardModeUndoSnapshot(snapshot, snapshot.turn);
    const actionLabel = buildCardModeMoveLabel(movingPiece, move, result.captured);
    concludeCardModeAction(actionLabel);
}

function buildCardModeMoveLabel(piece, move, capturedPiece) {
    const label = getCardModePieceLabel(piece.type);
    if (capturedPiece) {
        return `${label} ${move.from}-${move.to} 吃 ${getCardModePieceLabel(capturedPiece.type)}`;
    }
    return `${label} ${move.from}-${move.to}`;
}

function buildCardModeDeployLabel(cardTitle, deployedCount) {
    return `使用卡牌：${cardTitle}（布置 ${deployedCount} 枚）`;
}

function concludeCardModeAction(actionLabel) {
    const result = concludeCardModeActionOnState(state.cardMode, actionLabel);
    clearHint(false);
    renderBoard();
    updatePanels();

    if (result && result.message) {
        showToast(result.message, result.winner ? "success" : "error");
        return result;
    }

    scheduleCardModeAiTurn();
    return null;
}

function concludeCardModeActionOnState(cardState, actionLabel) {
    if (!cardState) {
        return null;
    }

    const actingColor = cardState.turn;
    cardState.history.push({
        color: actingColor,
        label: actionLabel
    });
    clearCardModeStateSelection(cardState);
    cardState.pendingOffer = null;
    cardState.deploying = null;
    cardState.pendingActionSnapshot = null;

    const whiteKing = getCardModeKingSquare(cardState.board, "w");
    const blackKing = getCardModeKingSquare(cardState.board, "b");
    if (!whiteKing) {
        return finishCardModeGame(cardState, { winner: "b", message: "黑方击败白王" });
    }
    if (!blackKing) {
        return finishCardModeGame(cardState, { winner: "w", message: "白方击败黑王" });
    }

    cardState.turn = getOppositeColor(actingColor);
    initializeCardModeTurnState(cardState);

    if (canCardModeColorAct(cardState, cardState.turn)) {
        return null;
    }

    if (isCardModeInCheck(cardState.board, cardState.turn)) {
        return finishCardModeGame(cardState, {
            winner: actingColor,
            message: `${actingColor === "w" ? "白方" : "黑方"} 将死获胜`
        });
    }

    return finishCardModeGame(cardState, {
        winner: null,
        message: "和局：无子可动也无牌可出"
    });
}

function finishCardModeGame(cardState, result) {
    cardState.status = "finished";
    cardState.winner = result.winner;
    cardState.resultMessage = result.message;
    cardState.phase = "action";
    cardState.pendingOffer = null;
    cardState.deploying = null;
    cardState.pendingActionSnapshot = null;
    return result;
}

function canCardModeColorAct(cardState, color) {
    if (!cardState || color !== cardState.turn || cardState.status !== "playing") {
        return false;
    }

    if (cardState.phase === "draft") {
        return Boolean(cardState.pendingOffer && cardState.pendingOffer.cards.length);
    }

    if (getAllCardModeLegalMoves(cardState.board, color).length > 0) {
        return true;
    }

    return hasCardModeDeployAction(cardState, color);
}

function hasCardModeDeployAction(cardState, color) {
    if (!cardState || !cardState.hands[color] || cardState.hands[color].length === 0) {
        return false;
    }

    return getCardModeAvailableDeploySquares(cardState.board, color).length > 0;
}

function getCardModeResult(board, currentColor) {
    const whiteKing = getCardModeKingSquare(board, "w");
    const blackKing = getCardModeKingSquare(board, "b");

    if (!whiteKing) {
        return { winner: "b", message: "黑方击败白王" };
    }

    if (!blackKing) {
        return { winner: "w", message: "白方击败黑王" };
    }

    const nextColor = getOppositeColor(currentColor);
    const legalMoves = getAllCardModeLegalMoves(board, nextColor);
    if (legalMoves.length === 0) {
        if (isCardModeInCheck(board, nextColor)) {
            return {
                winner: currentColor,
                message: `${currentColor === "w" ? "白方" : "黑方"} 将死获胜`
            };
        }

        return {
            winner: null,
            message: "和局：无子可动"
        };
    }

    return null;
}

function cloneCardModeBoard(board) {
    const nextBoard = {};
    Object.entries(board || {}).forEach(([square, piece]) => {
        nextBoard[square] = { ...piece };
    });
    return nextBoard;
}

function normalizeCardModeArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (!value || typeof value !== "object") {
        return [];
    }

    return Object.keys(value)
        .sort((left, right) => {
            const leftNumber = Number(left);
            const rightNumber = Number(right);
            const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
            return bothNumeric ? leftNumber - rightNumber : left.localeCompare(right);
        })
        .map((key) => value[key]);
}

function cloneCardModeOfferCards(cards) {
    return normalizeCardModeArray(cards).map((card) => ({
        ...card,
        pieces: { ...card.pieces }
    }));
}

function cloneCardModeHands(hands) {
    const safeHands = hands && typeof hands === "object" ? hands : {};
    return {
        w: normalizeCardModeArray(safeHands.w).map(cloneCardModeCardInstance),
        b: normalizeCardModeArray(safeHands.b).map(cloneCardModeCardInstance)
    };
}

function cloneCardModeCardInstance(card) {
    return {
        instanceId: card.instanceId,
        definitionId: card.definitionId,
        title: card.title,
        tier: card.tier,
        summary: card.summary,
        pieces: { ...(card.pieces || {}) }
    };
}

function cloneCardModeCapturedBy(capturedBy) {
    const safeCapturedBy = capturedBy && typeof capturedBy === "object" ? capturedBy : {};
    return {
        w: normalizeCardModeArray(safeCapturedBy.w).map((piece) => ({ ...piece })),
        b: normalizeCardModeArray(safeCapturedBy.b).map((piece) => ({ ...piece }))
    };
}

function cloneCardModeHistory(history) {
    return normalizeCardModeArray(history).map((entry) => ({ ...entry }));
}

function cloneCardModeLegalMoves(moves) {
    return normalizeCardModeArray(moves).map((move) => ({
        ...move,
        captured: move.captured ? { ...move.captured } : null
    }));
}

function cloneCardModePendingOffer(pendingOffer) {
    if (!pendingOffer) {
        return null;
    }

    return {
        offerIndex: pendingOffer.offerIndex,
        cards: cloneCardModeOfferCards(pendingOffer.cards)
    };
}

function cloneCardModeDeploying(deploying) {
    if (!deploying) {
        return null;
    }

    return {
        card: cloneCardModeCardInstance(deploying.card),
        remainingPieces: normalizeCardModeArray(deploying.remainingPieces).slice(),
        selectedPieceType: deploying.selectedPieceType,
        originalCount: deploying.originalCount
    };
}

function cloneCardModeSnapshot(snapshot) {
    if (!snapshot) {
        return null;
    }

    return {
        settings: createCardModeSettings(snapshot.settings),
        board: cloneCardModeBoard(snapshot.board),
        turn: snapshot.turn || "w",
        turnCounts: { w: 0, b: 0, ...(snapshot.turnCounts || {}) },
        drawCounts: { w: 0, b: 0, ...(snapshot.drawCounts || {}) },
        offers: normalizeCardModeArray(snapshot.offers).map((offer) => cloneCardModeOfferCards(offer)),
        hands: cloneCardModeHands(snapshot.hands),
        selectedSquare: snapshot.selectedSquare || null,
        legalMoves: cloneCardModeLegalMoves(snapshot.legalMoves),
        capturedBy: cloneCardModeCapturedBy(snapshot.capturedBy),
        history: cloneCardModeHistory(snapshot.history),
        phase: snapshot.phase || "action",
        pendingOffer: cloneCardModePendingOffer(snapshot.pendingOffer),
        deploying: cloneCardModeDeploying(snapshot.deploying),
        status: snapshot.status || "playing",
        winner: snapshot.winner ?? null,
        resultMessage: snapshot.resultMessage ?? null,
        lastMoveSquares: (snapshot.lastMoveSquares || []).slice()
    };
}

function cloneCardModeUndoStack(undoStack) {
    return normalizeCardModeArray(undoStack).map((entry) => ({
        actorColor: entry.actorColor,
        snapshot: cloneCardModeSnapshot(entry.snapshot)
    }));
}

function captureCardModeSnapshot(cardState) {
    return cloneCardModeSnapshot({
        settings: cardState.settings,
        board: cardState.board,
        turn: cardState.turn,
        turnCounts: cardState.turnCounts,
        drawCounts: cardState.drawCounts,
        offers: cardState.offers,
        hands: cardState.hands,
        selectedSquare: cardState.selectedSquare,
        legalMoves: cardState.legalMoves,
        capturedBy: cardState.capturedBy,
        history: cardState.history,
        phase: cardState.phase,
        pendingOffer: cardState.pendingOffer,
        deploying: cardState.deploying,
        status: cardState.status,
        winner: cardState.winner,
        resultMessage: cardState.resultMessage || null,
        lastMoveSquares: state.lastMoveSquares
    });
}

function restoreCardModeSnapshot(snapshot, options) {
    if (!snapshot) {
        return false;
    }

    const nextState = createCardModeEmptyState(snapshot.settings);
    applyCardModeSnapshotToState(nextState, snapshot);
    nextState.undoStack = options && options.undoStack
        ? cloneCardModeUndoStack(options.undoStack)
        : [];
    nextState.pendingActionSnapshot = null;

    state.cardMode = nextState;
    state.cardModeSetup = { settings: createCardModeSettings(nextState.settings) };
    state.lastMoveSquares = (snapshot.lastMoveSquares || []).slice();
    state.announcedResultKey = null;
    state.aiThinking = false;
    renderBoard();
    updatePanels();
    return true;
}

function applyCardModeSnapshotToState(targetState, snapshot) {
    targetState.settings = createCardModeSettings(snapshot.settings);
    targetState.drawPlan = buildCardModeDrawPlan(targetState.settings);
    targetState.board = cloneCardModeBoard(snapshot.board);
    targetState.turn = snapshot.turn || "w";
    targetState.turnCounts = { w: 0, b: 0, ...(snapshot.turnCounts || {}) };
    targetState.drawCounts = { w: 0, b: 0, ...(snapshot.drawCounts || {}) };
    targetState.offers = normalizeCardModeArray(snapshot.offers).map((offer) => cloneCardModeOfferCards(offer));
    targetState.hands = cloneCardModeHands(snapshot.hands);
    targetState.selectedSquare = snapshot.selectedSquare;
    targetState.legalMoves = cloneCardModeLegalMoves(snapshot.legalMoves);
    targetState.capturedBy = cloneCardModeCapturedBy(snapshot.capturedBy);
    targetState.history = cloneCardModeHistory(snapshot.history);
    targetState.phase = snapshot.phase || "action";
    targetState.pendingOffer = cloneCardModePendingOffer(snapshot.pendingOffer);
    targetState.deploying = cloneCardModeDeploying(snapshot.deploying);
    targetState.status = snapshot.status || "playing";
    targetState.winner = snapshot.winner || null;
    targetState.resultMessage = snapshot.resultMessage || null;
}

function recordCardModeUndoSnapshot(snapshot, actorColor) {
    if (!state.cardMode || !snapshot) {
        return;
    }

    state.cardMode.undoStack.push({
        actorColor,
        snapshot: cloneCardModeSnapshot(snapshot)
    });

    if (state.cardMode.undoStack.length > 80) {
        state.cardMode.undoStack.shift();
    }
}

function handleCardModeUndo() {
    const cardState = state.cardMode;
    if (!cardState || state.aiThinking) {
        return;
    }

    clearHint(false);

    if (cardState.phase === "deploy" && cardState.pendingActionSnapshot) {
        restoreCardModeSnapshot(cardState.pendingActionSnapshot, {
            undoStack: cloneCardModeUndoStack(cardState.undoStack)
        });
        showToast("已回退当前出牌。", "success");
        return;
    }

    if (isCardModeAiEnabled()) {
        undoCardModeAiRound();
        return;
    }

    undoLocalCardModeAction();
}

function canUndoCardMode() {
    const cardState = state.cardMode;
    if (!cardState || state.aiThinking) {
        return false;
    }

    if (cardState.phase === "deploy" && cardState.pendingActionSnapshot) {
        return true;
    }

    if (isCardModeAiEnabled()) {
        return cardState.undoStack.some((entry) => entry.actorColor === state.playerColor);
    }

    return cardState.undoStack.length > 0;
}

function undoLocalCardModeAction() {
    const cardState = state.cardMode;
    if (!cardState || cardState.undoStack.length === 0) {
        showToast("当前没有可悔的步骤。", "error");
        return;
    }

    const nextUndoStack = cloneCardModeUndoStack(cardState.undoStack.slice(0, -1));
    const entry = cardState.undoStack[cardState.undoStack.length - 1];
    restoreCardModeSnapshot(entry.snapshot, { undoStack: nextUndoStack });
    showToast("已悔棋一步。", "success");
}

function undoCardModeAiRound() {
    const cardState = state.cardMode;
    if (!cardState) {
        return;
    }

    const undoStack = cardState.undoStack.slice();
    let targetSnapshot = null;

    while (undoStack.length > 0) {
        const entry = undoStack.pop();
        if (entry.actorColor === state.playerColor) {
            targetSnapshot = entry.snapshot;
            break;
        }
    }

    if (!targetSnapshot) {
        showToast("当前没有可回退的玩家回合。", "error");
        return;
    }

    restoreCardModeSnapshot(targetSnapshot, {
        undoStack: cloneCardModeUndoStack(undoStack)
    });
    showToast("已回退上一轮。", "success");
}

function applyCardModeMoveActionToState(cardState, move) {
    const movingPiece = cardState.board[move.from];
    const result = applyCardModeMoveToBoard(cardState.board, move);
    if (result.captured) {
        cardState.capturedBy[movingPiece.color].push(result.captured);
    }

    return concludeCardModeActionOnState(
        cardState,
        buildCardModeMoveLabel(movingPiece, move, result.captured)
    );
}

function applyCardModeDeployActionToState(cardState, cardId, placements) {
    const hand = cardState.hands[cardState.turn];
    const cardIndex = hand.findIndex((card) => card.instanceId === cardId);
    if (cardIndex === -1) {
        return null;
    }

    const [card] = hand.splice(cardIndex, 1);
    const remainingPieces = expandCardPieces(card);
    let deployedCount = 0;

    placements.forEach((placement) => {
        if (!placement || !placement.square || !placement.pieceType) {
            return;
        }

        if (cardState.board[placement.square] || !getCardModeHomeRanks(cardState.turn).includes(placement.square[1])) {
            return;
        }

        const pieceIndex = remainingPieces.indexOf(placement.pieceType);
        if (pieceIndex === -1) {
            return;
        }

        remainingPieces.splice(pieceIndex, 1);
        cardState.board[placement.square] = {
            color: cardState.turn,
            type: placement.pieceType
        };
        deployedCount += 1;
    });

    if (deployedCount === 0) {
        hand.splice(cardIndex, 0, card);
        return null;
    }

    return concludeCardModeActionOnState(
        cardState,
        buildCardModeDeployLabel(card.title, deployedCount)
    );
}

function buildCardModeDeployPlacementsFromState(cardState) {
    if (!cardState || !cardState.pendingActionSnapshot) {
        return [];
    }

    const previousBoard = cardState.pendingActionSnapshot.board;
    return Object.entries(cardState.board)
        .filter(([square, piece]) => !previousBoard[square] && piece.color === cardState.turn)
        .map(([square, piece]) => ({
            square,
            pieceType: piece.type
        }))
        .sort((left, right) => {
            if (left.square[1] !== right.square[1]) {
                return Number(left.square[1]) - Number(right.square[1]);
            }
            return left.square.localeCompare(right.square);
        });
}

function cloneCardModeStateForSimulation(cardState) {
    const clone = createCardModeEmptyState(cardState.settings);
    applyCardModeSnapshotToState(clone, captureCardModeSnapshot(cardState));
    clone.undoStack = [];
    clone.pendingActionSnapshot = null;
    return clone;
}

function getCardModeLegalMoves(board, square) {
    const piece = board[square];
    if (!piece) {
        return [];
    }

    const pseudoMoves = generateCardModePseudoMoves(board, square, piece, false);
    return pseudoMoves.filter((move) => {
        const nextBoard = cloneCardModeBoard(board);
        applyCardModeMoveToBoard(nextBoard, move);
        return !isCardModeInCheck(nextBoard, piece.color);
    });
}

function getAllCardModeLegalMoves(board, color) {
    const moves = [];

    Object.keys(board).forEach((square) => {
        if (board[square].color !== color) {
            return;
        }

        moves.push(...getCardModeLegalMoves(board, square));
    });

    return moves;
}

function applyCardModeMoveToBoard(board, move) {
    const movingPiece = { ...board[move.from] };
    const captured = board[move.to] ? { ...board[move.to] } : null;

    delete board[move.from];

    if (movingPiece.type === "pawn" && shouldPromoteCardModePawn(move.to, movingPiece.color)) {
        movingPiece.type = "queen";
    }

    board[move.to] = movingPiece;
    return {
        piece: movingPiece,
        captured
    };
}

function shouldPromoteCardModePawn(square, color) {
    return color === "w" ? square[1] === "8" : square[1] === "1";
}

function isCardModeInCheck(board, color) {
    const kingSquare = getCardModeKingSquare(board, color);
    if (!kingSquare) {
        return true;
    }

    return isCardModeSquareAttacked(board, kingSquare, getOppositeColor(color));
}

function isCardModeSquareAttacked(board, targetSquare, byColor) {
    return Object.keys(board).some((square) => {
        const piece = board[square];
        if (piece.color !== byColor) {
            return false;
        }

        return generateCardModePseudoMoves(board, square, piece, true)
            .some((move) => move.to === targetSquare);
    });
}

function getCardModeKingSquare(board, color) {
    return Object.keys(board).find((square) => {
        const piece = board[square];
        return piece.color === color && piece.type === "king";
    }) || null;
}

function generateCardModePseudoMoves(board, square, piece, forAttackOnly) {
    switch (piece.type) {
        case "king":
            return generateCardModeStepMoves(board, square, piece.color, CARD_MODE_KING_STEPS);
        case "queen":
            return generateCardModeSlidingMoves(
                board,
                square,
                piece.color,
                CARD_MODE_ROOK_DIRECTIONS.concat(CARD_MODE_BISHOP_DIRECTIONS)
            );
        case "rook":
            return generateCardModeSlidingMoves(board, square, piece.color, CARD_MODE_ROOK_DIRECTIONS);
        case "bishop":
            return generateCardModeSlidingMoves(board, square, piece.color, CARD_MODE_BISHOP_DIRECTIONS);
        case "knight":
            return generateCardModeLeaperMoves(board, square, piece.color, CARD_MODE_KNIGHT_STEPS);
        case "pawn":
            return generateCardModePawnMoves(board, square, piece.color, forAttackOnly);
        case "advisor":
            return generateCardModeStepMoves(board, square, piece.color, CARD_MODE_BISHOP_DIRECTIONS);
        case "elephant":
            return generateCardModeElephantMoves(board, square, piece.color);
        case "cannon":
            return generateCardModeCannonMoves(board, square, piece.color, forAttackOnly);
        case "horse":
            return generateCardModeHorseMoves(board, square, piece.color);
        case "soldier":
            return generateCardModeSoldierMoves(board, square, piece.color);
        default:
            return [];
    }
}

function generateCardModeSlidingMoves(board, square, color, directions) {
    const moves = [];

    directions.forEach(([dx, dy]) => {
        let nextSquare = offsetCardModeSquare(square, dx, dy);
        while (nextSquare) {
            const occupant = board[nextSquare];
            if (!occupant) {
                moves.push({ from: square, to: nextSquare });
                nextSquare = offsetCardModeSquare(nextSquare, dx, dy);
                continue;
            }

            if (occupant.color !== color) {
                moves.push({ from: square, to: nextSquare, captured: occupant });
            }
            break;
        }
    });

    return moves;
}

function generateCardModeStepMoves(board, square, color, steps) {
    const moves = [];

    steps.forEach(([dx, dy]) => {
        const nextSquare = offsetCardModeSquare(square, dx, dy);
        if (!nextSquare) {
            return;
        }

        const occupant = board[nextSquare];
        if (!occupant || occupant.color !== color) {
            moves.push({ from: square, to: nextSquare, captured: occupant || null });
        }
    });

    return moves;
}

function generateCardModeLeaperMoves(board, square, color, steps) {
    return generateCardModeStepMoves(board, square, color, steps);
}

function generateCardModePawnMoves(board, square, color, forAttackOnly) {
    const moves = [];
    const forward = color === "w" ? 1 : -1;

    if (!forAttackOnly) {
        const oneStep = offsetCardModeSquare(square, 0, forward);
        if (oneStep && !board[oneStep]) {
            moves.push({ from: square, to: oneStep });

            const homeRank = color === "w" ? "2" : "7";
            if (square[1] === homeRank) {
                const twoStep = offsetCardModeSquare(square, 0, forward * 2);
                if (twoStep && !board[twoStep]) {
                    moves.push({ from: square, to: twoStep });
                }
            }
        }
    }

    [-1, 1].forEach((dx) => {
        const attackSquare = offsetCardModeSquare(square, dx, forward);
        if (!attackSquare) {
            return;
        }

        if (forAttackOnly) {
            moves.push({ from: square, to: attackSquare });
            return;
        }

        const occupant = board[attackSquare];
        if (occupant && occupant.color !== color) {
            moves.push({ from: square, to: attackSquare, captured: occupant });
        }
    });

    return moves;
}

function generateCardModeElephantMoves(board, square, color) {
    const moves = [];

    CARD_MODE_BISHOP_DIRECTIONS.forEach(([dx, dy]) => {
        const midSquare = offsetCardModeSquare(square, dx, dy);
        const targetSquare = offsetCardModeSquare(square, dx * 2, dy * 2);
        if (!midSquare || !targetSquare || board[midSquare]) {
            return;
        }

        const occupant = board[targetSquare];
        if (!occupant || occupant.color !== color) {
            moves.push({ from: square, to: targetSquare, captured: occupant || null });
        }
    });

    return moves;
}

function generateCardModeHorseMoves(board, square, color) {
    const moves = [];

    CARD_MODE_HORSE_PATTERNS.forEach((pattern) => {
        const legSquare = offsetCardModeSquare(square, pattern.leg[0], pattern.leg[1]);
        if (!legSquare || board[legSquare]) {
            return;
        }

        pattern.targets.forEach(([dx, dy]) => {
            const targetSquare = offsetCardModeSquare(square, dx, dy);
            if (!targetSquare) {
                return;
            }

            const occupant = board[targetSquare];
            if (!occupant || occupant.color !== color) {
                moves.push({ from: square, to: targetSquare, captured: occupant || null });
            }
        });
    });

    return moves;
}

function generateCardModeCannonMoves(board, square, color, forAttackOnly) {
    const moves = [];

    CARD_MODE_ROOK_DIRECTIONS.forEach(([dx, dy]) => {
        let nextSquare = offsetCardModeSquare(square, dx, dy);
        let hasScreen = false;

        while (nextSquare) {
            const occupant = board[nextSquare];

            if (!hasScreen) {
                if (!occupant) {
                    if (!forAttackOnly) {
                        moves.push({ from: square, to: nextSquare });
                    }
                    nextSquare = offsetCardModeSquare(nextSquare, dx, dy);
                    continue;
                }

                hasScreen = true;
                nextSquare = offsetCardModeSquare(nextSquare, dx, dy);
                continue;
            }

            if (!occupant) {
                nextSquare = offsetCardModeSquare(nextSquare, dx, dy);
                continue;
            }

            if (occupant.color !== color) {
                moves.push({ from: square, to: nextSquare, captured: occupant });
            }
            break;
        }
    });

    return moves;
}

function generateCardModeSoldierMoves(board, square, color) {
    const moves = [];
    const directions = [[0, color === "w" ? 1 : -1]];

    if (hasCardModeSoldierCrossedRiver(square, color)) {
        directions.push([-1, 0], [1, 0]);
    }

    directions.forEach(([dx, dy]) => {
        const targetSquare = offsetCardModeSquare(square, dx, dy);
        if (!targetSquare) {
            return;
        }

        const occupant = board[targetSquare];
        if (!occupant || occupant.color !== color) {
            moves.push({ from: square, to: targetSquare, captured: occupant || null });
        }
    });

    return moves;
}

function hasCardModeSoldierCrossedRiver(square, color) {
    const rank = Number(square[1]);
    return color === "w" ? rank >= 5 : rank <= 4;
}

function offsetCardModeSquare(square, dx, dy) {
    const fileIndex = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    const nextFileIndex = fileIndex + dx;
    const nextRank = rank + dy;

    if (nextFileIndex < 0 || nextFileIndex >= FILES.length || nextRank < 1 || nextRank > 8) {
        return null;
    }

    return `${FILES[nextFileIndex]}${nextRank}`;
}

function clearCardModeSelection() {
    if (!state.cardMode) {
        return;
    }

    clearCardModeStateSelection(state.cardMode);
}

function clearCardModeStateSelection(cardState) {
    if (!cardState) {
        return;
    }

    cardState.selectedSquare = null;
    cardState.legalMoves = [];
}

function getOppositeColor(color) {
    return color === "w" ? "b" : "w";
}

function isCardModeAiEnabled() {
    return Boolean(state.mode === "card" && state.cardMode && state.cardMode.settings.opponentType === "ai");
}

function isCardModeHumanTurn() {
    return !isCardModeAiEnabled() || state.cardMode.turn === state.playerColor;
}

function canCardModeHumanInteract() {
    return Boolean(
        isCardModeSessionActive() &&
        state.cardMode &&
        state.cardMode.status === "playing" &&
        !state.aiThinking &&
        isCardModeHumanTurn() &&
        (
            state.mode !== "online" ||
            (
                state.online.roomData &&
                state.online.roomData.status === "playing" &&
                state.cardMode.turn === state.playerColor &&
                (!state.online.roomData.pendingUndo || state.online.roomData.pendingUndo.status !== "pending")
            )
        )
    );
}

function scheduleCardModeAiTurn() {
    if (typeof maybeRunCardModeAiTurn !== "function" || !isCardModeAiEnabled()) {
        return;
    }

    if (!state.cardMode || state.cardMode.status !== "playing" || state.cardMode.turn !== state.aiColor) {
        return;
    }

    window.setTimeout(() => {
        maybeRunCardModeAiTurn();
    }, 120);
}

const CARD_MODE_ROOK_DIRECTIONS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
];

const CARD_MODE_BISHOP_DIRECTIONS = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
];

const CARD_MODE_KING_STEPS = CARD_MODE_ROOK_DIRECTIONS.concat(CARD_MODE_BISHOP_DIRECTIONS);

const CARD_MODE_KNIGHT_STEPS = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2]
];

const CARD_MODE_HORSE_PATTERNS = [
    { leg: [1, 0], targets: [[2, 1], [2, -1]] },
    { leg: [-1, 0], targets: [[-2, 1], [-2, -1]] },
    { leg: [0, 1], targets: [[1, 2], [-1, 2]] },
    { leg: [0, -1], targets: [[1, -2], [-1, -2]] }
];
