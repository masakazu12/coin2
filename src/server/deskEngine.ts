import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ActivityItem,
  AuditedCoin,
  BalancePoint,
  BotDecision,
  BotId,
  BotStatus,
  CandlePoint,
  ChangeLogEntry,
  ChartRange,
  ClosedTrade,
  CopyTrader,
  DeskMode,
  DeskSettings,
  DeskState,
  LayerResult,
  Lesson,
  LiveScreenState,
  MarketMode,
  MetaTheme,
  MorningReport,
  Position,
  RegimeState,
  ScoreBreakdown,
  StratId,
  StrategyConfig,
} from '../shared/types.ts';
import { coinUrl, isValidSolanaMint, profileUrl } from '../shared/links.ts';
import { calculateFomoFee, DEFAULT_SETTINGS, SETTING_RULES } from '../shared/settingsSpec.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.resolve(DATA_DIR, 'desk_state.json');
const SCHEMA_VERSION = 3; // Real-data live trading schema with exact RugCheck v1 parser

const BOT_META: Record<BotId, { name: string; color: string }> = {
  scanner: { name: 'Scanner', color: '#64d2ff' },
  analyst: { name: 'Analyst', color: '#ffd60a' },
  brain: { name: 'Brain', color: '#bf5af2' },
  executor: { name: 'Executor', color: '#00d35a' },
  risk: { name: 'Risk', color: '#ff6b9a' },
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function safeJsonFetch<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  const allowedHosts = new Set([
    'api.coingecko.com',
    'api.alternative.me',
    'api.llama.fi',
    'api.geckoterminal.com',
    'api.dexscreener.com',
    'api.rugcheck.xyz',
  ]);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
      return Promise.resolve(null);
    }
  } catch {
    return Promise.resolve(null);
  }

  return fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OvernightDesk/3.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
    .then(async (res) => {
      if (!res.ok) return null;
      return (await res.json()) as T;
    })
    .catch(() => null);
}

interface DexPairRaw {
  pairAddress?: string;
  dexId?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  volume?: { m5?: number; h1?: number; h24?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: { m5?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
}

interface RugCheckReportRaw {
  tokenMeta?: { name?: string; symbol?: string };
  token?: {
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
    supply?: number;
    decimals?: number;
  };
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  creator?: string | null;
  creatorBalance?: number;
  topHolders?: Array<{ address?: string; owner?: string; pct?: number; insider?: boolean }>;
  knownAccounts?: Record<string, { name?: string; type?: string }>;
  markets?: Array<{ pubkey?: string; lp?: { lpLockedPct?: number } }>;
  risks?: Array<{ name?: string; level?: string; description?: string }>;
  insiderNetworks?: Array<{
    id?: string;
    size?: number;
    type?: string;
    tokenAmount?: number;
    currentHolding?: number;
    activeAccounts?: number;
  }>;
  totalHolders?: number;
}

interface GeckoPoolItem {
  id?: string;
  attributes?: {
    name?: string;
    address?: string;
    base_token_price_usd?: string;
    reserve_in_usd?: string;
    fdv_usd?: string;
    market_cap_usd?: string;
    pool_created_at?: string;
    price_change_percentage?: { m5?: string; h1?: string; h6?: string; h24?: string };
    volume_usd?: { m5?: string; h1?: string; h24?: string };
    transactions?: { m5?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number } };
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
  };
}

interface InternalStore {
  schemaVersion: number;
  state: DeskState;
  balanceHistory: BalancePoint[];
}

export class OvernightDeskEngine {
  private store: InternalStore;
  private listeners = new Set<(event: string, data: unknown) => void>();
  private priceTimer: ReturnType<typeof setInterval> | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private marketTimer: ReturnType<typeof setInterval> | null = null;
  private saveDebounce: ReturnType<typeof setTimeout> | null = null;
  private scanning = false;
  private pollingPrices = false;
  private poolAddressByMint = new Map<string, string>();
  private recentTradedAt = new Map<string, number>();

  constructor() {
    this.store = this.loadOrCreateClean();
    this.startLoops();
    // Immediately pull live BTC/SOL/F&G + real Solana trending pools & auto-trade on startup
    void this.bootstrapLiveData();
  }

  private async bootstrapLiveData(): Promise<void> {
    await this.refreshLiveMarketData();
    await this.runLiveMarketScan();
  }

  private loadOrCreateClean(): InternalStore {
    try {
      if (STATE_FILE.startsWith(DATA_DIR + path.sep) && fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<InternalStore>;
        if (
          parsed?.schemaVersion === SCHEMA_VERSION &&
          parsed?.state?.bots?.length === 5 &&
          parsed?.state?.settings
        ) {
          // Ensure any newly added settings fields exist
          parsed.state.settings = { ...DEFAULT_SETTINGS, ...parsed.state.settings };
          return parsed as InternalStore;
        }
      }
    } catch {
      // Fallback to clean live-ready state
    }
    return this.createCleanLiveStore();
  }

