import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

const values: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 0,
};
const mateScore = 100_000;

function evaluate(game: Chess, aiColor: 'w' | 'b'): number {
  let score = 0;
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const square = piece.square as Square;
      const file = square.charCodeAt(0) - 97;
      const rank = Number(square[1]) - 1;
      const center = 3.5 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5)) / 2;
      const advance = piece.color === 'w' ? rank : 7 - rank;
      const positional = piece.type === 'p' ? advance * 7 : piece.type === 'n' || piece.type === 'b' ? center * 8 : 0;
      const pieceScore = values[piece.type] + positional;
      score += piece.color === aiColor ? pieceScore : -pieceScore;
    }
  }
  return score;
}

function orderedMoves(game: Chess): Move[] {
  return game.moves({ verbose: true }).sort((a, b) => {
    const value = (move: Move) => (move.captured ? values[move.captured] - values[move.piece] / 10 : 0) + (move.promotion ? values[move.promotion] : 0);
    return value(b) - value(a);
  });
}

function search(game: Chess, depth: number, alpha: number, beta: number, aiColor: 'w' | 'b', ply: number): number {
  if (game.isCheckmate()) return game.turn() === aiColor ? -mateScore + ply : mateScore - ply;
  if (game.isDraw()) return 0;
  if (depth === 0) return evaluate(game, aiColor);

  const maximizing = game.turn() === aiColor;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of orderedMoves(game)) {
    game.move({ from: move.from, to: move.to, promotion: move.promotion });
    const score = search(game, depth - 1, alpha, beta, aiColor, ply + 1);
    game.undo();
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseAiMove(fen: string, difficulty: AiDifficulty): Move | null {
  const game = new Chess(fen);
  const aiColor = game.turn();
  const depthByDifficulty: Record<AiDifficulty, number> = { easy: 1, medium: 2, hard: 3 };
  const depth = depthByDifficulty[difficulty];
  const candidates = orderedMoves(game).map(move => {
    game.move({ from: move.from, to: move.to, promotion: move.promotion });
    const score = search(game, depth - 1, -Infinity, Infinity, aiColor, 1);
    game.undo();
    return { move, score };
  });
  if (!candidates.length) return null;

  const best = Math.max(...candidates.map(candidate => candidate.score));
  const margin = difficulty === 'easy' ? 180 : difficulty === 'medium' ? 30 : 0;
  const goodMoves = candidates.filter(candidate => candidate.score >= best - margin);
  return goodMoves[Math.floor(Math.random() * goodMoves.length)].move;
}
