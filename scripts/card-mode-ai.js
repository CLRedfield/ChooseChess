const CARD_MODE_AI_LEVELS = {
    easy: { depth: 1, jitter: 1.1, maxActions: 8 },
    medium: { depth: 2, jitter: 0.45, maxActions: 10 },
    hard: { depth: 2, jitter: 0.12, maxActions: 14 }
};

async function maybeRunCardModeAiTurn() {
    if (!isCardModeAiEnabled() || !state.cardMode || state.aiThinking) {
        return;
    }

    if (state.cardMode.status !== "playing" || state.cardMode.turn !== state.aiColor) {
        return;
    }

    state.aiThinking = true;
    renderBoard();
    updatePanels();
    await delay(280);

    try {
        while (
            isCardModeAiEnabled() &&
            state.cardMode &&
            state.cardMode.status === "playing" &&
            state.cardMode.turn === state.aiColor
        ) {
            const candidate = pickBestCardModeAiCandidate(state.cardMode, state.aiColor, state.aiDifficulty);
            if (!candidate) {
                break;
            }

            const snapshot = captureCardModeSnapshot(state.cardMode);
            const outcome = applyCardModeAiCandidate(state.cardMode, candidate);
            if (!outcome.applied) {
                break;
            }

            recordCardModeUndoSnapshot(snapshot, snapshot.turn);
            state.lastMoveSquares = outcome.lastMoveSquares;
            renderBoard();
            updatePanels();

            if (outcome.toast) {
                showToast(outcome.toast, "success");
            }

            if (state.cardMode.status === "finished" && state.cardMode.resultMessage) {
                showToast(state.cardMode.resultMessage, state.cardMode.winner ? "success" : "error");
                break;
            }

            await delay(260);
        }
    } finally {
        state.aiThinking = false;
        renderBoard();
        updatePanels();
    }
}

function pickBestCardModeAiCandidate(cardState, aiColor, difficulty) {
    const settings = CARD_MODE_AI_LEVELS[difficulty] || CARD_MODE_AI_LEVELS.medium;
    const candidates = getCardModeAiCandidates(cardState, cardState.turn, settings.maxActions);
    let bestScore = -Infinity;
    let bestCandidates = [];

    candidates.forEach((candidate) => {
        const simulation = cloneCardModeStateForSimulation(cardState);
        const outcome = applyCardModeAiCandidate(simulation, candidate);
        if (!outcome.applied) {
            return;
        }

        let score = minimaxCardMode(
            simulation,
            settings.depth - 1,
            -Infinity,
            Infinity,
            aiColor,
            settings
        );

        if (settings.jitter) {
            score += (Math.random() - 0.5) * settings.jitter;
        }

        if (score > bestScore + 1e-6) {
            bestScore = score;
            bestCandidates = [candidate];
        } else if (Math.abs(score - bestScore) < 1e-6) {
            bestCandidates.push(candidate);
        }
    });

    return bestCandidates[Math.floor(Math.random() * bestCandidates.length)] || null;
}

function minimaxCardMode(cardState, depth, alpha, beta, aiColor, settings) {
    if (depth <= 0 || cardState.status !== "playing") {
        return evaluateCardModeState(cardState, aiColor);
    }

    const candidates = getCardModeAiCandidates(
        cardState,
        cardState.turn,
        Math.max(6, Math.ceil(settings.maxActions * 0.75))
    );

    if (candidates.length === 0) {
        return evaluateCardModeState(cardState, aiColor);
    }

    const maximizing = cardState.turn === aiColor;

    if (maximizing) {
        let value = -Infinity;
        for (const candidate of candidates) {
            const simulation = cloneCardModeStateForSimulation(cardState);
            const outcome = applyCardModeAiCandidate(simulation, candidate);
            if (!outcome.applied) {
                continue;
            }

            value = Math.max(value, minimaxCardMode(simulation, depth - 1, alpha, beta, aiColor, settings));
            alpha = Math.max(alpha, value);
            if (alpha >= beta) {
                break;
            }
        }
        return value;
    }

    let value = Infinity;
    for (const candidate of candidates) {
        const simulation = cloneCardModeStateForSimulation(cardState);
        const outcome = applyCardModeAiCandidate(simulation, candidate);
        if (!outcome.applied) {
            continue;
        }

        value = Math.min(value, minimaxCardMode(simulation, depth - 1, alpha, beta, aiColor, settings));
        beta = Math.min(beta, value);
        if (alpha >= beta) {
            break;
        }
    }
    return value;
}

