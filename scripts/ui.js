function showGameScreen() {
    elements.startScreen.classList.add("hidden");
    if (elements.cardSetupScreen) {
        elements.cardSetupScreen.classList.add("hidden");
    }
    elements.gameScreen.classList.remove("hidden");
}

function showToast(message, type) {
    const toast = document.createElement("div");
    toast.className = `toast ${type || ""}`.trim();
    toast.textContent = message;
    elements.toastStack.appendChild(toast);

    window.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-8px)";
        toast.style.transition = "opacity 180ms ease, transform 180ms ease";
    }, 2600);

    window.setTimeout(() => {
        toast.remove();
    }, 2850);
}

function showModal(config) {
    elements.modalLabel.textContent = config.label || "提示";
    elements.modalTitle.textContent = config.title;
    elements.modalMessage.textContent = config.message;
    elements.modalActions.innerHTML = "";

    config.actions.forEach((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `action-button ${action.type || "secondary"}`;
        button.textContent = action.label;
        button.addEventListener("click", action.onClick);
        elements.modalActions.appendChild(button);
    });

    elements.modal.classList.remove("hidden");
}

function hideModal() {
    elements.modal.classList.add("hidden");
}

function renderBoard() {
    if (isCardModeSessionActive() && state.cardMode) {
        renderCardModeBoard();
        return;
    }

    renderCoordinates();

    const boardMatrix = state.chess.board();
    const checkedSquare = findKingSquareInCheck();
    const legalTargets = new Map(state.legalMoves.map((move) => [move.to, move]));
    const files = getRenderFiles();
    const ranks = getRenderRanks();

    elements.board.innerHTML = "";

    ranks.forEach((rank) => {
        files.forEach((file) => {
            const square = `${file}${rank}`;
            const indices = squareToIndices(square);
            const boardSquare = boardMatrix[indices.row][indices.col];
            const squareElement = document.createElement("button");
            squareElement.type = "button";
            squareElement.className = `square ${(indices.row + indices.col) % 2 === 0 ? "light" : "dark"}`;
            squareElement.setAttribute("aria-label", square);

            if (state.selectedSquare === square) {
                squareElement.classList.add("selected");
            }
            if (state.lastMoveSquares.includes(square)) {
                squareElement.classList.add("last-move");
            }
            if (checkedSquare === square) {
                squareElement.classList.add("check");
            }
            if (state.hintSquares.includes(square)) {
                squareElement.classList.add("hint");
            }

            const targetMove = legalTargets.get(square);
            if (targetMove) {
                const marker = document.createElement("span");
                marker.className = targetMove.captured ? "capture-marker" : "legal-marker";
                squareElement.appendChild(marker);
            }

            if (boardSquare) {
                squareElement.appendChild(createPieceNode(boardSquare, "classic"));
            }

            squareElement.addEventListener("click", () => handleBoardClick(square));
            elements.board.appendChild(squareElement);
        });
    });

    renderCapturedPieces();
    renderMoveList();
}

function renderCoordinates() {
    const files = getRenderFiles();
    const ranks = getRenderRanks();
    const fileMarkup = files.map((file) => `<span>${file}</span>`).join("");
    const rankMarkup = ranks.map((rank) => `<span>${rank}</span>`).join("");

    elements.filesTop.innerHTML = fileMarkup;
    elements.filesBottom.innerHTML = fileMarkup;
    elements.ranksLeft.innerHTML = rankMarkup;
    elements.ranksRight.innerHTML = rankMarkup;
}

function renderCapturedPieces() {
    if (isCardModeSessionActive() && state.cardMode) {
        elements.capturedWhite.innerHTML = state.cardMode.capturedBy.w
            .map((piece) => createPieceTagMarkup(piece))
            .join("");
        elements.capturedBlack.innerHTML = state.cardMode.capturedBy.b
            .map((piece) => createPieceTagMarkup(piece))
            .join("");
        return;
    }

    const history = getCurrentHistory();
    const capturedWhite = [];
    const capturedBlack = [];

    history.forEach((move) => {
        if (!move.captured) {
            return;
        }

        if (move.color === "w") {
            capturedWhite.push(PIECES[`b${move.captured}`]);
        } else {
            capturedBlack.push(PIECES[`w${move.captured}`]);
        }
    });

    elements.capturedWhite.textContent = capturedWhite.join(" ");
    elements.capturedBlack.textContent = capturedBlack.join(" ");
}

