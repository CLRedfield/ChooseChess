const CLASSIC_PIECE_ASSETS = {
    wp: "./assets/pieces/chess/white-pawn.png",
    wr: "./assets/pieces/chess/white-rook.png",
    wn: "./assets/pieces/chess/white-knight.png",
    wb: "./assets/pieces/chess/white-bishop.png",
    wq: "./assets/pieces/chess/white-queen.png",
    wk: "./assets/pieces/chess/white-king.png",
    bp: "./assets/pieces/chess/black-pawn.png",
    br: "./assets/pieces/chess/black-rook.png",
    bn: "./assets/pieces/chess/black-knight.png",
    bb: "./assets/pieces/chess/black-bishop.png",
    bq: "./assets/pieces/chess/black-queen.png",
    bk: "./assets/pieces/chess/black-king.png"
};

const HYBRID_PIECE_ASSETS = {
    w: {
        king: "./assets/pieces/chess/white-king.png",
        queen: "./assets/pieces/chess/white-queen.png",
        rook: "./assets/pieces/chess/white-rook.png",
        bishop: "./assets/pieces/chess/white-bishop.png",
        knight: "./assets/pieces/chess/white-knight.png",
        pawn: "./assets/pieces/chess/white-pawn.png",
        advisor: "./assets/pieces/xiangqi/white-advisor.svg",
        elephant: "./assets/pieces/xiangqi/white-elephant.svg",
        cannon: "./assets/pieces/xiangqi/white-cannon.svg",
        horse: "./assets/pieces/xiangqi/white-horse.svg",
        soldier: "./assets/pieces/xiangqi/white-soldier.svg"
    },
    b: {
        king: "./assets/pieces/chess/black-king.png",
        queen: "./assets/pieces/chess/black-queen.png",
        rook: "./assets/pieces/chess/black-rook.png",
        bishop: "./assets/pieces/chess/black-bishop.png",
        knight: "./assets/pieces/chess/black-knight.png",
        pawn: "./assets/pieces/chess/black-pawn.png",
        advisor: "./assets/pieces/xiangqi/black-advisor.svg",
        elephant: "./assets/pieces/xiangqi/black-elephant.svg",
        cannon: "./assets/pieces/xiangqi/black-cannon.svg",
        horse: "./assets/pieces/xiangqi/black-horse.svg",
        soldier: "./assets/pieces/xiangqi/black-soldier.svg"
    }
};

function getClassicPieceAsset(piece) {
    return CLASSIC_PIECE_ASSETS[`${piece.color}${piece.type}`] || null;
}

function getHybridPieceAsset(piece) {
    const colorAssets = HYBRID_PIECE_ASSETS[piece.color];
    return colorAssets ? colorAssets[piece.type] || null : null;
}

function createPieceNode(piece, mode) {
    const node = document.createElement("span");
    node.className = "piece";

    const asset = mode === "card" ? getHybridPieceAsset(piece) : getClassicPieceAsset(piece);
    if (asset) {
        const image = document.createElement("img");
        image.className = "piece-image";
        image.src = asset;
        image.alt = "";
        image.draggable = false;
        node.appendChild(image);
        return node;
    }

    if (mode === "card" && typeof getCardModePieceLabel === "function") {
        node.textContent = getCardModePieceLabel(piece.type);
    } else {
        node.textContent = PIECES[`${piece.color}${piece.type}`] || "";
    }

    return node;
}
