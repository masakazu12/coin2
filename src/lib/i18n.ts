export type Lang = 'ja' | 'en';

export function fmtUsd(n: number, decimals = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '$0.00';
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toPrecision(4)}`;
}

export function fmtTimeAgo(ts: number, lang: Lang): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return lang === 'ja' ? `${sec}秒前` : `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return lang === 'ja' ? `${min}分前` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lang === 'ja' ? `${hr}時間前` : `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return lang === 'ja' ? `${d}日前` : `${d}d ago`;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

export const T = {
  ja: {
    home: 'ホーム',
    bots: 'ボット',
    activity: '履歴',
    account: '設定',
    deskTitle: 'Meme Coin Trading Bot',
    today: '本日',
    cashFree: '待機資金',
    liveScreen: 'ライブ操作画面',
    liveBotComputer: 'Live · デスク操作レーン',
    fullscreen: '全画面',
    openPositions: '保有ポジション',
    noPositions: '現在保有中のポジションはありません',
    waitingFirstTrade: '条件を満たす銘柄の押し目を待機中',
    botsRunning: '稼働中ボット',
    recentActivity: '最近のアクティビティ',
    seeAll: 'すべて見る',
    runScan: 'ライブスキャン',
    scanning: 'スキャン中...',
    auditMint: 'ミント監査',
    commands: 'コマンド',
    openOnFomo: 'FOMOで開く',
    sellNow: '売却する',
    confirmSell: '売却を確定',
    buyPaper: 'エントリー実行',
    cancel: 'キャンセル',
    pause: '一時停止',
    resume: '再開',
    riskLocked: '保有中はRiskを停止不可',
    strategies: '7つの戦略 (STRAT 1–7)',
    all: 'すべて',
    trades: '売買',
    skips: '見送り/除外',
    lessons: '学習ルール',
    morningPage: '朝のレポート',
    copyPicks: 'コピー候補',
    metaThemes: '今週のテーマ',
    tradingMode: '取引モード',
    paperHint: 'PAPERモードは実資金を使わず、クリック直前までの全工程と仮想約定を実行します。',
    liveWarning:
      'LIVEはFOMO上の実資金で売買します。新規コインは数分でゼロになる可能性があります。失っても問題ない金額のみ投入してください。',
    typeLiveToUnlock: '切り替えるには下に LIVE と入力してください',
    switchToLive: 'LIVEモードへ切替',
    switchToPaper: 'PAPERモードに戻す',
    emergencyControls: '緊急コントロール',
    stopNewBuys: '新規買いを停止',
    resumeNewBuys: '新規買いを再開',
    flatAll: '全決済して停止 (Flat)',
    resetPaper: 'PAPER残高をリセット',
    withdrawTitle: '出金レビュー (S7ルール)',
    withdrawNote: 'ボットは「Review withdraw」で必ず停止します。確定ボタンと2FAは常に手動で行います。',
    withdrawBtn: '出金レビューを作成',
    settingsTitle: 'ボット別パラメータ (STEP 12)',
    changeLog: '設定変更ログ',
    searchPlaceholder: '銘柄名 または Solanaミントアドレスを入力してライブ監査...',
    runLiveAudit: '8層ライブ監査を実行',
    auditing: 'RugCheck / DexScreener照会中...',
    regimeAuto: '自動判定',
    refreshMarket: '市況更新',
  },
  en: {
    home: 'Home',
    bots: 'Bots',
    activity: 'Activity',
    account: 'Account',
    deskTitle: 'Meme Coin Trading Bot',
    today: 'today',
    cashFree: 'Free cash',
    liveScreen: 'Live Desk Screen',
    liveBotComputer: "Live · Bot's computer",
    fullscreen: 'Fullscreen',
    openPositions: 'Open Positions',
    noPositions: 'No open positions right now',
    waitingFirstTrade: 'Waiting for a cleared dip setup',
    botsRunning: 'Bots running',
    recentActivity: 'Recent Activity',
    seeAll: 'See all',
    runScan: 'Live Scan',
    scanning: 'Scanning...',
    auditMint: 'Audit Mint',
    commands: 'Commands',
    openOnFomo: 'Open on FOMO',
    sellNow: 'Sell now',
    confirmSell: 'Confirm sell',
    buyPaper: 'Execute Entry',
    cancel: 'Cancel',
    pause: 'Pause',
    resume: 'Resume',
    riskLocked: 'Risk locked while position open',
    strategies: '7 Strategies (STRAT 1–7)',
    all: 'All',
    trades: 'Trades',
    skips: 'Skips & Kills',
    lessons: 'Lessons',
    morningPage: 'Morning Page',
    copyPicks: 'Copy Picks',
    metaThemes: 'Meta Themes',
    tradingMode: 'Trading Mode',
    paperHint: 'PAPER runs the full pipeline and quote check without pressing the final buy button.',
    liveWarning:
      'LIVE trades real cash on FOMO. New coins can go to 0 in minutes. Only put in what you can lose.',
    typeLiveToUnlock: 'Type LIVE below to unlock real-money execution',
    switchToLive: 'Switch to LIVE',
    switchToPaper: 'Back to PAPER',
    emergencyControls: 'Emergency Controls',
    stopNewBuys: 'Stop New Buys',
    resumeNewBuys: 'Resume New Buys',
    flatAll: 'Flat All Positions',
    resetPaper: 'Reset PAPER Desk',
    withdrawTitle: 'Withdraw Review (S7 Rule)',
    withdrawNote: 'The desk always stops at "Review withdraw". Confirm and 2FA are strictly manual.',
    withdrawBtn: 'Prepare Review Withdraw',
    settingsTitle: 'Bot Parameters (STEP 12)',
    changeLog: 'Change Log',
    searchPlaceholder: 'Search symbol or paste any Solana mint address for live 8-layer audit...',
    runLiveAudit: 'Run Live 8-Layer Audit',
    auditing: 'Querying RugCheck & DexScreener...',
    regimeAuto: 'Auto',
    refreshMarket: 'Refresh',
  },
} as const;
