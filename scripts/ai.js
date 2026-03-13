async function maybeRunAiTurn() {
    if (state.mode !== "solo" || state.chess.game_over() || state.chess.turn() !== state.aiColor) {
        renderBoard();
        updatePanels();
        syncResultNotification();
        return;
    }

    state.aiThinking = true;
    updatePanels();
    await delay(260);

    const move = chooseAiMove();
    state.aiThinking = false;

    if (move) {
        const applied = applyLocalMove(move);
        if (applied) {
            updateAfterMove(applied);
        }
    }

    renderBoard();
    updatePanels();
    syncResultNotification();
}

function chooseAiMove() {
    const settings = AI_LEVELS[state.aiDifficulty];
    const moves = orderMoves(state.chess.moves({ verbose: true }));
    let bestScore = -Infinity;
    let bestMoves = [];

    for (const move of moves) {
        const chess = new Chess();
        chess.load(state.chess.fen());
        chess.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || inferPromotion(move)
        });

        let score = minimax(chess, settings.depth - 1, -Infinity, Infinity, state.aiColor);
        if (settings.jitter) {
            score += (Math.random() - 0.5) * settings.jitter;
        }

        if (score > bestScore + 1e-6) {
            bestScore = score;
            bestMoves = [move];
        } else if (Math.abs(score - bestScore) < 1e-6) {
            bestMoves.push(move);
        }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)] || null;
}

function minimax(chess, depth, alpha, beta, aiColor) {
    if (depth === 0 || chess.game_over()) {
        return evaluateBoard(chess, aiColor);
    }

    const maximizing = chess.turn() === aiColor;
    const moves = orderMoves(chess.moves({ verbose: true }));

    if (maximizing) {
        let value = -Infinity;
        for (const move of moves) {
            chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || inferPromotion(move)
            });
            value = Math.max(value, minimax(chess, depth - 1, alpha, beta, aiColor));
            chess.undo();
            alpha = Math.max(alpha, value);
            if (alpha >= beta) {
                break;
            }
        }
        return value;
    }

    let value = Infinity;
    for (const move of moves) {
        chess.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || inferPromotion(move)
        });
        value = Math.min(value, minimax(chess, depth - 1, alpha, beta, aiColor));
        chess.undo();
        beta = Math.min(beta, value);
        if (alpha >= beta) {
            break;
        }
    }
    return value;
}

function orderMoves(moves) {
    return moves.slice().sort((left, right) => movePriority(right) - movePriority(left));
}

function movePriority(move) {
    let score = 0;
    if (move.captured) {
        score += PIECE_VALUES[move.captured] * 10 - PIECE_VALUES[move.piece];
    }
    if (move.promotion) {
        score += PIECE_VALUES[move.promotion] + 80;
    }
    if (move.flags && (move.flags.includes("k") || move.flags.includes("q"))) {
        score += 40;
    }
    return score;
}

function evaluateBoard(chess, aiColor) {
    if (chess.in_checkmate()) {
        return chess.turn() === aiColor ? -999999 : 999999;
    }

    if (chess.in_draw() || chess.in_stalemate() || chess.in_threefold_repetition() || chess.insufficient_material()) {
        return 0;
    }

    const board = chess.board();
    let score = 0;

    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const piece = board[row][col];
            if (!piece) {
                continue;
            }

            const material = PIECE_VALUES[piece.type];
            const table = POSITION_TABLES[piece.type];
            const positional = piece.color === "w" ? table[row][col] : table[7 - row][col];
            const total = material + positional;
            score += piece.color === aiColor ? total : -total;
        }
    }

    if (chess.in_check()) {
        score += chess.turn() === aiColor ? -40 : 40;
    }

    return score;
}
