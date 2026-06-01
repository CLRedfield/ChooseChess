function initialize() {
    ensureCardModeSetupState();
    ensureOnlineRoomSetupState();
    bindEvents();
    renderBoard();
    renderCardModeSetupScreen();
    renderOnlineRoomSetup();
    updatePanels();
}

function bindEvents() {
    elements.difficultyButtons.forEach((button) => {
        button.addEventListener("click", () => startSoloGame(button.dataset.difficulty));
    });

    if (elements.localDuoButton) {
        elements.localDuoButton.addEventListener("click", startLocalDuoGame);
    }

    elements.createRoomButton.addEventListener("click", openOnlineRoomSetup);
    elements.joinRoomButton.addEventListener("click", joinOnlineRoom);
    elements.startCardModeButton.addEventListener("click", openCardModeSetup);
    elements.copyRoomButton.addEventListener("click", copyRoomCode);
    elements.undoButton.addEventListener("click", handleUndo);
    elements.restartButton.addEventListener("click", handleRestart);
    elements.backButton.addEventListener("click", () => returnToHome(false));
    if (elements.hintButton) {
        elements.hintButton.addEventListener("click", handleHintClick);
    }
    if (elements.hintToggle) {
        elements.hintToggle.addEventListener("change", (event) => {
            state.hintEnabled = event.target.checked;
            if (!state.hintEnabled) {
                clearHint(false);
            }
            renderBoard();
            updatePanels();
        });
    }
    elements.cardCancelButton.addEventListener("click", cancelCardDeployment);
    elements.cardFinishButton.addEventListener("click", finishCardDeployment);
    elements.cardSetupBackButton.addEventListener("click", closeCardModeSetup);
    elements.confirmCardModeButton.addEventListener("click", startConfiguredCardModeGame);
    bindCardModeSetupControl(elements.cardDrawIntervalRange, elements.cardDrawIntervalInput, "drawInterval");
    bindCardModeSetupControl(elements.cardOfferCountRange, elements.cardOfferCountInput, "offerCount");
    elements.cardOpponentSelect.addEventListener("change", (event) => {
        updateCardModeSetupSetting("opponentType", event.target.value);
    });
    elements.cardAiDifficultySelect.addEventListener("change", (event) => {
        updateCardModeSetupSetting("aiDifficulty", event.target.value);
    });
    elements.roomGameTypeSelect.addEventListener("change", (event) => {
        updateOnlineRoomSetupSetting("gameType", event.target.value);
    });
    bindOnlineRoomSetupControl(
        elements.roomCardDrawIntervalRange,
        elements.roomCardDrawIntervalInput,
        "drawInterval"
    );
    bindOnlineRoomSetupControl(
        elements.roomCardOfferCountRange,
        elements.roomCardOfferCountInput,
        "offerCount"
    );
    elements.roomSetupCancelButton.addEventListener("click", closeOnlineRoomSetup);
    elements.roomSetupConfirmButton.addEventListener("click", createConfiguredOnlineRoom);
    elements.roomCodeInput.addEventListener("input", (event) => {
        event.target.value = event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    });
    elements.roomCodeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            joinOnlineRoom();
        }
    });
    elements.modal.addEventListener("click", (event) => {
        const incomingUndoPending = Boolean(
            state.online.roomData &&
            state.online.roomData.pendingUndo &&
            state.online.roomData.pendingUndo.status === "pending" &&
            state.online.roomData.pendingUndo.requesterId !== state.online.playerId
        );

        if (event.target === elements.modal && !incomingUndoPending) {
            hideModal();
        }
    });
    elements.roomSetupModal.addEventListener("click", (event) => {
        if (event.target === elements.roomSetupModal) {
            closeOnlineRoomSetup();
        }
    });
}

function ensureCardModeSetupState() {
    if (!state.cardModeSetup) {
        state.cardModeSetup = {
            settings: createCardModeSettings()
        };
    }

    return state.cardModeSetup;
}

