import React, { useState } from 'react';
import { ExternalLink, ShieldAlert, Check } from 'lucide-react';
import type { DeskMode, DeskSettings, DeskState } from '../shared/types.ts';
import { SETTING_RULES } from '../shared/settingsSpec.ts';
import { profileUrl, SIGNUP_URL } from '../shared/links.ts';
import { fmtClock, type Lang, T } from '../lib/i18n.ts';

interface AccountViewProps {
  state: DeskState;
  lang: Lang;
  onSwitchMode: (mode: DeskMode, confirmText?: string) => Promise<void>;
  onUpdateSetting: (key: keyof DeskSettings, value: unknown) => Promise<void>;
  onFlatAll: () => Promise<void>;
  onResetPaper: () => Promise<void>;
}

const GROUPS: Array<{ id: 'scanner' | 'analyst' | 'brain' | 'executor' | 'risk' | 'regime'; title: string; color: string }> = [
  { id: 'scanner', title: 'Scanner', color: '#64d2ff' },
  { id: 'analyst', title: 'Analyst', color: '#ffd60a' },
  { id: 'brain', title: 'Brain', color: '#bf5af2' },
  { id: 'executor', title: 'Executor', color: '#00d35a' },
  { id: 'risk', title: 'Risk', color: '#ff6b9a' },
  { id: 'regime', title: 'Market Mode', color: '#ff453a' },
];

