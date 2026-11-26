import React, { useState } from 'react';
import { X, Check, Ban, Minus, ExternalLink, Search } from 'lucide-react';
import type { AuditedCoin } from '../shared/types.ts';
import { fmtPrice, fmtUsd, type Lang, T } from '../lib/i18n.ts';

interface AuditModalProps {
  coin: AuditedCoin | null;
  lang: Lang;
  onClose: () => void;
  onAuditMint: (mint: string) => Promise<AuditedCoin>;
  onBuy: (mint: string) => Promise<void>;
}

export const AuditModal: React.FC<AuditModalProps> = ({
  coin,
  lang,
  onClose,
  onAuditMint,
  onBuy,
}) => {
  const t = T[lang];
  const [mintInput, setMintInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCoin, setCurrentCoin] = useState<AuditedCoin | null>(coin);

  React.useEffect(() => {
    setCurrentCoin(coin);
  }, [coin]);

  const handleRunAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mintInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await onAuditMint(mintInput.trim());
      setCurrentCoin(res);
      setMintInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async () => {
    if (!currentCoin) return;
    setBuying(true);
    setError(null);
    try {
      await onBuy(currentCoin.mint);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Buy failed');
    } finally {
      setBuying(false);
    }
  };

  const scoreVal = currentCoin?.score.total ?? 0;
  const ringCircumference = 2 * Math.PI * 28;
  const ringOffset = ringCircumference * (1 - Math.min(100, Math.max(0, scoreVal)) / 100);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl bg-[#1c1c1e] rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-5 pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">
              {currentCoin ? `${currentCoin.symbol} · 8-Layer Audit` : t.auditMint}
            </h2>
            {currentCoin && (
              <p className="text-xs text-[rgba(235,235,245,0.6)] font-mono-num mt-0.5">
                {currentCoin.mint.slice(0, 8)}...{currentCoin.mint.slice(-6)} · {fmtPrice(currentCoin.priceUsd)} · Liq{' '}
                {fmtUsd(currentCoin.liquidityUsd, 0)}
              </p>
            )}
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

        {/* Live Solana Mint Audit Form */}
        <form onSubmit={handleRunAudit} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[rgba(235,235,245,0.4)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={mintInput}
              onChange={(e) => setMintInput(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full min-h-[44px] bg-black border border-[rgba(84,84,88,0.55)] rounded-xl pl-9 pr-3 text-xs text-white placeholder:text-[rgba(235,235,245,0.4)] focus:outline-none focus:border-[#64d2ff] font-mono-num"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !mintInput.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-[#64d2ff] text-black text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
          >
            {loading ? t.auditing : t.auditMint}
          </button>
        </form>

        {error && (
          <div className="mt-3 text-xs text-[#ff453a] bg-[#ff453a]/10 rounded-xl px-3 py-2">{error}</div>
        )}

        {currentCoin && (
          <>
            {/* Score Ring + Verdict Summary */}
            <div className="mt-5 flex items-center gap-4 pb-4 border-b border-[rgba(84,84,88,0.45)]">
              <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#2c2c2e" strokeWidth="5" />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke={scoreVal >= 70 && currentCoin.layersPassed === 8 ? '#00d35a' : '#ff453a'}
                    strokeWidth="5"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-base font-bold font-mono-num text-white">{scoreVal}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">
                  {currentCoin.analystPassed ? 'Cleared all 8 layers' : currentCoin.analystReason}
                </div>
                <div className="mt-1 text-xs text-[rgba(235,235,245,0.6)] font-mono-num">
                  Alive {currentCoin.score.alive} · Organic {currentCoin.score.organic} · Flush {currentCoin.score.flush} ·
                  Chase {currentCoin.score.chase}
                </div>
                <div className="mt-1 text-xs text-[rgba(235,235,245,0.6)]">
                  {currentCoin.score.social !== null
                    ? `Social ${currentCoin.score.socialPts >= 0 ? '+' : ''}${currentCoin.score.socialPts} · ${currentCoin.score.u15} accounts in 15m · ${currentCoin.score.smartHolders} smart holders`
                    : 'Social: off (4-part score)'}
                </div>
              </div>
            </div>

            {/* 8 Security Discs (STEP 10 Audit Screen) */}
            <div className="mt-4 space-y-2">
              {currentCoin.layers.map((layer) => {
                const statusColor =
                  layer.pass === true ? '#00d35a' : layer.pass === false ? '#ff453a' : 'rgba(235,235,245,0.3)';
                return (
                  <div
                    key={layer.n}
                    className="flex items-center justify-between gap-3 py-2 border-b border-[rgba(84,84,88,0.28)] last:border-b-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor:
                            layer.pass === true
                              ? 'rgba(0,211,90,0.14)'
                              : layer.pass === false
                                ? 'rgba(255,69,58,0.16)'
                                : '#2c2c2e',
                          color: statusColor,
                        }}
                      >
                        {layer.pass === true ? (
                          <Check className="w-4 h-4" />
                        ) : layer.pass === false ? (
                          <Ban className="w-3.5 h-3.5" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white">
                          {layer.n}. {layer.name}
                        </div>
                        <div className="text-[11px] text-[rgba(235,235,245,0.45)]">{layer.source}</div>
                      </div>
                    </div>
                    <div
                      className="text-xs font-mono-num font-medium text-right shrink-0"
                      style={{ color: statusColor }}
                    >
                      {layer.value}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bull vs Bear Debate (Brain STEP 18) */}
            <div className="mt-4 pt-3 border-t border-[rgba(84,84,88,0.45)] space-y-2 text-xs">
              <div>
                <span className="font-semibold text-[#00d35a]">Bull: </span>
                <span className="text-[rgba(235,235,245,0.75)]">{currentCoin.bullLine}</span>
              </div>
              <div>
                <span className="font-semibold text-[#ff453a]">Bear: </span>
                <span className="text-[rgba(235,235,245,0.75)]">{currentCoin.bearLine}</span>
              </div>
            </div>

            {/* Footer actions */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <a
                href={currentCoin.fomoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] rounded-xl bg-[#2c2c2e] text-white text-sm font-semibold flex items-center justify-center gap-1.5"
              >
                <span>{t.openOnFomo}</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                disabled={!currentCoin.analystPassed || buying}
                onClick={handleBuy}
                className="min-h-[44px] rounded-xl bg-[#00d35a] text-black text-sm font-semibold disabled:opacity-35 cursor-pointer"
              >
                {buying ? '...' : currentCoin.analystPassed ? t.buyPaper : '7 of 8 is a No'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