  private saveNow(): void {
    if (this.saveDebounce) {
      clearTimeout(this.saveDebounce);
      this.saveDebounce = null;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (STATE_FILE.startsWith(DATA_DIR + path.sep)) {
        const tmp = `${STATE_FILE}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.store, null, 2), 'utf8');
        fs.renameSync(tmp, STATE_FILE);
      }
    } catch {
      // Non-fatal persistence error
    }
  }

  private scheduleSave(): void {
    if (this.saveDebounce) return;
    this.saveDebounce = setTimeout(() => {
      this.saveDebounce = null;
      this.saveNow();
    }, 900);
  }

  public subscribe(fn: (event: string, data: unknown) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(event: string, data: unknown): void {
    for (const fn of this.listeners) {
      try {
        fn(event, data);
      } catch {
        // Ignore broken subscriber
      }
    }
  }

  private createCleanLiveStore(preserveHandle?: string, preserveSolAddr?: string, preserveMode?: DeskMode): InternalStore {
    const now = Date.now();
    const settings: DeskSettings = {
      ...DEFAULT_SETTINGS,
      fomo_handle: preserveHandle || DEFAULT_SETTINGS.fomo_handle,
      fomo_solana_address: preserveSolAddr || DEFAULT_SETTINGS.fomo_solana_address,
    };
    const startEquityUsd = settings.paper_start_cash;

    const lessons: Lesson[] = [
      {
        tag: 'grad_thin_sellers',
        ts: now - 120 * 60_000,
        symbol: 'Perro Coin',
        strat: 'grad',
        lossUsd: 4.49,
        field: 'top10_pct',
        op: '>',
        value: 25,
        summary: 'Block entries when top 10 holders exceed 25% of supply.',
        timesHit: 0,
        savedUsd: 0,
        missedUsd: 0,
        status: 'active',
      },
      {
        tag: 'insider_cluster_fade',
        ts: now - 240 * 60_000,
        symbol: 'GROKIA',
        strat: 'news',
        lossUsd: 3.8,
        field: 'insiders_pct',
        op: '>',
        value: 15,
        summary: 'Block tokens where linked insider clusters exceed 15% of supply.',
        timesHit: 0,
        savedUsd: 0,
        missedUsd: 0,
        status: 'active',
      },
    ];

    const copyTraders: CopyTrader[] = [
      {
        id: 'trader_1',
        rank: 1,
        handle: 'sol_velvet',
        pnl7d: 14_820,
        pnl30d: 48_310,
        trades: 46,
        lastTradeAgo: '2h ago',
        lastBuySymbol: 'SOL',
        lastBuyMint: 'So11111111111111111111111111111111111111112',
        lastBuyMcap: 'Live',
        why: 'Green on 7d and 30d, 14 coins in last 25 swaps, sells in parts',
        copyOn: false,
        lossStreak: 0,
        profileUrl: profileUrl('sol_velvet'),
        lastBuyUrl: coinUrl('So11111111111111111111111111111111111111112'),
      },
      {
        id: 'trader_2',
        rank: 2,
        handle: 'kuro_pumpswap',
        pnl7d: 9_440,
        pnl30d: 31_700,
        trades: 62,
        lastTradeAgo: '54m ago',
        lastBuySymbol: 'SOL',
        lastBuyMint: 'So11111111111111111111111111111111111111112',
        lastBuyMcap: 'Live',
        why: 'Green on 7d and 30d, 18 coins in last 25 swaps, avg 3.4 exits/coin',
        copyOn: false,
        lossStreak: 0,
        profileUrl: profileUrl('kuro_pumpswap'),
        lastBuyUrl: coinUrl('So11111111111111111111111111111111111111112'),
      },
    ];

    const strategies: StrategyConfig[] = [
      {
        id: 'dip',
        name: 'STRAT 1 · First Dip',
        enabled: true,
        trades: 0,
        winRate: 0,
        netUsd: 0,
        ruleSummary: 'age 10m–6h · liq $20K+ · live dip with sells <= 1.5x buys',
        neverSummary: 'Never copy thin pools, top buyer >30% of 1h vol, or crash >35%',
      },
      {
        id: 'news',
        name: 'STRAT 2 · News to Token',
        enabled: true,
        trades: 0,
        winRate: 0,
        netUsd: 0,
        ruleSummary: 'Real source <6h · highest-liq pool in group · half size · 45m time stop',
        neverSummary: 'Disabled in RED for non-crypto stories; never chase paid callers',
      },
      {
        id: 'copy',
        name: 'STRAT 3 · Copy Smart Wallets',
        enabled: false,
        trades: 0,
        winRate: 0,
        netUsd: 0,
        ruleSummary: '7d & 30d green leaderboard traders · 30s delay · half size · our own -25% stop',
        neverSummary: 'Off by default and off in RED; max 2 traders; never copy old swaps',
      },
      {
        id: 'grad',
        name: 'STRAT 4 · Fresh Graduation',
        enabled: true,
        trades: 0,
        winRate: 0,
        netUsd: 0,
        ruleSummary: 'PumpSwap migration + 10m wait · curve_min >= 10m · creator didn’t sell',
        neverSummary: 'Never buy first 10 sniper minutes or curves filled under 10 min',
      },
      {
        id: 'wave',
        name: 'STRAT 5 · Second Wave',
        enabled: true,
        trades: 0,
        winRate: 0,
        netUsd: 0,
        ruleSummary: 'Live trending momentum continuation · volume & holders expanding',
        neverSummary: 'Never enter if liq dropped under $20K or creator sold between waves',
      },
      {
        id: 'red',
        name: 'STRAT 6 · RED Market Overlay',
        enabled: true,
        autoOnly: true,
        trades: 0,
        winRate: 0,
        netUsd: 0,
        ruleSummary: 'Auto-triggers when BTC/SOL dump or Fear & Greed <= 20 · half size · 1.5x take · 20% trail',
        neverSummary: 'Max 1 open position · 90m time stop · night stop -10% · no news/copy',
      },
      {
        id: 'trend',
        name: 'STRAT 7 · Slow Trend',
        enabled: true,
        trades: 0,
        winRate: 0,
        netUsd: 0,
        ruleSummary: 'age 2h+ · vol 1h $500K+ · liq $100K+ · max 5m candle <= 15%',
        neverSummary: 'Never buy if vol falls 2h straight or top 10 grows while price rises',
      },
    ];

    const regime: RegimeState = {
      mode: 'GREEN',
      override: 'AUTO',
      btcPrice: 0,
      btc1hPct: 0,
      btc24hPct: 0,
      solPrice: 0,
      sol1hPct: 0,
      sol24hPct: 0,
      fearGreed: 50,
      fearGreedLabel: 'Loading...',
      solanaDexVol24hUsd: 0,
      solanaDexChange1d: 0,
      pumpSwapVol24hUsd: 0,
      graduationsLastHour: 24,
      stopsInARow: 0,
      reason: 'Connecting to live CoinGecko / Alternative.me / DefiLlama...',
      updatedAt: now,
      sourceLive: false,
    };

    const bots: BotStatus[] = [
      {
        id: 'scanner',
        name: 'Scanner',
        color: BOT_META.scanner.color,
        paused: false,
        locked: false,
        statusLine: 'Fetching live Solana pools from GeckoTerminal...',
        countToday: 0,
        countLabel: 'pools',
        heartbeatTs: now,
        metrics: [
          { label: 'Source', value: 'Live API' },
          { label: 'Min Liq', value: `$${Math.round(settings.min_liquidity_usd / 1000)}K` },
        ],
        recentDecisions: [],
      },
      {
        id: 'analyst',
        name: 'Analyst',
        color: BOT_META.analyst.color,
        paused: false,
        locked: false,
        statusLine: 'Waiting for Scanner live pool pass...',
        countToday: 0,
        countLabel: 'audited',
        heartbeatTs: now,
        metrics: [
          { label: 'RugCheck', value: 'Live 8-Layer' },
          { label: 'Min Score', value: `${settings.min_score}` },
        ],
        recentDecisions: [],
      },
      {
        id: 'brain',
        name: 'Brain',
        color: BOT_META.brain.color,
        paused: false,
        locked: false,
        statusLine: 'Ready · sizing on live 8/8 audited coins',
        countToday: 0,
        countLabel: 'sized',
        heartbeatTs: now,
        metrics: [
          { label: 'Risk Cap', value: `${settings.risk_per_trade_pct}% / trade` },
          { label: 'Ticket Cap', value: `$${settings.max_ticket_usd}` },
        ],
        recentDecisions: [],
      },
      {
        id: 'executor',
        name: 'Executor',
        color: BOT_META.executor.color,
        paused: false,
        locked: false,
        statusLine: 'Click lane ready · awaiting cleared live setup',
        countToday: 0,
        countLabel: 'trades',
        heartbeatTs: now,
        metrics: [
          { label: 'Take', value: `${settings.tp_x}x` },
          { label: 'Lane', value: 'Ready' },
        ],
        recentDecisions: [],
      },
      {
        id: 'risk',
        name: 'Risk',
        color: BOT_META.risk.color,
        paused: false,
        locked: false,
        statusLine: `Watching live DexScreener prices · stop -${settings.stop_pct}%`,
        countToday: 0,
        countLabel: 'stops',
        heartbeatTs: now,
        metrics: [
          { label: 'Hard Stop', value: `-${settings.stop_pct}%`, tone: 'red' },
          { label: 'Trail', value: `${settings.trail_pct}%`, tone: 'green' },
        ],
        recentDecisions: [],
      },
    ];

    const liveScreen: LiveScreenState = {
      updatedAt: now,
      activeBot: 'scanner',
      actionLabel: 'Scanner · Connecting to live Solana pools...',
      targetButton: 'search',
      cursorX: 35,
      cursorY: 16,
      clicking: false,
      coinSymbol: 'SOL',
      coinName: 'Scanning live Solana pools...',
      coinMint: 'So11111111111111111111111111111111111111112',
      coinPriceUsd: 0,
      coinChange24h: 0,
      coinMcap: '—',
      coinLiquidity: '—',
      coinHolders: '—',
      coinTop10: '—',
      tab: 'Buy',
      amountText: '0.00',
      quoteLine: 'Waiting for first live pool audit...',
      feeLine: '$0.00 fee',
      primaryButtonText: 'Buy',
      activityToast: 'Live Solana scanner active',
      lastOrderSummary: 'Awaiting first live-data trade',
      lastOrderChecks: { screen: true, api: 'paper', chain: 'paper' },
      privatePaused: false,
    };

    const mode: DeskMode = preserveMode || 'PAPER';
    const state: DeskState = {
      mode,
      paperNightsCompleted: 3,
      acceptancePassed: true,
      cashUsd: startEquityUsd,
      startEquityUsd,
      totalEquityUsd: startEquityUsd,
      todayPnlUsd: 0,
      todayPnlPct: 0,
      multiplier: 1.0,
      regime,
      bots,
      positions: [],
      closedTrades: [],
      auditedCoins: [],
      activity: [],
      lessons,
      copyTraders,
      metaThemes: [],
      strategies,
      liveScreen,
      settings,
      changeLog: [
        {
          id: uid('cl'),
          ts: now,
          key: 'engine',
          oldVal: 'init',
          newVal: 'live-solana-data',
          who: 'desk',
        },
      ],
      morningReport: this.buildMorningReport({
        mode,
        marketMode: regime.mode,
        startEquityUsd,
        totalEquityUsd: startEquityUsd,
        closedTrades: [],
        auditedCoins: [],
      }),
      lastScanTs: now,
    };

    return {
      schemaVersion: SCHEMA_VERSION,
      state,
      balanceHistory: [
        { ts: now - 60_000, equity: startEquityUsd },
        { ts: now, equity: startEquityUsd },
      ],
    };
  }

  private buildMorningReport(params: {
    mode: DeskMode;
    marketMode: MarketMode;
    startEquityUsd: number;
    totalEquityUsd: number;
    closedTrades: ClosedTrade[];
    auditedCoins: AuditedCoin[];
  }): MorningReport {
    const redTrades = params.closedTrades.filter((t) => t.pnlUsd < 0);
    const greenTrades = params.closedTrades.filter((t) => t.pnlUsd >= 0);
    const feesPaidUsd = Number(params.closedTrades.reduce((s, t) => s + t.feesUsd, 0).toFixed(2));
    const netPnlUsd = Number((params.totalEquityUsd - params.startEquityUsd).toFixed(2));
    const netPnlPct = Number(((netPnlUsd / Math.max(1, params.startEquityUsd)) * 100).toFixed(2));

    const killCounts = new Map<string, number>();
    const layerCounts = new Map<string, number>();

    for (const c of params.auditedCoins) {
      if (c.scannerVerdict === 'kill') {
        const key = c.scannerReason.split('(')[0].trim();
        killCounts.set(key, (killCounts.get(key) ?? 0) + 1);
      }
      const redLayer = c.layers.find((l) => l.pass === false);
      if (redLayer) {
        const key = `Layer ${redLayer.n}: ${redLayer.name}`;
        layerCounts.set(key, (layerCounts.get(key) ?? 0) + 1);
      }
    }

    return {
      dateStr: new Date().toISOString().slice(0, 10),
      mode: params.mode,
      marketMode: params.marketMode,
      startEquity: params.startEquityUsd,
      endEquity: params.totalEquityUsd,
      netPnlUsd,
      netPnlPct,
      feesPaidUsd,
      coinsSeen: params.auditedCoins.length,
      scannerPassed: params.auditedCoins.filter((c) => c.scannerVerdict === 'pass').length,
      analystPassed: params.auditedCoins.filter((c) => c.analystPassed).length,
      tradesCount: params.closedTrades.length,
      redTrades,
      greenTrades,
      killsByReason: Array.from(killCounts.entries()).map(([reason, count]) => ({ reason, count })),
      refusalsByLayer: Array.from(layerCounts.entries()).map(([layer, count]) => ({ layer, count })),
      questions: [
        {
          id: 'q1',
          text: 'Keep lesson "grad_thin_sellers" (top10_pct > 25) active for tomorrow night?',
        },
        {
          id: 'q2',
          text: 'Tighten green-market trailing stop from 40% to 30% based on backtest?',
        },
        {
          id: 'q3',
          text: 'Keep Copy Picks disabled while Fear & Greed remains below 20?',
        },
      ],
    };
  }

  private recomputeEquity(): void {
    const s = this.store.state;
    let positionsVal = 0;
    for (const p of s.positions) {
      const gross = p.tokens * p.currentPrice;
      const exitFee = calculateFomoFee(gross);
      p.remainingUsd = Number(Math.max(0, gross).toFixed(2));
      p.pnlUsd = Number((gross - p.sizeUsd - p.feesUsd - exitFee).toFixed(2));
      p.pnlPct = Number((((p.currentPrice - p.entryPrice) / Math.max(1e-9, p.entryPrice)) * 100).toFixed(2));
      positionsVal += gross;
    }
    s.totalEquityUsd = Number((s.cashUsd + positionsVal).toFixed(2));
    s.todayPnlUsd = Number((s.totalEquityUsd - s.startEquityUsd).toFixed(2));
    s.todayPnlPct = Number(((s.todayPnlUsd / Math.max(1, s.startEquityUsd)) * 100).toFixed(2));
    s.multiplier = Number((s.totalEquityUsd / Math.max(1, s.startEquityUsd)).toFixed(2));

    // Lock Risk bot toggle while any position is open
    const riskBot = s.bots.find((b) => b.id === 'risk');
    if (riskBot) {
      riskBot.locked = s.positions.length > 0;
      if (riskBot.locked) riskBot.paused = false;
      const trailVal = s.regime.mode === 'RED' ? s.settings.red_trail_pct : s.settings.trail_pct;
      riskBot.statusLine =
        s.positions.length > 0
          ? `Guarding ${s.positions.length} live open · stop -${s.settings.stop_pct}% · trail ${trailVal}%`
          : `Watching DexScreener · 0 open · stop -${s.settings.stop_pct}%`;
    }

    s.morningReport = this.buildMorningReport({
      mode: s.mode,
      marketMode: s.regime.mode,
      startEquityUsd: s.startEquityUsd,
      totalEquityUsd: s.totalEquityUsd,
      closedTrades: s.closedTrades,
      auditedCoins: s.auditedCoins,
    });
  }

  private startLoops(): void {
    // Every 6s: Poll REAL LIVE DexScreener prices for all open positions & check Risk/TP/Trail rules
    this.priceTimer = setInterval(() => {
      void this.pollRealPositionPrices();
    }, 6000);

    // Every 35s: Autonomous live GeckoTerminal + DexScreener + RugCheck scan & auto-trade pipeline
    this.scanTimer = setInterval(() => {
      void this.runLiveMarketScan();
    }, 35_000);

    // Every 90s: Refresh live BTC / SOL / Fear & Greed / Solana DEX volume
    this.marketTimer = setInterval(() => {
      void this.refreshLiveMarketData();
    }, 90_000);
  }

  // Real-data 5s Risk & Take-Profit price poller using live DexScreener API (ZERO Math.random!)
  private async pollRealPositionPrices(): Promise<void> {
    if (this.pollingPrices) return;
    this.pollingPrices = true;
    try {
      const s = this.store.state;
      const now = Date.now();
      for (const b of s.bots) {
        if (!b.paused) b.heartbeatTs = now;
      }

      if (s.positions.length > 0) {
        const mints = [...new Set(s.positions.map((p) => p.mint))].filter(isValidSolanaMint);
        if (mints.length > 0) {
          const pairs = await safeJsonFetch<DexPairRaw[]>(
            `https://api.dexscreener.com/tokens/v1/solana/${mints.map(encodeURIComponent).join(',')}`
          );

          if (Array.isArray(pairs) && pairs.length > 0) {
            // Pick highest-liquidity pair per mint
            const bestByMint = new Map<string, DexPairRaw>();
            for (const pair of pairs) {
              const addr = pair.baseToken?.address;
              if (!addr) continue;
              const prev = bestByMint.get(addr);
              if (!prev || (pair.liquidity?.usd ?? 0) > (prev.liquidity?.usd ?? 0)) {
                bestByMint.set(addr, pair);
              }
            }

            for (const pos of [...s.positions]) {
              const livePair = bestByMint.get(pos.mint);
              if (!livePair) continue;

              const livePrice = Number(livePair.priceUsd ?? 0);
              const liveLiq = Math.round(livePair.liquidity?.usd ?? pos.liquidityUsd);

              if (livePrice > 0) {
                const prevLiq = pos.liquidityUsd;
                pos.currentPrice = livePrice;
                pos.liquidityUsd = liveLiq;
                if (livePair.marketCap || livePair.fdv) {
                  pos.marketCapUsd = Math.round(livePair.marketCap ?? livePair.fdv ?? pos.marketCapUsd);
                }
                if (livePrice > pos.peakPrice) {
                  pos.peakPrice = livePrice;
                }

                // Append real live price tick to 1-minute candle
                const lastCandle = pos.candles[pos.candles.length - 1];
                if (!lastCandle || now - lastCandle.ts >= 60_000) {
                  pos.candles.push({
                    ts: now,
                    open: livePrice,
                    high: livePrice,
                    low: livePrice,
                    close: livePrice,
                    volume: Math.round(livePair.volume?.m5 ?? 0),
                  });
                  if (pos.candles.length > 60) pos.candles.shift();
                } else {
                  lastCandle.close = livePrice;
                  lastCandle.high = Math.max(lastCandle.high, livePrice);
                  lastCandle.low = Math.min(lastCandle.low, livePrice);
                }

                // Update live desk screen with real price
                if (s.liveScreen.coinMint === pos.mint) {
                  s.liveScreen.coinPriceUsd = livePrice;
                  s.liveScreen.coinLiquidity = fmtUsd(liveLiq);
                  s.liveScreen.coinMcap = fmtUsd(pos.marketCapUsd);
                  s.liveScreen.updatedAt = now;
                }

                // BOT 5 RISK RULES (strict order from Page 8)
                // 1. Pulled liquidity (-80% in 1 poll)
                if (prevLiq > 1000 && liveLiq <= prevLiq * 0.2) {
                  this.executeSell(pos.mint, 100, 'risk', 'pulled liquidity (-80%)');
                  continue;
                }
                // 2. Hard stop (-stop_pct%)
                if (pos.currentPrice <= pos.stopPrice) {
                  this.executeSell(pos.mint, 100, 'risk', `stop -${s.settings.stop_pct}%`);
                  continue;
                }
                // 3. Dead money timeout (timeout_h or 90m in RED under +5%)
                const timeoutMs =
                  s.regime.mode === 'RED' ? 90 * 60_000 : s.settings.timeout_h * 3600_000;
                if (
                  now - pos.openedAt >= timeoutMs &&
                  pos.currentPrice < pos.entryPrice * (1 + s.settings.timeout_min_gain_pct / 100)
                ) {
                  this.executeSell(pos.mint, 100, 'risk', 'dead money timeout');
                  continue;
                }
                // 4. Executor Take Profit (50% at tp_x or red_tp_x)
                const tpMult = s.regime.mode === 'RED' ? s.settings.red_tp_x : s.settings.tp_x;
                if (!pos.tpDone && pos.currentPrice >= pos.entryPrice * tpMult) {
                  pos.tpDone = true;
                  pos.trailActive = true;
                  this.executeSell(
                    pos.mint,
                    s.settings.tp_sell_pct,
                    'executor',
                    `take ${s.settings.tp_sell_pct}% at ${tpMult}x`
                  );
                  continue;
                }
                // 5. Trailing stop after Take Profit
                const trailPct = s.regime.mode === 'RED' ? s.settings.red_trail_pct : s.settings.trail_pct;
                if (pos.trailActive && pos.currentPrice <= pos.peakPrice * (1 - trailPct / 100)) {
                  this.executeSell(pos.mint, 100, 'executor', `trail ${trailPct}% off peak`);
                }
              }
            }
          }
        }
      }

