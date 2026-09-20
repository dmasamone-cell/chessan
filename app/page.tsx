  // Fungsi konversi Centipawns ke Win Percentage (Rumus resmi Lichess/Chess.com)
  function evalToWinPercent(evalCp: number): number {
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * (evalCp * 100))) - 1);
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
    
    let totalWinPercentLossW = 0;
    let totalWinPercentLossB = 0;
    let countW = 0;
    let countB = 0;

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const side = move.color as 'w' | 'b';

      const pieceVals: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
      const isSacrifice = move.captured && pieceVals[move.piece] > pieceVals[move.captured];

      tempChess.move(move);
      const currentEval = await fetchEval(tempChess.fen());

      // Hitung Penurunan Win Chance (%)
      const prevWinPct = evalToWinPercent(side === 'w' ? prevEval : -prevEval);
      const currentWinPct = evalToWinPercent(side === 'w' ? currentEval : -currentEval);
      const winPctLoss = Math.max(0, prevWinPct - currentWinPct);

      if (side === 'w') {
        totalWinPercentLossW += winPctLoss;
        countW++;
      } else {
        totalWinPercentLossB += winPctLoss;
        countB++;
      }

      const evalLoss = side === 'w' ? prevEval - currentEval : currentEval - prevEval;
      let type: 'brilliant' | 'best' | 'inaccuracy' | 'mistake' | 'blunder' = 'best';

      if (isSacrifice && evalLoss <= 0.3) {
        type = 'brilliant';
      } else if (winPctLoss <= 3) {
        type = 'best';
      } else if (winPctLoss <= 10) {
        type = 'inaccuracy';
      } else if (winPctLoss <= 20) {
        type = 'mistake';
      } else {
        type = 'blunder';
      }

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

    // Hitung Rata-rata Akurasi Presisi
    const avgLossW = countW > 0 ? totalWinPercentLossW / countW : 0;
    const avgLossB = countB > 0 ? totalWinPercentLossB / countB : 0;

    // Formula Akurasi Realistis (100 - (avg_loss * 1.5))
    const finalAccW = Math.max(10, Math.min(100, 100 - avgLossW * 1.8)).toFixed(1);
    const finalAccB = Math.max(10, Math.min(100, 100 - avgLossB * 1.8)).toFixed(1);

    setAccWhite(finalAccW);
    setAccBlack(finalAccB);
    setAnalyzedMoves(movesResult);

    setReviewChess(new Chess());
    setCurrentMoveIdx(-1);
    setAnalyzing(false);
  }
