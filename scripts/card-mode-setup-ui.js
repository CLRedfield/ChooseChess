function renderCardModeSetupScreen() {
    if (!elements.cardSetupScreen) {
        return;
    }

    const settings = createCardModeSettings(state.cardModeSetup && state.cardModeSetup.settings);
    const drawPlan = buildCardModeDrawPlan(settings);
    const opponentLabel = settings.opponentType === "ai"
        ? `对战 AI（${AI_LEVELS[settings.aiDifficulty].label}）`
        : "本地双人";

    syncCardModeSetupInputs(settings);

    elements.cardSetupSummary.textContent = `当前每 ${settings.drawInterval} 回合生成 1 组共享卡池，共 ${settings.offerCount} 组。每组会先决定同一个 tier，再从该 tier 发 4 张卡；第 1 组固定为 T1，之后高阶卡概率会随发牌进度逐步升高。本局模式为${opponentLabel}。`;
    elements.cardSetupBlackSchedule.textContent = formatCardModeTurnList(drawPlan.schedules.b);
    elements.cardSetupWhiteSchedule.textContent = formatCardModeTurnList(drawPlan.schedules.w);

    elements.cardWindowPreview.innerHTML = drawPlan.windows.map((windowPlan) => {
        const firstLabel = windowPlan.order[0] === "b" ? "后手" : "先手";
        const secondLabel = windowPlan.order[1] === "b" ? "后手" : "先手";
        const firstTurn = windowPlan.turns[windowPlan.order[0]];
        const secondTurn = windowPlan.turns[windowPlan.order[1]];
        const tierProbabilities = getCardModeTierProbabilities(windowPlan.offerIndex, settings.offerCount);

        return `
            <div class="setup-window-row">
                <span>第 ${windowPlan.offerIndex + 1} 组</span>
                <strong>${firstLabel} ${firstTurn} -> ${secondLabel} ${secondTurn}</strong>
                <span class="setup-window-probability">同 tier 4 张 · ${formatCardModeTierProbabilityText(tierProbabilities)}</span>
            </div>
        `;
    }).join("");

    elements.cardLibraryPreview.innerHTML = CARD_MODE_LIBRARY.map((card) => `
        <article class="library-card">
            <div class="library-card-head">
                <span class="mode-tag">T${card.tier}</span>
                <strong>${card.title}</strong>
            </div>
            <span class="library-card-summary">${card.summary}</span>
            <span class="hand-piece-list">${formatCardPieceSummary(card.pieces)}</span>
            <span class="library-card-value">估值 ${getCardModeCardTotalValue(card).toFixed(1)}</span>
            <code>id: ${card.id}</code>
        </article>
    `).join("");

    if (elements.cardConfirmModeNote) {
        elements.cardConfirmModeNote.textContent = settings.opponentType === "ai"
            ? `选卡模式 / 对战 AI / ${AI_LEVELS[settings.aiDifficulty].label}`
            : "选卡模式 / 本地双人";
    }
}

function syncCardModeSetupInputs(settings) {
    elements.cardDrawIntervalRange.value = String(settings.drawInterval);
    elements.cardDrawIntervalInput.value = String(settings.drawInterval);
    elements.cardOfferCountRange.value = String(settings.offerCount);
    elements.cardOfferCountInput.value = String(settings.offerCount);

    if (elements.cardOpponentSelect) {
        elements.cardOpponentSelect.value = settings.opponentType;
    }

    if (elements.cardAiDifficultySelect) {
        elements.cardAiDifficultySelect.value = settings.aiDifficulty;
        elements.cardAiDifficultySelect.disabled = settings.opponentType !== "ai";
    }
}

function formatCardModeTurnList(turns) {
    if (!turns || turns.length === 0) {
        return "-";
    }

    return turns.join(" / ");
}

function formatCardModeTierProbabilityText(tierProbabilities) {
    return [1, 2, 3, 4]
        .map((tier) => `T${tier} ${(tierProbabilities[tier] * 100).toFixed(0)}%`)
        .join(" · ");
}
