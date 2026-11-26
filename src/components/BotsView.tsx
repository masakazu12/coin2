import React, { useState } from 'react';
import { Lock, ExternalLink, RefreshCw } from 'lucide-react';
import type { BotId, DeskState, StratId } from '../shared/types.ts';
import { fmtTimeAgo, type Lang, T } from '../lib/i18n.ts';

interface BotsViewProps {
  state: DeskState;
  lang: Lang;
  scanning: boolean;
  onToggleBot: (botId: BotId, paused: boolean) => Promise<void>;
  onToggleStrat: (stratId: StratId, enabled: boolean) => Promise<void>;
  onRunScan: () => Promise<void>;
  onOpenAudit: (mint: string) => void;
  onOpenAccountSettings: () => void;
}

export const BotsView: React.FC<BotsViewProps> = ({
  state,
  lang,
  scanning,
  onToggleBot,
  onToggleStrat,
  onRunScan,
  onOpenAudit,
  onOpenAccountSettings,
}) => {
  const t = T[lang];
  const [expandedBot, setExpandedBot] = useState<BotId | null>('scanner');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBotSwitch = async (botId: BotId, nextPaused: boolean) => {
    setErrorMsg(null);
    try {
      await onToggleBot(botId, nextPaused);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to toggle bot');
    }
  };

  const handleStratSwitch = async (stratId: StratId, nextEnabled: boolean) => {
    setErrorMsg(null);
    try {
      await onToggleStrat(stratId, nextEnabled);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to toggle strategy');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">5-Bot Pipeline</h1>
          <p className="text-xs text-[rgba(235,235,245,0.55)] mt-0.5">
            Scanner → Analyst (8 layers) → Brain (sizing & lessons) → Executor (1 click lane) → Risk (-25% hard stop)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={scanning}
            onClick={() => void onRunScan()}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#64d2ff] text-black text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? t.scanning : t.runScan}</span>
          </button>
          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-xs font-semibold text-white cursor-pointer"
          >
            {lang === 'ja' ? '閾値設定' : 'Settings'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-[#ff453a]/15 text-[#ff453a] text-xs px-4 py-3 rounded-xl">{errorMsg}</div>
      )}

      {/* 5 Full-Width Bot Cards (STEP 10) */}
      <div className="space-y-3">
        {state.bots.map((bot) => {
          const isExpanded = expandedBot === bot.id;
          return (
            <div key={bot.id} className="bg-[#1c1c1e] rounded-[20px] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setExpandedBot(isExpanded ? null : bot.id)}
                  className="text-left flex-1 min-w-0 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: bot.paused ? '#636366' : bot.color }}
                    />
                    <span className="text-base font-bold text-white">{bot.name}</span>
                    <span className="text-xs font-mono-num text-[rgba(235,235,245,0.5)]">
                      {bot.countToday} {bot.countLabel}
                    </span>
                  </div>
                  <p className="text-xs text-[rgba(235,235,245,0.65)] mt-1">{bot.statusLine}</p>
                </button>

                {/* Metrics + Pause Switch */}
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-4 font-mono-num text-xs">
                    {bot.metrics.map((m) => (
                      <div key={m.label} className="text-right">
                        <div className="text-[10px] text-[rgba(235,235,245,0.45)]">{m.label}</div>
                        <div
                          className={
                            m.tone === 'green'
                              ? 'text-[#00d35a] font-semibold'
                              : m.tone === 'red'
                                ? 'text-[#ff453a] font-semibold'
                                : 'text-white font-semibold'
                          }
                        >
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {bot.locked ? (
                    <div
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2c2c2e] text-[11px] font-medium text-[#ff6b9a]"
                      title={t.riskLocked}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{lang === 'ja' ? 'ロック中' : 'Locked'}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleBotSwitch(bot.id, !bot.paused)}
                      className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        bot.paused
                          ? 'bg-[#00d35a] text-black'
                          : 'bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white'
                      }`}
                    >
                      {bot.paused ? t.resume : t.pause}
                    </button>
                  )}
                </div>
              </div>

              {/* Last Decisions List */}
              {isExpanded && (
                <div className="mt-4 pt-3 border-t border-[rgba(84,84,88,0.4)] space-y-2">
                  <div className="text-[11px] text-[rgba(235,235,245,0.45)]">
                    {lang === 'ja' ? '直近の判断ログ' : 'Recent decisions'}
                  </div>
                  {bot.recentDecisions.length === 0 ? (
                    <div className="text-xs text-[rgba(235,235,245,0.5)]">No decisions logged yet.</div>
                  ) : (
                    bot.recentDecisions.slice(0, 8).map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-3 py-2 border-b border-[rgba(84,84,88,0.22)] last:border-b-0 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenAudit(d.mint)}
                          className="text-left min-w-0 flex-1 hover:opacity-85 cursor-pointer"
                        >
                          <span className="font-semibold text-white">{d.symbol}</span>
                          <span className="text-[rgba(235,235,245,0.3)] mx-1.5">·</span>
                          <span
                            className={`font-mono-num ${
                              d.verdict === 'pass' || d.verdict === 'buy' || d.verdict === 'sell'
                                ? 'text-[#00d35a]'
                                : d.verdict === 'stop'
                                  ? 'text-[#ff453a]'
                                  : 'text-[rgba(235,235,245,0.6)]'
                            }`}
                          >
                            {d.verdict}
                          </span>
                          <div className="text-[11px] text-[rgba(235,235,245,0.55)] truncate mt-0.5">
                            {d.detail}
                          </div>
                        </button>
                        <div className="flex items-center gap-3 shrink-0 font-mono-num text-[11px] text-[rgba(235,235,245,0.45)]">
                          <span>{fmtTimeAgo(d.ts, lang)}</span>
                          <a
                            href={d.fomoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#0a84ff] hover:underline inline-flex items-center gap-0.5"
                          >
                            FOMO
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 7 Strategies Panel (Pages 9-11 & 13-14) */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">{t.strategies}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {state.strategies.map((st) => (
            <div key={st.id} className="bg-[#1c1c1e] rounded-[20px] p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white">{st.name}</span>
                  {st.autoOnly ? (
                    <span className="text-[11px] font-mono-num text-[#ff453a]">Auto ({state.regime.mode})</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleStratSwitch(st.id, !st.enabled)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold font-mono-num transition-colors cursor-pointer ${
                        st.enabled ? 'bg-[#00d35a] text-black' : 'bg-[#2c2c2e] text-[rgba(235,235,245,0.55)]'
                      }`}
                    >
                      {st.enabled ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-[rgba(235,235,245,0.75)] leading-relaxed">{st.ruleSummary}</p>
                <p className="mt-1 text-[11px] text-[rgba(235,235,245,0.45)]">Never: {st.neverSummary}</p>
              </div>
              <div className="pt-2.5 border-t border-[rgba(84,84,88,0.35)] flex items-center justify-between text-xs font-mono-num">
                <span className="text-[rgba(235,235,245,0.6)]">
                  {st.trades} trades · {st.winRate}% win
                </span>
                <span className={st.netUsd >= 0 ? 'text-[#00d35a] font-semibold' : 'text-[#ff453a] font-semibold'}>
                  {st.netUsd >= 0 ? '+' : ''}${st.netUsd.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
