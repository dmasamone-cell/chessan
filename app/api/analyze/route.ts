import { NextResponse } from 'next/server';
import { Chess } from 'chess.js';

// Formula Sigmoid Resmi Chess.com / Lichess (Win Expectancy)
function getWinPercent(evalCp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * evalCp)) - 1);
}

// Fetch Cloud Eval dari Lichess API (Stockfish Cloud Engine)
async function getFenEval(fen: string): Promise<number> {
  try {
    const res = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`, {
      headers: { 'User-Agent': 'ChessigmaApp/1.0' },
      cache: 'force-cache'
    });
    
    if (!res.ok) return 0;
    const data = await res.json();
    
    if (data && data.pvs && data.pvs[0]) {
      if (data.pvs[0].cp !== undefined) {
        return data.pvs[0].cp; // Centipawns
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
    const loaded = chess.load_pgn(pgn);
    if (!loaded) return NextResponse.json({ error: 'Format PGN tidak valid' }, { status: 400 });

    const history = chess.history({ verbose: true });
    chess.reset();

    let prevEvalCp = 20; // Posisi awal (+0.2 untuk putih)

    const movesAnalysis = [];
    const stats = {
      w: { brilliant: 0, best: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, totalWinLoss: 0, count: 0 },
      b: { brilliant: 0, best: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, totalWinLoss: 0, count: 0 },
    };

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const side = move.color as 'w' | 'b';

      // Deteksi Pengorbanan (Sacrifice)
      const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
      const isSacrifice = move.captured && pieceValues[move.piece] > pieceValues[move.captured];

      chess.move(move);
      const currentFen = chess.fen();
      let currentEvalCp = await getFenEval(currentFen);

      // Hitung evaluasi dari sudut pandang pemain yang melangkah
      const sideEvalBefore = side === 'w' ? prevEvalCp : -prevEvalCp;
      const sideEvalAfter = side === 'w' ? currentEvalCp : -currentEvalCp;

      const prevWinChance = getWinPercent(sideEvalBefore);
      const currentWinChance = getWinPercent(sideEvalAfter);
      
      const winChanceLoss = Math.max(0, prevWinChance - currentWinChance);

      stats[side].totalWinLoss += winChanceLoss;
      stats[side].count++;

      let type: 'brilliant' | 'best' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder' = 'best';

      // Kategori Langkah Standar Chess.com
      if (i < 8 && winChanceLoss <= 2) {
        // Early Game / Book Moves
        type = 'book';
        stats[side].book++;
      } else if (isSacrifice && winChanceLoss <= 3) {
        type = 'brilliant';
        stats[side].brilliant++;
      } else if (winChanceLoss <= 2) {
        type = 'best';
        stats[side].best++;
      } else if (winChanceLoss <= 6) {
        type = 'good';
        stats[side].good++;
      } else if (winChanceLoss <= 12) {
        type = 'inaccuracy';
        stats[side].inaccuracy++;
      } else if (winChanceLoss <= 22) {
        type = 'mistake';
        stats[side].mistake++;
      } else if (sideEvalBefore >= 150 && winChanceLoss > 25) {
        // Posisi sudah sangat menang (+1.50) tapi dilewatkan
        type = 'miss';
        stats[side].miss++;
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
        fen: currentFen,
        evalCp: currentEvalCp,
        winChanceLoss: Number(winChanceLoss.toFixed(2)),
        type,
      });

      prevEvalCp = currentEvalCp;
    }

    // Perhitungan Akurasi CAPS2 Kalibrasi Chess.com
    const avgLossW = stats.w.count > 0 ? stats.w.totalWinLoss / stats.w.count : 0;
    const avgLossB = stats.b.count > 0 ? stats.b.totalWinLoss / stats.b.count : 0;

    const accuracyWhite = Math.max(10, Math.min(99, 100 * Math.exp(-0.038 * avgLossW))).toFixed(1);
    const accuracyBlack = Math.max(10, Math.min(99, 100 * Math.exp(-0.038 * avgLossB))).toFixed(1);

    return NextResponse.json({
      success: true,
      accuracy: {
        white: Number(accuracyWhite),
        black: Number(accuracyBlack),
      },
      stats: {
        white: stats.w,
        black: stats.b,
      },
      totalMoves: history.length,
      moves: movesAnalysis,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
 