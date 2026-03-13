function renderCardModeBoard() {
    renderCoordinates();

    const cardState = state.cardMode;
    const files = getRenderFiles();
    const ranks = getRenderRanks();
    const legalTargets = new Map((cardState.legalMoves || []).map((move) => [move.to, move]));
    const checkedSquare = isCardModeInCheck(cardState.board, cardState.turn)
        ? getCardModeKingSquare(cardState.board, cardState.turn)
        : null;

    elements.board.innerHTML = "";

    ranks.forEach((rank) => {
        files.forEach((file) => {
            const square = `${file}${rank}`;
            const indices = squareToIndices(square);
            const boardSquare = cardState.board[square];
            const squareElement = document.createElement("button");
            squareElement.type = "button";
            squareElement.className = `square ${(indices.row + indices.col) % 2 === 0 ? "light" : "dark"}`;
            squareElement.setAttribute("aria-label", square);

            if (cardState.selectedSquare === square) {
                squareElement.classList.add("selected");
            }
            if (state.lastMoveSquares.includes(square)) {
                squareElement.classList.add("last-move");
            }
            if (checkedSquare === square) {
                squareElement.classList.add("check");
            }

            if (cardState.phase === "deploy" && isCardModeDeploySquare(square, cardState.turn)) {
                squareElement.classList.add("deployable");
                const marker = document.createElement("span");
                marker.className = "legal-marker";
                squareElement.appendChild(marker);
            }

            const targetMove = legalTargets.get(square);
            if (targetMove) {
                const marker = document.createElement("span");
                marker.className = targetMove.captured ? "capture-marker" : "legal-marker";
                squareElement.appendChild(marker);
            }

            if (boardSquare) {
                squareElement.appendChild(createPieceNode(boardSquare, "card"));
            }

            squareElement.addEventListener("click", () => handleCardModeBoardClick(square));
            elements.board.appendChild(squareElement);
        });
    });

    renderCapturedPieces();
    renderMoveList();
    renderCardModePanel();
    renderCardModeDraftModal();
}

function renderCardModePanel() {
    if (!elements.cardPanel) {
        return;
    }

    const enabled = Boolean(
        state.cardMode &&
        (state.mode === "card" || (state.mode === "online" && isOnlineCardRoom()))
    );
    elements.cardPanel.classList.toggle("hidden", !enabled);
    if (!enabled) {
        return;
    }

    const cardState = state.cardMode;
    const aiLabel = cardState.settings.opponentType === "ai"
        ? ` · AI ${AI_LEVELS[cardState.settings.aiDifficulty].label}`
        : "";

    elements.cardPhaseNote.textContent = getCardModePhaseNote();
    elements.cardTurnInfo.textContent = `白方回合 ${cardState.turnCounts.w} · 黑方回合 ${cardState.turnCounts.b} · 当前 ${cardState.turn === "w" ? "白方" : "黑方"}${aiLabel}`;

    elements.cardHand.innerHTML = `
        <div class="card-hand-columns">
            ${renderCardModeHandGroup("w", cardState)}
            ${renderCardModeHandGroup("b", cardState)}
        </div>
    `;

    Array.from(elements.cardHand.querySelectorAll("[data-card-id]")).forEach((button) => {
        button.addEventListener("click", () => {
            if (button.dataset.cardColor !== cardState.turn || cardState.phase !== "action" || !canCardModeHumanInteract()) {
                return;
            }

            startCardDeployment(button.dataset.cardId);
        });
    });

    if (cardState.phase === "deploy" && cardState.deploying) {
        const remainingEntries = getCardModePieceCounts(cardState.deploying.remainingPieces);
        elements.cardDeployInfo.classList.remove("hidden");
        elements.cardDeployInfo.innerHTML = `
            <div class="deploy-card-title">
                <strong>${cardState.deploying.card.title}</strong>
                <span>本回合只能布置，不能移动棋子。</span>
            </div>
        `;
        elements.cardRemaining.innerHTML = remainingEntries.map(([pieceType, count]) => `
            <button class="piece-chip ${cardState.deploying.selectedPieceType === pieceType ? "active" : ""}" type="button" data-piece-type="${pieceType}">
                ${getCardModePieceLabel(pieceType)} × ${count}
            </button>
        `).join("");

        Array.from(elements.cardRemaining.querySelectorAll("[data-piece-type]")).forEach((button) => {
            button.addEventListener("click", () => selectCardDeploymentPiece(button.dataset.pieceType));
        });

        elements.cardCancelButton.classList.remove("hidden");
        elements.cardFinishButton.classList.remove("hidden");
    } else {
        elements.cardDeployInfo.classList.add("hidden");
        elements.cardDeployInfo.innerHTML = "";
        elements.cardRemaining.innerHTML = "";
        elements.cardCancelButton.classList.add("hidden");
        elements.cardFinishButton.classList.add("hidden");
    }
}

