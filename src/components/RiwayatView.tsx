import React, { useState, useMemo } from 'react';
import { PatientHDSession, ShiftInfo, MasterNurse, SystemAccessRole } from '../types/dialysis.ts';
import {
  Search,
  Clock,
  Printer,
  FileText,
  ShieldCheck,
  Download,
  RotateCcw,
  PlusCircle,
  Database,
  Lock,
  UserCheck
} from 'lucide-react';
import { PelaksanaLogbookPrintableModal } from './PelaksanaLogbookPrintableModal.tsx';
import { LoginUserData } from './LoginPage.tsx';
import {
  filterSessionsForNurseRiwayat,
  isSessionVerifiedByPj,
  isMatchingNurse,
  getNurseManagedPatientsKey,
  getVerificationRegistry,
  ManagedPatientMinimal
} from '../utils/nurseVerificationHelpers.ts';

interface RiwayatViewProps {
  sessions: PatientHDSession[];
  shiftInfo: ShiftInfo;
  userRole?: SystemAccessRole;
  loggedInUser?: LoginUserData | null;
  masterNurses?: MasterNurse[];
  onOpenSessionModal?: (session: PatientHDSession) => void;
  onLoadBenchmarkData?: () => void;
  onNavigateToLogbook?: () => void;
  onNavigateToVerifikasi?: () => void;
}

