import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDA0nbIzRmyuIUsrIE7m6xiISbiL3v5UwA",
  authDomain: "painite-digital-work-system.firebaseapp.com",
  databaseURL: "https://painite-digital-work-system-default-rtdb.firebaseio.com",
  projectId: "painite-digital-work-system",
  storageBucket: "painite-digital-work-system.firebasestorage.app",
  messagingSenderId: "272765532955",
  appId: "1:272765532955:web:6cf98e180e46e07fe6b1be",
  measurementId: "G-JCWBMW2XTF"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

/** Work data namespace — old apps use root paths; new app uses app_v3/* only */
export const WORK_ROOT = 'app_v3';
export function wp(path: string): string {
  return `${WORK_ROOT}/${path}`;
}

export const ADMIN_PASS = "@@##";

export function isValidUrl(val?: string): boolean {
  if (!val) return false;
  let v = val.trim().toLowerCase();
  if (v === '#' || v === '-' || v === '') return false;
  // allow internal spaces only if a real http URL can still be extracted
  if (v.includes(' ') && !/https?:\/\/\S+/i.test(v) && !/^[\w.-]+\.[a-z]{2,}\/\S+/i.test(v)) {
    return false;
  }

  if (v.startsWith('http://')) v = v.slice(7);
  else if (v.startsWith('https://')) v = v.slice(8);

  // take first token if spaces remain
  v = v.split(/\s+/)[0];

  if (!v.includes('.')) return false;

  // strip port from host (example.com:8080 → example.com)
  const domainPart = v.split('/')[0].split('?')[0].split(':')[0];
  if (!domainPart.includes('.')) return false;

  const parts = domainPart.split('.');
  const tld = parts[parts.length - 1];
  if (!tld || tld.length < 2 || !/^[a-z0-9]+$/.test(tld)) return false;

  return true;
}

export function fixUrlFormat(url?: string): string {
  const pickLongestHttp = (text: string): string | null => {
    const matches = String(text).match(/https?:\/\/[^\s\t<>"']+/gi);
    if (!matches || !matches.length) return null;
    return matches.reduce((a, b) => (b.length > a.length ? b : a));
  };

  if (!url) return '#';

  let cleanUrl = String(url).trim();
  if (
    (cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) ||
    (cleanUrl.startsWith("'") && cleanUrl.endsWith("'"))
  ) {
    cleanUrl = cleanUrl.slice(1, -1).trim();
  }

  // Always prefer the longest absolute http(s) URL (token paths are longer)
  const extracted = pickLongestHttp(cleanUrl);
  if (extracted) return extracted;

  if (!isValidUrl(cleanUrl)) return '#';

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl.split(/\s+/)[0];
  }
  return cleanUrl;
}

export function isDateVal(val?: string): boolean {
  if (!val) return false;
  const v = val.trim();
  if (/^\d+$|^\+?\d{7,15}$/.test(v)) return false;
  if (/^\d{1,4}[\/\.-]\d{1,2}[\/\.-]\d{1,4}$/.test(v)) return true;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.-]+\d{1,2}[\s,.-]+\d{2,4}$/i.test(v)) return true;
  if (/^\d{1,2}[\s,.-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.-]+\d{2,4}$/i.test(v)) return true;
  return false;
}

export function isGenderVal(val?: string): boolean {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return (
    v === 'female' ||
    v === 'male' ||
    v === 'f' ||
    v === 'm' ||
    v === 'other' ||
    v === 'woman' ||
    v === 'man' ||
    v === 'মহিলা' ||
    v === 'পুরুষ' ||
    v.includes('female') ||
    v.includes('male')
  );
}

export function isPhoneVal(val?: string): boolean {
  if (!val) return false;
  const v = val.trim();
  if (isValidUrl(v) || isDateVal(v)) return false;
  if (/[a-zA-Z]/.test(v)) return false;
  const digits = v.replace(/[^0-9]/g, '');
  return digits.length >= 7 && digits.length <= 13 && !v.includes('/') && !v.includes('http');
}