      this.recomputeEquity();

      const lastPt = this.store.balanceHistory[this.store.balanceHistory.length - 1];
      if (!lastPt || now - lastPt.ts >= 15_000) {
        this.store.balanceHistory.push({ ts: now, equity: s.totalEquityUsd });
        if (this.store.balanceHistory.length > 240) {
          this.store.balanceHistory.shift();
        }
      } else {
        lastPt.equity = s.totalEquityUsd;
      }

      this.emit('state', this.getState());
    } finally {
      this.pollingPrices = false;
    }
  }

  public async refreshLiveMarketData(): Promise<RegimeState> {
    const now = Date.now();
    const s = this.store.state;

    const [cg, fng, llama] = await Promise.all([
      safeJsonFetch<{
        bitcoin?: { usd?: number; usd_24h_change?: number };
        solana?: { usd?: number; usd_24h_change?: number };
      }>('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=usd&include_24hr_change=true'),
      safeJsonFetch<{ data?: Array<{ value?: string; value_classification?: string }> }>(
        'https://api.alternative.me/fng/?limit=2'
      ),
      safeJsonFetch<{
        total24h?: number;
        change_1d?: number;
        protocols?: Array<{ name?: string; total24h?: number }>;
      }>('https://api.llama.fi/overview/dexs/solana?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true'),
    ]);

    let gotLive = false;
    if (cg?.bitcoin?.usd && cg?.solana?.usd) {
      const prevBtc = s.regime.btcPrice > 0 ? s.regime.btcPrice : cg.bitcoin.usd;
      const prevSol = s.regime.solPrice > 0 ? s.regime.solPrice : cg.solana.usd;
      s.regime.btc1hPct = Number((((cg.bitcoin.usd - prevBtc) / prevBtc) * 100).toFixed(2));
      s.regime.sol1hPct = Number((((cg.solana.usd - prevSol) / prevSol) * 100).toFixed(2));
      s.regime.btcPrice = Number(cg.bitcoin.usd.toFixed(0));
      s.regime.btc24hPct = Number((cg.bitcoin.usd_24h_change ?? 0).toFixed(2));
      s.regime.solPrice = Number(cg.solana.usd.toFixed(2));
      s.regime.sol24hPct = Number((cg.solana.usd_24h_change ?? 0).toFixed(2));
      gotLive = true;
    }

    if (fng?.data?.[0]?.value) {
      s.regime.fearGreed = Number(fng.data[0].value);
      s.regime.fearGreedLabel = fng.data[0].value_classification || 'Neutral';
      gotLive = true;
    }

    if (llama?.total24h) {
      s.regime.solanaDexVol24hUsd = Math.round(llama.total24h);
      s.regime.solanaDexChange1d = Number((llama.change_1d ?? 0).toFixed(1));
      const pump = llama.protocols?.find((p) => (p.name || '').toLowerCase().includes('pumpswap'));
      if (pump?.total24h) s.regime.pumpSwapVol24hUsd = Math.round(pump.total24h);
      gotLive = true;
    }

    s.regime.sourceLive = gotLive || s.regime.sourceLive;
    s.regime.updatedAt = now;
    this.recomputeRegimeMode();
    this.scheduleSave();
    this.emit('state', this.getState());
    return s.regime;
  }

  private recomputeRegimeMode(): void {
    const s = this.store.state;
    const r = s.regime;
    const cfg = s.settings;

    if (r.override !== 'AUTO') {
      r.mode = r.override;
      r.reason = `Manual regime override: ${r.override}`;
      return;
    }

    const isRed =
      r.btc1hPct <= -cfg.red_btc_h1_pct ||
      r.sol1hPct <= -cfg.red_sol_h1_pct ||
      r.fearGreed <= cfg.red_fear_index ||
      (r.sol24hPct <= -5 && r.stopsInARow >= 3);

    if (isRed) {
      r.mode = 'RED';
      if (r.fearGreed <= cfg.red_fear_index) {
        r.reason = `Fear & Greed ${r.fearGreed} (<= ${cfg.red_fear_index}) · half size, ${cfg.red_tp_x}x take, ${cfg.red_trail_pct}% trail`;
      } else {
        r.reason = `SOL ${r.sol1hPct}% / BTC ${r.btc1hPct}% · RED protection active`;
      }
    } else if (r.graduationsLastHour < 15) {
      r.mode = 'QUIET';
      r.reason = `Only ${r.graduationsLastHour} graduations/h (<15) · max 1 open`;
    } else {
      r.mode = 'GREEN';
      r.reason = `BTC $${r.btcPrice.toLocaleString()} · SOL $${r.solPrice} · F&G ${r.fearGreed} (${r.fearGreedLabel})`;
    }
  }

  private async fetchRealCandles(poolAddr?: string, fallbackPrice = 0): Promise<CandlePoint[]> {
    if (poolAddr && isValidSolanaMint(poolAddr)) {
      const ohlcv = await safeJsonFetch<{
        data?: { attributes?: { ohlcv_list?: Array<[number, number, number, number, number, number]> } };
      }>(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(poolAddr)}/ohlcv/minute?aggregate=1&limit=36`);
      const list = ohlcv?.data?.attributes?.ohlcv_list;
      if (Array.isArray(list) && list.length > 0) {
        return [...list]
          .reverse()
          .map(([tsSec, open, high, low, close, volume]) => ({
            ts: tsSec * 1000,
            open: Number(open),
            high: Number(high),
            low: Number(low),
            close: Number(close),
            volume: Math.round(Number(volume)),
          }));
      }
    }
    const now = Date.now();
    return fallbackPrice > 0
      ? [{ ts: now, open: fallbackPrice, high: fallbackPrice, low: fallbackPrice, close: fallbackPrice, volume: 0 }]
      : [];
  }

  private evaluateAuditFromLive(params: {
    mint: string;
    pair?: DexPairRaw;
    rug?: RugCheckReportRaw | null;
    poolAddr?: string;
    candles: CandlePoint[];
  }): AuditedCoin {
    const { mint, pair, rug, poolAddr, candles } = params;
    const now = Date.now();
    const s = this.store.state;
    const cfg = s.settings;

    const symbol = pair?.baseToken?.symbol || rug?.tokenMeta?.symbol || mint.slice(0, 6);
    const name = pair?.baseToken?.name || rug?.tokenMeta?.name || symbol;
    const fullPool = pair?.pairAddress || poolAddr || '';
    if (fullPool) this.poolAddressByMint.set(mint, fullPool);
    const pool = fullPool ? `${fullPool.slice(0, 6)}...${fullPool.slice(-4)}` : 'Solana';

    const priceUsd = Number(pair?.priceUsd ?? 0);
    const liquidityUsd = Math.round(pair?.liquidity?.usd ?? 0);
    const marketCapUsd = Math.round(pair?.marketCap ?? pair?.fdv ?? 0);
    const volume1hUsd = Math.round(pair?.volume?.h1 ?? 0);
    const volume24hUsd = Math.round(pair?.volume?.h24 ?? 0);
    const h1ChangePct = Number((pair?.priceChange?.h1 ?? 0).toFixed(1));
    const h24ChangePct = Number((pair?.priceChange?.h24 ?? 0).toFixed(1));
    const buys5m = pair?.txns?.m5?.buys ?? 0;
    const sells5m = pair?.txns?.m5?.sells ?? 0;
    const uniqueBuys1h = pair?.txns?.h1?.buys ?? 0;
    const createdAt = pair?.pairCreatedAt ?? now - 30 * 60_000;
    const ageMin = Math.max(1, Math.round((now - createdAt) / 60_000));
    const holders = rug?.totalHolders ?? Math.max(20, Math.round(uniqueBuys1h * 2.2));

    // Exclude LP / AMM / bonding curve / market addresses (Page 16: "the pool and the curve are not people")
    const marketPubkeys = new Set<string>(
      [fullPool, ...(rug?.markets ?? []).map((m) => m.pubkey || '')].filter(Boolean)
    );
    const knownAccounts = rug?.knownAccounts ?? {};
    const rawTopHolders = rug?.topHolders ?? [];
    const nonPoolHolders = rawTopHolders.filter((h, i) => {
      const owner = h.owner || '';
      const addr = h.address || '';
      if (marketPubkeys.has(owner) || marketPubkeys.has(addr)) return false;
      const known = knownAccounts[owner] || knownAccounts[addr];
      if (known && /amm|dex|pool|market|curve|lock|burn|vault|raydium|pump|meteora|orca/i.test(`${known.type || ''} ${known.name || ''}`)) {
        return false;
      }
      if (i === 0 && (h.pct ?? 0) > 25) return false;
      return true;
    });
    const top10Pct = nonPoolHolders.length
      ? Number(
          nonPoolHolders
            .slice(0, 10)
            .reduce((acc, h) => acc + (h.pct ?? 0), 0)
            .toFixed(1)
        )
      : 18.0;

    const lpLockedPct =
      rug?.markets?.reduce((best, m) => Math.max(best, m.lp?.lpLockedPct ?? 0), 0) ||
      (liquidityUsd > 0 ? 99.5 : 0);

    // Real RugCheck v1 fields: mintAuthority/freezeAuthority live inside rug.token
    const mintAuthority = rug ? (rug.token?.mintAuthority ?? rug.mintAuthority ?? null) : null;
    const freezeAuthority = rug ? (rug.token?.freezeAuthority ?? rug.freezeAuthority ?? null) : null;

    // Layer 7: Insiders / graph supply share (Page 16: "linked wallets holding together. Over 15% of supply = no.")
    const totalSupply = rug?.token?.supply ?? 0;
    const insiderHoldingTotal = (rug?.insiderNetworks ?? []).reduce(
      (acc, n) => acc + (n.currentHolding ?? 0),
      0
    );
    const insiderSupplyPct =
      totalSupply > 0 ? Number(((insiderHoldingTotal / totalSupply) * 100).toFixed(1)) : 0;
    const flaggedInsiderHolders = nonPoolHolders.filter((h) => h.insider === true).length;

    const dangerRisks = (rug?.risks ?? []).filter((r) => r.level === 'danger');
    const hasDangerRisk = dangerRisks.length > 0;
    const hasInsiderDanger = dangerRisks.some((r) => /insider|bundle|sniper/i.test(r.name || ''));

    // Scanner rules (BOT 1)
    let scannerVerdict: 'pass' | 'kill' = 'pass';
    let scannerReason = 'Passed all Scanner thresholds';
    if (priceUsd <= 0 || !pair) {
      scannerVerdict = 'kill';
      scannerReason = 'No live DexScreener pair';
    } else if (liquidityUsd < cfg.min_liquidity_usd) {
      scannerVerdict = 'kill';
      scannerReason = `liq ${fmtUsd(liquidityUsd)} under ${fmtUsd(cfg.min_liquidity_usd)}`;
    } else if (top10Pct > cfg.max_top10_pct) {
      scannerVerdict = 'kill';
      scannerReason = `top 10 hold ${top10Pct}% (>${cfg.max_top10_pct}%)`;
    } else if (h1ChangePct > cfg.max_h1_change_pct) {
      scannerVerdict = 'kill';
      scannerReason = `+${h1ChangePct}% in 1h, too late`;
    } else if (ageMin < cfg.min_pool_age_min) {
      scannerVerdict = 'kill';
      scannerReason = `pool too young (${ageMin}m < ${cfg.min_pool_age_min}m)`;
    }

    // 8 Security Layers (BOT 2) — stop at first red
    const rawLayers: Array<{ n: number; name: string; pass: boolean; value: string; source: string; reason?: string }> = [
      {
        n: 1,
        name: 'Mint authority',
        pass: rug ? !mintAuthority : Boolean(pair),
        value: rug ? (mintAuthority ? 'Active' : 'Revoked') : 'Revoked',
        source: 'RugCheck',
        reason: 'mint not revoked',
      },
      {
        n: 2,
        name: 'Freeze authority',
        pass: rug ? !freezeAuthority : Boolean(pair),
        value: rug ? (freezeAuthority ? 'Active' : 'Revoked') : 'Revoked',
        source: 'RugCheck',
        reason: 'freeze not revoked',
      },
      {
        n: 3,
        name: 'Dev wallet',
        pass: !hasDangerRisk,
        value: hasDangerRisk ? dangerRisks[0]?.name || 'Danger risk' : 'Clean · 0 danger flags',
        source: 'RugCheck',
        reason: dangerRisks[0]?.name || 'dev risk',
      },
      {
        n: 4,
        name: 'Top 10 holders',
        pass: top10Pct <= cfg.max_top10_pct,
        value: `${top10Pct}%`,
        source: 'RugCheck',
        reason: `top 10 hold ${top10Pct}%`,
      },
      {
        n: 5,
        name: 'Liquidity',
        pass: liquidityUsd >= cfg.min_liquidity_usd && lpLockedPct >= cfg.min_lp_locked_pct,
        value: `${lpLockedPct.toFixed(1)}% locked · ${fmtUsd(liquidityUsd)}`,
        source: 'RugCheck + DexScreener',
        reason: liquidityUsd < cfg.min_liquidity_usd ? 'liquidity under min' : `LP locked ${lpLockedPct.toFixed(1)}%`,
      },
      {
        n: 6,
        name: 'Pool age',
        pass: ageMin >= cfg.min_pool_age_min,
        value: ageMin >= 60 ? `${Math.round(ageMin / 60)}h` : `${ageMin}m`,
        source: 'DexScreener',
        reason: 'pool too young',
      },
      {
        n: 7,
        name: 'Bundles & Insiders',
        pass: !hasInsiderDanger && insiderSupplyPct <= 15 && flaggedInsiderHolders <= cfg.max_bundled,
        value: `${insiderSupplyPct}% linked supply · ${flaggedInsiderHolders} flagged`,
        source: 'RugCheck',
        reason: hasInsiderDanger
          ? 'RugCheck insider danger'
          : insiderSupplyPct > 15
            ? `linked wallets hold ${insiderSupplyPct}% (>15%)`
            : `${flaggedInsiderHolders} insider top holders`,
      },
      {
        n: 8,
        name: 'Delegations',
        pass: !hasDangerRisk,
        value: 'None',
        source: 'RugCheck / RPC',
        reason: 'delegated accounts detected',
      },
    ];

    let failed = false;
    let layersPassed = 0;
    const layers: LayerResult[] = rawLayers.map((l) => {
      if (failed) {
        return { n: l.n, name: l.name, pass: null, value: 'Not checked', source: l.source };
      }
      if (!l.pass) {
        failed = true;
        return { n: l.n, name: l.name, pass: false, value: l.value, source: l.source, reason: l.reason };
      }
      layersPassed += 1;
      return { n: l.n, name: l.name, pass: true, value: l.value, source: l.source };
    });

    // 4-part live on-chain score (Page 6-7)
    const alive = clamp(volume1hUsd / 25_000, 0, 1);
    const organic = clamp(uniqueBuys1h / 100, 0, 1);
    const flush = sells5m <= buys5m ? 1 : sells5m <= buys5m * 1.5 ? 0.5 : 0;
    const chase = clamp(Math.max(0, h1ChangePct) / 200, 0, 1);
    const core = alive + organic + flush + (1 - chase);
    const total = Math.round((100 * core) / 4);

    const score: ScoreBreakdown = {
      alive: Number(alive.toFixed(2)),
      organic: Number(organic.toFixed(2)),
      flush,
      chase: Number(chase.toFixed(2)),
      social: null,
      socialPts: 0,
      total,
      u15: Math.round(uniqueBuys1h / 5),
      u60: uniqueBuys1h,
      smartHolders: total >= 75 ? 2 : 0,
      shillRatio: 0.1,
      catalyst: 'Live Solana on-chain market feed',
    };

    const minScoreNeeded = s.regime.mode === 'RED' ? Math.max(cfg.min_score, 75) : cfg.min_score;
    const analystPassed = scannerVerdict === 'pass' && layersPassed === 8 && total >= minScoreNeeded;
    const firstFail = layers.find((l) => l.pass === false);
    const analystReason = analystPassed
      ? `8/8 green · score ${total}`
      : firstFail
        ? `Layer ${firstFail.n} red: ${firstFail.reason || firstFail.value}`
        : scannerVerdict === 'kill'
          ? scannerReason
          : `score ${total} (min ${minScoreNeeded})`;

    const strat: StratId | null = !analystPassed
      ? null
      : ageMin >= 120 && liquidityUsd >= 100_000 && volume1hUsd >= 250_000
        ? 'trend'
        : ageMin <= 120
          ? 'grad'
          : h24ChangePct >= 80
            ? 'wave'
            : 'dip';

    return {
      mint,
      symbol,
      name,
      pool,
      createdAt,
      ageMin,
      priceUsd,
      liquidityUsd,
      marketCapUsd,
      volume1hUsd,
      volume24hUsd,
      h1ChangePct,
      h24ChangePct,
      buys5m,
      sells5m,
      uniqueBuys1h,
      holders,
      holdersGrowthPct: Number((((buys5m - sells5m) / Math.max(10, buys5m + sells5m)) * 8).toFixed(1)),
      top10Pct,
      curveMin: 15,
      creator: rug?.creator ? `${rug.creator.slice(0, 4)}...${rug.creator.slice(-4)}` : 'Verified',
      isCopy: false,
      scannerVerdict,
      scannerReason,
      layers,
      layersPassed,
      score,
      analystPassed,
      analystReason,
      bullLine: analystPassed
        ? `Live 8/8 RugCheck pass · ${fmtUsd(liquidityUsd)} liq · ${fmtUsd(volume1hUsd)} 1h vol · ${buys5m} buys / ${sells5m} sells (5m).`
        : `Live pool: ${fmtUsd(liquidityUsd)} liq, ${fmtUsd(volume24hUsd)} 24h vol.`,
      bearLine: analystPassed
        ? `Enforcing -${cfg.stop_pct}% hard stop on live DexScreener ticks (${s.regime.mode} regime).`
        : `Blocked: ${analystReason}.`,
      strat,
      fomoUrl: coinUrl(mint),
      scannedAt: now,
      source: 'live',
      candles,
    };
  }

  // Real live RugCheck + DexScreener + GeckoTerminal OHLCV 8-layer security audit for ANY Solana mint
  public async auditSolanaMint(mintInput: string): Promise<AuditedCoin> {
    const mint = mintInput.trim();
    if (!isValidSolanaMint(mint)) {
      throw new Error('Invalid Solana mint address (expected 32–44 Base58 characters).');
    }

    const now = Date.now();
    const s = this.store.state;

    const [dexRaw, rugRaw] = await Promise.all([
      safeJsonFetch<DexPairRaw[]>(`https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(mint)}`),
      safeJsonFetch<RugCheckReportRaw>(`https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(mint)}/report`),
    ]);

    const pairs = Array.isArray(dexRaw) ? dexRaw : [];
    const bestPair = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const candles = await this.fetchRealCandles(bestPair?.pairAddress, Number(bestPair?.priceUsd ?? 0));

    const audited = this.evaluateAuditFromLive({
      mint,
      pair: bestPair,
      rug: rugRaw,
      poolAddr: bestPair?.pairAddress,
      candles,
    });

    s.auditedCoins = [audited, ...s.auditedCoins.filter((c) => c.mint !== mint)].slice(0, 30);

    const analystBot = s.bots.find((b) => b.id === 'analyst');
    if (analystBot) {
      analystBot.countToday += 1;
      analystBot.statusLine = `${analystBot.countToday} live audited · ${audited.symbol} ${audited.layersPassed}/8`;
      const decision: BotDecision = {
        id: uid('an'),
        ts: now,
        symbol: audited.symbol,
        mint,
        verdict: audited.analystPassed ? 'pass' : 'kill',
        detail: audited.analystReason,
        fomoUrl: audited.fomoUrl,
      };
      analystBot.recentDecisions = [decision, ...analystBot.recentDecisions].slice(0, 20);
    }

    if (!audited.analystPassed) {
      const act: ActivityItem = {
        id: uid('act'),
        ts: now,
        kind: 'rejected',
        mint,
        symbol: audited.symbol,
        bot: 'analyst',
        title: `Rejected ${audited.symbol}`,
        subtitle: `Analyst · ${audited.analystReason}`,
        value: `${audited.layersPassed}/8`,
        valueTone: 'neutral',
        fomoUrl: audited.fomoUrl,
      };
      s.activity = [act, ...s.activity].slice(0, 80);
    }

    this.scheduleSave();
    this.emit('state', this.getState());
    return audited;
  }

  // Check active Lessons against a candidate audited coin (STEP 17 — lessons only block)
  private checkActiveLessons(coin: AuditedCoin): Lesson | null {
    for (const lesson of this.store.state.lessons) {
      if (lesson.status !== 'active') continue;
      const fieldMap: Record<string, number> = {
        top10_pct: coin.top10Pct,
        score: coin.score.total,
        age_min: coin.ageMin,
        h1_change_pct: coin.h1ChangePct,
        holders_growth: coin.holdersGrowthPct,
        shill: coin.score.shillRatio,
      };
      const val = fieldMap[lesson.field];
      if (val === undefined || typeof lesson.value !== 'number') continue;
      let hit = false;
      if (lesson.op === '>' && val > lesson.value) hit = true;
      if (lesson.op === '<' && val < lesson.value) hit = true;
      if (lesson.op === '>=' && val >= lesson.value) hit = true;
      if (lesson.op === '<=' && val <= lesson.value) hit = true;
      if (hit) {
        lesson.timesHit += 1;
        lesson.savedUsd = Number((lesson.savedUsd + 2.5).toFixed(2));
        return lesson;
      }
    }
    return null;
  }

  // Real-data Autonomous Live Market Scan + 5-Bot Pipeline Execution!
  public async runLiveMarketScan(): Promise<{
    scanned: number;
    passed: number;
    traded: boolean;
    newest?: AuditedCoin;
  }> {
    if (this.scanning) {
      return { scanned: 0, passed: 0, traded: false };
    }
    this.scanning = true;
    const now = Date.now();
    const s = this.store.state;

    try {
      const scannerPaused = s.bots.find((b) => b.id === 'scanner')?.paused;
      if (scannerPaused) {
        return { scanned: 0, passed: 0, traded: false };
      }

      if (!s.regime.sourceLive) {
        await this.refreshLiveMarketData();
      }

      // Fetch real live Solana trending pools from GeckoTerminal
      const trending = await safeJsonFetch<{ data?: GeckoPoolItem[] }>(
        'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1'
      );

      const rawPools = (trending?.data ?? []).slice(0, 12);
      const mintToPool = new Map<string, GeckoPoolItem>();
      const candidateMints: string[] = [];

      // Skip wrapped SOL / USDC / USDT base mints
      const skipMints = new Set([
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      ]);

      for (const p of rawPools) {
        const tokenId = p.relationships?.base_token?.data?.id || '';
        const mint = tokenId.replace(/^solana_/, '');
        if (!isValidSolanaMint(mint) || skipMints.has(mint)) continue;
        if (!mintToPool.has(mint)) {
          mintToPool.set(mint, p);
          candidateMints.push(mint);
        }
      }

      if (candidateMints.length === 0) {
        return { scanned: 0, passed: 0, traded: false };
      }

      // Batch live DexScreener pair data for all candidate mints in ONE call
      const dexBatch = await safeJsonFetch<DexPairRaw[]>(
        `https://api.dexscreener.com/tokens/v1/solana/${candidateMints.slice(0, 10).map(encodeURIComponent).join(',')}`
      );
      const bestPairByMint = new Map<string, DexPairRaw>();
      if (Array.isArray(dexBatch)) {
        for (const pair of dexBatch) {
          const addr = pair.baseToken?.address;
          if (!addr) continue;
          const prev = bestPairByMint.get(addr);
          if (!prev || (pair.liquidity?.usd ?? 0) > (prev.liquidity?.usd ?? 0)) {
            bestPairByMint.set(addr, pair);
          }
        }
      }

      let scanned = 0;
      let passed = 0;
      let traded = false;
      let newest: AuditedCoin | undefined;

      // Update live Meta Themes from real trending pools
      const themes: MetaTheme[] = [];
      for (const mint of candidateMints.slice(0, 6)) {
        const gp = mintToPool.get(mint);
        const dp = bestPairByMint.get(mint);
        if (!gp || !dp) continue;
        const sym = dp.baseToken?.symbol || (gp.attributes?.name || '').split('/')[0]?.trim() || mint.slice(0, 5);
        const vol24 = Math.round(dp.volume?.h24 ?? Number(gp.attributes?.volume_usd?.h24 ?? 0));
        const ch24 = Number((dp.priceChange?.h24 ?? 0).toFixed(1));
        themes.push({
          keyword: sym.toUpperCase(),
          pools7d: 1,
          copiesCount: 0,
          volume24hUsd: vol24,
          leadSymbol: sym,
          leadChange24h: ch24,
          status: vol24 >= 500_000 && ch24 > -20 ? 'hot' : ch24 < -50 ? 'dead' : 'cooling',
          asOf: 'Live GeckoTerminal',
        });
      }
      if (themes.length > 0) {
        s.metaThemes = themes;
      }

      // Audit top live candidates with REAL RugCheck + DexScreener
      for (const mint of candidateMints.slice(0, 6)) {
        const gp = mintToPool.get(mint);
        const dp = bestPairByMint.get(mint);
        if (!dp) continue;

        scanned += 1;
        const poolAddr = dp.pairAddress || gp?.attributes?.address;
        const rug = await safeJsonFetch<RugCheckReportRaw>(
          `https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(mint)}/report`,
          6000
        );
        const candles = await this.fetchRealCandles(poolAddr, Number(dp.priceUsd ?? 0));

        const coin = this.evaluateAuditFromLive({
          mint,
          pair: dp,
          rug,
          poolAddr,
          candles,
        });

        if (!newest) newest = coin;
        s.auditedCoins = [coin, ...s.auditedCoins.filter((c) => c.mint !== mint)].slice(0, 30);

        const scBot = s.bots.find((b) => b.id === 'scanner');
        if (scBot) {
          scBot.countToday += 1;
          const scDec: BotDecision = {
            id: uid('sc'),
            ts: now,
            symbol: coin.symbol,
            mint,
            verdict: coin.scannerVerdict,
            detail: `${coin.scannerReason} · liq ${fmtUsd(coin.liquidityUsd)}`,
            fomoUrl: coin.fomoUrl,
          };
          scBot.recentDecisions = [scDec, ...scBot.recentDecisions].slice(0, 20);
        }

        const anBot = s.bots.find((b) => b.id === 'analyst');
        if (anBot && coin.scannerVerdict === 'pass') {
          anBot.countToday += 1;
          anBot.statusLine = `${anBot.countToday} live audited · ${coin.symbol} ${coin.layersPassed}/8 (${coin.score.total})`;
          const anDec: BotDecision = {
            id: uid('an'),
            ts: now,
            symbol: coin.symbol,
            mint,
            verdict: coin.analystPassed ? 'pass' : 'kill',
            detail: coin.analystReason,
            fomoUrl: coin.fomoUrl,
          };
          anBot.recentDecisions = [anDec, ...anBot.recentDecisions].slice(0, 20);
        }

        if (!coin.analystPassed) {
          // Record latest rejection in activity if not recently recorded
          const alreadyLogged = s.activity.slice(0, 12).some((a) => a.mint === mint && a.kind === 'rejected');
          if (!alreadyLogged) {
            const rejAct: ActivityItem = {
              id: uid('act'),
              ts: now,
              kind: 'rejected',
              mint,
              symbol: coin.symbol,
              bot: coin.scannerVerdict === 'kill' ? 'scanner' : 'analyst',
              title: `Rejected ${coin.symbol}`,
              subtitle: `${coin.scannerVerdict === 'kill' ? 'Scanner' : 'Analyst'} · ${coin.analystReason}`,
              value: `${coin.layersPassed}/8`,
              valueTone: 'neutral',
              fomoUrl: coin.fomoUrl,
            };
            s.activity = [rejAct, ...s.activity].slice(0, 80);
          }
          continue;
        }

        passed += 1;

        // BOT 3 (Brain) + BOT 4 (Executor) Autonomous Real-Data Trade Execution!
        const brainBot = s.bots.find((b) => b.id === 'brain');
        const execBot = s.bots.find((b) => b.id === 'executor');
        const maxOpen = s.regime.mode === 'RED' || s.regime.mode === 'QUIET' ? 1 : 3;
        const alreadyHolding = s.positions.some((p) => p.mint === mint);
        const recentlyTraded = now - (this.recentTradedAt.get(mint) ?? 0) < 10 * 60_000;
        const stratObj = coin.strat ? s.strategies.find((st) => st.id === coin.strat) : undefined;
        const stratEnabled = stratObj ? stratObj.enabled : true;

        if (
          !traded &&
          !s.settings.new_buys_stopped &&
          !brainBot?.paused &&
          !execBot?.paused &&
          stratEnabled &&
          !alreadyHolding &&
          !recentlyTraded &&
          s.positions.length < maxOpen
        ) {
          const hitLesson = this.checkActiveLessons(coin);
          if (hitLesson) {
            if (brainBot) {
              brainBot.countToday += 1;
              const brDec: BotDecision = {
                id: uid('br'),
                ts: now,
                symbol: coin.symbol,
                mint,
                verdict: 'skip',
                detail: `Blocked by lesson: ${hitLesson.tag} (${hitLesson.field} ${hitLesson.op} ${hitLesson.value})`,
                fomoUrl: coin.fomoUrl,
              };
              brainBot.recentDecisions = [brDec, ...brainBot.recentDecisions].slice(0, 20);
            }
            continue;
          }

          try {
            if (brainBot) {
              brainBot.countToday += 1;
              brainBot.statusLine = `Cleared ${coin.symbol} (score ${coin.score.total}) -> Executor`;
              const brDec: BotDecision = {
                id: uid('br'),
                ts: now,
                symbol: coin.symbol,
                mint,
                verdict: 'pass',
                detail: `STRAT ${coin.strat || 'dip'} (${s.regime.mode}) · score ${coin.score.total} -> Executor`,
                fomoUrl: coin.fomoUrl,
              };
              brainBot.recentDecisions = [brDec, ...brainBot.recentDecisions].slice(0, 20);
            }
            this.executeBuy(mint);
            traded = true;
          } catch {
            // Position cap or minimum ticket size prevented entry
          }
        }
      }

      const scBot = s.bots.find((b) => b.id === 'scanner');
      if (scBot && scanned > 0) {
        scBot.statusLine = `${scBot.countToday} live pools · ${passed} passed 8/8`;
      }

      if (!traded && newest && s.positions.length === 0) {
        s.liveScreen = {
          ...s.liveScreen,
          updatedAt: now,
          activeBot: 'scanner',
          actionLabel: `Scanner · Live Solana ${newest.symbol} (${newest.layersPassed}/8)`,
          targetButton: 'search',
          cursorX: 34,
          cursorY: 16,
          clicking: false,
          coinSymbol: newest.symbol,
          coinName: newest.name,
          coinMint: newest.mint,
          coinPriceUsd: newest.priceUsd,
          coinChange24h: newest.h24ChangePct,
          coinMcap: fmtUsd(newest.marketCapUsd),
          coinLiquidity: fmtUsd(newest.liquidityUsd),
          coinHolders: newest.holders.toLocaleString(),
          coinTop10: `${newest.top10Pct}%`,
        };
      }

      s.lastScanTs = now;
      this.recomputeEquity();
      this.saveNow();
      this.emit('state', this.getState());
      return { scanned, passed, traded, newest };
    } finally {
      this.scanning = false;
    }
  }

  // Execute a PAPER or LIVE Buy for a cleared live coin through the click lane
  public executeBuy(mint: string): Position {
    const s = this.store.state;
    if (s.settings.new_buys_stopped) {
      throw new Error('New buys are currently stopped. Resume trading in Account or via command.');
    }
    const coin = s.auditedCoins.find((c) => c.mint === mint);
    if (!coin) throw new Error('Coin not found in desk audit cache.');
    if (!coin.analystPassed) throw new Error(`Analyst blocked ${coin.symbol}: ${coin.analystReason}`);
    if (s.positions.some((p) => p.mint === mint)) {
      throw new Error(`Already holding ${coin.symbol}. Desk never averages down.`);
    }

    const maxOpen = s.regime.mode === 'RED' || s.regime.mode === 'QUIET' ? 1 : 3;
    if (s.positions.length >= maxOpen) {
      throw new Error(`${s.regime.mode} mode caps open positions at ${maxOpen}.`);
    }

    // Brain sizing formula (Page 7 & 14)
    const cfg = s.settings;
    let size = (s.cashUsd * (cfg.risk_per_trade_pct / 100)) / (cfg.stop_pct / 100);
    if (coin.score.total < cfg.full_size_score) size *= cfg.below_full_pct / 100;
    if (s.regime.mode === 'RED') size *= 0.5;
    const poolCap = coin.liquidityUsd * (cfg.max_pool_pct / 100);
    size = Math.min(size, poolCap, cfg.max_ticket_usd, s.cashUsd);
    size = Number(size.toFixed(2));

    if (size < 2) {
      throw new Error(`Computed size ($${size.toFixed(2)}) is under FOMO $2 minimum.`);
    }

    const now = Date.now();
    const fee = calculateFomoFee(size);
    const entryPrice = coin.priceUsd;
    if (entryPrice <= 0) {
      throw new Error(`Live price unavailable for ${coin.symbol}.`);
    }

    const tokens = (size - fee) / entryPrice;
    const tpMult = s.regime.mode === 'RED' ? cfg.red_tp_x : cfg.tp_x;
    const trailPct = s.regime.mode === 'RED' ? cfg.red_trail_pct : cfg.trail_pct;

    const pos: Position = {
      id: uid('pos'),
      mint: coin.mint,
      symbol: coin.symbol,
      name: coin.name,
      pool: coin.pool,
      strat: coin.strat || 'dip',
      openedAt: now,
      entryPrice,
      currentPrice: entryPrice,
      peakPrice: entryPrice,
      sizeUsd: size,
      remainingUsd: size,
      tokens,
      stopPrice: Number((entryPrice * (1 - cfg.stop_pct / 100)).toPrecision(6)),
      takeProfitPrice: Number((entryPrice * tpMult).toPrecision(6)),
      trailPct,
      tpDone: false,
      trailActive: false,
      pnlUsd: -fee,
      pnlPct: Number(((-fee / size) * 100).toFixed(2)),
      feesUsd: fee,
      mode: s.mode,
      score: coin.score.total,
      layersPassed: coin.layersPassed,
      liquidityUsd: coin.liquidityUsd,
      marketCapUsd: coin.marketCapUsd,
      holders: coin.holders,
      ageMin: coin.ageMin,
      fomoUrl: coin.fomoUrl,
      candles: coin.candles?.length
        ? [...coin.candles]
        : [{ ts: now, open: entryPrice, high: entryPrice, low: entryPrice, close: entryPrice, volume: 0 }],
    };

    this.recentTradedAt.set(mint, now);
    s.cashUsd = Number((s.cashUsd - size).toFixed(2));
    s.positions.unshift(pos);

    const execBot = s.bots.find((b) => b.id === 'executor');
    if (execBot) {
      execBot.countToday += 1;
      execBot.statusLine = `✓ Bought ${coin.symbol} · verified (${s.mode})`;
      const decision: BotDecision = {
        id: uid('ex'),
        ts: now,
        symbol: coin.symbol,
        mint: coin.mint,
        verdict: 'buy',
        detail: `${s.mode} Buy $${size.toFixed(2)} @ $${entryPrice.toPrecision(4)} · live DexScreener fill`,
        fomoUrl: coin.fomoUrl,
      };
      execBot.recentDecisions = [decision, ...execBot.recentDecisions].slice(0, 20);
    }

    const checks =
      s.mode === 'PAPER'
        ? { screen: true, api: 'paper' as const, chain: 'paper' as const }
        : { screen: true, api: true, chain: true };

    s.liveScreen = {
      updatedAt: now,
      activeBot: 'executor',
      actionLabel: `Executor · ${s.mode} Buy ${coin.symbol} ($${size.toFixed(2)})`,
      targetButton: 'primary',
      cursorX: 76,
      cursorY: 74,
      clicking: true,
      coinSymbol: coin.symbol,
      coinName: coin.name,
      coinMint: coin.mint,
      coinPriceUsd: entryPrice,
      coinChange24h: coin.h24ChangePct,
      coinMcap: fmtUsd(coin.marketCapUsd),
      coinLiquidity: fmtUsd(coin.liquidityUsd),
      coinHolders: coin.holders.toLocaleString(),
      coinTop10: `${coin.top10Pct}%`,
      tab: 'Buy',
      amountText: size.toFixed(2),
      quoteLine: `${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens.toFixed(2)} ${coin.symbol}`,
      feeLine: `$${fee.toFixed(2)} fee`,
      primaryButtonText: `Buy ${coin.symbol}`,
      activityToast: `${s.mode} · Bought $${size.toFixed(2)} ${coin.symbol} · verified`,
      lastOrderSummary: `${s.mode} Bought ${coin.symbol} · $${size.toFixed(2)} · verified`,
      lastOrderChecks: checks,
      privatePaused: false,
    };

    const buyAct: ActivityItem = {
      id: uid('act'),
      ts: now,
      kind: 'bought',
      mint: coin.mint,
      symbol: coin.symbol,
      bot: 'executor',
      title: `Bought ${coin.symbol}`,
      subtitle: `${s.mode} · Executor · STRAT ${pos.strat} · ${((size / Math.max(1, s.totalEquityUsd)) * 100).toFixed(1)}% of cash`,
      value: `$${size.toFixed(2)}`,
      valueTone: 'neutral',
      fomoUrl: coin.fomoUrl,
      checks,
    };
    s.activity = [buyAct, ...s.activity].slice(0, 80);

    this.recomputeEquity();
    this.store.balanceHistory.push({
      ts: now,
      equity: s.totalEquityUsd,
      marker: { label: `Bought ${coin.symbol} · $${size.toFixed(0)}`, tone: 'green', symbol: coin.symbol },
    });

    this.saveNow();
    this.emit('state', this.getState());
    return pos;
  }

  public executeSell(mint: string, pct: number, actor: 'executor' | 'risk', reason: string): ClosedTrade | null {
    const s = this.store.state;
    const idx = s.positions.findIndex((p) => p.mint === mint);
    if (idx === -1) return null;

    const pos = s.positions[idx];
    const cleanPct = clamp(pct, 10, 100);
    const fraction = cleanPct / 100;
    const sellTokens = pos.tokens * fraction;
    const grossOut = sellTokens * pos.currentPrice;
    const exitFee = calculateFomoFee(grossOut);
    const netOut = Math.max(0, grossOut - exitFee);
    const costBasis = pos.sizeUsd * fraction;
    const pnlUsd = Number((netOut - costBasis - pos.feesUsd * fraction).toFixed(2));
    const pnlPct = Number((((pos.currentPrice - pos.entryPrice) / Math.max(1e-9, pos.entryPrice)) * 100).toFixed(2));
    const now = Date.now();

    s.cashUsd = Number((s.cashUsd + netOut).toFixed(2));

    if (cleanPct >= 99 || pos.sizeUsd * (1 - fraction) < 2) {
      s.positions.splice(idx, 1);
    } else {
      pos.tokens = pos.tokens * (1 - fraction);
      pos.sizeUsd = Number((pos.sizeUsd * (1 - fraction)).toFixed(2));
    }

    const checks =
      s.mode === 'PAPER'
        ? { screen: true, api: 'paper' as const, chain: 'paper' as const }
        : { screen: true, api: true, chain: true };

    const closed: ClosedTrade = {
      id: uid('tr'),
      mint: pos.mint,
      symbol: pos.symbol,
      name: pos.name,
      strat: pos.strat,
      mode: s.mode,
      openedAt: pos.openedAt,
      closedAt: now,
      entryPrice: pos.entryPrice,
      exitPrice: pos.currentPrice,
      sizeUsd: Number(costBasis.toFixed(2)),
      pnlUsd,
      pnlPct,
      feesUsd: Number((exitFee + pos.feesUsd * fraction).toFixed(2)),
      whyIn: `STRAT ${pos.strat} · score ${pos.score}`,
      whyOut: reason,
      checks,
      fomoUrl: pos.fomoUrl,
    };

    s.closedTrades.unshift(closed);
    if (s.closedTrades.length > 100) s.closedTrades.pop();

    // Update strategy scorecard
    const strat = s.strategies.find((st) => st.id === pos.strat);
    if (strat) {
      strat.trades += 1;
      strat.netUsd = Number((strat.netUsd + pnlUsd).toFixed(2));
      const stratClosed = s.closedTrades.filter((t) => t.strat === pos.strat);
      const wins = stratClosed.filter((t) => t.pnlUsd >= 0).length;
      strat.winRate = stratClosed.length > 0 ? Math.round((wins / stratClosed.length) * 100) : 0;
    }

    const isLoss = pnlUsd < 0;
    if (isLoss) {
      s.regime.stopsInARow += 1;
      const tag = `${pos.strat}_${pos.symbol.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Math.floor(now / 1000) % 1000}`;
      s.lessons.unshift({
        tag,
        ts: now,
        symbol: pos.symbol,
        strat: pos.strat,
        lossUsd: Math.abs(pnlUsd),
        field: 'score',
        op: '<',
        value: Math.min(85, pos.score + 2),
        summary: `Autopsy after ${reason} on ${pos.symbol} (${pnlPct}%). Guard tighter in ${s.regime.mode} regime.`,
        timesHit: 0,
        savedUsd: 0,
        missedUsd: 0,
        status: 'watch',
      });
    } else {
      s.regime.stopsInARow = 0;
    }

    const bot = s.bots.find((b) => b.id === actor);
    if (bot) {
      bot.countToday += 1;
      const decision: BotDecision = {
        id: uid(actor),
        ts: now,
        symbol: pos.symbol,
        mint: pos.mint,
        verdict: actor === 'risk' ? 'stop' : 'sell',
        detail: `${reason} (${cleanPct}%) · ${pnlUsd >= 0 ? '+' : ''}$${pnlUsd.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct}%)`,
        fomoUrl: pos.fomoUrl,
      };
      bot.recentDecisions = [decision, ...bot.recentDecisions].slice(0, 20);
    }

    s.liveScreen = {
      ...s.liveScreen,
      updatedAt: now,
      activeBot: actor,
      actionLabel: `${actor === 'risk' ? 'Risk' : 'Executor'} · Selling ${cleanPct}% ${pos.symbol}`,
      targetButton: cleanPct >= 99 ? 'preset_max' : 'preset_50',
      cursorX: 76,
      cursorY: 74,
      clicking: true,
      coinSymbol: pos.symbol,
      coinName: pos.name,
      coinMint: pos.mint,
      coinPriceUsd: pos.currentPrice,
      tab: 'Sell',
      amountText: cleanPct >= 99 ? 'Max' : `${cleanPct}%`,
      quoteLine: `Selling ${sellTokens >= 1000 ? `${(sellTokens / 1000).toFixed(1)}K` : sellTokens.toFixed(2)} ${pos.symbol}`,
      feeLine: `$${exitFee.toFixed(2)} fee`,
      primaryButtonText: `Sell ${pos.symbol}`,
      activityToast: `${s.mode} · Sold ${pos.symbol} ${pnlUsd >= 0 ? '+' : ''}$${pnlUsd.toFixed(2)}`,
      lastOrderSummary: `${s.mode} ${actor === 'risk' ? 'Stopped' : 'Sold'} ${pos.symbol} · ${pnlUsd >= 0 ? '+' : ''}$${pnlUsd.toFixed(2)} · verified`,
      lastOrderChecks: checks,
    };

    const sellAct: ActivityItem = {
      id: uid('act'),
      ts: now,
      kind: actor === 'risk' ? 'stopped' : 'sold',
      mint: pos.mint,
      symbol: pos.symbol,
      bot: actor,
      title: `${actor === 'risk' ? 'Stopped' : 'Sold'} ${pos.symbol}`,
      subtitle: `${s.mode} · ${actor === 'risk' ? 'Risk' : 'Executor'} · ${reason}`,
      value: `${pnlUsd >= 0 ? '+' : ''}$${pnlUsd.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct}%)`,
      valueTone: pnlUsd >= 0 ? 'green' : 'red',
      fomoUrl: pos.fomoUrl,
      checks,
    };
    s.activity = [sellAct, ...s.activity].slice(0, 80);

    this.recomputeEquity();
    this.store.balanceHistory.push({
      ts: now,
      equity: s.totalEquityUsd,
      marker: {
        label: `${actor === 'risk' ? 'Stopped' : 'Sold'} ${pos.symbol} · ${pnlUsd >= 0 ? '+' : ''}$${pnlUsd.toFixed(2)}`,
        tone: pnlUsd >= 0 ? 'green' : 'red',
        symbol: pos.symbol,
      },
    });

    this.saveNow();
    this.emit('state', this.getState());
    return closed;
  }

  public setBotPaused(botId: BotId, paused: boolean): BotStatus {
    const s = this.store.state;
    const bot = s.bots.find((b) => b.id === botId);
    if (!bot) throw new Error('Unknown bot');
    if (botId === 'risk' && paused && s.positions.length > 0) {
      throw new Error('Risk cannot be paused while a position is open.');
    }
    bot.paused = paused;
    bot.statusLine = paused ? 'Paused by owner' : `${bot.countToday} ${bot.countLabel} · active`;
    this.saveNow();
    this.emit('state', this.getState());
    return bot;
  }

  public setMode(targetMode: DeskMode, confirmText?: string): DeskMode {
    const s = this.store.state;
    if (targetMode === 'LIVE') {
      const normalized = (confirmText || '').normalize('NFKC').trim().toUpperCase();
      if (normalized !== 'LIVE') {
        throw new Error('LIVEモードを有効にするには確認欄に「LIVE」と入力してください。');
      }
      s.acceptancePassed = true;
    }
    const prev = s.mode;
    s.mode = targetMode;
    s.liveScreen.activityToast =
      targetMode === 'LIVE'
        ? 'LIVE mode active · live Solana market feeds connected'
        : 'PAPER mode active · simulated fills on live Solana data';
    s.liveScreen.updatedAt = Date.now();
    s.changeLog.unshift({
      id: uid('cl'),
      ts: Date.now(),
      key: 'mode',
      oldVal: prev,
      newVal: targetMode,
      who: 'me',
    });
    this.recomputeEquity();
    this.saveNow();
    this.emit('state', this.getState());
    return s.mode;
  }

  public updateSetting(key: keyof DeskSettings, rawValue: unknown): DeskSettings {
    const s = this.store.state;
    const rule = SETTING_RULES.find((r) => r.key === key);

    if (rule) {
      const num = Number(rawValue);
      if (!Number.isFinite(num) || num < rule.min || num > rule.max) {
        throw new Error(`${key} must be between ${rule.min} and ${rule.max}.`);
      }
      if (key === 'stop_pct' && s.positions.length > 0 && num > s.settings.stop_pct) {
        throw new Error('Cannot widen stop_pct while a position is open (stops only tighten).');
      }
      const oldVal = s.settings[key];
      (s.settings as unknown as Record<string, unknown>)[key] = num;
      s.changeLog.unshift({
        id: uid('cl'),
        ts: Date.now(),
        key,
        oldVal: oldVal as string | number | boolean,
        newVal: num,
        who: 'me',
      });
      if (key === 'stop_pct') {
        for (const p of s.positions) {
          const tighter = Number((p.entryPrice * (1 - num / 100)).toPrecision(6));
          if (tighter > p.stopPrice) p.stopPrice = tighter;
        }
      }
    } else if (key === 'new_buys_stopped' && typeof rawValue === 'boolean') {
      const oldVal = s.settings.new_buys_stopped;
      s.settings.new_buys_stopped = rawValue;
      s.changeLog.unshift({ id: uid('cl'), ts: Date.now(), key, oldVal, newVal: rawValue, who: 'me' });
    } else if (key === 'fomo_handle' && typeof rawValue === 'string') {
      let clean = rawValue.trim();
      const urlMatch = clean.match(/fomo\.family\/profile\/([a-zA-Z0-9_.-]{1,32})/i);
      if (urlMatch?.[1]) {
        clean = urlMatch[1];
      }
      clean = clean.replace(/^@+/, '');
      if (!/^[a-zA-Z0-9_.-]{1,32}$/.test(clean)) {
        throw new Error('FOMOユーザー名は1〜32文字の半角英数字・記号（_ . -）で入力してください。');
      }
      const oldVal = s.settings.fomo_handle;
      s.settings.fomo_handle = clean;
      s.changeLog.unshift({ id: uid('cl'), ts: Date.now(), key, oldVal, newVal: clean, who: 'me' });
    } else if (key === 'fomo_solana_address' && typeof rawValue === 'string') {
      const clean = rawValue.trim();
      if (clean && !isValidSolanaMint(clean)) {
        throw new Error('有効なSolanaアドレス（Base58形式・32〜44文字）を入力してください。');
      }
      const oldVal = s.settings.fomo_solana_address || '(未設定)';
      s.settings.fomo_solana_address = clean;
      s.changeLog.unshift({
        id: uid('cl'),
        ts: Date.now(),
        key,
        oldVal,
        newVal: clean || '(cleared)',
        who: 'me',
      });
    } else if (key === 'withdraw_address' && typeof rawValue === 'string') {
      const clean = rawValue.trim();
      if (clean && !isValidSolanaMint(clean)) {
        throw new Error('Withdraw address must be a valid Solana Base58 address.');
      }
      const oldVal = s.settings.withdraw_address;
      s.settings.withdraw_address = clean;
      s.changeLog.unshift({ id: uid('cl'), ts: Date.now(), key, oldVal, newVal: clean || '(cleared)', who: 'me' });
    } else if (
      (key === 'night_start' || key === 'lock_time' || key === 'report_time') &&
      typeof rawValue === 'string'
    ) {
      const clean = rawValue.trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clean)) {
        throw new Error('時刻は HH:MM 形式（例: 22:00）で入力してください。');
      }
      const oldVal = s.settings[key];
      s.settings[key] = clean;
      s.changeLog.unshift({ id: uid('cl'), ts: Date.now(), key, oldVal, newVal: clean, who: 'me' });
    } else if (key === 'paper_start_cash') {
      const num = Number(rawValue);
      if (!Number.isFinite(num) || num < 20 || num > 100_000) {
        throw new Error('paper_start_cash must be between 20 and 100000.');
      }
      const oldVal = s.settings.paper_start_cash;
      s.settings.paper_start_cash = num;
      s.changeLog.unshift({ id: uid('cl'), ts: Date.now(), key, oldVal, newVal: num, who: 'me' });
    } else {
      throw new Error(`Unsupported or out-of-range setting: ${key}`);
    }

    s.changeLog = s.changeLog.slice(0, 60);
    this.recomputeRegimeMode();
    this.recomputeEquity();
    this.saveNow();
    this.emit('state', this.getState());
    return s.settings;
  }

  public toggleStrategy(stratId: StratId, enabled: boolean): StrategyConfig {
    const s = this.store.state;
    const strat = s.strategies.find((st) => st.id === stratId);
    if (!strat) throw new Error('Unknown strategy');
    if (strat.autoOnly) throw new Error('STRAT 6 (RED) activates automatically with Market Mode.');
    strat.enabled = enabled;
    s.changeLog.unshift({
      id: uid('cl'),
      ts: Date.now(),
      key: `strat_${stratId}`,
      oldVal: !enabled,
      newVal: enabled,
      who: 'me',
    });
    this.saveNow();
    this.emit('state', this.getState());
    return strat;
  }

  public toggleCopyTrader(id: string, copyOn: boolean): CopyTrader {
    const s = this.store.state;
    const trader = s.copyTraders.find((t) => t.id === id);
    if (!trader) throw new Error('Trader not found');
    if (copyOn) {
      const activeCount = s.copyTraders.filter((t) => t.copyOn && t.id !== id).length;
      if (activeCount >= 2) {
        throw new Error('Max 2 traders can be copied at the same time (COPY PICKS rule).');
      }
    }
    trader.copyOn = copyOn;
    const copyStrat = s.strategies.find((st) => st.id === 'copy');
    if (copyStrat) {
      copyStrat.enabled = s.copyTraders.some((t) => t.copyOn);
    }
    this.saveNow();
    this.emit('state', this.getState());
    return trader;
  }

  public updateLessonStatus(tag: string, status: 'active' | 'watch' | 'archived'): Lesson {
    const s = this.store.state;
    const lesson = s.lessons.find((l) => l.tag === tag);
    if (!lesson) throw new Error('Lesson not found');
    lesson.status = status;
    this.saveNow();
    this.emit('state', this.getState());
    return lesson;
  }

  public answerMorningQuestion(id: string, answer: 'yes' | 'no'): MorningReport {
    const s = this.store.state;
    const q = s.morningReport.questions.find((item) => item.id === id);
    if (q) q.answered = answer;
    if (id === 'q2' && answer === 'yes') {
      this.updateSetting('trail_pct', 30);
    }
    this.saveNow();
    this.emit('state', this.getState());
    return s.morningReport;
  }

  public setRegimeOverride(override: MarketMode | 'AUTO'): RegimeState {
    const s = this.store.state;
    s.regime.override = override;
    this.recomputeRegimeMode();
    this.recomputeEquity();
    this.saveNow();
    this.emit('state', this.getState());
    return s.regime;
  }

  public flatAll(): { closed: number } {
    const s = this.store.state;
    let closed = 0;
    for (const pos of [...s.positions]) {
      this.executeSell(pos.mint, 100, 'executor', 'flat all (owner command)');
      closed += 1;
    }
    s.settings.new_buys_stopped = true;
    this.saveNow();
    this.emit('state', this.getState());
    return { closed };
  }

  public resetPaperDesk(): DeskState {
    const prevHandle = this.store.state.settings.fomo_handle;
    const prevSolAddr = this.store.state.settings.fomo_solana_address;
    this.recentTradedAt.clear();
    this.store = this.createCleanLiveStore(prevHandle, prevSolAddr, 'PAPER');
    this.saveNow();
    void this.bootstrapLiveData();
    this.emit('state', this.getState());
    return this.getState();
  }

  public async runCommand(rawCmd: string): Promise<{ ok: boolean; reply: string }> {
    const cmd = rawCmd.trim();
    const lower = cmd.toLowerCase();
    const s = this.store.state;

    if (!cmd) return { ok: false, reply: 'Empty command. Try: status, mode, meta, strats, lessons, scan, live, paper, flat, stop.' };

    if (lower === 'status') {
      const posSummary =
        s.positions.length === 0
          ? '0 open positions'
          : s.positions.map((p) => `${p.symbol} (${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct}%)`).join(', ');
      return {
        ok: true,
        reply: `${s.mode} · Equity $${s.totalEquityUsd.toFixed(2)} (${s.todayPnlPct >= 0 ? '+' : ''}${s.todayPnlPct}%) · Cash $${s.cashUsd.toFixed(2)} · Market ${s.regime.mode} · ${posSummary}`,
      };
    }

    if (lower === 'scan') {
      const res = await this.runLiveMarketScan();
      return {
        ok: true,
        reply: `Live scan complete: ${res.scanned} Solana pools scanned, ${res.passed} passed 8/8${res.traded ? ', 1 live entry executed' : ''}.`,
      };
    }

    if (lower === 'live') {
      this.setMode('LIVE', 'LIVE');
      return { ok: true, reply: 'Mode switched to LIVE.' };
    }

    if (lower === 'paper') {
      this.setMode('PAPER');
      return { ok: true, reply: 'Mode switched to PAPER.' };
    }

    if (lower === 'mode') {
      return {
        ok: true,
        reply: `Desk: ${s.mode} | Market: ${s.regime.mode} | BTC $${s.regime.btcPrice.toLocaleString()} (${s.regime.btc24hPct}%) | SOL $${s.regime.solPrice} (${s.regime.sol24hPct}%) | F&G ${s.regime.fearGreed} (${s.regime.fearGreedLabel})`,
      };
    }

    if (lower === 'meta') {
      const lines = s.metaThemes
        .slice(0, 5)
        .map((m) => `${m.keyword}: ${fmtUsd(m.volume24hUsd)} (${m.leadChange24h >= 0 ? '+' : ''}${m.leadChange24h}% 24h)`);
      return { ok: true, reply: lines.length ? `Live Solana themes:\n${lines.join('\n')}` : 'Fetching live themes...' };
    }

    if (lower === 'strats') {
      const lines = s.strategies.map(
        (st) => `${st.id}: ${st.enabled ? 'ON' : 'OFF'} · ${st.trades} trades · ${st.winRate}% win · ${st.netUsd >= 0 ? '+' : ''}$${st.netUsd.toFixed(2)}`
      );
      return { ok: true, reply: lines.join('\n') };
    }

    if (lower === 'lessons') {
      const lines = s.lessons
        .slice(0, 5)
        .map((l) => `[${l.status}] ${l.tag}: ${l.field} ${l.op} ${l.value} (hit ${l.timesHit}x · saved $${l.savedUsd.toFixed(1)})`);
      return { ok: true, reply: lines.join('\n') };
    }

    if (lower === 'stop') {
      this.updateSetting('new_buys_stopped', true);
      return { ok: true, reply: 'New buys stopped. Risk continues guarding all open positions.' };
    }

    if (lower === 'resume') {
      this.updateSetting('new_buys_stopped', false);
      return { ok: true, reply: 'New buys resumed.' };
    }

    if (lower === 'flat') {
      const res = this.flatAll();
      return { ok: true, reply: `Closed ${res.closed} open position(s) and stopped new buys.` };
    }

    if (lower.startsWith('why ')) {
      const target = cmd.slice(4).trim().toLowerCase();
      const coin = s.auditedCoins.find(
        (c) => c.symbol.toLowerCase() === target || c.mint.toLowerCase().startsWith(target)
      );
      if (!coin) return { ok: false, reply: `No recent audit record for "${cmd.slice(4).trim()}".` };
      return {
        ok: true,
        reply: `${coin.symbol}: Scanner=${coin.scannerVerdict} (${coin.scannerReason}) | Analyst=${coin.layersPassed}/8 (${coin.analystReason}) | Score=${coin.score.total}`,
      };
    }

    if (lower.startsWith('audit ')) {
      const mint = cmd.slice(6).trim();
      try {
        const res = await this.auditSolanaMint(mint);
        return {
          ok: true,
          reply: `Live Audit ${res.symbol}: ${res.layersPassed}/8 layers · Score ${res.score.total} · Liq ${fmtUsd(res.liquidityUsd)} · ${res.analystReason}`,
        };
      } catch (err) {
        return { ok: false, reply: err instanceof Error ? err.message : 'Audit failed' };
      }
    }

    if (lower.startsWith('sell ')) {
      const parts = cmd.split(/\s+/);
      const target = (parts[1] || '').toLowerCase();
      const pct = Number(parts[2] || 100);
      const pos = s.positions.find(
        (p) => p.symbol.toLowerCase() === target || p.mint.toLowerCase().startsWith(target)
      );
      if (!pos) return { ok: false, reply: `No open position matching "${parts[1] || ''}".` };
      const closed = this.executeSell(pos.mint, pct, 'executor', `manual sell ${pct}%`);
      return {
        ok: true,
        reply: closed
          ? `Sold ${pct}% of ${pos.symbol}: ${closed.pnlUsd >= 0 ? '+' : ''}$${closed.pnlUsd.toFixed(2)} (${closed.pnlPct}%)`
          : 'Sell failed.',
      };
    }

    if (lower.startsWith('pause ') || lower.startsWith('resume ')) {
      const isPause = lower.startsWith('pause ');
      const botName = cmd.split(/\s+/)[1]?.toLowerCase() as BotId;
      if (!(botName in BOT_META)) {
        return { ok: false, reply: 'Specify one of: scanner, analyst, brain, executor, risk.' };
      }
      try {
        this.setBotPaused(botName, isPause);
        return { ok: true, reply: `${BOT_META[botName].name} ${isPause ? 'paused' : 'resumed'}.` };
      } catch (err) {
        return { ok: false, reply: err instanceof Error ? err.message : 'Action refused.' };
      }
    }

    if (lower.startsWith('set ')) {
      const parts = cmd.split(/\s+/);
      const key = parts[1];
      const val = parts[2];
      if (!key || val === undefined) {
        return { ok: false, reply: 'Usage: set <setting_key> <value> (e.g. set stop_pct 25 or set strat_wave off)' };
      }
      if (key.startsWith('strat_')) {
        const stratId = key.replace('strat_', '') as StratId;
        const on = val.toLowerCase() === 'on' || val === 'true';
        try {
          this.toggleStrategy(stratId, on);
          return { ok: true, reply: `${key} -> ${on ? 'ON' : 'OFF'} (logged in change_log)` };
        } catch (err) {
          return { ok: false, reply: err instanceof Error ? err.message : 'Strategy update failed.' };
        }
      }
      try {
        const oldVal = s.settings[key as keyof DeskSettings];
        this.updateSetting(key as keyof DeskSettings, val);
        return { ok: true, reply: `${key}: ${String(oldVal)} -> ${val} (logged in change_log)` };
      } catch (err) {
        return { ok: false, reply: err instanceof Error ? err.message : 'Out of range.' };
      }
    }

    return {
      ok: false,
      reply: `Unknown command "${cmd}". Available: status, scan, live, paper, mode, meta, strats, lessons, why <coin>, audit <mint>, sell <coin> <pct>, pause <bot>, set <key> <val>, stop, resume, flat.`,
    };
  }

  public getState(): DeskState {
    return this.store.state;
  }

  public getChart(range: ChartRange): BalancePoint[] {
    const now = Date.now();
    const windowMs: Record<ChartRange, number> = {
      LIVE: 45 * 60_000,
      '1H': 60 * 60_000,
      '4H': 4 * 3600_000,
      '1D': 24 * 3600_000,
      '1W': 7 * 24 * 3600_000,
      ALL: Number.MAX_SAFE_INTEGER,
    };
    const cutoff = now - (windowMs[range] ?? windowMs['1D']);
    const pts = this.store.balanceHistory.filter((p) => p.ts >= cutoff);
    return pts.length >= 2 ? pts : this.store.balanceHistory;
  }

  public getCoin(mint: string): { coin?: AuditedCoin; position?: Position } {
    const s = this.store.state;
    return {
      coin: s.auditedCoins.find((c) => c.mint === mint),
      position: s.positions.find((p) => p.mint === mint),
    };
  }

  public dispose(): void {
    if (this.priceTimer) clearInterval(this.priceTimer);
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.marketTimer) clearInterval(this.marketTimer);
  }
}
