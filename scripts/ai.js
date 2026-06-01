async function maybeRunAiTurn() {
    if (state.mode !== "solo" || state.chess.game_over() || state.chess.turn() !== state.aiColor) {
        renderBoard();
        updatePanels();
        syncResultNotification();
        return;
    }

    state.aiThinking = true;
    updatePanels();
    await delay(140);

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
    const chess = new Chess();
    chess.load(state.chess.fen());
    return searchBestChessMove(chess, settings, state.aiColor);
}

// Per-search transposition table (fen -> { value, flag, depth }). Cleared at the
// start of every root search; the search perspective (aiColor) is fixed within a
// single call, so cached absolute scores stay valid for that call.
let chessSearchTable = null;

// Position key: piece placement + side + castling + en passant, dropping the
// halfmove/fullmove counters so move-order transpositions hit the same entry.
function chessPositionKey(chess) {
    return chess.fen().split(" ").slice(0, 4).join(" ");
}

// Shared root search: clone the board ONCE and use make/undo (instead of a fresh
// Chess()+load(fen) per root move), then run alpha-beta minimax from aiColor's view.
//
// Two regimes:
//  - jitter > 0 (playing AI): single full-depth pass with a wide window so all
//    equally-best moves are collected, then a jittered pick keeps games varied.
//  - jitter === 0 (depth-4 hint): iterative deepening + root alpha-narrowing. Each
//    iteration orders root moves best-first from the previous one, which makes
//    alpha-beta cut far more of the tree — the opening depth-4 hint goes from
//    several seconds to well under one.
function searchBestChessMove(chess, settings, aiColor) {
    chessSearchTable = new Map();
    const exact = !settings.jitter;
    const scored = orderMoves(chess.moves({ verbose: true })).map((move) => ({ move, evaluation: -Infinity }));
    let chosen = null;

    const startDepth = exact ? 1 : settings.depth;
    for (let depth = startDepth; depth <= settings.depth; depth += 1) {
        scored.sort((left, right) => right.evaluation - left.evaluation);

        if (exact) {
            // Hint path: iterative deepening + root alpha-narrowing. We keep only the
            // single strictly-best move — a move that fails low returns a boundary
            // value equal to alpha, which must NOT be mistaken for a genuine tie.
            let alpha = -Infinity;
            let bestMove = null;
            for (const entry of scored) {
                const move = entry.move;
                chess.move({
                    from: move.from,
                    to: move.to,
                    promotion: move.promotion || inferPromotion(move)
                });
                const value = minimax(chess, depth - 1, alpha, Infinity, aiColor);
                chess.undo();
                entry.evaluation = value;

                if (bestMove === null || value > alpha + 1e-6) {
                    alpha = Math.max(alpha, value);
                    bestMove = move;
                }
            }
            chosen = bestMove;
        } else {
            // Playing-AI path: one full-width pass, collect every equally-best move,
            // then a jittered random pick keeps games from repeating.
            let bestScore = -Infinity;
            let bestMoves = [];
            for (const entry of scored) {
                const move = entry.move;
                chess.move({
                    from: move.from,
                    to: move.to,
                    promotion: move.promotion || inferPromotion(move)
                });
                let score = minimax(chess, depth - 1, -Infinity, Infinity, aiColor);
                chess.undo();
                entry.evaluation = score;
                score += (Math.random() - 0.5) * settings.jitter;

                if (score > bestScore + 1e-6) {
                    bestScore = score;
                    bestMoves = [move];
                } else if (Math.abs(score - bestScore) < 1e-6) {
                    bestMoves.push(move);
                }
            }
            chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)] || null;
        }
    }

    chessSearchTable = null;
    return chosen;
}

// Depth-4 hint for the side to move (the local human). Uses jitter 0 so the
// suggestion is the true best move, not a randomized one.
function computeChessHint(depth = 4) {
    const hintColor = state.chess.turn();
    const chess = new Chess();
    chess.load(state.chess.fen());

    const move = searchBestChessMove(chess, { depth, jitter: 0 }, hintColor);
    if (!move) {
        return null;
    }

    const promo = move.promotion ? `=${String(move.promotion).toUpperCase()}` : "";
    return {
        squares: [move.from, move.to],
        text: `建议: ${move.from} → ${move.to}${promo}`
    };
}

function minimax(chess, depth, alpha, beta, aiColor) {
    if (depth === 0 || chess.game_over()) {
        return evaluateBoard(chess, aiColor);
    }

    const alphaOrig = alpha;
    const betaOrig = beta;
    const key = chessSearchTable ? chessPositionKey(chess) : null;
    const entry = key ? chessSearchTable.get(key) : null;

    if (entry && entry.depth >= depth) {
        // flag: 0 = exact, 1 = lower bound, 2 = upper bound.
        if (entry.flag === 0) {
            return entry.value;
        }
        if (entry.flag === 1 && entry.value > alpha) {
            alpha = entry.value;
        } else if (entry.flag === 2 && entry.value < beta) {
            beta = entry.value;
        }
        if (alpha >= beta) {
            return entry.value;
        }
    }

    const maximizing = chess.turn() === aiColor;
    const moves = orderMoves(chess.moves({ verbose: true }));

    // Search the transposition-table move first — it yields the most alpha-beta cutoffs.
    const ttMove = entry ? entry.move : null;
    if (ttMove) {
        for (let i = 1; i < moves.length; i += 1) {
            const m = moves[i];
            if (m.from === ttMove.from && m.to === ttMove.to && (m.promotion || "") === (ttMove.promotion || "")) {
                moves.splice(i, 1);
                moves.unshift(m);
                break;
            }
        }
    }

    let value;
    let bestMove = null;

    if (maximizing) {
        value = -Infinity;
        for (const move of moves) {
            chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || inferPromotion(move)
            });
            const childValue = minimax(chess, depth - 1, alpha, beta, aiColor);
            chess.undo();
            if (childValue > value) {
                value = childValue;
                bestMove = move;
            }
            alpha = Math.max(alpha, value);
            if (alpha >= beta) {
                break;
            }
        }
    } else {
        value = Infinity;
        for (const move of moves) {
            chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || inferPromotion(move)
            });
            const childValue = minimax(chess, depth - 1, alpha, beta, aiColor);
            chess.undo();
            if (childValue < value) {
                value = childValue;
                bestMove = move;
            }
            beta = Math.min(beta, value);
            if (alpha >= beta) {
                break;
            }
        }
    }

    if (key && (!entry || entry.depth <= depth)) {
        let flag = 0;
        if (value <= alphaOrig) {
            flag = 2;
        } else if (value >= betaOrig) {
            flag = 1;
        }

        chessSearchTable.set(key, {
            value,
            flag,
            depth,
            move: bestMove
                ? { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion || null }
                : (entry ? entry.move : null)
        });
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
    // Checkmate must be tested before game_over() (game_over() is also true on mate).
    if (chess.in_checkmate()) {
        return chess.turn() === aiColor ? -999999 : 999999;
    }

    // Any other terminal position (stalemate / 50-move / threefold / insufficient
    // material) is a draw worth 0. Consolidating into one game_over() call avoids
    // four expensive chess.js predicates on every non-terminal leaf (the common case).
    if (chess.game_over()) {
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
