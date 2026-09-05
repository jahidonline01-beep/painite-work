import React, { useState, useEffect } from 'react';
import { Language, UserAccount, SheetTask, SubmittedTask, ReportedTask, RevokedTask, WithdrawRequest, SystemSettings } from '../types';
import { t } from '../lib/i18n';
import { db, fixUrlFormat, copyToClipboard, sanitizeTaskData, isHeaderTask, isValidUrl, isDateVal, isGenderVal, isPhoneVal , wp} from '../lib/firebase'
import { ref, onValue, set, get, update, remove, push } from 'firebase/database';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, Power, Copy, Trash2, RotateCcw, Plus, Minus, Send, Users,
  Layers, Database, ArrowLeft, Eye, EyeOff, CheckCircle2, DollarSign, ExternalLink,
  Upload, FileSpreadsheet, FileText, KeyRound, Bot, Monitor, Pencil
} from 'lucide-react';
import { SerialCopyModal } from './SerialCopyModal';

// Format Helpers for Google Sheets TSV Export (Sanitized against line breaks)
const cleanCell = (val: any) => String(val || '').replace(/[\r\n\t]+/g, ' ').trim();

export const formatSubmittedRow = (t: SubmittedTask) => {
  const jt = String(t.jobType || '');
  const isNew = jt !== 'Page Create' && jt !== 'Old Job' && (jt === 'New Job' || jt === 'new' || (!t.jobType && (Boolean(t.fuln) || Boolean(t.listing) || Boolean(t.checker))));
  if (isNew) {
    const fn = cleanCell(t.fn);
    const ln = cleanCell(t.ln);
    const fuln = cleanCell(t.fuln || `${fn} ${ln}`.trim());
    const gen = cleanCell(t.gen);
    const st = cleanCell(t.st);
    const dob = cleanCell(t.dob);
    const checker = cleanCell(t.checker);
    const listing = cleanCell(t.listing);
    const uid = cleanCell(t.uid);
    const pass = cleanCell(t.pass);
    const key2fa = cleanCell(t.key2fa);
    const phone = cleanCell(t.phone);
    const inbox = cleanCell(t.inbox);
    const mail = cleanCell(t.mail);
    const mailLink = cleanCell(t.mailLink);
    const userName = cleanCell(t.userName);
    const userUid = cleanCell(t.userUid);

    return `${fn}\t${ln}\t${fuln}\t${gen}\t${st}\t${dob}\t${checker}\t${listing}\t${uid}\t${pass}\t${key2fa}\t${phone}\t${inbox}\t${mail}\t${mailLink}\t${userName}\t${userUid}`;
  } else {
    const uid = cleanCell(t.uid);
    const pass = cleanCell(t.pass);
    const key2fa = cleanCell(t.key2fa);
    const phone = cleanCell(t.phone);
    const inbox = cleanCell(t.inbox);
    const mail = cleanCell(t.mail);
    const mailLink = cleanCell(t.mailLink);
    const userName = cleanCell(t.userName);
    const userUid = cleanCell(t.userUid);

    return `${uid}\t${pass}\t${key2fa}\t${phone}\t${inbox}\t${mail}\t${mailLink}\t${userName}\t${userUid}`;
  }
};

export const formatReportedRow = (t: ReportedTask) => {
  const jt = String(t.jobType || '');
  const isNew = jt !== 'Page Create' && jt !== 'Old Job' && (jt === 'New Job' || jt === 'new' || (!t.jobType && (Boolean(t.fuln) || Boolean(t.listing) || Boolean(t.checker))));
  const reason = cleanCell((t as any).reportReason || '');
  if (isNew) {
    const fn = cleanCell(t.fn);
    const ln = cleanCell(t.ln);
    const fuln = cleanCell(t.fuln || `${fn} ${ln}`.trim());
    const gen = cleanCell(t.gen);
    const st = cleanCell(t.st);
    const dob = cleanCell(t.dob);
    const checker = cleanCell(t.checker);
    const listing = cleanCell(t.listing);
    const phone = cleanCell(t.phone);
    const inbox = cleanCell(t.inbox);
    const userName = cleanCell(t.userName);
    const userUid = cleanCell(t.userUid);

    return `${fn}\t${ln}\t${fuln}\t${gen}\t${st}\t${dob}\t${checker}\t${listing}\t${phone}\t${inbox}\t${userName}\t${userUid}\t${reason}`;
  } else {
    const phone = cleanCell(t.phone);
    const inbox = cleanCell(t.inbox);
    const userName = cleanCell(t.userName);
    const userUid = cleanCell(t.userUid);

    return `${phone}\t${inbox}\t${userName}\t${userUid}\t${reason}`;
  }
};

export const formatRevokedRow = (r: RevokedTask) => {
  const d = r.fullDetails || ({} as SheetTask);
  const jt = String(r.jobType || '');
  const isNew = jt !== 'Page Create' && jt !== 'Old Job' && (jt === 'New Job' || jt === 'new' || (!r.jobType && (Boolean(d.fuln) || Boolean(d.listing) || Boolean(d.checker))));
  const phone = cleanCell(r.phone || d.phone || '');
  const inbox = cleanCell(r.inbox || d.inbox || '');

  if (isNew) {
    const fn = cleanCell(d.fn);
    const ln = cleanCell(d.ln);
    const fuln = cleanCell(d.fuln || `${fn} ${ln}`.trim());
    const gen = cleanCell(d.gen);
    const st = cleanCell(d.st);
    const dob = cleanCell(d.dob);
    const checker = cleanCell(d.checker);
    const listing = cleanCell(d.listing);
    const userName = cleanCell(r.userName);
    const userUid = cleanCell(r.userUid);

    return `${fn}\t${ln}\t${fuln}\t${gen}\t${st}\t${dob}\t${checker}\t${listing}\t${phone}\t${inbox}\t${userName}\t${userUid}`;
  } else {
    const userName = cleanCell(r.userName);
    const userUid = cleanCell(r.userUid);

    return `${phone}\t${inbox}\t${userName}\t${userUid}`;
  }
};

// Top-Level Helper Inspectors and CSV Parsers (Avoid Hoisting / Re-render Issues)
const isUrlVal = (val: string) => isValidUrl(val);

const cleanVal = (val?: string) => {
  if (!val) return '';
  let v = String(val).trim();
  // Strip surrounding quotes (single or double) and unescape doubled quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.replace(/""/g, '"').replace(/[\r\n\t]+/g, ' ').trim();
};

/**
 * Robust full-text TSV/CSV parser that correctly handles:
 * - Tab or comma delimiters
 * - Quoted fields containing newlines, tabs, commas
 * - Doubled quotes ("") as escape
 * - Trailing empty columns from Google Sheets
 * Returns array of rows, each row is string[] of cleaned cells.
 */
const parseTsvOrCsvText = (text: string): string[][] => {
  if (!text || !text.trim()) return [];

  // Detect dominant delimiter from first non-empty line (prefer tab for Google Sheets)
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(cleanVal(current));
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of row (handle \r\n)
      if (char === '\r' && next === '\n') i++;
      currentRow.push(cleanVal(current));
      current = '';
      // Only keep non-empty rows (ignore pure blank lines)
      if (currentRow.some((c) => c.length > 0)) {
        // Trim trailing empty columns that Google Sheets often adds
        while (currentRow.length > 0 && currentRow[currentRow.length - 1] === '') {
          currentRow.pop();
        }
        if (currentRow.length > 0) rows.push(currentRow);
      }
      currentRow = [];
    } else {
      // Inside a field – keep content (including newlines when quoted)
      if (char === '\n' || char === '\r') {
        current += ' '; // normalize internal newlines to space
      } else {
        current += char;
      }
    }
  }

  // Last field / last row
  currentRow.push(cleanVal(current));
  if (currentRow.some((c) => c.length > 0)) {
    while (currentRow.length > 0 && currentRow[currentRow.length - 1] === '') {
      currentRow.pop();
    }
    if (currentRow.length > 0) rows.push(currentRow);
  }

  return rows;
};

/** Legacy single-line helper kept for any remaining call sites */
const parseCsvLine = (line: string): string[] => {
  const rows = parseTsvOrCsvText(line);
  return rows[0] || [];
};

const isHeaderRow = (cols: string[]): boolean => {
  if (!cols || cols.length === 0) return true;
  const rawJoined = cols.join(' ').toLowerCase();

  // If the row contains a phone number with 6+ digits OR a URL, it is 100% a DATA ROW, NEVER a header!
  if (/\d{6,}/.test(rawJoined) || /https?:\/\//i.test(rawJoined) || /www\./i.test(rawJoined)) {
    return false;
  }

  const cleanWords = cols.map((c) => cleanVal(c).toLowerCase().replace(/[^a-z0-9]/g, ''));

  const headerKeywords = [
    'fn', 'firstname', 'first', 'ln', 'lastname', 'last',
    'fuln', 'fullname', 'full', 'gen', 'gender', 'sex', 'st', 'state',
    'dob', 'dateofbirth', 'birthday', 'checker', 'checkername',
    'listing', 'numberoflisting', 'phone', 'phonenumber', 'phoneno',
    'mobile', 'mobilenumber', 'inbox', 'inboxlink', 'maillink',
    'sl', 'slno', 'serial', 'serialno', 'no', 'name', 'address',
    'email', 'link', 'url', 'profile', 'account'
  ];

  let matchCount = 0;
  for (const w of cleanWords) {
    if (!w) continue;
    if (headerKeywords.includes(w) || headerKeywords.some((k) => w.includes(k) && w.length < 20)) {
      matchCount++;
    }
  }

  // If 2 or more cells match header keywords and no 6+ digit phone/URL exists → header
  if (matchCount >= 2) return true;

  // Single cell header check
  const firstWord = cleanWords[0] || '';
  if (['fn', 'firstname', 'sl', 'slno', 'serial', 'phone', 'phonenumber', 'name'].includes(firstWord)) {
    return true;
  }

  // Phrase-level check on joined text
  const headerPhrases = [
    'first name', 'last name', 'full name', 'date of birth', 'phone number',
    'inbox link', 'checker name', 'serial no', 'sl no'
  ];
  const phraseHits = headerPhrases.filter((p) => rawJoined.includes(p)).length;
  if (phraseHits >= 2) return true;

  return false;
};

const parseNewJobCols = (cols: string[]) => {
  if (!cols || cols.length === 0) return null;

  // 1. Check if it's a header row
  if (isHeaderRow(cols)) {
    return null;
  }

  let cleanCols = cols.map((c) => cleanVal(c));

  // Trim trailing empty cells (Google Sheets often adds extra tabs)
  while (cleanCols.length > 0 && cleanCols[cleanCols.length - 1] === '') {
    cleanCols.pop();
  }

  // If entire row is blank, return null
  if (cleanCols.every((c) => !c)) return null;

  // 2. Detect & strip Serial Number column at index 0
  //    Trigger when: first cell is pure serial-like AND total columns look like 10+data or phone/url sit one position later
  if (cleanCols.length >= 10) {
    const col0 = cleanCols[0];
    const col0IsSerial =
      /^\d{1,5}$/.test(col0) ||
      /^#?\d{1,5}$/.test(col0) ||
      /^sl\.?\s*\d*$/i.test(col0) ||
      /^serial/i.test(col0);

    // After potential strip, expected phone ≈ index 8, inbox ≈ index 9
    const phoneCandidate = cleanCols[cleanCols.length >= 11 ? 9 : 8] || '';
    const inboxCandidate = cleanCols[cleanCols.length >= 11 ? 10 : 9] || '';
    const looksLikeDataAfterStrip =
      /\d{6,}/.test(phoneCandidate) ||
      isValidUrl(inboxCandidate) ||
      isValidUrl(phoneCandidate);

    if (col0IsSerial && (cleanCols.length >= 11 || looksLikeDataAfterStrip)) {
      cleanCols = cleanCols.slice(1);
    }
  }

  // Final trim after possible slice
  while (cleanCols.length > 0 && cleanCols[cleanCols.length - 1] === '') {
    cleanCols.pop();
  }

  let inbox = '';
  let phone = '';
  let dob = '';
  let gen = '';
  let st = '';
  let listing = '';
  let checker = '';
  let fn = '';
  let ln = '';
  let fuln = '';

  // 3. Direct 10-column mapping (FN LN FullN Gen St DOB Checker Listing Phone Inbox)
  if (cleanCols.length >= 10) {
    fn = cleanCols[0] || '';
    ln = cleanCols[1] || '';
    fuln = cleanCols[2] || '';
    gen = cleanCols[3] || '';
    st = cleanCols[4] || '';
    dob = cleanCols[5] || '';
    checker = cleanCols[6] || '';
    listing = cleanCols[7] || '';
    phone = cleanCols[8] || '';
    inbox = fixUrlFormat(cleanCols[9] || '#');
  } else if (cleanCols.length === 9) {
    fn = cleanCols[0] || '';
    ln = cleanCols[1] || '';
    if (isGenderVal(cleanCols[2])) {
      fuln = `${fn} ${ln}`.trim();
      gen = cleanCols[2] || '';
      st = cleanCols[3] || '';
      dob = cleanCols[4] || '';
      checker = cleanCols[5] || '';
      listing = cleanCols[6] || '';
      phone = cleanCols[7] || '';
      inbox = fixUrlFormat(cleanCols[8] || '#');
    } else {
      fuln = cleanCols[2] || `${fn} ${ln}`.trim();
      gen = cleanCols[3] || '';
      st = cleanCols[4] || '';
      dob = cleanCols[5] || '';
      checker = cleanCols[6] || '';
      listing = '';
      phone = cleanCols[7] || '';
      inbox = fixUrlFormat(cleanCols[8] || '#');
    }
  } else if (cleanCols.length === 8) {
    fn = cleanCols[0] || '';
    ln = cleanCols[1] || '';
    fuln = `${fn} ${ln}`.trim();
    gen = cleanCols[2] || '';
    st = cleanCols[3] || '';
    dob = cleanCols[4] || '';
    checker = cleanCols[5] || '';
    phone = cleanCols[6] || '';
    inbox = fixUrlFormat(cleanCols[7] || '#');
  } else {
    fn = cleanCols[0] || '';
    ln = cleanCols[1] || '';
    fuln = cleanCols[2] || `${fn} ${ln}`.trim();
    if (cleanCols.length > 3) phone = cleanCols[cleanCols.length - 2] || '';
    if (cleanCols.length > 4) inbox = fixUrlFormat(cleanCols[cleanCols.length - 1] || '#');
  }

  // Swap phone and inbox ONLY if phone is literally a URL
  if (isValidUrl(phone) && !isValidUrl(inbox)) {
    const tmp = phone;
    phone = inbox;
    inbox = tmp;
  }

  // Ensure full name is never empty if fn/ln exist
  if (!fuln.trim() && (fn || ln)) {
    fuln = `${fn} ${ln}`.trim();
  }
  if ((!fn.trim() || !ln.trim()) && fuln.trim()) {
    const parts = fuln.trim().split(/\s+/);
    if (!fn.trim()) fn = parts[0] || '';
    if (!ln.trim()) ln = parts.slice(1).join(' ') || fn;
  }

  const fixedInbox = fixUrlFormat(inbox);
  const formatted10Col = `${fn}\t${ln}\t${fuln}\t${gen}\t${st}\t${dob}\t${checker}\t${listing}\t${phone}\t${fixedInbox}`;

  const parsedObj = sanitizeTaskData({
    fn,
    ln,
    fuln,
    gen,
    st,
    dob,
    checker,
    listing,
    phone,
    inbox: fixedInbox,
    rawLine: formatted10Col,
  });

  if (isHeaderTask(parsedObj)) {
    return null;
  }

  return parsedObj;
};

const parseOldJobCols = (cols: string[]) => {
  if (!cols || cols.length === 0) return null;
  if (isHeaderRow(cols)) return null;

  let cleanCols = cols.map((c) => cleanVal(c));
  while (cleanCols.length > 0 && cleanCols[cleanCols.length - 1] === '') {
    cleanCols.pop();
  }
  if (cleanCols.every((c) => !c)) return null;

  let phone = '';
  let inbox = '';

  // Serial + phone + inbox
  if (cleanCols.length >= 3 && /^\d{1,5}$/.test(cleanCols[0])) {
    phone = cleanCols[1];
    inbox = cleanCols[2];
  } else {
    const urlCol = cleanCols.find((c) => isValidUrl(c));
    const phoneCol = cleanCols.find((c) => /\d{6,}/.test(c) && c !== urlCol);

    if (urlCol) inbox = urlCol;
    if (phoneCol) phone = phoneCol;

    if (!phone && cleanCols[0]) phone = cleanCols[0];
    if (!inbox && cleanCols[1]) inbox = cleanCols[1];
  }

  const fixedInbox = fixUrlFormat(inbox);
  if (!phone || !/\d{6,}/.test(phone)) return null;

  return {
    phone,
    inbox: fixedInbox,
    rawLine: `${phone}\t${fixedInbox}`,
  };
};

interface AdminPanelProps {
  lang: Language;
  onGoBack: () => void;
  showToast: (text: string, type: 'success' | 'error' | 'info') => void;
  settings: SystemSettings;
}


