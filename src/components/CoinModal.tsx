import React, { useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, ExternalLink } from 'lucide-react';
import type { AuditedCoin, Position } from '../shared/types.ts';
import { fmtPrice, fmtUsd, type Lang, T } from '../lib/i18n.ts';

interface CoinModalProps {
  position?: Position;
  coin?: AuditedCoin;
  lang: Lang;
  onClose: () => void;
  onOpenAudit: (mint: string) => void;
  onSell: (mint: string, pct: number) => Promise<void>;
  onBuy: (mint: string) => Promise<void>;
}

export const CoinModal: React.FC<CoinModalProps> = ({
  position,
  coin,
  lang,
  onClose,
  onOpenAudit,
  onSell,
  onBuy,
}) => {
  const t = T[lang];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sellSheetOpen, setSellSheetOpen] = useState(false);
  const [sellPct, setSellPct] = useState<number>(50);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const symbol = position?.symbol || coin?.symbol || '';
  const name = position?.name || coin?.name || '';
  const mint = position?.mint || coin?.mint || '';
  const price = position?.currentPrice ?? coin?.priceUsd ?? 0;
  const ageMin = position?.ageMin ?? coin?.ageMin ?? 0;
  const layersPassed = position?.layersPassed ?? coin?.layersPassed ?? 0;
  const liquidityUsd = position?.liquidityUsd ?? coin?.liquidityUsd ?? 0;
  const marketCapUsd = position?.marketCapUsd ?? coin?.marketCapUsd ?? 0;
  const holders = position?.holders ?? coin?.holders ?? 0;
  const fomoUrl = position?.fomoUrl || coin?.fomoUrl || '#';
  const candles = position?.candles || coin?.candles || [];

  const ageStr = ageMin >= 60 ? `${Math.round(ageMin / 60)}h old` : `${ageMin}m old`;

  // Draw 1-minute candlesticks on <canvas> with orange dashed stop/exit line (STEP 10)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth || 440;
    const height = 190;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    if (position) {
      lows.push(position.stopPrice);
      highs.push(position.takeProfitPrice * 0.92);
    }
    const maxP = Math.max(...highs) * 1.03;
    const minP = Math.min(...lows) * 0.97;
    const span = Math.max(1e-9, maxP - minP);
    const padY = 14;
    const yOf = (val: number) => padY + ((maxP - val) / span) * (height - padY * 2);

    const stepX = (width - 16) / Math.max(1, candles.length);
    const bodyW = Math.max(3, Math.min(10, stepX * 0.62));

    candles.forEach((c, idx) => {
      const cx = 8 + idx * stepX + stepX / 2;
      const isUp = c.close >= c.open;
      const color = isUp ? '#00d35a' : '#ff453a';

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(cx, yOf(c.high));
      ctx.lineTo(cx, yOf(c.low));
      ctx.stroke();

      const top = yOf(Math.max(c.open, c.close));
      const bot = yOf(Math.min(c.open, c.close));
      ctx.fillStyle = color;
      ctx.fillRect(cx - bodyW / 2, top, bodyW, Math.max(2, bot - top));
    });

    // Orange dashed exit/stop line (STEP 10)
    if (position) {
      const stopY = yOf(position.stopPrice);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#ff9f0a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4, stopY);
      ctx.lineTo(width - 4, stopY);
      ctx.stroke();
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#ff9f0a';
      ctx.fillText(`Stop -25% (${fmtPrice(position.stopPrice)})`, 8, Math.max(14, stopY - 5));
      ctx.restore();
    }
  }, [candles, position]);

  const handleConfirmSell = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onSell(mint, sellPct);
      setSellSheetOpen(false);
      if (sellPct >= 99) onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sell failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBuyNow = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onBuy(mint);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Buy failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[#1c1c1e] rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-5 pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white">{symbol}</h2>
              <button
                type="button"
                onClick={() => onOpenAudit(mint)}
                className="inline-flex items-center gap-1 text-xs font-mono-num font-semibold text-[#00d35a] hover:underline cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{layersPassed}/8</span>
              </button>
            </div>
            <p className="text-xs text-[rgba(235,235,245,0.6)] mt-0.5">
              {name} · Solana · {ageStr}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#2c2c2e] flex items-center justify-center text-white cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Big Price + Delta */}
        <div className="mt-4">
          <div className="text-3xl font-bold font-mono-num text-white">{fmtPrice(price)}</div>
          {position ? (
            <div
              className={`text-sm font-mono-num font-medium mt-1 ${
                position.pnlUsd >= 0 ? 'text-[#00d35a]' : 'text-[#ff453a]'
              }`}
            >
              {position.pnlPct >= 0 ? '▲' : '▼'} {Math.abs(position.pnlPct).toFixed(1)}% since entry (
              {position.pnlUsd >= 0 ? '+' : ''}
              {fmtUsd(position.pnlUsd)})
            </div>
          ) : (
            coin && (
              <div
                className={`text-sm font-mono-num font-medium mt-1 ${
                  coin.h1ChangePct >= 0 ? 'text-[#00d35a]' : 'text-[#ff453a]'
                }`}
              >
                {coin.h1ChangePct >= 0 ? '▲' : '▼'} {Math.abs(coin.h1ChangePct)}% (1h) · {coin.h24ChangePct >= 0 ? '+' : ''}
                {coin.h24ChangePct}% (24h)
              </div>
            )
          )}
        </div>

        {/* 1m Candlestick Canvas */}
        <div className="mt-4 bg-black rounded-2xl p-2.5 border border-[rgba(84,84,88,0.4)]">
          <canvas ref={canvasRef} className="w-full h-[190px] block" />
        </div>

        {/* Market Cap / Liquidity / Holders */}
        <div className="mt-4 grid grid-cols-3 gap-3 py-3 border-y border-[rgba(84,84,88,0.45)] text-center">
          <div>
            <div className="text-[11px] text-[rgba(235,235,245,0.55)]">Market cap</div>
            <div className="text-sm font-semibold font-mono-num text-white mt-0.5">{fmtUsd(marketCapUsd, 0)}</div>
          </div>
          <div>
            <div className="text-[11px] text-[rgba(235,235,245,0.55)]">Liquidity</div>
            <div className="text-sm font-semibold font-mono-num text-white mt-0.5">{fmtUsd(liquidityUsd, 0)}</div>
          </div>
          <div>
            <div className="text-[11px] text-[rgba(235,235,245,0.55)]">Holders</div>
            <div className="text-sm font-semibold font-mono-num text-white mt-0.5">{holders.toLocaleString()}</div>
          </div>
        </div>

        {/* Your Position Details */}
        {position && (
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[rgba(235,235,245,0.6)]">Your position</span>
              <span className="font-mono-num font-semibold text-white">
                {fmtUsd(position.sizeUsd)} in · Executor ({position.strat})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[rgba(235,235,245,0.6)]">Entry / Stop / Take</span>
              <span className="font-mono-num text-[rgba(235,235,245,0.85)]">
                {fmtPrice(position.entryPrice)} · <span className="text-[#ff453a]">{fmtPrice(position.stopPrice)}</span> ·{' '}
                <span className="text-[#00d35a]">{fmtPrice(position.takeProfitPrice)}</span>
              </span>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 text-xs text-[#ff453a] bg-[#ff453a]/10 rounded-xl px-3 py-2">{errorMsg}</div>
        )}

        {/* Sell Confirmation Sheet */}
        {sellSheetOpen && position ? (
          <div className="mt-5 bg-[#2c2c2e] rounded-2xl p-4 space-y-3">
            <div className="text-sm font-semibold text-white">
              Sell {symbol} ({sellPct}%)
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[25, 50, 100].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSellPct(p)}
                  className={`min-h-[44px] rounded-xl text-sm font-semibold font-mono-num transition-colors cursor-pointer ${
                    sellPct === p ? 'bg-[#ff453a] text-white' : 'bg-[#1c1c1e] text-[rgba(235,235,245,0.75)]'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSellSheetOpen(false)}
                className="min-h-[44px] rounded-xl bg-[#1c1c1e] text-white text-sm font-medium cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmSell}
                className="min-h-[44px] rounded-xl bg-[#ff453a] text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {busy ? '...' : t.confirmSell}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <a
              href={fomoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[46px] rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>{t.openOnFomo}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
            {position ? (
              <button
                type="button"
                onClick={() => setSellSheetOpen(true)}
                className="min-h-[46px] rounded-xl bg-[#ff453a] hover:bg-[#ff564c] text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {t.sellNow}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !coin?.analystPassed}
                onClick={handleBuyNow}
                className="min-h-[46px] rounded-xl bg-[#00d35a] text-black text-sm font-semibold disabled:opacity-40 transition-colors cursor-pointer"
              >
                {busy ? '...' : coin?.analystPassed ? t.buyPaper : 'Blocked (Audit)'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
