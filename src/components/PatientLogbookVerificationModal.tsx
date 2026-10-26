import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  Clock,
  RotateCcw,
  Printer,
  Check,
  AlertTriangle,
  Edit3,
  Save,
  Square,
  MessageSquare,
  Info,
  CheckSquare
} from 'lucide-react';
import { PatientHDSession, ShiftInfo, SystemAccessRole } from '../types/dialysis.ts';
import { OFFICIAL_LOGBOOK_ITEMS } from '../data/officialPelaksanaLogbookData.ts';
import { PjVerificationStatus } from './Logbook5ButtonsView.tsx';
import { PelaksanaLogbookPrintableModal } from './PelaksanaLogbookPrintableModal.tsx';
import { ensureFullBagianData } from '../utils/logbookStandards.ts';
import {
  getNursePatientStatusesKey,
  getNursePatientNotesKey,
  readNurseFacilityStatuses
} from '../utils/nurseVerificationHelpers.ts';
import { getCurrentIndonesianFullDate } from '../utils/dateHelpers.ts';

export interface PatientLogbookEditPayload {
  patientId: string;
  patientStatuses: Record<string, boolean>;
  patientNotes: Record<string, string>;
  facilityStatuses: Record<string, boolean>;
  updatedSession: PatientHDSession;
  score: number;
  grade: string;
  verifierNotes: string;
  status?: PjVerificationStatus;
  isCorrected?: boolean;
}

interface PatientLogbookVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: {
    id?: string;
    bedNumber: string;
    patientName: string;
    medicalRecord?: string;
    completed?: number;
    total?: number;
    score?: number;
    grade?: string;
    isCorrected?: boolean;
  };
  nurseName: string;
  nurseNip?: string;
  shiftInfo?: ShiftInfo;
  userRole: SystemAccessRole;
  verifierName: string;
  session?: PatientHDSession;
  verificationStatus: PjVerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  verifiedByRole?: string;
  verifierNotes?: string;
  initialScore?: number;
  initialGrade?: string;
  isInitiallyCorrected?: boolean;
  onSaveSession?: (session: PatientHDSession) => void;
  onSaveLogbookEdits?: (payload: PatientLogbookEditPayload) => void;
  onVerifyApprove: (
    patientIdentifier: string,
    notes: string,
    evaluation?: { score?: number; grade?: string; isCorrected?: boolean }
  ) => void;
  onVerifyRevise: (
    patientIdentifier: string,
    notes: string,
    evaluation?: { score?: number; grade?: string; isCorrected?: boolean }
  ) => void;
}

export function computeGradeFromScore(score: number): {
  grade: string;
  label: string;
  colorClass: string;
  badgeBg: string;
} {
  if (score >= 90) {
    return {
      grade: 'A',
      label: 'Sangat Baik & Mandiri',
      colorClass: 'text-emerald-700 border-emerald-300 bg-emerald-50',
      badgeBg: 'bg-emerald-600 text-white'
    };
  }
  if (score >= 80) {
    return {
      grade: 'B',
      label: 'Baik & Kompeten',
      colorClass: 'text-blue-700 border-blue-300 bg-blue-50',
      badgeBg: 'bg-blue-600 text-white'
    };
  }
  if (score >= 70) {
    return {
      grade: 'C',
      label: 'Cukup (Perlu Bimbingan Supervisi)',
      colorClass: 'text-amber-800 border-amber-300 bg-amber-50',
      badgeBg: 'bg-amber-600 text-white'
    };
  }
  return {
    grade: 'D',
    label: 'Kurang (Perlu Re-Edukasi SPO)',
    colorClass: 'text-rose-800 border-rose-300 bg-rose-50',
    badgeBg: 'bg-rose-600 text-white'
  };
}

