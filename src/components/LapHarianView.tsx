import React, { useState, useMemo, useEffect } from 'react';
import {
  ShiftInfo,
  AggregatedCensus,
  MachineOverview,
  ClinicalIndicatorItem,
  OperationalItem,
  SbarData,
  PatientHDSession,
  ShiftSignatures,
  SystemAccessRole,
  MasterNurse,
  MasterPatient,
  HdTreatmentDay
} from '../types/dialysis.ts';
import { OfficialReportPrintable } from './OfficialReportPrintable.tsx';
import { LoginUserData } from './LoginPage.tsx';
import { generateAutoSbar } from '../utils/hdCalculator.ts';
import { filterMasterPatientsForActiveSchedule } from '../utils/masterDataHelpers.ts';
import {
  extractActiveDayName,
  formatShortIndonesianTimestampWib,
  normalizeIndonesianDateLabel
} from '../utils/dateHelpers.ts';
import {
  initialOperationalItems,
  initialMachineOverview
} from '../data/mockShiftData.ts';
import {
  FileText,
  Printer,
  Sparkles,
  CheckSquare,
  Users,
  ShieldCheck,
  Save,
  CheckCircle,
  RefreshCw,
  Activity,
  Droplets,
  Stethoscope,
  Plus,
  Trash2,
  RotateCcw,
  Edit3,
  Cpu,
  Layers,
  ClipboardCheck
} from 'lucide-react';

interface LapHarianViewProps {
  shiftInfo: ShiftInfo;
  setShiftInfo: React.Dispatch<React.SetStateAction<ShiftInfo>>;
  census: AggregatedCensus;
  machineOverview: MachineOverview;
  setMachineOverview: React.Dispatch<React.SetStateAction<MachineOverview>>;
  clinicalIndicators: ClinicalIndicatorItem[];
  operationalItems: OperationalItem[];
  setOperationalItems: React.Dispatch<React.SetStateAction<OperationalItem[]>>;
  sbar: SbarData;
  setSbar: React.Dispatch<React.SetStateAction<SbarData>>;
  signatures: ShiftSignatures;
  setSignatures: React.Dispatch<React.SetStateAction<ShiftSignatures>>;
  sessions: PatientHDSession[];
  userRole?: SystemAccessRole;
  loggedInUser?: LoginUserData | null;
  masterNurses?: MasterNurse[];
  masterPatients?: MasterPatient[];
}

type LapHarianSubTab =
  | 'preview_full'
  | 'section_a'
  | 'section_b'
  | 'section_c'
  | 'section_d'
  | 'section_e'
  | 'section_f';

const STORAGE_KEYS = {
  CENSUS: 'rshl_manual_census_v3',
  MACHINE: 'rshl_manual_machine_v3',
  CLINICAL: 'rshl_manual_clinical_v3'
};