function ensureOnlineRoomSetupState() {
    if (!state.onlineRoomSetup) {
        state.onlineRoomSetup = createOnlineRoomSetupState();
    }

    return state.onlineRoomSetup;
}

function createOnlineRoomSetupState(overrides) {
    const source = overrides || {};
    return {
        gameType: source.gameType === "card" ? "card" : "classic",
        cardSettings: createCardModeSettings({
            drawInterval: source.cardSettings && source.cardSettings.drawInterval,
            offerCount: source.cardSettings && source.cardSettings.offerCount,
            opponentType: "local",
            aiDifficulty: "medium"
        })
    };
}

function openOnlineRoomSetup() {
    ensureOnlineRoomSetupState();
    renderOnlineRoomSetup();
    elements.roomSetupModal.classList.remove("hidden");
}

function closeOnlineRoomSetup() {
    elements.roomSetupModal.classList.add("hidden");
}

async function createConfiguredOnlineRoom() {
    const setup = ensureOnlineRoomSetupState();
    await createOnlineRoom(setup);
    if (state.mode === "online") {
        state.hintEnabled = Boolean(elements.roomHintCheckbox && elements.roomHintCheckbox.checked);
        state.hintThinking = false;
        state.hintSquares = [];
        state.hintText = "";
        updatePanels();
        closeOnlineRoomSetup();
    }
}

function bindOnlineRoomSetupControl(rangeElement, inputElement, settingKey) {
    const handleChange = (value) => {
        updateOnlineRoomCardSetting(settingKey, value);
    };

    rangeElement.addEventListener("input", (event) => {
        handleChange(event.target.value);
    });

    inputElement.addEventListener("input", (event) => {
        handleChange(event.target.value);
    });

    inputElement.addEventListener("change", (event) => {
        handleChange(event.target.value);
    });
}

function updateOnlineRoomSetupSetting(settingKey, value) {
    const setup = ensureOnlineRoomSetupState();
    state.onlineRoomSetup = createOnlineRoomSetupState({
        ...setup,
        [settingKey]: value,
        cardSettings: setup.cardSettings
    });
    renderOnlineRoomSetup();
}

function updateOnlineRoomCardSetting(settingKey, value) {
    const setup = ensureOnlineRoomSetupState();
    state.onlineRoomSetup = createOnlineRoomSetupState({
        ...setup,
        cardSettings: createCardModeSettings({
            ...setup.cardSettings,
            opponentType: "local",
            aiDifficulty: "medium",
            [settingKey]: value
        })
    });
    renderOnlineRoomSetup();
}

function renderOnlineRoomSetup() {
    if (!elements.roomSetupModal) {
        return;
    }

    const setup = ensureOnlineRoomSetupState();
    const isCardMode = setup.gameType === "card";

    elements.roomGameTypeSelect.value = setup.gameType;
    elements.roomCardSettings.classList.toggle("hidden", !isCardMode);
    elements.roomCardDrawIntervalRange.value = String(setup.cardSettings.drawInterval);
    elements.roomCardDrawIntervalInput.value = String(setup.cardSettings.drawInterval);
    elements.roomCardOfferCountRange.value = String(setup.cardSettings.offerCount);
    elements.roomCardOfferCountInput.value = String(setup.cardSettings.offerCount);

    elements.roomSetupSummary.textContent = isCardMode
        ? `将创建选卡联机房间：每 ${setup.cardSettings.drawInterval} 回合生成 1 组共享卡池，共 ${setup.cardSettings.offerCount} 组，后手先选。每组会先决定同一个 tier，再向双方发出同组 4 选 1 的卡牌；第 1 组固定为 T1，后续高阶卡概率会随发牌进度上升。`
        : "将创建普通联机房间，使用标准国际象棋规则，你会作为白方先手。";

    elements.roomSetupConfirmNote.textContent = isCardMode
        ? `选卡模式 / ${setup.cardSettings.drawInterval} 回合一组 / 共 ${setup.cardSettings.offerCount} 组`
        : "普通模式 / 你将执白先手";
}