export function sanitizeTaskData(task: any): any {
  if (!task || typeof task !== 'object') return task;

  const cleanVal = (val?: any): string => {
    if (val === null || val === undefined) return '';
    let v = String(val).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }
    return v.replace(/""/g, '"').trim();
  };

  let fn = cleanVal(task.fn);
  let ln = cleanVal(task.ln);
  let fuln = cleanVal(task.fuln);
  let gen = cleanVal(task.gen);
  let st = cleanVal(task.st);
  let dob = cleanVal(task.dob);
  let listing = cleanVal(task.listing);
  let checker = cleanVal(task.checker);
  let phone = cleanVal(task.phone);
  let inbox = cleanVal(task.inbox);

  // Prefer any real http(s) URL from inbox / rawLine / all fields (555api etc.)
  {
    const pool = [inbox, task.inbox, task.rawLine, task.phone, phone, checker, listing];
    for (const item of pool) {
      if (!item) continue;
      const m = String(item).match(/https?:\/\/[^\s\t<>"']+/i);
      if (m) { inbox = m[0]; break; }
    }
  }

  // 1. Inbox URL fix
  if (inbox && inbox !== '#') {
    inbox = fixUrlFormat(inbox);
  } else {
    const rawVals = [phone, checker, listing, dob, st, gen, fuln, ln, fn];
    const foundUrl = rawVals.find((v) => isValidUrl(v));
    if (foundUrl) {
      inbox = fixUrlFormat(foundUrl);
    } else {
      inbox = '#';
    }
  }

  // 2. Phone fix: fallback only if phone is completely missing
  if (!phone) {
    const rawVals = [checker, listing, dob, st, gen, fuln, ln, fn];
    const foundPhone = rawVals.find((v) => isPhoneVal(v));
    if (foundPhone) phone = foundPhone;
  }

  // 3. Full name fix
  if (!fuln && (fn || ln)) {
    fuln = `${fn} ${ln}`.trim();
  }

  return {
    ...task,
    fn,
    ln,
    fuln,
    gen,
    st,
    dob,
    listing,
    checker,
    phone,
    inbox: fixUrlFormat(inbox),
  };
}

export function isHeaderTask(task: any): boolean {
  if (!task || typeof task !== 'object') return true;

  const phoneStr = String(task.phone || '').trim();
  const fnStr = String(task.fn || '').trim().toLowerCase();
  const inboxStr = String(task.inbox || '').trim().toLowerCase();
  const rawL = String(task.rawLine || '').toLowerCase();

  // RULE 1: If phone contains 6+ digits OR inbox contains a URL/valid link, it is 100% a DATA ROW, NEVER a header!
  if (
    /\d{6,}/.test(phoneStr) ||
    /https?:\/\//i.test(inboxStr) ||
    /www\./i.test(inboxStr) ||
    /https?:\/\//i.test(rawL) ||
    /www\./i.test(rawL)
  ) {
    return false;
  }

  // RULE 2: If phone or fn cell is explicitly a header label
  const cleanPhone = phoneStr.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isPhoneLabel = [
    'phone', 'phonenumber', 'phoneno', 'mobile', 'mobilenumber', 'mobileno', 'phone#', 'mobile#'
  ].includes(cleanPhone);

  const cleanFn = fnStr.replace(/[^a-z0-9]/g, '');
  const isFnLabel = [
    'fn', 'firstname', 'first', 'fullname', 'fuln', 'sl', 'slno', 'serial', 'serialno'
  ].includes(cleanFn);

  if ((isPhoneLabel || isFnLabel) && !/\d/.test(phoneStr)) {
    return true;
  }

  // RULE 3: If rawLine explicitly matches multiple column headers AND lacks phone digits or URLs
  if (task.rawLine) {
    const matches = [
      rawL.includes('first name') || rawL.includes('firstname'),
      rawL.includes('last name') || rawL.includes('lastname'),
      rawL.includes('full name') || rawL.includes('fullname'),
      rawL.includes('date of birth') || rawL.includes('dob'),
      rawL.includes('phone number') || rawL.includes('phonenumber'),
      rawL.includes('inbox link') || rawL.includes('inbox')
    ].filter(Boolean).length;

    if (matches >= 2) {
      return true;
    }
  }

  // RULE 4: Empty row check (only if all main fields are blank)
  const cFn = String(task.fn || '').trim().replace(/^-$/, '');
  const cFuln = String(task.fuln || '').trim().replace(/^-$/, '');
  const cPhone = String(task.phone || '').trim().replace(/^-$/, '');
  const cInbox = String(task.inbox || '').trim().replace(/^#$/, '').replace(/^-$/, '');

  if (!cPhone && !cInbox && !cFuln && !cFn) {
    return true;
  }

  return false;
}

export function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => resolve(true))
        .catch(() => fallbackCopy(text, resolve));
    } else {
      fallbackCopy(text, resolve);
    }
  });
}

