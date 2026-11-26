export type DeskMode = 'PAPER' | 'LIVE';
export type MarketMode = 'GREEN' | 'QUIET' | 'RED';
export type BotId = 'scanner' | 'analyst' | 'brain' | 'executor' | 'risk';
export type StratId = 'dip' | 'news' | 'copy' | 'grad' | 'wave' | 'red' | 'trend';
export type ChartRange = 'LIVE' | '1H' | '4H' | '1D' | '1W' | 'ALL';

export interface LayerResult {
  n: number;
  name: string;
  pass: boolean | null; // null = not checked (stopped on earlier red)
  value: string;
  source: string;
  reason?: string;
}

export interface ScoreBreakdown {
  alive: number;
  organic: number;
  flush: number;
  chase: number;
  social: number | null;
  socialPts: number;
  total: number;
  u15: number;
  u60: number;
  smartHolders: number;
  shillRatio: number;
  catalyst: string | null;
}

export interface AuditedCoin {
  mint: string;
  symbol: string;
  name: string;
  pool: string;
  createdAt: number;
  ageMin: number;
  priceUsd: number;
  liquidityUsd: number;
  marketCapUsd: number;
  volume1hUsd: number;
  volume24hUsd: number;
  h1ChangePct: number;
  h24ChangePct: number;
  buys5m: number;
  sells5m: number;
  uniqueBuys1h: number;
  holders: number;
  holdersGrowthPct: number;
  top10Pct: number;
  curveMin: number | null;
  creator: string;
  isCopy: boolean;
  scannerVerdict: 'pass' | 'kill';
  scannerReason: string;
  layers: LayerResult[];
  layersPassed: number;
  score: ScoreBreakdown;
  analystPassed: boolean;
  analystReason: string;
  bullLine: string;
  bearLine: string;
  strat: StratId | null;
  fomoUrl: string;
  scannedAt: number;
  source: 'live' | 'replay';
  candles?: CandlePoint[];
}