export const PatientLogbookVerificationModal: React.FC<PatientLogbookVerificationModalProps> = ({
  isOpen,
  onClose,
  patient,
  nurseName,
  nurseNip,
  shiftInfo,
  userRole,
  verifierName,
  session,
  verificationStatus,
  verifiedAt,
  verifiedBy,
  verifiedByRole,
  verifierNotes = '',
  initialScore,
  isInitiallyCorrected = false,
  onSaveSession,
  onSaveLogbookEdits,
  onVerifyApprove,
  onVerifyRevise
}) => {
  const [activeTab, setActiveTab] = useState<'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6'>('b1');
  const [noteInput, setNoteInput] = useState(verifierNotes);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [innerToast, setInnerToast] = useState<string | null>(null);

  // Evaluation & Scoring state preserved for data schema compatibility
  const [score] = useState<number>(() => {
    if (typeof initialScore === 'number') return initialScore;
    if (typeof patient.score === 'number') return patient.score;
    return 95;
  });
  const [hasModifiedAnything, setHasModifiedAnything] = useState(isInitiallyCorrected);

  // Item specific correction notes toggle
  const [activeNoteEditItem, setActiveNoteEditItem] = useState<string | null>(null);

  const showInnerToast = (msg: string) => {
    setInnerToast(msg);
    setTimeout(() => {
      setInnerToast((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const patientKey = patient.id || patient.bedNumber;

  // Retrieve initial per-nurse patient SPO statuses
  const [patientStatuses, setPatientStatuses] = useState<Record<string, boolean>>(() => {
    try {
      const rawStat = localStorage.getItem(getNursePatientStatusesKey(nurseName));
      if (rawStat) {
        const parsed = JSON.parse(rawStat);
        if (patient.id && parsed[patient.id]) return parsed[patient.id];
        if (parsed[patient.bedNumber]) return parsed[patient.bedNumber];
      }
    } catch {
      // fallback
    }
    const defaults: Record<string, boolean> = {};
    OFFICIAL_LOGBOOK_ITEMS.forEach((it) => {
      defaults[it.code] = false;
    });
    return defaults;
  });

  // Track modified items to show "(Dikoreksi Verifikator)" badge
  const [modifiedItems, setModifiedItems] = useState<Record<string, boolean>>({});

  // Patient notes per item scoped to managing nurse
  const [patientNotes, setPatientNotes] = useState<Record<string, string>>(() => {
    try {
      const rawNotes = localStorage.getItem(getNursePatientNotesKey(nurseName));
      if (rawNotes) {
        const parsed = JSON.parse(rawNotes);
        if (patient.id && parsed[patient.id]) return parsed[patient.id];
        if (parsed[patient.bedNumber]) return parsed[patient.bedNumber];
      }
    } catch {
      // fallback
    }
    return {};
  });

  // Facility (Bagian I) Statuses scoped to the submitting nurse
  const [facilityStatuses, setFacilityStatuses] = useState<Record<string, boolean>>(() =>
    readNurseFacilityStatuses(nurseName)
  );

  // Ensure full 5-bagian session data for clinical parameters (stateful for live supervisor editing)
  const [editableSession, setEditableSession] = useState<PatientHDSession>(() => {
    if (session) {
      return ensureFullBagianData(session);
    }
    return ensureFullBagianData({
      id: patient.id || 'p-temp',
      bedNumber: patient.bedNumber,
      patientName: patient.patientName,
      medicalRecordNumber: patient.medicalRecord || '452101',
      age: 56,
      gender: 'L',
      status: 'rajal',
      category: 'reguler',
      sessionStatus: 'selesai',
      isCito: false,
      vascularAccess: 'av_fistula',
      accessSite: 'AVF Radiocephalica Dextra',
      dialyzerModel: 'SAS HF 18',
      isReuse: false,
      dryWeight: 60.0,
      preWeight: 62.5,
      postWeight: 60.0,
      targetUf: 2500,
      achievedUf: 2500,
      durationPrescribed: 4.5,
      durationActual: 4.5,
      bloodFlowQb: 220,
      dialysateFlowQd: 500,
      preBp: '140/90',
      postBp: '120/80',
      hasHypotension: false,
      hasMuscleCramps: false,
      hasClotting: false,
      hasFirstUseSyndrome: false,
      hasAccessBleeding: false,
      hasConsultDpjp: false,
      underUfTolerated: false,
      nurseInCharge: nurseName,
      nurseNotes: 'HD lancar, target UF tercapai, edukasi dipahami',
      updatedAt: new Date().toISOString()
    });
  });

  if (!isOpen) return null;

  const b1Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 1);
  const b2Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 2);
  const b3Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 3);
  const b4Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 4);
  const b5Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 5);
  const b6Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 6);

  const b1Completed = b1Items.filter((it) => Boolean(facilityStatuses[it.code])).length;
  const getCompletedCount = (items: typeof b2Items) => {
    return items.filter((it) => Boolean(patientStatuses[it.code])).length;
  };

  const b2Completed = getCompletedCount(b2Items);
  const b3Completed = getCompletedCount(b3Items);
  const b4Completed = getCompletedCount(b4Items);
  const b5Completed = getCompletedCount(b5Items);
  const b6Completed = getCompletedCount(b6Items);
  const grandTotalSpo =
    b1Items.length +
    b2Items.length +
    b3Items.length +
    b4Items.length +
    b5Items.length +
    b6Items.length;
  const grandCompletedSpo =
    b1Completed + b2Completed + b3Completed + b4Completed + b5Completed + b6Completed;
  const grandPct = Math.round((grandCompletedSpo / grandTotalSpo) * 100);

  const gradeInfo = computeGradeFromScore(score);

  // Toggle single SPO item status
  const handleToggleItemStatus = (code: string, isBagian1: boolean) => {
    setHasModifiedAnything(true);
    setModifiedItems((prev) => ({ ...prev, [code]: true }));

    if (isBagian1) {
      setFacilityStatuses((prev) => {
        const next = { ...prev, [code]: !Boolean(prev[code]) };
        return next;
      });
      showInnerToast(`Koreksi butir SPO ${code} diperbarui.`);
    } else {
      setPatientStatuses((prev) => {
        const next = { ...prev, [code]: !Boolean(prev[code]) };
        return next;
      });
      showInnerToast(`Koreksi butir SPO ${code} diperbarui.`);
    }
  };

  // Bulk check all items in current tab
  const handleBulkCheckBagian = (targetBagian: number, markAs: boolean) => {
    setHasModifiedAnything(true);
    const targetItems = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === targetBagian);
    const newModified = { ...modifiedItems };

    if (targetBagian === 1) {
      setFacilityStatuses((prev) => {
        const next = { ...prev };
        targetItems.forEach((it) => {
          next[it.code] = markAs;
          newModified[it.code] = true;
        });
        return next;
      });
    } else {
      setPatientStatuses((prev) => {
        const next = { ...prev };
        targetItems.forEach((it) => {
          next[it.code] = markAs;
          newModified[it.code] = true;
        });
        return next;
      });
    }

    setModifiedItems(newModified);
    showInnerToast(
      `Semua butir Bagian ${targetBagian} ditandai ${markAs ? 'DILAKSANAKAN' : 'Belum Lengkap'}.`
    );
  };

  // Helper to package current edits
  const buildCurrentPayload = (status?: PjVerificationStatus): PatientLogbookEditPayload => {
    return {
      patientId: patientKey,
      patientStatuses,
      patientNotes,
      facilityStatuses,
      updatedSession: editableSession,
      score,
      grade: gradeInfo.grade,
      verifierNotes: noteInput,
      status,
      isCorrected: hasModifiedAnything
    };
  };

  // Save edits without approving
  const handleSaveOnly = () => {
    const payload = buildCurrentPayload();
    if (onSaveLogbookEdits) {
      onSaveLogbookEdits(payload);
    }
    if (onSaveSession) {
      onSaveSession(editableSession);
    }
    showInnerToast('✓ Perubahan koreksi butir SPO berhasil disimpan.');
  };

  // Approve & verify patient
  const handleApprove = () => {
    const payload = buildCurrentPayload('terverifikasi');
    if (onSaveLogbookEdits) {
      onSaveLogbookEdits(payload);
    }
    if (onSaveSession) {
      onSaveSession(editableSession);
    }
    onVerifyApprove(patientKey, noteInput, {
      score,
      grade: gradeInfo.grade,
      isCorrected: hasModifiedAnything
    });
  };

  // Revise patient
  const handleRevise = () => {
    const payload = buildCurrentPayload('belum_diajukan');
    if (onSaveLogbookEdits) {
      onSaveLogbookEdits(payload);
    }
    if (onSaveSession) {
      onSaveSession(editableSession);
    }
    onVerifyRevise(patientKey, noteInput, {
      score,
      grade: gradeInfo.grade,
      isCorrected: hasModifiedAnything
    });
  };

  const activeBagianNumber =
    activeTab === 'b1'
      ? 1
      : activeTab === 'b2'
      ? 2
      : activeTab === 'b3'
      ? 3
      : activeTab === 'b4'
      ? 4
      : activeTab === 'b5'
      ? 5
      : 6;

  const activeItems =
    activeTab === 'b1'
      ? b1Items
      : activeTab === 'b2'
      ? b2Items
      : activeTab === 'b3'
      ? b3Items
      : activeTab === 'b4'
      ? b4Items
      : activeTab === 'b5'
      ? b5Items
      : b6Items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full border border-slate-200 overflow-hidden my-3 flex flex-col max-h-[88vh]">
        {/* Compact Top Header */}
        <div className="bg-slate-900 text-white px-4 py-2.5 shrink-0 border-b border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-300 tabular-nums">
                <Edit3 className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="font-semibold text-blue-300 uppercase tracking-wide">
                  Koreksi &amp; Verifikasi Logbook Per-Pasien
                </span>
                <span className="text-slate-500" aria-hidden="true">
                  &middot;
                </span>
                <span className="font-mono font-bold text-white">{patient.bedNumber}</span>
                <span className="text-slate-500" aria-hidden="true">
                  &middot;
                </span>
                <span>No. RM: {patient.medicalRecord || editableSession.medicalRecordNumber}</span>
                <span className="text-slate-500" aria-hidden="true">
                  &middot;
                </span>
                <span>
                  Hak Akses:{' '}
                  <strong className="text-slate-100 font-semibold">
                    {userRole === 'kepala_ruangan' ? 'Kepala Ruangan' : 'PJ Shift'}
                  </strong>
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pt-0.5">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight leading-snug">
                  {patient.patientName}
                </h2>
                <span className="text-[11px] text-slate-300">
                  Perawat: <strong className="text-white font-semibold">{nurseName}</strong>
                  {nurseNip ? ` (${nurseNip})` : ''}
                </span>
                <span className="text-[11px] font-mono font-semibold text-emerald-400 tabular-nums">
                  &middot; SPO Terpenuhi: {grandCompletedSpo}/{grandTotalSpo} ({grandPct}%)
                </span>
                {hasModifiedAnything && (
                  <span className="text-[10.5px] font-semibold text-amber-300">
                    &middot; Telah Dikoreksi Verifikator
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Tutup Modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compact Verification Status & Quick Actions Bar */}
        <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-slate-500">Status Verifikasi:</span>
              {verificationStatus === 'terverifikasi' ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Terverifikasi &amp; Disahkan</span>
                </span>
              ) : verificationStatus === 'diajukan' ? (
                <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Menunggu Verifikasi Supervisi</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Belum Diajukan / Perlu Revisi</span>
                </span>
              )}

              {verifiedAt && (
                <span className="text-slate-500 tabular-nums">
                  &middot; Disahkan oleh <strong className="text-slate-700">{verifiedBy}</strong> (
                  {verifiedByRole}) pada {verifiedAt}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleSaveOnly}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="Simpan koreksi butir SPO tanpa merubah status verifikasi"
              >
                <Save className="w-3 h-3 text-blue-600 shrink-0" />
                <span>Simpan Koreksi Saja</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="Cetak Berkas Logbook Pasien A4"
              >
                <Printer className="w-3 h-3 text-slate-600 shrink-0" />
                <span>Cetak A4</span>
              </button>
            </div>
          </div>

          {innerToast && (
            <div className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] font-medium text-emerald-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{innerToast}</span>
              </span>
              <button
                type="button"
                onClick={() => setInnerToast(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold leading-none cursor-pointer px-1"
              >
                &times;
              </button>
            </div>
          )}
        </div>

        {/* Compact Tab Navigation Bar */}
        <div className="px-4 pt-1 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {[
              {
                id: 'b1',
                label: 'Bag. I: RO',
                fullTitle: 'Bagian I: Fasilitas & RO',
                badge: `${b1Completed}/${b1Items.length}`
              },
              {
                id: 'b2',
                label: 'Bag. II: Pre-HD',
                fullTitle: 'Bagian II: Pre-HD & Mesin',
                badge: `${b2Completed}/${b2Items.length}`
              },
              {
                id: 'b3',
                label: 'Bag. III: Safety',
                fullTitle: 'Bagian III: Patient Safety',
                badge: `${b3Completed}/${b3Items.length}`
              },
              {
                id: 'b4',
                label: 'Bag. IV: Intra-HD',
                fullTitle: 'Bagian IV: Intra-HD',
                badge: `${b4Completed}/${b4Items.length}`
              },
              {
                id: 'b5',
                label: 'Bag. V: Edukasi',
                fullTitle: 'Bagian V: Edukasi KIE',
                badge: `${b5Completed}/${b5Items.length}`
              },
              {
                id: 'b6',
                label: 'Bag. VI: Post-HD',
                fullTitle: 'Bagian VI: Post-HD & CPPT',
                badge: `${b6Completed}/${b6Items.length}`
              }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                title={tab.fullTitle}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-1.5 px-2 border-b-2 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 tabular-nums ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-mono text-[10px] ${
                    activeTab === tab.id ? 'text-indigo-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  ({tab.badge})
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pb-1 shrink-0">
            <button
              type="button"
              onClick={() => handleBulkCheckBagian(activeBagianNumber, true)}
              className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-[10.5px] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <CheckSquare className="w-3 h-3 text-emerald-700 shrink-0" />
              <span>Semua Dilaksanakan</span>
            </button>
            <button
              type="button"
              onClick={() => handleBulkCheckBagian(activeBagianNumber, false)}
              className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-semibold text-[10.5px] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Compact Scrollable SPO Checklist */}
        <div className="px-4 py-2.5 overflow-y-auto flex-1 bg-slate-50/40">
          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 mb-1.5 gap-2 tabular-nums">
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3 text-indigo-600 shrink-0" />
              <span>Klik tombol status pada tiap butir untuk mengoreksi kepatuhan SPO:</span>
            </span>
            <span className="font-mono text-[10.5px] text-slate-400">
              Bagian {activeBagianNumber} &middot; {activeItems.length} SPO
            </span>
          </div>

          <div className="space-y-1.5">
            {activeItems.map((item) => {
              const isBagian1 = activeTab === 'b1';
              const isChecked = isBagian1
                ? Boolean(facilityStatuses[item.code])
                : Boolean(patientStatuses[item.code]);
              const specificNote = isBagian1 ? undefined : patientNotes[item.code];
              const isItemModified = !!modifiedItems[item.code];

              return (
                <div
                  key={item.code}
                  className={`px-3 py-2 rounded-lg border transition-colors ${
                    isChecked
                      ? 'bg-white border-emerald-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <span className="font-mono text-[11px] font-bold text-indigo-700 tabular-nums shrink-0">
                          {item.code}
                        </span>
                        <h4 className="text-xs font-semibold text-slate-900 leading-snug">
                          {item.shortTitle || item.description}
                        </h4>
                        <span className="text-[10.5px] text-slate-400">
                          &middot; {item.category}
                        </span>
                        {isItemModified && (
                          <span className="text-[10px] font-semibold text-amber-700">
                            &middot; Dikoreksi Verifikator
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 leading-tight">
                        {item.simpleGuide || item.standardSpo}
                      </p>

                      {!isBagian1 && (
                        <div>
                          {activeNoteEditItem === item.code ? (
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                value={patientNotes[item.code] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPatientNotes((prev) => ({ ...prev, [item.code]: val }));
                                  setHasModifiedAnything(true);
                                }}
                                placeholder={`Koreksi catatan khusus butir ${item.code}...`}
                                className="flex-1 text-[11px] px-2 py-1 bg-white border border-indigo-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-slate-800"
                              />
                              <button
                                type="button"
                                onClick={() => setActiveNoteEditItem(null)}
                                className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                              >
                                Selesai
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              {specificNote && (
                                <span className="text-[11px] text-indigo-900 bg-indigo-50/70 border border-indigo-200/70 rounded px-1.5 py-0.5 leading-tight">
                                  <strong className="font-semibold">Observasi:</strong>{' '}
                                  {specificNote}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setActiveNoteEditItem(item.code)}
                                className="text-[10.5px] text-slate-400 hover:text-indigo-600 inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-2.5 h-2.5 shrink-0" />
                                <span>
                                  {specificNote ? 'Edit Catatan' : '+ Catatan Butir'}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleToggleItemStatus(item.code, isBagian1)}
                        className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          isChecked
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                        }`}
                        title="Klik untuk mengubah status kepatuhan butir SPO ini"
                      >
                        {isChecked ? (
                          <>
                            <Check className="w-3 h-3 stroke-[2.5] text-white shrink-0" />
                            <span>Dilaksanakan</span>
                          </>
                        ) : (
                          <>
                            <Square className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Belum Lengkap</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compact Modal Footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 space-y-2 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-600 shrink-0">
              Catatan Verifikator / Revisi:
            </label>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={
                userRole === 'kepala_ruangan'
                  ? 'Tambahkan catatan pengesahan Kepala Ruang atau instruksi revisi...'
                  : 'Tambahkan catatan pengesahan PJ Shift atau instruksi revisi...'
              }
              className="flex-1 text-[11px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-slate-800"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500 tabular-nums">
              Verifikator: <strong className="text-slate-800 font-semibold">{verifierName}</strong>{' '}
              ({userRole === 'kepala_ruangan' ? 'Kepala Ruang' : 'PJ Shift'}) &middot; SPO:{' '}
              <strong className="text-emerald-700 font-mono">
                {grandCompletedSpo}/{grandTotalSpo}
              </strong>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={handleRevise}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Kembalikan logbook ke perawat pengaju untuk diperbaiki"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span>Minta Revisi</span>
              </button>

              <button
                type="button"
                onClick={handleSaveOnly}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Save className="w-3 h-3 text-blue-600 shrink-0" />
                <span>Simpan Koreksi</span>
              </button>

              <button
                type="button"
                onClick={handleApprove}
                className={`px-3 py-1.5 rounded-lg font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  verificationStatus === 'terverifikasi'
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
                title="Sahkan dan verifikasi logbook pasien ini"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {verificationStatus === 'terverifikasi'
                    ? 'Perbarui Verifikasi'
                    : 'Sahkan Pasien Ini'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Modal Integration */}
      {isPrintModalOpen && (
        <PelaksanaLogbookPrintableModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          session={editableSession}
          shiftInfo={
            shiftInfo || {
              hospitalName: 'RS HAPPY LAND MEDICAL CENTRE',
              unitName: 'INSTALASI DIALISIS',
              date: getCurrentIndonesianFullDate(),
              shift: 'Pagi',
              shiftHours: 'Pagi, jam 07.00 - 14.00 WIB',
              pjShift: verifierName,
              kepalaRuangan: 'Twis Fertilianti PW., S.Kep., Ns.',
              dokterDpjp: 'dr. Paramitha, Sp.PD-KGH',
              dokterJaga: 'dr. Budi Setiawan',
              totalPerawatDinas: 7,
              detailPerawat: '7 Orang',
              perawatRatio: '1 : 3.4',
              tenagaPendukung: '1 Teknisi RO, 1 HK',
              pjShiftBerikutnya: 'Riska Wahyu, S.Kep., Ns.'
            }
          }
        />
      )}
    </div>
  );
};
