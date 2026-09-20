import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { pgn } = await req.json();
    if (!pgn) return NextResponse.json({ error: 'PGN wajib diisi' }, { status: 400 });

    // 1. Send PGN to Lichess Auto-Import & Analysis Engine
    const bodyParams = new URLSearchParams();
    bodyParams.append('pgn', pgn);
    bodyParams.append('analyse', 'true');

    const importRes = await fetch('https://lichess.org/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    if (!importRes.ok) {
      return NextResponse.json({ error: 'Gagal menganalisis PGN di Lichess' }, { status: 500 });
    }

    const importData = await importRes.json();
    const gameId = importData.id; // Dapat ID game Lichess

    // 2. Fetch hasil analisis Stockfish resmi dari Lichess
    const analysisRes = await fetch(`https://lichess.org/game/export/${gameId}?evals=true&analysed=true`, {
      headers: { 'Accept': 'application/json' },
    });

    const gameData = await analysisRes.json();

    // 3. Extract Akurasi (ACPL) & Stats Langkah
    const players = gameData.players || {};
    const whiteAcpl = players.white?.analysis?.acpl ?? 30;
    const blackAcpl = players.black?.analysis?.acpl ?? 30;

    // Convert ACPL ke Persentase Akurasi Standar Lichess/Chess.com
    const accWhite = Math.max(15, Math.min(99, 103.16 * Math.exp(-0.035 * whiteAcpl))).toFixed(1);
    const accBlack = Math.max(15, Math.min(99, 103.16 * Math.exp(-0.035 * blackAcpl))).toFixed(1);

    const analysisMoves = gameData.analysis || [];

    return NextResponse.json({
      success: true,
      lichessUrl: importData.url,
      accuracy: {
        white: Number(accWhite),
        black: Number(accBlack),
      },
      stats: {
        white: players.white?.analysis || { inaccuracy: 0, mistake: 0, blunder: 0 },
        black: players.black?.analysis || { inaccuracy: 0, mistake: 0, blunder: 0 },
      },
      evals: analysisMoves.map((m: any, idx: number) => ({
        moveNumber: Math.floor(idx / 2) + 1,
        eval: m.eval !== undefined ? m.eval / 100 : (m.mate ? `M${m.mate}` : 0),
        judgment: m.judgment?.name || 'Best', // Inaccuracy, Mistake, Blunder
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