export const RiwayatView: React.FC<RiwayatViewProps> = ({
  sessions,
  shiftInfo,
  userRole = 'perawat_pelaksana',
  loggedInUser,
  masterNurses = [],
  onOpenSessionModal,
  onLoadBenchmarkData,
  onNavigateToLogbook,
  onNavigateToVerifikasi
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [verifierFilter, setVerifierFilter] = useState<'all' | 'pj_shift' | 'kepala_ruangan'>('all');
  const [printingSession, setPrintingSession] = useState<PatientHDSession | null>(null);

  // Identify current nurse strictly from loggedInUser or active role
  const currentNurseName = useMemo(() => {
    if (loggedInUser?.name && userRole !== 'administrator') {
      return loggedInUser.name;
    }
    if (userRole === 'pj_shift') {
      return shiftInfo.pjShift && shiftInfo.pjShift !== '-' ? shiftInfo.pjShift : '-';
    }
    if (userRole === 'kepala_ruangan') {
      return shiftInfo.kepalaRuangan && shiftInfo.kepalaRuangan !== '-'
        ? shiftInfo.kepalaRuangan
        : '-';
    }
    const defaultPelaksana =
      masterNurses.find((n) => n.role === 'perawat_pelaksana' && n.isOnDutyToday) ||
      masterNurses.find((n) => n.role === 'perawat_pelaksana');
    return defaultPelaksana?.name || '-';
  }, [loggedInUser, userRole, shiftInfo, masterNurses]);

  // Read active managed patients list from per-nurse localStorage or verification registry
  const managedPatients = useMemo<ManagedPatientMinimal[]>(() => {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    if (!currentNurseName || currentNurseName === '-') return [];
    try {
      const savedNurse = localStorage.getItem(getNurseManagedPatientsKey(currentNurseName));
      if (savedNurse) {
        const parsed = JSON.parse(savedNurse);
        if (Array.isArray(parsed)) return parsed;
      }
      const regEntry = getVerificationRegistry().find((e) =>
        isMatchingNurse(e.submittedNurseName, currentNurseName)
      );
      if (regEntry?.patients && regEntry.patients.length > 0) {
        return regEntry.patients;
      }
    } catch {
      // ignore
    }
    return [];
  }, [currentNurseName, sessions]);

  // Apply strict 3-role ownership & verification workflow:
  // 1. Perawat Pelaksana: pasien kelolaan sendiri yang SUDAH diverifikasi PJ Shift
  // 2. PJ Shift: pasien kelolaan sendiri yang SUDAH diverifikasi Kepala Ruang
  // 3. Kepala Ruang: pasien kelolaan sendiri yang SUDAH diverifikasi PJ Shift ATAU Kepala Ruang
  const {
    visibleSessions: roleFilteredSessions,
    totalManagedByNurse,
    unverifiedManagedCount,
    currentNurseStatus,
    otherNursesHiddenCount,
    verifiedByPjCount,
    verifiedByKaruCount
  } = useMemo(() => {
    return filterSessionsForNurseRiwayat(
      sessions,
      currentNurseName,
      userRole,
      'mine',
      masterNurses,
      managedPatients
    );
  }, [sessions, currentNurseName, userRole, masterNurses, managedPatients]);

  const resetAllFilters = () => {
    setSearchTerm('');
    setVerifierFilter('all');
  };

  // Search & verifier-source filters on visible verified sessions
  const filteredSessions = roleFilteredSessions.filter((s) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      s.patientName.toLowerCase().includes(term) ||
      (s.bedNumber && s.bedNumber.toLowerCase().includes(term)) ||
      (s.medicalRecordNumber && s.medicalRecordNumber.toLowerCase().includes(term)) ||
      (s.nurseInCharge && s.nurseInCharge.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    if (verifierFilter === 'all') return true;
    const verifInfo = isSessionVerifiedByPj(s, masterNurses);
    if (verifierFilter === 'kepala_ruangan') return verifInfo.isVerifiedByKepalaRuang;
    if (verifierFilter === 'pj_shift') return verifInfo.isVerifiedByPjShift;
    return true;
  });

  const isFullyVerified =
    totalManagedByNurse > 0 && unverifiedManagedCount === 0 && roleFilteredSessions.length > 0;

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span className="text-blue-700 font-bold">Arsip &amp; Riwayat Logbook Resmi</span>
            <span aria-hidden="true">&middot;</span>
            <span>Instalasi Hemodialisis RS Happy Land</span>
          </div>
          <h2 className="text-lg font-black text-slate-900">
            Riwayat Asuhan &amp; Logbook Pasien Kelolaan
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {userRole === 'pj_shift'
              ? `Menampilkan data logbook pasien kelolaan Anda (${currentNurseName}) yang telah diverifikasi oleh Kepala Ruang atau PJ Shift lainnya.`
              : userRole === 'kepala_ruangan'
              ? `Menampilkan data logbook pasien kelolaan Anda (${currentNurseName}) yang telah diverifikasi oleh PJ Shift atau Kepala Ruang.`
              : `Menampilkan data logbook pasien kelolaan Anda (${currentNurseName}) yang telah diverifikasi oleh PJ Shift (${shiftInfo.pjShift}).`}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap tabular-nums">
          <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center min-w-[112px]">
            <div className="text-[11px] font-semibold text-slate-500">Total Kelolaan</div>
            <div className="text-lg font-black text-slate-900 mt-0.5">
              {totalManagedByNurse} Pasien
            </div>
          </div>
          <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-center min-w-[120px]">
            <div className="text-[11px] font-semibold text-emerald-800">
              {userRole === 'pj_shift'
                ? 'Disahkan Ka. Ruang / PJ Lain'
                : userRole === 'kepala_ruangan'
                ? 'Disahkan PJ / Ka. Ruang'
                : 'Disahkan PJ Shift'}
            </div>
            <div className="text-lg font-black text-emerald-950 mt-0.5">
              {roleFilteredSessions.length} Pasien
            </div>
          </div>
          {onLoadBenchmarkData && (
            <button
              type="button"
              onClick={onLoadBenchmarkData}
              className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Reset & muat ulang data benchmark standar RS Happy Land"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Reset Data Benchmark</span>
            </button>
          )}
        </div>
      </div>

      {/* RBAC Nurse Ownership & Verification Status Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 ${
                userRole === 'kepala_ruangan'
                  ? 'bg-indigo-600'
                  : userRole === 'pj_shift'
                  ? 'bg-blue-700'
                  : 'bg-blue-600'
              }`}
            >
              {userRole === 'perawat_pelaksana' ? (
                <Lock className="w-4 h-4" />
              ) : userRole === 'pj_shift' ? (
                <UserCheck className="w-4 h-4" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-black text-slate-900">
                  {userRole === 'kepala_ruangan'
                    ? `Kepala Ruang: ${currentNurseName}`
                    : userRole === 'pj_shift'
                    ? `PJ Shift: ${currentNurseName}`
                    : `Perawat Pelaksana: ${currentNurseName}`}
                </span>
                <span className="text-slate-400" aria-hidden="true">
                  &middot;
                </span>
                <span className="text-slate-600 font-semibold">Isolasi Pasien Kelolaan Pribadi</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {userRole === 'pj_shift'
                  ? 'Data logbook pasien kelolaan Anda muncul di halaman ini setelah diverifikasi oleh Kepala Ruang atau PJ Shift lainnya.'
                  : userRole === 'kepala_ruangan'
                  ? `Data logbook pasien kelolaan Anda muncul di halaman ini setelah diverifikasi oleh PJ Shift (${shiftInfo.pjShift}) atau Kepala Ruang itu sendiri.`
                  : `Data logbook pasien kelolaan Anda muncul di halaman ini setelah diverifikasi oleh PJ Shift (${shiftInfo.pjShift}).`}
                {otherNursesHiddenCount > 0 && (
                  <span className="text-slate-500 ml-1 tabular-nums">
                    ({otherNursesHiddenCount} pasien kelolaan perawat lain disembunyikan otomatis.)
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2 self-start sm:self-center text-xs font-bold whitespace-nowrap">
            {isFullyVerified ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {userRole === 'pj_shift'
                    ? 'Terverifikasi'
                    : userRole === 'kepala_ruangan'
                    ? 'Terverifikasi'
                    : 'Terverifikasi PJ Shift'}
                </span>
              </span>
            ) : currentNurseStatus === 'diajukan' ? (
              <span className="inline-flex items-center gap-1.5 text-indigo-700">
                <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  {userRole === 'pj_shift'
                    ? 'Menunggu Verifikasi Ka. Ruang / PJ Lain'
                    : userRole === 'kepala_ruangan'
                    ? 'Menunggu Pengesahan Verifikasi'
                    : 'Menunggu Verifikasi PJ Shift'}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Belum Diajukan Verifikasi</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Partial Pending Notice when some patients are verified and some are still pending */}
      {roleFilteredSessions.length > 0 && unverifiedManagedCount > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Terdapat <strong className="tabular-nums">{unverifiedManagedCount} pasien kelolaan</strong>{' '}
              lainnya yang belum disahkan verifikasinya sehingga belum ditampilkan pada tabel riwayat di bawah.
            </span>
          </div>
          {onNavigateToLogbook && (
            <button
              type="button"
              onClick={onNavigateToLogbook}
              className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
            >
              Periksa di Logbook
            </button>
          )}
        </div>
      )}

      {/* Search & Filter Bar (Displayed when verified sessions exist) */}
      {roleFilteredSessions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari nama pasien, nomor bed, atau nomor RM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-sm text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                &times;
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap tabular-nums">
            {userRole === 'kepala_ruangan' ||
            userRole === 'pj_shift' ||
            userRole === 'administrator' ? (
              <>
                {(
                  [
                    { id: 'all', label: `Semua Terverifikasi (${roleFilteredSessions.length})` },
                    { id: 'kepala_ruangan', label: `Oleh Kepala Ruang (${verifiedByKaruCount})` },
                    {
                      id: 'pj_shift',
                      label:
                        userRole === 'pj_shift'
                          ? `Oleh PJ Shift Lainnya (${verifiedByPjCount})`
                          : `Oleh PJ Shift (${verifiedByPjCount})`
                    }
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setVerifierFilter(chip.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      verifierFilter === chip.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </>
            ) : (
              <span className="text-xs font-semibold text-slate-500 px-2">
                Menampilkan {filteredSessions.length} dari {roleFilteredSessions.length} pasien terverifikasi
              </span>
            )}

            {(searchTerm || verifierFilter !== 'all') && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content: Empty State or Verified Sessions Table */}
      {roleFilteredSessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-10 text-center shadow-xs">
          {unverifiedManagedCount > 0 ? (
            <div className="max-w-lg mx-auto space-y-3">
              <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
                <Clock className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-slate-900">
                {userRole === 'pj_shift'
                  ? currentNurseStatus === 'diajukan'
                    ? 'Data Logbook Pasien Kelolaan Anda Sedang Menunggu Verifikasi'
                    : 'Logbook Pasien Kelolaan Anda Belum Diajukan kepada Kepala Ruang atau PJ Shift Lainnya'
                  : userRole === 'kepala_ruangan'
                  ? currentNurseStatus === 'diajukan'
                    ? 'Data Logbook Pasien Kelolaan Anda Sedang Menunggu Pengesahan Verifikasi'
                    : 'Logbook Pasien Kelolaan Anda Belum Diajukan Verifikasi'
                  : currentNurseStatus === 'diajukan'
                  ? 'Data Logbook Pasien Kelolaan Anda Sedang Menunggu Verifikasi PJ Shift'
                  : 'Logbook Pasien Kelolaan Anda Belum Diajukan kepada PJ Shift'}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Anda memiliki <strong className="text-slate-900 tabular-nums">{totalManagedByNurse} pasien kelolaan</strong>{' '}
                pada shift ini.{' '}
                {userRole === 'pj_shift'
                  ? 'Sesuai alur verifikasi, data logbook pasien kelolaan PJ Shift akan otomatis muncul pada halaman Riwayat setelah diverifikasi oleh Kepala Ruang atau PJ Shift lainnya.'
                  : userRole === 'kepala_ruangan'
                  ? `Sesuai alur verifikasi, data logbook pasien kelolaan Kepala Ruang akan otomatis muncul pada halaman Riwayat setelah diverifikasi oleh PJ Shift (${shiftInfo.pjShift}) atau Kepala Ruang itu sendiri.`
                  : `Sesuai alur verifikasi, data logbook pasien kelolaan Perawat Pelaksana akan otomatis muncul pada halaman Riwayat setelah diverifikasi oleh PJ Shift (${shiftInfo.pjShift}).`}
              </p>
              <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                {onNavigateToLogbook && (
                  <button
                    type="button"
                    onClick={onNavigateToLogbook}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <PlusCircle className="w-4 h-4 shrink-0" />
                    <span>
                      {currentNurseStatus === 'diajukan'
                        ? 'Lihat Status Pengajuan di Tab Logbook'
                        : 'Isi & Ajukan Verifikasi di Tab Logbook'}
                    </span>
                  </button>
                )}
                {userRole === 'kepala_ruangan' &&
                  currentNurseStatus === 'diajukan' &&
                  onNavigateToVerifikasi && (
                    <button
                      type="button"
                      onClick={onNavigateToVerifikasi}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>Buka Halaman Verifikasi Kepala Ruang</span>
                    </button>
                  )}
              </div>
            </div>
          ) : (
            <div className="max-w-lg mx-auto space-y-3">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100">
                <Database className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-slate-900">
                Belum Ada Data Riwayat Pasien Kelolaan Terverifikasi
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Belum ada data logbook pasien kelolaan yang telah diverifikasi untuk akun ini. Silakan isi logbook pada halaman Logbook dan ajukan verifikasi.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                {onNavigateToLogbook && (
                  <button
                    type="button"
                    onClick={onNavigateToLogbook}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <PlusCircle className="w-4 h-4 shrink-0" />
                    <span>Isi Logbook Pasien Kelolaan</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Daftar Riwayat Logbook Pasien Kelolaan (Terverifikasi)</span>
            </h3>
            <span className="text-xs text-slate-500 font-semibold tabular-nums">
              Menampilkan <strong className="text-slate-900">{filteredSessions.length}</strong> dari{' '}
              {roleFilteredSessions.length} pasien terverifikasi
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse tabular-nums">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3.5 min-w-[200px]">Nama Pasien &amp; No. RM</th>
                  <th className="p-3.5 text-center w-32">No. Bed</th>
                  <th className="p-3.5 min-w-[200px]">Perawat Pengelola</th>
                  <th className="p-3.5 min-w-[240px]">Disahkan Oleh</th>
                  <th className="p-3.5 text-right w-32">Aksi Berkas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      <p className="font-bold text-slate-700 text-xs">
                        Tidak ada pasien yang cocok dengan filter pencarian
                      </p>
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="mt-2.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Filter</span>
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((s, idx) => {
                    const verifInfo = isSessionVerifiedByPj(s, masterNurses);

                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors ${
                          idx % 2 === 1
                            ? 'bg-slate-50/40 hover:bg-blue-50/40'
                            : 'bg-white hover:bg-blue-50/40'
                        }`}
                      >
                        {/* 1. Nama Pasien & RM */}
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900 text-[13px]">{s.patientName}</div>
                          {s.medicalRecordNumber && (
                            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                              RM: {s.medicalRecordNumber}
                            </div>
                          )}
                        </td>

                        {/* 2. No Bed Pasien */}
                        <td className="p-3.5 text-center font-mono font-bold text-blue-800">
                          {s.bedNumber || '-'}
                        </td>

                        {/* 3. Perawat Pengelola */}
                        <td className="p-3.5">
                          <div className="text-slate-900 font-bold text-xs">
                            {s.nurseInCharge || currentNurseName}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Pasien Kelolaan Anda
                          </div>
                        </td>

                        {/* 4. Disahkan Oleh */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              {verifInfo.isVerifiedByKepalaRuang
                                ? 'Terverifikasi Kepala Ruang'
                                : 'Terverifikasi PJ Shift'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Oleh: {verifInfo.verifiedBy || '-'}
                            {verifInfo.verifiedAt ? ` · ${verifInfo.verifiedAt}` : ''}
                          </div>
                        </td>

                        {/* 5. Aksi Berkas */}
                        <td className="p-3.5 text-right">
                          <div className="inline-flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => setPrintingSession(s)}
                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-900 rounded-lg border border-blue-200 transition-colors cursor-pointer inline-flex items-center gap-1.5 font-semibold whitespace-nowrap shrink-0 shadow-2xs"
                              title="Cetak Berkas Logbook Resmi A4"
                            >
                              <Printer className="w-3.5 h-3.5 shrink-0" />
                              <span>Cetak</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Cetak Per-Session */}
      {printingSession && (
        <PelaksanaLogbookPrintableModal
          isOpen={!!printingSession}
          onClose={() => setPrintingSession(null)}
          session={printingSession}
          shiftInfo={shiftInfo}
        />
      )}
    </div>
  );
};