export const AccountView: React.FC<AccountViewProps> = ({
  state,
  lang,
  onSwitchMode,
  onUpdateSetting,
  onFlatAll,
  onResetPaper,
}) => {
  const t = T[lang];
  const [liveInput, setLiveInput] = useState('');
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [modeSuccess, setModeSuccess] = useState<string | null>(null);
  const [settingError, setSettingError] = useState<string | null>(null);
  const [settingSaved, setSettingSaved] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<'scanner' | 'analyst' | 'brain' | 'executor' | 'risk' | 'regime'>('risk');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddr, setWithdrawAddr] = useState(state.settings.withdraw_address);
  const [withdrawReady, setWithdrawReady] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // FOMO Profile editor state
  const [fomoHandleInput, setFomoHandleInput] = useState(state.settings.fomo_handle);
  const [fomoSolAddrInput, setFomoSolAddrInput] = useState(state.settings.fomo_solana_address || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  React.useEffect(() => {
    setFomoHandleInput(state.settings.fomo_handle);
    setFomoSolAddrInput(state.settings.fomo_solana_address || '');
    setWithdrawAddr(state.settings.withdraw_address);
  }, [state.settings.fomo_handle, state.settings.fomo_solana_address, state.settings.withdraw_address]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    setProfileSaving(true);
    try {
      const nextHandle = fomoHandleInput.trim();
      if (nextHandle !== state.settings.fomo_handle) {
        await onUpdateSetting('fomo_handle', nextHandle);
      }
      const nextSolAddr = fomoSolAddrInput.trim();
      if (nextSolAddr !== (state.settings.fomo_solana_address || '')) {
        await onUpdateSetting('fomo_solana_address', nextSolAddr);
      }
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2400);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'プロフィールの保存に失敗しました');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleModeAction = async (target: DeskMode) => {
    setModeError(null);
    setModeSuccess(null);
    setModeBusy(true);
    try {
      const normalized = liveInput.normalize('NFKC').trim().toUpperCase();
      await onSwitchMode(target, target === 'LIVE' ? normalized : undefined);
      setLiveInput('');
      setModeSuccess(
        target === 'LIVE'
          ? lang === 'ja'
            ? 'LIVEモードを有効にしました（ライブSolanaデータで稼働中）'
            : 'LIVE mode is now active'
          : lang === 'ja'
            ? 'PAPERモードに戻しました'
            : 'Switched back to PAPER mode'
      );
      setTimeout(() => setModeSuccess(null), 4000);
    } catch (err) {
      setModeError(err instanceof Error ? err.message : 'Mode switch failed');
    } finally {
      setModeBusy(false);
    }
  };

  const handleSettingChange = async (key: keyof DeskSettings, value: number) => {
    setSettingError(null);
    setSettingSaved(null);
    try {
      await onUpdateSetting(key, value);
      setSettingSaved(`${key} updated`);
      setTimeout(() => setSettingSaved(null), 1800);
    } catch (err) {
      setSettingError(err instanceof Error ? err.message : 'Out of range');
    }
  };

  const handlePrepareWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingError(null);
    const amt = Number(withdrawAmount);
    if (!Number.isFinite(amt) || amt < 2) {
      setSettingError('Enter a valid withdraw amount ($2+).');
      return;
    }
    try {
      if (withdrawAddr.trim() !== state.settings.withdraw_address) {
        await onUpdateSetting('withdraw_address', withdrawAddr.trim());
      }
      setWithdrawReady(
        `Withdraw $${amt.toFixed(2)} prepared up to "Review withdraw". Take control in FOMO, press Confirm, and complete 2FA yourself.`
      );
    } catch (err) {
      setSettingError(err instanceof Error ? err.message : 'Invalid Solana address');
    }
  };

  const handleCopyInvite = () => {
    navigator.clipboard?.writeText(SIGNUP_URL).catch(() => {});
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const groupRules = SETTING_RULES.filter((r) => r.group === activeGroup);
  const currentProfileLink = profileUrl(state.settings.fomo_handle);
  const profileDirty =
    fomoHandleInput.trim().replace(/^@+/, '') !== state.settings.fomo_handle ||
    fomoSolAddrInput.trim() !== (state.settings.fomo_solana_address || '');

  return (
    <div className="space-y-6">
      {/* Dedicated FOMO Profile Configuration Card (STEP 1 & STEP 3) */}
      <section className="bg-[#1c1c1e] rounded-[20px] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#2c2c2e] border border-[rgba(84,84,88,0.6)] flex items-center justify-center text-sm font-bold font-mono-num text-white shrink-0">
              {state.settings.fomo_handle.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {lang === 'ja' ? 'FOMO プロフィール設定' : 'FOMO Profile'}
              </h2>
              <p className="text-xs text-[rgba(235,235,245,0.55)] font-mono-num">
                @{state.settings.fomo_handle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <a
              href={currentProfileLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0a84ff] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>{lang === 'ja' ? 'FOMOで開く' : 'Open profile'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={handleCopyInvite}
              className="text-[#0a84ff] hover:underline whitespace-nowrap cursor-pointer"
            >
              {copiedInvite
                ? lang === 'ja'
                  ? 'コピー済み'
                  : 'Link copied'
                : lang === 'ja'
                  ? '招待リンク'
                  : 'Invite link'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5 space-y-1.5">
            <label htmlFor="fomo-handle-input" className="block text-xs font-medium text-[rgba(235,235,245,0.75)]">
              {lang === 'ja' ? 'FOMO ユーザー名（@またはプロフィールURL可）' : 'FOMO Username (@handle or profile URL)'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono-num text-[rgba(235,235,245,0.45)]">
                @
              </span>
              <input
                id="fomo-handle-input"
                type="text"
                value={fomoHandleInput}
                onChange={(e) => setFomoHandleInput(e.target.value)}
                placeholder="your_fomo_handle"
                className="w-full min-h-[44px] bg-black border border-[rgba(84,84,88,0.55)] rounded-xl pl-7 pr-3 text-sm font-mono-num text-white placeholder:text-[rgba(235,235,245,0.35)] focus:outline-none focus:border-[#0a84ff]"
              />
            </div>
          </div>

          <div className="md:col-span-5 space-y-1.5">
            <label htmlFor="fomo-sol-addr-input" className="block text-xs font-medium text-[rgba(235,235,245,0.75)]">
              {lang === 'ja' ? 'FOMO 公開Solanaアドレス（任意・残高照合用）' : 'Public FOMO Solana Address (optional, read-only)'}
            </label>
            <input
              id="fomo-sol-addr-input"
              type="text"
              value={fomoSolAddrInput}
              onChange={(e) => setFomoSolAddrInput(e.target.value)}
              placeholder={lang === 'ja' ? '秘密鍵は不要・公開アドレスのみ' : 'Public address only (never seed/key)'}
              className="w-full min-h-[44px] bg-black border border-[rgba(84,84,88,0.55)] rounded-xl px-3 text-xs font-mono-num text-white placeholder:text-[rgba(235,235,245,0.35)] focus:outline-none focus:border-[#0a84ff]"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={profileSaving || !profileDirty}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#0a84ff] hover:bg-[#1a8fff] text-white text-xs font-semibold disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
            >
              {profileSaving ? '...' : lang === 'ja' ? '保存' : 'Save'}
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="font-mono-num text-[rgba(235,235,245,0.45)] truncate max-w-full">
            {currentProfileLink}
          </span>
          {profileSaved && (
            <span className="inline-flex items-center gap-1 text-[#00d35a] font-medium">
              <Check className="w-3.5 h-3.5" />
              {lang === 'ja' ? 'プロフィールを保存しました' : 'Profile saved'}
            </span>
          )}
          {profileError && <span className="text-[#ff453a]">{profileError}</span>}
        </div>
      </section>

      {/* Top 2-column grid on desktop: PAPER/LIVE Mode + Emergency & Withdraw */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PAPER / LIVE Switcher (STEP 13) */}
        <section className="bg-[#1c1c1e] rounded-[20px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">{t.tradingMode}</h2>
            <span
              className={`text-xs font-mono-num font-bold ${
                state.mode === 'PAPER' ? 'text-[#ff9f0a]' : 'text-[#00d35a]'
              }`}
            >
              {state.mode}
            </span>
          </div>

          <p className="text-xs text-[rgba(235,235,245,0.65)] leading-relaxed">{t.paperHint}</p>

          <div
            className={`bg-black rounded-2xl p-3.5 border space-y-3 ${
              state.mode === 'LIVE' ? 'border-[rgba(0,211,90,0.45)]' : 'border-[rgba(255,69,58,0.35)]'
            }`}
          >
            <div
              className={`flex items-start gap-2 text-xs ${
                state.mode === 'LIVE' ? 'text-[#00d35a]' : 'text-[#ff9f0a]'
              }`}
            >
              {state.mode === 'LIVE' ? (
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>
                {state.mode === 'LIVE'
                  ? lang === 'ja'
                    ? 'LIVEモードが有効です。実データ（GeckoTerminal / DexScreener / RugCheck）と設定ルールに従って自動取引を実行します。'
                    : 'LIVE mode is active. Autonomous trading is running on live Solana feeds with all Risk caps enforced.'
                  : t.liveWarning}
              </span>
            </div>

            {state.mode === 'PAPER' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleModeAction('LIVE');
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  value={liveInput}
                  onChange={(e) => {
                    setLiveInput(e.target.value);
                    if (modeError) setModeError(null);
                  }}
                  placeholder={lang === 'ja' ? 'LIVE と入力して有効化' : t.typeLiveToUnlock}
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 min-h-[42px] bg-[#1c1c1e] border border-[rgba(84,84,88,0.55)] rounded-xl px-3 text-xs font-mono-num text-white placeholder:text-[rgba(235,235,245,0.4)] focus:outline-none focus:border-[#00d35a]"
                />
                <button
                  type="submit"
                  disabled={modeBusy}
                  className="min-h-[42px] px-4 rounded-xl bg-[#00d35a] hover:bg-[#19e06c] text-black text-xs font-bold whitespace-nowrap disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {modeBusy ? '...' : t.switchToLive}
                </button>
              </form>
            ) : (
              <button
                type="button"
                disabled={modeBusy}
                onClick={() => void handleModeAction('PAPER')}
                className="w-full min-h-[42px] rounded-xl bg-[#ff9f0a] hover:bg-[#ffb340] text-black text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer"
              >
                {modeBusy ? '...' : t.switchToPaper}
              </button>
            )}
          </div>

          {modeSuccess && (
            <div className="inline-flex items-center gap-1.5 text-xs text-[#00d35a] font-medium">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{modeSuccess}</span>
            </div>
          )}
          {modeError && <div className="text-xs text-[#ff453a]">{modeError}</div>}
        </section>

        {/* Emergency Controls + Withdraw S7 */}
        <section className="bg-[#1c1c1e] rounded-[20px] p-5 space-y-4">
          <h2 className="text-base font-bold text-white">{t.emergencyControls}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() =>
                void onUpdateSetting('new_buys_stopped', !state.settings.new_buys_stopped)
              }
              className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                state.settings.new_buys_stopped
                  ? 'bg-[#00d35a] text-black'
                  : 'bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white'
              }`}
            >
              {state.settings.new_buys_stopped ? t.resumeNewBuys : t.stopNewBuys}
            </button>
            <button
              type="button"
              onClick={() => void onFlatAll()}
              className="min-h-[44px] px-3 rounded-xl bg-[#ff453a] text-white text-xs font-semibold cursor-pointer"
            >
              {t.flatAll}
            </button>
            <button
              type="button"
              onClick={() => void onResetPaper()}
              className="min-h-[44px] px-3 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white text-xs font-semibold cursor-pointer"
            >
              {t.resetPaper}
            </button>
          </div>

          {/* S7 Withdraw Review (Never presses Confirm, stops at Review withdraw) */}
          <div className="pt-3 border-t border-[rgba(84,84,88,0.35)] space-y-2.5">
            <div className="text-xs font-semibold text-white">{t.withdrawTitle}</div>
            <p className="text-[11px] text-[rgba(235,235,245,0.55)]">{t.withdrawNote}</p>
            <form onSubmit={handlePrepareWithdraw} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="number"
                step="0.01"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="$ Amount"
                className="sm:col-span-4 min-h-[40px] bg-black border border-[rgba(84,84,88,0.55)] rounded-xl px-3 text-xs font-mono-num text-white"
              />
              <input
                type="text"
                value={withdrawAddr}
                onChange={(e) => setWithdrawAddr(e.target.value)}
                placeholder="Solana withdraw address"
                className="sm:col-span-5 min-h-[40px] bg-black border border-[rgba(84,84,88,0.55)] rounded-xl px-3 text-xs font-mono-num text-white"
              />
              <button
                type="submit"
                className="sm:col-span-3 min-h-[40px] px-3 rounded-xl bg-[#0a84ff] text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                Review
              </button>
            </form>
            {withdrawReady && (
              <div className="text-xs text-[#00d35a] bg-[#00d35a]/10 rounded-xl px-3 py-2">{withdrawReady}</div>
            )}
          </div>
        </section>
      </div>

      {/* STEP 12 Settings grouped by Bot (Sliders + Exact Number Fields + Min/Max validation) */}
      <section className="bg-[#1c1c1e] rounded-[20px] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-bold text-white">{t.settingsTitle}</h2>
          {settingSaved && (
            <span className="inline-flex items-center gap-1 text-xs font-mono-num text-[#00d35a]">
              <Check className="w-3.5 h-3.5" />
              {settingSaved}
            </span>
          )}
        </div>

        {/* Bot Group Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3 mb-4 border-b border-[rgba(84,84,88,0.35)]">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveGroup(g.id)}
              className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeGroup === g.id ? 'bg-[#2c2c2e] text-white' : 'text-[rgba(235,235,245,0.5)] hover:text-white'
              }`}
              style={activeGroup === g.id ? { color: g.color } : undefined}
            >
              {g.title}
            </button>
          ))}
        </div>

        {settingError && (
          <div className="mb-4 text-xs text-[#ff453a] bg-[#ff453a]/10 rounded-xl px-3 py-2">{settingError}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {groupRules.map((rule) => {
            const val = Number(state.settings[rule.key]);
            return (
              <div key={rule.key} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-white">
                      {lang === 'ja' ? rule.labelJa : rule.labelEn}
                    </div>
                    <div className="text-[11px] text-[rgba(235,235,245,0.45)]">
                      {lang === 'ja' ? rule.hintJa : rule.hintEn}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={rule.min}
                      max={rule.max}
                      step={rule.step}
                      value={val}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) void handleSettingChange(rule.key, n);
                      }}
                      className="w-20 min-h-[36px] bg-black border border-[rgba(84,84,88,0.55)] rounded-lg px-2 text-right text-xs font-mono-num text-white"
                    />
                    {rule.unit && (
                      <span className="text-xs font-mono-num text-[rgba(235,235,245,0.5)] w-6">{rule.unit}</span>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min={rule.min}
                  max={rule.max}
                  step={rule.step}
                  value={val}
                  onChange={(e) => void handleSettingChange(rule.key, Number(e.target.value))}
                  className="w-full accent-[#0a84ff] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono-num text-[rgba(235,235,245,0.35)]">
                  <span>
                    min {rule.min}
                    {rule.unit}
                  </span>
                  <span>
                    max {rule.max}
                    {rule.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Change Log (STEP 12: every change logged with who=me|desk) */}
      <section className="bg-[#1c1c1e] rounded-[20px] p-5">
        <h3 className="text-sm font-bold text-white mb-3">{t.changeLog}</h3>
        <div className="divide-y divide-[rgba(84,84,88,0.3)] text-xs font-mono-num">
          {state.changeLog.slice(0, 10).map((entry) => (
            <div key={entry.id} className="py-2 flex items-center justify-between gap-2">
              <div>
                <span className="text-white">{entry.key}</span>
                <span className="text-[rgba(235,235,245,0.45)] mx-2">
                  {String(entry.oldVal)} → <span className="text-[#00d35a]">{String(entry.newVal)}</span>
                </span>
              </div>
              <span className="text-[rgba(235,235,245,0.45)]">
                {entry.who} · {fmtClock(entry.ts)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
