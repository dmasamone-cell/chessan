'use client';

import React, { useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard/react-chessboard';
import { Search, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

interface GameItem {
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
  pgn: string;
  time_class: string;
}

interface AnalyzedMove {
  san: string;
  from: string;
  to: string;
  evalScore: number;
  type: 'brilliant' | 'best' | 'inaccuracy' | 'mistake' | 'blunder';
}

export default function Page() {
  const [username, setUsername] = useState('');
  const [games, setGames] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);
  const [analyzedMoves, setAnalyzedMoves] = useState<AnalyzedMove[]>([]);
  const [accWhite, setAccWhite] = useState<string>('--');
  const [accBlack, setAccBlack] = useState<string>('--');

  const [currentMoveIdx, setCurrentMoveIdx] = useState(-1);
  const [reviewChess, setReviewChess] = useState(new Chess());

  // Fetch Game dari Chess.com API
  async function fetchGameHistory() {
    if (!username.trim()) return alert('Masukkan username Chess.com!');
    setLoading(true);
    setStatusText('Mengambil riwayat game...');
    setGames([]);
    setSelectedGame(null);

    try {
      const archivesRes = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`);
      const archivesData = await archivesRes.json();

      if (!archivesData.archives || archivesData.archives.length === 0) {
        throw new Error('User tidak ditemukan.');
      }

      const lastArchiveUrl = archivesData.archives[archivesData.archives.length - 1];
      const gamesRes = await fetch(lastArchiveUrl);
      const gamesData = await gamesRes.json();

      if (!gamesData.games || gamesData.games.length === 0) {
        throw new Error('Tidak ada game di bulan ini.');
      }

      const recentGames = gamesData.games.slice(-10).reverse();
      setGames(recentGames);
      setStatusText('');
    } catch (err: any) {
      setStatusText(err.message || 'Gagal mengambil data.');
    } finally {
      setLoading(false);
    }
  }

  // Evaluator via Lichess Cloud API
  async function fetchEval(fen: string): Promise<number> {
    try {
      const res = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`);
      if (!res.ok) return 0;
      const data = await res.json();
      if (data && data.pvs && data.pvs[0]) {
        if (data.pvs[0].cp !== undefined) return data.pvs[0].cp / 100;
        if (data.pvs[0].mate !== undefined) return data.pvs[0].mate > 0 ? 10 : -10;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  // Analisis Game
  async function analyzeGame(g: GameItem) {
    setSelectedGame(g);
    setAnalyzing(true);
    setProgress(0);

    const tempChess = new Chess();
    tempChess.load_pgn(g.pgn);
    const history = tempChess.history({ verbose: true });

    tempChess.reset();
    let prevEval = 0.2;
    const movesResult: AnalyzedMove[] = [];
    const counts = { w: { loss: 0 }, b: { loss: 0 } };

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const side = move.color as 'w' | 'b';

      const pieceVals: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
      const isSacrifice = move.captured && pieceVals[move.piece] > pieceVals[move.captured];

      tempChess.move(move);
      const currentEval = await fetchEval(tempChess.fen());
      const evalLoss = side === 'w' ? prevEval - currentEval : currentEval - prevEval;

      let type: 'brilliant' | 'best' | 'inaccuracy' | 'mistake' | 'blunder' = 'best';

      if (isSacrifice && evalLoss <= 0.3) {
        type = 'brilliant';
      } else if (evalLoss <= 0.35) {
        type = 'best';
      } else if (evalLoss <= 0.9) {
        type = 'inaccuracy';
      } else if (evalLoss <= 2.2) {
        type = 'mistake';
      } else {
        type = 'blunder';
      }

      counts[side].loss += Math.max(0, evalLoss);
      movesResult.push({
        san: move.san,
        from: move.from,
        to: move.to,
        evalScore: currentEval,
        type,
      });

      prevEval = currentEval;
      setProgress(Math.round(((i + 1) / history.length) * 100));
      await new Promise((r) => setTimeout(r, 20));
    }

    const movesW = Math.max(1, Math.ceil(history.length / 2));
    const movesB = Math.max(1, Math.floor(history.length / 2));

    setAccWhite(Math.max(25, Math.min(98.5, 100 * Math.exp(-1.1 * (counts.w.loss / movesW)))).toFixed(1));
    setAccBlack(Math.max(25, Math.min(98.5, 100 * Math.exp(-1.1 * (counts.b.loss / movesB)))).toFixed(1));
    setAnalyzedMoves(movesResult);

    setReviewChess(new Chess());
    setCurrentMoveIdx(-1);
    setAnalyzing(false);
  }

  function goToMove(idx: number) {
    if (!selectedGame) return;
    const c = new Chess();
    c.load_pgn(selectedGame.pgn);
    const history = c.history({ verbose: true });

    const newChess = new Chess();
    for (let i = 0; i <= idx; i++) {
      if (history[i]) newChess.move(history[i]);
    }
    setReviewChess(newChess);
    setCurrentMoveIdx(idx);
  }

  const currentMove = currentMoveIdx >= 0 ? analyzedMoves[currentMoveIdx] : null;
  const customSquareStyles: Record<string, React.CSSProperties> = {};

  if (currentMove) {
    const badgeColors: Record<string, string> = {
      brilliant: '#06b6d4',
      best: '#10b981',
      inaccuracy: '#f59e0b',
      mistake: '#f97316',
      blunder: '#ef4444',
    };

    customSquareStyles[currentMove.to] = {
      backgroundColor: badgeColors[currentMove.type] + 'aa',
      borderRadius: '8px',
    };
  }

  return (
    <main className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans p-4">
      <div className="max-w-md mx-auto space-y-5">
        
        {/* Header */}
        <header className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-amber-500 font-black text-xl">♟</span>
            <h1 className="font-extrabold text-sm tracking-tight text-white">
              CHESSIGMA <span className="text-amber-500">ANALYZER</span>
            </h1>
          </div>
          <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
            NEXT.JS
          </span>
        </header>

        {/* Input Form */}
        <div className="bg-[#121621] border border-slate-800 rounded-2xl p-4 space-y-3">
          <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-widest block">
            Cari Game Chess.com
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={fetchGameHistory}
              disabled={loading}
              className="px-4 py-2 bg-amber-500 text-black font-extrabold text-xs rounded-xl flex items-center gap-1"
            >
              <Search className="w-3.5 h-3.5" /> Cari
            </button>
          </div>
          {statusText && <p className="text-xs text-rose-400 italic">{statusText}</p>}
        </div>

        {/* List Game */}
        {games.length > 0 && !selectedGame && (
          <div className="bg-[#121621] border border-slate-800 rounded-2xl p-4 space-y-3">
            <span className="text-xs font-bold text-slate-300 block border-b border-slate-800 pb-2">
              10 Match Terbaru
            </span>
            <div className="space-y-2">
              {games.map((g, idx) => {
                const isWhite = g.white.username.toLowerCase() === username.toLowerCase();
                const myData = isWhite ? g.white : g.black;
                const opponent = isWhite ? g.black : g.white;

                return (
                  <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                        {myData.result.toUpperCase()}
                      </span>
                      <p className="text-xs font-bold text-white mt-1">vs {opponent.username} ({opponent.rating})</p>
                    </div>
                    <button
                      onClick={() => analyzeGame(g)}
                      className="px-3 py-1.5 bg-amber-500 text-black font-bold text-xs rounded-lg"
                    >
                      Analisis ⚡
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress */}
        {analyzing && (
          <div className="bg-[#121621] border border-slate-800 rounded-2xl p-4 space-y-2 text-center">
            <span className="text-xs font-mono text-slate-400">Menghitung Evaluasi... ({progress}%)</span>
            <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 transition-all duration-150" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Board & Accuracy */}
        {selectedGame && !analyzing && (
          <div className="bg-[#121621] border border-slate-800 rounded-2xl p-4 space-y-4">
            <button onClick={() => setSelectedGame(null)} className="text-xs text-amber-400 font-bold">
              ← Kembali ke daftar game
            </button>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] font-mono text-slate-500 block">AKURASI PUTIH</span>
                <span className="text-xl font-black text-emerald-400">{accWhite}%</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] font-mono text-slate-500 block">AKURASI HITAM</span>
                <span className="text-xl font-black text-emerald-400">{accBlack}%</span>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-800">
              <Chessboard
                position={reviewChess.fen()}
                customSquareStyles={customSquareStyles}
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => goToMove(-1)} className="flex-1 py-2.5 bg-slate-800 rounded-xl flex items-center justify-center">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={() => goToMove(currentMoveIdx - 1)} className="flex-1 py-2.5 bg-slate-800 rounded-xl flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => goToMove(currentMoveIdx + 1)} className="flex-1 py-2.5 bg-slate-800 rounded-xl flex items-center justify-center">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
