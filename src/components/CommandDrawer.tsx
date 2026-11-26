import React, { useState } from 'react';
import { X, Send } from 'lucide-react';
import { type Lang, T } from '../lib/i18n.ts';

interface CommandDrawerProps {
  lang: Lang;
  onClose: () => void;
  onExecute: (cmd: string) => Promise<{ ok: boolean; reply: string }>;
}

const QUICK_COMMANDS = ['status', 'mode', 'meta', 'strats', 'lessons', 'why GROKIA', 'why 4CHAN', 'stop', 'resume'];

interface LogRow {
  id: string;
  cmd: string;
  reply: string;
  ok: boolean;
}

export const CommandDrawer: React.FC<CommandDrawerProps> = ({ lang, onClose, onExecute }) => {
  const t = T[lang];
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<LogRow[]>([
    {
      id: 'init',
      cmd: 'status',
      reply:
        lang === 'ja'
          ? 'コマンド例: status / mode / meta / strats / lessons / why <銘柄> / audit <ミント> / sell <銘柄> 50 / set stop_pct 25 / stop / flat'
          : 'Try: status · mode · meta · strats · lessons · why <coin> · audit <mint> · sell <coin> 50 · set stop_pct 25 · stop · flat',
      ok: true,
    },
  ]);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const res = await onExecute(clean);
      setHistory((prev) => [{ id: `${Date.now()}`, cmd: clean, reply: res.reply, ok: res.ok }, ...prev].slice(0, 25));
      setInput('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[#1c1c1e] rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col p-5 pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[rgba(84,84,88,0.45)]">
          <div>
            <h2 className="text-base font-bold text-white">{t.commands}</h2>
            <p className="text-xs text-[rgba(235,235,245,0.55)]">
              {lang === 'ja' ? 'デスクへ直接テキスト指示を送信' : 'Direct plain-text desk commands'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#2c2c2e] flex items-center justify-center text-white cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick-tap command buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-3">
          {QUICK_COMMANDS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void send(q)}
              className="px-3 py-1.5 rounded-lg bg-[#2c2c2e] hover:bg-[#3a3a3c] text-xs font-mono-num text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Response log */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2 min-h-[220px]">
          {history.map((item) => (
            <div key={item.id} className="bg-black rounded-2xl p-3 border border-[rgba(84,84,88,0.35)]">
              <div className="text-xs font-mono-num text-[#64d2ff] font-medium">{item.cmd}</div>
              <pre
                className={`mt-1.5 text-xs font-mono-num whitespace-pre-wrap leading-relaxed ${
                  item.ok ? 'text-[rgba(235,235,245,0.85)]' : 'text-[#ff453a]'
                }`}
              >
                {item.reply}
              </pre>
            </div>
          ))}
        </div>

        {/* Command Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="status / set trail_pct 30 / why 4CHAN"
            className="flex-1 min-h-[44px] bg-black border border-[rgba(84,84,88,0.55)] rounded-xl px-3.5 text-sm font-mono-num text-white placeholder:text-[rgba(235,235,245,0.35)] focus:outline-none focus:border-[#0a84ff]"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-[#0a84ff] text-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
            aria-label="Send command"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