function renderMoveList() {
    if (isCardModeSessionActive() && state.cardMode) {
        const history = state.cardMode.history;
        const rows = [];

        for (let index = 0; index < history.length; index += 2) {
            const turn = Math.floor(index / 2) + 1;
            const whiteMove = history[index];
            const blackMove = history[index + 1];
            rows.push(`
                <div class="move-row">
                    <span>${turn}.</span>
                    <strong>${whiteMove ? whiteMove.label : "-"}</strong>
                    <strong>${blackMove ? blackMove.label : "-"}</strong>
                </div>
            `);
        }

        elements.movesList.innerHTML = rows.length
            ? rows.join("")
            : '<p class="panel-note">选卡模式开始后，行动记录会显示在这里。</p>';
        elements.movesCount.textContent = `${Math.ceil(history.length / 2)} 回合`;
        return;
    }

    const history = getCurrentHistory();
    const rows = [];

    for (let index = 0; index < history.length; index += 2) {
        const turn = Math.floor(index / 2) + 1;
        const whiteMove = history[index];
        const blackMove = history[index + 1];
        rows.push(`
            <div class="move-row">
                <span>${turn}.</span>
                <strong>${whiteMove ? whiteMove.san : "-"}</strong>
                <strong>${blackMove ? blackMove.san : "-"}</strong>
            </div>
        `);
    }

    elements.movesList.innerHTML = rows.length
        ? rows.join("")
        : '<p class="panel-note">对局开始后，棋谱会显示在这里。</p>';
    elements.movesCount.textContent = `${Math.ceil(history.length / 2)} 回合`;
}

function updateHintControls() {
    if (!elements.hintButton || !elements.hintToggleRow) {
        return;
    }

    // The live toggle is available on the game screen for every mode (it's the only
    // way the online joiner — who has no setup screen — can turn hints on).
    const supported = Boolean(state.mode);
    elements.hintToggleRow.classList.toggle("hidden", !supported);
    if (elements.hintToggle) {
        elements.hintToggle.checked = state.hintEnabled;
    }

    const showButton = supported && state.hintEnabled;
    elements.hintButton.classList.toggle("hidden", !showButton);
    if (showButton) {
        elements.hintButton.disabled = state.hintThinking || !canRequestHint();
        elements.hintButton.textContent = state.hintThinking ? "⏳ 计算中…" : "💡 提示";
    }
}

