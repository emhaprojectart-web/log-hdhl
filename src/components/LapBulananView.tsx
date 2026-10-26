import React, { useState, useMemo } from 'react';
import {
  MasterNurse,
  PatientHDSession,
  ShiftInfo,
  SystemAccessRole
} from '../types/dialysis.ts';
import { OFFICIAL_LOGBOOK_ITEMS } from '../data/officialPelaksanaLogbookData.ts';
import { OfficialPelaksanaLogbookPrintable } from './OfficialPelaksanaLogbookPrintable.tsx';
import { LoginUserData } from './LoginPage.tsx';
import {
  buildStaffMonthlyRecap,
  parseIndonesianLogbookDate
} from '../utils/monthlyRecapHelpers.ts';
import {
  getCurrentIndonesianFullDate,
  normalizeIndonesianDateLabel
} from '../utils/dateHelpers.ts';
import { isMatchingNurse } from '../utils/nurseVerificationHelpers.ts';
import {
  Table,
  Printer,
  Calendar,
  ShieldCheck,
  Award,
  UserCheck,
  Users,
  Info,
  ArrowRight,
  Clock
} from 'lucide-react';

interface LapBulananViewProps {
  masterNurses?: MasterNurse[];
  loggedInUser?: LoginUserData | null;
  shiftInfo?: ShiftInfo;
  userRole?: SystemAccessRole;
  sessions?: PatientHDSession[];
  onNavigateToLogbook?: () => void;
}

const BAGIAN_SECTION_HEADERS: {
  bagian: number;
  title: string;
  ruleBadge: string;
}[] = [
  {
    bagian: 1,
    title: 'BAGIAN I: KESIAPAN FASILITAS RUANGAN & WATER TREATMENT (RO)',
    ruleBadge: 'Nilai = 1 (1x Aktivitas / Hari)'
  },
  {
    bagian: 2,
    title: 'BAGIAN II: PERSIAPAN PERAWAT, PERALATAN, MESIN HD & ALKES (PRE-HD)',
    ruleBadge: 'Nilai Mengikuti Pasien Kelolaan'
  },
  {
    bagian: 3,
    title: 'BAGIAN III: IDENTIFIKASI PASIEN, PENGKAJIAN PRE-HD & PATIENT SAFETY',
    ruleBadge: 'Nilai Mengikuti Pasien Kelolaan'
  },
  {
    bagian: 4,
    title: 'BAGIAN IV: MONITORING INTRA-HD & PENCEGAHAN IKP',
    ruleBadge: 'Nilai Mengikuti Pasien Kelolaan'
  },
  {
    bagian: 5,
    title: 'BAGIAN V: EDUKASI TERSTRUKTUR PASIEN & KELUARGA (KIE)',
    ruleBadge: 'Nilai Mengikuti Pasien Kelolaan'
  },
  {
    bagian: 6,
    title: 'BAGIAN VI: TERMINASI AMAN, EVALUASI POST-HD, DISINFEKSI & CPPT',
    ruleBadge: 'Nilai Mengikuti Pasien Kelolaan'
  }
];

