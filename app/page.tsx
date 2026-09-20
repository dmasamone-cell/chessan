'use client';

import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX, Trophy, RotateCcw, UserSearch } from 'lucide-react';

interface PuzzleData {
  id: string;
  fen: string;
  solution: string[];
  rating: number;
  themes: string[];
}

export default function HomePage() {
  const [chess, setChess] = useState<Chess>(new Chess());
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [solutionIdx, setSolutionIdx] = useState(0);
  const [puzzleStatus, setPuzzleStatus] = useState<'playing' | 'success' | 'failed'>('playing');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Selesaikan puzzle hari ini!');

  // Sound FX Generator via Web Audio API
  const playSound = (type: 'move' | 'capture' | 'win' | 'wrong') => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'move') {
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'capture') {
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'win') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {
      // Audio context fallback
    }
  };

  // Fetch Daily Puzzle dari Lichess
  async function fetchDailyPuzzle() {
    setStatusMessage('Mengambil Puzzle Harian...');
    try {
      const res = await fetch('https://lichess.org/api/puzzle/daily');
      const data = await res.json();

      const newChess = new Chess(data.puzzle.fen);
      
      setChess(newChess);
      setPuzzle({
        id: data.puzzle.id,
        fen: data.puzzle.fen,
        solution: data.puzzle.solution,
        rating: data.puzzle.rating,
        themes: data.puzzle.themes,
      });
      setSolutionIdx(0);
      setPuzzleStatus('playing');
      setStatusMessage(`Puzzle Rating: ${data.puzzle.rating} | Cari langkah terbaik!`);
    } catch {
      setStatusMessage('Gagal memuat puzzle. Coba lagi!');
    }
  }

  useEffect(() => {
    fetchDailyPuzzle();
  }, []);

  // Handle Gerakan Bidak
  function makeAMove(move: any) {
    if (puzzleStatus !== 'playing' || !puzzle) return false;

    try {
      const copyChess = new Chess(chess.fen());
      const result = copyChess.move(move);

      if (!result) return false;

      const moveUci = `${result.from}${result.to}${result.promotion || ''}`;
      const expectedUci = puzzle.solution[solutionIdx];

      if (moveUci === expectedUci) {
        setChess(copyChess);
        const nextIdx = solutionIdx + 1;

        if (result.captured) playSound('capture');
        else playSound('move');

        if (nextIdx >= puzzle.solution.length) {
          setPuzzleStatus('success');
          setStatusMessage('🎉 Luar Biasa! Puzzle Selesai!');
          playSound('win');
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        } else {
          setSolutionIdx(nextIdx + 1);
          setTimeout(() => {
            const botMoveUci = puzzle.solution[nextIdx];
            const botFrom = botMoveUci.slice(0, 2);
            const botTo = botMoveUci.slice(2, 4);
            const botPromotion = botMoveUci.length > 4 ? botMoveUci[4] : undefined;

            copyChess.move({ from: botFrom, to: botTo, promotion: botPromotion });
            setChess(new Chess(copyChess.fen()));
            playSound('move');
          }, 400);
        }
        return true;
      } else {
        playSound('wrong');
        setStatusMessage('❌ Langkah Kurang Tepat! Coba lagi.');
        return false;
      }
    } catch {
      return false;
    }
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    return makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#f8fafc', fontFamily: 'sans-serif', padding: '16px' }}>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>

        {/* Top Navbar */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #1e293b', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🧩</span>
            <div>
              <h1 style={{ fontWeight: 900, fontSize: '16px', margin: 0, color: '#fff', letterSpacing: '0.5px' }}>
                CHESS<span style={{ color: '#f59e0b' }}>PULSE</span>
              </h1>
              <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Daily Puzzle & Soundboard</span>
            </div>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', color: '#fff', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            {soundEnabled ? <Volume2 style={{ width: '18px', height: '18px', color: '#34d399' }} /> : <VolumeX style={{ width: '18px', height: '18px', color: '#ef4444' }} />}
          </button>
        </header>

        {/* Banner Fitur Profil / Chess Wrapped */}
        <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)', border: '1px solid #4338ca', borderRadius: '16px', padding: '14px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '1px' }}>Fitur Baru</span>
            <h2 style={{ fontSize: '13px', fontWeight: 800, margin: '2px 0 0 0', color: '#fff' }}>Cek Stats & Gaya Main Kamu</h2>
          </div>
          <a
            href="/profile"
            style={{ padding: '8px 12px', background: '#6366f1', color: '#fff', fontWeight: 800, fontSize: '11px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <UserSearch style={{ width: '14px', height: '14px' }} /> Cek Stats
          </a>
        </div>

        {/* Daily Puzzle Card */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '20px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trophy style={{ width: '16px', height: '16px', color: '#f59e0b' }} />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#cbd5e1' }}>Puzzle Harian</span>
            </div>
            {puzzle && (
              <span style={{ fontSize: '10px', fontFamily: 'monospace', background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold' }}>
                Rating {puzzle.rating}
              </span>
            )}
          </div>

          <p style={{ fontSize: '12px', color: puzzleStatus === 'success' ? '#34d399' : (puzzleStatus === 'failed' ? '#ef4444' : '#94a3b8'), fontWeight: 600, margin: '0 0 12px 0', textAlign: 'center' }}>
            {statusMessage}
          </p>

          {/* Papan Catur Interactive */}
          <div style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid #1e293b', marginBottom: '12px' }}>
            <Chessboard
              position={chess.fen()}
              onPieceDrop={onDrop}
              customBoardStyle={{ borderRadius: '8px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchDailyPuzzle}
              style={{ flex: 1, padding: '10px', background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <RotateCcw style={{ width: '14px', height: '14px' }} /> Reset Puzzle
            </button>
          </div>
        </div>

        {/* Category Badges */}
        {puzzle?.themes && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {puzzle.themes.map((t, idx) => (
              <span key={idx} style={{ fontSize: '10px', background: '#1e293b', color: '#94a3b8', padding: '4px 8px', borderRadius: '6px', fontFamily: 'monospace' }}>
                #{t}
              </span>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
