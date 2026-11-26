import React, { useState } from 'react';
import { ChevronRight, RefreshCw, ArrowUpRight, ShieldCheck } from 'lucide-react';
import type {
  BalancePoint,
  ChartRange,
  DeskState,
  MarketMode,
} from '../shared/types.ts';
import { fmtPrice, fmtTimeAgo, fmtUsd, type Lang, T } from '../lib/i18n.ts';
import { OdometerNumber } from './OdometerNumber.tsx';
import { PerformanceChart } from './PerformanceChart.tsx';
import { LiveDeskScreen } from './LiveDeskScreen.tsx';

interface HomeViewProps {
  state: DeskState;
  chartPoints: BalancePoint[];
  chartRange: ChartRange;
  lang: Lang;
  scanning: boolean;
  onRangeChange: (r: ChartRange) => void;
  onOpenCoin: (mint: string) => void;
  onOpenAudit: (mint: string) => void;
  onSeeAllActivity: () => void;
  onOpenBots: () => void;
  onRunScan: () => Promise<void>;
  onOverrideRegime: (override: MarketMode | 'AUTO') => Promise<void>;
}

export const HomeView: React.FC<HomeViewProps> = ({
  state,
  chartPoints,
  chartRange,
  lang,
  scanning,
  onRangeChange,
  onOpenCoin,
  onOpenAudit,
  onSeeAllActivity,
  onOpenBots,
  onRunScan,
  onOverrideRegime,
}) => {
  const t = T[lang];
  const [hoveredPt, setHoveredPt] = useState<BalancePoint | null>(null);

  const displayEquity = hoveredPt ? hoveredPt.equity : state.totalEquityUsd;
  const displayPnl = Number((displayEquity - state.startEquityUsd).toFixed(2));
  const displayPct = Number(((displayPnl / Math.max(1, state.startEquityUsd)) * 100).toFixed(2));
  const isUp = displayPnl >= 0;

  const regimeColor =
    state.regime.mode === 'RED'
      ? '#ff453a'
      : state.regime.mode === 'QUIET'
        ? '#ff9f0a'
        : '#00d35a';

  const latestAudited = state.auditedCoins[0];
  const runningBotsCount = state.bots.filter((b) => !b.paused).length;

  return (
    <div className="space-y-6">
      {/* Top 2-Column Hero Grid on Desktop (1440px), stacked cleanly on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 columns: Balance Odometer + Market Regime + Performance Chart */}
        <div className="lg:col-span-7 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <OdometerNumber
                value={displayEquity}
                className="text-[44px] sm:text-[56px] font-bold leading-none text-white"
              />
              <span
                className={`text-xs font-mono-num font-bold tracking-wide ${
                  state.mode === 'LIVE' ? 'text-[#00d35a]' : 'text-[#ff9f0a]'
                }`}
              >
                {state.mode}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-mono-num">
              <span className={isUp ? 'text-[#00d35a] font-semibold' : 'text-[#ff453a] font-semibold'}>
                {isUp ? '+' : ''}
                {fmtUsd(displayPnl)} ({isUp ? '+' : ''}
                {displayPct}%) {t.today}
              </span>
              <span className="text-[rgba(235,235,245,0.3)]" aria-hidden="true">
                ·
              </span>
              <span className="text-[#00d35a] font-semibold">{state.multiplier.toFixed(2)}×</span>
              <span className="text-[rgba(235,235,245,0.3)]" aria-hidden="true">
                ·
              </span>
              <span className="text-[rgba(235,235,245,0.6)]">
                {t.cashFree} {fmtUsd(state.cashUsd)}
              </span>
            </div>

            {/* Market Mode Strip (GREEN / QUIET / RED + Live BTC/SOL/F&G numbers) */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold font-mono-num" style={{ color: regimeColor }}>
                  {state.regime.mode === 'RED'
                    ? 'Red mode'
                    : state.regime.mode === 'QUIET'
                      ? 'Quiet market'
                      : 'Green market'}
                </span>
                <span className="text-[rgba(235,235,245,0.3)]">·</span>
                <span className="font-mono-num text-[rgba(235,235,245,0.75)]">
                  BTC ${state.regime.btcPrice.toLocaleString()} ({state.regime.btc24hPct >= 0 ? '+' : ''}
                  {state.regime.btc24hPct}%)
                </span>
                <span className="text-[rgba(235,235,245,0.3)]">·</span>
                <span className="font-mono-num text-[rgba(235,235,245,0.75)]">
                  SOL ${state.regime.solPrice} ({state.regime.sol24hPct >= 0 ? '+' : ''}
                  {state.regime.sol24hPct}%)
                </span>
                <span className="text-[rgba(235,235,245,0.3)]">·</span>
                <span className="font-mono-num text-[rgba(235,235,245,0.75)]">
                  F&G {state.regime.fearGreed}
                </span>
              </div>

              {/* Interactive Regime Override Selector (Auto / GREEN / RED) */}
              <div className="flex items-center gap-1 bg-[#1c1c1e] p-0.5 rounded-lg">
                {(['AUTO', 'GREEN', 'RED'] as const).map((opt) => {
                  const active = state.regime.override === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => void onOverrideRegime(opt)}
                      className={`px-2 py-1 rounded-md text-[11px] font-mono-num font-medium transition-colors cursor-pointer ${
                        active
                          ? opt === 'RED'
                            ? 'bg-[#ff453a] text-white'
                            : opt === 'GREEN'
                              ? 'bg-[#00d35a] text-black'
                              : 'bg-[#2c2c2e] text-white'
                          : 'text-[rgba(235,235,245,0.5)] hover:text-white'
                      }`}
                    >
                      {opt === 'AUTO' ? t.regimeAuto : opt}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <PerformanceChart
            points={chartPoints}
            startEquity={state.startEquityUsd}
            range={chartRange}
            onRangeChange={onRangeChange}
            onHoverPoint={setHoveredPt}
          />
        </div>

        {/* Right 5 columns: Live Desk Screen (16:9 Bot Click Lane) */}
        <div className="lg:col-span-5">
          <LiveDeskScreen
            screen={state.liveScreen}
            mode={state.mode}
            cashUsd={state.cashUsd}
            handle={state.settings.fomo_handle}
            lang={lang}
            onOpenCoin={onOpenCoin}
          />
        </div>
      </div>

      {/* Open Positions Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-white">
              {t.openPositions} ({state.positions.length})
            </h2>
            <span className="text-[11px] font-mono-num text-[rgba(235,235,245,0.45)]">
              {state.settings.new_buys_stopped
                ? lang === 'ja'
                  ? '新規買付停止中'
                  : 'New buys paused'
                : lang === 'ja'
                  ? '実データ自動監視中 (Solana Live)'
                  : 'Live Solana feed active'}
            </span>
          </div>
          <button
            type="button"
            disabled={scanning}
            onClick={() => void onRunScan()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-xs font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? t.scanning : t.runScan}</span>
          </button>
        </div>

        {state.positions.length === 0 ? (
          <div className="bg-[#1c1c1e] rounded-[20px] px-5 py-6 text-center">
            <div className="text-sm font-medium text-white">{t.noPositions}</div>
            <div className="text-xs text-[rgba(235,235,245,0.55)] mt-1">
              {state.settings.new_buys_stopped
                ? lang === 'ja'
                  ? '新規買付が停止されています。Accountから再開してください。'
                  : 'New buys are stopped. Resume from Account.'
                : t.waitingFirstTrade}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {state.positions.map((pos) => {
              const posUp = pos.pnlUsd >= 0;
              return (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => onOpenCoin(pos.mint)}
                  className="text-left bg-[#1c1c1e] hover:bg-[#242426] rounded-[20px] p-4 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white">{pos.symbol}</span>
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-mono-num text-[#00d35a]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {pos.layersPassed}/8
                        </span>
                      </div>
                      <div className="text-xs text-[rgba(235,235,245,0.55)] font-mono-num mt-0.5">
                        STRAT {pos.strat} · {fmtUsd(pos.sizeUsd)} in · {fmtPrice(pos.currentPrice)}
                      </div>
                    </div>
                    <div className="text-right font-mono-num">
                      <div className={`text-sm font-bold ${posUp ? 'text-[#00d35a]' : 'text-[#ff453a]'}`}>
                        {posUp ? '+' : ''}
                        {fmtUsd(pos.pnlUsd)}
                      </div>
                      <div className={`text-xs ${posUp ? 'text-[#00d35a]' : 'text-[#ff453a]'}`}>
                        {posUp ? '+' : ''}
                        {pos.pnlPct}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-[rgba(84,84,88,0.4)] flex items-center justify-between text-[11px] font-mono-num text-[rgba(235,235,245,0.55)]">
                    <span className="text-[#ff453a]">Stop {fmtPrice(pos.stopPrice)}</span>
                    <span className="text-[#00d35a]">Take {fmtPrice(pos.takeProfitPrice)}</span>
                    <span>Trail {pos.trailPct}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Bots · 5 Running (Snap Carousel on mobile, 5-column grid on desktop) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">
            Bots · {runningBotsCount} {lang === 'ja' ? '稼働中' : 'running'}
          </h2>
          <button
            type="button"
            onClick={onOpenBots}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-[#0a84ff] hover:underline cursor-pointer"
          >
            <span>{t.seeAll}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex lg:grid lg:grid-cols-5 gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1">
          {state.bots.map((bot) => (
            <div
              key={bot.id}
              onClick={onOpenBots}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onOpenBots()}
              className="snap-start shrink-0 w-[235px] lg:w-auto bg-[#1c1c1e] hover:bg-[#242426] rounded-[20px] p-4 flex flex-col justify-between transition-colors cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold" style={{ color: bot.color }}>
                    {bot.name}
                  </span>
                  <span className="text-xs font-mono-num text-[rgba(235,235,245,0.55)]">
                    {bot.paused ? 'Paused' : `${bot.countToday} ${bot.countLabel}`}
                  </span>
                </div>

                {/* Specialized bot visuals matching STEP 10 */}
                {bot.id === 'analyst' && latestAudited ? (
                  <div className="mt-3">
                    <div className="grid grid-cols-4 gap-1">
                      {latestAudited.layers.map((l) => (
                        <div
                          key={l.n}
                          className="h-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              l.pass === true
                                ? '#00d35a'
                                : l.pass === false
                                  ? '#ff453a'
                                  : '#3a3a3c',
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-baseline justify-between font-mono-num text-xs">
                      <span className="text-white truncate">{latestAudited.symbol}</span>
                      <span
                        className={
                          latestAudited.score.total >= 70 ? 'text-[#00d35a] font-semibold' : 'text-[#ff453a]'
                        }
                      >
                        {latestAudited.score.total}/100
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2.5 text-xs text-[rgba(235,235,245,0.75)] leading-snug line-clamp-2">
                    {bot.statusLine}
                  </p>
                )}
              </div>

              <div className="mt-3 pt-2.5 border-t border-[rgba(84,84,88,0.35)] flex items-center justify-between text-[11px] font-mono-num text-[rgba(235,235,245,0.5)]">
                <span>{bot.metrics[0]?.label}</span>
                <span
                  className={
                    bot.metrics[0]?.tone === 'green'
                      ? 'text-[#00d35a]'
                      : bot.metrics[0]?.tone === 'red'
                        ? 'text-[#ff453a]'
                        : 'text-white'
                  }
                >
                  {bot.metrics[0]?.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Activity (Last 5 rows) + Audited Coins Quick Table on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">{t.recentActivity}</h2>
            <button
              type="button"
              onClick={onSeeAllActivity}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-[#0a84ff] hover:underline cursor-pointer"
            >
              <span>{t.seeAll}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-[#1c1c1e] rounded-[20px] divide-y divide-[rgba(84,84,88,0.35)]">
            {state.activity.slice(0, 5).map((row) => {
              const valColor =
                row.valueTone === 'green'
                  ? 'text-[#00d35a]'
                  : row.valueTone === 'red'
                    ? 'text-[#ff453a]'
                    : row.valueTone === 'orange'
                      ? 'text-[#ff9f0a]'
                      : 'text-[rgba(235,235,245,0.65)]';
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    if (!row.mint) return;
                    if (row.kind === 'rejected') onOpenAudit(row.mint);
                    else onOpenCoin(row.mint);
                  }}
                  className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#242426] first:rounded-t-[20px] last:rounded-b-[20px] transition-colors text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{row.title}</div>
                    <div className="text-xs text-[rgba(235,235,245,0.55)] truncate mt-0.5">
                      {row.subtitle} · {fmtTimeAgo(row.ts, lang)}
                    </div>
                  </div>
                  <div className={`text-xs sm:text-sm font-mono-num font-semibold shrink-0 ${valColor}`}>
                    {row.value}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Latest Audited Solana Pools */}
        <section className="lg:col-span-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">
              {lang === 'ja' ? '最新8層監査プール' : 'Latest Audited Pools'}
            </h2>
            <span className="text-xs font-mono-num text-[rgba(235,235,245,0.45)]">
              {state.auditedCoins.length} tracked
            </span>
          </div>

          <div className="bg-[#1c1c1e] rounded-[20px] divide-y divide-[rgba(84,84,88,0.35)]">
            {state.auditedCoins.slice(0, 5).map((coin) => (
              <button
                key={coin.mint}
                type="button"
                onClick={() => onOpenAudit(coin.mint)}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#242426] first:rounded-t-[20px] last:rounded-b-[20px] transition-colors text-left cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{coin.symbol}</span>
                    <span
                      className={`text-xs font-mono-num ${
                        coin.analystPassed ? 'text-[#00d35a]' : 'text-[#ff453a]'
                      }`}
                    >
                      {coin.layersPassed}/8
                    </span>
                    <span className="text-[11px] font-mono-num text-[rgba(235,235,245,0.45)]">
                      {fmtUsd(coin.liquidityUsd, 0)} liq
                    </span>
                  </div>
                  <div className="text-xs text-[rgba(235,235,245,0.5)] truncate mt-0.5">
                    {coin.analystPassed ? coin.bullLine : coin.analystReason}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-sm font-mono-num font-bold ${
                      coin.score.total >= 70 && coin.layersPassed === 8 ? 'text-[#00d35a]' : 'text-[rgba(235,235,245,0.5)]'
                    }`}
                  >
                    {coin.score.total}
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-[rgba(235,235,245,0.35)]" />
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