export const LapHarianView: React.FC<LapHarianViewProps> = ({
  shiftInfo,
  setShiftInfo,
  census,
  machineOverview,
  setMachineOverview,
  clinicalIndicators,
  operationalItems,
  setOperationalItems,
  sbar,
  setSbar,
  signatures,
  setSignatures,
  sessions,
  userRole = 'pj_shift',
  loggedInUser,
  masterPatients = []
}) => {
  const [activeSubTab, setActiveSubTab] = useState<LapHarianSubTab>('preview_full');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeDay = extractActiveDayName(shiftInfo.date) as HdTreatmentDay;
  const activeShift: 'Pagi' | 'Siang' = shiftInfo.shift === 'Siang' ? 'Siang' : 'Pagi';

  // Strictly filter master patients scheduled on the active day & shift (e.g. Senin Pagi / Senin Siang)
  const scheduledPatients = useMemo(() => {
    if (!masterPatients || masterPatients.length === 0) return [];
    return filterMasterPatientsForActiveSchedule(masterPatients, activeDay, activeShift);
  }, [masterPatients, activeDay, activeShift]);

  const scheduledPatientsCount = useMemo(() => {
    if (scheduledPatients.length > 0) return scheduledPatients.length;
    return census.pasienTerjadwal;
  }, [scheduledPatients.length, census.pasienTerjadwal]);

  // =========================================================================
  // MANUAL STATES FOR SECTIONS B & C (WITH LOCALSTORAGE PERSISTENCE)
  // Sections A, D, E, F use their respective parent props (shiftInfo,
  // operationalItems, sbar, signatures) which are fully editable manually.
  // =========================================================================

  const [manualCensus, setManualCensus] = useState<AggregatedCensus>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CENSUS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore parse errors
    }
    return {
      ...census,
      pasienTerjadwal: scheduledPatientsCount
    };
  });

  const [manualMachine, setManualMachine] = useState<MachineOverview>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MACHINE);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return machineOverview || initialMachineOverview;
  });

  const [manualClinical, setManualClinical] = useState<ClinicalIndicatorItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLINICAL);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return clinicalIndicators && clinicalIndicators.length > 0
      ? clinicalIndicators
      : [];
  });

  // Sync manual machine with parent state & storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CENSUS, JSON.stringify(manualCensus));
    } catch {
      // storage quota
    }
  }, [manualCensus]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.MACHINE, JSON.stringify(manualMachine));
      setMachineOverview(manualMachine);
    } catch {
      // storage quota
    }
  }, [manualMachine, setMachineOverview]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CLINICAL, JSON.stringify(manualClinical));
    } catch {
      // storage quota
    }
  }, [manualClinical]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  // =========================================================================
  // LOGBOOK SHIFT AUTO-SYNCHRONIZATION (FOR PJ SHIFT & KEPALA RUANGAN)
  // =========================================================================
  const [, setAutoSyncedFromLogbook] = useState<boolean>(false);

  const detectLogbookShift = (): 'Pagi' | 'Siang' | null => {
    // 1. Direct saved logbook shift
    try {
      const saved = localStorage.getItem('dialysis_last_logbook_shift');
      if (saved === 'Pagi' || saved === 'Siang') return saved;
    } catch {
      // ignore
    }

    // 2. Check the verification registry entries (most recent nurse submissions from logbook)
    try {
      const rawReg = localStorage.getItem('logbook_verification_registry_v5');
      if (rawReg) {
        const reg = JSON.parse(rawReg);
        if (Array.isArray(reg) && reg.length > 0) {
          for (let i = reg.length - 1; i >= 0; i--) {
            const entry = reg[i];
            if (entry && (entry.shift === 'Pagi' || entry.shift === 'Siang')) {
              return entry.shift;
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // 3. Check any nurse's saved logbook shift schedule in localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('logbook_shift_schedule_v6_')) {
          const val = localStorage.getItem(key);
          if (val === 'Pagi' || val === 'Siang') return val;
        }
      }
    } catch {
      // ignore
    }

    // 4. Check sessions list for recorded shift
    if (sessions && sessions.length > 0) {
      const sessionWithShift = sessions.find((s) => s.shift === 'Pagi' || s.shift === 'Siang');
      if (sessionWithShift?.shift === 'Pagi' || sessionWithShift?.shift === 'Siang') {
        return sessionWithShift.shift;
      }
    }

    // 5. Check loggedInUser assigned shift
    if (loggedInUser?.shift === 'Pagi' || loggedInUser?.shift === 'Siang') {
      return loggedInUser.shift;
    }

    return null;
  };

  // Auto-sync shift from logbook on mount or when sessions update for PJ Shift and Kepala Ruang
  useEffect(() => {
    if (userRole !== 'pj_shift' && userRole !== 'kepala_ruangan') return;

    const logbookShift = detectLogbookShift();
    if (logbookShift && logbookShift !== shiftInfo.shift) {
      const nextHours =
        logbookShift === 'Siang'
          ? 'Siang, jam 14.00 - 21.00 WIB'
          : 'Pagi, jam 07.00 - 14.00 WIB';

      setShiftInfo((prev) => ({
        ...prev,
        shift: logbookShift,
        shiftHours: nextHours
      }));
      setAutoSyncedFromLogbook(true);
      showToast(`Shift Laporan Harian otomatis diselaraskan ke Shift ${logbookShift} sesuai logbook.`);
    } else if (logbookShift && logbookShift === shiftInfo.shift) {
      setAutoSyncedFromLogbook(true);
    }
  }, [userRole, sessions]);

  // When scheduledPatientsCount updates from a shift switch, sync manualCensus.pasienTerjadwal
  useEffect(() => {
    if (scheduledPatientsCount > 0) {
      setManualCensus((prev) => ({
        ...prev,
        pasienTerjadwal: scheduledPatientsCount
      }));
    }
  }, [scheduledPatientsCount]);

  const handleSwitchShift = (targetShift: 'Pagi' | 'Siang') => {
    const nextHours =
      targetShift === 'Siang'
        ? 'Siang, jam 14.00 - 21.00 WIB'
        : 'Pagi, jam 07.00 - 14.00 WIB';

    try {
      localStorage.setItem('dialysis_last_logbook_shift', targetShift);
    } catch {
      // ignore
    }

    setShiftInfo((prev) => ({
      ...prev,
      shift: targetShift,
      shiftHours: nextHours
    }));
    setAutoSyncedFromLogbook(true);
    showToast(`Shift Laporan dialihkan ke Shift ${targetShift} (${nextHours}).`);
  };

  // =========================================================================
  // ACTIONS & HANDLERS
  // =========================================================================

  const handleCensusChange = (field: keyof AggregatedCensus, value: number) => {
    const safeVal = Math.max(0, isNaN(value) ? 0 : value);
    setManualCensus((prev) => {
      const next = { ...prev, [field]: safeVal };
      // Keep totalPasienDilayani consistent if user modifies hadir or cito
      if (field === 'pasienHadirSelesai' || field === 'pasienCitoEmergency') {
        next.totalPasienDilayani = next.pasienHadirSelesai + next.pasienCitoEmergency;
      }
      return next;
    });
  };

  const handleMachineChange = (field: keyof MachineOverview, value: number) => {
    const safeVal = Math.max(0, isNaN(value) ? 0 : value);
    setManualMachine((prev) => ({ ...prev, [field]: safeVal }));
  };

  const handleClinicalChange = (
    id: string,
    field: keyof ClinicalIndicatorItem,
    value: string | boolean
  ) => {
    setManualClinical((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleAddClinicalIndicator = () => {
    const newId = `cli-${Date.now()}`;
    const newItem: ClinicalIndicatorItem = {
      id: newId,
      label: 'Indikator Klinis Baru',
      capaian: '0',
      standar: 'Standar Target',
      analisis: 'Hasil observasi dan tindak lanjut',
      isStandardMet: true
    };
    setManualClinical((prev) => [...prev, newItem]);
    showToast('Baris indikator klinis baru berhasil ditambahkan.');
  };

  const handleDeleteClinicalIndicator = (id: string) => {
    setManualClinical((prev) => prev.filter((item) => item.id !== id));
    showToast('Baris indikator klinis dihapus.');
  };

  const handleResetClinicalToStandard = () => {
    setManualClinical(clinicalIndicators);
    showToast('Indikator klinis direset ke 8 standar mutu PERNEFRI.');
  };

  const handleOperationalChange = (
    id: string,
    field: keyof OperationalItem,
    value: string
  ) => {
    setOperationalItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleAddOperationalItem = () => {
    const newId = `op-${Date.now()}`;
    const newItem: OperationalItem = {
      id: newId,
      item: 'Item Pengawasan Baru',
      parameterUji: 'Parameter pengawasan & pengujian',
      hasilObservasi: 'Hasil observasi fisik / uji shift',
      statusKepatuhan: 'MEMENUHI SYARAT'
    };
    setOperationalItems((prev) => [...prev, newItem]);
    showToast('Baris item operasional baru berhasil ditambahkan.');
  };

  const handleDeleteOperationalItem = (id: string) => {
    setOperationalItems((prev) => prev.filter((item) => item.id !== id));
    showToast('Item operasional dihapus.');
  };

  const handleResetOperationalToStandard = () => {
    setOperationalItems(initialOperationalItems);
    showToast('Item operasional direset ke standar KARS.');
  };

  const handlePullBaselineFromSessions = () => {
    // Populate manual census and clinical indicators from live session aggregates
    setManualCensus({
      ...census,
      pasienTerjadwal: scheduledPatientsCount
    });
    setManualClinical(clinicalIndicators);
    showToast('Data sensus & indikator berhasil diisi dari catatan sesi pasien shift ini sebagai draf awal.');
  };

  const handleRegenerateSbar = () => {
    const freshSbar = generateAutoSbar(shiftInfo, manualCensus, sessions);
    setSbar(freshSbar);
    showToast('Teks narasi SBAR diperbarui dari data sensus manual shift ini!');
  };

  const handleSign = (roleKey: 'pjShift' | 'pjBerikutnya' | 'kepalaRuangan') => {
    const timeFormatted = formatShortIndonesianTimestampWib();
    const signerName =
      roleKey === 'pjShift'
        ? (userRole === 'pj_shift' && loggedInUser?.name) || shiftInfo.pjShift || 'PJ Shift'
        : roleKey === 'kepalaRuangan'
        ? (userRole === 'kepala_ruangan' && loggedInUser?.name) || shiftInfo.kepalaRuangan || 'Kepala Ruangan'
        : shiftInfo.pjShiftBerikutnya || 'PJ Shift Berikutnya';

    setSignatures((prev) => ({
      ...prev,
      [roleKey]: {
        name: signerName,
        signed: true,
        signedAt: timeFormatted
      }
    }));

    if (roleKey === 'pjShift' && signerName && (!shiftInfo.pjShift || shiftInfo.pjShift === '-')) {
      setShiftInfo((prev) => ({ ...prev, pjShift: signerName }));
    }
    if (roleKey === 'kepalaRuangan' && signerName && (!shiftInfo.kepalaRuangan || shiftInfo.kepalaRuangan === '-')) {
      setShiftInfo((prev) => ({ ...prev, kepalaRuangan: signerName }));
    }

    const roleTitle =
      roleKey === 'pjShift'
        ? 'PJ Shift'
        : roleKey === 'pjBerikutnya'
        ? 'PJ Shift Berikutnya'
        : 'Kepala Ruangan';
    showToast(`Pengesahan digital ${roleTitle} berhasil dibubuhkan (${timeFormatted}).`);
  };

  const handleResetSignature = (roleKey: 'pjShift' | 'pjBerikutnya' | 'kepalaRuangan') => {
    setSignatures((prev) => ({
      ...prev,
      [roleKey]: {
        ...prev[roleKey],
        signed: false,
        signedAt: ''
      }
    }));
    showToast('Status tanda tangan telah direset.');
  };

  const handleSaveAllReport = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.CENSUS, JSON.stringify(manualCensus));
      localStorage.setItem(STORAGE_KEYS.MACHINE, JSON.stringify(manualMachine));
      localStorage.setItem(STORAGE_KEYS.CLINICAL, JSON.stringify(manualClinical));
      localStorage.setItem('rshl_shift_operational_v1', JSON.stringify(operationalItems));
      localStorage.setItem('rshl_shift_sbar_v1', JSON.stringify(sbar));
      localStorage.setItem('dialysis_signatures_v1', JSON.stringify(signatures));
    } catch {
      // ignore
    }
    showToast('Laporan Harian (Seksi A s/d F) berhasil disimpan dan disinkronkan ke lembar cetak.');
  };

  const activeDateFormatted = normalizeIndonesianDateLabel(shiftInfo.date);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs border border-slate-700 animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Title Lockup */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1e4b85]/10 text-[#1e4b85] border border-[#1e4b85]/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Standar Akreditasi KARS &amp; PERNEFRI
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <Edit3 className="w-3 h-3" />
              Mode Pengisian Manual (Seksi A–F)
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              Unit HD RS Happy Land
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1 uppercase tracking-tight">
            LAPORAN HARIAN SHIFT HEMODIALISIS
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Laporan pertanggungjawaban shift dinas untuk PJ Shift &amp; Kepala Ruang. Seluruh seksi (A, B, C, D, E, dan F) diisi secara manual dan otomatis menyinkronkan lembar cetak resmi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePullBaselineFromSessions}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition-colors cursor-pointer shadow-2xs"
            title="Salin data sensus pasien shift ini sebagai nilai awal"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
            <span>Tarik Draf Sesi</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAllReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Laporan</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1e4b85] hover:bg-[#163865] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak PDF Laporan (A–F)</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs Navigation for Section Selection */}
      <div className="bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/80 shadow-xs flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('preview_full')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'preview_full'
                ? 'bg-[#1e4b85] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            Dokumen Cetak (A–F)
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('section_a')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'section_a'
                ? 'bg-[#1e4b85] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            Seksi A: Ketenagaan
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('section_b')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'section_b'
                ? 'bg-[#1e4b85] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Activity className="w-4 h-4" />
            Seksi B: Sensus &amp; Mesin
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('section_c')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'section_c'
                ? 'bg-[#1e4b85] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            Seksi C: Asuhan Klinis
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('section_d')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'section_d'
                ? 'bg-[#1e4b85] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            Seksi D: Operasional &amp; RO
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('section_e')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'section_e'
                ? 'bg-[#1e4b85] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Seksi E: Handover SBAR
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('section_f')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'section_f'
                ? 'bg-[#1e4b85] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Seksi F: Pengesahan
          </button>
        </div>

        {/* Shift Badge Indicator */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-[11px] font-semibold text-slate-700">
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-900">
            Shift {shiftInfo.shift}
            {(userRole === 'pj_shift' || userRole === 'kepala_ruangan') && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide bg-blue-100 text-blue-800 border border-blue-200"
                title="Shift otomatis diselaraskan dengan input logbook"
              >
                Otomatis Logbook
              </span>
            )}
          </span>
          <span className="text-slate-300">|</span>
          <span>{activeDateFormatted}</span>
          {(userRole === 'pj_shift' || userRole === 'kepala_ruangan') && (
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs ml-1">
              <button
                type="button"
                onClick={() => handleSwitchShift('Pagi')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                  shiftInfo.shift === 'Pagi'
                    ? 'bg-[#1e4b85] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title="Alihkan ke Shift Pagi (07.00 - 14.00 WIB)"
              >
                Pagi
              </button>
              <button
                type="button"
                onClick={() => handleSwitchShift('Siang')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                  shiftInfo.shift === 'Siang'
                    ? 'bg-[#1e4b85] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title="Alihkan ke Shift Siang (14.00 - 21.00 WIB)"
              >
                Siang
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 1. PREVIEW DOKUMEN CETAK LENGKAP (SEKSI A–F)                           */}
      {/* ===================================================================== */}
      {activeSubTab === 'preview_full' && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900 print:hidden">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-700 shrink-0" />
              <span>
                <strong>Pratinjau Lembar Cetak Resmi:</strong> Dokumen berikut mencerminkan data manual dari Seksi A, B, C, D, E, dan F secara <em>real-time</em>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveSubTab('section_a')}
              className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Mulai Edit Seksi A
            </button>
          </div>

          <OfficialReportPrintable
            shiftInfo={shiftInfo}
            census={manualCensus}
            machineOverview={manualMachine}
            clinicalIndicators={manualClinical}
            operationalItems={operationalItems}
            sbar={sbar}
            signatures={signatures}
            onPrint={() => window.print()}
            onSign={handleSign}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. SEKSI A: INFORMASI UMUM SHIFT & KETENAGAAN (MANPOWER)              */}
      {/* ===================================================================== */}
      {activeSubTab === 'section_a' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="text-[11px] font-bold text-[#1e4b85] uppercase tracking-wider">
                SEKSI A (PENGISIAN MANUAL)
              </div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                <Users className="w-5 h-5 text-[#1e4b85]" />
                Informasi Umum Shift &amp; Ketenagaan (Manpower)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pencatatan manual hari dinas, dokter DPJP, dokter jaga, PJ shift, rasio perawat:pasien, dan tenaga pendukung.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                handleSaveAllReport();
                setActiveSubTab('section_b');
              }}
              className="px-4 py-2 bg-[#1e4b85] hover:bg-[#163865] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 self-start cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Simpan &amp; Lanjut ke Seksi B
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box 1: Shift & Tenaga Medis */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="text-xs font-bold text-[#1e4b85] uppercase tracking-wider flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4" />
                Shift Dinas &amp; Dokter Penanggung Jawab
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Hari &amp; Tanggal Dinas
                  </label>
                  <input
                    type="text"
                    value={shiftInfo.date}
                    onChange={(e) => setShiftInfo({ ...shiftInfo, date: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                    placeholder="Senin, 26 Oktober 2026"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Shift Dinas &amp; Jam
                    </label>
                    {(userRole === 'pj_shift' || userRole === 'kepala_ruangan') && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        Otomatis Logbook
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={shiftInfo.shiftHours}
                      onChange={(e) => setShiftInfo({ ...shiftInfo, shiftHours: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                      placeholder="Pagi, jam 07.00 - 14.00 WIB"
                    />
                    {(userRole === 'pj_shift' || userRole === 'kepala_ruangan') && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-500 font-medium">Pilihan Cepat:</span>
                        <button
                          type="button"
                          onClick={() => handleSwitchShift('Pagi')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer border transition-colors ${
                            shiftInfo.shift === 'Pagi'
                              ? 'bg-[#1e4b85] text-white border-[#1e4b85]'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Shift Pagi (07.00 - 14.00)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSwitchShift('Siang')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer border transition-colors ${
                            shiftInfo.shift === 'Siang'
                              ? 'bg-[#1e4b85] text-white border-[#1e4b85]'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Shift Siang (14.00 - 21.00)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Dokter DPJP Unit Hemodialisis
                  </label>
                  <input
                    type="text"
                    value={shiftInfo.dokterDpjp}
                    onChange={(e) => setShiftInfo({ ...shiftInfo, dokterDpjp: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    placeholder="dr. Sp.PD-KGH"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Dokter Jaga Ruangan HD
                  </label>
                  <input
                    type="text"
                    value={shiftInfo.dokterJaga}
                    onChange={(e) => setShiftInfo({ ...shiftInfo, dokterJaga: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    placeholder="dr. Jaga Ruangan"
                  />
                </div>
              </div>
            </div>

            {/* Box 2: Ketenagaan & Pejabat Shift */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="text-xs font-bold text-[#1e4b85] uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                Pejabat Shift &amp; Rasio Asuhan
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Perawat PJ Shift
                  </label>
                  <input
                    type="text"
                    value={shiftInfo.pjShift}
                    onChange={(e) => setShiftInfo({ ...shiftInfo, pjShift: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-900"
                    placeholder="Nama Perawat PJ Shift"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Kepala Ruangan HD
                  </label>
                  <input
                    type="text"
                    value={shiftInfo.kepalaRuangan}
                    onChange={(e) => setShiftInfo({ ...shiftInfo, kepalaRuangan: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-900"
                    placeholder="Nama Kepala Ruangan"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Detail Perawat Dinas
                  </label>
                  <input
                    type="text"
                    value={shiftInfo.detailPerawat}
                    onChange={(e) => setShiftInfo({ ...shiftInfo, detailPerawat: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    placeholder="8 Orang (1 Ka. Ruangan, 1 PJ Shift, 6 Pelaksana)"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Rasio Perawat : Pasien
                  </label>
                  <input
                    type="text"
                    value={shiftInfo.perawatRatio}
                    onChange={(e) => setShiftInfo({ ...shiftInfo, perawatRatio: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white font-bold text-emerald-800"
                    placeholder="1 : 3 Pasien (Standar PERNEFRI)"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Tenaga Pendukung Dinas (RO / Elektromedis / HK / Admin)
                  </label>
                  <input
                    type="text"
                    value={shiftInfo.tenagaPendukung}
                    onChange={(e) => setShiftInfo({ ...shiftInfo, tenagaPendukung: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    placeholder="1 Teknisi Elektromedis/RO, 1 HK Ruangan, 1 Administrasi"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. SEKSI B: SENSUS PASIEN, AKSES VASKULAR & UTILISASI MESIN HD         */}
      {/* ===================================================================== */}
      {activeSubTab === 'section_b' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="text-[11px] font-bold text-[#1e4b85] uppercase tracking-wider">
                SEKSI B (PENGISIAN MANUAL)
              </div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                <Activity className="w-5 h-5 text-[#1e4b85]" />
                Sensus Pasien, Akses Vaskular &amp; Utilisasi Mesin Hemodialisis
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Seluruh kolom angka sensus dan mesin diisi secara manual. Anda dapat mengubah jumlah pasien hadir, rawat jalan/inap, akses vaskular, maupun mesin aktif.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start">
              <button
                type="button"
                onClick={handlePullBaselineFromSessions}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 flex items-center gap-1.5 cursor-pointer"
                title="Salin hitungan otomatis sesi pasien ke form manual"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                Salin dari Sesi Pasien
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSaveAllReport();
                  setActiveSubTab('section_c');
                }}
                className="px-4 py-2 bg-[#1e4b85] hover:bg-[#163865] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Simpan &amp; Lanjut ke Seksi C
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Sub-Section: Sensus & Klasifikasi Pasien */}
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#1e4b85] uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    Sensus &amp; Klasifikasi Pasien Shift
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Input Manual
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* Pasien Terjadwal */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-800 block">Pasien Terjadwal (Target Shift)</span>
                      <span className="text-[10px] text-slate-400">Target pasien terjadwal {activeDay} {activeShift}</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.pasienTerjadwal}
                      onChange={(e) => handleCensusChange('pasienTerjadwal', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>

                  {/* Pasien Hadir & Selesai HD */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <div>
                      <span className="font-semibold text-blue-900 block">Pasien Hadir &amp; Selesai HD</span>
                      <span className="text-[10px] text-slate-400">Jumlah pasien yang tuntas menjalani hemodialisa</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.pasienHadirSelesai}
                      onChange={(e) => handleCensusChange('pasienHadirSelesai', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-extrabold text-sm p-1.5 border border-blue-300 rounded-lg bg-blue-50/40 text-blue-950 focus:bg-white"
                    />
                  </div>

                  {/* Pasien HD Cito / Emergency */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <div>
                      <span className="font-semibold text-rose-800 block">Pasien HD Cito / Emergency (ICU/IGD)</span>
                      <span className="text-[10px] text-slate-400">Pasien tidak terjadwal rujukan gawat darurat</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.pasienCitoEmergency}
                      onChange={(e) => handleCensusChange('pasienCitoEmergency', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-rose-300 rounded-lg bg-rose-50/40 text-rose-950 focus:bg-white"
                    />
                  </div>

                  {/* Pasien Batal / Tunda */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-700 block">Pasien Batal / Tunda (Reschedule)</span>
                      <span className="text-[10px] text-slate-400">Pasien berhalangan / kondisi hemodinamik tidak stabil</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.pasienBatalTunda}
                      onChange={(e) => handleCensusChange('pasienBatalTunda', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>

                  {/* Kategori Reguler */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-800 block">Kategori: Pasien Reguler (Non-Hepatitis)</span>
                      <span className="text-[10px] text-slate-400">Ruangan hemodialisis reguler</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.pasienReguler}
                      onChange={(e) => handleCensusChange('pasienReguler', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>

                  {/* Kategori Hep B */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <div>
                      <span className="font-semibold text-amber-800 block">Kategori: Pasien Isolasi Hepatitis B</span>
                      <span className="text-[10px] text-slate-400">Ruangan isolasi khusus Hepatitis B (HBsAg +)</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.pasienHepB}
                      onChange={(e) => handleCensusChange('pasienHepB', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-amber-300 rounded-lg bg-amber-50/40 text-amber-900 focus:bg-white"
                    />
                  </div>

                  {/* Kategori Hep C */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <div>
                      <span className="font-semibold text-amber-800 block">Kategori: Pasien Isolasi Hepatitis C / HIV</span>
                      <span className="text-[10px] text-slate-400">Ruangan / mesin khusus Hepatitis C / HIV</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.pasienHepC}
                      onChange={(e) => handleCensusChange('pasienHepC', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-amber-300 rounded-lg bg-amber-50/40 text-amber-900 focus:bg-white"
                    />
                  </div>

                  {/* Rawat Jalan vs Inap */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-2 rounded-lg bg-white border border-slate-200">
                      <span className="font-semibold text-slate-800 block text-[11px]">Pasien Rawat Jalan (Rajal)</span>
                      <input
                        type="number"
                        min={0}
                        value={manualCensus.pasienRajal}
                        onChange={(e) => handleCensusChange('pasienRajal', parseInt(e.target.value, 10))}
                        className="w-full text-center font-bold text-sm p-1 mt-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                      />
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-slate-200">
                      <span className="font-semibold text-slate-800 block text-[11px]">Pasien Rawat Inap (Ranap)</span>
                      <input
                        type="number"
                        min={0}
                        value={manualCensus.pasienRanap}
                        onChange={(e) => handleCensusChange('pasienRanap', parseInt(e.target.value, 10))}
                        className="w-full text-center font-bold text-sm p-1 mt-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Total Pasien Dilayani */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                    <div>
                      <span className="font-bold text-blue-950 block">Total Pasien Dilayani Shift Ini</span>
                      <span className="text-[10px] text-blue-700">Dapat diedit atau mengikuti Hadir + Cito</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.totalPasienDilayani}
                      onChange={(e) => handleCensusChange('totalPasienDilayani', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-black text-base p-1 border border-blue-400 rounded-lg bg-white text-blue-950"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Sub-Section: Mesin HD & Akses Vaskular */}
            <div className="space-y-4">
              {/* Box 1: Kapasitas Mesin */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#1e4b85] uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-4 h-4" />
                    Kapasitas &amp; Utilisasi Mesin HD
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-800">
                    {manualMachine.beroperasiSiapPakai} Beroperasi
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-semibold text-slate-800">Total Kapasitas Mesin HD</span>
                    <input
                      type="number"
                      min={0}
                      value={manualMachine.totalCapacity}
                      onChange={(e) => handleMachineChange('totalCapacity', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-semibold text-emerald-800">Mesin Beroperasi Siap Pakai</span>
                    <input
                      type="number"
                      min={0}
                      value={manualMachine.beroperasiSiapPakai}
                      onChange={(e) => handleMachineChange('beroperasiSiapPakai', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-emerald-300 rounded-lg bg-emerald-50/40 text-emerald-950 focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-semibold text-slate-600">Mesin Maintenance / Perbaikan</span>
                    <input
                      type="number"
                      min={0}
                      value={manualMachine.maintenance}
                      onChange={(e) => handleMachineChange('maintenance', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-semibold text-amber-800">Mesin Khusus Hepatitis B (Isolasi)</span>
                    <input
                      type="number"
                      min={0}
                      value={manualMachine.khususHepB}
                      onChange={(e) => handleMachineChange('khususHepB', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-amber-300 rounded-lg bg-amber-50/40 text-amber-950 focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-semibold text-amber-800">Mesin Khusus Hepatitis C</span>
                    <input
                      type="number"
                      min={0}
                      value={manualMachine.khususHepC}
                      onChange={(e) => handleMachineChange('khususHepC', parseInt(e.target.value, 10))}
                      className="w-20 text-center font-bold text-sm p-1.5 border border-amber-300 rounded-lg bg-amber-50/40 text-amber-950 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Box 2: Akses Vaskular */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="text-xs font-bold text-[#1e4b85] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  Distribusi Akses Vaskular Pasien Shift
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-semibold text-slate-800 block text-[11px]">AV Fistula (Cimino)</span>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.aksesAvFistula}
                      onChange={(e) => handleCensusChange('aksesAvFistula', parseInt(e.target.value, 10))}
                      className="w-full text-center font-bold text-sm p-1 mt-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-semibold text-slate-800 block text-[11px]">AV Graft</span>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.aksesAvGraft}
                      onChange={(e) => handleCensusChange('aksesAvGraft', parseInt(e.target.value, 10))}
                      className="w-full text-center font-bold text-sm p-1 mt-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-semibold text-slate-800 block text-[11px]">CDL Non-Tunnel</span>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.aksesCdlNonTunnel}
                      onChange={(e) => handleCensusChange('aksesCdlNonTunnel', parseInt(e.target.value, 10))}
                      className="w-full text-center font-bold text-sm p-1 mt-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="font-semibold text-slate-800 block text-[11px]">CDL Tunnel (Permcath)</span>
                    <input
                      type="number"
                      min={0}
                      value={manualCensus.aksesCdlPermcath}
                      onChange={(e) => handleCensusChange('aksesCdlPermcath', parseInt(e.target.value, 10))}
                      className="w-full text-center font-bold text-sm p-1 mt-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. SEKSI C: MONITORING ASUHAN KEPERAWATAN & PELAYANAN MEDIS SHIFT      */}
      {/* ===================================================================== */}
      {activeSubTab === 'section_c' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="text-[11px] font-bold text-[#1e4b85] uppercase tracking-wider">
                SEKSI C (PENGISIAN MANUAL)
              </div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                <Stethoscope className="w-5 h-5 text-[#1e4b85]" />
                Monitoring Asuhan Keperawatan &amp; Pelayanan Medis Shift
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Input manual indikator asuhan klinis (capaian UF, insiden hipotensi, kram, clotting, alergi first-use, konsultasi DPJP). Anda dapat mengedit nilai capaian, target, analisis, atau menambah indikator baru.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <button
                type="button"
                onClick={handleResetClinicalToStandard}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 flex items-center gap-1.5 cursor-pointer"
                title="Kembalikan ke 8 indikator standar PERNEFRI"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                Reset Standar
              </button>
              <button
                type="button"
                onClick={handleAddClinicalIndicator}
                className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold rounded-xl border border-blue-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-700" />
                Tambah Indikator
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSaveAllReport();
                  setActiveSubTab('section_d');
                }}
                className="px-4 py-2 bg-[#1e4b85] hover:bg-[#163865] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Simpan &amp; Lanjut ke Seksi D
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-[#1e4b85]/10 text-slate-900 font-bold">
                  <th className="p-2.5 border border-slate-200 w-1/4">Indikator Asuhan Keperawatan &amp; Medis</th>
                  <th className="p-2.5 border border-slate-200 w-1/6 text-center">Capaian Shift Ini</th>
                  <th className="p-2.5 border border-slate-200 w-1/6 text-center">Standar Target</th>
                  <th className="p-2.5 border border-slate-200">Analisis &amp; Rencana Tindak Lanjut</th>
                  <th className="p-2.5 border border-slate-200 w-12 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {manualClinical.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                    <td className="p-2 border border-slate-200">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => handleClinicalChange(item.id, 'label', e.target.value)}
                        className="w-full p-1.5 text-xs font-semibold text-slate-900 border border-slate-300 rounded bg-white"
                        placeholder="Nama indikator klinis"
                      />
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      <input
                        type="text"
                        value={item.capaian}
                        onChange={(e) => handleClinicalChange(item.id, 'capaian', e.target.value)}
                        className="w-full p-1.5 text-xs font-bold text-center text-blue-900 border border-slate-300 rounded bg-white"
                        placeholder="e.g. 100%, 0 Kasus"
                      />
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      <input
                        type="text"
                        value={item.standar}
                        onChange={(e) => handleClinicalChange(item.id, 'standar', e.target.value)}
                        className="w-full p-1.5 text-xs text-center text-slate-700 border border-slate-300 rounded bg-white"
                        placeholder="e.g. >= 85%, 0 Kasus"
                      />
                    </td>
                    <td className="p-2 border border-slate-200">
                      <textarea
                        rows={2}
                        value={item.analisis}
                        onChange={(e) => handleClinicalChange(item.id, 'analisis', e.target.value)}
                        className="w-full p-1.5 text-xs text-slate-800 border border-slate-300 rounded bg-white resize-y"
                        placeholder="Catatan analisis klinis dan rekomendasi"
                      />
                    </td>
                    <td className="p-2 border border-slate-200 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => handleDeleteClinicalIndicator(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer rounded"
                        title="Hapus baris indikator"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. SEKSI D: AKUNTABILITAS NON-MEDIS, OPERASIONAL, WATER TREATMENT & K3 */}
      {/* ===================================================================== */}
      {activeSubTab === 'section_d' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="text-[11px] font-bold text-[#1e4b85] uppercase tracking-wider">
                SEKSI D (PENGISIAN MANUAL)
              </div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                <CheckSquare className="w-5 h-5 text-[#1e4b85]" />
                Akuntabilitas Non-Medis, Operasional, Water Treatment &amp; K3
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pengawasan mutu air Reverse Osmosis (TDS, kesadahan, klorin), kesiapan logistik BMHP, suhu ruangan, dan kepatuhan K3. Seluruh baris dan parameter dapat disunting bebas.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <button
                type="button"
                onClick={handleResetOperationalToStandard}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 flex items-center gap-1.5 cursor-pointer"
                title="Kembalikan ke standar mutu KARS"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                Reset Standar
              </button>
              <button
                type="button"
                onClick={handleAddOperationalItem}
                className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold rounded-xl border border-blue-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-700" />
                Tambah Item
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSaveAllReport();
                  setActiveSubTab('section_e');
                }}
                className="px-4 py-2 bg-[#1e4b85] hover:bg-[#163865] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Simpan &amp; Lanjut ke Seksi E
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {operationalItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2 flex-1">
                    <Droplets className="w-4 h-4 text-blue-600 shrink-0" />
                    <input
                      type="text"
                      value={item.item}
                      onChange={(e) => handleOperationalChange(item.id, 'item', e.target.value)}
                      className="font-bold text-xs text-slate-900 p-1 border border-slate-300 rounded bg-white w-full max-w-sm"
                      placeholder="Nama fasilitas / sistem"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-medium">Status Kepatuhan:</span>
                    <input
                      type="text"
                      value={item.statusKepatuhan}
                      onChange={(e) => handleOperationalChange(item.id, 'statusKepatuhan', e.target.value)}
                      className="text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-emerald-800"
                      placeholder="MEMENUHI SYARAT"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteOperationalItem(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer rounded ml-1"
                      title="Hapus baris item operasional"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Parameter Uji / Standar Pengawasan
                    </label>
                    <input
                      type="text"
                      value={item.parameterUji}
                      onChange={(e) => handleOperationalChange(item.id, 'parameterUji', e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                      placeholder="e.g. TDS < 10 ppm, Hardness 0, Klorin Bebas < 0.1 mg/L"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Hasil Observasi Fisik &amp; Uji Shift
                    </label>
                    <input
                      type="text"
                      value={item.hasilObservasi}
                      onChange={(e) => handleOperationalChange(item.id, 'hasilObservasi', e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
                      placeholder="e.g. Air RO Tersedia, TDS 3.2 ppm, Klorin 0.01 mg/L (Normal)"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 6. SEKSI E: ASISTEN SERAH TERIMA SHIFT MODEL SBAR                      */}
      {/* ===================================================================== */}
      {activeSubTab === 'section_e' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="text-[11px] font-bold text-[#1e4b85] uppercase tracking-wider">
                SEKSI E (PENGISIAN MANUAL)
              </div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                Serah Terima Shift Model SBAR (Situation, Background, Assessment, Recommendation)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Standar handover klinis KARS untuk kontinuitas asuhan antar-shift dinas. Seluruh teks narasi dapat diketik manual secara bebas.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start">
              <button
                type="button"
                onClick={handleRegenerateSbar}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer"
                title="Perbarui draf teks otomatis dari sensus manual"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Draf dari Sensus
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSaveAllReport();
                  setActiveSubTab('section_f');
                }}
                className="px-4 py-2 bg-[#1e4b85] hover:bg-[#163865] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Simpan &amp; Lanjut ke Seksi F
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Situation */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1e4b85] uppercase tracking-wide">
                  1. SITUATION (S) - Situasi Shift
                </label>
                <span className="text-[11px] text-slate-400">Jumlah pasien selesai, mesin aktif, highlight komplikasi</span>
              </div>
              <textarea
                rows={3}
                value={sbar.situation}
                onChange={(e) => setSbar({ ...sbar, situation: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 bg-white leading-relaxed"
                placeholder="Tuliskan gambaran situasi umum shift, jumlah pasien selesai, dan kesiapan mesin..."
              />
            </div>

            {/* Background */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1e4b85] uppercase tracking-wide">
                  2. BACKGROUND (B) - Riwayat Kasus Pasien Berisiko
                </label>
                <span className="text-[11px] text-slate-400">Data klinis pasien hipotensi, kram, under-UF, atau akses sulit</span>
              </div>
              <textarea
                rows={3}
                value={sbar.background}
                onChange={(e) => setSbar({ ...sbar, background: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 bg-white leading-relaxed"
                placeholder="Tuliskan latar belakang pasien yang mengalami penyulit atau pemantauan khusus..."
              />
            </div>

            {/* Assessment */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1e4b85] uppercase tracking-wide">
                  3. ASSESSMENT (A) - Penilaian &amp; Evaluasi Capaian
                </label>
                <span className="text-[11px] text-slate-400">Capaian UF aktual, respon hemodialisis, stabilitas hemodinamik</span>
              </div>
              <textarea
                rows={3}
                value={sbar.assessment}
                onChange={(e) => setSbar({ ...sbar, assessment: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 bg-white leading-relaxed"
                placeholder="Tuliskan evaluasi capaian asuhan medis dan keperawatan pada shift ini..."
              />
            </div>

            {/* Recommendation */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1e4b85] uppercase tracking-wide">
                  4. RECOMMENDATION (R) - Rekomendasi Shift Berikutnya
                </label>
                <span className="text-[11px] text-slate-400">Poin penting persiapan priming mesin, stok dialiser, uji RO</span>
              </div>
              <textarea
                rows={4}
                value={sbar.recommendation}
                onChange={(e) => setSbar({ ...sbar, recommendation: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 bg-white leading-relaxed"
                placeholder="1. Pastikan persiapan mesin dan priming dialiser sesuai SOP.&#10;2. Pantau pasien dengan riwayat under-UF atau hipotensi pada shift sebelumnya.&#10;3. Lakukan regenerasi softener RO jika kesadahan meningkat."
              />
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 7. SEKSI F: PENGESAHAN & PERTANGGUNGJAWABAN SHIFT                      */}
      {/* ===================================================================== */}
      {activeSubTab === 'section_f' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="text-[11px] font-bold text-[#1e4b85] uppercase tracking-wider">
                SEKSI F (PENGISIAN MANUAL &amp; TANDA TANGAN DIGITAL)
              </div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                <ClipboardCheck className="w-5 h-5 text-[#1e4b85]" />
                Pengesahan &amp; Pertanggungjawaban Shift (3 Pihak)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Nama-nama penanggung jawab shift dapat diubah secara manual, disertai pembubuhan tanda tangan digital resmi yang tercantum pada lembar cetak PDF.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                handleSaveAllReport();
                setActiveSubTab('preview_full');
              }}
              className="px-4 py-2 bg-[#1e4b85] hover:bg-[#163865] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 self-start cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Simpan &amp; Lihat Lembar Cetak
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* 1. Yang Menyerahkan: Perawat PJ Shift */}
            <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs space-y-4">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">1. Yang Menyerahkan</div>
                <div className="font-bold text-slate-900 mt-1 text-sm">Perawat Penanggung Jawab (PJ) Shift</div>
                <label className="block text-[11px] font-semibold text-slate-600 mt-2 mb-1">
                  Nama Lengkap &amp; Gelar PJ Shift:
                </label>
                <input
                  type="text"
                  value={shiftInfo.pjShift}
                  onChange={(e) => setShiftInfo({ ...shiftInfo, pjShift: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                  placeholder="Nama PJ Shift"
                />
              </div>

              <div className="pt-3 border-t border-slate-200">
                <div className="text-[11px] text-slate-500 mb-2 font-medium">Status Pengesahan Digital:</div>
                {signatures.pjShift.signed ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1">
                    <span className="text-emerald-800 font-bold flex items-center gap-1.5 text-xs">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      TERVERIFIKASI DIGITAL
                    </span>
                    <div className="text-[10px] text-slate-600 font-medium">
                      Otentikasi: {signatures.pjShift.signedAt}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResetSignature('pjShift')}
                      className="text-[10px] text-rose-600 hover:underline block pt-1 cursor-pointer font-semibold"
                    >
                      Reset Tanda Tangan
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSign('pjShift')}
                    className="w-full px-3 py-2 bg-[#1e4b85] hover:bg-[#163865] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    Tanda Tangani Sebagai PJ Shift
                  </button>
                )}
              </div>
            </div>

            {/* 2. Yang Menerima: PJ Shift Berikutnya */}
            <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs space-y-4">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">2. Yang Menerima</div>
                <div className="font-bold text-slate-900 mt-1 text-sm">PJ Shift Pengganti / Berikutnya</div>
                <label className="block text-[11px] font-semibold text-slate-600 mt-2 mb-1">
                  Nama Lengkap &amp; Gelar PJ Berikutnya:
                </label>
                <input
                  type="text"
                  value={shiftInfo.pjShiftBerikutnya}
                  onChange={(e) => setShiftInfo({ ...shiftInfo, pjShiftBerikutnya: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                  placeholder="Nama PJ Shift Berikutnya"
                />
              </div>

              <div className="pt-3 border-t border-slate-200">
                <div className="text-[11px] text-slate-500 mb-2 font-medium">Status Pengesahan Digital:</div>
                {signatures.pjBerikutnya.signed ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1">
                    <span className="text-emerald-800 font-bold flex items-center gap-1.5 text-xs">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      TERVERIFIKASI DIGITAL
                    </span>
                    <div className="text-[10px] text-slate-600 font-medium">
                      Otentikasi: {signatures.pjBerikutnya.signedAt}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResetSignature('pjBerikutnya')}
                      className="text-[10px] text-rose-600 hover:underline block pt-1 cursor-pointer font-semibold"
                    >
                      Reset Tanda Tangan
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSign('pjBerikutnya')}
                    className="w-full px-3 py-2 bg-[#1e4b85] hover:bg-[#163865] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    Tanda Tangani Sebagai Penerima
                  </button>
                )}
              </div>
            </div>

            {/* 3. Mengetahui / Menyetujui: Kepala Ruangan HD */}
            <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs space-y-4">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">3. Mengetahui / Menyetujui</div>
                <div className="font-bold text-slate-900 mt-1 text-sm">Kepala Ruangan Hemodialisis</div>
                <label className="block text-[11px] font-semibold text-slate-600 mt-2 mb-1">
                  Nama Lengkap &amp; Gelar Kepala Ruang:
                </label>
                <input
                  type="text"
                  value={shiftInfo.kepalaRuangan}
                  onChange={(e) => setShiftInfo({ ...shiftInfo, kepalaRuangan: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                  placeholder="Nama Kepala Ruangan"
                />
              </div>

              <div className="pt-3 border-t border-slate-200">
                <div className="text-[11px] text-slate-500 mb-2 font-medium">Status Pengesahan Digital:</div>
                {signatures.kepalaRuangan.signed ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1">
                    <span className="text-emerald-800 font-bold flex items-center gap-1.5 text-xs">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      TERVERIFIKASI DIGITAL
                    </span>
                    <div className="text-[10px] text-slate-600 font-medium">
                      Otentikasi: {signatures.kepalaRuangan.signedAt}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResetSignature('kepalaRuangan')}
                      className="text-[10px] text-rose-600 hover:underline block pt-1 cursor-pointer font-semibold"
                    >
                      Reset Tanda Tangan
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSign('kepalaRuangan')}
                    className="w-full px-3 py-2 bg-[#1e4b85] hover:bg-[#163865] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    Tanda Tangani Sebagai Kepala Ruang
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