function fallbackCopy(text: string, resolve: (val: boolean) => void) {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    resolve(successful);
  } catch (err) {
    console.error("Copy failed", err);
    resolve(false);
  }
}


/** App version — bump on every release */

/** Extract a usable OTP inbox URL from any task-like object / string */
export function resolveInboxUrl(input?: any): string {
  if (input === null || input === undefined) return '#';
  if (typeof input === 'string') {
    const s = input.trim();
    // bare URL without protocol
    if (/^https?:\/\//i.test(s)) return fixUrlFormat(s);
    if (/^[\w.-]+\.[a-z]{2,}\/\S+/i.test(s)) return fixUrlFormat('https://' + s);
    return fixUrlFormat(s);
  }

  const candidates: string[] = [];
  const push = (v: any) => {
    if (v === null || v === undefined) return;
    const str = String(v).trim();
    if (!str || str === '#' || str === '-') return;
    candidates.push(str);
    // full urls
    const m1 = str.match(/https?:\/\/[^\s\t<>"'\\]+/gi);
    if (m1) candidates.push(...m1);
    // protocol-relative
    const m2 = str.match(/\/\/[\w.-]+\.[a-z]{2,}\/[^\s\t<>"'\\]+/gi);
    if (m2) candidates.push(...m2.map((x) => 'https:' + x));
    // domain/path without protocol (555api.com/TOKEN)
    const m3 = str.match(/\b[\w.-]+\.[a-z]{2,}\/[\w.?=&%/+\-#]+/gi);
    if (m3) candidates.push(...m3.map((x) => (x.startsWith('http') ? x : 'https://' + x)));
  };

  // Priority order: inbox fields first
  push(input.inbox);
  push(input.Inbox);
  push(input.INBOX);
  push(input.inboxLink);
  push(input.mailLink);
  push(input.rawLine);
  push(input.phone);
  try {
    for (const [k, v] of Object.entries(input)) {
      if (/inbox|link|url|raw/i.test(k)) push(v);
    }
    for (const v of Object.values(input)) push(v);
  } catch { /* ignore */ }

  let best = '#';
  for (const c of candidates) {
    const fixed = fixUrlFormat(c);
    if (!fixed || fixed === '#') continue;
    // Prefer token-like long paths over bare homepages
    if (best === '#') best = fixed;
    else if (fixed.length > best.length) best = fixed;
  }
  return best;
}

export const APP_VERSION = '3.2.45';
export const APP_NAME = 'Painite Work';

export function compareVersions(a: string, b: string): number {
  const pa = String(a || '0').replace(/^v/i, '').split(/[^0-9]+/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').replace(/^v/i, '').split(/[^0-9]+/).map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function isAppOutdated(current: string, minimum: string | null | undefined): boolean {
  if (!minimum || !String(minimum).trim()) return false;
  return compareVersions(current, String(minimum).trim()) < 0;
}
