import React, { useState } from 'react';
import { ExternalLink, Check, X } from 'lucide-react';
import type { DeskState } from '../shared/types.ts';
import { fmtTimeAgo, fmtUsd, type Lang, T } from '../lib/i18n.ts';

interface ActivityViewProps {
  state: DeskState;
  lang: Lang;
  onOpenCoin: (mint: string) => void;
  onOpenAudit: (mint: string) => void;
  onToggleLesson: (tag: string, status: 'active' | 'watch' | 'archived') => Promise<void>;
  onToggleCopyTrader: (id: string, copyOn: boolean) => Promise<void>;
  onAnswerQuestion: (id: string, answer: 'yes' | 'no') => Promise<void>;
}

type ActivityTab = 'all' | 'trades' | 'skips' | 'morning' | 'lessons' | 'copy';

export const ActivityView: React.FC<ActivityViewProps> = ({
  state,
  lang,
  onOpenCoin,
  onOpenAudit,
  onToggleLesson,
  onToggleCopyTrader,
  onAnswerQuestion,
}) => {
  const t = T[lang];
  const [subTab, setSubTab] = useState<ActivityTab>('all');
  const [copyErr, setCopyErr] = useState<string | null>(null);

  const filteredRows = state.activity.filter((row) => {
    if (subTab === 'trades') return row.kind === 'bought' || row.kind === 'sold' || row.kind === 'stopped';
    if (subTab === 'skips') return row.kind === 'rejected';
    return true;
  });

  const handleCopySwitch = async (id: string, nextVal: boolean) => {
    setCopyErr(null);
    try {
      await onToggleCopyTrader(id, nextVal);
    } catch (err) {
      setCopyErr(err instanceof Error ? err.message : 'Unable to update copy switch');
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation Segmented Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {(
          [
            { id: 'all', label: t.all },
            { id: 'trades', label: t.trades },
            { id: 'skips', label: t.skips },
            { id: 'morning', label: t.morningPage },
            { id: 'lessons', label: t.lessons },
            { id: 'copy', label: t.copyPicks },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              subTab === tab.id ? 'bg-white text-black' : 'bg-[#1c1c1e] text-[rgba(235,235,245,0.65)] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ALL / TRADES / SKIPS Feed */}
      {(subTab === 'all' || subTab === 'trades' || subTab === 'skips') && (
        <div className="bg-[#1c1c1e] rounded-[20px] divide-y divide-[rgba(84,84,88,0.35)]">
          {filteredRows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[rgba(235,235,245,0.55)]">
              Nothing yet tonight
            </div>
          ) : (
            filteredRows.map((row) => {
              const valTone =
                row.valueTone === 'green'
                  ? 'text-[#00d35a]'
                  : row.valueTone === 'red'
                    ? 'text-[#ff453a]'
                    : 'text-[rgba(235,235,245,0.7)]';

              return (
                <div
                  key={row.id}
                  className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#242426] first:rounded-t-[20px] last:rounded-b-[20px] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!row.mint) return;
                      if (row.kind === 'rejected') onOpenAudit(row.mint);
                      else onOpenCoin(row.mint);
                    }}
                    className="text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-white truncate">{row.title}</div>
                    <div className="text-xs text-[rgba(235,235,245,0.55)] truncate mt-0.5">
                      {row.subtitle} · {fmtTimeAgo(row.ts, lang)}
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs sm:text-sm font-mono-num font-semibold ${valTone}`}>
                      {row.value}
                    </span>
                    {row.fomoUrl && (
                      <a
                        href={row.fomoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#0a84ff] hover:underline inline-flex items-center gap-0.5 whitespace-nowrap"
                      >
                        FOMO
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MORNING PAGE (08:00 Report: Red trades first, kills by reason, 3 yes/no questions + Meta Themes) */}
      {subTab === 'morning' && (
        <div className="space-y-4">
          <div className="bg-[#1c1c1e] rounded-[20px] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[rgba(84,84,88,0.4)]">
              <div>
                <h2 className="text-base font-bold text-white">
                  Morning Page · {state.morningReport.dateStr} (08:00)
                </h2>
                <p className="text-xs text-[rgba(235,235,245,0.55)] mt-0.5 font-mono-num">
                  {state.morningReport.mode} · Market {state.morningReport.marketMode} · Seen{' '}
                  {state.morningReport.coinsSeen} · Passed {state.morningReport.analystPassed} · Fees{' '}
                  {fmtUsd(state.morningReport.feesPaidUsd)}
                </p>
              </div>
              <div
                className={`text-xl font-bold font-mono-num ${
                  state.morningReport.netPnlUsd >= 0 ? 'text-[#00d35a]' : 'text-[#ff453a]'
                }`}
              >
                {state.morningReport.netPnlUsd >= 0 ? '+' : ''}
                {fmtUsd(state.morningReport.netPnlUsd)} ({state.morningReport.netPnlPct >= 0 ? '+' : ''}
                {state.morningReport.netPnlPct}%)
              </div>
            </div>

            {/* Red Trades First (Mandatory Morning Page Rule) */}
            <div className="mt-4">
              <div className="text-xs font-semibold text-[#ff453a] mb-2">
                Red Trades First ({state.morningReport.redTrades.length})
              </div>
              {state.morningReport.redTrades.length === 0 ? (
                <div className="text-xs text-[rgba(235,235,245,0.5)]">0 red trades recorded.</div>
              ) : (
                <div className="space-y-2">
                  {state.morningReport.redTrades.map((tr) => (
                    <div
                      key={tr.id}
                      className="bg-black rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-white">{tr.symbol}</span>
                        <span className="text-[rgba(235,235,245,0.45)] mx-1.5">·</span>
                        <span className="text-[rgba(235,235,245,0.7)]">{tr.whyOut}</span>
                      </div>
                      <span className="font-mono-num font-bold text-[#ff453a]">
                        {fmtUsd(tr.pnlUsd)} ({tr.pnlPct}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Green Trades */}
            <div className="mt-4">
              <div className="text-xs font-semibold text-[#00d35a] mb-2">
                Green Trades ({state.morningReport.greenTrades.length})
              </div>
              <div className="space-y-2">
                {state.morningReport.greenTrades.map((tr) => (
                  <div
                    key={tr.id}
                    className="bg-black rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-white">{tr.symbol}</span>
                      <span className="text-[rgba(235,235,245,0.45)] mx-1.5">·</span>
                      <span className="text-[rgba(235,235,245,0.7)]">{tr.whyOut}</span>
                    </div>
                    <span className="font-mono-num font-bold text-[#00d35a]">
                      +{fmtUsd(tr.pnlUsd)} (+{tr.pnlPct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3 Yes / No Review Questions */}
            <div className="mt-5 pt-4 border-t border-[rgba(84,84,88,0.4)] space-y-2.5">
              <div className="text-xs font-semibold text-white">3 Morning Review Questions</div>
              {state.morningReport.questions.map((q) => (
                <div
                  key={q.id}
                  className="bg-black rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <span className="text-xs text-[rgba(235,235,245,0.85)]">{q.text}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void onAnswerQuestion(q.id, 'yes')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                        q.answered === 'yes' ? 'bg-[#00d35a] text-black' : 'bg-[#2c2c2e] text-white'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => void onAnswerQuestion(q.id, 'no')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                        q.answered === 'no' ? 'bg-[#ff453a] text-white' : 'bg-[#2c2c2e] text-white'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      No
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Desk/Meta.md Themes */}
          <div className="bg-[#1c1c1e] rounded-[20px] p-5">
            <h3 className="text-sm font-bold text-white mb-3">{t.metaThemes} (Desk/Meta.md)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono-num">
                <thead>
                  <tr className="text-[rgba(235,235,245,0.45)] border-b border-[rgba(84,84,88,0.4)] text-left">
                    <th className="pb-2 font-medium">Theme</th>
                    <th className="pb-2 font-medium text-right">7d Pools</th>
                    <th className="pb-2 font-medium text-right">Copies</th>
                    <th className="pb-2 font-medium text-right">24h Vol</th>
                    <th className="pb-2 font-medium text-right">Lead 24h</th>
                    <th className="pb-2 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(84,84,88,0.25)]">
                  {state.metaThemes.map((m) => (
                    <tr key={m.keyword}>
                      <td className="py-2.5 font-semibold text-white">{m.keyword}</td>
                      <td className="py-2.5 text-right text-[rgba(235,235,245,0.75)]">{m.pools7d}</td>
                      <td className="py-2.5 text-right text-[rgba(235,235,245,0.55)]">{m.copiesCount}</td>
                      <td className="py-2.5 text-right text-white">{fmtUsd(m.volume24hUsd, 0)}</td>
                      <td
                        className={`py-2.5 text-right ${
                          m.leadChange24h >= 0 ? 'text-[#00d35a]' : 'text-[#ff453a]'
                        }`}
                      >
                        {m.leadChange24h >= 0 ? '+' : ''}
                        {m.leadChange24h}%
                      </td>
                      <td className="py-2.5 text-right text-[rgba(235,235,245,0.65)]">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VAULT LESSONS (STEP 17 — Runnable blocking rules learned from losses) */}
      {subTab === 'lessons' && (
        <div className="space-y-3">
          {state.lessons.map((l) => (
            <div key={l.tag} className="bg-[#1c1c1e] rounded-[20px] p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-bold font-mono-num text-white">{l.tag}</span>
                  <span className="text-xs text-[rgba(235,235,245,0.45)] ml-2">
                    from {l.symbol} (-${l.lossUsd.toFixed(2)})
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-black p-0.5 rounded-lg">
                  {(['active', 'watch', 'archived'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => void onToggleLesson(l.tag, st)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono-num font-medium cursor-pointer ${
                        l.status === st
                          ? st === 'active'
                            ? 'bg-[#00d35a] text-black'
                            : st === 'watch'
                              ? 'bg-[#ff9f0a] text-black'
                              : 'bg-[#3a3a3c] text-white'
                          : 'text-[rgba(235,235,245,0.5)]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs font-mono-num text-[#64d2ff]">
                Check: {l.field} {l.op} {String(l.value)} (only blocks, never loosens)
              </div>
              <p className="text-xs text-[rgba(235,235,245,0.7)]">{l.summary}</p>
              <div className="flex items-center gap-4 text-xs font-mono-num pt-1 text-[rgba(235,235,245,0.55)]">
                <span>Hit {l.timesHit}×</span>
                <span className="text-[#00d35a]">Saved {fmtUsd(l.savedUsd)}</span>
                <span className="text-[#ff9f0a]">Missed {fmtUsd(l.missedUsd)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* COPY PICKS (Page 8–9 — Max 2 traders on copy, own -25% stop always applies) */}
      {subTab === 'copy' && (
        <div className="space-y-3">
          {copyErr && (
            <div className="bg-[#ff453a]/15 text-[#ff453a] text-xs px-4 py-3 rounded-xl">{copyErr}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {state.copyTraders.map((tr) => (
              <div key={tr.id} className="bg-[#1c1c1e] rounded-[20px] p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white font-mono-num">
                      #{tr.rank} @{tr.handle}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopySwitch(tr.id, !tr.copyOn)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        tr.copyOn ? 'bg-[#00d35a] text-black' : 'bg-[#2c2c2e] text-white'
                      }`}
                    >
                      {tr.copyOn ? 'Copy ON' : 'Copy OFF'}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs font-mono-num">
                    <span className="text-[#00d35a]">7d +{fmtUsd(tr.pnl7d, 0)}</span>
                    <span className="text-[#00d35a]">30d +{fmtUsd(tr.pnl30d, 0)}</span>
                    <span className="text-[rgba(235,235,245,0.55)]">{tr.trades} trades</span>
                  </div>
                  <p className="mt-2 text-xs text-[rgba(235,235,245,0.7)]">{tr.why}</p>
                </div>

                <div className="pt-2.5 border-t border-[rgba(84,84,88,0.35)] flex items-center justify-between text-xs">
                  <span className="text-[rgba(235,235,245,0.55)] font-mono-num">
                    Last: {tr.lastBuySymbol} @ {tr.lastBuyMcap} ({tr.lastTradeAgo})
                  </span>
                  <div className="flex items-center gap-3">
                    <a
                      href={tr.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0a84ff] hover:underline"
                    >
                      Profile
                    </a>
                    <a
                      href={tr.lastBuyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0a84ff] hover:underline"
                    >
                      Last buy
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