function getCardModeAiCandidates(cardState, color, maxActions) {
    if (!cardState || cardState.status !== "playing" || cardState.turn !== color) {
        return [];
    }

    let candidates = [];
    if (cardState.phase === "draft" && cardState.pendingOffer) {
        candidates = cardState.pendingOffer.cards.map((card) => ({
            type: "draft",
            cardId: card.id,
            title: card.title,
            priority: (getCardModeCardTotalValue(card) * 5) + (card.tier * 2)
        }));
    } else if (cardState.phase === "action") {
        candidates = candidates
            .concat(buildCardModeAiMoveCandidates(cardState, color))
            .concat(buildCardModeAiDeployCandidates(cardState, color));
    }

    return candidates
        .sort((left, right) => right.priority - left.priority)
        .slice(0, maxActions);
}

function buildCardModeAiMoveCandidates(cardState, color) {
    return getAllCardModeLegalMoves(cardState.board, color).map((move) => {
        const movingPiece = cardState.board[move.from];
        let priority = 12;

        if (move.captured) {
            priority += (CARD_MODE_PIECE_VALUES[move.captured.type] * 12) - (CARD_MODE_PIECE_VALUES[movingPiece.type] * 2);
        }

        if (movingPiece.type === "pawn" && shouldPromoteCardModePawn(move.to, movingPiece.color)) {
            priority += 18;
        }

        const previewBoard = cloneCardModeBoard(cardState.board);
        applyCardModeMoveToBoard(previewBoard, move);
        if (isCardModeInCheck(previewBoard, getOppositeColor(color))) {
            priority += 7;
        }

        return {
            type: "move",
            move,
            priority
        };
    });
}

function buildCardModeAiDeployCandidates(cardState, color) {
    if (!hasCardModeDeployAction(cardState, color)) {
        return [];
    }

    return cardState.hands[color].map((card) => {
        const placements = planCardModeAiPlacements(cardState, card, color);
        const placedValue = placements.reduce((total, placement) => {
            return total + (CARD_MODE_PIECE_VALUES[placement.pieceType] || 0);
        }, 0);

        return {
            type: "deploy",
            cardId: card.instanceId,
            title: card.title,
            placements,
            priority: (placedValue * 5) + (card.tier * 3) + placements.length
        };
    }).filter((candidate) => candidate.placements.length > 0);
}

function planCardModeAiPlacements(cardState, card, color) {
    const previewBoard = cloneCardModeBoard(cardState.board);
    const placements = [];
    const pieces = expandCardPieces(card);

    pieces.forEach((pieceType) => {
        const availableSquares = getCardModeAvailableDeploySquares(previewBoard, color);
        if (availableSquares.length === 0) {
            return;
        }

        let bestSquare = availableSquares[0];
        let bestScore = -Infinity;

        availableSquares.forEach((square) => {
            const score = scoreCardModeAiPlacementSquare(previewBoard, square, pieceType, color);
            if (score > bestScore) {
                bestScore = score;
                bestSquare = square;
            }
        });

        previewBoard[bestSquare] = { color, type: pieceType };
        placements.push({ square: bestSquare, pieceType });
    });

    return placements;
}

function scoreCardModeAiPlacementSquare(board, square, pieceType, color) {
    const fileIndex = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    const centerBonus = 3.5 - Math.abs(fileIndex - 3.5);
    const advanceBonus = color === "w" ? rank : 9 - rank;
    let score = centerBonus;

    switch (pieceType) {
        case "queen":
        case "rook":
        case "cannon":
            score += centerBonus * 1.6 + advanceBonus * 0.6;
            break;
        case "bishop":
        case "knight":
        case "horse":
            score += centerBonus * 1.4 + advanceBonus * 0.8;
            break;
        case "pawn":
        case "soldier":
            score += centerBonus * 0.7 + advanceBonus * 1.1;
            break;
        case "advisor":
        case "elephant":
            score += "def".includes(square[0]) ? 2.2 : 0.8;
            score += color === "w" ? (rank === 1 ? 1.3 : 0.5) : (rank === 8 ? 1.3 : 0.5);
            break;
        case "king":
            score += "def".includes(square[0]) ? 3 : 1;
            break;
        default:
            break;
    }

    const previewBoard = cloneCardModeBoard(board);
    previewBoard[square] = { color, type: pieceType };
    if (isCardModeSquareAttacked(previewBoard, square, getOppositeColor(color))) {
        score -= 1.4;
    }

    return score;
}

