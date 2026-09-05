import React from 'react';
import { Language, Theme } from '../types';
import { t } from '../lib/i18n';
import { Layers, CheckCircle, Database, Sparkles, LogOut, UserCheck, Gem } from 'lucide-react';
import { motion } from 'motion/react';
import logoImg from '../../icon.png';

interface HeaderProps {
  lang: Language;
  theme: Theme;
  onToggleTheme: () => void;
  onSwitchLang: (lang: Language) => void;
  currentUser: string | null;
  onLogout: () => void;
  onSecretAdmin: () => void;
  newStockCount: number;
  oldStockCount: number;
  pageStockCount?: number;
  completedTasksCount: number;
  completedNewCount?: number;
  completedOldCount?: number;
  completedPageCount?: number;
  submittedTasksCount: number;
  submittedNewCount?: number;
  submittedOldCount?: number;
  submittedPageCount?: number;
  submittedBotCount?: number;
  submittedPcCount?: number;
  completedBotCount?: number;
  completedPcCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  lang,
  theme,
  onToggleTheme,
  onSwitchLang,
  currentUser,
  onLogout,
  onSecretAdmin,
  newStockCount,
  oldStockCount,
  pageStockCount = 0,
  completedTasksCount,
  completedNewCount = 0,
  completedOldCount = 0,
  completedPageCount = 0,
  submittedTasksCount,
  submittedNewCount = 0,
  submittedOldCount = 0,
  submittedPageCount = 0,
  submittedBotCount = 0,
  submittedPcCount = 0,
  completedBotCount = 0,
  completedPcCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[#0a0812]/85 border-b border-amber-500/15 shadow-[0_4px_30px_rgba(0,0,0,0.35)] transition-colors">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 flex flex-col gap-2">
        {/* Top Title & Controls Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-2.5 min-w-0 select-none">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 via-rose-500/10 to-violet-500/20 border border-amber-400/35 p-0.5 shadow-[0_0_20px_rgba(251,191,36,0.2)] shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-amber-500/10">
              <img
                src={logoImg}
                alt="Painite Work"
                className="w-full h-full object-contain rounded-[0.85rem]"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold pw-title-gradient truncate tracking-[0.12em]">
                {t(lang, 'appTitle')}
              </h1>
              <p className="text-[10px] text-slate-400/90 font-medium truncate tracking-wide">
                {t(lang, 'subtitle')}
              </p>
            </div>
          </div>

          {/* Right Controls: Theme, Lang, Admin/Logout */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Language Switcher */}
            <div className="flex items-center bg-slate-900/80 p-0.5 rounded-xl border border-amber-500/15">
              <button
                onClick={() => onSwitchLang('bn')}
                className={`px-2 py-0.5 text-xs font-bold rounded-lg transition-all ${
                  lang === 'bn'
                    ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 shadow shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                BN
              </button>
              <button
                onClick={() => onSwitchLang('en')}
                className={`px-2 py-0.5 text-xs font-bold rounded-lg transition-all ${
                  lang === 'en'
                    ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 shadow shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EN
              </button>
            </div>

            {/* Current User Badge & Logout */}
            {currentUser && (
              <div className="flex items-center gap-1.5 ml-1">
                {currentUser === 'admin' ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <UserCheck className="w-3 h-3" />
                    Admin
                  </span>
                ) : null}
                <button
                  onClick={onLogout}
                  className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors flex items-center gap-1"
                  title={t(lang, 'logout')}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t(lang, 'logout')}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Admin live counters — 2-col on mobile (readable), 5-col on desktop */}
        {currentUser === 'admin' && (
          <div className="pt-1.5 border-t border-slate-800/60 space-y-1.5">
            <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
              <div className="flex flex-col items-center justify-center px-0.5 py-1 sm:px-1 sm:py-1.5 rounded-lg bg-slate-800/50 min-w-0 h-[52px] sm:h-[58px] border border-sky-500/30">
                <div className="text-[8px] sm:text-[9px] text-slate-400 font-medium truncate w-full text-center leading-none">{t(lang, 'newJobStock')}</div>
                <div className="font-bold text-sky-300 text-sm sm:text-base leading-tight">{newStockCount}</div>
              </div>
              <div className="flex flex-col items-center justify-center px-0.5 py-1 sm:px-1 sm:py-1.5 rounded-lg bg-slate-800/50 min-w-0 h-[52px] sm:h-[58px] border border-violet-500/30">
                <div className="text-[8px] sm:text-[9px] text-slate-400 font-medium truncate w-full text-center leading-none">{t(lang, 'oldJobStock')}</div>
                <div className="font-bold text-violet-300 text-sm sm:text-base leading-tight">{oldStockCount}</div>
              </div>
              <div className="flex flex-col items-center justify-center px-0.5 py-1 sm:px-1 sm:py-1.5 rounded-lg bg-slate-800/50 min-w-0 h-[52px] sm:h-[58px] border border-teal-500/30">
                <div className="text-[8px] sm:text-[9px] text-slate-400 font-medium truncate w-full text-center leading-none">{t(lang, 'pageCreateStock')}</div>
                <div className="font-bold text-teal-300 text-sm sm:text-base leading-tight">{pageStockCount}</div>
              </div>
              <div className="flex flex-col items-center justify-center px-0.5 py-1 sm:px-1 sm:py-1.5 rounded-lg bg-slate-800/50 min-w-0 h-[52px] sm:h-[58px] border border-emerald-500/30">
                <div className="text-[8px] sm:text-[9px] text-slate-400 font-medium truncate w-full text-center leading-none">{t(lang, 'totalSubmitted')}</div>
                <div className="font-bold text-emerald-300 text-sm sm:text-base leading-tight">{submittedTasksCount}</div>
              </div>
              <div className="flex flex-col items-center justify-center px-0.5 py-1 sm:px-1 sm:py-1.5 rounded-lg bg-slate-800/50 min-w-0 h-[52px] sm:h-[58px] border border-amber-500/30">
                <div className="text-[8px] sm:text-[9px] text-slate-400 font-medium truncate w-full text-center leading-none">{t(lang, 'totalCompleted')}</div>
                <div className="font-bold text-amber-300 text-sm sm:text-base leading-tight">{completedTasksCount}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-md bg-emerald-950/30 border border-emerald-500/20 px-1.5 py-1 text-center">
                <div className="text-[8px] text-emerald-400/80 font-semibold leading-none mb-0.5">{t(lang, 'totalSubmitted')}</div>
                <div className="text-[9px] sm:text-[10px] text-emerald-100 font-bold leading-tight tracking-tight">
                  New={submittedNewCount} · Old={submittedOldCount} · Page={submittedPageCount} · Bot={submittedBotCount} · PC={submittedPcCount}
                </div>
              </div>
              <div className="rounded-md bg-amber-950/30 border border-amber-500/20 px-1.5 py-1 text-center">
                <div className="text-[8px] text-amber-400/80 font-semibold leading-none mb-0.5">{t(lang, 'totalCompleted')}</div>
                <div className="text-[9px] sm:text-[10px] text-amber-100 font-bold leading-tight tracking-tight">
                  New={completedNewCount} · Old={completedOldCount} · Page={completedPageCount} · Bot={completedBotCount} · PC={completedPcCount}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