function updatePanels(room) {
    updateHintControls();

    if (!state.mode) {
        elements.gameModeTitle.textContent = "尚未开始";
        elements.turnChip.textContent = "选择一种模式开始";
        elements.roomCodeDisplay.textContent = "本地对局";
        elements.playerColorDisplay.textContent = "未开始";
        elements.matchStatusDisplay.textContent = "等待开始";
        elements.roomNote.textContent = "选择模式后开始对局。";
        elements.undoHelp.textContent = "单机悔棋会回退你和 AI 的上一轮；联机悔棋会向对手发起申请。";
        elements.copyRoomButton.classList.add("hidden");
        elements.undoButton.disabled = true;
        elements.restartButton.disabled = true;
        syncCardModeChrome();
        return;
    }

    const roomData = room || state.online.roomData;
    const onlineCardMode = state.mode === "online" && isOnlineCardRoom(roomData) && state.cardMode;

    if ((state.mode === "card" || onlineCardMode) && state.cardMode) {
        const cardState = state.cardMode;
        const aiEnabled = cardState.settings.opponentType === "ai";
        const currentLabel = cardState.turn === "w" ? "白方" : "黑方";
        let actorLabel = `${currentLabel}行动`;

        if (onlineCardMode) {
            actorLabel = state.playerColor === "w" ? "你是白方" : "你是黑方";
        } else if (aiEnabled) {
            actorLabel = cardState.turn === "w"
                ? "白方（你）"
                : `黑方（AI ${AI_LEVELS[cardState.settings.aiDifficulty].label}）`;
        }

        elements.gameModeTitle.textContent = onlineCardMode ? "多人联机 · 选卡模式" : "选卡模式";
        elements.roomCodeDisplay.textContent = onlineCardMode
            ? (state.online.roomCode || "未连接")
            : (aiEnabled ? "卡战 vs AI" : "本地卡战");
        elements.playerColorDisplay.textContent = actorLabel;
        elements.matchStatusDisplay.textContent = cardState.status === "finished"
            ? (cardState.resultMessage || "对局结束")
            : (state.aiThinking ? "AI 行动中" : cardState.phase === "draft" ? "抽卡中" : cardState.phase === "deploy" ? "布阵中" : "进行中");
        elements.roomNote.textContent = buildCardModeNote(cardState, onlineCardMode);
        elements.undoHelp.textContent = onlineCardMode
            ? "联机悔棋会向对手发起申请；如果你正在本地布置卡牌，也可以先取消本次出牌。"
            : (aiEnabled
                ? "悔棋会回退你和 AI 的上一轮；如果正在布置卡牌，也可以直接撤销本次出牌。"
                : "本地双人悔棋会回退上一步；如果正在布置卡牌，也可以直接撤销本次出牌。");
        elements.copyRoomButton.classList.toggle("hidden", !onlineCardMode);

        if (cardState.status === "finished") {
            elements.turnChip.textContent = cardState.resultMessage || "对局结束";
        } else if (cardState.phase === "draft") {
            elements.turnChip.textContent = `${currentLabel}抽卡中`;
        } else if (cardState.phase === "deploy") {
            elements.turnChip.textContent = `${currentLabel}布阵中`;
        } else {
            const checkLabel = isCardModeInCheck(cardState.board, cardState.turn) ? " · 受将军" : "";
            elements.turnChip.textContent = `${currentLabel}回合${checkLabel}`;
        }

        const canUndoOnlineCard = Boolean(
            onlineCardMode &&
            roomData &&
            Array.isArray(roomData.cardUndoStack) &&
            roomData.cardUndoStack.length > 0 &&
            (!roomData.pendingUndo || roomData.pendingUndo.status !== "pending") &&
            roomData.cardUndoStack[roomData.cardUndoStack.length - 1].actorColor === state.playerColor &&
            cardState.turn !== state.playerColor
        );

        elements.undoButton.disabled = onlineCardMode ? !canUndoOnlineCard : !canUndoCardMode();
        elements.restartButton.disabled = false;
        syncCardModeChrome();
        return;
    }

    if (state.mode === "solo") {
        elements.gameModeTitle.textContent = `本地模式 · 人机 · ${AI_LEVELS[state.aiDifficulty].label}`;
        elements.roomCodeDisplay.textContent = "本地对局";
        elements.playerColorDisplay.textContent = "白方";
        elements.matchStatusDisplay.textContent = state.aiThinking ? "AI 思考中" : "进行中";
        elements.roomNote.textContent = "AI 默认执黑，你负责白方先手。";
        elements.undoHelp.textContent = "点击悔棋会回退你和 AI 的上一轮，让你重新思考布局。";
        elements.copyRoomButton.classList.add("hidden");
    } else if (state.mode === "local") {
        elements.gameModeTitle.textContent = "本地模式 · 双人";
        elements.roomCodeDisplay.textContent = "本地对局";
        elements.playerColorDisplay.textContent = state.chess.turn() === "w" ? "白方行动" : "黑方行动";
        elements.matchStatusDisplay.textContent = "进行中";
        elements.roomNote.textContent = "两人在同一设备上轮流走子，白方先手。";
        elements.undoHelp.textContent = "点击悔棋会回退最近一步，交还给上一位走子的玩家。";
        elements.copyRoomButton.classList.add("hidden");
    } else {
        elements.gameModeTitle.textContent = isOnlineCardRoom(roomData) ? "多人联机 · 选卡模式" : "多人联机";
        elements.roomCodeDisplay.textContent = state.online.roomCode || "未连接";
        elements.playerColorDisplay.textContent = state.playerColor === "w" ? "白方" : "黑方";
        elements.matchStatusDisplay.textContent = resolveOnlineStatus(roomData);
        elements.roomNote.textContent = buildRoomNote(roomData);
        elements.undoHelp.textContent = "联机悔棋只允许撤回你刚刚完成的上一步，并且需要对手同意。";
        elements.copyRoomButton.classList.remove("hidden");
    }

    const result = getGameResult(state.chess);
    if (state.mode === "online" && roomData && roomData.status === "waiting") {
        elements.turnChip.textContent = "等待黑方加入";
    } else {
        const turnLabel = state.chess.turn() === "w" ? "白方回合" : "黑方回合";
        const checkLabel = state.chess.in_check() ? " · 将军中" : "";
        elements.turnChip.textContent = result ? result.message : `${turnLabel}${checkLabel}`;
    }

    const canUndoSolo = (state.mode === "solo" || state.mode === "local") && state.localHistory.length > 0 && !state.aiThinking;
    const canUndoOnline = Boolean(
        state.mode === "online" &&
        roomData &&
        Array.isArray(roomData.moves) &&
        roomData.moves.length > 0 &&
        (!roomData.pendingUndo || roomData.pendingUndo.status !== "pending") &&
        roomData.moves[roomData.moves.length - 1].color === state.playerColor &&
        state.chess.turn() !== state.playerColor
    );

    elements.undoButton.disabled = !(canUndoSolo || canUndoOnline);
    elements.restartButton.disabled = false;
    syncCardModeChrome();
}