export const LapBulananView: React.FC<LapBulananViewProps> = ({
  masterNurses = [],
  loggedInUser,
  shiftInfo,
  userRole = 'perawat_pelaksana',
  sessions = [],
  onNavigateToLogbook
}) => {
  // Resolve the active logged-in staff identity strictly matching Logbook & Riwayat
  const currentStaff = useMemo(() => {
    if (loggedInUser?.name && userRole !== 'administrator') {
      const matched = masterNurses.find(
        (n) =>
          (loggedInUser.nurseId && n.id === loggedInUser.nurseId) ||
          isMatchingNurse(n.name, loggedInUser.name)
      );
      return {
        name: loggedInUser.name,
        nip: loggedInUser.nip || matched?.nip || '-'
      };
    }

    if (userRole === 'pj_shift') {
      const pjName = shiftInfo?.pjShift && shiftInfo.pjShift !== '-' ? shiftInfo.pjShift : '-';
      const matched = masterNurses.find((n) => isMatchingNurse(n.name, pjName));
      return { name: pjName, nip: matched?.nip || '-' };
    }

    if (userRole === 'kepala_ruangan') {
      const karuName =
        shiftInfo?.kepalaRuangan && shiftInfo.kepalaRuangan !== '-'
          ? shiftInfo.kepalaRuangan
          : '-';
      const matched = masterNurses.find((n) => isMatchingNurse(n.name, karuName));
      return { name: karuName, nip: matched?.nip || '-' };
    }

    const defaultPelaksana =
      masterNurses.find((n) => n.role === 'perawat_pelaksana' && n.isOnDutyToday) ||
      masterNurses.find((n) => n.role === 'perawat_pelaksana');

    return {
      name: defaultPelaksana?.name || '-',
      nip: defaultPelaksana?.nip || '-'
    };
  }, [loggedInUser, userRole, shiftInfo, masterNurses]);

  const recap = useMemo(() => {
    return buildStaffMonthlyRecap({
      nurseName: currentStaff.name,
      nurseNip: currentStaff.nip,
      userRole,
      shiftInfo,
      sessions,
      masterNurses
    });
  }, [currentStaff, userRole, shiftInfo, sessions, masterNurses]);

  const [viewMode, setViewMode] = useState<'matrix' | 'print'>('matrix');
  const daysArray = Array.from({ length: 31 }, (_, i) => i + 1);

  const activeDateLabel = shiftInfo?.date
    ? normalizeIndonesianDateLabel(shiftInfo.date)
    : getCurrentIndonesianFullDate();
  const activeParsedDate = useMemo(
    () => parseIndonesianLogbookDate(activeDateLabel),
    [activeDateLabel]
  );

  const { logbook, daysInMonth } = recap;
  const verifiedDays = logbook.verifiedDays || [];
  const dailyPatCounts = logbook.dailyVerifiedPatientCounts || [];

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500">
            <span className="text-blue-700 font-bold uppercase tracking-wide">
              Laporan Bulanan Staff Hemodialisis
            </span>
            <span aria-hidden="true">&middot;</span>
            <span>{recap.roleLabel}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{shiftInfo?.hospitalName || 'RS Happy Land Medical Centre'}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            Rekapitulasi Bulanan Logbook Terverifikasi ({logbook.monthYear})
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Menampilkan rekapitulasi nilai SPO harian dari logbook milik{' '}
            <strong className="text-slate-800">{logbook.nurseName}</strong> yang telah disahkan
            oleh <strong>PJ Shift</strong> atau <strong>Kepala Ruang</strong> &middot; Hari/Tanggal
            Aktif: <strong className="text-blue-700 tabular-nums">{activeDateLabel}</strong>.
          </p>
        </div>

        {/* View Switcher: Matrix vs Cetak 1:1 */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 self-start md:self-center">
          <button
            type="button"
            onClick={() => setViewMode('matrix')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'matrix'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table className="w-3.5 h-3.5 shrink-0" />
            <span>Matriks 1–31 Hari</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('print')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'print'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>Format Cetak A4 (1:1)</span>
          </button>
        </div>
      </div>

      {/* Scoring Rules & Live Verification Status Info Bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        <div className="space-y-1 text-slate-600">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold text-slate-800">
            <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Ketentuan Perhitungan Nilai SPO Harian:</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-slate-600 pl-5">
            <span>
              <strong className="text-slate-800">Poin 1.1 – 1.3:</strong> Bernilai{' '}
              <strong className="font-mono text-indigo-700">1</strong> per hari kerja terverifikasi
              (karena dilakukan 1 kali sehari)
            </span>
            <span aria-hidden="true" className="text-slate-300">
              &middot;
            </span>
            <span>
              <strong className="text-slate-800">Poin 2.1 – 6.5:</strong> Mengikuti jumlah pasien
              kelolaan terverifikasi yang dikerjakan (contoh: kelola 3 pasien, 1 belum dikerjakan
              pada poin 3.3 = nilai <strong className="font-mono text-amber-700">2</strong>)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pl-5 lg:pl-0">
          {recap.verifiedDaysCount === 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-700">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  {recap.unverifiedPatientsCount > 0
                    ? `${recap.unverifiedPatientsCount} pasien kelolaan belum diverifikasi PJ Shift / Ka. Ruang`
                    : 'Belum ada logbook terverifikasi bulan ini'}
                </span>
              </span>
              {onNavigateToLogbook && (
                <button
                  type="button"
                  onClick={onNavigateToLogbook}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Ke Logbook</span>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                </button>
              )}
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-700 tabular-nums">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Terverifikasi: {recap.verifiedDaysCount} Hari ({recap.totalVerifiedPatientsInMonth}{' '}
                Pasien)
                {recap.unverifiedPatientsCount > 0
                  ? ` · ${recap.unverifiedPatientsCount} menunggu verifikasi`
                  : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-500">Staff &amp; Hak Akses</div>
            <div className="text-sm font-black text-slate-900 mt-0.5 truncate">
              {logbook.nurseName}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {recap.roleLabel} &middot; NIP: {logbook.nipNira}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Hari Dinas Terverifikasi</div>
            <div className="text-base font-black text-slate-900 mt-0.5 font-mono">
              {recap.verifiedDaysCount} Hari
            </div>
            <div className="text-[11px] text-blue-700 font-medium">Periode {logbook.monthYear}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">
              Pasien Kelolaan Disahkan
            </div>
            <div className="text-base font-black text-slate-900 mt-0.5 font-mono">
              {recap.totalVerifiedPatientsInMonth} Pasien
            </div>
            <div className="text-[11px] text-emerald-700 font-medium">
              Oleh PJ Shift / Kepala Ruang
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Total &amp; Capaian SPO</div>
            <div className="text-base font-black text-emerald-800 mt-0.5 font-mono">
              {recap.overallCompliancePct}%
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Nilai: {recap.grandTotalScore} / {recap.grandMaxScore}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Award className="w-4 h-4" />
          </div>
        </div>
      </div>

      {viewMode === 'print' ? (
        <OfficialPelaksanaLogbookPrintable logbook={logbook} />
      ) : (
        /* Full Monthly Matrix 1-31 Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Matriks Rekapitulasi Nilai Harian Tanggal 1 s/d 31 ({logbook.monthYear})
              </h3>
              <p className="text-[11.5px] text-slate-500">
                Angka pada kolom tanggal menunjukkan nilai capaian terverifikasi per poin SPO (1
                untuk Poin 1.1–1.3; jumlah pasien kelolaan untuk Poin 2.1–6.5).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode('print')}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>Pratinjau Cetak A4</span>
            </button>
          </div>

          <div className="overflow-x-auto max-h-[700px] relative scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse tabular-nums">
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-900 text-white font-bold text-center text-[10px]">
                  <th
                    rowSpan={2}
                    className="p-2 border border-slate-700 w-11 sticky left-0 z-30 bg-slate-900"
                  >
                    POIN
                  </th>
                  <th
                    rowSpan={2}
                    className="p-2 border border-slate-700 w-36 text-left sticky left-11 z-30 bg-slate-900"
                  >
                    FASE ASUHAN
                  </th>
                  <th
                    rowSpan={2}
                    className="p-2 border border-slate-700 min-w-[210px] text-left bg-slate-900"
                  >
                    URAIAN KEGIATAN SPESIFIK SPO
                  </th>
                  <th
                    colSpan={31}
                    className="p-1 border border-slate-700 text-[9.5px] uppercase tracking-wider bg-slate-800"
                  >
                    NILAI HARIAN TERVERIFIKASI — BULAN {logbook.monthYear.toUpperCase()}
                  </th>
                  <th rowSpan={2} className="p-2 border border-slate-700 w-12 bg-slate-900">
                    TOTAL
                  </th>
                  <th rowSpan={2} className="p-2 border border-slate-700 w-12 bg-slate-900">
                    MAKS
                  </th>
                  <th rowSpan={2} className="p-2 border border-slate-700 w-14 bg-slate-900">
                    %
                  </th>
                </tr>
                <tr className="bg-slate-800 text-white font-bold text-[9px] text-center">
                  {daysArray.map((day, idx) => {
                    const isOutOfMonth = day > daysInMonth;
                    const isActiveDay = !isOutOfMonth && day === activeParsedDate.day;
                    const isVerifiedDay = !isOutOfMonth && Boolean(verifiedDays[idx]);
                    return (
                      <th
                        key={day}
                        title={
                          isActiveDay
                            ? `Hari / Tanggal Aktif: ${activeDateLabel}`
                            : isOutOfMonth
                            ? `Tidak ada tanggal ${day} pada periode ${logbook.monthYear}`
                            : `Tanggal ${day} ${logbook.monthYear}`
                        }
                        className={`p-1 border border-slate-700 w-6 font-mono ${
                          isOutOfMonth
                            ? 'bg-slate-900/60 text-slate-600'
                            : isActiveDay
                            ? 'bg-blue-600 text-white ring-1 ring-inset ring-cyan-300 font-black'
                            : isVerifiedDay
                            ? 'bg-indigo-700 text-white'
                            : ''
                        }`}
                      >
                        {day}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 text-[11px]">
                {/* Reference Row: Number of Verified Managed Patients per Day */}
                <tr className="bg-indigo-50/70 font-bold text-indigo-950">
                  <td
                    colSpan={2}
                    className="px-2.5 py-1.5 border-r border-slate-200 sticky left-0 bg-indigo-50 z-10 text-[10.5px] uppercase tracking-wide"
                  >
                    Pasien Terverifikasi
                  </td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-[10.5px] text-indigo-900">
                    Jumlah pasien kelolaan yang disahkan PJ Shift / Kepala Ruang
                  </td>
                  {daysArray.map((day, dayIdx) => {
                    const pCount = dailyPatCounts[dayIdx] || 0;
                    const isVerif = Boolean(verifiedDays[dayIdx]) && pCount > 0;
                    return (
                      <td
                        key={day}
                        className={`p-1 text-center font-mono border border-slate-200 text-[11px] ${
                          isVerif ? 'bg-indigo-100/80 text-indigo-900 font-black' : 'text-slate-300'
                        }`}
                      >
                        {isVerif ? pCount : ''}
                      </td>
                    );
                  })}
                  <td className="p-1.5 text-center font-mono font-black text-indigo-950 border-l border-slate-200">
                    {recap.totalVerifiedPatientsInMonth}
                  </td>
                  <td
                    colSpan={2}
                    className="p-1.5 text-center text-[10px] font-semibold text-indigo-800 border-l border-slate-200"
                  >
                    Pasien
                  </td>
                </tr>

                {/* Grouped SPO Items 1.1 through 6.5 */}
                {BAGIAN_SECTION_HEADERS.map((sec) => {
                  const sectionItems = OFFICIAL_LOGBOOK_ITEMS.filter(
                    (it) => it.bagian === sec.bagian
                  );

                  return (
                    <React.Fragment key={sec.bagian}>
                      <tr className="bg-slate-100/90 text-slate-800">
                        <td
                          colSpan={3}
                          className="px-2.5 py-1.5 font-bold text-[10.5px] uppercase tracking-wide sticky left-0 bg-slate-100 z-10 border-r border-slate-200"
                        >
                          <span>{sec.title}</span>
                          <span className="ml-2 font-semibold text-indigo-700 normal-case">
                            &middot; {sec.ruleBadge}
                          </span>
                        </td>
                        <td colSpan={34} className="bg-slate-100/90" />
                      </tr>

                      {sectionItems.map((item, idx) => {
                        const scoreArr = logbook.dailyScores?.[item.code] || [];
                        const stat = recap.itemStats[item.code] || {
                          totalScore: 0,
                          maxScore: 0,
                          pct: 0
                        };

                        return (
                          <tr
                            key={item.code}
                            className={
                              idx % 2 === 1
                                ? 'bg-slate-50/50 hover:bg-blue-50/30'
                                : 'bg-white hover:bg-blue-50/30'
                            }
                          >
                            <td className="px-2 py-1.5 text-center font-mono font-bold text-slate-900 border-r border-slate-200 sticky left-0 bg-inherit z-10">
                              {item.code}
                            </td>
                            <td className="px-2 py-1.5 font-semibold text-slate-800 border-r border-slate-200 sticky left-11 bg-inherit z-10 leading-tight text-[10.5px]">
                              {item.category}
                            </td>
                            <td className="px-2 py-1.5 text-slate-700 border-r border-slate-200 text-[10.5px] leading-tight">
                              {item.description}
                            </td>

                            {daysArray.map((day, dayIdx) => {
                              const val = scoreArr[dayIdx];
                              const isVerif =
                                Boolean(verifiedDays[dayIdx]) &&
                                val !== null &&
                                val !== undefined;
                              const maxCell =
                                item.bagian === 1 ? 1 : dailyPatCounts[dayIdx] || 0;

                              const cellColor = !isVerif
                                ? 'text-slate-300'
                                : val === maxCell && maxCell > 0
                                ? 'bg-emerald-50 text-emerald-800 font-bold'
                                : val > 0
                                ? 'bg-amber-50 text-amber-800 font-bold'
                                : 'bg-rose-50/70 text-rose-700 font-semibold';

                              return (
                                <td
                                  key={day}
                                  className={`p-0.5 text-center font-mono border border-slate-200 text-[11px] ${cellColor}`}
                                  title={
                                    isVerif
                                      ? `Tanggal ${day}: Poin ${item.code} = ${val} dari ${maxCell}`
                                      : undefined
                                  }
                                >
                                  {isVerif ? val : ''}
                                </td>
                              );
                            })}

                            <td className="p-1.5 text-center font-mono font-bold text-slate-900 border-l border-slate-200">
                              {stat.totalScore}
                            </td>
                            <td className="p-1.5 text-center font-mono text-slate-500 border-l border-slate-200">
                              {stat.maxScore}
                            </td>
                            <td
                              className={`p-1.5 text-center font-mono font-bold border-l border-slate-200 ${
                                stat.maxScore === 0
                                  ? 'text-slate-400'
                                  : stat.pct === 100
                                  ? 'text-emerald-700'
                                  : stat.pct >= 70
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              {stat.pct}%
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {/* Footer Sums */}
                <tr className="bg-slate-100 font-bold text-slate-900 text-center border-t-2 border-slate-300 text-[10px] sticky bottom-0 z-10">
                  <td
                    colSpan={3}
                    className="p-2 border-r border-slate-300 text-right uppercase tracking-wider font-extrabold sticky left-0 bg-slate-100 z-10"
                  >
                    TOTAL NILAI KEGIATAN TERVERIFIKASI PER HARI
                  </td>
                  {daysArray.map((_, dayIdx) => {
                    const daySum = recap.dailyTotalScores[dayIdx];
                    const dayMax = recap.dailyMaxScores[dayIdx];
                    const hasDay = daySum !== null && daySum !== undefined;
                    return (
                      <td
                        key={dayIdx}
                        className={`p-1 border border-slate-300 font-mono ${
                          hasDay ? 'bg-emerald-50/70 text-slate-900 font-black' : 'text-slate-300'
                        }`}
                        title={hasDay ? `Nilai Harian: ${daySum} / ${dayMax}` : undefined}
                      >
                        {hasDay ? daySum : ''}
                      </td>
                    );
                  })}
                  <td className="p-2 border-l border-slate-300 font-mono font-black text-blue-950 text-[11px]">
                    {recap.grandTotalScore}
                  </td>
                  <td className="p-2 border-l border-slate-300 font-mono font-bold text-slate-600 text-[11px]">
                    {recap.grandMaxScore}
                  </td>
                  <td className="p-2 border-l border-slate-300 font-mono font-black text-emerald-800 text-[11px]">
                    {recap.overallCompliancePct}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
