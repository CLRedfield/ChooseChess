const CARD_MODE_DEFAULT_SETTINGS = Object.freeze({
    drawInterval: 3,
    offerCount: 10,
    opponentType: "local",
    aiDifficulty: "medium"
});

const CARD_MODE_SETTING_LIMITS = Object.freeze({
    drawInterval: { min: 1, max: 6 },
    offerCount: { min: 1, max: 16 }
});

const CARD_MODE_OPPONENT_TYPES = Object.freeze(["local", "ai"]);
const CARD_MODE_TIERS = Object.freeze([1, 2, 3, 4]);

function createCardModeSettings(overrides) {
    return normalizeCardModeSettings({
        ...CARD_MODE_DEFAULT_SETTINGS,
        ...(overrides || {})
    });
}

function normalizeCardModeSettings(settings) {
    return {
        drawInterval: clampCardModeSetting(settings.drawInterval, CARD_MODE_SETTING_LIMITS.drawInterval),
        offerCount: clampCardModeSetting(settings.offerCount, CARD_MODE_SETTING_LIMITS.offerCount),
        opponentType: normalizeCardModeOpponentType(settings.opponentType),
        aiDifficulty: normalizeCardModeAiDifficulty(settings.aiDifficulty)
    };
}

function normalizeCardModeOpponentType(value) {
    return CARD_MODE_OPPONENT_TYPES.includes(value) ? value : CARD_MODE_DEFAULT_SETTINGS.opponentType;
}

function normalizeCardModeAiDifficulty(value) {
    return Object.prototype.hasOwnProperty.call(AI_LEVELS, value) ? value : CARD_MODE_DEFAULT_SETTINGS.aiDifficulty;
}

function clampCardModeSetting(value, limits) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return limits.min;
    }

    return Math.min(limits.max, Math.max(limits.min, Math.round(numericValue)));
}

function buildCardModeDrawPlan(settingsCandidate) {
    const settings = createCardModeSettings(settingsCandidate);
    const schedules = { w: [], b: [] };
    const windows = [];

    for (let offerIndex = 0; offerIndex < settings.offerCount; offerIndex += 1) {
        const startTurn = 1 + (offerIndex * settings.drawInterval) + Math.floor((offerIndex + 1) / 2);
        const order = offerIndex % 2 === 0 ? ["b", "w"] : ["w", "b"];
        const turns = order[0] === "b"
            ? { b: startTurn, w: startTurn + 1 }
            : { w: startTurn, b: startTurn };

        schedules.w.push(turns.w);
        schedules.b.push(turns.b);
        windows.push({
            offerIndex,
            order,
            turns
        });
    }

    return {
        settings,
        schedules,
        windows
    };
}

function createCardModeEmptyState(settingsCandidate) {
    const settings = createCardModeSettings(settingsCandidate);
    const drawPlan = buildCardModeDrawPlan(settings);

    return {
        settings,
        drawPlan,
        board: {},
        turn: "w",
        turnCounts: { w: 0, b: 0 },
        drawCounts: { w: 0, b: 0 },
        offers: [],
        hands: { w: [], b: [] },
        selectedSquare: null,
        legalMoves: [],
        lastMoveSquares: [],
        capturedBy: { w: [], b: [] },
        history: [],
        phase: "action",
        pendingOffer: null,
        deploying: null,
        pendingActionSnapshot: null,
        status: "playing",
        winner: null,
        resultMessage: null,
        undoStack: []
    };
}

function createCardModeInitialBoard() {
    return {
        e1: { color: "w", type: "king" },
        c2: { color: "w", type: "pawn" },
        d2: { color: "w", type: "pawn" },
        e2: { color: "w", type: "pawn" },
        f2: { color: "w", type: "pawn" },
        e8: { color: "b", type: "king" },
        c7: { color: "b", type: "pawn" },
        d7: { color: "b", type: "pawn" },
        e7: { color: "b", type: "pawn" },
        f7: { color: "b", type: "pawn" }
    };
}

function getCardModeOfferProgress(offerIndex, offerCount) {
    if (offerCount <= 1) {
        return 1;
    }

    return offerIndex / (offerCount - 1);
}

function easeCardModeOfferProgress(progress) {
    return progress * progress * (3 - (2 * progress));
}

function getCardModeTierProbabilities(offerIndex, offerCount) {
    if (offerIndex <= 0 || offerCount <= 1) {
        return {
            1: 1,
            2: 0,
            3: 0,
            4: 0
        };
    }

    const progress = easeCardModeOfferProgress(getCardModeOfferProgress(offerIndex, offerCount));
    const weights = {
        1: 10.8 - (9.6 * progress),
        2: 0.4 + (2.0 * progress),
        3: Math.pow(progress, 1.35) * 3.8,
        4: Math.pow(progress, 2.1) * 5.4
    };

    const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
    return Object.fromEntries(
        Object.entries(weights).map(([tier, value]) => [Number(tier), value / totalWeight])
    );
}

function createCardModeOffers(settingsCandidate) {
    const settings = createCardModeSettings(settingsCandidate);

    return Array.from({ length: settings.offerCount }, (_, offerIndex) => {
        const tierProbabilities = getCardModeTierProbabilities(offerIndex, settings.offerCount);
        const offerTier = pickCardModeOfferTier(tierProbabilities);
        return drawCardModeOfferCardsByTier(offerTier, 4).map((card) => ({
            ...card,
            pieces: { ...card.pieces }
        }));
    });
}

function pickCardModeOfferTier(tierProbabilities) {
    const pickedIndex = pickCardModeWeightedIndex(
        CARD_MODE_TIERS.map((tier) => tierProbabilities[tier] || 0)
    );

    return pickedIndex === -1 ? 1 : CARD_MODE_TIERS[pickedIndex];
}

function drawCardModeOfferCardsByTier(tier, count) {
    const candidates = shuffleArray(
        CARD_MODE_LIBRARY.filter((card) => card.tier === tier)
    );

    return candidates.slice(0, Math.min(count, candidates.length));
}

function pickCardModeWeightedIndex(weights) {
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    if (totalWeight <= 0) {
        return -1;
    }

    let randomValue = Math.random() * totalWeight;
    for (let index = 0; index < weights.length; index += 1) {
        randomValue -= weights[index];
        if (randomValue <= 0) {
            return index;
        }
    }

    return weights.length - 1;
}

function createCardInstance(card) {
    return {
        instanceId: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        definitionId: card.id,
        title: card.title,
        tier: card.tier,
        summary: card.summary,
        pieces: { ...card.pieces }
    };
}

function expandCardPieces(cardInstance) {
    const expanded = [];

    Object.entries(cardInstance.pieces).forEach(([pieceType, count]) => {
        for (let index = 0; index < count; index += 1) {
            expanded.push(pieceType);
        }
    });

    return expanded.sort((left, right) => CARD_MODE_PIECE_VALUES[right] - CARD_MODE_PIECE_VALUES[left]);
}

function shuffleArray(items) {
    const next = items.slice();
    for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    return next;
}

function getCardModeHomeRanks(color) {
    return color === "w" ? ["1", "2"] : ["7", "8"];
}
