import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import type { BotId, ChartRange, DeskMode, DeskSettings, MarketMode, StratId } from './src/shared/types.ts';
import { isValidSolanaMint } from './src/shared/links.ts';
import { OvernightDeskEngine } from './src/server/deskEngine.ts';

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const engine = new OvernightDeskEngine();

  app.use(express.json({ limit: '64kb' }));

  // Basic security headers (keeping iframe preview compatible)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // --- API ROUTES (STEP 8) ---
  app.get('/api/state', (_req, res) => {
    res.json(engine.getState());
  });

  app.get('/api/chart', (req, res) => {
    const allowed: ChartRange[] = ['LIVE', '1H', '4H', '1D', '1W', 'ALL'];
    const raw = String(req.query.range || '1D').toUpperCase() as ChartRange;
    const range = allowed.includes(raw) ? raw : '1D';
    res.json({ range, points: engine.getChart(range) });
  });

  app.get('/api/activity', (_req, res) => {
    res.json({ rows: engine.getState().activity });
  });

  app.get('/api/coin/:mint', (req, res) => {
    const mint = req.params.mint;
    if (!isValidSolanaMint(mint)) {
      res.status(400).json({ error: 'Invalid Solana mint address.' });
      return;
    }
    res.json(engine.getCoin(mint));
  });

  app.get('/api/audit/:mint', async (req, res) => {
    const mint = req.params.mint;
    if (!isValidSolanaMint(mint)) {
      res.status(400).json({ error: 'Invalid Solana mint address (expected Base58).' });
      return;
    }
    try {
      const report = await engine.auditSolanaMint(mint);
      res.json(report);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Audit failed.' });
    }
  });

  app.post('/api/scan', async (_req, res) => {
    try {
      const result = await engine.runLiveMarketScan();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Scan failed.' });
    }
  });

  app.post('/api/regime/refresh', async (_req, res) => {
    const regime = await engine.refreshLiveMarketData();
    res.json(regime);
  });

  app.post('/api/regime/override', (req, res) => {
    const val = String(req.body?.override || 'AUTO').toUpperCase();
    if (!['AUTO', 'GREEN', 'QUIET', 'RED'].includes(val)) {
      res.status(400).json({ error: 'Invalid regime override.' });
      return;
    }
    res.json(engine.setRegimeOverride(val as MarketMode | 'AUTO'));
  });

  app.post('/api/bots/:name/:action', (req, res) => {
    const name = req.params.name.toLowerCase() as BotId;
    const action = req.params.action.toLowerCase();
    if (!['scanner', 'analyst', 'brain', 'executor', 'risk'].includes(name)) {
      res.status(400).json({ error: 'Unknown bot name.' });
      return;
    }
    if (action !== 'pause' && action !== 'resume') {
      res.status(400).json({ error: 'Action must be pause or resume.' });
      return;
    }
    try {
      const bot = engine.setBotPaused(name, action === 'pause');
      res.json(bot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update bot.' });
    }
  });

  app.post('/api/mode', (req, res) => {
    const mode = String(req.body?.mode || '').toUpperCase() as DeskMode;
    const confirm = typeof req.body?.confirm === 'string' ? req.body.confirm : undefined;
    if (mode !== 'PAPER' && mode !== 'LIVE') {
      res.status(400).json({ error: 'Mode must be PAPER or LIVE.' });
      return;
    }
    try {
      const updated = engine.setMode(mode, confirm);
      res.json({ mode: updated, state: engine.getState() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Mode switch refused.' });
    }
  });

  app.post('/api/buy/:mint', (req, res) => {
    const mint = req.params.mint;
    if (!isValidSolanaMint(mint)) {
      res.status(400).json({ error: 'Invalid Solana mint address.' });
      return;
    }
    try {
      const pos = engine.executeBuy(mint);
      res.json(pos);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Buy refused.' });
    }
  });

  app.post('/api/sell/:mint', (req, res) => {
    const mint = req.params.mint;
    const pct = Number(req.body?.pct ?? 100);
    const confirm = req.body?.confirm === true;
    if (!isValidSolanaMint(mint)) {
      res.status(400).json({ error: 'Invalid Solana mint address.' });
      return;
    }
    if (!confirm) {
      res.status(400).json({ error: 'Explicit confirm: true is required to sell.' });
      return;
    }
    if (!Number.isFinite(pct) || pct < 10 || pct > 100) {
      res.status(400).json({ error: 'Sell percentage must be between 10 and 100.' });
      return;
    }
    const trade = engine.executeSell(mint, pct, 'executor', `manual sell ${pct}%`);
    if (!trade) {
      res.status(404).json({ error: 'Open position not found.' });
      return;
    }
    res.json(trade);
  });

  app.post('/api/flat', (_req, res) => {
    res.json(engine.flatAll());
  });

  app.post('/api/settings', (req, res) => {
    const key = String(req.body?.key || '') as keyof DeskSettings;
    const value = req.body?.value;
    try {
      const settings = engine.updateSetting(key, value);
      res.json(settings);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid setting.' });
    }
  });

  app.post('/api/strats/:name', (req, res) => {
    const name = req.params.name.toLowerCase() as StratId;
    const enabled = Boolean(req.body?.enabled);
    try {
      const strat = engine.toggleStrategy(name, enabled);
      res.json(strat);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Strategy update failed.' });
    }
  });

  app.post('/api/picks/:id', (req, res) => {
    const id = req.params.id;
    const copyOn = Boolean(req.body?.copyOn);
    try {
      const trader = engine.toggleCopyTrader(id, copyOn);
      res.json(trader);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Copy toggle refused.' });
    }
  });

  app.post('/api/lessons/:tag', (req, res) => {
    const tag = req.params.tag;
    const status = String(req.body?.status || '');
    if (!['active', 'watch', 'archived'].includes(status)) {
      res.status(400).json({ error: 'Invalid lesson status.' });
      return;
    }
    try {
      const lesson = engine.updateLessonStatus(tag, status as 'active' | 'watch' | 'archived');
      res.json(lesson);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Lesson not found.' });
    }
  });

  app.post('/api/morning/answer', (req, res) => {
    const id = String(req.body?.id || '');
    const answer = req.body?.answer === 'yes' ? 'yes' : 'no';
    res.json(engine.answerMorningQuestion(id, answer));
  });

  app.post('/api/command', async (req, res) => {
    const command = typeof req.body?.command === 'string' ? req.body.command.slice(0, 200) : '';
    const result = await engine.runCommand(command);
    res.json(result);
  });

  app.post('/api/reset-paper', (_req, res) => {
    res.json(engine.resetPaperDesk());
  });

  // Server-Sent Events stream (STEP 8 GET /api/stream)
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.write(`event: state\ndata: ${JSON.stringify(engine.getState())}\n\n`);

    const unsub = engine.subscribe((event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    });

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsub();
    });
  });

  // Frontend serving: Vite middleware in dev, static dist in prod
  const distDir = path.resolve(process.cwd(), 'dist');
  if (!isProd && !fs.existsSync(path.join(distDir, 'index.html'))) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Meme Coin Trading Bot listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
