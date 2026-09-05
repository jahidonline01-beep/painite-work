import React, { useState } from 'react';
import { Language } from '../types';
import { t } from '../lib/i18n';
import { ADMIN_PASS, db, wp } from '../lib/firebase';
import { ref, get, set, update, remove } from 'firebase/database';
import { motion, AnimatePresence } from 'motion/react';
import { User, Phone, Lock, ArrowRight, ShieldCheck, UserPlus, KeyRound, X, Eye, EyeOff } from 'lucide-react';
import logoImg from '../../icon.png';

interface AuthProps {
  lang: Language;
  onLoginSuccess: (userPhone: string) => void;
  showToast: (text: string, type: 'success' | 'error' | 'info') => void;
  onSecretAdmin: () => void;
}

export const Auth: React.FC<AuthProps> = ({
  lang,
  onLoginSuccess,
  showToast,
  onSecretAdmin,
}) => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [adminPermit, setAdminPermit] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Admin Modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPass, setAdminPass] = useState('');

  const checkAdminPass = async (passInput: string): Promise<boolean> => {
    try {
      const snap = await get(ref(db, 'settings/adminPass'));
      const activeAdminPass = snap.exists() ? String(snap.val()).trim() : ADMIN_PASS;
      return passInput.trim() === activeAdminPass;
    } catch (err) {
      return passInput.trim() === ADMIN_PASS;
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const nm = name.trim();
    const cleanPhone = phone.replace(/\D/g, '');
    if (!nm || !cleanPhone || !password.trim()) {
      showToast('সব ঘর সঠিকভাবে পূরণ করুন!', 'error');
      return;
    }
    if (nm.length > 11 || !/^[A-Za-z0-9 .'-]+$/.test(nm)) {
      showToast('নাম শুধু ইংরেজি, সর্বোচ্চ ১১ অক্ষর', 'error');
      return;
    }
    if (cleanPhone.length > 11) {
      showToast('ফোন নম্বর সর্বোচ্চ ১১ ডিজিট', 'error');
      return;
    }

    setLoading(true);
    try {
      const userRef = ref(db, `users/${cleanPhone}`);
      const snap = await get(userRef);

      if (snap.exists()) {
        showToast('এই নম্বরটি আগেই রেজিস্টার্ড!', 'error');
        setLoading(false);
        return;
      }

      const permit = adminPermit.trim().toUpperCase().replace(/\s+/g, '');
      const pSnap = await get(ref(db, wp('memberPermits')));
      const pMap = pSnap.val() || {};
      const pKey = Object.keys(pMap).find((k) => String(k).toUpperCase() === permit && !pMap[k]?.used);
      if (!pKey) {
        showToast(t(lang, 'adminPermitInvalid'), 'error');
        setLoading(false);
        return;
      }
      await remove(ref(db, `${wp('memberPermits')}/${pKey}`));

      const autoUid = "UID-" + Math.floor(100000 + Math.random() * 900000);
      await set(userRef, {
        name: name.trim(),
        phone: cleanPhone,
        pass: '!',
        pass_v3: password.trim(),
        uid: autoUid,
        balance: 0,
        completedTasks: 0,
        isApproved: false,
        taskAccess: true,
      });

      showToast(`রেজিস্ট্রেশন সফল! ID: ${autoUid}`, 'success');
      setName('');
      setPassword('');
      setAdminPermit('');
      setIsLoginView(true);
    } catch (err) {
      console.error(err);
      showToast('রেজিস্ট্রেশনে সমস্যা হয়েছে!', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim();
    const cleanPass = password.trim();

    if (!cleanPhone || !cleanPass) {
      showToast('নম্বর ও পাসওয়ার্ড দিন!', 'error');
      return;
    }

    setLoading(true);
    try {
      const userSnap = await get(ref(db, `users/${cleanPhone}`));
      if (userSnap.exists()) {
        const uData = userSnap.val();
        // New apps only: pass_v3. Migrate once from legacy pass, then invalidate legacy.
        const okV3 = uData.pass_v3 && String(uData.pass_v3) === cleanPass;
        const okLegacy = uData.pass && uData.pass !== '!' && String(uData.pass) === cleanPass;
        if (okV3 || okLegacy) {
          if (!uData.isApproved) {
            showToast('একাউন্ট এখনো এডমিন কর্তৃক এপ্রুভ হয়নি!', 'error');
            setLoading(false);
            return;
          }
          if (!okV3 && okLegacy) {
            await update(ref(db, `users/${cleanPhone}`), { pass_v3: cleanPass, pass: '!' });
          }
          onLoginSuccess(cleanPhone);
          showToast('লগইন সফল!', 'success');
        } else {
          showToast('ভুল পাসওয়ার্ড!', 'error');
        }
      } else {
        showToast('ব্যবহারকারী পাওয়া যায়নি বা একাউন্ট ডিলিট করা হয়েছে!', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('লগইনে সমস্যা হয়েছে!', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdminClick = async () => {
    if (password.trim()) {
      const isAdminPass = await checkAdminPass(password);
      if (isAdminPass) {
        localStorage.setItem('adminSessionPass', password.trim());
        onLoginSuccess('admin');
        showToast('এডমিন লগইন সফল!', 'success');
        return;
      }
    }
    setShowAdminModal(true);
  };

  const handleAdminModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const isValid = await checkAdminPass(adminPass);
    setLoading(false);
    if (isValid) {
      localStorage.setItem('adminSessionPass', adminPass.trim());
      onLoginSuccess('admin');
      showToast('এডমিন লগইন সফল!', 'success');
      setShowAdminModal(false);
      setAdminPass('');
    } else {
      showToast('ভুল এডমিন পাসওয়ার্ড!', 'error');
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center p-3 sm:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-[#120e1c]/98 border border-amber-500/25 rounded-2xl shadow-xl p-5 sm:p-7 backdrop-blur-sm text-slate-100"
      >
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-slate-950 border border-amber-500/40 p-1.5 shadow-2xl shadow-amber-500/20 mb-4 flex items-center justify-center transition-transform hover:scale-105">
            <img src={logoImg} alt="Painite Work Logo" className="w-full h-full object-contain rounded-xl sm:rounded-2xl" />
          </div>
          <div className="inline-flex p-1.5 px-3 rounded-full bg-slate-800/80 text-sky-400 border border-slate-700 text-xs mb-2 items-center gap-1.5 font-medium">
            {isLoginView ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <UserPlus className="w-4 h-4 text-sky-400" />}
            <span>PAINITE WORK</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            {isLoginView ? t(lang, 'accountLogin') : t(lang, 'accountReg')}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isLoginView ? 'আপনার তথ্য দিয়ে লগইন করুন' : 'নতুন একাউন্ট খুলতে নিচের ফর্ম পুরন করুন'}
          </p>
        </div>

        <form onSubmit={isLoginView ? handleLogin : handleRegister} className="space-y-4">
          {!isLoginView && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-400" />
                {t(lang, 'fullName')}
              </label>
              <input
                type="text"
                value={name} maxLength={11}
                onChange={(e) => setName(e.target.value)}
                placeholder={t(lang, 'enterName')}
                required
                className="w-full px-3.5 py-2.5 text-sm bg-slate-800/80 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
              />
            </div>
          )}

          {!isLoginView && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">{t(lang, 'adminPermit')}</label>
              <input
                type="password"
                value={adminPermit}
                onChange={(e) => setAdminPermit(e.target.value)}
                placeholder={t(lang, 'adminPermitPh')}
                required
                className="w-full px-3.5 py-2.5 text-sm bg-slate-800/80 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-sky-400" />
              {t(lang, 'phone')}
            </label>
            <input
              type="text"
              value={phone}
              maxLength={11}
              inputMode="numeric"
              pattern="[0-9]*"
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              onInput={(e) => setPhone((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 11))}
              placeholder={t(lang, 'enterPhone')}
              required
              className="w-full px-3.5 py-2.5 text-sm bg-slate-800/80 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              {t(lang, 'password')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t(lang, 'enterPass')}
                required
                className="w-full px-3.5 py-2.5 pr-10 text-sm bg-slate-800/80 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-sky-300"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
          >
            <span>{isLoginView ? t(lang, 'login') : t(lang, 'registerBtn')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-slate-400 border-t border-slate-800/80 pt-4 flex flex-col gap-3">
          <div>
            <span>{isLoginView ? t(lang, 'noAccount') : t(lang, 'alreadyAccount')}</span>
            <button
              type="button"
              onClick={() => setIsLoginView(!isLoginView)}
              className="ml-2 font-bold text-sky-400 hover:underline focus:outline-none"
            >
              {isLoginView ? t(lang, 'regHere') : t(lang, 'loginHere')}
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800/50 flex justify-center items-center">
            <button
              type="button"
              onClick={handleOpenAdminClick}
              className="p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 text-slate-500 hover:text-amber-400 border border-slate-800/60 transition-all shadow-sm"
              title=""
            >
              <KeyRound className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleOpenAdminClick}
            className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            © 2026 Painite Work
          </button>
        </div>
      </motion.div>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showAdminModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-2xl relative"
            >
              <button
                type="button"
                onClick={() => { setShowAdminModal(false); setAdminPass(''); }}
                className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center mb-5">
                <div className="inline-flex p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2.5">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-100">Admin Panel Security</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enter the security password to access the Admin Panel
                </p>
              </div>

              <form onSubmit={handleAdminModalSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Admin Password
                  </label>
                  <input
                    type="password"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    placeholder="Enter password"
                    autoFocus
                    required
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-800/90 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowAdminModal(false); setAdminPass(''); }}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-amber-500/20"
                  >
                    Login
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

