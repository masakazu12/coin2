import React, { useCallback, useEffect, useState } from 'react';
import {
  Home,
  Cpu,
  Activity,
  SlidersHorizontal,
  Search,
  Terminal,
  RefreshCw,
} from 'lucide-react';
import type {
  AuditedCoin,
  BalancePoint,
  BotId,
  ChartRange,
  DeskMode,
  DeskSettings,
  DeskState,
  MarketMode,
  StratId,
} from './shared/types.ts';
import { type Lang, T } from './lib/i18n.ts';
import { HomeView } from './components/HomeView.tsx';
import { BotsView } from './components/BotsView.tsx';
import { ActivityView } from './components/ActivityView.tsx';
import { AccountView } from './components/AccountView.tsx';
import { CoinModal } from './components/CoinModal.tsx';
import { AuditModal } from './components/AuditModal.tsx';
import { CommandDrawer } from './components/CommandDrawer.tsx';

type NavTab = 'home' | 'bots' | 'activity' | 'account';

async function apiJson<TRes>(url: string, init?: RequestInit): Promise<TRes> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as TRes;
}

export default function App() {
  const [lang, setLang] = useState<Lang>('ja');
  const [tab, setTab] = useState<NavTab>('home');
  const [state, setState] = useState<DeskState | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>('1D');
  const [chartPoints, setChartPoints] = useState<BalancePoint[]>([]);
  const [offlineMsg, setOfflineMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Modals
  const [selectedCoinMint, setSelectedCoinMint] = useState<string | null>(null);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [selectedAuditMint, setSelectedAuditMint] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  const t = T[lang];

  const fetchChart = useCallback(async (range: ChartRange) => {
    try {
      const data = await apiJson<{ points: BalancePoint[] }>(`/api/chart?range=${range}`);
      setChartPoints(data.points);
    } catch {
      // Keep last good points
    }
  }, []);

  const fetchInitial = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        apiJson<DeskState>('/api/state'),
        apiJson<{ points: BalancePoint[] }>(`/api/chart?range=${chartRange}`),
      ]);
      setState(s);
      setChartPoints(c.points);
      setOfflineMsg(null);
    } catch {
      setOfflineMsg('Desk offline · retrying...');
    }
  }, [chartRange]);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  // Live SSE Stream subscription (STEP 8 GET /api/stream)
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.addEventListener('state', (ev) => {
      try {
        const next = JSON.parse((ev as MessageEvent).data) as DeskState;
        setState(next);
        setOfflineMsg(null);
      } catch {
        // Ignore malformed frame
      }
    });
    es.onerror = () => {
      setOfflineMsg('Desk stream reconnecting · keeping last good numbers');
    };
    return () => es.close();
  }, []);

  // Refresh chart whenever total equity moves or range changes
  useEffect(() => {
    if (state) {
      void fetchChart(chartRange);
    }
  }, [chartRange, state?.totalEquityUsd, fetchChart]);

  const syncState = useCallback(async () => {
    try {
      const s = await apiJson<DeskState>('/api/state');
      setState(s);
      setOfflineMsg(null);
      void fetchChart(chartRange);
    } catch {
      // Keep last good state
    }
  }, [chartRange, fetchChart]);

  const handleRunScan = async () => {
    setScanning(true);
    try {
      await apiJson('/api/scan', { method: 'POST' });
      await syncState();
    } finally {
      setScanning(false);
    }
  };

  const handleAuditMint = async (mint: string): Promise<AuditedCoin> => {
    const report = await apiJson<AuditedCoin>(`/api/audit/${encodeURIComponent(mint)}`);
    setSelectedAuditMint(report.mint);
    await syncState();
    return report;
  };

  const handleBuy = async (mint: string) => {
    await apiJson(`/api/buy/${encodeURIComponent(mint)}`, { method: 'POST' });
    await syncState();
  };

  const handleSell = async (mint: string, pct: number) => {
    await apiJson(`/api/sell/${encodeURIComponent(mint)}`, {
      method: 'POST',
      body: JSON.stringify({ pct, confirm: true }),
    });
    await syncState();
  };

  const handleToggleBot = async (botId: BotId, paused: boolean) => {
    await apiJson(`/api/bots/${botId}/${paused ? 'pause' : 'resume'}`, { method: 'POST' });
    await syncState();
  };

  const handleToggleStrat = async (stratId: StratId, enabled: boolean) => {
    await apiJson(`/api/strats/${stratId}`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    await syncState();
  };

  const handleSwitchMode = async (mode: DeskMode, confirmText?: string) => {
    const res = await apiJson<{ mode: DeskMode; state?: DeskState }>('/api/mode', {
      method: 'POST',
      body: JSON.stringify({ mode, confirm: confirmText }),
    });
    if (res.state) {
      setState(res.state);
      setOfflineMsg(null);
      void fetchChart(chartRange);
    } else {
      await syncState();
    }
  };

  const handleUpdateSetting = async (key: keyof DeskSettings, value: unknown) => {
    await apiJson('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
    await syncState();
  };

  const handleOverrideRegime = async (override: MarketMode | 'AUTO') => {
    await apiJson('/api/regime/override', {
      method: 'POST',
      body: JSON.stringify({ override }),
    });
    await syncState();
  };

  const handleToggleLesson = async (tag: string, status: 'active' | 'watch' | 'archived') => {
    await apiJson(`/api/lessons/${encodeURIComponent(tag)}`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    await syncState();
  };

  const handleToggleCopyTrader = async (id: string, copyOn: boolean) => {
    await apiJson(`/api/picks/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ copyOn }),
    });
    await syncState();
  };

  const handleAnswerQuestion = async (id: string, answer: 'yes' | 'no') => {
    await apiJson('/api/morning/answer', {
      method: 'POST',
      body: JSON.stringify({ id, answer }),
    });
    await syncState();
  };

  const handleFlatAll = async () => {
    await apiJson('/api/flat', { method: 'POST' });
    await syncState();
  };

  const handleResetPaper = async () => {
    await apiJson('/api/reset-paper', { method: 'POST' });
    await syncState();
  };

  const handleCommand = async (command: string) => {
    const res = await apiJson<{ ok: boolean; reply: string }>('/api/command', {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
    await syncState();
    return res;
  };

  const openAuditFor = (mint: string | null) => {
    setSelectedCoinMint(null);
    setSelectedAuditMint(mint);
    setAuditModalOpen(true);
  };

  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: t.home, icon: Home },
    { id: 'bots', label: t.bots, icon: Cpu },
    { id: 'activity', label: t.activity, icon: Activity },
    { id: 'account', label: t.account, icon: SlidersHorizontal },
  ];

  // Skeleton loading state matching STEP 10 (#1c1c1e blocks in final layout)
  if (!state) {
    return (
      <div className="min-h-screen bg-black text-white p-6 max-w-6xl mx-auto space-y-6">
        <div className="h-12 w-56 rounded-xl bg-[#1c1c1e] animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-72 rounded-3xl bg-[#1c1c1e] animate-pulse" />
          <div className="lg:col-span-5 h-72 rounded-3xl bg-[#1c1c1e] animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-[#1c1c1e] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const activePosition = selectedCoinMint
    ? state.positions.find((p) => p.mint === selectedCoinMint)
    : undefined;
  const activeCoin = selectedCoinMint
    ? state.auditedCoins.find((c) => c.mint === selectedCoinMint)
    : undefined;
  const auditedTarget = selectedAuditMint
    ? state.auditedCoins.find((c) => c.mint === selectedAuditMint) ?? null
    : state.auditedCoins[0] ?? null;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col lg:flex-row">
      {/* Desktop Sidebar Navigation (240px on lg:) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 border-r border-[rgba(84,84,88,0.45)] bg-black px-4 py-6 justify-between">
        <div>
          <button
            type="button"
            onClick={() => setTab('home')}
            className="text-left px-3 py-1 text-base font-bold tracking-tight text-white whitespace-nowrap cursor-pointer"
          >
            Meme Coin Trading Bot
          </button>

          <nav className="mt-8 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1c1c1e] text-white'
                      : 'text-[rgba(235,235,245,0.55)] hover:text-white hover:bg-[#1c1c1e]/50'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-8 pt-6 border-t border-[rgba(84,84,88,0.35)] space-y-2 px-1">
            <button
              type="button"
              onClick={() => openAuditFor(null)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4 text-[#64d2ff]" />
              <span>{t.auditMint}</span>
            </button>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-[#00d35a]" />
              <span>{t.commands}</span>
            </button>
          </div>
        </div>

        {/* FOMO Profile Shortcut & Language Toggle */}
        <div className="pt-4 border-t border-[rgba(84,84,88,0.35)] space-y-3">
          <button
            type="button"
            onClick={() => setTab('account')}
            className="w-full px-2.5 py-2 rounded-xl hover:bg-[#1c1c1e] flex items-center gap-2.5 text-left transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-[#1c1c1e] border border-[rgba(84,84,88,0.6)] flex items-center justify-center text-[11px] font-bold font-mono-num text-white shrink-0">
              {state.settings.fomo_handle.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate font-mono-num">
                @{state.settings.fomo_handle}
              </div>
              <div className="text-[10px] text-[rgba(235,235,245,0.45)]">
                {lang === 'ja' ? 'FOMOプロフィール変更' : 'Edit FOMO profile'}
              </div>
            </div>
          </button>

          <div className="px-2.5 flex items-center justify-between text-xs">
            <span className="font-mono-num flex items-center gap-1.5">
              <span
                className={
                  state.mode === 'LIVE' ? 'text-[#00d35a] font-bold' : 'text-[#ff9f0a] font-bold'
                }
              >
                {state.mode}
              </span>
              <span className="text-[rgba(235,235,245,0.35)]">·</span>
              <span className="text-[rgba(235,235,245,0.6)]">{state.regime.mode}</span>
            </span>
            <button
              type="button"
              onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
              className="px-2 py-1 rounded-md bg-[#1c1c1e] text-white font-mono-num hover:bg-[#2c2c2e] cursor-pointer"
            >
              {lang === 'ja' ? 'EN' : '日本語'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-60 flex flex-col min-h-screen">
        {/* Compact Top Bar (Mobile & Desktop) */}
        <header className="sticky top-0 z-30 bg-black/85 backdrop-blur-md border-b border-[rgba(84,84,88,0.35)] px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setTab('account')}
              className="w-8 h-8 rounded-full bg-[#1c1c1e] border border-[rgba(84,84,88,0.6)] flex items-center justify-center text-xs font-bold font-mono-num text-white shrink-0 cursor-pointer lg:hidden"
              aria-label="Account"
            >
              {state.settings.fomo_handle.slice(0, 2).toUpperCase()}
            </button>
            <span className="text-sm font-bold text-white truncate whitespace-nowrap">
              {tab === 'home'
                ? 'Meme Coin Trading Bot'
                : tab === 'bots'
                  ? t.bots
                  : tab === 'activity'
                    ? t.activity
                    : t.account}
            </span>
            <button
              type="button"
              onClick={() => setTab('account')}
              className={`text-xs font-mono-num font-bold tracking-wide cursor-pointer whitespace-nowrap ${
                state.mode === 'LIVE' ? 'text-[#00d35a]' : 'text-[#ff9f0a]'
              }`}
              title={lang === 'ja' ? '取引モード設定へ' : 'Trading mode settings'}
            >
              {state.mode}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openAuditFor(null)}
              className="min-h-[38px] px-3 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-[#64d2ff]" />
              <span className="hidden sm:inline">{t.auditMint}</span>
            </button>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="min-h-[38px] px-3 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-[#00d35a]" />
              <span className="hidden sm:inline">{t.commands}</span>
            </button>
            <button
              type="button"
              onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
              className="lg:hidden min-h-[38px] px-2.5 rounded-xl bg-[#1c1c1e] text-xs font-mono-num text-white cursor-pointer"
            >
              {lang === 'ja' ? 'EN' : 'JP'}
            </button>
          </div>
        </header>

        {/* STEP 10 Error Banner (1 red row under navbar, keeps last good numbers) */}
        {offlineMsg && (
          <div className="bg-[#ff453a]/15 border-b border-[#ff453a]/30 px-4 py-2 text-xs text-[#ff453a] flex items-center justify-between">
            <span>{offlineMsg}</span>
            <button
              type="button"
              onClick={() => void fetchInitial()}
              className="inline-flex items-center gap-1 font-semibold underline cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        {/* Viewport Container */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-24 lg:pb-10">
          {tab === 'home' && (
            <HomeView
              state={state}
              chartPoints={chartPoints}
              chartRange={chartRange}
              lang={lang}
              scanning={scanning}
              onRangeChange={setChartRange}
              onOpenCoin={(mint) => setSelectedCoinMint(mint)}
              onOpenAudit={(mint) => openAuditFor(mint)}
              onSeeAllActivity={() => setTab('activity')}
              onOpenBots={() => setTab('bots')}
              onRunScan={handleRunScan}
              onOverrideRegime={handleOverrideRegime}
            />
          )}

          {tab === 'bots' && (
            <BotsView
              state={state}
              lang={lang}
              scanning={scanning}
              onToggleBot={handleToggleBot}
              onToggleStrat={handleToggleStrat}
              onRunScan={handleRunScan}
              onOpenAudit={(mint) => openAuditFor(mint)}
              onOpenAccountSettings={() => setTab('account')}
            />
          )}

          {tab === 'activity' && (
            <ActivityView
              state={state}
              lang={lang}
              onOpenCoin={(mint) => setSelectedCoinMint(mint)}
              onOpenAudit={(mint) => openAuditFor(mint)}
              onToggleLesson={handleToggleLesson}
              onToggleCopyTrader={handleToggleCopyTrader}
              onAnswerQuestion={handleAnswerQuestion}
            />
          )}

          {tab === 'account' && (
            <AccountView
              state={state}
              lang={lang}
              onSwitchMode={handleSwitchMode}
              onUpdateSetting={handleUpdateSetting}
              onFlatAll={handleFlatAll}
              onResetPaper={handleResetPaper}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (STEP 10: Blurred, Home · Bots · Activity · Account) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/85 backdrop-blur-xl border-t border-[rgba(84,84,88,0.45)] pb-safe">
        <div className="grid grid-cols-4 h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  active ? 'text-white' : 'text-[rgba(235,235,245,0.45)]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Coin Screen Modal */}
      {selectedCoinMint && (activePosition || activeCoin) && (
        <CoinModal
          position={activePosition}
          coin={activeCoin}
          lang={lang}
          onClose={() => setSelectedCoinMint(null)}
          onOpenAudit={(mint) => openAuditFor(mint)}
          onSell={handleSell}
          onBuy={handleBuy}
        />
      )}

      {/* 8-Layer Audit Modal */}
      {auditModalOpen && (
        <AuditModal
          coin={auditedTarget}
          lang={lang}
          onClose={() => setAuditModalOpen(false)}
          onAuditMint={handleAuditMint}
          onBuy={handleBuy}
        />
      )}

      {/* Plain-Text Command Console Drawer */}
      {commandOpen && (
        <CommandDrawer
          lang={lang}
          onClose={() => setCommandOpen(false)}
          onExecute={handleCommand}
        />
      )}
    </div>
  );
}
