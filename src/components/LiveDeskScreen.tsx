import React, { useState } from 'react';
import { Maximize2, X, ExternalLink, Check } from 'lucide-react';
import type { DeskMode, LiveScreenState } from '../shared/types.ts';
import { coinUrl } from '../shared/links.ts';
import { fmtPrice, type Lang, T } from '../lib/i18n.ts';

interface LiveDeskScreenProps {
  screen: LiveScreenState;
  mode: DeskMode;
  cashUsd: number;
  handle: string;
  lang: Lang;
  onOpenCoin?: (mint: string) => void;
}

const BOT_COLORS: Record<string, string> = {
  scanner: '#64d2ff',
  analyst: '#ffd60a',
  brain: '#bf5af2',
  executor: '#00d35a',
  risk: '#ff6b9a',
};

const BOT_NAMES: Record<string, string> = {
  scanner: 'Scanner',
  analyst: 'Analyst',
  brain: 'Brain',
  executor: 'Executor',
  risk: 'Risk',
};

export const LiveDeskScreen: React.FC<LiveDeskScreenProps> = ({
  screen,
  mode,
  cashUsd,
  handle,
  lang,
  onOpenCoin,
}) => {
  const [expanded, setExpanded] = useState(false);
  const t = T[lang];
  const botColor = screen.activeBot ? BOT_COLORS[screen.activeBot] || '#00d35a' : '#8e8e93';
  const botName = screen.activeBot ? BOT_NAMES[screen.activeBot] || 'Idle' : 'Idle';

  const isFresh = Date.now() - screen.updatedAt < 12_000;
  const fomoLink = coinUrl(screen.coinMint);

  const renderViewport = (large = false) => (
    <div
      className={`relative w-full aspect-video bg-[#0b0b0d] overflow-hidden select-none ${
        large ? 'rounded-2xl border border-[rgba(84,84,88,0.55)]' : 'rounded-[18px] border border-[rgba(84,84,88,0.45)]'
      }`}
    >
      {screen.privatePaused ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/95 text-sm text-[rgba(235,235,245,0.6)]">
          Paused · private
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col text-[10px] sm:text-xs">
          {/* Simulated FOMO Web Header (exact texts from fomo_web.md Page 19) */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#111114]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-semibold text-white tracking-tight">fomo.family</span>
              <div className="hidden sm:flex items-center gap-2 text-[rgba(235,235,245,0.55)]">
                <span className="text-white">Tokens</span>
                <span>Leaderboard</span>
                <span>Feed</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 font-mono-num">
              <span className="text-[#00d35a]">${cashUsd.toFixed(2)}</span>
              <span className="text-[rgba(235,235,245,0.5)] truncate max-w-[80px]">@{handle}</span>
            </div>
          </div>

          {/* Main 2-column FOMO coin page layout */}
          <div className="flex-1 grid grid-cols-12 gap-2 p-2.5 sm:p-3 overflow-hidden">
            {/* Left: Coin Header + Metric Tiles + Mini Chart */}
            <div className="col-span-7 flex flex-col justify-between min-w-0">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-white text-xs sm:text-sm truncate">
                    {screen.coinSymbol}
                  </span>
                  <span className="font-mono-num text-[10px] sm:text-xs text-white">
                    {fmtPrice(screen.coinPriceUsd)}
                  </span>
                  <span
                    className={`font-mono-num text-[10px] ${
                      screen.coinChange24h >= 0 ? 'text-[#00d35a]' : 'text-[#ff453a]'
                    }`}
                  >
                    {screen.coinChange24h >= 0 ? '+' : ''}
                    {screen.coinChange24h}%
                  </span>
                </div>

                {/* 4 Metric Tiles matching fomo_web.md */}
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[
                    { k: 'Market cap', v: screen.coinMcap },
                    { k: 'Liquidity', v: screen.coinLiquidity },
                    { k: 'Holders', v: screen.coinHolders },
                    { k: 'Top 10', v: screen.coinTop10 },
                  ].map((tile) => (
                    <div key={tile.k} className="bg-[#18181c] rounded-md px-1.5 py-1">
                      <div className="text-[8px] sm:text-[9px] text-[rgba(235,235,245,0.45)] truncate">
                        {tile.k}
                      </div>
                      <div className="font-mono-num text-[9px] sm:text-[11px] text-white font-medium truncate">
                        {tile.v}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Crisp SVG price sparkline */}
              <div className="my-2 flex-1 min-h-[44px] bg-[#141418] rounded-lg px-2 py-1.5 flex items-center">
                <svg viewBox="0 0 200 44" className="w-full h-full overflow-visible">
                  <path
                    d="M0 34 L22 28 L44 31 L66 19 L88 23 L110 14 L132 18 L154 11 L176 15 L200 8"
                    fill="none"
                    stroke="#00d35a"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Lower About / Contract + Toast */}
              <div className="flex items-center justify-between text-[9px] text-[rgba(235,235,245,0.45)] font-mono-num">
                <span className="truncate">
                  CA: {screen.coinMint.slice(0, 6)}...{screen.coinMint.slice(-6)}
                </span>
                {screen.activityToast && (
                  <span className="text-[#00d35a] truncate ml-2">{screen.activityToast}</span>
                )}
              </div>
            </div>

            {/* Right: FOMO Buy | Sell Order Panel (exact fomo_web.md labels) */}
            <div className="col-span-5 bg-[#18181c] rounded-xl p-2 sm:p-2.5 flex flex-col justify-between border border-white/5">
              <div className="grid grid-cols-2 gap-1 bg-[#0f0f12] p-0.5 rounded-lg text-[10px] font-medium">
                <div
                  className={`text-center py-1 rounded-md ${
                    screen.tab === 'Buy' ? 'bg-[#0a84ff] text-white' : 'text-[rgba(235,235,245,0.5)]'
                  }`}
                >
                  Buy
                </div>
                <div
                  className={`text-center py-1 rounded-md ${
                    screen.tab === 'Sell' ? 'bg-[#ff453a] text-white' : 'text-[rgba(235,235,245,0.5)]'
                  }`}
                >
                  Sell
                </div>
              </div>

              <div className="mt-1.5">
                <div className="bg-[#0f0f12] rounded-lg px-2 py-1.5 flex items-center justify-between font-mono-num">
                  <span className="text-[rgba(235,235,245,0.45)]">$</span>
                  <span className="text-white font-semibold">{screen.amountText}</span>
                </div>
                <div className="mt-1 text-[9px] font-mono-num text-[rgba(235,235,245,0.65)] truncate">
                  {screen.quoteLine}
                </div>
                <div className="text-[8px] sm:text-[9px] font-mono-num text-[rgba(235,235,245,0.4)]">
                  {screen.feeLine}
                </div>
              </div>

              <div
                className={`mt-1.5 py-1.5 rounded-lg text-center font-semibold text-[10px] sm:text-xs text-white ${
                  screen.tab === 'Buy' ? 'bg-[#0a84ff]' : 'bg-[#ff453a]'
                }`}
              >
                {mode === 'PAPER' ? `${screen.primaryButtonText} (PAPER)` : screen.primaryButtonText}
              </div>
            </div>
          </div>

          {/* Animated Bot Cursor Overlay (STEP 9: 300ms glide + bot color + bot name label) */}
          <div
            className="pointer-events-none absolute z-20 transition-all duration-300 ease-out"
            style={{
              left: `${screen.cursorX}%`,
              top: `${screen.cursorY}%`,
              transform: `translate(-4px, -4px) scale(${screen.clicking ? 0.88 : 1})`,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path
                d="M2 2L7.5 16L10 10L16 7.5L2 2Z"
                fill={botColor}
                stroke="#000000"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <div
              className="mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold text-black whitespace-nowrap"
              style={{ backgroundColor: botColor }}
            >
              {botName}
            </div>
          </div>
        </div>
      )}

      {/* Top Overlay Indicators (STEP 10: top left Live dot, top right lane owner) */}
      <div className="pointer-events-none absolute top-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] font-medium">
        <div className="flex items-center gap-1.5 bg-black/75 backdrop-blur-sm px-2 py-0.5 rounded-md text-white">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: isFresh ? '#ff453a' : '#8e8e93' }}
          />
          <span>{t.liveBotComputer}</span>
        </div>
        <div
          className="bg-black/75 backdrop-blur-sm px-2 py-0.5 rounded-md font-mono-num truncate max-w-[50%]"
          style={{ color: botColor }}
        >
          {screen.actionLabel}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="bg-[#1c1c1e] rounded-[22px] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">{t.liveScreen}</h2>
          <div className="flex items-center gap-3">
            <a
              href={fomoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0a84ff] hover:underline whitespace-nowrap"
            >
              <span>{t.openOnFomo}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#2c2c2e] text-[rgba(235,235,245,0.75)] hover:text-white transition-colors cursor-pointer"
              aria-label={t.fullscreen}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          onClick={() => onOpenCoin?.(screen.coinMint)}
          className="cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onOpenCoin?.(screen.coinMint)}
        >
          {renderViewport(false)}
        </div>

        {/* Last Order + 3 VERIFY checks (screen, api, chain) */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[rgba(235,235,245,0.8)] font-medium truncate">
            {screen.lastOrderSummary}
          </span>
          <div className="flex items-center gap-3 font-mono-num text-[11px] text-[rgba(235,235,245,0.6)]">
            <span className="inline-flex items-center gap-1 text-[#00d35a]">
              <Check className="w-3 h-3" />
              screen
            </span>
            <span className="inline-flex items-center gap-1 text-[#00d35a]">
              <Check className="w-3 h-3" />
              api:{screen.lastOrderChecks.api === 'paper' ? 'paper' : 'ok'}
            </span>
            <span className="inline-flex items-center gap-1 text-[#00d35a]">
              <Check className="w-3 h-3" />
              chain:{screen.lastOrderChecks.chain === 'paper' ? 'paper' : 'ok'}
            </span>
          </div>
        </div>
      </div>

      {/* Fullscreen Live View Modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-4xl bg-[#1c1c1e] rounded-3xl p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">{t.liveScreen}</h3>
                <p className="text-xs text-[rgba(235,235,245,0.6)] mt-0.5">
                  {screen.lastOrderSummary}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={fomoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-[#0a84ff] text-white text-xs font-semibold whitespace-nowrap"
                >
                  {t.openOnFomo}
                </a>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="w-10 h-10 rounded-full bg-[#2c2c2e] flex items-center justify-center text-white cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {renderViewport(true)}
          </div>
        </div>
      )}
    </>
  );
};
