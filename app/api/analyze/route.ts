import { NextResponse } from 'next/server';
import { Chess } from 'chess.js';

// Rumus CAPS / Win Percentage resmi Lichess & Chess.com
function getWinPercent(evalCp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * evalCp)) - 1);
}

// Fetch Cloud Evaluation dari Lichess API
async function getFenEval(fen: string): Promise<number> {
  try {
    const res = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`, {
      headers: { 'User-Agent': 'ChessigmaApp/1.0' },
      next: { revalidate: 3600 }
    });
    
    if (!res.ok) return 0;
    const data = await res.json();
    
    if (data && data.pvs && data.pvs[0]) {
      if (data.pvs[0].cp !== undefined) {
        return data.pvs[0].cp; // Nilai centipawns (-1000 s/d +1000)
      }
      if (data.pvs[0].mate !== undefined) {
        return data.pvs[0].mate > 0 ? 1000 : -1000;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function POST(req: Request) {
  try {
    const { pgn } = await req.json();
    if (!pgn) return NextResponse.json({ error: 'PGN wajib diisi' }, { status: 400 });

    const chess = new Chess();
    chess.load_pgn(pgn);
    const history = chess.history({ verbose: true });

    chess.reset();
    let prevEvalCp = 20; // Evaluasi posisi awal (putih sedikit unggul)

    const movesAnalysis = [];
    const stats = {
      w: { brilliant: 0, best: 0, inaccuracy: 0, mistake: 0, blunder: 0, totalWinLoss: 0, count: 0 },
      b: { brilliant: 0, best: 0, inaccuracy: 0, mistake: 0, blunder: 0, totalWinLoss: 0, count: 0 },
    };

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const side = move.color as 'w' | 'b';

      // Nilai perwira untuk deteksi pengorbanan (Sacrifice / Brilliant)
      const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
      const isSacrifice = move.captured && pieceValues[move.piece] > pieceValues[move.captured];

      chess.move(move);
      const currentFen = chess.fen();
      let currentEvalCp = await getFenEval(currentFen);

      // Sesuaikan perspektif giliran
      const sideEvalBefore = side === 'w' ? prevEvalCp : -prevEvalCp;
      const sideEvalAfter = side === 'w' ? currentEvalCp : -currentEvalCp;

      const prevWinChance = getWinPercent(sideEvalBefore);
      const currentWinChance = getWinPercent(sideEvalAfter);
      const winChanceLoss = Math.max(0, prevWinChance - currentWinChance);

      stats[side].totalWinLoss += winChanceLoss;
      stats[side].count++;

      let type: 'brilliant' | 'best' | 'inaccuracy' | 'mistake' | 'blunder' = 'best';

      // Klasifikasi Langkah Keras
      if (isSacrifice && winChanceLoss <= 3) {
        type = 'brilliant';
        stats[side].brilliant++;
      } else if (winChanceLoss <= 3) {
        type = 'best';
        stats[side].best++;
      } else if (winChanceLoss <= 10) {
        type = 'inaccuracy';
        stats[side].inaccuracy++;
      } else if (winChanceLoss <= 22) {
        type = 'mistake';
        stats[side].mistake++;
      } else {
        type = 'blunder';
        stats[side].blunder++;
      }

      movesAnalysis.push({
        moveNumber: Math.floor(i / 2) + 1,
        color: side,
        san: move.san,
        from: move.from,
        to: move.to,
        evalCp: currentEvalCp,
        winChanceLoss: Number(winChanceLoss.toFixed(2)),
        type,
      });

      prevEvalCp = currentEvalCp;
    }

    // Kalkulasi Akurasi CAPS2
    const avgLossW = stats.w.count > 0 ? stats.w.totalWinLoss / stats.w.count : 0;
    const avgLossB = stats.b.count > 0 ? stats.b.totalWinLoss / stats.b.count : 0;

    // Formula penalti eksponensial biar akurasi riil (gak 90%+ melulu)
    const accuracyWhite = Math.max(12, Math.min(99, 103.16 * Math.exp(-0.0435 * avgLossW))).toFixed(1);
    const accuracyBlack = Math.max(12, Math.min(99, 103.16 * Math.exp(-0.0435 * avgLossB))).toFixed(1);

    return NextResponse.json({
      success: true,
      accuracy: {
        white: Number(accuracyWhite),
        black: Number(accuracyBlack),
      },
      stats: {
        white: {
          brilliant: stats.w.brilliant,
          best: stats.w.best,
          inaccuracy: stats.w.inaccuracy,
          mistake: stats.w.mistake,
          blunder: stats.w.blunder,
        },
        black: {
          brilliant: stats.b.brilliant,
          best: stats.b.best,
          inaccuracy: stats.b.inaccuracy,
          mistake: stats.b.mistake,
          blunder: stats.b.blunder,
        },
      },
      totalMoves: history.length,
      moves: movesAnalysis,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