export interface CandlePoint {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VerifyChecks {
  screen: boolean;
  api: boolean | 'paper';
  chain: boolean | 'paper' | 'n/a';
}

export interface Position {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  pool: string;
  strat: StratId;
  openedAt: number;
  entryPrice: number;
  currentPrice: number;
  peakPrice: number;
  sizeUsd: number;
  remainingUsd: number;
  tokens: number;
  stopPrice: number;
  takeProfitPrice: number;
  trailPct: number;
  tpDone: boolean;
  trailActive: boolean;
  pnlUsd: number;
  pnlPct: number;
  feesUsd: number;
  mode: DeskMode;
  score: number;
  layersPassed: number;
  liquidityUsd: number;
  marketCapUsd: number;
  holders: number;
  ageMin: number;
  fomoUrl: string;
  copiedFrom?: string;
  candles: CandlePoint[];
}

export interface ClosedTrade {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  strat: StratId;
  mode: DeskMode;
  openedAt: number;
  closedAt: number;
  entryPrice: number;
  exitPrice: number;
  sizeUsd: number;
  pnlUsd: number;
  pnlPct: number;
  feesUsd: number;
  whyIn: string;
  whyOut: string;
  checks: VerifyChecks;
  fomoUrl: string;
}

export type ActivityKind = 'bought' | 'sold' | 'stopped' | 'rejected' | 'copied' | 'regime' | 'lesson';

export interface ActivityItem {
  id: string;
  ts: number;
  kind: ActivityKind;
  mint?: string;
  symbol?: string;
  bot: BotId | 'regime';
  title: string;
  subtitle: string;
  value: string;
  valueTone: 'green' | 'red' | 'neutral' | 'orange';
  fomoUrl?: string;
  checks?: VerifyChecks;
}

export interface BotDecision {
  id: string;
  ts: number;
  symbol: string;
  mint: string;
  verdict: 'pass' | 'kill' | 'buy' | 'sell' | 'stop' | 'skip';
  detail: string;
  fomoUrl: string;
}

export interface BotStatus {
  id: BotId;
  name: string;
  color: string;
  paused: boolean;
  locked: boolean;
  statusLine: string;
  countToday: number;
  countLabel: string;
  heartbeatTs: number;
  metrics: { label: string; value: string; tone?: 'green' | 'red' | 'neutral' | 'orange' }[];
  recentDecisions: BotDecision[];
}

export interface Lesson {
  tag: string;
  ts: number;
  symbol: string;
  strat: StratId;
  lossUsd: number;
  field: string;
  op: '>' | '<' | '>=' | '<=' | '==';
  value: number | string;
  summary: string;
  timesHit: number;
  savedUsd: number;
  missedUsd: number;
  status: 'active' | 'watch' | 'archived';
}

export interface CopyTrader {
  id: string;
  rank: number;
  handle: string;
  pnl7d: number;
  pnl30d: number;
  trades: number;
  lastTradeAgo: string;
  lastBuySymbol: string;
  lastBuyMint: string;
  lastBuyMcap: string;
  why: string;
  copyOn: boolean;
  lossStreak: number;
  profileUrl: string;
  lastBuyUrl: string;
}

export interface MetaTheme {
  keyword: string;
  pools7d: number;
  copiesCount: number;
  volume24hUsd: number;
  leadSymbol: string;
  leadChange24h: number;
  status: 'hot' | 'cooling' | 'dead';
  asOf: string;
}

export interface RegimeState {
  mode: MarketMode;
  override: MarketMode | 'AUTO';
  btcPrice: number;
  btc1hPct: number;
  btc24hPct: number;
  solPrice: number;
  sol1hPct: number;
  sol24hPct: number;
  fearGreed: number;
  fearGreedLabel: string;
  solanaDexVol24hUsd: number;
  solanaDexChange1d: number;
  pumpSwapVol24hUsd: number;
  graduationsLastHour: number;
  stopsInARow: number;
  reason: string;
  updatedAt: number;
  sourceLive: boolean;
}

export interface StrategyConfig {
  id: StratId;
  name: string;
  enabled: boolean;
  autoOnly?: boolean;
  trades: number;
  winRate: number;
  netUsd: number;
  ruleSummary: string;
  neverSummary: string;
}

export interface LiveScreenState {
  updatedAt: number;
  activeBot: BotId | null;
  actionLabel: string;
  targetButton: 'buy_tab' | 'sell_tab' | 'amount' | 'preset_50' | 'preset_max' | 'primary' | 'search' | 'idle';
  cursorX: number; // 0..100 percentage
  cursorY: number; // 0..100 percentage
  clicking: boolean;
  coinSymbol: string;
  coinName: string;
  coinMint: string;
  coinPriceUsd: number;
  coinChange24h: number;
  coinMcap: string;
  coinLiquidity: string;
  coinHolders: string;
  coinTop10: string;
  tab: 'Buy' | 'Sell';
  amountText: string;
  quoteLine: string;
  feeLine: string;
  primaryButtonText: string;
  activityToast: string | null;
  lastOrderSummary: string;
  lastOrderChecks: VerifyChecks;
  privatePaused: boolean;
}

export interface BalancePoint {
  ts: number;
  equity: number;
  marker?: {
    label: string;
    tone: 'green' | 'red';
    symbol: string;
  };
}

export interface ChangeLogEntry {
  id: string;
  ts: number;
  key: string;
  oldVal: string | number | boolean;
  newVal: string | number | boolean;
  who: 'me' | 'desk';
}

export interface MorningReport {
  dateStr: string;
  mode: DeskMode;
  marketMode: MarketMode;
  startEquity: number;
  endEquity: number;
  netPnlUsd: number;
  netPnlPct: number;
  feesPaidUsd: number;
  coinsSeen: number;
  scannerPassed: number;
  analystPassed: number;
  tradesCount: number;
  redTrades: ClosedTrade[];
  greenTrades: ClosedTrade[];
  killsByReason: { reason: string; count: number }[];
  refusalsByLayer: { layer: string; count: number }[];
  questions: { id: string; text: string; answered?: 'yes' | 'no' }[];
}

export interface DeskSettings {
  // Scanner
  min_liquidity_usd: number;
  max_top10_pct: number;
  max_h1_change_pct: number;
  min_pool_age_min: number;
  min_holders_growth_pct: number;
  // Analyst
  max_dev_pct: number;
  min_lp_locked_pct: number;
  max_bundled: number;
  min_score: number;
  social_weight: number;
  // Brain
  risk_per_trade_pct: number;
  full_size_score: number;
  below_full_pct: number;
  max_pool_pct: number;
  max_ticket_usd: number;
  max_trades_night: number;
  // Executor
  dip_pct: number;
  crash_pct: number;
  dip_wait_min: number;
  tp_x: number;
  tp_sell_pct: number;
  trail_pct: number;
  // Risk
  stop_pct: number;
  timeout_h: number;
  timeout_min_gain_pct: number;
  night_loss_stop_pct: number;
  // Regime
  red_btc_h1_pct: number;
  red_sol_h1_pct: number;
  red_fear_index: number;
  red_tp_x: number;
  red_trail_pct: number;
  red_night_stop_pct: number;
  // Desk
  paper_start_cash: number;
  fomo_handle: string;
  fomo_solana_address: string;
  withdraw_address: string;
  night_start: string;
  lock_time: string;
  report_time: string;
  new_buys_stopped: boolean;
}

export interface DeskState {
  mode: DeskMode;
  paperNightsCompleted: number;
  acceptancePassed: boolean;
  cashUsd: number;
  startEquityUsd: number;
  totalEquityUsd: number;
  todayPnlUsd: number;
  todayPnlPct: number;
  multiplier: number;
  regime: RegimeState;
  bots: BotStatus[];
  positions: Position[];
  closedTrades: ClosedTrade[];
  auditedCoins: AuditedCoin[];
  activity: ActivityItem[];
  lessons: Lesson[];
  copyTraders: CopyTrader[];
  metaThemes: MetaTheme[];
  strategies: StrategyConfig[];
  liveScreen: LiveScreenState;
  settings: DeskSettings;
  changeLog: ChangeLogEntry[];
  morningReport: MorningReport;
  lastScanTs: number;
}