const MemberEditRow: React.FC<{
  phoneKey: string;
  u: UserAccount;
  lang: Language;
  visible: boolean;
  underCount: number;
  underNames: string;
  onTogglePass: () => void;
  onSave: (oldPhone: string, nameVal: string, phoneVal: string, passVal: string) => void;
}> = ({ phoneKey, u, lang, visible, underCount, underNames, onTogglePass, onSave }) => {
  const [nameVal, setNameVal] = React.useState(u.name || '');
  const [phoneVal, setPhoneVal] = React.useState(phoneKey);
  const [passVal, setPassVal] = React.useState('');
  const currentPass = String((u as any).pass_v3 || u.pass || '');
  return (
    <form
      className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 space-y-2"
      onSubmit={(e) => { e.preventDefault(); onSave(phoneKey, nameVal, phoneVal, passVal); setPassVal(''); }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-[10px] text-sky-300">{u.uid}</div>
        <button
          type="button"
          title={u.starred ? t(lang, 'starOff') : t(lang, 'starOn')}
          onClick={() => update(ref(db, `users/${phoneKey}`), { starred: !u.starred })}
          className={`h-7 w-7 rounded-lg text-base leading-none ${u.starred ? 'text-amber-400' : 'text-slate-600'}`}
        >★</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 relative z-10">
        <input value={nameVal} maxLength={11} onChange={(e) => setNameVal(e.target.value.replace(/[^A-Za-z0-9 .'-]/g, '').slice(0, 11))} className="h-8 px-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-[11px]" placeholder="Name" />
        <input value={phoneVal} onChange={(e) => setPhoneVal(e.target.value.replace(/\D/g, '').slice(0, 11))} className="h-8 px-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-[11px] font-mono" placeholder="Phone" />
        <div className="flex items-center gap-1">
          <input type={visible ? 'text' : 'password'} readOnly value={currentPass === '!' ? '' : currentPass} className="h-8 flex-1 px-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-[11px] font-mono" />
          <button type="button" onClick={onTogglePass} className="h-8 w-8 rounded-lg bg-slate-800 text-slate-300">{visible ? <EyeOff className="w-3.5 h-3.5 mx-auto" /> : <Eye className="w-3.5 h-3.5 mx-auto" />}</button>
        </div>
        <input type="text" value={passVal} onChange={(e) => setPassVal(e.target.value)} className="h-8 px-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-[11px]" placeholder={t(lang, 'newPass')} />
      </div>
      <button type="submit" className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">{t(lang, 'saveMember')}</button>
    </form>
  );
};

export const AdminPanel: React.FC<AdminPanelProps> = ({
  lang,
  onGoBack,
  showToast,
  settings,
}) => {
  // System State
  const [users, setUsers] = useState<Record<string, UserAccount>>({});
  const [activeNewTasks, setActiveNewTasks] = useState<Record<string, SheetTask>>({});
  const [activeOldTasks, setActiveOldTasks] = useState<Record<string, SheetTask>>({});
  const [activePageTasks, setActivePageTasks] = useState<Record<string, SheetTask>>({});
  const [submittedTasks, setSubmittedTasks] = useState<Record<string, SubmittedTask>>({});
  const [reportedTasks, setReportedTasks] = useState<Record<string, ReportedTask>>({});
  const [reportedClearAt, setReportedClearAt] = useState<Record<string, number>>({});
  const [revokedTasks, setRevokedTasks] = useState<Record<string, RevokedTask>>({});
  const [stockNewTasks, setStockNewTasks] = useState<Record<string, SheetTask>>({});
  const [stockOldTasks, setStockOldTasks] = useState<Record<string, SheetTask>>({});
  const [stockPageTasks, setStockPageTasks] = useState<Record<string, SheetTask>>({});
  const [withdrawRequests, setWithdrawRequests] = useState<Record<string, WithdrawRequest>>({});


  // Input States
  const [bulkNewInput, setBulkNewInput] = useState('');
  const [bulkOldInput, setBulkOldInput] = useState('');
  const [bulkPageInput, setBulkPageInput] = useState('');
  const [replaceNewStock, setReplaceNewStock] = useState(false);
  const [replaceOldStock, setReplaceOldStock] = useState(false);
  const [replacePageStock, setReplacePageStock] = useState(false);
  const [showStockNewList, setShowStockNewList] = useState(false);
  const [showStockOldList, setShowStockOldList] = useState(false);
  const [showStockPageList, setShowStockPageList] = useState(false);

  // Live memoized stats for pasted bulk input (uses robust multi-line TSV/CSV parser)
  const liveNewStats = React.useMemo(() => {
    if (!bulkNewInput || !bulkNewInput.trim()) return { totalLines: 0, validCount: 0, headerCount: 0, validTasks: [] };
    const rows = parseTsvOrCsvText(bulkNewInput);
    const validTasks: any[] = [];
    let headerCount = 0;

    rows.forEach((cols) => {
      const parsed = parseNewJobCols(cols);
      if (parsed && !isHeaderTask(parsed)) {
        validTasks.push(parsed);
      } else {
        headerCount++;
      }
    });

    return { totalLines: rows.length, validCount: validTasks.length, headerCount, validTasks };
  }, [bulkNewInput]);

  const liveOldStats = React.useMemo(() => {
    if (!bulkOldInput || !bulkOldInput.trim()) return { totalLines: 0, validCount: 0, headerCount: 0, validTasks: [] };
    const rows = parseTsvOrCsvText(bulkOldInput);
    const validTasks: any[] = [];
    let headerCount = 0;

    rows.forEach((cols) => {
      const parsed = parseOldJobCols(cols);
      if (parsed && !isHeaderTask(parsed)) {
        validTasks.push(parsed);
      } else {
        headerCount++;
      }
    });

    return { totalLines: rows.length, validCount: validTasks.length, headerCount, validTasks };
  }, [bulkOldInput]);

  const livePageStats = React.useMemo(() => {
    if (!bulkPageInput || !bulkPageInput.trim()) return { totalLines: 0, validCount: 0, headerCount: 0, validTasks: [] };
    const rows = parseTsvOrCsvText(bulkPageInput);
    const validTasks: any[] = [];
    let headerCount = 0;
    rows.forEach((cols) => {
      const parsed = parseOldJobCols(cols); // same format as old: phone + inbox
      if (parsed && !isHeaderTask(parsed)) {
        validTasks.push(parsed);
      } else {
        headerCount++;
      }
    });
    return { totalLines: rows.length, validCount: validTasks.length, headerCount, validTasks };
  }, [bulkPageInput]);

  // Serial Copy Modal State
  const [serialModalOpen, setSerialModalOpen] = useState(false);
  const [serialModalTitle, setSerialModalTitle] = useState('');
  const [serialModalLines, setSerialModalLines] = useState<string[]>([]);

  const triggerSerialCopy = (title: string, lines: string[]) => {
    if (lines.length === 0) {
      showToast('কপি করার মতো কোনো ডাটা পাওয়া যায়নি!', 'error');
      return;
    }
    setSerialModalTitle(title);
    setSerialModalLines(lines);
    setSerialModalOpen(true);
  };

  // Electron maximize / resize: force list reflow so scroll areas are not blank
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setLayoutTick((n) => n + 1), 50);
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('pw-layout-refresh', refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('pw-layout-refresh', refresh);
      if (t) clearTimeout(t);
    };
  }, []);

  // Balance & Report Sender States
  const [balTargetUid, setBalTargetUid] = useState('');
  const [balAmount, setBalAmount] = useState<number>(50);

  // Bulk good / suspend report
  const [bulkGoodText, setBulkGoodText] = useState('');
  const [bulkGoodRate, setBulkGoodRate] = useState<number>(9.5);
  const [bulkGoodJob, setBulkGoodJob] = useState<'new' | 'old' | 'page'>('new');
  const [bulkSuspendText, setBulkSuspendText] = useState('');
  // Progress + confirm modal for bulk reports
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkModalMode, setBulkModalMode] = useState<'good' | 'suspend'>('good');
  const [bulkModalPhase, setBulkModalPhase] = useState<'scanning' | 'confirm' | 'sending' | 'done'>('scanning');
  const [bulkModalCurrent, setBulkModalCurrent] = useState(0);
  const [bulkModalTotal, setBulkModalTotal] = useState(0);
  const [bulkModalStatus, setBulkModalStatus] = useState('');
  const [bulkPreviewRows, setBulkPreviewRows] = useState<
    { phoneKey: string; name: string; memberUid: string; pcs: number; amount: number; reportText: string }[]
  >([]);
  const [bulkSending, setBulkSending] = useState(false);

  // Section Hide Toggles
  const [hideRevokedSec, setHideRevokedSec] = useState(false);
  const [hideNewRepSec, setHideNewRepSec] = useState(false);
  const [hideNewSubSec, setHideNewSubSec] = useState(false);
  const [hideOldRepSec, setHideOldRepSec] = useState(false);
  const [hideOldSubSec, setHideOldSubSec] = useState(false);
  const [hidePageRepSec, setHidePageRepSec] = useState(false);
  const [hidePageSubSec, setHidePageSubSec] = useState(false);
  const [hideUserListSec, setHideUserListSec] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);

  // Admin Password Management & Global Message State
  const [adminPassInput, setAdminPassInput] = useState('');
  const [currentAdminPass, setCurrentAdminPass] = useState('@@##');
  const [showPassModal, setShowPassModal] = useState(false);
  const [showPermitModal, setShowPermitModal] = useState(false);
  const [permitCodes, setPermitCodes] = useState<Record<string, any>>({});
  const [showAdminChrome, setShowAdminChrome] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showIdHub, setShowIdHub] = useState(false);
  const [showMembersEdit, setShowMembersEdit] = useState(false);
  const [memberPassVisible, setMemberPassVisible] = useState<Record<string, boolean>>({});
  const [botIdTasks, setBotIdTasks] = useState<Record<string, any>>({});
  const [pcIdTasks, setPcIdTasks] = useState<Record<string, any>>({});
  const [idHubRate, setIdHubRate] = useState<number>(0);
  const [idHubPaying, setIdHubPaying] = useState<string | null>(null);
  const [idHubBulkText, setIdHubBulkText] = useState('');
  const [idHubBulkKind, setIdHubBulkKind] = useState<'bot' | 'pc'>('bot');
  const [idHubBulkRate, setIdHubBulkRate] = useState<number>(0);
  const [idHubBadText, setIdHubBadText] = useState('');
  const [bulkFromIdHub, setBulkFromIdHub] = useState(false);
  const [idHubPmUid, setIdHubPmUid] = useState('');
  const [idHubPmText, setIdHubPmText] = useState('');

  const [globalMessage, setGlobalMessage] = useState('');

  // Sync real-time Firebase nodes
  useEffect(() => {
    const sanitizeDict = (obj: Record<string, any>) => {
      const res: Record<string, any> = {};
      Object.keys(obj).forEach(k => {
        res[k] = sanitizeTaskData(obj[k]);
      });
      return res;
    };

    const sanitizeStockDict = (obj: Record<string, any>, nodeName: string) => {
      const res: Record<string, any> = {};
      Object.keys(obj).forEach((k) => {
        const sanitized = sanitizeTaskData(obj[k]);
        if (isHeaderTask(sanitized)) {
          remove(ref(db, `${nodeName}/${k}`));
        } else {
          res[k] = sanitized;
        }
      });
      return res;
    };

    const unsubUsers = onValue(ref(db, 'users'), (snap) => setUsers(snap.exists() ? snap.val() : {}));
    const unsubPermits = onValue(ref(db, wp('memberPermits')), (snap) => setPermitCodes(snap.exists() ? snap.val() : {}));
    const unsubNewActive = onValue(ref(db, wp('activeUserTasks')), (snap) => setActiveNewTasks(snap.exists() ? sanitizeDict(snap.val()) : {}));
    const unsubOldActive = onValue(ref(db, wp('activeOldUserTasks')), (snap) => setActiveOldTasks(snap.exists() ? sanitizeDict(snap.val()) : {}));
    const unsubPageActive = onValue(ref(db, wp('activePageCreateUserTasks')), (snap) => setActivePageTasks(snap.exists() ? sanitizeDict(snap.val()) : {}));
    const unsubSub = onValue(ref(db, wp('submittedTasks')), (snap) => setSubmittedTasks(snap.exists() ? sanitizeDict(snap.val()) : {}));
    const unsubRep = onValue(ref(db, wp('reportedTasks')), (snap) => setReportedTasks(snap.exists() ? sanitizeDict(snap.val()) : {}));
    const unsubRepClear = onValue(ref(db, wp('reportedClearAt')), (snap) => setReportedClearAt(snap.exists() ? snap.val() : {}));
    const unsubRev = onValue(ref(db, wp('revokedTasks')), (snap) => setRevokedTasks(snap.exists() ? sanitizeDict(snap.val()) : {}));
    const unsubNewStock = onValue(ref(db, wp('sheetTasks')), (snap) => setStockNewTasks(snap.exists() ? sanitizeStockDict(snap.val(), wp('sheetTasks')) : {}));
    const unsubOldStock = onValue(ref(db, wp('oldSheetTasks')), (snap) => setStockOldTasks(snap.exists() ? sanitizeStockDict(snap.val(), wp('oldSheetTasks')) : {}));
    const unsubPageStock = onValue(ref(db, wp('pageCreateSheetTasks')), (snap) => setStockPageTasks(snap.exists() ? sanitizeStockDict(snap.val(), wp('pageCreateSheetTasks')) : {}));
    const unsubWd = onValue(ref(db, wp('withdrawRequests')), (snap) => setWithdrawRequests(snap.exists() ? snap.val() : {}));
    const unsubBotIds = onValue(ref(db, wp('botNewIdTasks')), (snap) => setBotIdTasks(snap.exists() ? snap.val() : {}));
    const unsubPcIds = onValue(ref(db, wp('pcCloneTasks')), (snap) => setPcIdTasks(snap.exists() ? snap.val() : {}));
    const unsubPass = onValue(ref(db, 'settings/adminPass'), (snap) => {
      if (snap.exists()) setCurrentAdminPass(String(snap.val()));
      else setCurrentAdminPass('@@##');
    });

    return () => {
      unsubUsers();
      unsubPermits();
      unsubNewActive();
      unsubOldActive();
      unsubPageActive();
      unsubSub();
      unsubRep();
      unsubRepClear();
      unsubRev();
      unsubNewStock();
      unsubOldStock();
      unsubPageStock();
      unsubWd();
      unsubBotIds();
      unsubPcIds();
      unsubPass();
    };
  }, []);

  const handleChangeAdminPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassInput.trim()) {
      showToast('নতুন এডমিন পাসওয়ার্ড লিখুন!', 'error');
      return;
    }
    const newPass = adminPassInput.trim();
    await set(ref(db, 'settings/adminPass'), newPass);
    localStorage.setItem('adminSessionPass', newPass);
    showToast('এডমিন পাসওয়ার্ড পরিবর্তন সফল! অন্যান্য ডিভাইস লগআউট হয়েছে।', 'success');
    setAdminPassInput('');
    setShowPassModal(false);
  };

  const handleSendGlobalMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalMessage.trim()) {
      showToast('মেসেজের লেখা ফাঁকা রাখা যাবে না!', 'error');
      return;
    }
    const msgText = globalMessage.trim();
    const userKeys = Object.keys(users);
    if (userKeys.length === 0) {
      showToast('কোনো ইউজার পাওয়া যায়নি!', 'error');
      return;
    }

    const now = Date.now();
    const updates: Record<string, any> = {};
    userKeys.forEach((uUid) => {
      // Broadcast as adminMessage (NOT as report) — reports stay separate
      if (!uUid || uUid === 'undefined' || uUid === 'null') return;
      const existing = (users[uUid] && users[uUid].adminMessage) || '';
      const updated = existing ? `${existing}\n\n${msgText}` : msgText;
      updates[`users/${uUid}/adminMessage`] = updated;
      updates[`users/${uUid}/adminMessageAt`] = now;
    });

    await update(ref(db), updates);
    showToast('সকল ইউজারকে মেসেজ সফলভাবে পাঠানো হয়েছে!', 'success');
    setGlobalMessage('');
  };

  // System Controls
  const toggleJobSystem = async (type: 'new' | 'old' | 'page' | 'bot' | 'pc') => {
    const field = type === 'new' ? 'newJob' : type === 'old' ? 'oldJob' : type === 'page' ? 'pageCreate' : type === 'bot' ? 'botNewId' : 'pcClone';
    const resolvedCurrent = settings?.[field] === undefined ? true : Boolean(settings[field]);
    const resolvedNext = !resolvedCurrent;
    await update(ref(db, 'settings'), { [field]: resolvedNext });
    showToast(`Job status updated to ${resolvedNext ? 'ON' : 'OFF'}`, 'success');
  };

  const toggleWithdrawSystem = async () => {
    const nextVal = !settings.withdraw;
    await update(ref(db, 'settings'), { withdraw: nextVal });
    showToast(`Withdraw status updated to ${nextVal ? 'ON' : 'OFF'}`, 'success');
  };

  // Upload Countdown Progress Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadModalType, setUploadModalType] = useState<'new' | 'old' | 'page'>('new');
  const [uploadModalTotal, setUploadModalTotal] = useState(0);
  const [uploadModalCurrent, setUploadModalCurrent] = useState(0);
  const [uploadModalExisting, setUploadModalExisting] = useState(0);
  const [uploadModalFinished, setUploadModalFinished] = useState(false);

  // Smooth Interactive Stock Upload Runner
  const startStockUpload = async (type: 'new' | 'old' | 'page', validTasks: any[], replace: boolean) => {
    if (!validTasks || validTasks.length === 0) {
      showToast('কোনো বৈধ ডাটা পাওয়া যায়নি!', 'error');
      return;
    }

    const existingStock = type === 'new' ? stockNewTasks : type === 'old' ? stockOldTasks : stockPageTasks;
    const existingCount = replace ? 0 : Object.keys(existingStock).length;

    setUploadModalType(type);
    setUploadModalTotal(validTasks.length);
    setUploadModalCurrent(0);
    setUploadModalExisting(existingCount);
    setUploadModalFinished(false);
    setUploadModalOpen(true);

    const dbPath = type === 'new' ? wp('sheetTasks') : type === 'old' ? wp('oldSheetTasks') : wp('pageCreateSheetTasks');

    if (replace) {
      await remove(ref(db, dbPath));
    }

    const baseTime = Date.now();
    const seqs = replace ? [] : Object.values(existingStock).map((t: any) => (typeof t?.seq === 'number' ? t.seq : -1));
    const startSeq = seqs.length > 0 ? Math.max(...seqs) + 1 : 0;

    const total = validTasks.length;
    const updates: Record<string, any> = {};

    validTasks.forEach((parsed, idx) => {
      const seqNum = startSeq + idx;
      const newKey = `${baseTime}_${String(idx).padStart(6, '0')}`;
      updates[`${dbPath}/${newKey}`] = {
        ...parsed,
        seq: seqNum,
        createdAt: baseTime + idx,
      };
    });

    await update(ref(db), updates);

    // Step-by-step smooth visual countdown progress
    const stepTime = total > 100 ? 8 : 20;
    for (let i = 1; i <= total; i++) {
      setUploadModalCurrent(i);
      if (i % 2 === 0 || i === total) {
        await new Promise((r) => setTimeout(r, stepTime));
      }
    }

    setUploadModalFinished(true);
    showToast(`${total} টি ${type === 'new' ? 'নিউ জব' : type === 'old' ? 'ওল্ড জব' : 'পেজ তৈরি'} স্টকে সফলভাবে যুক্ত হয়েছে!`, 'success');

    if (type === 'new') {
      setBulkNewInput('');
      setReplaceNewStock(false);
    } else if (type === 'old') {
      setBulkOldInput('');
      setReplaceOldStock(false);
    } else {
      setBulkPageInput('');
      setReplacePageStock(false);
    }
  };

  const getFormattedNewJobLine = (t: SheetTask) => {
    const fn = cleanCell(t.fn);
    const ln = cleanCell(t.ln);
    const fuln = cleanCell(t.fuln || `${fn} ${ln}`.trim());
    const gen = cleanCell(t.gen);
    const st = cleanCell(t.st);
    const dob = cleanCell(t.dob);
    const checker = cleanCell(t.checker);
    const listing = cleanCell(t.listing);
    const phone = cleanCell(t.phone);
    const inbox = cleanCell(t.inbox);

    return `${fn}\t${ln}\t${fuln}\t${gen}\t${st}\t${dob}\t${checker}\t${listing}\t${phone}\t${inbox}`;
  };

  // Helpers for Ordered Stock Tasks
  const getOrderedStockNewTasks = () => {
    return Object.keys(stockNewTasks)
      .map((k) => ({ key: k, ...stockNewTasks[k] }))
      .sort((a, b) => {
        if (typeof a.seq === 'number' && typeof b.seq === 'number' && a.seq !== b.seq) {
          return a.seq - b.seq;
        }
        const timeA = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const timeB = typeof b.createdAt === 'number' ? b.createdAt : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.key.localeCompare(b.key);
      });
  };

  const getOrderedStockOldTasks = () => {
    return Object.keys(stockOldTasks)
      .map((k) => ({ key: k, ...stockOldTasks[k] }))
      .sort((a, b) => {
        if (typeof a.seq === 'number' && typeof b.seq === 'number' && a.seq !== b.seq) {
          return a.seq - b.seq;
        }
        const timeA = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const timeB = typeof b.createdAt === 'number' ? b.createdAt : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.key.localeCompare(b.key);
      });
  };

  // Robust Bulk New Job Parser & Uploader

  const getOrderedStockPageTasks = () => {
    return Object.keys(stockPageTasks)
      .map((k) => ({ key: k, ...stockPageTasks[k] }))
      .sort((a, b) => {
        if (typeof a.seq === 'number' && typeof b.seq === 'number' && a.seq !== b.seq) {
          return a.seq - b.seq;
        }
        const timeA = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const timeB = typeof b.createdAt === 'number' ? b.createdAt : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.key.localeCompare(b.key);
      });
  };

  const handleBulkAddJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (liveNewStats.validCount === 0) {
      showToast('কোনো বৈধ নিউ জব ডাটা পাওয়া যায়নি!', 'error');
      return;
    }
    await startStockUpload('new', liveNewStats.validTasks, replaceNewStock);
  };

  // Bulk Old Job Parser & Uploader
  const handleBulkAddOldJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (liveOldStats.validCount === 0) {
      showToast('কোনো বৈধ ওল্ড জব ডাটা পাওয়া যায়নি!', 'error');
      return;
    }
    await startStockUpload('old', liveOldStats.validTasks, replaceOldStock);
  };

  const handleBulkAddPageJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (livePageStats.validCount === 0) {
      showToast('কোনো বৈধ পেজ তৈরি ডাটা পাওয়া যায়নি!', 'error');
      return;
    }
    await startStockUpload('page', livePageStats.validTasks, replacePageStock);
  };

  // Direct File Upload (Google Sheet / CSV / TSV) for New Job
  const parseAndUploadNewJobText = async (text: string) => {
    const rows = parseTsvOrCsvText(text);
    const validTasks: any[] = [];
    rows.forEach((cols) => {
      const parsed = parseNewJobCols(cols);
      if (parsed && !isHeaderTask(parsed)) {
        validTasks.push(parsed);
      }
    });

    if (validTasks.length > 0) {
      await startStockUpload('new', validTasks, false);
    } else {
      showToast('ফাইলে কোনো বৈধ ডাটা পাওয়া যায়নি!', 'error');
    }
  };

  const handleFileUploadNewJob = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        parseAndUploadNewJobText(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Direct File Upload (Google Sheet / CSV / TSV) for Old Job
  const parseAndUploadOldJobText = async (text: string) => {
    const rows = parseTsvOrCsvText(text);
    const validTasks: any[] = [];
    rows.forEach((cols) => {
      const parsed = parseOldJobCols(cols);
      if (parsed && !isHeaderTask(parsed)) {
        validTasks.push(parsed);
      }
    });

    if (validTasks.length > 0) {
      await startStockUpload('old', validTasks, false);
    } else {
      showToast('ফাইলে কোনো বৈধ ডাটা পাওয়া যায়নি!', 'error');
    }
  };

  const parseAndUploadPageJobText = async (text: string) => {
    const rows = parseTsvOrCsvText(text);
    const validTasks: any[] = [];
    rows.forEach((cols) => {
      const parsed = parseOldJobCols(cols);
      if (parsed && !isHeaderTask(parsed)) {
        validTasks.push(parsed);
      }
    });
    if (validTasks.length > 0) {
      await startStockUpload('page', validTasks, false);
    } else {
      showToast('ফাইলে কোনো বৈধ ডাটা পাওয়া যায়নি!', 'error');
    }
  };

  const handleFileUploadOldJob = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        parseAndUploadOldJobText(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFileUploadPageJob = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) parseAndUploadPageJobText(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Stock Copy & Delete Helpers
  const handleCopyUploadedNewJobs = () => {
    const lines: string[] = [];
    getOrderedStockNewTasks().forEach((t) => {
      lines.push(getFormattedNewJobLine(t));
    });
    triggerSerialCopy('স্টক নিউ জব ডাটা সিরিয়াল কপি (Google Sheet TSV)', lines);
  };

  const handleClearUploadedNewJobs = async () => {
    if (confirm('স্টকে থাকা সকল আপলোডকৃত নিউ জব ডাটা মুছে ফেলতে চান?')) {
      await set(ref(db, wp('sheetTasks')), null);
      setStockNewTasks({});
      showToast('সকল আপলোডকৃত নিউ জব ডাটা মুছে ফেলা হয়েছে!', 'info');
    }
  };

  const handleCopyUploadedOldJobs = () => {
    const lines: string[] = [];
    getOrderedStockOldTasks().forEach((t) => {
      lines.push(`${t.phone || ''}\t${t.inbox || ''}`);
    });
    triggerSerialCopy('স্টক ওল্ড জব ডাটা সিরিয়াল কপি (Google Sheet TSV)', lines);
  };

  const handleClearUploadedOldJobs = async () => {
    if (confirm('স্টকে থাকা সকল আপলোডকৃত ওল্ড জব ডাটা মুছে ফেলতে চান?')) {
      await set(ref(db, wp('oldSheetTasks')), null);
      setStockOldTasks({});
      showToast('সকল আপলোডকৃত ওল্ড জব ডাটা মুছে ফেলা হয়েছে!', 'info');
    }
  };

  const handleCopyUploadedPageJobs = () => {
    const lines: string[] = [];
    getOrderedStockPageTasks().forEach((t) => {
      lines.push(`${t.phone || ''}\t${t.inbox || ''}`);
    });
    triggerSerialCopy('স্টক পেজ তৈরি ডাটা সিরিয়াল কপি (Google Sheet TSV)', lines);
  };

  const handleClearUploadedPageJobs = async () => {
    if (!confirm('সকল পেজ তৈরি স্টক মুছবেন?')) return;
    await set(ref(db, wp('pageCreateSheetTasks')), null);
    setStockPageTasks({});
    showToast('সকল আপলোডকৃত পেজ তৈরি ডাটা মুছে ফেলা হয়েছে!', 'info');
  };

  // Admin Revoke Live Task
  const handleRevokeActiveTask = async (phoneKey: string, jobType: 'new' | 'old' | 'page') => {
    if (!confirm('আপনি কি নিশ্চিতভাবে এই ইউজারের কাজ ফেরত নিতে চান?')) return;

    const activePath = jobType === 'new' ? `${wp('activeUserTasks')}/${phoneKey}` : jobType === 'old' ? `${wp('activeOldUserTasks')}/${phoneKey}` : `${wp('activePageCreateUserTasks')}/${phoneKey}`;
    const activeRef = ref(db, activePath);
    const activeSnap = await get(activeRef);

    if (!activeSnap.exists()) {
      showToast('চলমান কাজ পাওয়া যায়নি!', 'error');
      return;
    }

    const taskData: SheetTask = activeSnap.val();
    let formattedInfo = '';
    if (jobType === 'new') {
      formattedInfo = `Name: ${taskData.fuln || '-'}, Checker: ${taskData.checker || '-'}, Listing: ${taskData.listing || '-'}, Phone: ${taskData.phone || '-'}, Inbox: ${taskData.inbox || '-'}`;
    } else {
      formattedInfo = `Phone: ${taskData.phone || '-'}, Inbox: ${taskData.inbox || '-'}`;
    }

    const uFromList = users[phoneKey];
    const resolvedName =
      (taskData.assignedUserName && taskData.assignedUserName !== 'N/A'
        ? taskData.assignedUserName
        : uFromList?.name) || 'N/A';
    const resolvedUid =
      (taskData.assignedUserUid && taskData.assignedUserUid !== 'N/A'
        ? taskData.assignedUserUid
        : uFromList?.uid) || 'N/A';

    await set(push(ref(db, wp('revokedTasks'))), {
      userName: resolvedName,
      userUid: resolvedUid,
      jobType: jobType === 'new' ? 'New Job' : jobType === 'old' ? 'Old Job' : 'Page Create',
      taskInfo: formattedInfo,
      phone: taskData.phone || '-',
      inbox: taskData.inbox || '-',
      fullDetails: taskData,
      time: new Date().toLocaleString()
    });

    await remove(activeRef);
    showToast('কাজ ফেরত নেওয়া হয়েছে!', 'success');
  };

  // Find user key by UID
  const findUserKeyByUid = (targetUid: string): string | null => {
    for (const key in users) {
      if (users[key].uid?.trim().toLowerCase() === targetUid.trim().toLowerCase()) return key;
    }
    return null;
  };

  // Modify User Balance
  const handleModifyBalance = async (type: 'add' | 'deduct') => {
    const userPhoneKey = findUserKeyByUid(balTargetUid);
    if (!userPhoneKey) {
      showToast('ইউজার পাওয়া যায়নি!', 'error');
      return;
    }

    const currentBal = users[userPhoneKey].balance || 0;
    const newBal = type === 'add' ? currentBal + balAmount : Math.max(0, currentBal - balAmount);

    await update(ref(db, `users/${userPhoneKey}`), { balance: newBal });
    showToast(`ব্যালেন্স ${type === 'add' ? 'যোগ' : 'কাটা'} হয়েছে!`, 'success');
    setBalTargetUid('');
  };

  /** Parse bulk lines: AccountUID  MemberName  MemberUID (no password) */
  const parseBulkReportLines = (raw: string) => {
    const rows: { accountUid: string; name: string; memberUid: string; rawLine: string }[] = [];
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      let cols = line.split(/\t+/).map((p) => p.trim()).filter(Boolean);
      if (cols.length < 3) {
        cols = line.split(/\s{2,}|\t+/).map((p) => p.trim()).filter(Boolean);
      }
      if (cols.length < 3) {
        const sp = line.split(/\s+/).filter(Boolean);
        if (sp.length < 3) continue;
        cols = [sp[0], sp.slice(1, -1).join(' '), sp[sp.length - 1]];
      }
      const accountUid = cols[0];
      const memberUid = cols[cols.length - 1];
      const name = cols.slice(1, -1).join(' ') || '';
      if (!memberUid) continue;
      rows.push({ accountUid, name, memberUid, rawLine: line });
    }
    return rows;
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Scan paste → group by member UID → show progress → confirm modal */
  const handleBulkProcess = async (mode: 'good' | 'suspend', fromIdHub = false) => {
    setBulkFromIdHub(fromIdHub);
    const raw = fromIdHub
      ? (mode === 'good' ? idHubBulkText : idHubBadText)
      : (mode === 'good' ? bulkGoodText : bulkSuspendText);
    const rateVal = fromIdHub ? Number(idHubBulkRate) || 0 : bulkGoodRate;
    if (!raw.trim()) {
      showToast(lang === 'bn' ? 'রিপোর্ট লেখা ফাঁকা!' : 'Report text is empty!', 'error');
      return;
    }
    if (mode === 'good' && (!rateVal || rateVal <= 0)) {
      showToast(lang === 'bn' ? 'সঠিক রেট দিন!' : 'Enter a valid rate!', 'error');
      return;
    }

    const parsed = parseBulkReportLines(raw);
    if (parsed.length === 0) {
      showToast(lang === 'bn' ? 'কোনো বৈধ লাইন পাওয়া যায়নি!' : 'No valid lines found!', 'error');
      return;
    }

    setBulkModalMode(mode);
    setBulkModalPhase('scanning');
    setBulkModalOpen(true);
    setBulkModalTotal(parsed.length);
    setBulkModalCurrent(0);
    setBulkPreviewRows([]);
    setBulkModalStatus(lang === 'bn' ? 'লাইন স্ক্যান হচ্ছে...' : 'Scanning lines...');

    // Group by member UID (case-insensitive)
    const groups: Record<
      string,
      { phoneKey: string | null; name: string; memberUid: string; lines: string[]; displayName: string }
    > = {};

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i];
      setBulkModalCurrent(i + 1);
      setBulkModalStatus(
        lang === 'bn'
          ? `স্ক্যান: ${row.memberUid} (${i + 1}/${parsed.length})`
          : `Scan: ${row.memberUid} (${i + 1}/${parsed.length})`
      );
      await sleep(40);

      const uidKey = row.memberUid.trim().toLowerCase();
      if (!groups[uidKey]) {
        const phoneKey = findUserKeyByUid(row.memberUid);
        const uName = phoneKey ? users[phoneKey]?.name || row.name : row.name;
        groups[uidKey] = {
          phoneKey,
          name: uName || row.name || row.memberUid,
          memberUid: row.memberUid.trim(),
          lines: [],
          displayName: uName || row.name || row.memberUid,
        };
      }
      groups[uidKey].lines.push(
        `${row.accountUid}\t${row.name}\t${row.memberUid}`
      );
      if (row.name && groups[uidKey].name === groups[uidKey].memberUid) {
        groups[uidKey].name = row.name;
        groups[uidKey].displayName = row.name;
      }
    }

    const rate = mode === 'good' ? rateVal : 0;
    const preview: {
      phoneKey: string;
      name: string;
      memberUid: string;
      pcs: number;
      amount: number;
      reportText: string;
    }[] = [];
    let skipped = 0;

    for (const g of Object.values(groups)) {
      if (!g.phoneKey) {
        skipped++;
        continue;
      }
      const pcs = g.lines.length;
      const amount = mode === 'good' ? Math.round(pcs * rate * 100) / 100 : 0;
      const header =
        mode === 'suspend'
          ? (fromIdHub ? 'Bot PC Suspend Report' : (lang === 'bn' ? 'সাসপেন্ড আইডি রিপোর্ট' : 'Suspend ID Report'))
          : fromIdHub
            ? (idHubBulkKind === 'bot' ? 'Bot new id Report' : 'PC CLONE Report')
            : bulkGoodJob === 'new'
              ? 'New Job Report'
              : bulkGoodJob === 'old'
                ? 'Old Job Report'
                : 'Page Create Report';
      const reportText = `${header}\n${g.lines.join('\n')}\n\n✅ ${pcs} pcs` + (mode === 'good' ? ` × ${rate} = ${amount} ৳` : '');
      preview.push({
        phoneKey: g.phoneKey,
        name: g.displayName,
        memberUid: g.memberUid,
        pcs,
        amount,
        reportText,
      });
    }

    setBulkPreviewRows(preview);
    setBulkModalPhase('confirm');
    setBulkModalStatus(
      skipped > 0
        ? lang === 'bn'
          ? `${preview.length} জন মিলছে, ${skipped} UID পাওয়া যায়নি`
          : `${preview.length} matched, ${skipped} UID not found`
        : lang === 'bn'
          ? `${preview.length} জন মেম্বার — কনফার্ম করুন`
          : `${preview.length} members — confirm to send`
    );

    if (preview.length === 0) {
      showToast(lang === 'bn' ? 'কোনো মেম্বার UID মিলেনি!' : 'No member UID matched!', 'error');
      setBulkModalOpen(false);
    }
  };

  const mergeSameReport = (prevText: any, prevAt: any, nextText: string) => {
    const ONE_HOUR = 60 * 60 * 1000;
    const old = String(prevText || '').trim();
    const at = Number(prevAt) || 0;
    if (!old || !at || Date.now() - at > ONE_HOUR) return nextText;
    return old + '\n\n---\n\n' + nextText;
  };

  const handleBulkConfirmSend = async () => {
    if (bulkSending || bulkPreviewRows.length === 0) return;
    setBulkSending(true);
    setBulkModalPhase('sending');
    setBulkModalTotal(bulkPreviewRows.length);
    setBulkModalCurrent(0);

    const mode = bulkModalMode;
    const job = bulkGoodJob;
    const fromHub = bulkFromIdHub;
    const reportField =
      mode === 'suspend'
        ? (fromHub ? 'idHubSuspendReport' : 'suspendReport')
        : fromHub
          ? (idHubBulkKind === 'pc' ? 'idHubPcReport' : 'idHubBotReport')
          : job === 'new'
            ? 'newReport'
            : job === 'old'
              ? 'oldReport'
              : 'pageCreateReport';
    const reportAtField =
      mode === 'suspend'
        ? (fromHub ? 'idHubSuspendReportAt' : 'suspendReportAt')
        : fromHub
          ? (idHubBulkKind === 'pc' ? 'idHubPcReportAt' : 'idHubBotReportAt')
          : job === 'new'
            ? 'newReportAt'
            : job === 'old'
              ? 'oldReportAt'
              : 'pageCreateReportAt';

    let ok = 0;
    for (let i = 0; i < bulkPreviewRows.length; i++) {
      const row = bulkPreviewRows[i];
      setBulkModalCurrent(i + 1);
      setBulkModalStatus(
        lang === 'bn'
          ? `পাঠানো হচ্ছে: ${row.name} — ${row.pcs} pcs` + (row.amount ? ` / ${row.amount} ৳` : '')
          : `Sending: ${row.name} — ${row.pcs} pcs` + (row.amount ? ` / ${row.amount} ৳` : '')
      );
      await sleep(80);

      try {
        const uData = users[row.phoneKey];
        if (!uData) continue;
        // Fresh balance
        let bal = Number(uData.balance) || 0;
        try {
          const snap = await get(ref(db, `users/${row.phoneKey}`));
          if (snap.exists()) bal = Number(snap.val()?.balance) || 0;
        } catch { /* use local */ }

        let fresh: any = uData;
        try {
          const snap = await get(ref(db, `users/${row.phoneKey}`));
          if (snap.exists()) fresh = snap.val() || uData;
        } catch { /* use local */ }
        const merged = mergeSameReport(fresh?.[reportField], fresh?.[reportAtField], row.reportText);
        const updates: Record<string, any> = {
          [reportField]: merged,
          [reportAtField]: Date.now(),
        };
        if (fromHub && mode === 'good') {
          updates.idHubReportLabel = idHubBulkKind === 'pc' ? 'PC CLONE Report' : 'Bot new id Report';
        }
        if (mode === 'good' && row.amount > 0) {
          updates.balance = bal + row.amount;
        }
        await update(ref(db, `users/${row.phoneKey}`), updates);
        ok++;
      } catch (e) {
        console.error(e);
      }
    }

    setBulkModalPhase('done');
    setBulkModalStatus(
      lang === 'bn' ? `${ok} জনের রিপোর্ট সফলভাবে পাঠানো হয়েছে` : `${ok} reports sent successfully`
    );
    showToast(
      lang === 'bn' ? `${ok} জনকে রিপোর্ট পাঠানো হয়েছে!` : `${ok} reports sent!`,
      'success'
    );

    if (mode === 'good') {
      if (bulkFromIdHub) setIdHubBulkText('');
      else setBulkGoodText('');
    }
    else setBulkSuspendText('');
    setBulkSending(false);

    setTimeout(() => {
      setBulkModalOpen(false);
      setBulkPreviewRows([]);
    }, 1200);
  };


  // User Task Access Toggle (all jobs)
  const handleToggleUserTaskAccess = async (phoneKey: string) => {
    const currentAccess = users[phoneKey].taskAccess !== undefined ? users[phoneKey].taskAccess : true;
    await update(ref(db, `users/${phoneKey}`), { taskAccess: !currentAccess });
    showToast(`ইউজার টাস্ক এক্সেস ${!currentAccess ? 'ON' : 'OFF'} করা হয়েছে!`, 'info');
  };

  // Per-member New Job permission toggle
  const handleToggleNewJobAccess = async (phoneKey: string) => {
    const current = users[phoneKey].newJobAccess !== undefined ? users[phoneKey].newJobAccess : true;
    await update(ref(db, `users/${phoneKey}`), { newJobAccess: !current });
    showToast(`নিউ জব অনুমতি ${!current ? 'ON' : 'OFF'} করা হয়েছে!`, 'info');
  };

  const handleToggleOldJobAccess = async (phoneKey: string) => {
    const current = users[phoneKey].oldJobAccess !== undefined ? users[phoneKey].oldJobAccess : true;
    await update(ref(db, `users/${phoneKey}`), { oldJobAccess: !current });
    showToast(`ওল্ড জব অনুমতি ${!current ? 'ON' : 'OFF'} করা হয়েছে!`, 'info');
  };

  const handleTogglePageCreateAccess = async (phoneKey: string) => {
    const current = users[phoneKey].pageCreateAccess !== undefined ? users[phoneKey].pageCreateAccess : true;
    await update(ref(db, `users/${phoneKey}`), { pageCreateAccess: !current });
    showToast(`পেজ তৈরি অনুমতি ${!current ? 'ON' : 'OFF'} করা হয়েছে!`, 'info');
  };

  // Copy Helpers
  const handleCopyAllRevoked = () => {
    const lines: string[] = [];
    Object.values(revokedTasks).forEach((r: RevokedTask) => {
      lines.push(formatRevokedRow(r));
    });
    triggerSerialCopy('সব ফেরত নেওয়া কাজ সিরিয়াল কপি', lines);
  };

  const handleCopySubmittedByType = (jobType: 'New Job' | 'Old Job' | 'Page Create') => {
    const lines: string[] = [];
    Object.values(submittedTasks).forEach((t: SubmittedTask) => {
      if (t.status === 'pending' || !t.status) {
        const jt = String(t.jobType || '');
        const isPage = jt === 'Page Create';
        const isNew = !isPage && jt !== 'Old Job' && (jt === 'New Job' || jt === 'new' || (!t.jobType && (Boolean(t.fuln) || Boolean(t.listing) || Boolean(t.checker))));
        const isOld = !isPage && !isNew;
        const matchesType =
          (jobType === 'New Job' && isNew) ||
          (jobType === 'Old Job' && isOld) ||
          (jobType === 'Page Create' && isPage);
        if (matchesType) {
          lines.push(formatSubmittedRow(t));
        }
      }
    });
    triggerSerialCopy(`সফল জমা কাজ সিরিয়াল কপি (${jobType})`, lines);
  };

  const handleCopyReportedByType = (jobType: 'New Job' | 'Old Job' | 'Page Create') => {
    const lines: string[] = [];
    const seenPhone = new Set<string>();
    Object.values(reportedTasks).forEach((t: ReportedTask) => {
      const jt = String(t.jobType || '');
      const isPage = jt === 'Page Create';
      const isNew = !isPage && jt !== 'Old Job' && (jt === 'New Job' || jt === 'new' || (!t.jobType && (Boolean(t.fuln) || Boolean(t.listing) || Boolean(t.checker))));
      const isOld = !isPage && !isNew;
      const matchesType =
        (jobType === 'New Job' && isNew) ||
        (jobType === 'Old Job' && isOld) ||
        (jobType === 'Page Create' && isPage);
      if (!matchesType) return;
      const cut = Number(reportedClearAt?.[jobType]) || 0;
      const ts =
        typeof (t as any)?.reportedAt === 'number' && (t as any).reportedAt > 0
          ? (t as any).reportedAt
          : typeof (t as any)?.createdAt === 'number' && (t as any).createdAt > 1e12
            ? (t as any).createdAt
            : 0;
      if (cut && ts && ts <= cut) return;
      // Dedupe by phone — same number must not appear twice in copy
      const phoneKey = String(t.phone || '').replace(/\D/g, '');
      if (phoneKey) {
        if (seenPhone.has(phoneKey)) return;
        seenPhone.add(phoneKey);
      }
      const row = formatReportedRow(t).trim();
      if (row) lines.push(row);
    });
    triggerSerialCopy(`নষ্ট/রিপোর্ট কাজ সিরিয়াল কপি (${jobType})`, lines);
  };

  // Clear/Delete Helpers
  const handleClearRevoked = async () => {
    if (confirm('সব ফেরত নেওয়া কাজ মুছে ফেলতে চান?')) {
      await set(ref(db, wp('revokedTasks')), null);
      setRevokedTasks({});
      showToast('সব ফেরত নেওয়া কাজ মুছে ফেলা হয়েছে!', 'info');
    }
  };

  const handleClearSubmittedByType = async (jobType: 'New Job' | 'Old Job' | 'Page Create') => {
    if (confirm(`সব ${jobType} এর জমা কাজ মুছতে চান?`)) {
      const updates: Record<string, null> = {};
      Object.keys(submittedTasks).forEach((key) => {
        const t = submittedTasks[key];
        const jt = String(t.jobType || '');
        const isPage = jt === 'Page Create';
        const isNew = !isPage && jt !== 'Old Job' && (jt === 'New Job' || jt === 'new' || (!t.jobType && (Boolean(t.fuln) || Boolean(t.listing) || Boolean(t.checker))));
        const isOld = !isPage && !isNew;
        const matchesType =
          (jobType === 'New Job' && isNew) ||
          (jobType === 'Old Job' && isOld) ||
          (jobType === 'Page Create' && isPage);
        if (matchesType) {
          updates[`${wp('submittedTasks')}/${key}`] = null;
        }
      });
      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
        showToast(`${jobType} এর সব জমা কাজ মুছে ফেলা হয়েছে!`, 'info');
      } else {
        showToast('মুছে ফেলার মতো কোনো কাজ পাওয়া যায়নি!', 'info');
      }
    }
  };

  const reportJobBucket = (t: any): 'New Job' | 'Old Job' | 'Page Create' => {
    const jt = String(t?.jobType || '');
    if (jt === 'Page Create') return 'Page Create';
    const isNew = jt !== 'Old Job' && (jt === 'New Job' || jt === 'new' || (!t?.jobType && (Boolean(t?.fuln) || Boolean(t?.listing) || Boolean(t?.checker))));
    return isNew ? 'New Job' : 'Old Job';
  };

  const handleClearReportedByType = async (jobType: 'New Job' | 'Old Job' | 'Page Create') => {
    if (confirm(`সব ${jobType} এর নষ্ট কাজ মুছতে চান?`)) {
      const updates: Record<string, any> = {};
      // Fresh server list — not only local state
      let live: Record<string, any> = reportedTasks || {};
      try {
        const snap = await get(ref(db, wp('reportedTasks')));
        if (snap.exists()) live = snap.val() || {};
      } catch { /* use local */ }
      Object.keys(live).forEach((key) => {
        if (reportJobBucket(live[key]) === jobType) {
          updates[`${wp('reportedTasks')}/${key}`] = null;
        }
      });
      // Also wipe any leftover ROOT path from old apps
      try {
        const rootSnap = await get(ref(db, 'reportedTasks'));
        if (rootSnap.exists()) {
          const root = rootSnap.val() || {};
          Object.keys(root).forEach((key) => {
            if (reportJobBucket(root[key]) === jobType) {
              updates[`reportedTasks/${key}`] = null;
            }
          });
        }
      } catch { /* ignore */ }

      updates[`${wp('reportedClearAt')}/${jobType}`] = Date.now();
      await update(ref(db), updates);
      showToast(`${jobType} এর সব নষ্ট কাজ মুছে ফেলা হয়েছে!`, 'info');
    }
  };

  const handleClearAllUploadedTasks = async () => {
    if (confirm('সব স্টক করা নিউ ও ওল্ড কাজ মুছতে চান?')) {
      await remove(ref(db, wp('sheetTasks')));
      await remove(ref(db, wp('oldSheetTasks')));
      await remove(ref(db, wp('pageCreateSheetTasks')));
      showToast('সব স্টক ডাটা ক্লিয়ার করা হয়েছে!', 'info');
    }
  };

  const handleApproveUser = async (phoneKey: string) => {
    await update(ref(db, `users/${phoneKey}`), { isApproved: true });
    showToast('ইউজার একাউন্ট এপ্রুভ হয়েছে!', 'success');
  };

  const handleDeleteUser = async (phoneKey: string) => {
    if (confirm('এই ইউজারের একাউন্ট মুছে ফেলতে চান?')) {
      await remove(ref(db, `users/${phoneKey}`));
      showToast('ইউজার একাউন্ট মোছা হয়েছে!', 'info');
    }
  };

  const handleResetUserTasks = async (phoneKey: string) => {
    await update(ref(db, `users/${phoneKey}`), { completedTasks: 0, completedNewTasks: 0, completedOldTasks: 0, completedPageCreateTasks: 0, completedPageTasks: 0, completedBotNewIds: 0, completedPcClones: 0 });
    showToast('ইউজারের কাজ ০ করা হয়েছে!', 'success');
  };

  const handleResetAllUsersTasks = async () => {
    if (confirm('সকল ইউজারের কাজ একসাথে ০ করতে চান?')) {
      const updates: Record<string, number> = {};
      Object.keys(users).forEach((key) => {
        updates[`users/${key}/completedTasks`] = 0;
        updates[`users/${key}/completedNewTasks`] = 0;
        updates[`users/${key}/completedOldTasks`] = 0;
        updates[`users/${key}/completedPageCreateTasks`] = 0;
        updates[`users/${key}/completedPageTasks`] = 0;
        updates[`users/${key}/completedBotNewIds`] = 0;
        updates[`users/${key}/completedPcClones`] = 0;
      });
      await update(ref(db), updates);
      showToast('সব ইউজারের কাজ ০ করা হয়েছে!', 'success');
    }
  };

  const totalUsersBalance = Object.values(users).reduce(
    (s, u) => s + (Number(u?.balance) || 0),
    0
  );

  /** BD calendar day YYYY-MM-DD */
  const dayKeyFromTs = (ts: number) => {
    if (!ts || ts <= 0) return 'unknown';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(ts));
    } catch {
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  };

  const getWithdrawTs = (wd: any): number => {
    // 1) Prefer server/numeric createdAt (never trust member phone locale)
    const ca = wd?.createdAt;
    if (typeof ca === 'number' && ca > 1e11) return ca;
    if (typeof ca === 'string' && /^\d+$/.test(ca)) {
      const n = Number(ca);
      if (n > 1e11) return n;
    }

    const s = String(wd?.time || '').trim();
    if (!s) return 0;

    // ISO-like: 2026-08-18...
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const p = Date.parse(s);
      if (!Number.isNaN(p)) return p;
    }

    // Manual parse only — DO NOT Date.parse('8/10/2026') (locale-dependent, causes Oct/Aug swap)
    const m = s.match(
      /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:.*,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/
    );
    if (m) {
      const x = parseInt(m[1], 10);
      const y0 = parseInt(m[2], 10);
      let year = parseInt(m[3], 10);
      if (year < 100) year += 2000;
      const hasAmPm = !!(m[7] && /AM|PM/i.test(m[7]));
      let day: number;
      let month: number;
      // BD default: D/M/Y. US toLocaleString with AM/PM is usually M/D/Y
      if (hasAmPm) {
        month = x;
        day = y0;
      } else if (x > 12) {
        day = x;
        month = y0;
      } else if (y0 > 12) {
        month = x;
        day = y0;
      } else {
        // ambiguous → D/M/Y (Bangladesh)
        day = x;
        month = y0;
      }
      let hh = m[4] != null ? parseInt(m[4], 10) : 12;
      const mm = m[5] != null ? parseInt(m[5], 10) : 0;
      const ss = m[6] != null ? parseInt(m[6], 10) : 0;
      const ap = (m[7] || '').toUpperCase();
      if (ap === 'PM' && hh < 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;
      // Build as UTC+6 (Dhaka) roughly via ISO string
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+06:00`;
      const dt = Date.parse(iso);
      if (!Number.isNaN(dt)) return dt;
    }
    return 0;
  };

  // "Today" / "Yesterday" always by Bangladesh calendar (not admin phone UI locale)
  const todayKey = dayKeyFromTs(Date.now());
  const yesterdayKey = dayKeyFromTs(Date.now() - 36e5 * 24);

  const totalWithdrawAmount = Object.values(withdrawRequests).reduce(
    (acc: number, curr: any) => acc + (Number(curr?.amount) || 0),
    0
  );
  const todayWithdrawAmount = Object.values(withdrawRequests).reduce((acc: number, curr: any) => {
    if (dayKeyFromTs(getWithdrawTs(curr)) === todayKey) return acc + (Number(curr?.amount) || 0);
    return acc;
  }, 0);

  // Today first (running), then previous dates newest→oldest
  const withdrawGroups = (() => {
    const map: Record<string, { key: string; wd: any }[]> = {};
    Object.keys(withdrawRequests).forEach((key) => {
      const wd = withdrawRequests[key];
      const dk = dayKeyFromTs(getWithdrawTs(wd));
      if (!map[dk]) map[dk] = [];
      map[dk].push({ key, wd });
    });
    const keys = Object.keys(map).sort((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      if (a === todayKey) return -1;
      if (b === todayKey) return 1;
      return b.localeCompare(a);
    });
    return keys.map((dk) => {
      const items = map[dk].sort((a, b) => getWithdrawTs(b.wd) - getWithdrawTs(a.wd));
      const label =
        dk === todayKey
          ? lang === 'bn'
            ? `আজ · ${dk}`
            : `Today · ${dk}`
          : dk === yesterdayKey
            ? lang === 'bn'
              ? `গতকাল · ${dk}`
              : `Yesterday · ${dk}`
            : dk === 'unknown'
              ? lang === 'bn'
                ? 'অজানা তারিখ'
                : 'Unknown date'
              : dk;
      return {
        dayKey: dk,
        label,
        count: items.length,
        items,
        sum: items.reduce((s, x) => s + (Number(x.wd?.amount) || 0), 0),
      };
    });
  })();

  const handleClearAllWithdrawals = async () => {
    if (confirm('আপনি কি নিশ্চিত যে সকল উইথড্র রিকোয়েস্ট সম্পূর্ণ মুছে ফেলতে চান?')) {
      await set(ref(db, wp('withdrawRequests')), null);
      showToast('সকল উইথড্র রিকোয়েস্ট সম্পূর্ণ মুছে ফেলা হয়েছে!', 'info');
    }
  };

  const handleApproveWithdraw = async (key: string) => {
    await update(ref(db, `${wp('withdrawRequests')}/${key}`), { status: 'approved' });
    showToast('উইথড্র পেমেন্ট কমপ্লিট করা হয়েছে!', 'success');
  };

  const handleDeleteWithdraw = async (key: string) => {
    if (confirm('উইথড্র হিস্ট্রিটি মুছতে চান?')) {
      await remove(ref(db, `${wp('withdrawRequests')}/${key}`));
      showToast('উইথড্র মোছা হয়েছে!', 'info');
    }
  };

  const rawReported = reportedTasks && typeof reportedTasks === 'object' ? reportedTasks : {};
  const safeReported = Object.fromEntries(
    Object.entries(rawReported).filter(([, t]: [string, any]) => {
      const jt = String(t?.jobType || '');
      const bucket =
        jt === 'Page Create'
          ? 'Page Create'
          : jt === 'Old Job' || jt === 'old'
            ? 'Old Job'
            : (jt === 'New Job' || jt === 'new' || (!t?.jobType && (Boolean(t?.fuln) || Boolean(t?.listing) || Boolean(t?.checker))))
              ? 'New Job'
              : 'Old Job';
      const cut = Number(reportedClearAt?.[bucket]) || 0;
      if (!cut) return true;
      const ts =
        typeof t?.reportedAt === 'number' && t.reportedAt > 0
          ? t.reportedAt
          : typeof t?.createdAt === 'number' && t.createdAt > 1e12
            ? t.createdAt
            : 0;
      // Hide only known-old items. Missing stamp = show (do not hide live Change/Suspend).
      if (!ts) return true;
      return ts > cut;
    })
  ) as Record<string, ReportedTask>;
  const safeSubmitted = submittedTasks && typeof submittedTasks === 'object' ? submittedTasks : {};
  const safeRevoked = revokedTasks && typeof revokedTasks === 'object' ? revokedTasks : {};

  const newReportedCount = (Object.values(safeReported) as ReportedTask[]).filter(
    (t) => t && (t.jobType || 'New Job') === 'New Job'
  ).length;

  const oldReportedCount = (Object.values(safeReported) as ReportedTask[]).filter(
    (t) => t && t.jobType === 'Old Job'
  ).length;
  const pageReportedCount = (Object.values(safeReported) as ReportedTask[]).filter(
    (t) => t && t.jobType === 'Page Create'
  ).length;

  const newSubmittedCount = (Object.values(safeSubmitted) as SubmittedTask[]).filter(
    (t) => t && (t.jobType || 'New Job') === 'New Job'
  ).length;

  const oldSubmittedCount = (Object.values(safeSubmitted) as SubmittedTask[]).filter(
    (t) => t && t.jobType === 'Old Job'
  ).length;
  const pageSubmittedCount = (Object.values(safeSubmitted) as SubmittedTask[]).filter(
    (t) => t && t.jobType === 'Page Create'
  ).length;

  const revokedCount = Object.keys(safeRevoked).length;

  const formatIdRow = (row: any) => {
    const uid = String(row?.uid || '').replace(/[\r\n\t]+/g, ' ').trim();
    const pass = String(row?.pass || '').replace(/[\r\n\t]+/g, ' ').trim();
    const key2fa = String(row?.key2fa || '').replace(/[\r\n\t]+/g, ' ').trim();
    const mail = String(row?.mail || '').replace(/[\r\n\t]+/g, ' ').trim();
    const mailLink = String(row?.mailLink || '').replace(/[\r\n\t]+/g, ' ').trim();
    const userName = String(row?.userName || '').replace(/[\r\n\t]+/g, ' ').trim();
    const userUid = String(row?.userUid || '').replace(/[\r\n\t]+/g, ' ').trim();
    return `${uid}\t${pass}\t${key2fa}\t${mail}\t${mailLink}\t${userName}\t${userUid}`;
  };

  const handleCopyIdKind = (kind: 'bot' | 'pc') => {
    const src = kind === 'bot' ? botIdTasks : pcIdTasks;
    const lines = Object.values(src || {}).map((row) => formatIdRow(row)).filter((l) => l.trim());
    triggerSerialCopy(kind === 'bot' ? t(lang, 'copyBotIds') : t(lang, 'copyPcIds'), lines);
  };

  const idHubRows = (() => {
    const map: Record<string, { phone: string; name: string; uid: string; bot: number; pc: number; botKeys: string[]; pcKeys: string[] }> = {};
    const bump = (src: Record<string, any>, kind: 'bot' | 'pc') => {
      Object.entries(src || {}).forEach(([key, row]: [string, any]) => {
        const phone = String(row?.user || '');
        if (!phone) return;
        if (!map[phone]) {
          const u = users[phone];
          map[phone] = {
            phone,
            name: row?.userName || u?.name || '-',
            uid: row?.userUid || u?.uid || '-',
            bot: 0,
            pc: 0,
            botKeys: [],
            pcKeys: [],
          };
        }
        if (kind === 'bot') {
          map[phone].bot += 1;
          map[phone].botKeys.push(key);
        } else {
          map[phone].pc += 1;
          map[phone].pcKeys.push(key);
        }
      });
    };
    bump(botIdTasks, 'bot');
    bump(pcIdTasks, 'pc');
    return Object.values(map).sort((a, b) => b.bot + b.pc - (a.bot + a.pc));
  })();

  const handleIdHubPay = async (phone: string, bot: number, pc: number, name: string) => {
    const pcs = bot + pc;
    const rate = Number(idHubRate) || 0;
    if (pcs <= 0) return;
    const amount = pcs * rate;
    const ok = confirm(
      lang === 'bn'
        ? `${name} — Bot ${bot} + PC ${pc} = ${pcs} pcs × ${rate} = ${amount} Tk ?`
        : `${name} — Bot ${bot} + PC ${pc} = ${pcs} pcs × ${rate} = ${amount} Tk ?`
    );
    if (!ok) return;
    setIdHubPaying(phone);
    try {
      const uSnap = await get(ref(db, `users/${phone}`));
      const u = uSnap.exists() ? uSnap.val() || {} : {};
      const msg =
        lang === 'bn'
          ? `আইডি রিপোর্ট\nBot new id: ${bot} pcs\nPC CLONE: ${pc} pcs\nমোট: ${pcs} pcs\nরেট: ${rate} Tk\nপেমেন্ট: ${amount} Tk`
          : `ID Report\nBot new id: ${bot} pcs\nPC CLONE: ${pc} pcs\nTotal: ${pcs} pcs\nRate: ${rate} Tk\nPayment: ${amount} Tk`;
      await update(ref(db, `users/${phone}`), {
        balance: (Number(u.balance) || 0) + amount,
        idHubReport: msg,
        idHubReportAt: Date.now(),
        idHubReportLabel: 'Bot work Report',
      });
      showToast(t(lang, 'idHubPaid'), 'success');
    } catch {
      showToast('Failed', 'error');
    } finally {
      setIdHubPaying(null);
    }
  };

  const handleIdHubBulkSend = async () => {
    const raw = idHubBulkText;
    if (!raw.trim()) {
      showToast(lang === 'bn' ? 'রিপোর্ট লেখা ফাঁকা!' : 'Report text is empty!', 'error');
      return;
    }
    const rate = Number(idHubBulkRate) || 0;
    if (rate <= 0) {
      showToast(lang === 'bn' ? 'সঠিক রেট দিন!' : 'Enter a valid rate!', 'error');
      return;
    }
    const parsed = parseBulkReportLines(raw);
    if (parsed.length === 0) {
      showToast(lang === 'bn' ? 'কোনো বৈধ লাইন পাওয়া যায়নি!' : 'No valid lines found!', 'error');
      return;
    }
    const groups: Record<string, { phoneKey: string | null; name: string; memberUid: string; pcs: number }> = {};
    for (const row of parsed) {
      const uidKey = row.memberUid.trim().toLowerCase();
      if (!groups[uidKey]) {
        const phoneKey = findUserKeyByUid(row.memberUid);
        groups[uidKey] = {
          phoneKey,
          name: (phoneKey ? users[phoneKey]?.name : '') || row.name || row.memberUid,
          memberUid: row.memberUid.trim(),
          pcs: 0,
        };
      }
      groups[uidKey].pcs += 1;
    }
    let sent = 0;
    for (const g of Object.values(groups)) {
      if (!g.phoneKey) continue;
      const amount = g.pcs * rate;
      const kindLabel = idHubBulkKind === 'bot' ? 'Bot new id' : 'PC CLONE';
      const msg =
        lang === 'bn'
          ? `আইডি রিপোর্ট\n${kindLabel}: ${g.pcs} pcs\nরেট: ${rate} Tk\nপেমেন্ট: ${amount} Tk`
          : `ID Report\n${kindLabel}: ${g.pcs} pcs\nRate: ${rate} Tk\nPayment: ${amount} Tk`;
      const snap = await get(ref(db, `users/${g.phoneKey}`));
      const bal = snap.exists() ? Number(snap.val()?.balance) || 0 : 0;
      const field = idHubBulkKind === 'pc' ? 'idHubPcReport' : 'idHubBotReport';
      const atField = idHubBulkKind === 'pc' ? 'idHubPcReportAt' : 'idHubBotReportAt';
      const prev = snap.exists() ? snap.val() || {} : {};
      await update(ref(db, `users/${g.phoneKey}`), {
        balance: bal + amount,
        [field]: mergeSameReport(prev[field], prev[atField], msg),
        [atField]: Date.now(),
        idHubReportLabel: idHubBulkKind === 'pc' ? 'PC CLONE Report' : 'Bot new id Report',
      });
      sent += 1;
    }
    showToast(lang === 'bn' ? `${sent} জনকে রিপোর্ট পাঠানো হয়েছে` : `${sent} reports sent`, sent ? 'success' : 'error');
  };

  const handleClearIdKind = async (kind: 'bot' | 'pc') => {
    const path = kind === 'bot' ? wp('botNewIdTasks') : wp('pcCloneTasks');
    if (!confirm(lang === 'bn' ? 'এই লিস্ট মুছবেন?' : 'Delete this list?')) return;
    await set(ref(db, path), null);
    showToast(t(lang, 'dataCleared'), 'info');
  };

  const handleIdHubBadSend = async () => {
    const raw = idHubBadText;
    if (!raw.trim()) {
      showToast(lang === 'bn' ? 'রিপোর্ট লেখা ফাঁকা!' : 'Report text is empty!', 'error');
      return;
    }
    const parsed = parseBulkReportLines(raw);
    if (parsed.length === 0) {
      showToast(lang === 'bn' ? 'কোনো বৈধ লাইন পাওয়া যায়নি!' : 'No valid lines found!', 'error');
      return;
    }
    let sent = 0;
    const groups: Record<string, { phoneKey: string | null; name: string; memberUid: string; pcs: number }> = {};
    for (const row of parsed) {
      const uidKey = row.memberUid.trim().toLowerCase();
      if (!groups[uidKey]) {
        const phoneKey = findUserKeyByUid(row.memberUid);
        groups[uidKey] = {
          phoneKey,
          name: (phoneKey ? users[phoneKey]?.name : '') || row.name || row.memberUid,
          memberUid: row.memberUid.trim(),
          pcs: 0,
        };
      }
      groups[uidKey].pcs += 1;
    }
    for (const g of Object.values(groups)) {
      if (!g.phoneKey) continue;
      const msg =
        lang === 'bn'
          ? `নষ্ট আইডি রিপোর্ট\n${g.pcs} pcs\nসাসপেন্ড আইডি`
          : `Bad ID Report\n${g.pcs} pcs\nSuspended ID`;
      const prevSnap = await get(ref(db, `users/${g.phoneKey}`));
      const prev = prevSnap.exists() ? prevSnap.val() || {} : {};
      await update(ref(db, `users/${g.phoneKey}`), {
        idHubSuspendReport: mergeSameReport(prev.idHubSuspendReport, prev.idHubSuspendReportAt, msg),
        idHubSuspendReportAt: Date.now(),
      });
      sent += 1;
    }
    showToast(lang === 'bn' ? `${sent} জনকে নষ্ট আইডি রিপোর্ট গেছে` : `${sent} bad-ID reports sent`, sent ? 'success' : 'error');
  };


  const handleIdHubPersonalMessage = async () => {
    const uid = idHubPmUid.trim();
    const msg = idHubPmText.trim();
    if (!uid || !msg) {
      showToast(lang === 'bn' ? 'UID ও মেসেজ দিন' : 'Enter UID and message', 'error');
      return;
    }
    const phoneKey = findUserKeyByUid(uid);
    if (!phoneKey) {
      showToast(lang === 'bn' ? 'এই UID পাওয়া যায়নি' : 'UID not found', 'error');
      return;
    }
    await update(ref(db, `users/${phoneKey}`), {
      adminMessage: msg,
      adminMessageAt: Date.now(),
    });
    setIdHubPmText('');
    showToast(lang === 'bn' ? `${users[phoneKey]?.name || uid} কে মেসেজ গেছে` : `Message sent to ${users[phoneKey]?.name || uid}`, 'success');
  };




  const handleGeneratePermit = async () => {
    const code = 'PW-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    await set(ref(db, `${wp('memberPermits')}/${code}`), { createdAt: Date.now(), used: false });
    const ok = await copyToClipboard(code);
    showToast(ok ? (lang === 'bn' ? `কোড তৈরি ও কপি: ${code}` : `Code created & copied: ${code}`) : code, 'success');
  };

  const handleSaveMemberProfile = async (oldPhone: string, nameVal: string, phoneVal: string, passVal: string) => {
    const nm = nameVal.trim();
    if (!nm || nm.length > 11 || !/^[A-Za-z0-9 .'-]+$/.test(nm)) {
      showToast(t(lang, 'nameEnglishOnly'), 'error');
      return;
    }
    const ph = phoneVal.replace(/\D/g, '');
    if (!ph || ph.length > 11) {
      showToast(t(lang, 'phoneMax11'), 'error');
      return;
    }
    const u = users[oldPhone];
    if (!u) return;
    try {
      if (ph !== oldPhone) {
        const exists = await get(ref(db, `users/${ph}`));
        if (exists.exists()) {
          showToast(lang === 'bn' ? 'এই নম্বর আগেই আছে' : 'Number already exists', 'error');
          return;
        }
        const payload: any = { ...u, name: nm, phone: ph };
        if (passVal.trim()) payload.pass_v3 = passVal.trim();
        await set(ref(db, `users/${ph}`), payload);
        await remove(ref(db, `users/${oldPhone}`));
      } else {
        const patch: any = { name: nm };
        if (passVal.trim()) patch.pass_v3 = passVal.trim();
        await update(ref(db, `users/${oldPhone}`), patch);
      }
      showToast(lang === 'bn' ? 'সেভ হয়েছে' : 'Saved', 'success');
    } catch (e) {
      showToast('Save failed', 'error');
    }
  };

  if (showMembersEdit) {
    return (
      <div className="max-w-5xl mx-auto p-2 sm:p-4 space-y-2.5 text-xs relative">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold text-amber-200 flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            {t(lang, 'membersEditTitle')}
          </h2>
          <button type="button" onClick={() => setShowMembersEdit(false)} className="h-8 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-600">{t(lang, 'backToDash')}</button>
        </div>
        <div className="bg-slate-900/95 border border-slate-700 rounded-2xl p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {Object.keys(users).length === 0 ? (
            <div className="p-3 text-center text-slate-500">{t(lang, 'noUsers')}</div>
          ) : Object.entries(users).map(([phoneKey, u]) => (
            <MemberEditRow key={phoneKey} phoneKey={phoneKey} u={u} lang={lang} visible={!!memberPassVisible[phoneKey]} underCount={0} underNames="" onTogglePass={() => setMemberPassVisible((s) => ({ ...s, [phoneKey]: !s[phoneKey] }))} onSave={handleSaveMemberProfile} />
          ))}
        </div>
      </div>
    );
  }

  if (showIdHub) {
    return (
      <div className="max-w-5xl mx-auto p-2 sm:p-4 space-y-2.5 text-xs relative">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold text-cyan-200 flex items-center gap-2">
            <Bot className="w-4 h-4" />
            {t(lang, 'idHubTitle')}
          </h2>
          <button
            type="button"
            onClick={() => setShowIdHub(false)}
            className="h-8 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-600"
          >
            {t(lang, 'backToDash')}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => toggleJobSystem('bot')} className={`h-9 rounded-xl text-[11px] font-bold border ${settings.botNewId !== false ? 'bg-cyan-600/25 border-cyan-400 text-cyan-100' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
            {settings.botNewId !== false ? t(lang, 'botOn') : t(lang, 'botOff')}
          </button>
          <button type="button" onClick={() => toggleJobSystem('pc')} className={`h-9 rounded-xl text-[11px] font-bold border ${settings.pcClone !== false ? 'bg-fuchsia-600/25 border-fuchsia-400 text-fuchsia-100' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
            {settings.pcClone !== false ? t(lang, 'pcOn') : t(lang, 'pcOff')}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AdminCard title="🤖 " titleText={`${t(lang, 'botNewId')} (${Object.keys(botIdTasks).length})`} accent="sky" actions={
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => handleCopyIdKind('bot')} className="px-1.5 py-0.5 bg-cyan-600 text-white font-bold rounded text-[9px]">{t(lang, 'copyAll')}</button>
              <button type="button" onClick={() => handleClearIdKind('bot')} className="px-1.5 py-0.5 bg-rose-600 text-white font-bold rounded text-[9px]">{t(lang, 'deleteAll')}</button>
            </div>
          }>
            <div className="max-h-64 overflow-y-auto border border-slate-700/80 rounded-lg bg-slate-950">
              {Object.keys(botIdTasks).length === 0 ? (
                <div className="p-3 text-center text-slate-500">{t(lang, 'idHubEmpty')}</div>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400">
                    <tr><th className="p-2">{t(lang, 'userInfo')}</th><th className="p-2">UID / Mail</th><th className="p-2 text-center">{t(lang, 'action')}</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(botIdTasks).map(([key, row]: [string, any]) => (
                      <tr key={key} className="border-t border-slate-800">
                        <td className="p-2"><div className="font-bold text-slate-100">{row.userName}</div><div className="text-[10px] text-slate-400 font-mono">{row.userUid}</div></td>
                        <td className="p-2 text-slate-300 break-all"><div>{row.uid}</div><div className="text-[10px] text-slate-500">{row.mail}</div></td>
                        <td className="p-2 text-center space-y-1">
                          <button type="button" onClick={async () => { await copyToClipboard(formatIdRow(row)); showToast('কপি হয়েছে!', 'success'); }} className="w-full py-1 bg-sky-600 text-white font-bold rounded">Copy</button>
                          <button type="button" onClick={async () => { await remove(ref(db, `${wp('botNewIdTasks')}/${key}`)); showToast('ডিলিট হয়েছে!', 'info'); }} className="w-full py-1 bg-rose-600 text-white font-bold rounded">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </AdminCard>

          <AdminCard title="💻 " titleText={`${t(lang, 'pcClone')} (${Object.keys(pcIdTasks).length})`} accent="violet" actions={
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => handleCopyIdKind('pc')} className="px-1.5 py-0.5 bg-fuchsia-600 text-white font-bold rounded text-[9px]">{t(lang, 'copyAll')}</button>
              <button type="button" onClick={() => handleClearIdKind('pc')} className="px-1.5 py-0.5 bg-rose-600 text-white font-bold rounded text-[9px]">{t(lang, 'deleteAll')}</button>
            </div>
          }>
            <div className="max-h-64 overflow-y-auto border border-slate-700/80 rounded-lg bg-slate-950">
              {Object.keys(pcIdTasks).length === 0 ? (
                <div className="p-3 text-center text-slate-500">{t(lang, 'idHubEmpty')}</div>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400">
                    <tr><th className="p-2">{t(lang, 'userInfo')}</th><th className="p-2">UID / Mail</th><th className="p-2 text-center">{t(lang, 'action')}</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(pcIdTasks).map(([key, row]: [string, any]) => (
                      <tr key={key} className="border-t border-slate-800">
                        <td className="p-2"><div className="font-bold text-slate-100">{row.userName}</div><div className="text-[10px] text-slate-400 font-mono">{row.userUid}</div></td>
                        <td className="p-2 text-slate-300 break-all"><div>{row.uid}</div><div className="text-[10px] text-slate-500">{row.mail}</div></td>
                        <td className="p-2 text-center space-y-1">
                          <button type="button" onClick={async () => { await copyToClipboard(formatIdRow(row)); showToast('কপি হয়েছে!', 'success'); }} className="w-full py-1 bg-sky-600 text-white font-bold rounded">Copy</button>
                          <button type="button" onClick={async () => { await remove(ref(db, `${wp('pcCloneTasks')}/${key}`)); showToast('ডিলিট হয়েছে!', 'info'); }} className="w-full py-1 bg-rose-600 text-white font-bold rounded">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </AdminCard>
        </div>

        <div className="bg-gradient-to-br from-emerald-950/50 to-slate-950/90 border border-emerald-500/35 rounded-2xl p-3 sm:p-4 space-y-3">
          <h3 className="text-sm font-bold text-emerald-300">{t(lang, 'bulkGoodReport')}</h3>
          <p className="text-[10px] text-slate-400">{t(lang, 'bulkPasteHint')}</p>
          <textarea rows={6} value={idHubBulkText} onChange={(e) => setIdHubBulkText(e.target.value)} placeholder={"UID   Pass   MemberUID"} className="w-full p-2.5 bg-slate-950 border border-emerald-500/25 rounded-xl text-slate-100 text-xs font-mono min-h-[120px]" />
          <div className="flex flex-wrap items-center gap-2">
            <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${idHubBulkKind === 'bot' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
              <input type="radio" className="accent-cyan-400" checked={idHubBulkKind === 'bot'} onChange={() => setIdHubBulkKind('bot')} />
              {t(lang, 'botNewId')}
            </label>
            <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${idHubBulkKind === 'pc' ? 'bg-fuchsia-600/30 border-fuchsia-400 text-fuchsia-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
              <input type="radio" className="accent-fuchsia-400" checked={idHubBulkKind === 'pc'} onChange={() => setIdHubBulkKind('pc')} />
              {t(lang, 'pcClone')}
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-400 font-bold">
              {t(lang, 'idHubRate')}
              <input type="number" inputMode="decimal" value={idHubBulkRate || ''} onChange={(e) => setIdHubBulkRate(e.target.value === '' ? 0 : Number(e.target.value))} className="w-20 h-8 px-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs" />
            </label>
          </div>
          <button type="button" onClick={() => handleBulkProcess('good', true)} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md">
            {t(lang, 'bulkProcess')}
          </button>
        </div>

        <div className="bg-gradient-to-br from-rose-950/50 to-slate-950/90 border border-rose-500/35 rounded-2xl p-3 sm:p-4 space-y-3">
          <h3 className="text-sm font-bold text-rose-300">{t(lang, 'suspendReportTitle')}</h3>
          <p className="text-[10px] text-slate-400">{t(lang, 'bulkPasteHint')}</p>
          <textarea rows={5} value={idHubBadText} onChange={(e) => setIdHubBadText(e.target.value)} placeholder={"UID   Pass   MemberUID"} className="w-full p-2.5 bg-slate-950 border border-rose-500/25 rounded-xl text-slate-100 text-xs font-mono min-h-[100px]" />
          <button type="button" onClick={() => handleBulkProcess('suspend', true)} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white font-bold text-xs shadow-md">
            {t(lang, 'bulkProcess')}
          </button>
        </div>

        <div className="bg-slate-900/95 border border-sky-500/25 rounded-2xl p-3 space-y-2">
          <h3 className="text-xs font-bold text-sky-200">{lang === 'bn' ? 'পার্সোনাল মেসেজ' : 'Personal message'}</h3>
          <div className="flex flex-col gap-2">
            <input value={idHubPmUid} onChange={(e) => setIdHubPmUid(e.target.value)} placeholder="UID" className="w-full sm:w-40 h-9 px-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono" />
            <textarea value={idHubPmText} onChange={(e) => setIdHubPmText(e.target.value)} placeholder={lang === 'bn' ? 'মেসেজ লিখুন' : 'Write message'} rows={3} className="w-full min-h-[72px] px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs resize-y" />
            <button type="button" onClick={handleIdHubPersonalMessage} className="h-9 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold">{lang === 'bn' ? 'পাঠান' : 'Send'}</button>
          </div>
        </div>

        <div className="bg-slate-900/95 border border-slate-700 rounded-2xl p-3 space-y-2">
          <h3 className="text-xs font-bold text-slate-200">{t(lang, 'idHubMemberAccess')}</h3>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-800">
            {Object.entries(users).filter(([, u]) => u && u.uid).map(([phone, u]) => {
              const botOn = u.botNewIdAccess !== false;
              const pcOn = u.pcCloneAccess !== false;
              const masterOff = u.taskAccess === false;
              return (
                <div key={phone} className="py-1 grid grid-cols-4 items-center gap-x-1 sm:gap-x-3">
                  <div className="min-w-0 text-[10px] sm:text-[11px] font-bold text-slate-100 truncate">{u.name || '-'}{u.starred ? <span className="text-amber-400 ml-0.5">★</span> : null}</div>
                  <div className="min-w-0 text-[9px] sm:text-[10px] text-slate-400 font-mono truncate">{phone}</div>
                  <div className="flex items-center gap-0.5 min-w-0">
                    <button
                      type="button"
                      onClick={async () => { await copyToClipboard(String(u.uid || '')); showToast(lang === 'bn' ? 'UID কপি হয়েছে' : 'UID copied', 'success'); }}
                      className="h-5 px-1 sm:px-1.5 rounded bg-sky-900/40 border border-sky-500/30 text-sky-200 font-mono text-[8px] sm:text-[9px] font-bold leading-none whitespace-nowrap truncate max-w-full"
                    >
                      {u.uid}
                    </button>
                    <span className="w-5 sm:w-7 text-center text-[8px] sm:text-[9px] font-extrabold text-rose-400 shrink-0">{masterOff ? 'OFF' : ''}</span>
                  </div>
                  <div className="flex items-center justify-end gap-0.5 sm:gap-1.5">
                    <button
                      type="button"
                      onClick={() => update(ref(db, `users/${phone}`), { botNewIdAccess: !botOn })}
                      className={`h-6 sm:h-7 px-1 sm:px-2 rounded-md sm:rounded-lg text-[8px] sm:text-[10px] font-bold whitespace-nowrap ${botOn && !masterOff ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                    >
                      {botOn ? t(lang, 'botOn') : t(lang, 'botOff')}
                    </button>
                    <button
                      type="button"
                      onClick={() => update(ref(db, `users/${phone}`), { pcCloneAccess: !pcOn })}
                      className={`h-6 sm:h-7 px-1 sm:px-2 rounded-md sm:rounded-lg text-[8px] sm:text-[10px] font-bold whitespace-nowrap ${pcOn && !masterOff ? 'bg-fuchsia-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                    >
                      {pcOn ? t(lang, 'pcOn') : t(lang, 'pcOff')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {bulkModalOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-600 rounded-2xl p-4 shadow-2xl space-y-3">
              <h3 className="text-sm font-bold text-slate-100">{t(lang, 'bulkPreviewTitle')}</h3>
              {(bulkModalPhase === 'scanning' || bulkModalPhase === 'sending') && (
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-150" style={{ width: bulkModalTotal ? `${Math.round((bulkModalCurrent / bulkModalTotal) * 100)}%` : '0%' }} />
                  </div>
                  <p className="text-[11px] text-slate-300 font-medium">{bulkModalStatus}</p>
                  <p className="text-[10px] text-slate-500">{bulkModalCurrent} / {bulkModalTotal}</p>
                </div>
              )}
              {bulkModalPhase === 'confirm' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-amber-200 font-semibold">{bulkModalStatus}</p>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 border border-slate-700 rounded-xl p-2 bg-slate-950">
                    {bulkPreviewRows.map((r) => (
                      <div key={r.phoneKey + r.memberUid} className="flex items-center justify-between gap-2 text-[11px] px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-100 truncate">{r.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{r.memberUid}</div>
                        </div>
                        <div className="text-right shrink-0 font-bold">
                          <div className="text-sky-300">{r.pcs} pcs</div>
                          {bulkModalMode === 'good' && <div className="text-emerald-400">{r.amount} ৳</div>}
                          {bulkModalMode === 'suspend' && <div className="text-rose-400">Suspend</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold px-1">
                    <span className="text-slate-400">{bulkPreviewRows.reduce((s, r) => s + r.pcs, 0)} pcs</span>
                    {bulkModalMode === 'good' && <span className="text-emerald-400">{Math.round(bulkPreviewRows.reduce((s, r) => s + r.amount, 0) * 100) / 100} ৳</span>}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => { setBulkModalOpen(false); setBulkPreviewRows([]); }} className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700">{t(lang, 'btnCancel')}</button>
                    <button type="button" onClick={handleBulkConfirmSend} disabled={bulkSending} className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50">{t(lang, 'bulkConfirmSend')}</button>
                  </div>
                </div>
              )}
              {bulkModalPhase === 'done' && (
                <p className="text-sm font-bold text-emerald-400 text-center py-3">{bulkModalStatus}</p>
              )}
            </div>
          </div>
        )}

        <SerialCopyModal
          isOpen={serialModalOpen}
          onClose={() => setSerialModalOpen(false)}
          title={serialModalTitle}
          lines={serialModalLines}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-2 sm:p-4 space-y-2.5 text-xs relative">
      {/* Single Admin button — Password & Dashboard inside */}
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => { setShowMembersEdit(true); setShowIdHub(false); }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 shadow-sm bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-200"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>{t(lang, 'membersEdit')}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowIdHub(true)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 shadow-sm ${
            showIdHub
              ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
              : 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-300'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>{t(lang, 'idHub')}</span>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAdminMenu((v) => !v)}
            className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold border border-amber-500/30 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>{t(lang, 'adminPanel')}</span>
          </button>
          {showAdminMenu && (
            <div className="absolute right-0 top-full mt-1.5 z-30 min-w-[190px] rounded-xl border border-amber-500/30 bg-slate-950 shadow-xl p-1.5 space-y-1">
              <button
                type="button"
                onClick={() => { setShowPassModal(true); setShowAdminMenu(false); }}
                className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-amber-200 hover:bg-amber-500/15 flex items-center gap-2"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {t(lang, 'adminPassword')}
              </button>
              <button
                type="button"
                onClick={() => { setShowPermitModal(true); setShowAdminMenu(false); }}
                className="w-full px-3 py-2 rounded-lg text-left text-xs font-semibold text-cyan-200 hover:bg-cyan-500/15 flex items-center gap-2"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {t(lang, 'permitCodes')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Admin Password Change Modal Popup */}
      <AnimatePresence>
  
      {showPermitModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowPermitModal(false)}>
          <div className="w-full max-w-sm bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-cyan-200">{t(lang, 'permitCodes')}</h3>
              <button type="button" onClick={() => setShowPermitModal(false)} className="text-slate-400 text-xs font-bold">✕</button>
            </div>
            <button type="button" onClick={handleGeneratePermit} className="w-full h-9 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold">{t(lang, 'generatePermit')}</button>
            <div className="max-h-56 overflow-y-auto space-y-1.5">
              {Object.keys(permitCodes).filter((k) => !permitCodes[k]?.used).length === 0 ? (
                <div className="text-center text-slate-500 text-[11px] py-3">{t(lang, 'noPermitCodes')}</div>
              ) : Object.keys(permitCodes).filter((k) => !permitCodes[k]?.used).map((code) => (
                <div key={code} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="flex-1 font-mono text-[11px] text-cyan-200">{code}</span>
                  <button type="button" onClick={async () => { const ok = await copyToClipboard(code); showToast(ok ? 'Copied' : 'Fail', ok ? 'success' : 'error'); }} className="h-7 px-2 rounded-md bg-sky-700 text-white text-[10px] font-bold">Copy</button>
                  <button type="button" onClick={() => remove(ref(db, `${wp('memberPermits')}/${code}`))} className="h-7 px-2 rounded-md bg-rose-700 text-white text-[10px] font-bold">Del</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPassModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-amber-500/40 p-4 sm:p-5 rounded-2xl max-w-md w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <KeyRound className="w-4 h-4" />
                  <span>{t(lang, 'adminPasswordChange')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                বর্তমান পাসওয়ার্ড: <span className="font-mono text-amber-400 font-bold">{currentAdminPass}</span>
              </div>

              <form onSubmit={handleChangeAdminPass} className="space-y-3">
                <input
                  type="text"
                  value={adminPassInput}
                  onChange={(e) => setAdminPassInput(e.target.value)}
                  placeholder={t(lang, 'enterNewAdminPass')}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-amber-500"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPassModal(false)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-amber-500/20"
                  >
                    পাসওয়ার্ড আপডেট করুন
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Broadcast Message Box */}
      <div className="bg-slate-900/90 border border-violet-500/30 p-2.5 rounded-2xl shadow-sm">
        <form onSubmit={handleSendGlobalMessage} className="flex items-center gap-2">
          <textarea
            rows={2}
            value={globalMessage}
            onChange={(e) => setGlobalMessage(e.target.value)}
            placeholder={t(lang, 'broadcastPlaceholder')}
            className="px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-violet-500 flex-1 min-w-0 min-h-[52px] resize-y"
          />
          <button
            type="submit"
            className="h-10 px-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs shrink-0 transition-all shadow-md shadow-violet-500/20 flex items-center justify-center gap-1"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{t(lang, 'broadcastSend')}</span>
          </button>
        </form>
      </div>

      {/* System Switches Controls Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <ControlToggleBox
          title={t(lang, 'newJobStatus')}
          isOn={settings.newJob}
          onToggle={() => toggleJobSystem('new')}
          lang={lang}
        />
        <ControlToggleBox
          title={t(lang, 'oldJobStatus')}
          isOn={settings.oldJob}
          onToggle={() => toggleJobSystem('old')}
          lang={lang}
        />
        <ControlToggleBox
          title={t(lang, 'pageCreateStatus')}
          isOn={settings?.pageCreate !== false}
          onToggle={() => toggleJobSystem('page')}
          lang={lang}
        />
        <ControlToggleBox
          title={t(lang, 'withdrawStatus')}
          isOn={settings.withdraw}
          onToggle={toggleWithdrawSystem}
          lang={lang}
        />
      </div>

      {/* Revoked Accounts List Section */}
      <AdminCard
        title="↩️ "
        titleText={`${t(lang, 'revokedAccounts')} (${revokedCount} টি)`}
        accent="amber"
        actions={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setHideRevokedSec(!hideRevokedSec)}
              className="px-2 py-1 bg-amber-800/40 hover:bg-amber-700/40 text-amber-200 border border-amber-500/30 rounded font-semibold text-[11px] flex items-center gap-1"
            >
              {hideRevokedSec ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
            <button
              onClick={handleCopyAllRevoked}
              className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded font-bold text-[11px] flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              {t(lang, 'copyAll')}
            </button>
            <button
              onClick={handleClearRevoked}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold text-[11px] flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              {t(lang, 'deleteAll')}
            </button>
          </div>
        }
      >
        {!hideRevokedSec && (
          <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950 p-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold">
                  <th className="p-2">{t(lang, 'userInfo')}</th>
                  <th className="p-2">{t(lang, 'taskDetails')}</th>
                  <th className="p-2 text-center">{t(lang, 'action')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(revokedTasks).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-3 text-center text-slate-500">
                      কোনো কাজ ফেরত নেওয়া হয়নি।
                    </td>
                  </tr>
                ) : (
                  Object.keys(revokedTasks).reverse().map((key) => {
                    const item = revokedTasks[key];
                    return (
                      <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                        <td className="p-2">
                          <span className="font-bold text-slate-200">{item.userName}</span>
                          <div className="text-[10px] text-slate-400">{item.userUid}</div>
                        </td>
                        <td className="p-2">
                          <div className="p-2 bg-slate-900 rounded border border-slate-800 text-[11px] text-slate-300">
                            <div className="font-bold text-amber-400 mb-1">{item.jobType}</div>
                            {item.jobType === 'New Job' ? (
                              <div className="space-y-0.5 text-[10px] font-mono text-slate-300">
                                <div><b>First Name:</b> {item.fullDetails?.fn || '-'} | <b>Last Name:</b> {item.fullDetails?.ln || '-'}</div>
                                <div><b>Full Name:</b> {item.fullDetails?.fuln || '-'}</div>
                                <div><b>Gender:</b> {item.fullDetails?.gen || '-'} | <b>State:</b> {item.fullDetails?.st || '-'} | <b>DOB:</b> {item.fullDetails?.dob || '-'}</div>
                                <div><b>Checker:</b> {item.fullDetails?.checker || '-'} | <b>Listing:</b> {item.fullDetails?.listing || '-'}</div>
                                <div><b>Phone:</b> {item.phone || item.fullDetails?.phone || '-'}</div>
                                <div className="truncate max-w-xs"><b>Inbox:</b> {item.inbox || item.fullDetails?.inbox || '-'}</div>
                              </div>
                            ) : (
                              <div className="space-y-0.5 text-[10px] font-mono text-slate-300">
                                <div><b>Phone:</b> {item.phone || item.fullDetails?.phone || '-'}</div>
                                <div className="truncate max-w-xs"><b>Inbox:</b> {item.inbox || item.fullDetails?.inbox || '-'}</div>
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 mt-1 block">{item.time}</span>
                        </td>
                        <td className="p-2 text-center space-y-1">
                          <button
                            onClick={async () => {
                              const d = item.fullDetails || ({} as SheetTask);
                              const fn = d.fn || '';
                              const ln = d.ln || '';
                              const fuln = d.fuln || '';
                              const gen = d.gen || '';
                              const st = d.st || '';
                              const dob = d.dob || '';
                              const checker = d.checker || '';
                              const listing = d.listing || '';
                              const phone = item.phone || d.phone || '';
                              const inbox = item.inbox || d.inbox || '';

                              let copyText = '';
                              if (item.jobType === 'New Job') {
                                copyText = `${item.userName}\t${item.userUid}\t${item.jobType}\t${fn}\t${ln}\t${fuln}\t${gen}\t${st}\t${dob}\t${checker}\t${listing}\t${phone}\t${inbox}\t${item.time}`;
                              } else {
                                copyText = `${item.userName}\t${item.userUid}\t${item.jobType}\t${phone}\t${inbox}\t${item.time}`;
                              }
                              await copyToClipboard(copyText);
                              showToast('সম্পূর্ণ তথ্য কপি হয়েছে!', 'success');
                            }}
                            className="w-full py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded"
                          >
                            Copy
                          </button>
                          <button
                            onClick={async () => {
                              await remove(ref(db, `${wp('revokedTasks')}/${key}`));
                              showToast('ডিলিট হয়েছে!', 'info');
                            }}
                            className="w-full py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* 3 Job Types: Bad + Success boxes — compact grid */}
      <div className="space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-0.5">{t(lang, 'labelNewJob')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <AdminCard title="⚠️" titleText={`${t(lang, 'shortBad')} · ${t(lang, 'labelNewJob')} (${newReportedCount})`} accent="violet"
            actions={
              <div className="flex items-center gap-0.5">
                <button onClick={() => setHideNewRepSec(!hideNewRepSec)} className="p-1 bg-violet-800/40 text-violet-200 rounded">{hideNewRepSec ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
                <button onClick={() => handleCopyReportedByType('New Job')} className="px-1.5 py-0.5 bg-violet-600 text-white font-bold rounded text-[9px]">{t(lang, 'copyAll')}</button>
                <button onClick={() => handleClearReportedByType('New Job')} className="px-1.5 py-0.5 bg-rose-600 text-white font-bold rounded text-[9px]">{t(lang, 'deleteAll')}</button>
              </div>
            }
          >
            {!hideNewRepSec && <TaskReportedTable tasks={safeReported} filterType="New Job" lang={lang} showToast={showToast} />}
          </AdminCard>
          <AdminCard title="✅" titleText={`${t(lang, 'shortSuccess')} · ${t(lang, 'labelNewJob')} (${newSubmittedCount})`} accent="violet"
            actions={
              <div className="flex items-center gap-0.5">
                <button onClick={() => setHideNewSubSec(!hideNewSubSec)} className="p-1 bg-violet-800/40 text-violet-200 rounded">{hideNewSubSec ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
                <button onClick={() => handleCopySubmittedByType('New Job')} className="px-1.5 py-0.5 bg-violet-600 text-white font-bold rounded text-[9px]">{t(lang, 'copyAll')}</button>
                <button onClick={() => handleClearSubmittedByType('New Job')} className="px-1.5 py-0.5 bg-rose-600 text-white font-bold rounded text-[9px]">{t(lang, 'deleteAll')}</button>
              </div>
            }
          >
            {!hideNewSubSec && <TaskSubmittedTable tasks={submittedTasks} filterType="New Job" lang={lang} showToast={showToast} />}
          </AdminCard>
        </div>

        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-0.5">{t(lang, 'labelOldJob')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <AdminCard title="⚠️" titleText={`${t(lang, 'shortBad')} · ${t(lang, 'labelOldJob')} (${oldReportedCount})`} accent="orange"
            actions={
              <div className="flex items-center gap-0.5">
                <button onClick={() => setHideOldRepSec(!hideOldRepSec)} className="p-1 bg-orange-800/40 text-orange-200 rounded">{hideOldRepSec ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
                <button onClick={() => handleCopyReportedByType('Old Job')} className="px-1.5 py-0.5 bg-orange-600 text-white font-bold rounded text-[9px]">{t(lang, 'copyAll')}</button>
                <button onClick={() => handleClearReportedByType('Old Job')} className="px-1.5 py-0.5 bg-rose-600 text-white font-bold rounded text-[9px]">{t(lang, 'deleteAll')}</button>
              </div>
            }
          >
            {!hideOldRepSec && <TaskReportedTable tasks={safeReported} filterType="Old Job" lang={lang} showToast={showToast} />}
          </AdminCard>
          <AdminCard title="✅" titleText={`${t(lang, 'shortSuccess')} · ${t(lang, 'labelOldJob')} (${oldSubmittedCount})`} accent="orange"
            actions={
              <div className="flex items-center gap-0.5">
                <button onClick={() => setHideOldSubSec(!hideOldSubSec)} className="p-1 bg-orange-800/40 text-orange-200 rounded">{hideOldSubSec ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
                <button onClick={() => handleCopySubmittedByType('Old Job')} className="px-1.5 py-0.5 bg-orange-600 text-white font-bold rounded text-[9px]">{t(lang, 'copyAll')}</button>
                <button onClick={() => handleClearSubmittedByType('Old Job')} className="px-1.5 py-0.5 bg-rose-600 text-white font-bold rounded text-[9px]">{t(lang, 'deleteAll')}</button>
              </div>
            }
          >
            {!hideOldSubSec && <TaskSubmittedTable tasks={submittedTasks} filterType="Old Job" lang={lang} showToast={showToast} />}
          </AdminCard>
        </div>

        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-0.5">{t(lang, 'labelPageCreate')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <AdminCard title="⚠️" titleText={`${t(lang, 'shortBad')} · ${t(lang, 'labelPageCreate')} (${pageReportedCount})`} accent="emerald"
            actions={
              <div className="flex items-center gap-0.5">
                <button onClick={() => setHidePageRepSec(!hidePageRepSec)} className="p-1 bg-emerald-800/40 text-emerald-200 rounded">{hidePageRepSec ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
                <button onClick={() => handleCopyReportedByType('Page Create')} className="px-1.5 py-0.5 bg-emerald-600 text-white font-bold rounded text-[9px]">{t(lang, 'copyAll')}</button>
                <button onClick={() => handleClearReportedByType('Page Create')} className="px-1.5 py-0.5 bg-rose-600 text-white font-bold rounded text-[9px]">{t(lang, 'deleteAll')}</button>
              </div>
            }
          >
            {!hidePageRepSec && <TaskReportedTable tasks={safeReported} filterType="Page Create" lang={lang} showToast={showToast} />}
          </AdminCard>
          <AdminCard title="✅" titleText={`${t(lang, 'shortSuccess')} · ${t(lang, 'labelPageCreate')} (${pageSubmittedCount})`} accent="emerald"
            actions={
              <div className="flex items-center gap-0.5">
                <button onClick={() => setHidePageSubSec(!hidePageSubSec)} className="p-1 bg-emerald-800/40 text-emerald-200 rounded">{hidePageSubSec ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
                <button onClick={() => handleCopySubmittedByType('Page Create')} className="px-1.5 py-0.5 bg-emerald-600 text-white font-bold rounded text-[9px]">{t(lang, 'copyAll')}</button>
                <button onClick={() => handleClearSubmittedByType('Page Create')} className="px-1.5 py-0.5 bg-rose-600 text-white font-bold rounded text-[9px]">{t(lang, 'deleteAll')}</button>
              </div>
            }
          >
            {!hidePageSubSec && <TaskSubmittedTable tasks={submittedTasks} filterType="Page Create" lang={lang} showToast={showToast} />}
          </AdminCard>
        </div>
      </div>

      {/* Live Active Tasks — 3 jobs side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <AdminCard title="⚡" titleText={`${t(lang, 'liveNew')} (${Object.keys(activeNewTasks).length})`} accent="violet">
          <ActiveLiveTable activeTasks={activeNewTasks} jobType="new" onRevoke={handleRevokeActiveTask} lang={lang} />
        </AdminCard>
        <AdminCard title="⚡" titleText={`${t(lang, 'liveOld')} (${Object.keys(activeOldTasks).length})`} accent="orange">
          <ActiveLiveTable activeTasks={activeOldTasks} jobType="old" onRevoke={handleRevokeActiveTask} lang={lang} />
        </AdminCard>
        <AdminCard title="⚡" titleText={`${t(lang, 'livePage')} (${Object.keys(activePageTasks).length})`} accent="emerald">
          <ActiveLiveTable activeTasks={activePageTasks} jobType="page" onRevoke={handleRevokeActiveTask} lang={lang} />
        </AdminCard>
      </div>

      {/* User Balance Control */}
      <AdminCard title="💰 " titleText={t(lang, 'balanceControl')} accent="emerald">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 items-end pt-2">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-slate-400 leading-none">User ID (UID)</label>
            <input
              type="text"
              value={balTargetUid}
              onChange={(e) => setBalTargetUid(e.target.value)}
              placeholder="UID-849201"
              className="w-full h-10 px-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-slate-400 leading-none">{t(lang, 'amount')}</label>
            <input
              type="number"
              inputMode="decimal"
              value={balAmount || ''}
              onChange={(e) => {
                const v = e.target.value;
                setBalAmount(v === '' ? 0 : Number(v));
              }}
              placeholder="Amount"
              className="w-full h-10 px-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-sm"
            />
          </div>
          <div className="flex gap-2 items-end">
            <button type="button" onClick={() => handleModifyBalance('add')} className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-500 font-bold text-white rounded-lg text-xs">
              {t(lang, 'addBalance')}
            </button>
            <button type="button" onClick={() => handleModifyBalance('deduct')} className="flex-1 h-10 bg-rose-600 hover:bg-rose-500 font-bold text-white rounded-lg text-xs">
              {t(lang, 'deductBalance')}
            </button>
          </div>
        </div>
      </AdminCard>

      {/* Bulk Good Report + Suspend Report */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Good report */}
        <div className="bg-gradient-to-br from-emerald-950/50 to-slate-950/90 border border-emerald-500/35 rounded-2xl p-3 sm:p-4 space-y-3 shadow-lg shadow-emerald-900/10">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-base">✅</span>
              {t(lang, 'bulkGoodReport')}
            </h3>
          </div>
          <p className="text-[10px] text-slate-400">{t(lang, 'bulkPasteHint')}</p>
          <textarea
            rows={6}
            value={bulkGoodText}
            onChange={(e) => setBulkGoodText(e.target.value)}
            placeholder={"UID   Pass   MemberUID"}
            className="w-full p-2.5 bg-slate-950 border border-emerald-500/25 rounded-xl text-slate-100 text-xs font-mono focus:outline-none focus:border-emerald-400 resize-y min-h-[120px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${bulkGoodJob === 'new' ? 'bg-sky-600/30 border-sky-400 text-sky-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
              <input type="radio" name="bulkGoodJob" className="accent-sky-400" checked={bulkGoodJob === 'new'} onChange={() => setBulkGoodJob('new')} />
              New
            </label>
            <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${bulkGoodJob === 'old' ? 'bg-violet-600/30 border-violet-400 text-violet-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
              <input type="radio" name="bulkGoodJob" className="accent-violet-400" checked={bulkGoodJob === 'old'} onChange={() => setBulkGoodJob('old')} />
              Old
            </label>
            <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${bulkGoodJob === 'page' ? 'bg-teal-600/30 border-teal-400 text-teal-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
              <input type="radio" name="bulkGoodJob" className="accent-teal-400" checked={bulkGoodJob === 'page'} onChange={() => setBulkGoodJob('page')} />
              Page
            </label>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] text-slate-400 font-semibold">Rate</span>
              <input
                type="number"
                step="0.1"
                value={bulkGoodRate || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setBulkGoodRate(v === '' ? 0 : Number(v));
                }}
                className="w-20 p-1.5 bg-slate-950 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs font-bold text-center"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleBulkProcess('good')}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-900/30"
          >
            {t(lang, 'bulkProcess')}
          </button>
        </div>

        {/* Suspend report */}
        <div className="bg-gradient-to-br from-rose-950/50 to-slate-950/90 border border-rose-500/40 rounded-2xl p-3 sm:p-4 space-y-3 shadow-lg shadow-rose-900/15">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-base">⛔</span>
              {t(lang, 'bulkSuspendReport')}
            </h3>
          </div>
          <p className="text-[10px] text-slate-400">{t(lang, 'bulkPasteHint')}</p>
          <textarea
            rows={6}
            value={bulkSuspendText}
            onChange={(e) => setBulkSuspendText(e.target.value)}
            placeholder={"UID   Pass   MemberUID"}
            className="w-full p-2.5 bg-slate-950 border border-rose-500/25 rounded-xl text-slate-100 text-xs font-mono focus:outline-none focus:border-rose-400 resize-y min-h-[120px]"
          />
          <p className="text-[10px] text-rose-300/80 font-semibold">
            {lang === 'bn' ? 'রেট নেই — লাল সাসপেন্ড মেসেজ হিসেবে যাবে' : 'No rate — sent as red Suspend message'}
          </p>
          <button
            type="button"
            onClick={() => handleBulkProcess('suspend')}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white font-bold text-xs shadow-md shadow-rose-900/30"
          >
            {t(lang, 'bulkProcess')}
          </button>
        </div>
      </div>

      <AdminCard
        title="👥 "
        titleText={t(lang, 'userList')}
        accent="sky"
        actions={
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span
              className="px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[9px] sm:text-[11px] font-bold whitespace-nowrap"
              title={t(lang, 'totalBalanceAll')}
            >
              {lang === 'bn' ? 'মোট' : 'Bal'} {totalUsersBalance}
              <span className="sm:hidden">৳</span>
              <span className="hidden sm:inline"> Tk</span>
            </span>
            <button onClick={() => setHideUserListSec(!hideUserListSec)} className="px-2 py-1 bg-sky-800/40 text-sky-200 rounded">
              {hideUserListSec ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
            <button onClick={handleResetAllUsersTasks} className="px-2.5 py-1 bg-amber-600 text-white font-bold rounded">
              {t(lang, 'resetAllZero')}
            </button>
          </div>
        }
      >
        {!hideUserListSec && (
          <div
            key={`users-${layoutTick}`}
            data-reflow-scroll="1"
            className="max-h-[28rem] sm:max-h-[36rem] min-h-0 overflow-y-auto overflow-x-hidden space-y-2 pr-0.5"
          >
            {Object.keys(users).length === 0 ? (
              <div className="p-3 text-center text-slate-500 text-[11px]">{t(lang, 'noUsers')}</div>
            ) : (
              Object.keys(users).map((phoneKey) => {
                const u = users[phoneKey];
                const taskAccessOn = u.taskAccess !== false;
                const newJobAccessOn = u.newJobAccess !== false;
                const oldJobAccessOn = u.oldJobAccess !== false;
                const pageCreateAccessOn = u.pageCreateAccess !== false;
                return (
                  <div
                    key={phoneKey}
                    className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1"
                  >
                    <div className="flex flex-col sm:grid sm:grid-cols-[8.2rem_6.6rem_3.1rem_minmax(0,1fr)_4.3rem_3.4rem_auto] sm:items-center sm:gap-x-2 gap-0.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="font-bold text-slate-100 text-xs truncate">{u.name || '-'}{u.starred ? <span className="text-amber-400 ml-0.5">★</span> : null}</div>
                          <div className="sm:hidden text-[10px] text-slate-500 font-mono truncate">{phoneKey}</div>
                          <button
                            type="button"
                            title="UID copy"
                            onClick={async () => {
                              const uidVal = String(u.uid || '').trim();
                              if (!uidVal) { showToast('UID empty!', 'error'); return; }
                              const ok = await copyToClipboard(uidVal);
                              showToast(ok ? `UID copied: ${uidVal}` : 'Copy failed!', ok ? 'success' : 'error');
                            }}
                            className="sm:hidden ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-900/40 border border-sky-500/30 text-sky-200 font-mono text-[10px] font-bold shrink-0"
                          >
                            {u.uid || '-'}
                          </button>
                        </div>
                        <div className="hidden sm:block text-[10px] text-slate-500 font-mono truncate leading-tight">{phoneKey}</div>
                      </div>
                      <button
                        type="button"
                        title="UID copy"
                        onClick={async () => {
                          const uidVal = String(u.uid || '').trim();
                          if (!uidVal) { showToast('UID empty!', 'error'); return; }
                          const ok = await copyToClipboard(uidVal);
                          showToast(ok ? `UID copied: ${uidVal}` : 'Copy failed!', ok ? 'success' : 'error');
                        }}
                        className="hidden sm:inline-flex h-5 items-center px-1.5 rounded bg-sky-900/40 border border-sky-500/30 text-sky-200 font-mono text-[9px] font-bold leading-none whitespace-nowrap w-fit"
                      >
                        {u.uid || '-'}
                      </button>
                      <div className="hidden sm:block font-extrabold text-amber-300 text-xs whitespace-nowrap">{u.completedTasks || 0} pcs</div>
                      <div className="min-w-0">
                        <div className="sm:hidden text-center text-[11px] font-bold text-slate-300 leading-none py-0.5">
                          Bot={u.completedBotNewIds || 0} · PC={u.completedPcClones || 0}
                        </div>
                        <div className="flex items-center justify-center sm:justify-start gap-x-2 whitespace-nowrap">
                          <span className="sm:hidden font-extrabold text-amber-300 text-sm">{u.completedTasks || 0} pcs</span>
                          <span className="text-[10px] sm:text-[11px] font-bold text-slate-300">
                            New={u.completedNewTasks || 0} · Old={u.completedOldTasks || 0} · Page={u.completedPageCreateTasks || u.completedPageTasks || 0}
                            <span className="hidden sm:inline"> · Bot={u.completedBotNewIds || 0} · PC={u.completedPcClones || 0}</span>
                          </span>
                          <span className="sm:hidden font-bold text-emerald-400 text-sm">{u.balance || 0} ৳</span>
                        </div>
                      </div>
                      <div className="hidden sm:block font-bold text-emerald-400 text-xs whitespace-nowrap text-right">
                        {u.balance || 0} Tk
                      </div>
                      <div className="hidden sm:flex items-center justify-center min-h-[20px]">
                        {!u.isApproved ? (
                          <button onClick={() => handleApproveUser(phoneKey)} className="px-1.5 py-0.5 bg-emerald-600 text-white font-bold rounded text-[9px]">{t(lang, 'approveUser')}</button>
                        ) : (
                          <span className="w-8" />
                        )}
                      </div>

                      {/* Right: task system on/off */}
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-1 shrink-0">
                        {!u.isApproved && (
                          <button onClick={() => handleApproveUser(phoneKey)} className="sm:hidden px-1.5 py-0.5 bg-emerald-600 text-white font-bold rounded text-[9px]">{t(lang, 'approveUser')}</button>
                        )}
                        <button
                          onClick={() => handleToggleUserTaskAccess(phoneKey)}
                          className={`px-1.5 py-0.5 font-bold rounded text-[9px] text-white ${taskAccessOn ? 'bg-rose-600' : 'bg-emerald-600'}`}
                        >
                          {taskAccessOn ? t(lang, 'taskOff') : t(lang, 'taskOn')}
                        </button>
                        <button
                          onClick={() => handleToggleNewJobAccess(phoneKey)}
                          title={t(lang, 'labelNewJob')}
                          className={`px-1.5 py-0.5 font-bold rounded text-[9px] text-white ${newJobAccessOn ? 'bg-rose-600' : 'bg-sky-600'}`}
                        >
                          {newJobAccessOn ? t(lang, 'newOff') : t(lang, 'newOn')}
                        </button>
                        <button
                          onClick={() => handleToggleOldJobAccess(phoneKey)}
                          title={t(lang, 'labelOldJob')}
                          className={`px-1.5 py-0.5 font-bold rounded text-[9px] text-white ${oldJobAccessOn ? 'bg-rose-600' : 'bg-violet-600'}`}
                        >
                          {oldJobAccessOn ? t(lang, 'oldOff') : t(lang, 'oldOn')}
                        </button>
                        <button
                          onClick={() => handleTogglePageCreateAccess(phoneKey)}
                          title={t(lang, 'labelPageCreate')}
                          className={`px-1.5 py-0.5 font-bold rounded text-[9px] text-white ${pageCreateAccessOn ? 'bg-rose-600' : 'bg-emerald-600'}`}
                        >
                          {pageCreateAccessOn ? t(lang, 'pageOff') : t(lang, 'pageOn')}
                        </button>
                        <button onClick={() => handleResetUserTasks(phoneKey)} className="px-1.5 py-0.5 bg-amber-600 text-white font-bold rounded text-[9px]">{t(lang, 'resetZero')}</button>
                        <button onClick={() => handleDeleteUser(phoneKey)} className="px-1.5 py-0.5 bg-rose-700 text-white font-bold rounded text-[9px]">{t(lang, 'deleteUser')}</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </AdminCard>



      {/* Bulk Upload Systems for New & Old Job */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Bulk New Job Upload */}
        <AdminCard title="📄 " titleText={t(lang, 'addJobSheet')} accent="violet">
          <div className="space-y-2.5">
            {/* Stock Count Banner */}
            <div className="p-2 bg-slate-950 border border-violet-500/30 rounded-xl flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-violet-400" />
                বর্তমান উপলব্ধ নিউ জব স্টক:
              </span>
              <span className="font-bold text-violet-300 bg-violet-900/50 px-2.5 py-0.5 rounded text-[11px] border border-violet-500/30">
                {Object.keys(stockNewTasks).length} পিস
              </span>
            </div>

            {/* Direct Google Sheet / File Upload Button */}
            <label className="cursor-pointer p-2.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-200 rounded-xl font-bold flex items-center justify-center gap-2 text-xs transition-colors w-full">
              <Upload className="w-4 h-4 text-violet-400" />
              <span>গুগল শীট / ফাইল আপলোড করুন (.csv, .tsv)</span>
              <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUploadNewJob} className="hidden" />
            </label>

            <form onSubmit={handleBulkAddJob} className="space-y-2">
              <textarea
                rows={3}
                value={bulkNewInput}
                onChange={(e) => setBulkNewInput(e.target.value)}
                placeholder="অথবা সরাসরি ডাটা পেস্ট করুন (Google Sheet TSV/CSV)..."
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[11px]"
              />

              {bulkNewInput.trim() && (
                <div className="p-2 bg-slate-950 border border-violet-500/40 rounded-lg text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      লাইভ গণনাকৃত ডাটা: {liveNewStats.validCount} টি কাজ পাওয়া গেছে
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      মোট লাইন: {liveNewStats.totalLines}
                    </span>
                  </div>
                  {liveNewStats.headerCount > 0 && (
                    <div className="text-amber-400 text-[10px]">
                      ⚠️ {liveNewStats.headerCount} টি হেডার/বাতিল লাইন বাদ দেওয়া হয়েছে
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  id="replaceNewStock"
                  checked={replaceNewStock}
                  onChange={(e) => setReplaceNewStock(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-violet-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="replaceNewStock" className="text-[11px] text-slate-300 cursor-pointer">
                  আগের স্টক মুছে নতুন {liveNewStats.validCount ? `${liveNewStats.validCount} টি` : ''} জব বসান
                </label>
              </div>

              <button type="submit" className="w-full py-2 bg-violet-600 hover:bg-violet-500 font-bold text-white rounded">
                {replaceNewStock ? 'নতুন স্টক দিয়ে রিপ্লেস করুন' : t(lang, 'addJobBtn')}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={handleCopyUploadedNewJobs}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded text-[11px] flex items-center gap-1"
                title="স্টকে থাকা সব জব কপি করুন"
              >
                <Copy className="w-3 h-3" />
                স্টক কপি ({Object.keys(stockNewTasks).length} পিস)
              </button>
              <button
                type="button"
                onClick={handleClearUploadedNewJobs}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-[11px] flex items-center gap-1"
                title="স্টকে থাকা সব জব মুছে ফেলুন"
              >
                <Trash2 className="w-3 h-3" />
                স্টক মুছুন
              </button>
              <button
                type="button"
                onClick={() => setShowStockNewList(!showStockNewList)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded text-[11px]"
              >
                {showStockNewList ? 'লুকান' : 'লিস্ট দেখুন'}
              </button>
            </div>
          </div>

          {showStockNewList && (
            <div className="mt-2 max-h-40 overflow-y-auto bg-slate-950 p-2 rounded border border-slate-800 space-y-1">
              {Object.keys(stockNewTasks).length === 0 ? (
                <div className="text-[11px] text-slate-500 text-center py-2">কোনো নিউ জব স্টকে নেই</div>
              ) : (
                getOrderedStockNewTasks().map(({ key: k, ...item }) => {
                  return (
                    <div key={k} className="flex justify-between items-center p-1.5 bg-slate-900 rounded text-[10px] gap-2">
                      <span className="truncate">{item.fuln || item.fn || 'Job'} ({item.phone})</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            copyToClipboard(getFormattedNewJobLine(item));
                            showToast('কপি হয়েছে!', 'success');
                          }}
                          className="px-1.5 py-0.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await remove(ref(db, `${wp('sheetTasks')}/${k}`));
                            showToast('মোছা হয়েছে!', 'info');
                          }}
                          className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </AdminCard>

        {/* Bulk Old Job Upload */}
        <AdminCard title="📄 " titleText={t(lang, 'addOldJobSheet')} accent="orange">
          <div className="space-y-2.5">
            {/* Stock Count Banner */}
            <div className="p-2 bg-slate-950 border border-orange-500/30 rounded-xl flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-orange-400" />
                বর্তমান উপলব্ধ ওল্ড জব স্টক:
              </span>
              <span className="font-bold text-orange-300 bg-orange-900/50 px-2.5 py-0.5 rounded text-[11px] border border-orange-500/30">
                {Object.keys(stockOldTasks).length} পিস
              </span>
            </div>

            {/* Direct Google Sheet / File Upload Button */}
            <label className="cursor-pointer p-2.5 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-orange-200 rounded-xl font-bold flex items-center justify-center gap-2 text-xs transition-colors w-full">
              <Upload className="w-4 h-4 text-orange-400" />
              <span>গুগল শীট / ফাইল আপলোড করুন (.csv, .tsv)</span>
              <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUploadOldJob} className="hidden" />
            </label>

            <form onSubmit={handleBulkAddOldJob} className="space-y-2">
              <textarea
                rows={3}
                value={bulkOldInput}
                onChange={(e) => setBulkOldInput(e.target.value)}
                placeholder="অথবা সরাসরি ফোন ও ইনবক্স লিংক পেস্ট করুন..."
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[11px]"
              />

              {bulkOldInput.trim() && (
                <div className="p-2 bg-slate-950 border border-orange-500/40 rounded-lg text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      লাইভ গণনাকৃত ডাটা: {liveOldStats.validCount} টি কাজ পাওয়া গেছে
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      মোট লাইন: {liveOldStats.totalLines}
                    </span>
                  </div>
                  {liveOldStats.headerCount > 0 && (
                    <div className="text-amber-400 text-[10px]">
                      ⚠️ {liveOldStats.headerCount} টি হেডার/বাতিল লাইন বাদ দেওয়া হয়েছে
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  id="replaceOldStock"
                  checked={replaceOldStock}
                  onChange={(e) => setReplaceOldStock(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-orange-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="replaceOldStock" className="text-[11px] text-slate-300 cursor-pointer">
                  আগের স্টক মুছে নতুন {liveOldStats.validCount ? `${liveOldStats.validCount} টি` : ''} জব বসান
                </label>
              </div>

              <button type="submit" className="w-full py-2 bg-orange-600 hover:bg-orange-500 font-bold text-white rounded">
                {replaceOldStock ? 'নতুন স্টক দিয়ে রিপ্লেস করুন' : t(lang, 'addJobBtn')}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={handleCopyUploadedOldJobs}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded text-[11px] flex items-center gap-1"
                title="স্টকে থাকা সব ওল্ড জব কপি করুন"
              >
                <Copy className="w-3 h-3" />
                স্টক কপি ({Object.keys(stockOldTasks).length} পিস)
              </button>
              <button
                type="button"
                onClick={handleClearUploadedOldJobs}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-[11px] flex items-center gap-1"
                title="স্টকে থাকা সব ওল্ড জব মুছে ফেলুন"
              >
                <Trash2 className="w-3 h-3" />
                স্টক মুছুন
              </button>
              <button
                type="button"
                onClick={() => setShowStockOldList(!showStockOldList)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded text-[11px]"
              >
                {showStockOldList ? 'লুকান' : 'লিস্ট দেখুন'}
              </button>
            </div>
          </div>

          {showStockOldList && (
            <div className="mt-2 max-h-40 overflow-y-auto bg-slate-950 p-2 rounded border border-slate-800 space-y-1">
              {Object.keys(stockOldTasks).length === 0 ? (
                <div className="text-[11px] text-slate-500 text-center py-2">কোনো ওল্ড জব স্টকে নেই</div>
              ) : (
                getOrderedStockOldTasks().map(({ key: k, ...item }) => {
                  return (
                    <div key={k} className="flex justify-between items-center p-1.5 bg-slate-900 rounded text-[10px] gap-2">
                      <span className="truncate">{item.phone}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            copyToClipboard(item.rawLine || `${item.phone || ''}\t${item.inbox || ''}`);
                            showToast('কপি হয়েছে!', 'success');
                          }}
                          className="px-1.5 py-0.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await remove(ref(db, `${wp('oldSheetTasks')}/${k}`));
                            showToast('মোছা হয়েছে!', 'info');
                          }}
                          className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </AdminCard>

        {/* Bulk Page Create Upload */}
        <AdminCard title="📄 " titleText={t(lang, 'addPageCreateSheet')} accent="emerald">
          <div className="space-y-2.5">
            <div className="p-2 bg-slate-950 border border-emerald-500/30 rounded-xl flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                বর্তমান উপলব্ধ পেজ তৈরি স্টক:
              </span>
              <span className="font-bold text-emerald-300 bg-emerald-900/50 px-2.5 py-0.5 rounded text-[11px] border border-emerald-500/30">
                {Object.keys(stockPageTasks).length} পিস
              </span>
            </div>
            <label className="cursor-pointer p-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 rounded-xl font-bold flex items-center justify-center gap-2 text-xs transition-colors w-full">
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>গুগল শীট / ফাইল আপলোড করুন (.csv, .tsv)</span>
              <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUploadPageJob} className="hidden" />
            </label>
            <form onSubmit={handleBulkAddPageJob} className="space-y-2">
              <textarea
                rows={3}
                value={bulkPageInput}
                onChange={(e) => setBulkPageInput(e.target.value)}
                placeholder="অথবা সরাসরি ডাটা পেস্ট করুন (Google Sheet TSV/CSV)..."
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[11px]"
              />
              {bulkPageInput.trim() && (
                <div className="p-2 bg-slate-950 border border-emerald-500/40 rounded-lg text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      লাইভ গণনাকৃত ডাটা: {livePageStats.validCount} টি কাজ পাওয়া গেছে
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      মোট লাইন: {livePageStats.totalLines}
                    </span>
                  </div>
                  {livePageStats.headerCount > 0 && (
                    <div className="text-amber-400 text-[10px]">
                      ⚠️ {livePageStats.headerCount} টি হেডার/বাতিল লাইন বাদ দেওয়া হয়েছে
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  id="replacePageStock"
                  checked={replacePageStock}
                  onChange={(e) => setReplacePageStock(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="replacePageStock" className="text-[11px] text-slate-300 cursor-pointer">
                  আগের স্টক মুছে নতুন {livePageStats.validCount ? `${livePageStats.validCount} টি` : ''} বসান
                </label>
              </div>
              <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 font-bold text-white rounded">
                {replacePageStock ? 'নতুন স্টক দিয়ে রিপ্লেস করুন' : t(lang, 'addJobBtn')}
              </button>
            </form>
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5">
              <button type="button" onClick={handleCopyUploadedPageJobs} className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded text-[11px] flex items-center gap-1">
                <Copy className="w-3 h-3" /> স্টক কপি ({Object.keys(stockPageTasks).length} পিস)
              </button>
              <button type="button" onClick={handleClearUploadedPageJobs} className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-[11px] flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> স্টক মুছুন
              </button>
              <button type="button" onClick={() => setShowStockPageList(!showStockPageList)} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded text-[11px]">
                {showStockPageList ? 'লুকান' : 'লিস্ট দেখুন'}
              </button>
            </div>
            {showStockPageList && (
              <div className="mt-2 max-h-40 overflow-y-auto bg-slate-950 p-2 rounded border border-slate-800 space-y-1">
                {Object.keys(stockPageTasks).length === 0 ? (
                  <div className="text-[11px] text-slate-500 text-center py-2">কোনো পেজ তৈরি স্টকে নেই</div>
                ) : (
                  getOrderedStockPageTasks().map(({ key: k, ...item }) => (
                    <div key={k} className="flex justify-between items-center p-1.5 bg-slate-900 rounded text-[10px] gap-2">
                      <span className="truncate">{item.phone}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => { copyToClipboard(item.rawLine || `${item.phone || ''}\t${item.inbox || ''}`); showToast('কপি হয়েছে!', 'success'); }} className="px-1.5 py-0.5 bg-sky-600 text-white font-bold rounded">Copy</button>
                        <button type="button" onClick={async () => { await remove(ref(db, `${wp('pageCreateSheetTasks')}/${k}`)); showToast('মোছা হয়েছে!', 'info'); }} className="px-1.5 py-0.5 bg-rose-600 text-white font-bold rounded">Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </AdminCard>

      </div>

      {/* Clear All Uploaded Tasks Button */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
        <span className="font-bold text-slate-300">স্টকে থাকা সব আপলোডকৃত ডাটা নিয়ন্ত্রণ</span>
        <button
          onClick={handleClearAllUploadedTasks}
          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded flex items-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t(lang, 'clearAllUploaded')}
        </button>
      </div>

      {/* Withdraw Requests List */}
      <AdminCard
        title="💳 "
        titleText={lang === 'bn' ? 'উইথড্র রিকোয়েস্ট' : 'Withdraw Requests'}
        accent="emerald"
        actions={
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/35 text-sky-300 text-[9px] sm:text-[11px] font-bold whitespace-nowrap">
              {lang === 'bn' ? 'মোট' : 'Bal'} {totalUsersBalance} Tk
            </span>
            <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[9px] sm:text-[11px] font-bold whitespace-nowrap">
              {lang === 'bn' ? 'আজ' : 'Today'} {todayWithdrawAmount} Tk
            </span>
            {Object.keys(withdrawRequests).length > 0 ? (
              <button
                type="button"
                onClick={handleClearAllWithdrawals}
                className="h-7 px-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg font-bold text-[10px] transition-colors inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span className="hidden sm:inline">{lang === 'bn' ? 'সব মুছুন' : 'Clear'}</span>
              </button>
            ) : null}
          </div>
        }
      >
        <div className="max-h-[22rem] sm:max-h-[28rem] overflow-y-auto space-y-2 pr-0.5">
          {withdrawGroups.length === 0 ? (
            <div className="p-3 text-center text-slate-500 text-[11px]">
              {lang === 'bn' ? 'কোনো উইথড্র রিকোয়েস্ট নেই।' : 'No withdraw requests.'}
            </div>
          ) : (
            withdrawGroups.map((g) => (
              <div key={g.dayKey} className="rounded-lg border border-slate-800 bg-slate-950/90 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-2 py-1 bg-slate-900 border-b border-slate-800">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-100 truncate">{g.label}</span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-bold text-sky-300">
                      {g.count}{lang === 'bn' ? ' জন' : ''}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 shrink-0">{g.sum} Tk</span>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {g.items.map(({ key, wd }) => {
                    const methodLabel = String(wd.method || '').toUpperCase() || 'PAY';
                    const num = String(wd.number || '').trim();
                    return (
                      <div
                        key={key}
                        className="px-2 py-1.5 flex flex-col sm:grid sm:grid-cols-[minmax(7rem,16%)_6.8rem_minmax(9rem,1fr)_5.2rem_auto] sm:items-center gap-1 sm:gap-2"
                      >
                        <div className="min-w-0 flex items-start justify-between gap-2 sm:block">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-100 text-[11px] sm:text-xs leading-tight truncate">
                              {wd.userName || '-'}
                            </div>
                            <div className="sm:hidden text-[9px] text-slate-400 font-mono leading-tight break-all">
                              {wd.userUid || '-'}
                            </div>
                          </div>
                          <span className="sm:hidden shrink-0 font-bold text-emerald-400 text-[12px] leading-none pt-0.5">
                            {wd.amount} Tk
                          </span>
                        </div>
                        <button
                          type="button"
                          title="UID copy"
                          onClick={async () => {
                            const uidVal = String(wd.userUid || '').trim();
                            if (!uidVal) return;
                            const ok = await copyToClipboard(uidVal);
                            showToast(ok ? (lang === 'bn' ? 'UID কপি হয়েছে' : 'UID copied') : 'Copy failed', ok ? 'success' : 'error');
                          }}
                          className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-sky-900/40 border border-sky-500/30 text-sky-200 font-mono text-[10px] font-bold w-fit"
                        >
                          {wd.userUid || '-'}
                        </button>
                        <div className="flex items-center gap-1.5 min-w-0 sm:contents">
                          <button
                            type="button"
                            title={lang === 'bn' ? 'নাম্বার কপি' : 'Copy number'}
                            onClick={async () => {
                              if (!num) return;
                              const ok = await copyToClipboard(num);
                              showToast(ok ? (lang === 'bn' ? 'নাম্বার কপি হয়েছে!' : 'Number copied!') : 'Copy failed', ok ? 'success' : 'error');
                            }}
                            className="w-fit max-w-full inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/35 text-emerald-300 font-mono text-[11px] sm:text-xs font-bold hover:bg-emerald-500/20"
                          >
                            <span className="font-sans text-[9px] sm:text-[10px] font-bold text-emerald-200/90 shrink-0">
                              {methodLabel}
                            </span>
                            <span className="whitespace-nowrap">{num || '—'}</span>
                          </button>

                          <span className="hidden sm:inline font-bold text-emerald-400 text-sm whitespace-nowrap">
                            {wd.amount} Tk
                          </span>

                          <div className="flex items-center gap-1 shrink-0 ml-auto">
                            {wd.status === 'pending' ? (
                              <button
                                type="button"
                                onClick={() => handleApproveWithdraw(key)}
                                className="h-6 px-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold min-w-[3rem]"
                              >
                                {t(lang, 'payComplete')}
                              </button>
                            ) : (
                              <span className="h-6 px-2 inline-flex items-center justify-center rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold min-w-[3rem]">
                                Paid
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteWithdraw(key)}
                              className="h-6 px-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-bold min-w-[3rem]"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">
              {lang === 'bn' ? 'মোট উইথড্র' : 'Total withdraw'}
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
              {totalWithdrawAmount} Tk
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">
              {lang === 'bn' ? 'রিকোয়েস্ট' : 'Requests'}
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[11px] font-bold">
              {Object.keys(withdrawRequests).length}
            </span>
          </div>
        </div>
      </AdminCard>

      {/* Serial Copy Modal Popup */}
      <SerialCopyModal
        isOpen={serialModalOpen}
        onClose={() => setSerialModalOpen(false)}
        title={serialModalTitle}
        lines={serialModalLines}
      />

      {/* Upload Countdown Progress Modal */}
      {/* Bulk report progress + confirm */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-600 rounded-2xl p-4 shadow-2xl space-y-3">
            <h3 className="text-sm font-bold text-slate-100">{t(lang, 'bulkPreviewTitle')}</h3>
            {(bulkModalPhase === 'scanning' || bulkModalPhase === 'sending') && (
              <div className="space-y-2">
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-150"
                    style={{ width: bulkModalTotal ? `${Math.round((bulkModalCurrent / bulkModalTotal) * 100)}%` : '0%' }}
                  />
                </div>
                <p className="text-[11px] text-slate-300 font-medium">{bulkModalStatus}</p>
                <p className="text-[10px] text-slate-500">{bulkModalCurrent} / {bulkModalTotal}</p>
              </div>
            )}
            {bulkModalPhase === 'confirm' && (
              <div className="space-y-2">
                <p className="text-[11px] text-amber-200 font-semibold">{bulkModalStatus}</p>
                <div className="max-h-52 overflow-y-auto space-y-1.5 border border-slate-700 rounded-xl p-2 bg-slate-950">
                  {bulkPreviewRows.map((r) => (
                    <div key={r.phoneKey + r.memberUid} className="flex items-center justify-between gap-2 text-[11px] px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-100 truncate">{r.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.memberUid}</div>
                      </div>
                      <div className="text-right shrink-0 font-bold">
                        <div className="text-sky-300">{r.pcs} pcs</div>
                        {bulkModalMode === 'good' && <div className="text-emerald-400">{r.amount} ৳</div>}
                        {bulkModalMode === 'suspend' && <div className="text-rose-400">Suspend</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold px-1">
                  <span className="text-slate-400">{bulkPreviewRows.reduce((s, r) => s + r.pcs, 0)} pcs</span>
                  {bulkModalMode === 'good' && <span className="text-emerald-400">{Math.round(bulkPreviewRows.reduce((s, r) => s + r.amount, 0) * 100) / 100} ৳</span>}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setBulkModalOpen(false); setBulkPreviewRows([]); }}
                    className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700"
                  >
                    {t(lang, 'btnCancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkConfirmSend}
                    disabled={bulkSending}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {t(lang, 'bulkConfirmSend')}
                  </button>
                </div>
              </div>
            )}
            {bulkModalPhase === 'done' && (
              <p className="text-sm font-bold text-emerald-400 text-center py-3">{bulkModalStatus}</p>
            )}
          </div>
        </div>
      )}

      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-3.5 max-w-[280px] w-full shadow-2xl text-center space-y-2.5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-center">
              {uploadModalFinished ? (
                <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center ring-2 ring-emerald-500/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="w-10 h-10 bg-violet-500/20 text-violet-400 rounded-full flex items-center justify-center ring-2 ring-violet-500/20">
                  <Upload className="w-5 h-5 text-violet-400 animate-bounce" />
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white">
                {uploadModalFinished ? 'স্টক আপলোড সম্পূর্ণ!' : 'স্টক ডাটা আপলোড হচ্ছে...'}
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {uploadModalType === 'new' ? 'নিউ জব স্টক' : 'ওল্ড জব স্টক'}
              </p>
            </div>

            <div className="space-y-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <div className="flex justify-between items-baseline text-[11px]">
                <span className="text-slate-400 font-medium">প্রগ্রেস:</span>
                <span className="font-bold font-mono text-emerald-400">
                  {uploadModalCurrent} / {uploadModalTotal} টি
                </span>
              </div>

              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-violet-500 to-emerald-400 h-full transition-all duration-75 ease-out rounded-full"
                  style={{ width: `${uploadModalTotal > 0 ? (uploadModalCurrent / uploadModalTotal) * 100 : 0}%` }}
                />
              </div>

              <div className="pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-300 space-y-1 text-left">
                <div className="flex justify-between">
                  <span className="text-slate-400">আগে ছিল:</span>
                  <span className="font-mono text-slate-200">{uploadModalExisting} টি</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">নতুন যোগ:</span>
                  <span className="font-mono text-emerald-400">+{uploadModalCurrent} টি</span>
                </div>
                <div className="flex justify-between font-bold text-white pt-1 border-t border-slate-800/60">
                  <span>মোট স্টক:</span>
                  <span className="font-mono text-amber-400">
                    {uploadModalExisting + uploadModalCurrent} টি
                  </span>
                </div>
              </div>
            </div>

            {uploadModalFinished ? (
              <button
                onClick={() => setUploadModalOpen(false)}
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow-md shadow-emerald-600/20"
              >
                ঠিক আছে (বন্ধ করুন)
              </button>
            ) : (
              <p className="text-[10px] text-amber-400 animate-pulse font-medium">
                অপেক্ষা করুন, আপলোড হচ্ছে...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ControlToggleBoxProps {
  title: string;
  isOn: boolean;
  onToggle: () => void;
  lang: Language;
}

const ControlToggleBox: React.FC<ControlToggleBoxProps> = ({ title, isOn, onToggle, lang }) => (
  <div className="bg-[#120e1c]/90 border border-amber-500/15 px-2 py-1.5 rounded-xl flex items-center justify-between gap-1 min-w-0 shadow-sm">
    <div className="min-w-0">
      <div className="text-[10px] sm:text-[11px] font-bold text-slate-200 truncate">{title}</div>
      <div className={`text-[9px] font-extrabold ${isOn ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isOn ? t(lang, 'on') : t(lang, 'off')}
      </div>
    </div>
    <button
      onClick={onToggle}
      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold text-white shrink-0 transition-all ${
        isOn ? 'bg-emerald-600 hover:bg-emerald-500 shadow shadow-emerald-600/20' : 'bg-rose-600 hover:bg-rose-500 shadow shadow-rose-600/20'
      }`}
    >
      {isOn ? t(lang, 'turnOff') : t(lang, 'turnOn')}
    </button>
  </div>
);

interface AdminCardProps {
  title: string;
  titleText: string;
  accent: 'violet' | 'orange' | 'amber' | 'emerald' | 'sky';
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const AdminCard: React.FC<AdminCardProps> = ({ title, titleText, accent, actions, children }) => {
  const borderColors = {
    violet: 'border-violet-500/30',
    orange: 'border-orange-500/30',
    amber: 'border-amber-500/30',
    emerald: 'border-emerald-500/30',
    sky: 'border-sky-500/30',
  };

  return (
    <div className={`bg-[#120e1c]/90 backdrop-blur-sm border ${borderColors[accent]} rounded-xl p-2 sm:p-3 space-y-2 shadow-[0_4px_24px_rgba(0,0,0,0.25)]`}>
      <div className="flex items-center justify-between gap-1 border-b border-amber-500/10 pb-1.5">
        <h3 className="text-[10px] sm:text-[11px] font-bold text-slate-100 flex items-center gap-1 min-w-0 flex-1">
          <span className="shrink-0">{title}</span>
          <span className="break-words whitespace-normal leading-tight">{titleText}</span>
        </h3>
        {actions && <div className="flex items-center gap-0.5 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
};

const TaskSubmittedTable: React.FC<{ tasks: Record<string, SubmittedTask>; filterType: 'New Job' | 'Old Job' | 'Page Create'; lang: Language; showToast: (text: string, type: 'success' | 'error' | 'info') => void }> = ({ tasks, filterType, lang, showToast }) => {
  const filteredKeys = Object.keys(tasks).filter((key) => {
    const task = tasks[key];
    if (!task || (task.status && task.status !== 'pending')) return false;
    const jt = String(task.jobType || '');
    if (filterType === 'Page Create') return jt === 'Page Create';
    const isNew = jt === 'New Job' || jt === 'new' || (!task.jobType && (Boolean(task.fuln) || Boolean(task.listing) || Boolean(task.checker)));
    if (filterType === 'New Job') return isNew && jt !== 'Page Create';
    return !isNew && jt !== 'Page Create';
  });

  return (
    <div className="max-h-64 overflow-y-auto border border-slate-700/80 rounded-lg bg-slate-950 p-0">
      <table className="w-full text-left border-collapse text-[11px] font-mono">
        <thead className="sticky top-0 z-[1] bg-slate-900">
          <tr className="border-b border-slate-700 text-slate-300 font-bold">
            <th className="p-2">{t(lang, 'userInfo')}</th>
            <th className="p-2">{t(lang, 'originalInfo')}</th>
            <th className="p-2">{t(lang, 'submittedData')}</th>
            <th className="p-2 text-center">{t(lang, 'action')}</th>
          </tr>
        </thead>
        <tbody>
          {filteredKeys.length === 0 ? (
            <tr><td colSpan={4} className="p-3 text-center text-slate-500">কোনো জমা কাজ নেই।</td></tr>
          ) : (
            filteredKeys.map((key) => {
              const task = tasks[key];
              const isNew = filterType === 'New Job';
              const copyTsv = formatSubmittedRow(task);

              return (
                <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                  <td className="p-2"><span className="font-bold text-slate-200">{task.userName}</span><div className="text-[10px] text-slate-400">{task.userUid}</div></td>
                  <td className="p-2 text-[10px] text-slate-300">
                    {isNew ? (
                      <div><b>Name:</b> {task.fuln}<br /><b>Checker:</b> {task.checker}<br /><b>Listing:</b> {task.listing}<br /><b>Phone:</b> {task.phone}</div>
                    ) : (
                      <div><b>Phone:</b> {task.phone}</div>
                    )}
                  </td>
                  <td className="p-2 text-[10px] text-slate-300">
                    <b>UID:</b> {task.uid}<br /><b>Pass:</b> {task.pass}<br /><b>2FA:</b> {task.key2fa}<br /><b>Mail:</b> {task.mail}
                  </td>
                  <td className="p-2 text-center space-y-1">
                    <button
                      onClick={async () => {
                        await copyToClipboard(copyTsv);
                        showToast('কপি হয়েছে!', 'success');
                      }}
                      className="w-full py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded"
                    >
                      Copy
                    </button>
                    <button
                      onClick={async () => {
                        await remove(ref(db, `${wp('submittedTasks')}/${key}`));
                        showToast('ডিলিট হয়েছে!', 'info');
                      }}
                      className="w-full py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

const TaskReportedTable: React.FC<{ tasks: Record<string, ReportedTask>; filterType: 'New Job' | 'Old Job' | 'Page Create'; lang: Language; showToast: (text: string, type: 'success' | 'error' | 'info') => void }> = ({ tasks, filterType, lang, showToast }) => {
  const filteredKeys = Object.keys(tasks).filter((key) => {
    const rep = tasks[key];
    if (!rep) return false;
    const jt = String(rep.jobType || '');
    if (filterType === 'Page Create') return jt === 'Page Create';
    const isNew = jt === 'New Job' || jt === 'new' || (!rep.jobType && (Boolean(rep.fuln) || Boolean(rep.listing) || Boolean(rep.checker)));
    if (filterType === 'New Job') return isNew && jt !== 'Page Create';
    return !isNew && jt !== 'Page Create';
  });

  return (
    <div className="max-h-64 overflow-y-auto border border-slate-700/80 rounded-lg bg-slate-950 p-0">
      <table className="w-full text-left border-collapse text-[11px] font-mono">
        <thead className="sticky top-0 z-[1] bg-slate-900">
          <tr className="border-b border-slate-700 text-slate-300 font-bold">
            <th className="p-2">{t(lang, 'userInfo')}</th>
            <th className="p-2">{t(lang, 'taskDetails')}</th>
            <th className="p-2 text-center">{t(lang, 'action')}</th>
          </tr>
        </thead>
        <tbody>
          {filteredKeys.length === 0 ? (
            <tr><td colSpan={3} className="p-3 text-center text-slate-500">কোনো রিপোর্ট নেই।</td></tr>
          ) : (
            filteredKeys.map((key) => {
              const rep = tasks[key];
              const isNew = filterType === 'New Job';
              const copyTsv = formatReportedRow(rep);

              return (
                <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                  <td className="p-2"><span className="font-bold text-slate-200">{rep.userName}</span><div className="text-[10px] text-slate-400">{rep.userUid}</div>
                    {(rep as any).reportReason === 'Suspend' && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-600/30 text-rose-300 border border-rose-500/40">Suspend</span>
                    )}
                    {(rep as any).reportReason === 'Change' && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-600/25 text-amber-200 border border-amber-500/35">Change</span>
                    )}
                  </td>
                  <td className="p-2 text-[10px] text-slate-300">Phone: {rep.phone} | Inbox: {rep.inbox || '-'}</td>
                  <td className="p-2 text-center space-y-1">
                    <button
                      onClick={async () => {
                        await copyToClipboard(copyTsv);
                        showToast('কপি হয়েছে!', 'success');
                      }}
                      className="w-full py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded"
                    >
                      Copy
                    </button>
                    <button
                      onClick={async () => {
                        await remove(ref(db, `${wp('reportedTasks')}/${key}`));
                        showToast('ডিলিট হয়েছে!', 'info');
                      }}
                      className="w-full py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

const ActiveLiveTable: React.FC<{ activeTasks: Record<string, SheetTask>; jobType: 'new' | 'old' | 'page'; onRevoke: (phoneKey: string, type: 'new' | 'old' | 'page') => void; lang: Language }> = ({ activeTasks, jobType, onRevoke, lang }) => (
  <div className="max-h-52 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950 p-2">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-slate-800 text-slate-400 font-bold">
          <th className="p-2">{t(lang, 'userInfo')}</th>
          <th className="p-2">{t(lang, 'taskDetails')}</th>
        </tr>
      </thead>
      <tbody>
        {Object.keys(activeTasks).length === 0 ? (
          <tr><td colSpan={2} className="p-3 text-center text-slate-500">বর্তমানে কোনো কাজ লাইভ নেই।</td></tr>
        ) : (
          Object.keys(activeTasks).map((phoneKey) => {
            const item = activeTasks[phoneKey];
            const startTime = item.assignedTime || item.time || 'N/A';
            return (
              <tr key={phoneKey} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                <td className="p-2">
                  <span className="font-bold text-slate-200">{item.assignedUserName || 'N/A'}</span>
                  <div className="text-[10px] text-slate-400">{item.assignedUserUid}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{phoneKey}</div>
                </td>
                <td className="p-2 text-[10px]">
                  <div>Phone: <span className="text-emerald-400 font-mono font-bold">{item.phone}</span></div>
                  {item.inbox && <div className="truncate max-w-[150px] text-slate-400">Inbox: {item.inbox}</div>}
                  <div className="text-amber-300 font-bold mt-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded w-max">
                    ⏱ কাজ স্টার্ট টাইম: <span className="font-mono text-white">{startTime}</span>
                  </div>
                  <button
                    onClick={() => onRevoke(phoneKey, jobType)}
                    className="mt-1.5 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded shadow-sm"
                  >
                    {t(lang, 'revoke')}
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
);
