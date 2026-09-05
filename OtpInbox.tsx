import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import { resolveInboxUrl } from '../lib/firebase';
import { Language } from '../types';
import { t } from '../lib/i18n';

type TaskLike =
  | { inbox?: string; phone?: string; rawLine?: string; [k: string]: any }
  | string
  | undefined;

function isElectronApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Electron/i.test(navigator.userAgent || '')) return true;
  try {
    // @ts-expect-error electron
    if (typeof process !== 'undefined' && process?.versions?.electron) return true;
  } catch { /* ignore */ }
  return false;
}

/** 555api.com/TOKEN → https://555api.com/TOKEN */
function normalizeInboxUrl(raw: string): string {
  let u = (raw || '').trim();
  if (!u || u === '#' || u === '-') return '#';
  if ((u.startsWith('"') && u.endsWith('"')) || (u.startsWith("'") && u.endsWith("'"))) {
    u = u.slice(1, -1).trim();
  }
  // extract url if embedded in longer text
  const m = u.match(/https?:\/\/[^\s\t<>"']+/i);
  if (m) return m[0];
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (/^[\w.-]+\.[a-z]{2,}\/\S+/i.test(u)) return 'https://' + u;
  if (/^www\./i.test(u)) return 'https://' + u;
  return '#';
}

/**
 * Inbox Viewer — real mini-browser (iframe / Electron webview).
 * Must run JavaScript + cookies so 555api / Cloudflare challenge can finish
 * and the real SMS text appears (same as Chrome).
 * No static HTTP fetch (that only gets "Just a moment..." challenge HTML).
 */
export function OtpInbox({
  task,
  inbox,
  lang,
  showToast,
}: {
  task?: TaskLike;
  inbox?: string;
  lang: Language;
  showToast: (text: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [key, setKey] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const url = useMemo(() => {
    let resolved = '#';
    if (task && typeof task === 'object') resolved = resolveInboxUrl(task);
    else if (typeof inbox === 'string') resolved = resolveInboxUrl(inbox);
    else if (typeof task === 'string') resolved = resolveInboxUrl(task);

    const norm = normalizeInboxUrl(resolved);
    if (norm !== '#') return norm;
    if (typeof inbox === 'string') return normalizeInboxUrl(inbox);
    return '#';
  }, [task, inbox]);

  const hasUrl = !!(url && url !== '#' && /^https?:\/\//i.test(url));
  const electron = isElectronApp();

  // Electron: real <webview> (full Chromium guest — JS + cookies)
  useEffect(() => {
    if (!electron || !hostRef.current) return;
    const host = hostRef.current;
    host.innerHTML = '';
    if (!hasUrl) return;

    const wv = document.createElement('webview') as HTMLElement & {
      src: string;
      reload?: () => void;
    };
    wv.setAttribute('id', 'otp-inbox-webview');
    wv.setAttribute('src', url);
    wv.setAttribute('allowpopups', 'true');
    wv.setAttribute(
      'webpreferences',
      'contextIsolation=no, javascript=yes, webSecurity=no, allowRunningInsecureContent=yes'
    );
    try {
      wv.setAttribute('partition', 'persist:otp-inbox');
    } catch { /* ignore */ }
    wv.style.width = '100%';
    wv.style.height = '220px';
    wv.style.border = '0';
    wv.style.background = '#000000';
    wv.style.display = 'block';
    host.appendChild(wv);

    return () => {
      host.innerHTML = '';
    };
  }, [electron, hasUrl, url, key]);

  const handleRefresh = () => {
    if (!hasUrl) {
      showToast(t(lang, 'inboxLinkMissing'), 'error');
      return;
    }
    if (electron) {
      const wv = document.getElementById('otp-inbox-webview') as
        | (HTMLElement & { reload?: () => void })
        | null;
      try {
        if (wv && typeof wv.reload === 'function') {
          wv.reload();
          showToast(t(lang, 'inboxRefreshed'), 'success');
          return;
        }
      } catch { /* remount */ }
    }
    setKey((k) => k + 1);
    showToast(t(lang, 'inboxRefreshed'), 'success');
  };

  return (
    <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-2">
      <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between p-2 px-3 bg-slate-900 border-b border-slate-800">
          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            {t(lang, 'inboxViewer')}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-2 py-0.5 text-[11px] font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            {t(lang, 'refreshInbox')}
          </button>
        </div>

        {!hasUrl ? (
          <div className="w-full h-52 flex items-center justify-center bg-black px-3 text-center">
            <p className="text-xs text-rose-300 font-semibold">{t(lang, 'inboxLinkMissing')}</p>
          </div>
        ) : electron ? (
          <div ref={hostRef} className="w-full bg-black" style={{ height: 220 }} />
        ) : (
          /* Real browser frame — JS runs, Cloudflare can complete, real SMS shows */
          <iframe
            key={key}
            src={url}
            title="Inbox Viewer"
            className="w-full h-52 border-0 bg-black"
            // no sandbox — must allow JS + cookies like a normal browser tab
            referrerPolicy="no-referrer-when-downgrade"
            allow="fullscreen"
          />
        )}
      </div>
    </div>
  );
}
