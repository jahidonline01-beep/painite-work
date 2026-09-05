import React, { useState, useEffect } from 'react';
import { Language, UserAccount, SheetTask, WithdrawRequest } from '../types';
import { t } from '../lib/i18n';
import { db, copyToClipboard, sanitizeTaskData, isHeaderTask, APP_VERSION, isAppOutdated, wp, resolveInboxUrl } from '../lib/firebase';
import { ref, onValue, set, get, update, remove, push, runTransaction, serverTimestamp } from 'firebase/database';
import { motion, AnimatePresence } from 'motion/react';
import {
  User, Wallet, CheckCircle2, ArrowUpRight, Copy, AlertTriangle,
  ExternalLink, Eye, EyeOff, Trash2, Send, History, ArrowLeft, Mail, Key, Shield,
  Repeat2, Bot, Monitor
} from 'lucide-react';
import { OtpInbox } from './OtpInbox';

interface UserDashboardProps {
  lang: Language;
  currentUserPhone: string;
  showToast: (text: string, type: 'success' | 'error' | 'info') => void;
  newJobEnabled: boolean;
  oldJobEnabled: boolean;
  pageCreateEnabled: boolean;
  withdrawEnabled: boolean;
  botNewIdEnabled?: boolean;
  pcCloneEnabled?: boolean;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  lang,
  currentUserPhone,
  showToast,
  newJobEnabled,
  oldJobEnabled,
  pageCreateEnabled,
  withdrawEnabled,
  botNewIdEnabled = true,
  pcCloneEnabled = true,
}) => {
  const [userData, setUserData] = useState<UserAccount | null>(null);
  const [currentTask, setCurrentTask] = useState<SheetTask | null>(null);
  const [activeJobType, setActiveJobType] = useState<'new' | 'old' | 'page'>('new');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawRequest[]>([]);

  // Report / message hide state
  const [hideNewReport, setHideNewReport] = useState(false);
  const [hideOldReport, setHideOldReport] = useState(false);
  const [hidePageReport, setHidePageReport] = useState(false);
  const [hideAdminMessage, setHideAdminMessage] = useState(false);

  // Withdraw Form State
  const [wdMethod, setWdMethod] = useState<'bkash' | 'nagad'>('bkash');
  const [wdNumber, setWdNumber] = useState('');
  const [wdAmount, setWdAmount] = useState<number>(50);

  // Submit Form State
  const [subUid, setSubUid] = useState('');
  const [subPass, setSubPass] = useState('');
  const [showSubPass, setShowSubPass] = useState(false);
  const [sub2fa, setSub2fa] = useState('');
  const [subMail, setSubMail] = useState('');
  const [subMailLink, setSubMailLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Change-task confirmation
  const [showChangeConfirm, setShowChangeConfirm] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [idFormType, setIdFormType] = useState<null | 'bot' | 'pc'>(null);
  const [idUid, setIdUid] = useState('');
  const [idPass, setIdPass] = useState('');
  const [showIdPass, setShowIdPass] = useState(false);
  const [id2fa, setId2fa] = useState('');
  const [idMail, setIdMail] = useState('');
  const [idMailLink, setIdMailLink] = useState('');
  const [idSubmitting, setIdSubmitting] = useState(false);

  // Listen to User Profile real-time + silent 12h report auto-clear
  useEffect(() => {
    const userRef = ref(db, `users/${currentUserPhone}`);
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;

    const unsubscribe = onValue(userRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.val() as UserAccount;
      setUserData(data);

      // Hidden auto-expiry: clear reports older than 12 hours (no UI timer shown)
      const now = Date.now();
      const clearUpdates: Record<string, any> = {};

      if (data.newReport) {
        const at = typeof data.newReportAt === 'number' ? data.newReportAt : 0;
        // If timestamp missing (legacy), treat as already expired after first load once at is set by admin next time
        // Only auto-clear when timestamp exists and is older than 12h
        if (at > 0 && now - at >= TWELVE_HOURS) {
          clearUpdates.newReport = null;
          clearUpdates.newReportAt = null;
        }
      }
      if (data.oldReport) {
        const at = typeof data.oldReportAt === 'number' ? data.oldReportAt : 0;
        if (at > 0 && now - at >= TWELVE_HOURS) {
          clearUpdates.oldReport = null;
          clearUpdates.oldReportAt = null;
        }
      }
      if (data.pageCreateReport) {
        const at = typeof data.pageCreateReportAt === 'number' ? data.pageCreateReportAt : 0;
        if (at > 0 && now - at >= TWELVE_HOURS) {
          clearUpdates.pageCreateReport = null;
          clearUpdates.pageCreateReportAt = null;
        }
      }
      if (data.adminMessage) {
        const at = typeof data.adminMessageAt === 'number' ? data.adminMessageAt : 0;
        if (at > 0 && now - at >= TWELVE_HOURS) {
          clearUpdates.adminMessage = null;
          clearUpdates.adminMessageAt = null;
        }
      }
      if (data.suspendReport) {
        const at = typeof data.suspendReportAt === 'number' ? data.suspendReportAt : 0;
        if (at > 0 && now - at >= TWELVE_HOURS) {
          clearUpdates.suspendReport = null;
          clearUpdates.suspendReportAt = null;
        }
      }

      if (Object.keys(clearUpdates).length > 0) {
        try {
          await update(userRef, clearUpdates);
        } catch {
          // silent fail
        }
      }
    });
    return () => unsubscribe();
  }, [currentUserPhone]);

  // Listen to Withdraw History real-time
  useEffect(() => {
    const wdRef = ref(db, wp('withdrawRequests'));
    const unsubscribe = onValue(wdRef, (snapshot) => {
      if (snapshot.exists()) {
        const list: WithdrawRequest[] = [];
        Object.keys(snapshot.val()).forEach((key) => {
          const item = snapshot.val()[key];
          if (item.user === currentUserPhone) {
            list.push({ id: key, ...item });
          }
        });
        setWithdrawHistory(list.reverse());
      } else {
        setWithdrawHistory([]);
      }
    });
    return () => unsubscribe();
  }, [currentUserPhone]);

  // Check if active task exists already for this user (Real-time listener for auto-redirect on revoke)
  useEffect(() => {
    let activeNewData: SheetTask | null = null;
    let activeOldData: SheetTask | null = null;

    const activeNewRef = ref(db, `${wp('activeUserTasks')}/${currentUserPhone}`);
    const activeOldRef = ref(db, `${wp('activeOldUserTasks')}/${currentUserPhone}`);

    const unsubNew = onValue(activeNewRef, (snapshot) => {
      if (snapshot.exists()) {
        activeNewData = sanitizeTaskData(snapshot.val());
        setCurrentTask(activeNewData);
        setActiveJobType('new');
      } else {
        activeNewData = null;
        if (!activeOldData) {
          setCurrentTask(null);
        }
      }
    });

    const unsubOld = onValue(activeOldRef, (snapshot) => {
      if (snapshot.exists()) {
        activeOldData = sanitizeTaskData(snapshot.val());
        setCurrentTask(activeOldData);
        setActiveJobType('old');
      } else {
        activeOldData = null;
        if (!activeNewData) {
          setCurrentTask(null);
        }
      }
    });

    return () => {
      unsubNew();
      unsubOld();
    };
  }, [currentUserPhone]);


  // Get Work Data with 100% bug-free Phone Number & Inbox Link logic
  const handleGetWorkData = async (type: 'new' | 'old' | 'page') => {
    try {
      const verSnap = await get(ref(db, 'settings/minAppVersion'));
      const minV = verSnap.exists() ? String(verSnap.val()).trim() : '';
      const forceSnap = await get(ref(db, 'settings/forceUpdate'));
      const force = forceSnap.exists() && (forceSnap.val() === true || forceSnap.val() === 'true');
      if (force || isAppOutdated(APP_VERSION, minV)) {
        showToast(t(lang, 'updateRequired'), 'error');
        return;
      }
    } catch (_) {}
    if (userData?.taskAccess === false) {
      showToast(t(lang, 'taskAccessOff'), 'error');
      return;
    }
    if (type === 'new' && userData?.newJobAccess === false) {
      showToast(t(lang, 'taskAccessOff'), 'error');
      return;
    }
    if (type === 'old' && userData?.oldJobAccess === false) {
      showToast(t(lang, 'taskAccessOff'), 'error');
      return;
    }
    if (type === 'page' && userData?.pageCreateAccess === false) {
      showToast(t(lang, 'taskAccessOff'), 'error');
      return;
    }

    if (type === 'new' && !newJobEnabled) {
      showToast(t(lang, 'jobSystemOff'), 'error');
      return;
    }
    if (type === 'old' && !oldJobEnabled) {
      showToast(t(lang, 'jobSystemOff'), 'error');
      return;
    }
    if (type === 'page' && !pageCreateEnabled) {
      showToast(t(lang, 'jobSystemOff'), 'error');
      return;
    }

    setActiveJobType(type);
    const activePath = type === 'new' ? `${wp('activeUserTasks')}/${currentUserPhone}` : type === 'old' ? `${wp('activeOldUserTasks')}/${currentUserPhone}` : `${wp('activePageCreateUserTasks')}/${currentUserPhone}`;
    const activeRef = ref(db, activePath);
    const activeSnap = await get(activeRef);

    if (activeSnap.exists()) {
      const existing = sanitizeTaskData(activeSnap.val());
      const inbox = resolveInboxUrl(existing);
      existing.inbox = inbox && inbox !== '#' ? inbox : (existing.inbox || '#');
      // Keep rawLine so OtpInbox can re-scan every field
      setCurrentTask({ ...existing, inbox: existing.inbox });
      return;
    }

    // Fetch from stock
    const dbPath = type === 'new' ? wp('sheetTasks') : type === 'old' ? wp('oldSheetTasks') : wp('pageCreateSheetTasks');
    const sheetSnap = await get(ref(db, dbPath));

    if (!sheetSnap.exists() || Object.keys(sheetSnap.val()).length === 0) {
      showToast(t(lang, 'noMoreTasks'), 'error');
      return;
    }

    const tasksData = sheetSnap.val();
    const sortedKeys = Object.keys(tasksData)
      .filter((k) => {
        const item = sanitizeTaskData(tasksData[k]);
        if (isHeaderTask(item)) {
          remove(ref(db, `${dbPath}/${k}`));
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const tA = tasksData[a];
        const tB = tasksData[b];
        if (typeof tA?.seq === 'number' && typeof tB?.seq === 'number' && tA.seq !== tB.seq) {
          return tA.seq - tB.seq;
        }
        const timeA = typeof tA?.createdAt === 'number' ? tA.createdAt : 0;
        const timeB = typeof tB?.createdAt === 'number' ? tB.createdAt : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.localeCompare(b);
      });

    if (sortedKeys.length === 0) {
      showToast(t(lang, 'noMoreTasks'), 'error');
      return;
    }

    // Prefer live userData; if missing (race), fetch once from DB so name/UID are not N/A
    let assignName = userData?.name || '';
    let assignUid = userData?.uid || '';
    if (!assignName || !assignUid || assignName === 'N/A' || assignUid === 'N/A') {
      try {
        const uSnap = await get(ref(db, `users/${currentUserPhone}`));
        if (uSnap.exists()) {
          const u = uSnap.val();
          if (!assignName && u?.name) assignName = u.name;
          if (!assignUid && u?.uid) assignUid = u.uid;
        }
      } catch {
        // keep fallback
      }
    }

    // Atomic claim: only ONE member can take each stock row.
    // Without this, two members reading stock at the same time could get the same number.
    let claimedRaw: any = null;
    let claimedKey: string | null = null;
    for (const key of sortedKeys) {
      let snapshotData: any = null;
      const keyRef = ref(db, `${dbPath}/${key}`);
      const tx = await runTransaction(keyRef, (current) => {
        if (current === null || current === undefined) {
          return; // already taken — abort
        }
        snapshotData = current;
        return null; // delete from stock atomically
      });
      if (tx.committed && snapshotData) {
        claimedRaw = snapshotData;
        claimedKey = key;
        break;
      }
    }

    if (!claimedRaw || !claimedKey) {
      showToast(t(lang, 'noMoreTasks'), 'error');
      return;
    }

    const taskItem = sanitizeTaskData(claimedRaw);
    const resolvedInbox = resolveInboxUrl({ ...taskItem, ...claimedRaw });
    const taskWithUserInfo: SheetTask = {
      ...taskItem,
      inbox: resolvedInbox !== '#' ? resolvedInbox : (taskItem.inbox || '#'),
      rawLine: taskItem.rawLine || claimedRaw?.rawLine || '',
      assignedUserUid: assignUid || 'N/A',
      assignedUserName: assignName || 'N/A',
      assignedUserPhone: currentUserPhone,
      assignedTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    };

    try {
      await set(activeRef, taskWithUserInfo);
    } catch (err) {
      // Stock already removed — put the number back so it is not lost
      try {
        await set(ref(db, `${dbPath}/${claimedKey}`), claimedRaw);
      } catch { /* ignore */ }
      throw err;
    }
    setCurrentTask(taskWithUserInfo);
    showToast(t(lang, 'taskAccepted'), 'success');
  };

  const handleCopyText = async (text?: string, label?: string) => {
    if (!text || text === '-' || text.trim() === '') return;
    const success = await copyToClipboard(text);
    if (success) {
      showToast(`${label || text} ${t(lang, 'copied')}`, 'success');
    }
  };

  const handleChangeTask = async () => {
    if (!currentTask) return;
    setShowChangeConfirm(false);
    const activePath = activeJobType === 'new' ? `${wp('activeUserTasks')}/${currentUserPhone}` : activeJobType === 'old' ? `${wp('activeOldUserTasks')}/${currentUserPhone}` : `${wp('activePageCreateUserTasks')}/${currentUserPhone}`;
    const activeRef = ref(db, activePath);

    const accessOn =
      userData?.taskAccess !== false &&
      (activeJobType === 'new'
        ? userData?.newJobAccess !== false
        : activeJobType === 'old'
          ? userData?.oldJobAccess !== false
          : userData?.pageCreateAccess !== false);

    const chKey = push(ref(db, wp('reportedTasks'))).key;
    const chUpdates: Record<string, any> = { [activePath]: null };
    if (chKey) {
      chUpdates[`${wp('reportedTasks')}/${chKey}`] = {
        ...currentTask,
        user: currentUserPhone,
        userName: userData?.name || 'N/A',
        userUid: userData?.uid || 'N/A',
        jobType: activeJobType === 'new' ? 'New Job' : activeJobType === 'old' ? 'Old Job' : 'Page Create',
        time: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }),
        reportReason: 'Change',
        reportedAt: Date.now(),
        createdAt: Date.now(),
      };
    }
    await update(ref(db), chUpdates);
    setCurrentTask(null);
    showToast(t(lang, 'taskChanged'), 'info');
    if (accessOn) handleGetWorkData(activeJobType);
  };

  const handleSuspendId = async () => {
    if (!currentTask) return;
    setShowSuspendConfirm(false);
    const activePath =
      activeJobType === 'new'
        ? `${wp('activeUserTasks')}/${currentUserPhone}`
        : activeJobType === 'old'
          ? `${wp('activeOldUserTasks')}/${currentUserPhone}`
          : `${wp('activePageCreateUserTasks')}/${currentUserPhone}`;
    const activeRef = ref(db, activePath);

    const suKey = push(ref(db, wp('reportedTasks'))).key;
    const suUpdates: Record<string, any> = { [activePath]: null };
    if (suKey) {
      suUpdates[`${wp('reportedTasks')}/${suKey}`] = {
        ...currentTask,
        user: currentUserPhone,
        userName: userData?.name || 'N/A',
        userUid: userData?.uid || 'N/A',
        jobType: activeJobType === 'new' ? 'New Job' : activeJobType === 'old' ? 'Old Job' : 'Page Create',
        time: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }),
        reportReason: 'Suspend',
        reportedAt: Date.now(),
        createdAt: Date.now(),
      };
    }
    await update(ref(db), suUpdates);
    setCurrentTask(null);
    setSubUid('');
    setSubPass('');
    setSub2fa('');
    setSubMail('');
    setSubMailLink('');
    showToast(t(lang, 'suspendDone'), 'info');
  };

  const handleBackToDashboard = () => {
    setCurrentTask(null);
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!subUid.trim() || !subPass.trim() || !subMail.trim() || !subMailLink.trim()) {
      showToast(t(lang, 'fillAllFields'), 'error');
      return;
    }

    // Already-held task can always be submitted (Sheet-style save).
    // Job OFF only blocks taking NEW work, not finishing the current number.
    if (
      userData?.taskAccess === false ||
      (activeJobType === 'new' && userData?.newJobAccess === false) ||
      (activeJobType === 'old' && userData?.oldJobAccess === false) ||
      (activeJobType === 'page' && userData?.pageCreateAccess === false)
    ) {
      showToast(t(lang, 'taskAccessOff'), 'error');
      return;
    }

    if (!currentTask) {
      showToast(t(lang, 'alreadySubmitted'), 'error');
      return;
    }

    setSubmitting(true);
    try {
      const activePath =
        activeJobType === 'new'
          ? `${wp('activeUserTasks')}/${currentUserPhone}`
          : activeJobType === 'old'
            ? `${wp('activeOldUserTasks')}/${currentUserPhone}`
            : `${wp('activePageCreateUserTasks')}/${currentUserPhone}`;
      const activeRef = ref(db, activePath);

      const activeSnap = await get(activeRef);
      if (!activeSnap.exists()) {
        showToast(t(lang, 'alreadySubmitted'), 'error');
        setCurrentTask(null);
        return;
      }

      const taskData = {
        ...(currentTask || {}),
        user: currentUserPhone,
        jobType: activeJobType === 'new' ? 'New Job' : activeJobType === 'old' ? 'Old Job' : 'Page Create',
        userName: userData?.name || 'N/A',
        userUid: userData?.uid || 'N/A',
        uid: subUid.trim(),
        pass: subPass.trim(),
        key2fa: sub2fa.trim(),
        mail: subMail.trim(),
        mailLink: subMailLink.trim(),
        status: 'pending',
        time: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }),
        createdAt: Date.now(),
      };

      // One tick = one save (Google Sheet style): queue + count + clear active together
      const rowKey = push(ref(db, wp('submittedTasks'))).key;
      if (!rowKey) throw new Error('no key');

      const uSnap = await get(ref(db, `users/${currentUserPhone}`));
      const u = uSnap.exists() ? uSnap.val() || {} : {};
      const updates: Record<string, any> = {
        [`${wp('submittedTasks')}/${rowKey}`]: taskData,
        [activePath]: null,
        [`users/${currentUserPhone}/completedTasks`]: (Number(u.completedTasks) || 0) + 1,
      };
      if (activeJobType === 'new') {
        updates[`users/${currentUserPhone}/completedNewTasks`] = (Number(u.completedNewTasks) || 0) + 1;
      } else if (activeJobType === 'old') {
        updates[`users/${currentUserPhone}/completedOldTasks`] = (Number(u.completedOldTasks) || 0) + 1;
      } else {
        updates[`users/${currentUserPhone}/completedPageCreateTasks`] =
          (Number(u.completedPageCreateTasks || u.completedPageTasks) || 0) + 1;
      }

      await update(ref(db), updates);
      setCurrentTask(null);

      showToast(t(lang, 'taskSubmittedSuccess'), 'success');
      setSubUid('');
      setSubPass('');
      setSub2fa('');
      setSubMail('');
      setSubMailLink('');
    } catch (err) {
      console.error(err);
      showToast(t(lang, 'submitFailed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };


  const handleSubmitExtraId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (idSubmitting || !idFormType) return;
    const globOn = idFormType === 'bot' ? botNewIdEnabled : pcCloneEnabled;
    const memOn = idFormType === 'bot' ? userData?.botNewIdAccess !== false : userData?.pcCloneAccess !== false;
    if (userData?.taskAccess === false || !globOn || !memOn) {
      showToast(t(lang, 'taskAccessOff'), 'error');
      return;
    }
    if (!idUid.trim() || !idPass.trim() || !idMail.trim() || !idMailLink.trim()) {
      showToast(t(lang, 'idFillFields'), 'error');
      return;
    }
    setIdSubmitting(true);
    try {
      const kind = idFormType;
      const path = kind === 'bot' ? wp('botNewIdTasks') : wp('pcCloneTasks');
      const field = kind === 'bot' ? 'completedBotNewIds' : 'completedPcClones';
      const rowKey = push(ref(db, path)).key;
      if (!rowKey) throw new Error('no key');
      const uSnap = await get(ref(db, `users/${currentUserPhone}`));
      const u = uSnap.exists() ? uSnap.val() || {} : {};
      const payload = {
        user: currentUserPhone,
        userName: userData?.name || u.name || 'N/A',
        userUid: userData?.uid || u.uid || 'N/A',
        kind: kind === 'bot' ? 'Bot new id' : 'PC CLONE',
        uid: idUid.trim(),
        pass: idPass.trim(),
        key2fa: id2fa.trim(),
        mail: idMail.trim(),
        mailLink: idMailLink.trim(),
        status: 'pending',
        time: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }),
        createdAt: Date.now(),
      };
      await update(ref(db), {
        [`${path}/${rowKey}`]: payload,
        [`users/${currentUserPhone}/${field}`]: (Number(u[field]) || 0) + 1,
      });
      setIdUid('');
      setIdPass('');
      setId2fa('');
      setIdMail('');
      setIdMailLink('');
      setIdFormType(null);
      showToast(t(lang, 'idSubmitted'), 'success');
    } catch (err) {
      console.error(err);
      showToast(t(lang, 'submitFailed'), 'error');
    } finally {
      setIdSubmitting(false);
    }
  };


  const handleSendWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawEnabled) {
      showToast(t(lang, 'withdrawOff'), 'error');
      return;
    }

    if (wdAmount < 50 || wdAmount > (userData?.balance || 0)) {
      showToast(t(lang, 'minWithdrawAlert'), 'error');
      return;
    }

    if (!wdNumber.trim()) {
      showToast(t(lang, 'paymentNumberRequired'), 'error');
      return;
    }
    const wdDigits = wdNumber.replace(/\D/g, '');
    if (wdMethod === 'bkash' && wdDigits.length !== 11) {
      showToast(t(lang, 'bkashMust11'), 'error');
      return;
    }
    if (wdDigits.length > 11) {
      showToast(t(lang, 'phoneMax11'), 'error');
      return;
    }

    try {
      const wdKey = push(ref(db, wp('withdrawRequests'))).key;
      if (!wdKey) throw new Error('no wd key');
      await update(ref(db), {
        [`users/${currentUserPhone}/balance`]: (userData?.balance || 0) - wdAmount,
        [`${wp('withdrawRequests')}/${wdKey}`]: {
          user: currentUserPhone,
          userName: userData?.name || 'N/A',
          userUid: userData?.uid || 'N/A',
          method: wdMethod,
          number: wdNumber.trim(),
          amount: wdAmount,
          status: 'pending',
          time: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }),
          createdAt: serverTimestamp(),
        },
      });

      // Telegram Bot Notification (Best effort)
      const botToken = "8621026224:AAHn4jd0JhXwAGOqaEUTQ1LVK6BQbFflKXE";
      const chatId = "6946172535";
      const msg = `🔔 নতুন উইথড্র রিকোয়েস্ট!\n\n👤 নাম: ${userData?.name}\n🆔 UID: ${userData?.uid}\n📱 নম্বর: ${wdNumber} (${wdMethod.toUpperCase()})\n💰 পরিমাণ: ${wdAmount} ৳`;

      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
      }).catch(() => {});

      showToast(t(lang, 'withdrawSent'), 'success');
      setShowWithdrawModal(false);
      setWdNumber('');
    } catch (err) {
      console.error(err);
      showToast(t(lang, 'withdrawFailed'), 'error');
    }
  };

  const handleDeleteReport = async (type: 'new' | 'old' | 'page') => {
    if (confirm(t(lang, 'deleteReportConfirm'))) {
      const field = type === 'new' ? 'newReport' : type === 'old' ? 'oldReport' : 'pageCreateReport';
      const atField = type === 'new' ? 'newReportAt' : type === 'old' ? 'oldReportAt' : 'pageCreateReportAt';
      await update(ref(db, `users/${currentUserPhone}`), { [field]: null, [atField]: null });
      showToast(t(lang, 'reportDeleted'), 'info');
    }
  };

  const handleDeleteAdminMessage = async () => {
    if (confirm(t(lang, 'deleteReportConfirm'))) {
      await update(ref(db, `users/${currentUserPhone}`), { adminMessage: null, adminMessageAt: null });
      showToast(t(lang, 'reportDeleted'), 'info');
    }
  };

  // Periodic silent check while panel is open (in case user stays logged in past 12h)
  useEffect(() => {
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    const tick = async () => {
      if (!userData) return;
      const now = Date.now();
      const clearUpdates: Record<string, any> = {};
      if (userData.newReport && typeof userData.newReportAt === 'number' && userData.newReportAt > 0 && now - userData.newReportAt >= TWELVE_HOURS) {
        clearUpdates.newReport = null;
        clearUpdates.newReportAt = null;
      }
      if (userData.oldReport && typeof userData.oldReportAt === 'number' && userData.oldReportAt > 0 && now - userData.oldReportAt >= TWELVE_HOURS) {
        clearUpdates.oldReport = null;
        clearUpdates.oldReportAt = null;
      }
      if (userData.pageCreateReport && typeof userData.pageCreateReportAt === 'number' && userData.pageCreateReportAt > 0 && now - userData.pageCreateReportAt >= TWELVE_HOURS) {
        clearUpdates.pageCreateReport = null;
        clearUpdates.pageCreateReportAt = null;
      }
      if (userData.adminMessage && typeof userData.adminMessageAt === 'number' && userData.adminMessageAt > 0 && now - userData.adminMessageAt >= TWELVE_HOURS) {
        clearUpdates.adminMessage = null;
        clearUpdates.adminMessageAt = null;
      }
      if (userData.idHubReport && typeof userData.idHubReportAt === 'number' && userData.idHubReportAt > 0 && now - userData.idHubReportAt >= TWELVE_HOURS) {
        clearUpdates.idHubReport = null;
        clearUpdates.idHubReportAt = null;
        clearUpdates.idHubReportLabel = null;
      }
      if (userData.idHubSuspendReport && typeof userData.idHubSuspendReportAt === 'number' && userData.idHubSuspendReportAt > 0 && now - userData.idHubSuspendReportAt >= TWELVE_HOURS) {
        clearUpdates.idHubSuspendReport = null;
        clearUpdates.idHubSuspendReportAt = null;
      }
      if (userData.idHubBotReport && typeof userData.idHubBotReportAt === 'number' && userData.idHubBotReportAt > 0 && now - userData.idHubBotReportAt >= TWELVE_HOURS) {
        clearUpdates.idHubBotReport = null;
        clearUpdates.idHubBotReportAt = null;
      }
      if (userData.idHubPcReport && typeof userData.idHubPcReportAt === 'number' && userData.idHubPcReportAt > 0 && now - userData.idHubPcReportAt >= TWELVE_HOURS) {
        clearUpdates.idHubPcReport = null;
        clearUpdates.idHubPcReportAt = null;
      }
      if (Object.keys(clearUpdates).length > 0) {
        try {
          await update(ref(db, `users/${currentUserPhone}`), clearUpdates);
        } catch {
          // silent
        }
      }
    };
    const id = setInterval(tick, 60 * 1000); // check every minute, no UI
    return () => clearInterval(id);
  }, [userData, currentUserPhone]);

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-4">
      {/* Compact User Header Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900/90 dark:bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg backdrop-blur-sm"
      >
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Left: avatar + name/uid/phone — never covered */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-slate-950 font-bold text-lg shadow-md shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate max-w-[9rem] sm:max-w-none">
                  {userData?.name || t(lang, 'userFallback')}{userData?.starred ? <span className="text-amber-400 ml-1 text-sm">★</span> : null}
                </h2>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                  {userData?.uid || 'ID: -'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 truncate">
                {t(lang, 'phoneLabel')}: {userData?.phone || currentUserPhone}
              </p>
            </div>
          </div>

          {/* Right: balance + completed */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 bg-slate-800/60 p-2 sm:p-2.5 px-2.5 sm:px-3 rounded-xl border border-slate-700/60">
              <div className="text-right">
                <div className="text-[9px] sm:text-[10px] text-slate-400 font-medium leading-tight">
                  {t(lang, 'balance')}
                </div>
                <div className="text-xs sm:text-sm font-extrabold text-emerald-400 leading-tight">
                  {userData?.balance || 0}
                  <span className="text-[9px] text-slate-400 font-semibold ml-0.5">{t(lang, 'bdt')}</span>
                </div>
              </div>
              <div className="w-px h-7 bg-slate-700/60" />
              <div className="text-right">
                <div className="text-[9px] sm:text-[10px] text-slate-400 font-medium leading-tight">
                  {t(lang, 'completed')}
                </div>
                <div className="text-xs sm:text-sm font-extrabold text-amber-400 leading-tight">
                  {(Number(userData?.completedTasks) || 0) + (Number(userData?.completedBotNewIds) || 0) + (Number(userData?.completedPcClones) || 0)}
                  <span className="text-[9px] text-slate-400 font-semibold ml-0.5">{t(lang, 'pcs')}</span>
                </div>
              </div>
            </div>
            {/* New / Old / Page breakdown — full labels, own row */}
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-300 tracking-wide px-1 text-right leading-tight space-y-0.5">
              <div className="whitespace-nowrap">
                New={userData?.completedNewTasks || 0} Old={userData?.completedOldTasks || 0} Page={userData?.completedPageCreateTasks || (userData as any)?.completedPageTasks || 0}
              </div>
              <div className="whitespace-nowrap text-sky-300/90">
                Bot={userData?.completedBotNewIds || 0} PC={userData?.completedPcClones || 0}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Reports Section (New Job Report & Old Job Report) */}
      <AnimatePresence>
        {userData?.newReport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-violet-950/40 border border-violet-500/30 rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-violet-400" />
                {t(lang, 'newJobReport')}
              </h4>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHideNewReport(!hideNewReport)}
                  className="px-2 py-0.5 text-[11px] font-semibold rounded bg-violet-800/40 hover:bg-violet-700/40 text-violet-200 border border-violet-500/30 flex items-center gap-1"
                >
                  {hideNewReport ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {hideNewReport ? t(lang, 'show') : t(lang, 'hide')}
                </button>
                <button
                  onClick={() => handleDeleteReport('new')}
                  className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                  title="Delete Report"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {!hideNewReport && (
              <div className="text-xs text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-violet-500/20 whitespace-pre-wrap max-h-28 overflow-y-auto break-words">
                {userData.newReport}
              </div>
            )}
          </motion.div>
        )}

        {userData?.oldReport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-amber-400" />
                {t(lang, 'oldJobReport')}
              </h4>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHideOldReport(!hideOldReport)}
                  className="px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-800/40 hover:bg-amber-700/40 text-amber-200 border border-amber-500/30 flex items-center gap-1"
                >
                  {hideOldReport ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {hideOldReport ? t(lang, 'show') : t(lang, 'hide')}
                </button>
                <button
                  onClick={() => handleDeleteReport('old')}
                  className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {!hideOldReport && (
              <div className="text-xs text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-amber-500/20 whitespace-pre-wrap max-h-28 overflow-y-auto break-words">
                {userData.oldReport}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Create Report */}
      <AnimatePresence>
        {userData?.pageCreateReport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-teal-950/40 border border-teal-500/30 rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-teal-400" />
                {t(lang, 'pageCreateReport')}
              </h4>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setHidePageReport(!hidePageReport)}
                  className="px-2 py-0.5 text-[10px] font-bold rounded bg-teal-800/40 hover:bg-teal-700/40 text-teal-200 border border-teal-500/30 flex items-center gap-1"
                >
                  {hidePageReport ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {hidePageReport ? t(lang, 'show') : t(lang, 'hide')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteReport('page')}
                  className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {!hidePageReport && (
              <div className="text-xs text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-teal-500/20 whitespace-pre-wrap max-h-28 overflow-y-auto break-words">
                {userData.pageCreateReport}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin broadcast message (all users) */}
      <AnimatePresence>
        {userData?.adminMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-sky-400" />
                {t(lang, 'adminMessage')}
              </h4>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setHideAdminMessage(!hideAdminMessage)}
                  className="px-2 py-0.5 text-[10px] font-bold rounded bg-sky-800/40 hover:bg-sky-700/40 text-sky-200 border border-sky-500/30 flex items-center gap-1"
                >
                  {hideAdminMessage ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {hideAdminMessage ? t(lang, 'show') : t(lang, 'hide')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAdminMessage}
                  className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {!hideAdminMessage && (
              <div className="text-xs text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-sky-500/20 whitespace-pre-wrap max-h-28 overflow-y-auto break-words">
                {userData.adminMessage}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suspend Report — red */}
      <AnimatePresence>
        {userData?.suspendReport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-rose-950/50 border border-rose-500/40 rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-rose-400" />
                {t(lang, 'suspendReportTitle')}
              </h4>
              <button
                type="button"
                onClick={async () => {
                  if (confirm(t(lang, 'deleteReportConfirm'))) {
                    await update(ref(db, `users/${currentUserPhone}`), { suspendReport: null, suspendReportAt: null });
                    showToast(t(lang, 'reportDeleted'), 'info');
                  }
                }}
                className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xs text-rose-100 bg-rose-950/60 p-2.5 rounded-lg border border-rose-500/25 whitespace-pre-wrap max-h-28 overflow-y-auto break-words">
              {userData.suspendReport}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {userData?.idHubBotReport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-cyan-300">Bot new id Report</h4>
              <button
                type="button"
                onClick={async () => {
                  if (confirm(t(lang, 'deleteReportConfirm'))) {
                    await update(ref(db, `users/${currentUserPhone}`), { idHubBotReport: null, idHubBotReportAt: null });
                    showToast(t(lang, 'reportDeleted'), 'info');
                  }
                }}
                className="p-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xs text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-cyan-500/20 whitespace-pre-wrap max-h-28 overflow-y-auto break-words">
              {userData.idHubBotReport}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {userData?.idHubPcReport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-fuchsia-950/40 border border-fuchsia-500/30 rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-fuchsia-300">PC CLONE Report</h4>
              <button
                type="button"
                onClick={async () => {
                  if (confirm(t(lang, 'deleteReportConfirm'))) {
                    await update(ref(db, `users/${currentUserPhone}`), { idHubPcReport: null, idHubPcReportAt: null });
                    showToast(t(lang, 'reportDeleted'), 'info');
                  }
                }}
                className="p-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xs text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-fuchsia-500/20 whitespace-pre-wrap max-h-28 overflow-y-auto break-words">
              {userData.idHubPcReport}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {userData?.idHubReport && !userData?.idHubBotReport && !userData?.idHubPcReport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-cyan-300">{userData.idHubReportLabel || t(lang, 'idHubReportTitle')}</h4>
              <button
                type="button"
                onClick={async () => {
                  if (confirm(t(lang, 'deleteReportConfirm'))) {
                    await update(ref(db, `users/${currentUserPhone}`), { idHubReport: null, idHubReportAt: null });
                    showToast(t(lang, 'reportDeleted'), 'info');
                  }
                }}
                className="p-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xs text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-cyan-500/20 whitespace-pre-wrap max-h-28 overflow-y-auto break-words">
              {userData.idHubReport}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {userData?.idHubSuspendReport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-rose-950/50 border border-rose-400/40 rounded-xl p-3.5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-rose-300">{t(lang, 'idHubSuspendTitle')}</h4>
              <button
                type="button"
                onClick={async () => {
                  if (confirm(t(lang, 'deleteReportConfirm'))) {
                    await update(ref(db, `users/${currentUserPhone}`), { idHubSuspendReport: null, idHubSuspendReportAt: null });
                    showToast(t(lang, 'reportDeleted'), 'info');
                  }
                }}
                className="p-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xs text-rose-100 bg-rose-950/60 p-2.5 rounded-lg border border-rose-500/25 whitespace-pre-wrap max-h-28 overflow-y-auto break-words">
              {userData.idHubSuspendReport}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Dashboard Action Buttons (Shown when no active task selected) */}
      {!currentTask && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleGetWorkData('new')}
              className={`h-11 rounded-xl text-xs sm:text-sm font-bold tracking-wide flex items-center justify-center gap-2 border transition-all ${
                newJobEnabled && userData?.newJobAccess !== false
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-slate-950 border-sky-300/40 shadow-[0_0_18px_rgba(56,189,248,0.35)]'
                  : 'bg-slate-900/80 border-slate-700 text-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${newJobEnabled && userData?.newJobAccess !== false ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
              {t(lang, 'doNewJob')}
            </button>
            <button
              type="button"
              onClick={() => handleGetWorkData('old')}
              className={`h-11 rounded-xl text-xs sm:text-sm font-bold tracking-wide flex items-center justify-center gap-2 border transition-all ${
                oldJobEnabled && userData?.oldJobAccess !== false
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white border-violet-300/40 shadow-[0_0_18px_rgba(167,139,250,0.35)]'
                  : 'bg-slate-900/80 border-slate-700 text-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${oldJobEnabled && userData?.oldJobAccess !== false ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
              {t(lang, 'doOldJob')}
            </button>
            <button
              type="button"
              onClick={() => handleGetWorkData('page')}
              className={`h-11 rounded-xl text-xs sm:text-sm font-bold tracking-wide flex items-center justify-center gap-2 border transition-all ${
                pageCreateEnabled && userData?.pageCreateAccess !== false
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-slate-950 border-teal-300/40 shadow-[0_0_18px_rgba(45,212,191,0.35)]'
                  : 'bg-slate-900/80 border-slate-700 text-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${pageCreateEnabled && userData?.pageCreateAccess !== false ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
              {t(lang, 'pageCreateJob')}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (userData?.taskAccess === false || !botNewIdEnabled || userData?.botNewIdAccess === false) {
                  showToast(t(lang, 'taskAccessOff'), 'error');
                  return;
                }
                setIdFormType(idFormType === 'bot' ? null : 'bot');
              }}
              className={`h-11 rounded-xl text-xs sm:text-sm font-bold tracking-wide flex items-center justify-center gap-2 border transition-all ${
                userData?.taskAccess === false || !botNewIdEnabled || userData?.botNewIdAccess === false
                  ? 'bg-slate-900/80 border-slate-700 text-slate-500'
                  : 'bg-gradient-to-r from-cyan-500 to-sky-600 text-slate-950 border-cyan-300/40 shadow-[0_0_18px_rgba(34,211,238,0.35)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${userData?.taskAccess === false || !botNewIdEnabled || userData?.botNewIdAccess === false ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-emerald-400 shadow-[0_0_10px_#34d399]'}`} />
              {t(lang, 'botNewId')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (userData?.taskAccess === false || !pcCloneEnabled || userData?.pcCloneAccess === false) {
                  showToast(t(lang, 'taskAccessOff'), 'error');
                  return;
                }
                setIdFormType(idFormType === 'pc' ? null : 'pc');
              }}
              className={`h-11 rounded-xl text-xs sm:text-sm font-bold tracking-wide flex items-center justify-center gap-2 border transition-all ${
                userData?.taskAccess === false || !pcCloneEnabled || userData?.pcCloneAccess === false
                  ? 'bg-slate-900/80 border-slate-700 text-slate-500'
                  : 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white border-fuchsia-300/40 shadow-[0_0_18px_rgba(232,121,249,0.35)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${userData?.taskAccess === false || !pcCloneEnabled || userData?.pcCloneAccess === false ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-emerald-400 shadow-[0_0_10px_#34d399]'}`} />
              {t(lang, 'pcClone')}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!withdrawEnabled) {
                showToast(t(lang, 'withdrawOff'), 'error');
              }
              setShowWithdrawModal(!showWithdrawModal);
            }}
            className={`w-full h-11 rounded-xl text-xs sm:text-sm font-bold tracking-wide flex items-center justify-center gap-2 border transition-all ${
              withdrawEnabled
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 border-amber-300/40 shadow-[0_0_18px_rgba(251,191,36,0.35)]'
                : 'bg-slate-900/80 border-slate-700 text-slate-500'
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${withdrawEnabled ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
            {t(lang, 'withdraw')}
          </button>
        </div>
      )}

      <AnimatePresence>
        {idFormType && !currentTask && userData?.taskAccess !== false && (idFormType === 'bot' ? botNewIdEnabled && userData?.botNewIdAccess !== false : pcCloneEnabled && userData?.pcCloneAccess !== false) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                <Send className="w-4 h-4" />
                {idFormType === 'bot' ? t(lang, 'botNewId') : t(lang, 'pcClone')}
              </h3>
              <button type="button" onClick={() => setIdFormType(null)} className="text-slate-400 hover:text-slate-200 text-sm px-2">✕</button>
            </div>
            <form onSubmit={handleSubmitExtraId} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">UID</label>
                <input value={idUid} onChange={(e) => setIdUid(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100" required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{t(lang, 'password')}</label>
                <div className="relative">
                  <input type={showIdPass ? 'text' : 'password'} value={idPass} onChange={(e) => setIdPass(e.target.value)} className="w-full px-3 py-2 pr-9 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100" required />
                  <button type="button" onClick={() => setShowIdPass(!showIdPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                    {showIdPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">2FA</label>
                <input value={id2fa} onChange={(e) => setId2fa(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Mail</label>
                <input type="email" value={idMail} onChange={(e) => setIdMail(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100" required />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1"><ExternalLink className="w-3 h-3 text-sky-400" />{t(lang, 'mailLink')}</label>
                <input type="url" value={idMailLink} onChange={(e) => setIdMailLink(e.target.value)} placeholder="https://" className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100" required />
              </div>
              <button type="submit" disabled={idSubmitting} className="sm:col-span-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md disabled:opacity-50">
                {t(lang, 'idSubmit')}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Withdraw Modal / Panel */}
      <AnimatePresence>
        {showWithdrawModal && !currentTask && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/35 rounded-2xl p-4 sm:p-5 shadow-xl shadow-amber-950/20 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-amber-500/15 pb-3">
              <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/30">
                  <Wallet className="w-4 h-4 text-amber-400" />
                </span>
                {t(lang, 'withdrawRequest')}
              </h3>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {!withdrawEnabled ? (
              <div className="p-4 bg-gradient-to-b from-rose-500/15 to-slate-950 border border-rose-400/35 rounded-xl text-center space-y-1.5">
                <div className="font-bold text-rose-300 text-sm flex items-center justify-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {t(lang, 'withdrawOff')}
                </div>
                <p className="text-[11px] text-slate-300">{t(lang, 'withdrawSystemOffMsg')}</p>
              </div>
            ) : (
              <form onSubmit={handleSendWithdraw} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">
                      {t(lang, 'selectMethod')}
                    </label>
                    <select
                      value={wdMethod}
                      onChange={(e) => setWdMethod(e.target.value as 'bkash' | 'nagad')}
                      className="w-full h-10 px-3 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:border-amber-500/40 outline-none"
                    >
                      <option value="bkash">{t(lang, 'methodBkash')}</option>
                      <option value="nagad">{t(lang, 'methodNagad')}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">
                      {t(lang, 'paymentNum')}
                    </label>
                    <input
                      type="text"
                      value={wdNumber}
                      onChange={(e) => setWdNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="017xxxxxxxx"
                      maxLength={11}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">
                      {t(lang, 'amount')}
                    </label>
                    <input
                      type="number"
                      min={50}
                      value={wdAmount ? wdAmount : ''}
                      onChange={(e) => setWdAmount(Number(e.target.value))}
                      required
                      className="w-full h-10 px-3 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:border-amber-500/40 outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full h-11 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm shadow-md shadow-amber-900/30"
                >
                  {t(lang, 'sendRequest')}
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Work Task Screen */}
      {currentTask && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-4"
        >
          {/* Action Header for Task */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
            <h3 className="text-sm font-bold text-sky-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {activeJobType === 'new'
                ? t(lang, 'newJobInfo')
                : activeJobType === 'page'
                  ? t(lang, 'pageCreateInfo')
                  : t(lang, 'oldJobInfo')}
            </h3>
            <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:min-w-[320px]">
              <button
                type="button"
                onClick={() => setShowChangeConfirm(true)}
                className="relative h-10 rounded-xl overflow-hidden border border-orange-400/50 bg-gradient-to-r from-orange-600/30 to-amber-500/20 hover:from-orange-500/45 hover:to-amber-400/30 text-orange-50 text-[11px] sm:text-xs font-bold tracking-wide transition-all duration-200 shadow-[0_0_12px_rgba(251,146,60,0.15)] hover:shadow-[0_0_18px_rgba(251,146,60,0.28)] active:scale-[0.98]"
              >
                <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-300 to-amber-500 shadow-[0_0_8px_rgba(251,146,60,0.8)]" />
                <span className="absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-white/10 pointer-events-none" />
                <span className="relative z-[1] flex items-center justify-center h-full px-2">
                  {t(lang, 'changeTask')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowSuspendConfirm(true)}
                className="relative h-10 rounded-xl overflow-hidden border border-rose-400/50 bg-gradient-to-r from-rose-700/35 to-rose-500/20 hover:from-rose-600/50 hover:to-rose-400/30 text-rose-50 text-[11px] sm:text-xs font-bold tracking-wide transition-all duration-200 shadow-[0_0_12px_rgba(244,63,94,0.15)] hover:shadow-[0_0_18px_rgba(244,63,94,0.28)] active:scale-[0.98]"
              >
                <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-300 to-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                <span className="absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-white/10 pointer-events-none" />
                <span className="relative z-[1] flex items-center justify-center h-full px-2">
                  {t(lang, 'suspendId')}
                </span>
              </button>
              <button
                type="button"
                onClick={handleBackToDashboard}
                className="relative h-10 rounded-xl overflow-hidden border border-sky-400/45 bg-gradient-to-r from-sky-700/30 to-slate-800/80 hover:from-sky-600/45 hover:to-slate-700/80 text-sky-50 text-[11px] sm:text-xs font-bold tracking-wide transition-all duration-200 shadow-[0_0_12px_rgba(56,189,248,0.12)] hover:shadow-[0_0_18px_rgba(56,189,248,0.25)] active:scale-[0.98]"
              >
                <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-sky-300 to-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                <span className="absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-white/10 pointer-events-none" />
                <span className="relative z-[1] flex items-center justify-center h-full px-2">
                  {t(lang, 'backToDash')}
                </span>
              </button>
            </div>
          </div>

          {/* Task Data Grid Box with Individual 1-Click Copy Buttons */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 space-y-2.5">
            {activeJobType === 'new' && (
              <>
                <TaskDataItem title={t(lang, 'firstName')} value={currentTask.fn} onCopy={() => handleCopyText(currentTask.fn, 'First Name')} />
                <TaskDataItem title={t(lang, 'lastName')} value={currentTask.ln} onCopy={() => handleCopyText(currentTask.ln, 'Last Name')} />
                <TaskDataItem title={t(lang, 'fullNameField')} value={currentTask.fuln} onCopy={() => handleCopyText(currentTask.fuln, 'Full Name')} />
                <TaskDataItem title={t(lang, 'gender')} value={currentTask.gen} onCopy={() => handleCopyText(currentTask.gen, 'Gender')} />
                <TaskDataItem title={t(lang, 'state')} value={currentTask.st} onCopy={() => handleCopyText(currentTask.st, 'State')} />
                <TaskDataItem title={t(lang, 'dob')} value={currentTask.dob} onCopy={() => handleCopyText(currentTask.dob, 'Date of Birth')} />
                <TaskDataItem title={t(lang, 'checker')} value={currentTask.checker} highlight hideCopy />
                <TaskDataItem title={t(lang, 'listing')} value={currentTask.listing} highlight hideCopy />
              </>
            )}

            <TaskDataItem title={t(lang, 'phoneNum')} value={currentTask.phone} onCopy={() => handleCopyText(currentTask.phone, 'Phone Number')} isPhone />

            {/* OTP Inbox Viewer — Electron webview + mobile iframe/Open */}
            <OtpInbox
              task={currentTask}
              inbox={currentTask.inbox}
              lang={lang}
              showToast={showToast}
            />
          </div>

          {/* Task Submission Form */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
              <Send className="w-4 h-4" />
              {t(lang, 'submitTask')}
            </h3>

            <form onSubmit={handleSubmitTask} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-sky-400" />
                  UID
                </label>
                <input
                  type="text"
                  value={subUid}
                  onChange={(e) => setSubUid(e.target.value)}
                  placeholder="UID enter"
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Key className="w-3 h-3 text-sky-400" />
                  {t(lang, 'pass')}
                </label>
                <div className="relative">
                  <input
                    type={showSubPass ? 'text' : 'password'}
                    value={subPass}
                    onChange={(e) => setSubPass(e.target.value)}
                    placeholder="Password"
                    required
                    className="w-full px-3 py-2 pr-9 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSubPass((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-sky-300"
                    tabIndex={-1}
                    aria-label={showSubPass ? 'Hide password' : 'Show password'}
                  >
                    {showSubPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-sky-400" />
                  {t(lang, 'twoFA')}
                </label>
                <input
                  type="text"
                  value={sub2fa}
                  onChange={(e) => setSub2fa(e.target.value)}
                  placeholder="2FA Key"
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-sky-400" />
                  {t(lang, 'mail')}
                </label>
                <input
                  type="email"
                  value={subMail}
                  onChange={(e) => setSubMail(e.target.value)}
                  placeholder="Email"
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3 text-sky-400" />
                  {t(lang, 'mailLink')}
                </label>
                <input
                  type="url"
                  value={subMailLink}
                  onChange={(e) => setSubMailLink(e.target.value)}
                  placeholder="Mail inbox link (https://...)"
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="sm:col-span-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all disabled:opacity-50"
              >
                {t(lang, 'submitBtn')}
              </button>
            </form>
          </div>
        </motion.div>
      )}

      {/* Withdraw History Table */}
      {!currentTask && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-2">
            <History className="w-4 h-4" />
            {t(lang, 'withdrawHistory')}
          </h4>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="p-2">{t(lang, 'methodAndNum')}</th>
                  <th className="p-2">{t(lang, 'amount')}</th>
                  <th className="p-2 text-center">{t(lang, 'status')}</th>
                </tr>
              </thead>
              <tbody>
                {withdrawHistory.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-500">
                      {t(lang, 'noHistory')}
                    </td>
                  </tr>
                ) : (
                  withdrawHistory.map((item) => (
                    <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="p-2">
                        <span className="font-bold text-slate-200">{item.method.toUpperCase()}</span>
                        <div className="text-[10px] text-slate-400">{item.number}</div>
                      </td>
                      <td className="p-2 font-bold text-emerald-400">{item.amount} ৳</td>
                      <td className="p-2 text-center">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            item.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : item.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {item.status === 'pending' ? '⏳ Pending' : item.status === 'approved' ? '✅ Paid' : '❌ Rejected'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Compact Change Task confirmation */}
      <AnimatePresence>
        {showChangeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4"
            onClick={() => setShowChangeConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[260px] bg-slate-900 border border-orange-500/35 rounded-2xl p-4 shadow-xl space-y-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-400/40">
                  <Repeat2 className="w-4.5 h-4.5 text-orange-300" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-100">{t(lang, 'changeTaskTitle')}</p>
                  <p className="text-[11px] text-slate-400 leading-snug">{t(lang, 'changeTaskHint')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowChangeConfirm(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700"
                >
                  {t(lang, 'btnCancel')}
                </button>
                <button
                  type="button"
                  onClick={handleChangeTask}
                  className="flex-1 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold"
                >
                  {t(lang, 'btnConfirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suspend ID confirmation */}
      <AnimatePresence>
        {showSuspendConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4"
            onClick={() => setShowSuspendConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[260px] bg-slate-900 border border-rose-500/35 rounded-2xl p-4 shadow-xl space-y-3"
            >
              <div>
                <p className="text-sm font-bold text-slate-100">{t(lang, 'suspendId')}</p>
                <p className="text-[11px] text-slate-400 leading-snug mt-1">{t(lang, 'suspendConfirm')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSuspendConfirm(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700"
                >
                  {t(lang, 'btnCancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSuspendId}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  {t(lang, 'btnConfirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface TaskDataItemProps {
  title: string;
  value?: string;
  onCopy?: () => void;
  highlight?: boolean;
  isPhone?: boolean;
  hideCopy?: boolean;
}

const TaskDataItem: React.FC<TaskDataItemProps> = ({ title, value, onCopy, highlight, isPhone, hideCopy }) => {
  return (
    <div className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
      isPhone ? 'bg-emerald-950/30 border-emerald-500/30' : highlight ? 'bg-sky-950/30 border-sky-500/30' : 'bg-slate-800/40 border-slate-700/60'
    }`}>
      <div className="min-w-0 pr-2 flex-1">
        <div className="text-[10px] font-semibold text-slate-400">{title}</div>
        <div className={`text-xs font-bold truncate mt-0.5 ${isPhone ? 'text-emerald-400 font-mono text-sm' : highlight ? 'text-sky-300' : 'text-slate-100'}`}>
          {value || '-'}
        </div>
      </div>
      {!hideCopy && onCopy && (
        <button
          onClick={onCopy}
          className="px-2.5 py-1 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-md shrink-0 flex items-center gap-1 shadow-sm transition-colors"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      )}
    </div>
  );
};