function buildCardModeNote(cardState, onlineCardMode) {
    const base = `每 ${cardState.settings.drawInterval} 回合生成 1 组共享卡池，本局共 ${cardState.settings.offerCount} 组。`;

    if (onlineCardMode) {
        return `联机选卡房已启用。${base} 后手先选，双方共享同组 4 选 1。`;
    }

    if (cardState.settings.opponentType === "ai") {
        return `你执白，对战黑方 AI ${AI_LEVELS[cardState.settings.aiDifficulty].label}。${base}`;
    }

    return `本局为本地双人选卡模式。${base}`;
}

function buildRoomNote(room) {
    if (!room) {
        return "正在连接联机房间...";
    }

    const gameTypeLabel = room.gameType === "card" ? "选卡模式" : "普通模式";
    if (!room.players || !room.players.black) {
        if (room.gameType === "card" && room.cardState && room.cardState.settings) {
            return `房间已创建，等待黑方加入。模式：${gameTypeLabel}，每 ${room.cardState.settings.drawInterval} 回合 1 组，共 ${room.cardState.settings.offerCount} 组。`;
        }

        return `房间已创建，等待黑方加入。模式：${gameTypeLabel}。`;
    }

    const whiteState = room.players.white && room.players.white.connected ? "在线" : "离线";
    const blackState = room.players.black && room.players.black.connected ? "在线" : "离线";
    let suffix = "";

    if (room.gameType === "card" && room.cardState && room.cardState.settings) {
        suffix = ` · 每 ${room.cardState.settings.drawInterval} 回合 1 组 / 共 ${room.cardState.settings.offerCount} 组`;
    }

    return `白方 ${whiteState} / 黑方 ${blackState} · ${gameTypeLabel}${suffix}`;
}

function resolveOnlineStatus(room) {
    if (!room) {
        return "连接中";
    }

    if (room.pendingUndo && room.pendingUndo.status === "pending") {
        return room.pendingUndo.requesterId === state.online.playerId ? "等待对手确认悔棋" : "收到悔棋申请";
    }

    if (room.status === "waiting") {
        return "等待对手";
    }

    if (room.status === "finished") {
        if (room.gameType === "card" && room.cardState && room.cardState.resultMessage) {
            return room.cardState.resultMessage;
        }
        return room.result && room.result.message ? room.result.message : "对局结束";
    }

    if (room.gameType === "card" && room.cardState) {
        if (room.cardState.phase === "draft") {
            return "抽卡中";
        }
        if (room.cardState.phase === "deploy") {
            return "布阵中";
        }
    }

    return "进行中";
}

function createPieceTagMarkup(piece) {
    const asset = getHybridPieceAsset(piece);
    if (asset) {
        return `<span class="captured-token"><img src="${asset}" alt=""></span>`;
    }

    return `<span class="captured-token">${getCardModePieceLabel(piece.type)}</span>`;
}

function syncCardModeChrome() {
    if (typeof renderCardModePanel === "function") {
        renderCardModePanel();
    }

    if (typeof renderCardModeDraftModal === "function") {
        renderCardModeDraftModal();
    }
}