function renderCardModeHandGroup(color, cardState) {
    const hand = cardState.hands[color];
    const isCurrentTurn = color === cardState.turn;
    const isAiSide = cardState.settings.opponentType === "ai" && color === state.aiColor;
    const sideLabel = color === "w" ? "白方手牌" : "黑方手牌";
    const sideMiniLabel = color === "w" ? "White" : "Black";
    const countLabel = `${hand.length} 张${isCurrentTurn ? " · 当前行动方" : ""}${isAiSide ? " · AI" : ""}`;
    const sideNote = hand.length
        ? `
            <div class="card-hand-list">
                ${hand.map((card) => `
                    <button class="hand-card" type="button" data-card-id="${card.instanceId}" data-card-color="${color}" ${!isCurrentTurn || cardState.phase !== "action" || !canCardModeHumanInteract() ? "disabled" : ""}>
                        <span class="mode-tag">T${card.tier}</span>
                        <strong>${card.title}</strong>
                        <span>${card.summary}</span>
                        <span class="hand-piece-list">${formatCardPieceSummary(card.pieces)}</span>
                    </button>
                `).join("")}
            </div>
        `
        : '<p class="panel-note">当前没有手牌。</p>';

    return `
        <section class="card-hand-group ${isCurrentTurn ? "active" : ""}">
            <div class="card-hand-header">
                <div>
                    <p class="mini-label">${sideMiniLabel}</p>
                    <strong>${sideLabel}</strong>
                </div>
                <span class="moves-count">${countLabel}</span>
            </div>
            ${sideNote}
        </section>
    `;
}

function renderCardModeDraftModal() {
    if (!elements.draftModal) {
        return;
    }

    const enabled = Boolean(
        state.cardMode &&
        state.cardMode.pendingOffer &&
        (state.mode === "card" || (state.mode === "online" && isOnlineCardRoom()))
    );
    elements.draftModal.classList.toggle("hidden", !enabled);
    if (!enabled) {
        return;
    }

    const pendingOffer = state.cardMode.pendingOffer;
    const currentSide = state.cardMode.turn === "w" ? "白方" : "黑方";
    const currentSideClass = state.cardMode.turn === "w" ? "white" : "black";
    const aiPicking = isCardModeAiEnabled() && state.cardMode.turn === state.aiColor;
    const humanInteractive = canCardModeHumanInteract();
    const waitingOnOpponent = !humanInteractive && !aiPicking;

    elements.draftTitle.textContent = `第 ${pendingOffer.offerIndex + 1} 次抽卡`;
    elements.draftMessage.innerHTML = `
        <span class="draft-side-badge ${currentSideClass}">${currentSide}选卡</span>
        <span class="draft-message-copy">${aiPicking ? "当前由黑方 AI 从这组共享的 4 张卡里进行选择。" : waitingOnOpponent ? `当前由${currentSide}进行选卡，请等待对手完成选择。` : `当前由${currentSide}从这组共享的 4 张卡里选择 1 张加入手牌。`}</span>
    `;
    elements.draftGrid.innerHTML = pendingOffer.cards.map((card) => `
        <button class="draft-option" type="button" data-card-id="${card.id}" ${!humanInteractive ? "disabled" : ""}>
            <span class="mode-tag">T${card.tier}</span>
            <strong>${card.title}</strong>
            <span>${card.summary}</span>
            <span class="hand-piece-list">${formatCardPieceSummary(card.pieces)}</span>
        </button>
    `).join("");

    Array.from(elements.draftGrid.querySelectorAll("[data-card-id]")).forEach((button) => {
        button.addEventListener("click", () => chooseCardModeOffer(button.dataset.cardId));
    });
}

function getCardModePhaseNote() {
    const cardState = state.cardMode;
    if (!cardState) {
        return "";
    }

    const onlineOpponentTurn = Boolean(
        state.mode === "online" &&
        isOnlineCardRoom() &&
        cardState.turn !== state.playerColor
    );

    if (cardState.phase === "draft") {
        if (canCardModeHumanInteract()) {
            return "当前正在抽卡，先从四个选项里选 1 张加入手牌。";
        }
        if (onlineOpponentTurn) {
            return "当前轮到对手抽卡，请稍候。";
        }
        return "当前轮到 AI 抽卡，请稍候。";
    }

    if (cardState.phase === "deploy") {
        return "布阵阶段：选择 1 个剩余棋子，放在己方两行内的空格。";
    }

    if (!canCardModeHumanInteract()) {
        if (onlineOpponentTurn) {
            return "当前轮到对手行动，请稍候。";
        }
        if (isCardModeAiEnabled()) {
            return "当前轮到 AI 行动，请稍候。";
        }
    }

    return "行动阶段：你可以走棋，也可以使用 1 张手牌进行布置。";
}

function formatCardPieceSummary(pieces) {
    return Object.entries(pieces)
        .map(([pieceType, count]) => `${getCardModePieceLabel(pieceType)}×${count}`)
        .join(" · ");
}

function getCardModePieceCounts(pieceTypes) {
    const counts = new Map();

    pieceTypes.forEach((pieceType) => {
        counts.set(pieceType, (counts.get(pieceType) || 0) + 1);
    });

    return Array.from(counts.entries()).sort((left, right) => {
        return CARD_MODE_PIECE_VALUES[right[0]] - CARD_MODE_PIECE_VALUES[left[0]];
    });
}