function openCardModeSetup() {
    ensureCardModeSetupState();
    elements.startScreen.classList.add("hidden");
    elements.gameScreen.classList.add("hidden");
    elements.cardSetupScreen.classList.remove("hidden");
    renderCardModeSetupScreen();
}

function closeCardModeSetup() {
    elements.cardSetupScreen.classList.add("hidden");
    elements.startScreen.classList.remove("hidden");
}

function startConfiguredCardModeGame() {
    const setupState = ensureCardModeSetupState();
    state.hintEnabled = Boolean(elements.cardHintCheckbox && elements.cardHintCheckbox.checked);
    startCardModeGame(setupState.settings);
}

function bindCardModeSetupControl(rangeElement, inputElement, settingKey) {
    const handleChange = (value) => {
        updateCardModeSetupSetting(settingKey, value);
    };

    rangeElement.addEventListener("input", (event) => {
        handleChange(event.target.value);
    });

    inputElement.addEventListener("input", (event) => {
        handleChange(event.target.value);
    });

    inputElement.addEventListener("change", (event) => {
        handleChange(event.target.value);
    });
}

function updateCardModeSetupSetting(settingKey, value) {
    const setupState = ensureCardModeSetupState();
    setupState.settings = createCardModeSettings({
        ...setupState.settings,
        [settingKey]: value
    });
    renderCardModeSetupScreen();
}

function startSoloGame(difficulty) {
    cleanupOnlineRoom({ preserveRoom: false });
    state.mode = "solo";
    state.aiDifficulty = difficulty;
    state.playerColor = "w";
    state.aiColor = "b";
    state.aiThinking = false;
    state.chess = new Chess();
    state.localHistory = [];
    state.lastMoveSquares = [];
    state.selectedSquare = null;
    state.legalMoves = [];
    state.announcedResultKey = null;
    state.hintEnabled = Boolean(elements.soloHintCheckbox && elements.soloHintCheckbox.checked);
    state.hintThinking = false;
    state.hintSquares = [];
    state.hintText = "";
    showGameScreen();
    renderBoard();
    updatePanels();
    showToast(`已开始本地人机：${AI_LEVELS[difficulty].label}`, "success");
}

function startLocalDuoGame() {
    cleanupOnlineRoom({ preserveRoom: false });
    state.mode = "local";
    state.aiDifficulty = null;
    state.playerColor = "w";
    state.aiColor = null;
    state.aiThinking = false;
    state.chess = new Chess();
    state.localHistory = [];
    state.lastMoveSquares = [];
    state.selectedSquare = null;
    state.legalMoves = [];
    state.announcedResultKey = null;
    state.hintEnabled = Boolean(elements.soloHintCheckbox && elements.soloHintCheckbox.checked);
    state.hintThinking = false;
    state.hintSquares = [];
    state.hintText = "";
    showGameScreen();
    renderBoard();
    updatePanels();
    showToast("已开始本地双人对弈，白方先手。", "success");
}

// In local two-player mode the human controls whichever side is to move.
function getActivePlayerColor() {
    return state.mode === "local" ? state.chess.turn() : state.playerColor;
}

function returnToHome(silent) {
    cleanupOnlineRoom({ preserveRoom: false });
    state.mode = null;
    state.aiDifficulty = null;
    state.aiThinking = false;
    state.playerColor = "w";
    state.chess = new Chess();
    state.localHistory = [];
    state.selectedSquare = null;
    state.legalMoves = [];
    state.lastMoveSquares = [];
    state.announcedResultKey = null;
    state.cardMode = null;
    state.hintEnabled = false;
    state.hintThinking = false;
    state.hintSquares = [];
    state.hintText = "";
    elements.gameScreen.classList.add("hidden");
    elements.cardSetupScreen.classList.add("hidden");
    closeOnlineRoomSetup();
    elements.startScreen.classList.remove("hidden");
    hideModal();
    if (elements.draftModal) {
        elements.draftModal.classList.add("hidden");
    }
    renderBoard();
    updatePanels();

    if (!silent) {
        showToast("已返回首页。", "success");
    }
}