function evaluateCardModeState(cardState, aiColor) {
    if (cardState.status === "finished") {
        if (cardState.winner === aiColor) {
            return 100000;
        }
        if (!cardState.winner) {
            return 0;
        }
        return -100000;
    }

    let score = 0;

    Object.entries(cardState.board).forEach(([square, piece]) => {
        const value = evaluateCardModeBoardPiece(piece, square);
        score += piece.color === aiColor ? value : -value;
    });

    score += evaluateCardModeHandValue(cardState.hands[aiColor]) * 0.62;
    score -= evaluateCardModeHandValue(cardState.hands[getOppositeColor(aiColor)]) * 0.62;

    score += getAllCardModeLegalMoves(cardState.board, aiColor).length * 0.16;
    score -= getAllCardModeLegalMoves(cardState.board, getOppositeColor(aiColor)).length * 0.16;

    if (isCardModeInCheck(cardState.board, getOppositeColor(aiColor))) {
        score += 2.6;
    }
    if (isCardModeInCheck(cardState.board, aiColor)) {
        score -= 3.1;
    }

    return score;
}

function evaluateCardModeBoardPiece(piece, square) {
    const fileIndex = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    const centerBonus = 3.5 - Math.abs(fileIndex - 3.5);
    const forwardBonus = piece.color === "w" ? rank - 1 : 8 - rank;
    let score = CARD_MODE_PIECE_VALUES[piece.type] || 0;

    switch (piece.type) {
        case "queen":
        case "rook":
        case "cannon":
            score += centerBonus * 0.28;
            break;
        case "bishop":
        case "knight":
        case "horse":
            score += centerBonus * 0.35;
            break;
        case "pawn":
        case "soldier":
            score += forwardBonus * 0.22;
            score += centerBonus * 0.12;
            break;
        case "advisor":
        case "elephant":
            score += "def".includes(square[0]) ? 0.4 : 0.1;
            break;
        case "king":
            score += "def".includes(square[0]) ? 0.35 : 0;
            break;
        default:
            break;
    }

    return score;
}

function evaluateCardModeHandValue(hand) {
    return (hand || []).reduce((total, card) => total + getCardModeCardTotalValue(card), 0);
}

function applyCardModeAiCandidate(cardState, candidate) {
    if (!candidate) {
        return { applied: false, lastMoveSquares: [], toast: "" };
    }

    if (candidate.type === "draft") {
        const selected = applyCardModeDraftChoiceToState(cardState, candidate.cardId);
        return {
            applied: Boolean(selected),
            lastMoveSquares: [],
            toast: selected ? `黑方 AI 选择了卡牌：${selected.title}` : ""
        };
    }

    if (candidate.type === "move") {
        const movingPiece = cardState.board[candidate.move.from]
            ? { ...cardState.board[candidate.move.from] }
            : null;
        const capturedPiece = candidate.move.captured ? { ...candidate.move.captured } : null;
        const result = applyCardModeMoveActionToState(cardState, candidate.move);
        return {
            applied: true,
            lastMoveSquares: [candidate.move.from, candidate.move.to],
            toast: movingPiece ? `黑方 AI：${buildCardModeMoveLabel(movingPiece, candidate.move, capturedPiece)}` : "黑方 AI 落子",
            result
        };
    }

    if (candidate.type === "deploy") {
        const result = applyCardModeDeployActionToState(cardState, candidate.cardId, candidate.placements);
        return {
            applied: Boolean(result || candidate.placements.length),
            lastMoveSquares: candidate.placements.length ? [candidate.placements[candidate.placements.length - 1].square] : [],
            toast: `黑方 AI 使用卡牌：${candidate.title}`,
            result
        };
    }

    return { applied: false, lastMoveSquares: [], toast: "" };
}
