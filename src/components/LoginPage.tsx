import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, User, Info, X, Smartphone } from 'lucide-react';
import { ShiftInfo, ShiftName, MasterNurse, SystemAccessRole } from '../types/dialysis.ts';
import {
  findNurseByAccountInput,
  resolveNurseSystemAccess
} from '../utils/masterDataHelpers.ts';
import { useCleanHospitalBackground } from '../utils/useCleanHospitalBackground.ts';
import { RshlLogo } from './RshlLogo.tsx';

export interface LoginUserData {
  nurseId?: string;
  email: string;
  username?: string;
  name: string;
  role: string;
  shift: ShiftName;
  shiftHours: string;
  nip?: string;
  userRole?: SystemAccessRole;
}

interface LoginPageProps {
  onLogin: (userData: LoginUserData) => void;
  shiftInfo?: ShiftInfo;
  masterNurses?: MasterNurse[];
  onOpenDeviceAccess?: () => void;
}

const REMEMBER_STORAGE_KEY = 'rshl_dialisis_remembered_nip_v1';

export const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  shiftInfo,
  masterNurses = [],
  onOpenDeviceAccess
}) => {
  const [loginId, setLoginId] = useState<string>(() => {
    try {
      return localStorage.getItem(REMEMBER_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(REMEMBER_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForgotInfo, setShowForgotInfo] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { bgSrc, isProcessed, hasError, onImageError } = useCleanHospitalBackground();

  const activeShiftName: ShiftName = shiftInfo?.shift || 'Pagi';
  const activeShiftHours = shiftInfo?.shiftHours || 'Pagi, jam 07.00 - 14.00 WIB';

  const formatNurseRoleTitle = (role: MasterNurse['role'], access?: SystemAccessRole) => {
    if (access === 'administrator') return 'Administrator Sistem Unit HD';
    if (access === 'kepala_ruangan' || role === 'kepala_ruangan')
      return 'Kepala Ruangan (Ka. Ruangan)';
    if (access === 'pj_shift' || role === 'pj_shift')
      return 'Penanggung Jawab Shift (PJ Shift)';
    return 'Perawat Pelaksana Dialisis';
  };

  const resolveShiftHours = (shiftName: ShiftName): string => {
    if (shiftName === 'Siang') return 'Siang, jam 14.00 - 21.00 WIB';
    if (shiftName === 'Malam') return 'Malam, jam 21.00 - 07.00 WIB';
    return 'Pagi, jam 07.00 - 14.00 WIB';
  };

  const persistRememberPreference = (rawIdentifier: string) => {
    try {
      if (rememberMe && rawIdentifier.trim()) {
        localStorage.setItem(REMEMBER_STORAGE_KEY, rawIdentifier.trim());
      } else {
        localStorage.removeItem(REMEMBER_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setShowForgotInfo(false);

    const cleanInput = loginId.trim().toLowerCase();
    const compactInput = cleanInput.replace(/\s+/g, '');

    if (!cleanInput) {
      setErrorMessage('Harap masukkan Nomor Induk Pegawai (NIP) atau ID akun Anda.');
      return;
    }

    if (!password) {
      setErrorMessage('Harap masukkan Kata Sandi Anda.');
      return;
    }

    if (password.length < 3) {
      setErrorMessage('Kata sandi minimal terdiri dari 3 karakter.');
      return;
    }

    // 1. Check built-in Administrator credentials (by ID, email, or NIP)
    const isBuiltInAdmin =
      cleanInput === 'admin' ||
      cleanInput === 'admin@happyland.co.id' ||
      compactInput === '198809152014021001';

    if (isBuiltInAdmin) {
      if (password !== 'admin' && password !== 'Dialisis2026!') {
        setErrorMessage('Kata sandi untuk Administrator tidak sesuai.');
        return;
      }

      persistRememberPreference(loginId);
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        onLogin({
          email: 'admin@happyland.co.id',
          username: 'admin',
          name: 'Administrator Unit HD',
          role: 'Administrator Unit HD',
          shift: activeShiftName,
          shiftHours: activeShiftHours,
          nip: '19880915 201402 1 001',
          userRole: 'administrator'
        });
      }, 180);
      return;
    }

    // 2. Check registered Nurse Accounts in Master Data Perawat (matches NIP, Username, or Email)
    const matchedNurse = findNurseByAccountInput(masterNurses, cleanInput);
    if (matchedNurse) {
      if (matchedNurse.accountStatus === 'nonaktif') {
        setErrorMessage(
          `Akun "${matchedNurse.name}" sedang dinonaktifkan oleh Administrator.`
        );
        return;
      }

      const expectedPass = matchedNurse.password || '12345';
      if (password !== expectedPass) {
        setErrorMessage('Kata sandi tidak sesuai. Silakan periksa kembali.');
        return;
      }

      const resolvedRole = resolveNurseSystemAccess(matchedNurse);
      const assignedShift = matchedNurse.shiftAssigned || activeShiftName;

      persistRememberPreference(loginId);
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        onLogin({
          nurseId: matchedNurse.id,
          email: matchedNurse.email || `${matchedNurse.username || 'perawat'}@happyland.co.id`,
          username: matchedNurse.username,
          name: matchedNurse.name,
          role: formatNurseRoleTitle(matchedNurse.role, resolvedRole),
          shift: assignedShift,
          shiftHours: resolveShiftHours(assignedShift),
          nip: matchedNurse.nip,
          userRole: resolvedRole
        });
      }, 180);
      return;
    }

    // 3. Reject unregistered credentials with clear guidance
    const activeNursesCount = masterNurses.filter((n) => n.accountStatus !== 'nonaktif').length;
    setErrorMessage(
      activeNursesCount === 0
        ? 'Belum ada akun perawat terdaftar. Masuk sebagai Administrator (ID: admin) untuk mendaftarkan data perawat.'
        : 'NIP / ID tidak ditemukan pada sistem Unit Dialisis. Periksa kembali atau hubungi Administrator.'
    );
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none sm:select-auto font-sans">
      {/* Hospital Building Full-Viewport Background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#0a65b5] via-[#5ba1cb] to-[#4b6f73]"
      >
        {!hasError && (
          <img
            src={bgSrc}
            alt="Gedung RS Happy Land Medical Centre Yogyakarta"
            referrerPolicy="no-referrer"
            onError={onImageError}
            className={`w-full h-full object-cover object-center transition-opacity duration-200 ${
              isProcessed ? 'opacity-100' : 'opacity-95 blur-xs scale-[1.02]'
            }`}
          />
        )}
        {/* Subtle atmospheric veil for consistent legibility across bright sky and facade */}
        <div className="absolute inset-0 bg-[#0d3559]/10" />
      </div>

      {/* Centered Frosted Glass Login Card */}
      <div className="relative z-10 w-full max-w-[490px] rounded-[18px] bg-gradient-to-b from-[#d8eaf6]/78 via-[#dfeef7]/75 to-[#d4e5f0]/78 backdrop-blur-md border border-white/65 shadow-[0_22px_54px_rgba(10,32,60,0.3)] px-6 sm:px-10 py-7 sm:py-8 text-slate-900">
        {/* RSHL Logo Lockup */}
        <div className="flex flex-col items-center text-center">
          <RshlLogo className="w-[186px] sm:w-[202px] h-auto" idPrefix="login-rshl" />

          {/* Main Heading & Hospital Unit Subtitle */}
          <h1 className="mt-2.5 text-[20px] sm:text-[23px] font-bold tracking-[0.025em] text-[#2c4356] leading-tight">
            SISTEM LOGBOOK DIALISIS
          </h1>

          <div className="mt-2 text-[13px] sm:text-[14px] font-medium text-slate-900 leading-[1.45]">
            <p>Masuk ke Akun Anda - Unit Dialisis</p>
            <p>RS Happy Land Medical Centre Yogyakarta</p>
          </div>
        </div>

        {/* Inline Error Message */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-[10px] bg-rose-50/95 border border-rose-300 text-rose-900 text-xs font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Inline Forgot Password Help Box */}
        {showForgotInfo && (
          <div className="mt-4 p-3 rounded-[10px] bg-white/90 border border-[#1c6d92]/35 text-slate-800 text-xs flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-[#1c6d92] shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                Untuk pengaturan ulang kata sandi akun, silakan hubungi{' '}
                <strong className="text-[#19588f]">Administrator Unit Dialisis</strong> atau{' '}
                <strong className="text-[#19588f]">Kepala Ruangan HD</strong> RS Happy Land.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowForgotInfo(false)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
              aria-label="Tutup informasi lupa kata sandi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Nomor Induk Pegawai (NIP) / ID */}
          <div>
            <label
              htmlFor="rshl-login-nip"
              className="block text-[13.5px] font-medium text-slate-900 mb-1.5"
            >
              Nomor Induk Pegawai (NIP) / ID
            </label>
            <div className="relative">
              <User
                className="w-[18px] h-[18px] text-[#5c6672] fill-[#5c6672] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                id="rshl-login-nip"
                type="text"
                autoComplete="username"
                value={loginId}
                onChange={(e) => {
                  setLoginId(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Masukkan ID / Username atau NIP..."
                className="w-full h-[44px] pl-10 pr-3.5 bg-white text-slate-900 placeholder:text-slate-500 text-[13.5px] font-normal rounded-[10px] border border-slate-500/70 focus:outline-hidden focus:border-[#1c6d92] focus:ring-2 focus:ring-[#1c6d92]/25 transition-colors"
              />
            </div>
          </div>

          {/* Kata Sandi + Show Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="rshl-login-password"
                className="text-[13.5px] font-medium text-slate-900"
              >
                Kata Sandi
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-[13px] font-medium text-slate-900 hover:text-[#19588f] transition-colors cursor-pointer whitespace-nowrap"
              >
                {showPassword ? 'Hide Password' : 'Show Password'}
              </button>
            </div>

            <div className="relative">
              <Lock
                className="w-[17px] h-[17px] text-[#5c6672] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={2.2}
              />
              <input
                id="rshl-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Masukkan Kata Sandi..."
                className="w-full h-[44px] pl-10 pr-10 bg-white text-slate-900 placeholder:text-slate-500 text-[13.5px] font-normal rounded-[10px] border border-slate-500/70 focus:outline-hidden focus:border-[#1c6d92] focus:ring-2 focus:ring-[#1c6d92]/25 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55606d] hover:text-slate-900 transition-colors cursor-pointer p-1"
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              >
                {showPassword ? (
                  <EyeOff className="w-[19px] h-[19px]" strokeWidth={2} />
                ) : (
                  <Eye className="w-[19px] h-[19px]" strokeWidth={2} />
                )}
              </button>
            </div>

            {/* Lupa Kata Sandi? */}
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => setShowForgotInfo((prev) => !prev)}
                className="text-[13px] font-medium text-[#20668d] hover:text-[#144765] hover:underline transition-colors cursor-pointer whitespace-nowrap"
              >
                Lupa Kata Sandi?
              </button>
            </div>
          </div>

          {/* Ingat Saya */}
          <div className="pt-0.5">
            <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-[17px] h-[17px] rounded-[4px] border border-slate-600 bg-white accent-[#1c6d92] cursor-pointer"
              />
              <span className="text-[13.5px] font-medium text-slate-900">Ingat Saya</span>
            </label>
          </div>

          {/* MASUK Button */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[46px] rounded-full bg-[#1c6d92] hover:bg-[#165978] active:scale-[0.99] disabled:opacity-70 text-white text-[15px] font-bold tracking-wide shadow-[0_6px_16px_rgba(20,82,114,0.32)] transition-all flex items-center justify-center cursor-pointer whitespace-nowrap"
            >
              {isLoading ? 'MEMPROSES...' : 'MASUK'}
            </button>

            <p className="mt-3 text-center text-[13px] font-medium text-slate-900">
              Masuk ke Sistem Logbook Dialisis
            </p>

            {onOpenDeviceAccess && (
              <div className="mt-4 pt-3 border-t border-slate-300/80 text-center">
                <button
                  type="button"
                  onClick={onOpenDeviceAccess}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1c6d92] hover:text-[#12445c] hover:underline cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Buka di HP / Laptop Masing-Masing Staff</span>
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
