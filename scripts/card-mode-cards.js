const CARD_MODE_PIECE_LABELS = {
    king: "王",
    queen: "后",
    rook: "车",
    bishop: "主教",
    knight: "骑士",
    pawn: "兵",
    advisor: "士",
    elephant: "象",
    cannon: "炮",
    horse: "马",
    soldier: "卒"
};

const CARD_MODE_PIECE_VALUES = {
    king: 1000.0,
    queen: 9.0,
    rook: 5.0,
    bishop: 3.3,
    knight: 3.2,
    pawn: 1.0,
    advisor: 1.6,
    elephant: 2.2,
    cannon: 4.8,
    horse: 3.0,
    soldier: 0.9
};

// Edit this list to rebalance the draft mode card pool.
// `tier` controls when the card can appear.
// `pieces` controls what the player may deploy after using the card.
const CARD_MODE_LIBRARY = [
    { id: "pawn-swarm", title: "兵潮", tier: 1, pieces: { pawn: 4 }, summary: "4 个国际象棋兵" },
    { id: "bishop-school", title: "主教团", tier: 1, pieces: { bishop: 2 }, summary: "2 个主教" },
    { id: "knight-duo", title: "骑士双锋", tier: 1, pieces: { knight: 2 }, summary: "2 个骑士" },
    { id: "guard-line", title: "士卒防线", tier: 1, pieces: { advisor: 2, soldier: 2 }, summary: "2 士 2 卒" },
    { id: "horse-team", title: "马队", tier: 1, pieces: { horse: 2, soldier: 1 }, summary: "2 个马 1 个卒" },
    { id: "cannon-scouts", title: "炮兵前哨", tier: 1, pieces: { cannon: 1, soldier: 2 }, summary: "1 炮 2 卒" },
    { id: "rook-seed", title: "车位压制", tier: 1, pieces: { rook: 1, pawn: 1 }, summary: "1 车 1 兵" },
    { id: "elephant-guard", title: "象阵", tier: 1, pieces: { elephant: 2, advisor: 1 }, summary: "2 象 1 士" },
    { id: "bishop-trio", title: "主教编队", tier: 2, pieces: { bishop: 3 }, summary: "3 个主教" },
    { id: "rook-pair", title: "双车", tier: 2, pieces: { rook: 2 }, summary: "2 个车" },
    { id: "mixed-officers", title: "混成军官团", tier: 2, pieces: { rook: 1, bishop: 1, knight: 1 }, summary: "1 车 1 主教 1 骑士" },
    { id: "horse-raiders", title: "马骑突袭", tier: 2, pieces: { horse: 1, knight: 1, pawn: 2 }, summary: "1 马 1 骑士 2 兵" },
    { id: "cannon-battery", title: "双炮阵", tier: 2, pieces: { cannon: 2, soldier: 1 }, summary: "2 炮 1 卒" },
    { id: "elephant-phalanx", title: "象群", tier: 2, pieces: { elephant: 3, advisor: 1 }, summary: "3 象 1 士" },
    { id: "advisor-wall", title: "士墙", tier: 2, pieces: { advisor: 3, soldier: 3 }, summary: "3 士 3 卒" },
    { id: "pawn-legion", title: "兵团", tier: 2, pieces: { pawn: 6 }, summary: "6 个兵" },
    { id: "queen-arrival", title: "后翼加入", tier: 3, pieces: { queen: 1, pawn: 1 }, summary: "1 后 1 兵" },
    { id: "heavy-column", title: "重列纵深", tier: 3, pieces: { rook: 1, cannon: 1, pawn: 2 }, summary: "1 车 1 炮 2 兵" },
    { id: "royal-wings", title: "王廷双翼", tier: 3, pieces: { queen: 1, bishop: 1 }, summary: "1 后 1 主教" },
    { id: "hybrid-elite", title: "混种精锐", tier: 3, pieces: { rook: 1, horse: 1, advisor: 1 }, summary: "1 车 1 马 1 士" },
    { id: "cannon-fort", title: "炮垒", tier: 3, pieces: { cannon: 1, rook: 1, advisor: 1 }, summary: "1 炮 1 车 1 士" },
    { id: "elephant-court", title: "象廷", tier: 3, pieces: { elephant: 2, advisor: 2, soldier: 1 }, summary: "2 象 2 士 1 卒" },
    { id: "cavalry-wave", title: "骑群", tier: 3, pieces: { knight: 2, horse: 1 }, summary: "2 骑士 1 马" },
    { id: "soldier-drill", title: "卒列操典", tier: 3, pieces: { soldier: 6, advisor: 2 }, summary: "6 卒 2 士" },
    { id: "queen-rook", title: "后车联手", tier: 4, pieces: { queen: 1, rook: 1 }, summary: "1 后 1 车" },
    { id: "twin-cannon-guard", title: "三炮护阵", tier: 4, pieces: { cannon: 3, advisor: 1 }, summary: "3 炮 1 士" },
    { id: "grand-mix", title: "大混成", tier: 4, pieces: { rook: 1, bishop: 1, horse: 1, cannon: 1, pawn: 1 }, summary: "1 车 1 主教 1 马 1 炮 1 兵" },
    { id: "bishop-queen-wall", title: "后翼圣堂", tier: 4, pieces: { queen: 1, bishop: 2 }, summary: "1 后 2 主教" },
    { id: "elephant-breakers", title: "象马破阵", tier: 4, pieces: { elephant: 2, horse: 2, cannon: 1 }, summary: "2 象 2 马 1 炮" },
    { id: "flood-of-pieces", title: "杂兵洪流", tier: 4, pieces: { pawn: 4, soldier: 4, advisor: 2 }, summary: "4 兵 4 卒 2 士" }
];

function getCardModePieceLabel(pieceType) {
    return CARD_MODE_PIECE_LABELS[pieceType] || pieceType;
}

function getCardModeCardTotalValue(card) {
    return Object.entries(card.pieces).reduce((total, [pieceType, count]) => {
        return total + (CARD_MODE_PIECE_VALUES[pieceType] || 0) * count;
    }, 0);
}
