import React, { useState, useEffect } from 'react';
import { Language, Theme, SystemSettings } from './types';
import { db, ADMIN_PASS, isHeaderTask, sanitizeTaskData, APP_VERSION, APP_NAME, isAppOutdated, compareVersions, wp } from './lib/firebase';
import { ref, onValue, get, set, update } from 'firebase/database';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { UserDashboard } from './components/UserDashboard';
import { AdminPanel } from './components/AdminPanel';
import { Toast, ToastMessage } from './components/Toast';
import { motion, AnimatePresence } from 'motion/react';


class AdminErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }
  componentDidCatch(error: Error) {
    console.error('AdminPanel crash:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-lg mx-auto mt-10 p-6 bg-rose-950/40 border border-rose-500/40 rounded-2xl text-center space-y-3">
          <p className="text-rose-300 font-bold text-sm">এডমিন প্যানেল লোড করতে সমস্যা হয়েছে</p>
          <p className="text-xs text-slate-400 font-mono break-all">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl"
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('appLang') as Language) || 'en';
  });

  const [theme] = useState<Theme>('dark');

  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem('currentUser') || null;
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [appBlocked, setAppBlocked] = useState(false);
  const [minRequiredVersion, setMinRequiredVersion] = useState('');

  // System Stock & Completed Counters for Live Top Banner
  const [newStockCount, setNewStockCount] = useState(0);
  const [oldStockCount, setOldStockCount] = useState(0);
  const [pageStockCount, setPageStockCount] = useState(0);

  // Submitted Tasks Counter Breakdown
  const [submittedTasksCount, setSubmittedTasksCount] = useState(0);
  const [submittedNewCount, setSubmittedNewCount] = useState(0);
  const [submittedOldCount, setSubmittedOldCount] = useState(0);
  const [submittedPageCount, setSubmittedPageCount] = useState(0);
  const [submittedBotCount, setSubmittedBotCount] = useState(0);
  const [submittedPcCount, setSubmittedPcCount] = useState(0);

  // Completed Tasks Counter Breakdown
  const [completedTasksCount, setCompletedTasksCount] = useState(0);
  const [completedNewCount, setCompletedNewCount] = useState(0);
  const [completedOldCount, setCompletedOldCount] = useState(0);
  const [completedPageCount, setCompletedPageCount] = useState(0);
  const [completedBotCount, setCompletedBotCount] = useState(0);
  const [completedPcCount, setCompletedPcCount] = useState(0);

  // System Settings (New Job, Old Job, Withdraw status)
  const [settings, setSettings] = useState<SystemSettings>({
    newJob: true,
    oldJob: true,
    pageCreate: true,
    withdraw: true,
    botNewId: true,
    pcClone: true,
  });

  // Apply Theme class
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
    root.removeAttribute('data-theme');
    localStorage.setItem('appTheme', 'dark');
  }, []);

  // Force-update / minimum version gate (blocks ALL old apps)
  useEffect(() => {
    const unsub = onValue(ref(db, 'settings'), (snap) => {
      const val = snap.exists() ? snap.val() : {};
      const minV = val?.minAppVersion ? String(val.minAppVersion).trim() : '';
      setMinRequiredVersion(minV);
      // Block only older builds — same or newer version always allowed
      if (isAppOutdated(APP_VERSION, minV)) {
        setAppBlocked(true);
      } else {
        setAppBlocked(false);
      }
    });
    return () => unsub();
  }, []);

  // Any launch of THIS app raises minAppVersion so older APK/EXE cannot login or work
  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(db, 'settings/minAppVersion'));
        const remote = snap.exists() ? String(snap.val()).trim() : '';
        // only raise minimum, never lower
        if (!remote || isAppOutdated(remote, APP_VERSION)) {
          await set(ref(db, 'settings/minAppVersion'), APP_VERSION);
        }
      } catch (_) { /* ignore offline */ }
    })();
  }, []);

  // One-time: move work data to app_v3 + invalidate legacy passwords so OLD apps die
  useEffect(() => {
    if (currentUser !== 'admin') return;
    (async () => {
      try {
        const flagSnap = await get(ref(db, 'settings/v3Migrated'));
        if (flagSnap.exists() && flagSnap.val() === true) return;

        const legacyKeys = [
          'sheetTasks', 'oldSheetTasks', 'pageCreateSheetTasks',
          'activeUserTasks', 'activeOldUserTasks', 'activePageCreateUserTasks',
          'submittedTasks', 'reportedTasks', 'revokedTasks', 'withdrawRequests'
        ];
        for (const key of legacyKeys) {
          const oldSnap = await get(ref(db, key));
          const newSnap = await get(ref(db, wp(key)));
          if (oldSnap.exists() && !newSnap.exists()) {
            await set(ref(db, wp(key)), oldSnap.val());
          }
          // Clear legacy so old apps see empty stock / no active work
          if (oldSnap.exists()) {
            await set(ref(db, key), null);
          }
        }

        // Invalidate legacy passwords (old apps check `pass` only)
        const usersSnap = await get(ref(db, 'users'));
        if (usersSnap.exists()) {
          const users = usersSnap.val() || {};
          const updates: Record<string, any> = {};
          for (const phone of Object.keys(users)) {
            const u = users[phone];
            if (!u) continue;
            if (u.pass_v3) {
              updates[`users/${phone}/pass`] = '!';
            } else if (u.pass && u.pass !== '!') {
              updates[`users/${phone}/pass_v3`] = u.pass;
              updates[`users/${phone}/pass`] = '!';
            }
          }
          if (Object.keys(updates).length) {
            await update(ref(db), updates);
          }
        }

        await set(ref(db, 'settings/v3Migrated'), true);
        await set(ref(db, 'settings/minAppVersion'), APP_VERSION);
      } catch (e) {
        console.error('v3 migration failed', e);
      }
    })();
  }, [currentUser]);



  // Persist Language
  useEffect(() => {
    localStorage.setItem('appLang', lang);
  }, [lang]);

  // Toast Helper
  const showToast = (text: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Realtime Listeners for Live Counter & Settings
  useEffect(() => {
    const unsubSettings = onValue(ref(db, 'settings'), (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setSettings({
          newJob: val.newJob !== undefined ? val.newJob : true,
          oldJob: val.oldJob !== undefined ? val.oldJob : true,
          pageCreate: val.pageCreate !== undefined ? val.pageCreate : true,
          withdraw: val.withdraw !== undefined ? val.withdraw : true,
          botNewId: val.botNewId !== undefined ? val.botNewId : true,
          pcClone: val.pcClone !== undefined ? val.pcClone : true,
        });
      }
    });

    const unsubNewStock = onValue(ref(db, wp('sheetTasks')), (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        const validCount = Object.values(val).filter((t: any) => !isHeaderTask(sanitizeTaskData(t))).length;
        setNewStockCount(validCount);
      } else {
        setNewStockCount(0);
      }
    });

    const unsubOldStock = onValue(ref(db, wp('oldSheetTasks')), (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        const validCount = Object.values(val).filter((t: any) => !isHeaderTask(sanitizeTaskData(t))).length;
        setOldStockCount(validCount);
      } else {
        setOldStockCount(0);
      }
    });

    const unsubPageStock = onValue(ref(db, wp('pageCreateSheetTasks')), (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        const validCount = Object.values(val).filter((t: any) => !isHeaderTask(sanitizeTaskData(t))).length;
        setPageStockCount(validCount);
      } else {
        setPageStockCount(0);
      }
    });

    const unsubSubmitted = onValue(ref(db, wp('submittedTasks')), (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        let newC = 0;
        let oldC = 0;
        let pageC = 0;
        Object.values(val).forEach((t: any) => {
          const jt = String(t.jobType || '');
          if (jt === 'Page Create') pageC++;
          else if (jt === 'New Job' || jt === 'new' || (!t.jobType && (Boolean(t.fuln) || Boolean(t.listing) || Boolean(t.checker)))) newC++;
          else oldC++;
        });
        setSubmittedNewCount(newC);
        setSubmittedOldCount(oldC);
        setSubmittedPageCount(pageC);
        setSubmittedTasksCount(newC + oldC + pageC);
      } else {
        setSubmittedNewCount(0);
        setSubmittedOldCount(0);
        setSubmittedPageCount(0);
        setSubmittedTasksCount(0);
      }
    });

    const unsubBotIds = onValue(ref(db, wp('botNewIdTasks')), (snap) => {
      setSubmittedBotCount(snap.exists() ? Object.keys(snap.val() || {}).length : 0);
    });
    const unsubPcIds = onValue(ref(db, wp('pcCloneTasks')), (snap) => {
      setSubmittedPcCount(snap.exists() ? Object.keys(snap.val() || {}).length : 0);
    });

    const unsubUsers = onValue(ref(db, 'users'), (snap) => {
      if (snap.exists()) {
        let total = 0;
        let totalNew = 0;
        let totalOld = 0;
        let totalPage = 0;
        let totalBot = 0;
        let totalPc = 0;
        Object.values(snap.val()).forEach((u: any) => {
          const bot = Number(u.completedBotNewIds) || 0;
          const pc = Number(u.completedPcClones) || 0;
          total += (Number(u.completedTasks) || 0) + bot + pc;
          totalNew += Number(u.completedNewTasks) || 0;
          totalOld += Number(u.completedOldTasks) || 0;
          totalPage += Number(u.completedPageCreateTasks || u.completedPageTasks) || 0;
          totalBot += bot;
          totalPc += pc;
        });
        setCompletedNewCount(totalNew);
        setCompletedOldCount(totalOld);
        setCompletedPageCount(totalPage);
        setCompletedBotCount(totalBot);
        setCompletedPcCount(totalPc);
        setCompletedTasksCount(total);
      } else {
        setCompletedNewCount(0);
        setCompletedOldCount(0);
        setCompletedPageCount(0);
        setCompletedBotCount(0);
        setCompletedPcCount(0);
        setCompletedTasksCount(0);
      }
    });

    return () => {
      unsubSettings();
      unsubNewStock();
      unsubOldStock();
      unsubPageStock();
      unsubSubmitted();
      unsubUsers();
      unsubBotIds();
      unsubPcIds();
    };
  }, []);

  // Realtime deletion check — only logout after confirmed delete (not offline/resume flicker)
  useEffect(() => {
    if (!currentUser || currentUser === 'admin') return;

    const phone = currentUser;
    const userRef = ref(db, `users/${phone}`);
    let seenExists = false;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubSingleUser = onValue(
      userRef,
      (snap) => {
        if (snap.exists()) {
          seenExists = true;
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingTimer = null;
          }
          return;
        }

        // Never logout if we never successfully saw this user this session
        // (cold start / brief null before cache) — verify with get() after delay
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(async () => {
          try {
            // Offline / flaky mobile network → do not kick member
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
            const check = await get(userRef);
            if (check.exists()) {
              seenExists = true;
              return;
            }
            // Still missing: only logout if we had seen the account before OR localStorage still this user
            const still = localStorage.getItem('currentUser');
            if (still !== phone) return;
            if (!seenExists) {
              // one more delayed check for slow Firebase restore on app resume
              await new Promise((r) => setTimeout(r, 2000));
              const check2 = await get(userRef);
              if (check2.exists()) {
                seenExists = true;
                return;
              }
              if (localStorage.getItem('currentUser') !== phone) return;
            }
            setCurrentUser(null);
            localStorage.removeItem('currentUser');
            showToast('আপনার অ্যাকাউন্টটি সিস্টেম থেকে মুছে ফেলা হয়েছে!', 'error');
          } catch {
            // network error — keep session
          }
        }, 3000);
      },
      () => {
        // permission/network error on listener — do not logout
      }
    );

    return () => {
      unsubSingleUser();
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [currentUser]);

  // Realtime Admin Password change check (Auto-logout other admins when password changes)
  useEffect(() => {
    if (currentUser !== 'admin') return;

    const unsubAdminPass = onValue(ref(db, 'settings/adminPass'), (snap) => {
      const activeAdminPass = snap.exists() ? String(snap.val()).trim() : ADMIN_PASS;
      const mySessionPass = localStorage.getItem('adminSessionPass');
      if (mySessionPass && mySessionPass !== activeAdminPass) {
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
        localStorage.removeItem('adminSessionPass');
        showToast('এডমিন পাসওয়ার্ড পরিবর্তন করা হয়েছে! পুনরায় লগইন করুন।', 'error');
      }
    });

    return () => unsubAdminPass();
  }, [currentUser]);

  const handleToggleTheme = () => {};

  const handleSwitchLang = (newLang: Language) => {
    setLang(newLang);
  };

  const handleLoginSuccess = (phone: string) => {
    setCurrentUser(phone);
    localStorage.setItem('currentUser', phone);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('adminSessionPass');
    showToast('লগআউট করা হয়েছে!', 'info');
  };

  const handleSecretAdmin = async () => {
    const pass = prompt('Admin Password:');
    if (!pass) return;
    try {
      const snap = await get(ref(db, 'settings/adminPass'));
      const activeAdminPass = snap.exists() ? String(snap.val()).trim() : ADMIN_PASS;
      if (pass.trim() === activeAdminPass) {
        localStorage.setItem('adminSessionPass', pass.trim());
        setCurrentUser('admin');
        localStorage.setItem('currentUser', 'admin');
        showToast('এডমিন মোড সক্রিয় হয়েছে!', 'success');
      } else {
        showToast('ভুল পাসওয়ার্ড!', 'error');
      }
    } catch (err) {
      if (pass.trim() === ADMIN_PASS) {
        localStorage.setItem('adminSessionPass', pass.trim());
        setCurrentUser('admin');
        localStorage.setItem('currentUser', 'admin');
        showToast('এডমিন মোড সক্রিয় হয়েছে!', 'success');
      } else {
        showToast('ভুল পাসওয়ার্ড!', 'error');
      }
    }
  };

  if (appBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0812] text-slate-100">
        <div className="max-w-md w-full rounded-2xl border border-amber-500/40 bg-[#120e1c] p-6 text-center space-y-3 shadow-2xl">
          <div className="text-3xl">🔒</div>
          <h1 className="text-lg font-extrabold text-amber-300">{APP_NAME}</h1>
          <p className="text-sm font-bold text-rose-300">Update Required</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            এই অ্যাপের ভার্সন পুরনো। আর ব্যবহার করা যাবে না।
            নতুন ভার্সন ডাউনলোড ও ইনস্টল করুন।
            This version is outdated. Please install the latest app.
          </p>
          <div className="text-[11px] text-slate-500 font-mono space-y-1 pt-2 border-t border-slate-800">
            <div>Your version: <span className="text-rose-300">{APP_VERSION}</span></div>
            <div>Required: <span className="text-emerald-300">{minRequiredVersion || 'latest'}</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-colors duration-300 text-slate-100">
      {/* Top Header & Live Counter Bar */}
      <Header
        lang={lang}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSwitchLang={handleSwitchLang}
        currentUser={currentUser}
        onLogout={handleLogout}
        onSecretAdmin={handleSecretAdmin}
        newStockCount={newStockCount}
        oldStockCount={oldStockCount}
        pageStockCount={pageStockCount}
        completedTasksCount={completedTasksCount}
        completedNewCount={completedNewCount}
        completedOldCount={completedOldCount}
        completedPageCount={completedPageCount}
        submittedTasksCount={submittedTasksCount + submittedBotCount + submittedPcCount}
        submittedNewCount={submittedNewCount}
        submittedOldCount={submittedOldCount}
        submittedPageCount={submittedPageCount}
        submittedBotCount={submittedBotCount}
        submittedPcCount={submittedPcCount}
        completedBotCount={completedBotCount}
        completedPcCount={completedPcCount}
      />

      {/* Main View Router */}
      <main className="pb-10">
        <AnimatePresence mode="wait">
          {!currentUser ? (
            <motion.div
              key="auth"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <Auth
                lang={lang}
                onLoginSuccess={handleLoginSuccess}
                showToast={showToast}
                onSecretAdmin={handleSecretAdmin}
              />
            </motion.div>
          ) : currentUser === 'admin' ? (
            <motion.div
              key="admin"
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.15 }}
            >
              <AdminErrorBoundary>
                <AdminPanel
                  lang={lang}
                  onGoBack={() => setCurrentUser(null)}
                  showToast={showToast}
                  settings={settings}
                />
              </AdminErrorBoundary>
            </motion.div>
          ) : (
            <motion.div
              key="user"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <UserDashboard
                lang={lang}
                currentUserPhone={currentUser}
                showToast={showToast}
                botNewIdEnabled={settings.botNewId !== false}
                pcCloneEnabled={settings.pcClone !== false}
                newJobEnabled={settings.newJob}
                oldJobEnabled={settings.oldJob}
                pageCreateEnabled={settings.pageCreate !== false}
                withdrawEnabled={settings.withdraw}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Toast Notifications */}
      <Toast toasts={toasts} onDismiss={handleDismissToast} />
    </div>
  );
}