function handleBoardClick(square) {
    if (isCardModeSessionActive()) {
        handleCardModeBoardClick(square);
        return;
    }

    if (!state.mode || isInteractionLocked()) {
        return;
    }

    if (state.mode === "online" && !canLocalPlayerAct()) {
        return;
    }

    if (state.selectedSquare === square) {
        clearSelection();
        return;
    }

    const piece = state.chess.get(square);
    if (state.selectedSquare) {
        const chosenMove = state.legalMoves.find((move) => move.to === square);
        if (chosenMove) {
            attemptMove(chosenMove);
            return;
        }
    }

    if (!piece || piece.color !== getActivePlayerColor()) {
        clearSelection();
        return;
    }

    state.selectedSquare = square;
    state.legalMoves = state.chess.moves({ square, verbose: true });
    renderBoard();
}

function isInteractionLocked() {
    if (!state.mode || state.chess.game_over()) {
        return true;
    }

    if (state.mode === "solo") {
        return state.aiThinking || state.chess.turn() !== state.playerColor;
    }

    if (state.mode === "local") {
        // Hot-seat: whoever is to move may act; only the game-over check above locks.
        return false;
    }

    if (!state.online.roomData) {
        return true;
    }

    const pendingUndo = state.online.roomData.pendingUndo && state.online.roomData.pendingUndo.status === "pending";
    return state.online.roomData.status !== "playing" || pendingUndo;
}

function canLocalPlayerAct() {
    return state.chess.turn() === state.playerColor;
}

async function attemptMove(move) {
    clearSelection(false);

    if (state.mode === "solo" || state.mode === "local") {
        const applied = applyLocalMove(move);
        if (!applied) {
            return;
        }

        updateAfterMove(applied);
        if (state.mode === "solo") {
            await maybeRunAiTurn();
        }
        return;
    }

    if (state.mode === "online") {
        await submitOnlineMove(move);
    }
}

function applyLocalMove(move) {
    const promotion = move.promotion || inferPromotion(move);
    const applied = state.chess.move({
        from: move.from,
        to: move.to,
        promotion
    });

    if (!applied) {
        return null;
    }

    state.localHistory.push({
        from: applied.from,
        to: applied.to,
        san: applied.san,
        color: applied.color,
        piece: applied.piece,
        captured: applied.captured || null,
        promotion: applied.promotion || null
    });
    return applied;
}

function updateAfterMove(appliedMove) {
    state.lastMoveSquares = [appliedMove.from, appliedMove.to];
    clearHint(false);
    renderBoard();
    updatePanels();
    syncResultNotification();
}

function syncResultNotification() {
    const result = getGameResult(state.chess);
    const key = result ? `${result.status}:${state.chess.fen()}` : null;

    if (!key) {
        state.announcedResultKey = null;
        return;
    }

    if (state.announcedResultKey === key) {
        return;
    }

    state.announcedResultKey = key;
    showToast(result.message, result.winner ? "success" : "error");
}

function getGameResult(chess) {
    if (chess.in_checkmate()) {
        const winner = chess.turn() === "w" ? "黑方" : "白方";
        return {
            status: "checkmate",
            message: `${winner} 将死获胜`,
            winner
        };
    }

    if (chess.in_stalemate()) {
        return {
            status: "stalemate",
            message: "和棋：逼和",
            winner: null
        };
    }

    if (chess.in_threefold_repetition()) {
        return {
            status: "draw",
            message: "和棋：三次重复局面",
            winner: null
        };
    }

    if (chess.insufficient_material()) {
        return {
            status: "draw",
            message: "和棋：子力不足",
            winner: null
        };
    }

    if (chess.in_draw()) {
        return {
            status: "draw",
            message: "和棋",
            winner: null
        };
    }

    return null;
}

