'use client';

import React, { useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
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
    <main style={{ minHeight: '100vh', backgroundColor: '#0b0e14', color: '#f8fafc', fontFamily: 'sans-serif', padding: '16px' }}>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #1e293b', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#f59e0b', fontWeight: 900, fontSize: '20px' }}>♟</span>
            <h1 style={{ fontWeight: 800, fontSize: '14px', margin: 0, color: '#fff' }}>
              CHESSIGMA <span style={{ color: '#f59e0b' }}>ANALYZER</span>
            </h1>
          </div>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
            NEXT.JS
          </span>
        </header>

        {/* Input Form */}
        <div style={{ background: '#121621', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>
            Cari Game Chess.com
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ flex: 1, background: '#020617', border: '1px solid #1e293b', borderRadius: '12px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: '#fff', outline: 'none' }}
            />
            <button
              onClick={fetchGameHistory}
              disabled={loading}
              style={{ padding: '8px 16px', background: '#f59e0b', color: '#000', fontWeight: 800, fontSize: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Search style={{ width: '14px', height: '14px' }} /> Cari
            </button>
          </div>
          {statusText && <p style={{ fontSize: '12px', color: '#fb7185', fontStyle: 'italic', marginTop: '8px' }}>{statusText}</p>}
        </div>

        {/* List Game */}
        {games.length > 0 && !selectedGame && (
          <div style={{ background: '#121621', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#cbd5e1', display: 'block', borderBottom: '1px solid #1e293b', paddingBottom: '8px', marginBottom: '12px' }}>
              10 Match Terbaru
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {games.map((g, idx) => {
                const isWhite = g.white.username.toLowerCase() === username.toLowerCase();
                const myData = isWhite ? g.white : g.black;
                const opponent = isWhite ? g.black : g.white;

                return (
                  <div key={idx} style={{ background: '#020617', padding: '12px', borderRadius: '12px', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                        {myData.result.toUpperCase()}
                      </span>
                      <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff', margin: '4px 0 0 0' }}>vs {opponent.username} ({opponent.rating})</p>
                    </div>
                    <button
                      onClick={() => analyzeGame(g)}
                      style={{ padding: '6px 12px', background: '#f59e0b', color: '#000', fontWeight: 'bold', fontSize: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
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
          <div style={{ background: '#121621', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px', textAlign: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>Menghitung Evaluasi... ({progress}%)</span>
            <div style={{ width: '100%', height: '8px', background: '#020617', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#f59e0b', width: `${progress}%`, transition: 'width 0.15s ease' }} />
            </div>
          </div>
        )}

        {/* Board & Accuracy */}
        {selectedGame && !analyzing && (
          <div style={{ background: '#121621', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px' }}>
            <button onClick={() => setSelectedGame(null)} style={{ background: 'none', border: 'none', color: '#fbbf24', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>
              ← Kembali ke daftar game
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ background: '#020617', padding: '12px', borderRadius: '12px', border: '1px solid #1e293b' }}>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748b', display: 'block' }}>AKURASI PUTIH</span>
                <span style={{ fontSize: '20px', fontWeight: 900, color: '#34d399' }}>{accWhite}%</span>
              </div>
              <div style={{ background: '#020617', padding: '12px', borderRadius: '12px', border: '1px solid #1e293b' }}>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748b', display: 'block' }}>AKURASI HITAM</span>
                <span style={{ fontSize: '20px', fontWeight: 900, color: '#34d399' }}>{accBlack}%</span>
              </div>
            </div>

            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b', marginBottom: '16px' }}>
              <Chessboard
                position={reviewChess.fen()}
                customSquareStyles={customSquareStyles}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => goToMove(-1)} style={{ flex: 1, padding: '10px 0', background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RotateCcw style={{ width: '16px', height: '16px' }} />
              </button>
              <button onClick={() => goToMove(currentMoveIdx - 1)} style={{ flex: 1, padding: '10px 0', background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft style={{ width: '16px', height: '16px' }} />
              </button>
              <button onClick={() => goToMove(currentMoveIdx + 1)} style={{ flex: 1, padding: '10px 0', background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