async function handleUndo() {
    if (state.mode === "card") {
        handleCardModeUndo();
        return;
    }

    if (state.mode === "solo") {
        undoSoloRound();
        return;
    }

    if (state.mode === "local") {
        undoLocalChessPlies(1, "已回退一步。");
        return;
    }

    if (state.mode === "online") {
        await requestOnlineUndo();
    }
}

function undoSoloRound() {
    undoLocalChessPlies(2, "已回退上一轮。");
}

function undoLocalChessPlies(maxPlies, successMessage) {
    if (!state.localHistory.length) {
        showToast("当前没有可悔的步数。", "error");
        return;
    }

    const steps = Math.min(maxPlies, state.localHistory.length);
    for (let index = 0; index < steps; index += 1) {
        state.chess.undo();
        state.localHistory.pop();
    }

    const recent = state.localHistory[state.localHistory.length - 1];
    state.lastMoveSquares = recent ? [recent.from, recent.to] : [];
    state.announcedResultKey = null;
    clearHint(false);
    renderBoard();
    updatePanels();
    showToast(successMessage, "success");
}

function handleRestart() {
    if (state.mode === "card") {
        startCardModeGame(state.cardMode && state.cardMode.settings);
        return;
    }

    if (state.mode === "solo") {
        startSoloGame(state.aiDifficulty || "easy");
        return;
    }

    if (state.mode === "local") {
        startLocalDuoGame();
        return;
    }

    if (state.mode === "online") {
        showToast("联机模式不支持单方强制重开，请返回首页重新创建房间。", "error");
    }
}

async function copyRoomCode() {
    if (!state.online.roomCode) {
        return;
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(state.online.roomCode);
            showToast("房间码已复制。", "success");
            return;
        }
    } catch (error) {
        console.error(error);
    }

    showToast(`房间码：${state.online.roomCode}`, "success");
}

function clearSelection(shouldRender) {
    state.selectedSquare = null;
    state.legalMoves = [];

    if (shouldRender !== false) {
        renderBoard();
    }
}

function clearHint(shouldRender) {
    const hadHint = state.hintSquares.length > 0 || Boolean(state.hintText);
    state.hintSquares = [];
    state.hintText = "";

    if (hadHint && shouldRender !== false) {
        renderBoard();
    }
}

// Whether the local player may ask for a hint right now (their turn, game live).
function canRequestHint() {
    if (!state.mode) {
        return false;
    }

    if (isCardModeSessionActive()) {
        return canCardModeHumanInteract() && !state.cardMode.deploying;
    }

    if (state.chess.game_over() || state.aiThinking) {
        return false;
    }

    return state.chess.turn() === getActivePlayerColor();
}

async function handleHintClick() {
    if (!state.hintEnabled || state.hintThinking) {
        return;
    }

    if (!canRequestHint()) {
        showToast("现在轮不到你，暂时无法给出提示。", "error");
        return;
    }

    // Show the "computing" state and repaint (clearing any stale hint) before the
    // synchronous depth-4 search blocks the thread.
    state.hintThinking = true;
    state.hintSquares = [];
    state.hintText = "";
    updatePanels();
    renderBoard();
    await delay(0);

    let hint = null;
    try {
        hint = isCardModeSessionActive() ? computeCardModeHint(4) : computeChessHint(4);
    } catch (error) {
        console.error(error);
    }

    state.hintThinking = false;

    // The board may have changed while we yielded (e.g. an online snapshot arrived).
    if (!hint || !canRequestHint()) {
        updatePanels();
        renderBoard();
        showToast("暂时算不出提示。", "error");
        return;
    }

    state.hintSquares = Array.isArray(hint.squares) ? hint.squares : [];
    state.hintText = hint.text || "";
    renderBoard();
    updatePanels();

    if (hint.text) {
        showToast(hint.text, "success");
    }
}
