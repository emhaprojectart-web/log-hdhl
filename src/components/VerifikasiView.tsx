import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  RotateCcw,
  AlertTriangle,
  Edit3
} from 'lucide-react';
import { ShiftInfo, MasterNurse, SystemAccessRole, PatientHDSession } from '../types/dialysis.ts';
import { OFFICIAL_LOGBOOK_ITEMS } from '../data/officialPelaksanaLogbookData.ts';
import { LoginUserData } from './LoginPage.tsx';
import { ManagedPatient, PjVerificationSubmission, PjVerificationStatus } from './Logbook5ButtonsView.tsx';
import { formatSystemAccessLabel } from '../utils/masterDataHelpers.ts';
import {
  isMatchingNurse,
  isSameBed,
  getVerificationRegistry,
  upsertVerificationRegistryEntry,
  filterVerificationQueueForUser,
  LogbookVerificationRegistryEntry,
  PER_PATIENT_STATUS_STORAGE_KEY,
  buildPatientVerificationKey,
  getNurseManagedPatientsKey,
  getNursePatientStatusesKey,
  getNursePatientNotesKey,
  getNurseFacilityStatusesKey,
  readNurseFacilityStatuses,
  getNurseSubmissionKey
} from '../utils/nurseVerificationHelpers.ts';
import { syncNurseVerifiedDailySnapshot } from '../utils/monthlyRecapHelpers.ts';
import {
  formatCurrentWibTimestamp,
  getCurrentIndonesianFullDate,
  normalizeIndonesianDateLabel
} from '../utils/dateHelpers.ts';
import {
  PatientLogbookVerificationModal,
  PatientLogbookEditPayload
} from './PatientLogbookVerificationModal.tsx';

interface VerifikasiViewProps {
  shiftInfo?: ShiftInfo;
  masterNurses?: MasterNurse[];
  userRole: SystemAccessRole;
  loggedInUser?: LoginUserData | null;
  sessions?: PatientHDSession[];
  onVerificationUpdated?: (
    nurseName: string,
    status: PjVerificationStatus,
    details: {
      verifiedAt?: string;
      verifiedBy?: string;
      verifiedByRole?: string;
      verifierNotes?: string;
    }
  ) => void;
  onVerifyPatientSession?: (
    patientIdentifier: { bedNumber?: string; patientName?: string; medicalRecord?: string },
    verified: boolean,
    details: {
      verifiedAt?: string;
      verifiedBy?: string;
      verifiedByRole?: string;
      verifierNotes?: string;
      nurseName?: string;
    }
  ) => void;
  onSaveSession?: (session: PatientHDSession) => void;
}

export interface PatientVerificationDetail {
  id: string;
  bedNumber: string;
  patientName: string;
  medicalRecord?: string;
  completed: number;
  total: number;
  status: PjVerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  verifiedByRole?: string;
  verifierNotes?: string;
  session?: PatientHDSession;
  score?: number;
  grade?: string;
  isCorrected?: boolean;
}

interface RosterVerificationRecord {
  id: string;
  nurseName: string;
  nurseNip: string;
  nurseRole: 'perawat_pelaksana' | 'pj_shift' | 'kepala_ruangan';
  targetRole: 'pj_shift' | 'kepala_ruangan' | 'mandiri';
  targetVerifierName: string;
  shift: string;
  status: PjVerificationStatus;
  submittedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  verifiedByRole?: string;
  pelaksanaNotes: string;
  verifierNotes: string;
  facilityCompleted: number;
  facilityTotal: number;
  patientsSummary: PatientVerificationDetail[];
}

interface NurseColorPalette {
  bgHeader: string;
  avatarBg: string;
  badgeRole: string;
  nameColor: string;
  tagPill: string;
}

const NURSE_COLOR_PALETTES: NurseColorPalette[] = [
  {
    bgHeader: 'bg-slate-50/90',
    avatarBg: 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-100',
    badgeRole: 'bg-blue-50 text-blue-900 border-blue-200 font-bold',
    nameColor: 'text-slate-900',
    tagPill: 'bg-blue-50 text-blue-800 border-blue-200'
  },
  {
    bgHeader: 'bg-slate-50/90',
    avatarBg: 'bg-teal-600 text-white shadow-xs ring-2 ring-teal-100',
    badgeRole: 'bg-teal-50 text-teal-900 border-teal-200 font-bold',
    nameColor: 'text-slate-900',
    tagPill: 'bg-teal-50 text-teal-800 border-teal-200'
  },
  {
    bgHeader: 'bg-slate-50/90',
    avatarBg: 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-100',
    badgeRole: 'bg-indigo-50 text-indigo-900 border-indigo-200 font-bold',
    nameColor: 'text-slate-900',
    tagPill: 'bg-indigo-50 text-indigo-800 border-indigo-200'
  },
  {
    bgHeader: 'bg-slate-50/90',
    avatarBg: 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-100',
    badgeRole: 'bg-amber-50 text-amber-900 border-amber-200 font-bold',
    nameColor: 'text-slate-900',
    tagPill: 'bg-amber-50 text-amber-800 border-amber-200'
  }
];

function getNurseInitials(name: string): string {
  if (!name) return 'PR';
  const clean = name
    .replace(/(S\.Kep|Ners|A\.Md\.?\s?Kep|S\.Tr\.?\s?Kep|M\.Kep|dr\.|Ns\.|PW\.)/gi, '')
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatSubmitterRoleLabel(role: 'perawat_pelaksana' | 'pj_shift' | 'kepala_ruangan'): string {
  if (role === 'kepala_ruangan') return 'Kepala Ruang (Pengaju)';
  if (role === 'pj_shift') return 'PJ Shift (Pengaju)';
  return 'Perawat Pelaksana';
}

export const VerifikasiView: React.FC<VerifikasiViewProps> = ({
  shiftInfo,
  masterNurses = [],
  userRole,
  loggedInUser,
  sessions = [],
  onVerificationUpdated,
  onVerifyPatientSession,
  onSaveSession
}) => {
  const activeDate = shiftInfo?.date
    ? normalizeIndonesianDateLabel(shiftInfo.date)
    : getCurrentIndonesianFullDate();
  const activeShift = shiftInfo?.shift || 'Pagi';
  const validKaruShift =
    shiftInfo?.kepalaRuangan && shiftInfo.kepalaRuangan !== '-' ? shiftInfo.kepalaRuangan : '';
  const validPjShift =
    shiftInfo?.pjShift && shiftInfo.pjShift !== '-' ? shiftInfo.pjShift : '';
  const verifierName =
    loggedInUser?.name ||
    (userRole === 'kepala_ruangan' ? validKaruShift || '-' : validPjShift || '-');
  const verifierRoleLabel =
    userRole === 'kepala_ruangan'
      ? 'Kepala Ruangan'
      : userRole === 'pj_shift'
      ? 'PJ Shift'
      : formatSystemAccessLabel(userRole);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PjVerificationStatus>('all');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Verification registry entries synced with localStorage
  const [registryEntries, setRegistryEntries] = useState<LogbookVerificationRegistryEntry[]>(() =>
    getVerificationRegistry(masterNurses, validPjShift, validKaruShift)
  );

  // Refresh registry when tab mounts, sessions change, or cloud updates
  useEffect(() => {
    setRegistryEntries(getVerificationRegistry(masterNurses, validPjShift, validKaruShift));

    const handleCloudUpdate = () => {
      setRegistryEntries(getVerificationRegistry(masterNurses, validPjShift, validKaruShift));
    };
    window.addEventListener('verification_registry_updated', handleCloudUpdate);
    return () => window.removeEventListener('verification_registry_updated', handleCloudUpdate);
  }, [masterNurses, validPjShift, validKaruShift, sessions]);

  // Per-patient verification records state (v4 deterministic nurse+bed+rm keys)
  const [perPatientRecords, setPerPatientRecords] = useState<
    Record<
      string,
      {
        status: PjVerificationStatus;
        verifiedAt?: string;
        verifiedBy?: string;
        verifiedByRole?: string;
        verifierNotes?: string;
        score?: number;
        grade?: string;
        isCorrected?: boolean;
      }
    >
  >(() => {
    try {
      const saved = localStorage.getItem(PER_PATIENT_STATUS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem(PER_PATIENT_STATUS_STORAGE_KEY, JSON.stringify(perPatientRecords));
    } catch {
      // ignore
    }
    registryEntries.forEach((reg) => {
      syncNurseVerifiedDailySnapshot({
        nurseName: reg.submittedNurseName,
        userRole: reg.submittedNurseRole || 'perawat_pelaksana',
        shiftInfo,
        sessions,
        masterNurses
      });
    });
  }, [perPatientRecords, registryEntries, shiftInfo, sessions, masterNurses]);

  // Modal State for inspecting individual patient logbook
  const [selectedPatientModal, setSelectedPatientModal] = useState<{
    patient: PatientVerificationDetail;
    nurseName: string;
    nurseNip?: string;
    session?: PatientHDSession;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const formatNowWib = () => {
    return formatCurrentWibTimestamp(activeDate);
  };

  // Resolve matching session for a specific nurse's patient without substring bed collisions
  const findMatchingSession = (
    nurseName: string,
    bedNumber: string,
    patientName: string,
    rm?: string
  ): PatientHDSession | undefined => {
    const cleanName = patientName.toLowerCase().trim();
    const cleanRm = rm?.trim();

    // Prefer session explicitly assigned to this nurse
    const nurseMatch = sessions.find((s) => {
      if (s.nurseInCharge && !isMatchingNurse(s.nurseInCharge, nurseName)) return false;
      if (cleanRm && s.medicalRecordNumber?.trim() === cleanRm) return true;
      if (isSameBed(s.bedNumber, bedNumber)) return true;
      if (cleanName && s.patientName.toLowerCase().trim() === cleanName) return true;
      return false;
    });
    if (nurseMatch) return nurseMatch;

    // Fallback by exact RM or exact bed only if nurse matches or is unassigned
    return sessions.find((s) => {
      if (cleanRm && s.medicalRecordNumber?.trim() === cleanRm) return true;
      return false;
    });
  };

  // Helper to sync nurse's individual submission storage key alongside the registry
  const syncNurseSubmissionStorage = (
    nurseName: string,
    patch: Partial<PjVerificationSubmission>
  ) => {
    try {
      const subKey = getNurseSubmissionKey(nurseName);
      const raw = localStorage.getItem(subKey);
      const existing = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        subKey,
        JSON.stringify({
          ...existing,
          ...patch
        })
      );
    } catch {
      // ignore
    }
  };

  // STRICT ALUR VERIFIKASI QUEUE ISOLATION:
  // 1. PJ Shift: hanya menampilkan pengajuan verifikasi logbook yang ditujukan khusus untuk PJ Shift tersebut
  //    (memverifikasi pasien kelolaan Perawat Pelaksana / Kepala Ruang yang memilih PJ Shift tersebut).
  // 2. Kepala Ruang: hanya menampilkan pengajuan verifikasi logbook yang diajukan untuk Kepala Ruang
  //    (memverifikasi pasien kelolaan PJ Shift serta pengajuan mandiri Kepala Ruang ke Kepala Ruang).
  const queueRecords = useMemo<RosterVerificationRecord[]>(() => {
    const filteredRegistry = filterVerificationQueueForUser(
      registryEntries,
      userRole,
      verifierName
    );

    const facItems = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 1);
    const patSpoItems = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian >= 2 && it.bagian <= 6);

    return filteredRegistry.map((reg) => {
      const nurseFacStatuses = readNurseFacilityStatuses(reg.submittedNurseName);
      const nurseFacCompleted = facItems.filter((it) => Boolean(nurseFacStatuses[it.code])).length;
      // Read per-nurse live managed patients if saved in localStorage
      let nursePatients: ManagedPatient[] = (reg.patients || []).map((p, idx) => ({
        id: p.id || `pat-${reg.id}-${idx}`,
        bedNumber: p.bedNumber,
        patientName: p.patientName,
        medicalRecord: p.medicalRecord
      }));

      try {
        const rawManaged = localStorage.getItem(getNurseManagedPatientsKey(reg.submittedNurseName));
        if (rawManaged) {
          const parsed = JSON.parse(rawManaged);
          if (Array.isArray(parsed) && parsed.length > 0) {
            nursePatients = parsed;
          }
        }
      } catch {
        // fallback to reg.patients
      }

      // If still empty, derive from sessions belonging to this nurse
      if (nursePatients.length === 0) {
        const fromSessions = sessions.filter((s) =>
          isMatchingNurse(s.nurseInCharge, reg.submittedNurseName)
        );
        nursePatients = fromSessions.map((s, idx) => ({
          id: s.id || `pat-${reg.id}-${idx}`,
          bedNumber: s.bedNumber,
          patientName: s.patientName,
          medicalRecord: s.medicalRecordNumber
        }));
      }

      // Read per-nurse SPO statuses if saved
      let nursePatStatuses: Record<string, Record<string, boolean>> = {};
      try {
        const rawPatStat = localStorage.getItem(getNursePatientStatusesKey(reg.submittedNurseName));
        if (rawPatStat) {
          const parsed = JSON.parse(rawPatStat);
          if (parsed && typeof parsed === 'object') {
            nursePatStatuses = parsed;
          }
        }
      } catch {
        // fallback
      }

      const patientsToMap: PatientVerificationDetail[] = nursePatients.map((p, pIdx) => {
        const matchingSession = findMatchingSession(
          reg.submittedNurseName,
          p.bedNumber,
          p.patientName,
          p.medicalRecord
        );
        const patKey = buildPatientVerificationKey(
          reg.submittedNurseName,
          p.bedNumber,
          p.medicalRecord
        );
        const savedPerPat = perPatientRecords[patKey];

        const checks = nursePatStatuses[p.id] || nursePatStatuses[p.bedNumber];
        const completed = checks
          ? patSpoItems.filter((it) => Boolean(checks[it.code])).length
          : 0;

        const patStatus: PjVerificationStatus =
          savedPerPat?.status ||
          (reg.status === 'terverifikasi' ? 'terverifikasi' : reg.status);

        return {
          id: p.id || `pat-${reg.id}-${pIdx}`,
          bedNumber: p.bedNumber,
          patientName: p.patientName,
          medicalRecord: p.medicalRecord || matchingSession?.medicalRecordNumber,
          completed,
          total: patSpoItems.length,
          status: patStatus,
          verifiedAt:
            savedPerPat?.verifiedAt ||
            (patStatus === 'terverifikasi'
              ? reg.verifiedAt || matchingSession?.verifiedAt
              : undefined),
          verifiedBy:
            savedPerPat?.verifiedBy ||
            (patStatus === 'terverifikasi'
              ? reg.verifiedBy || matchingSession?.verifiedBy
              : undefined),
          verifiedByRole:
            savedPerPat?.verifiedByRole ||
            (patStatus === 'terverifikasi'
              ? reg.verifiedByRole || matchingSession?.verifiedByRole
              : undefined),
          verifierNotes: savedPerPat?.verifierNotes || reg.verifierNotes || '',
          session: matchingSession,
          score: savedPerPat?.score,
          grade: savedPerPat?.grade,
          isCorrected: savedPerPat?.isCorrected
        };
      });

      // Compute effective submission status from individual patient verification states
      const verifiedPats = patientsToMap.filter((p) => p.status === 'terverifikasi').length;
      const unsubmittedPats = patientsToMap.filter((p) => p.status === 'belum_diajukan').length;
      let effectiveStatus: PjVerificationStatus = reg.status;

      if (patientsToMap.length > 0) {
        if (verifiedPats === patientsToMap.length) {
          effectiveStatus = 'terverifikasi';
        } else if (unsubmittedPats === patientsToMap.length && reg.status === 'belum_diajukan') {
          effectiveStatus = 'belum_diajukan';
        } else {
          effectiveStatus = 'diajukan';
        }
      }

      return {
        id: reg.id,
        nurseName: reg.submittedNurseName,
        nurseNip: reg.submittedNurseNip || '-',
        nurseRole: reg.submittedNurseRole || 'perawat_pelaksana',
        targetRole: reg.targetRole || 'pj_shift',
        targetVerifierName: reg.targetVerifierName || verifierName,
        shift: reg.shift || activeShift,
        status: effectiveStatus,
        submittedAt: reg.submittedAt,
        verifiedAt: effectiveStatus === 'terverifikasi' ? reg.verifiedAt : undefined,
        verifiedBy: effectiveStatus === 'terverifikasi' ? reg.verifiedBy : undefined,
        verifiedByRole: effectiveStatus === 'terverifikasi' ? reg.verifiedByRole : undefined,
        pelaksanaNotes: reg.pelaksanaNotes || '',
        verifierNotes: reg.verifierNotes || '',
        facilityCompleted: nurseFacCompleted,
        facilityTotal: facItems.length,
        patientsSummary: patientsToMap
      };
    });
  }, [registryEntries, userRole, verifierName, activeShift, sessions, perPatientRecords]);

  // 1. VERIFY / APPROVE AN INDIVIDUAL PATIENT
  const handleVerifyPatientApprove = (
    rec: RosterVerificationRecord,
    patient: PatientVerificationDetail,
    notes: string = '',
    evaluation?: { score?: number; grade?: string; isCorrected?: boolean }
  ) => {
    const timestamp = formatNowWib();
    const patKey = buildPatientVerificationKey(
      rec.nurseName,
      patient.bedNumber,
      patient.medicalRecord
    );

    const updateDetails = {
      status: 'terverifikasi' as PjVerificationStatus,
      verifiedAt: timestamp,
      verifiedBy: verifierName,
      verifiedByRole: verifierRoleLabel,
      verifierNotes: notes || patient.verifierNotes || '',
      score: evaluation?.score ?? patient.score ?? 95,
      grade: evaluation?.grade ?? patient.grade ?? 'A',
      isCorrected: evaluation?.isCorrected ?? patient.isCorrected ?? false
    };

    setPerPatientRecords((prev) => ({
      ...prev,
      [patKey]: updateDetails
    }));

    if (onVerifyPatientSession) {
      onVerifyPatientSession(
        {
          bedNumber: patient.bedNumber,
          patientName: patient.patientName,
          medicalRecord: patient.medicalRecord
        },
        true,
        {
          ...updateDetails,
          nurseName: rec.nurseName
        }
      );
    }

    // Check if this completes all patients for the nurse
    const updatedSummary = rec.patientsSummary.map((p) =>
      p.id === patient.id || isSameBed(p.bedNumber, patient.bedNumber)
        ? { ...p, ...updateDetails }
        : p
    );
    const allPatsVerified =
      updatedSummary.length > 0 && updatedSummary.every((p) => p.status === 'terverifikasi');

    if (allPatsVerified) {
      handleVerifyApprove(rec, false, notes);
    }

    showToast(`Logbook pasien ${patient.patientName} (${patient.bedNumber}) telah disahkan.`);
  };

  // 2. REVISE AN INDIVIDUAL PATIENT
  const handleVerifyPatientRevise = (
    rec: RosterVerificationRecord,
    patient: PatientVerificationDetail,
    notes: string = '',
    evaluation?: { score?: number; grade?: string; isCorrected?: boolean }
  ) => {
    const patKey = buildPatientVerificationKey(
      rec.nurseName,
      patient.bedNumber,
      patient.medicalRecord
    );
    const effectiveNote =
      notes || patient.verifierNotes || 'Mohon periksa kembali kelengkapan SPO pasien ini.';

    const updateDetails = {
      status: 'belum_diajukan' as PjVerificationStatus,
      verifiedAt: undefined,
      verifiedBy: undefined,
      verifiedByRole: undefined,
      verifierNotes: effectiveNote,
      score: evaluation?.score ?? patient.score,
      grade: evaluation?.grade ?? patient.grade,
      isCorrected: evaluation?.isCorrected ?? patient.isCorrected ?? false
    };

    setPerPatientRecords((prev) => ({
      ...prev,
      [patKey]: updateDetails
    }));

    if (onVerifyPatientSession) {
      onVerifyPatientSession(
        {
          bedNumber: patient.bedNumber,
          patientName: patient.patientName,
          medicalRecord: patient.medicalRecord
        },
        false,
        {
          ...updateDetails,
          nurseName: rec.nurseName
        }
      );
    }

    // Check if all patients under this nurse are now unverified/revised or partially verified
    const updatedSummary = rec.patientsSummary.map((p) =>
      p.id === patient.id || isSameBed(p.bedNumber, patient.bedNumber)
        ? { ...p, ...updateDetails }
        : p
    );
    const anyStillVerified = updatedSummary.some((p) => p.status === 'terverifikasi');
    const nextOverallStatus: PjVerificationStatus = anyStillVerified ? 'diajukan' : 'belum_diajukan';

    upsertVerificationRegistryEntry({
      id: rec.id,
      submittedNurseName: rec.nurseName,
      submittedNurseNip: rec.nurseNip,
      submittedNurseRole: rec.nurseRole,
      targetRole: rec.targetRole,
      targetVerifierName: rec.targetVerifierName || verifierName,
      shift: rec.shift,
      status: nextOverallStatus,
      submittedAt: rec.submittedAt,
      verifiedAt: undefined,
      verifiedBy: undefined,
      verifiedByRole: undefined,
      verifierNotes: effectiveNote
    });

    syncNurseSubmissionStorage(rec.nurseName, {
      status: nextOverallStatus,
      verifiedAt: undefined,
      verifiedBy: undefined,
      verifiedByRole: undefined,
      verifierNotes: effectiveNote
    });

    setRegistryEntries(getVerificationRegistry());

    showToast(
      `Logbook pasien ${patient.patientName} (${patient.bedNumber}) dikembalikan untuk revisi.`
    );
  };

  // 2b. SAVE PATIENT LOGBOOK EDITS & EVALUATION DIRECTLY
  const handleSavePatientLogbookEdits = (
    rec: RosterVerificationRecord,
    patient: PatientVerificationDetail,
    payload: PatientLogbookEditPayload
  ) => {
    const patKey = buildPatientVerificationKey(
      rec.nurseName,
      patient.bedNumber,
      patient.medicalRecord
    );

    const updateDetails = {
      status: payload.status || patient.status,
      verifiedAt: payload.status === 'terverifikasi' ? formatNowWib() : patient.verifiedAt,
      verifiedBy: payload.status === 'terverifikasi' ? verifierName : patient.verifiedBy,
      verifiedByRole: payload.status === 'terverifikasi' ? verifierRoleLabel : patient.verifiedByRole,
      verifierNotes: payload.verifierNotes || patient.verifierNotes || '',
      score: payload.score,
      grade: payload.grade,
      isCorrected: true
    };

    setPerPatientRecords((prev) => ({
      ...prev,
      [patKey]: updateDetails
    }));

    // Persist patientStatuses to managing nurse's v4 localStorage key
    try {
      const statKey = getNursePatientStatusesKey(rec.nurseName);
      const raw = localStorage.getItem(statKey);
      const allStatuses = raw ? JSON.parse(raw) : {};
      const pKey = patient.id || patient.bedNumber;
      allStatuses[pKey] = payload.patientStatuses;
      allStatuses[patient.bedNumber] = payload.patientStatuses;
      localStorage.setItem(statKey, JSON.stringify(allStatuses));
    } catch {
      // ignore
    }

    // Persist facilityStatuses to managing nurse's facility key
    if (payload.facilityStatuses) {
      try {
        localStorage.setItem(
          getNurseFacilityStatusesKey(rec.nurseName),
          JSON.stringify(payload.facilityStatuses)
        );
      } catch {
        // ignore
      }
    }

    // Persist patientNotes to managing nurse's v4 localStorage key
    if (payload.patientNotes) {
      try {
        const notesKey = getNursePatientNotesKey(rec.nurseName);
        const rawNotes = localStorage.getItem(notesKey);
        const allNotes = rawNotes ? JSON.parse(rawNotes) : {};
        const pKey = patient.id || patient.bedNumber;
        allNotes[pKey] = payload.patientNotes;
        allNotes[patient.bedNumber] = payload.patientNotes;
        localStorage.setItem(notesKey, JSON.stringify(allNotes));
      } catch {
        // ignore
      }
    }

    if (payload.updatedSession && onSaveSession) {
      onSaveSession(payload.updatedSession);
    }

    showToast(
      `Koreksi butir SPO pasien ${patient.patientName} (${patient.bedNumber}) berhasil disimpan.`
    );
  };

  // 3. BATCH VERIFY ALL PATIENTS FOR A NURSE
  const handleVerifyAllPatients = (rec: RosterVerificationRecord) => {
    const timestamp = formatNowWib();
    const nextPerPatUpdates: Record<
      string,
      {
        status: PjVerificationStatus;
        verifiedAt: string;
        verifiedBy: string;
        verifiedByRole: string;
        verifierNotes: string;
      }
    > = {};

    rec.patientsSummary.forEach((p) => {
      const patKey = buildPatientVerificationKey(rec.nurseName, p.bedNumber, p.medicalRecord);
      const updateDetails = {
        status: 'terverifikasi' as PjVerificationStatus,
        verifiedAt: timestamp,
        verifiedBy: verifierName,
        verifiedByRole: verifierRoleLabel,
        verifierNotes: p.verifierNotes || rec.verifierNotes || ''
      };
      nextPerPatUpdates[patKey] = updateDetails;

      if (onVerifyPatientSession) {
        onVerifyPatientSession(
          {
            bedNumber: p.bedNumber,
            patientName: p.patientName,
            medicalRecord: p.medicalRecord
          },
          true,
          {
            ...updateDetails,
            nurseName: rec.nurseName
          }
        );
      }
    });

    setPerPatientRecords((prev) => ({
      ...prev,
      ...nextPerPatUpdates
    }));

    handleVerifyApprove(rec, false);
    showToast(
      `Seluruh ${rec.patientsSummary.length} pasien kelolaan ${rec.nurseName} telah diverifikasi & disahkan oleh ${verifierRoleLabel}.`
    );
  };

  const handleVerifyApprove = (
    record: RosterVerificationRecord,
    showToastMsg: boolean = true,
    overrideNotes?: string
  ) => {
    const timestamp = formatNowWib();
    const finalNotes =
      overrideNotes !== undefined ? overrideNotes : record.verifierNotes || '';

    if (onVerifyPatientSession && record.patientsSummary && record.patientsSummary.length > 0) {
      record.patientsSummary.forEach((p) => {
        onVerifyPatientSession(
          {
            bedNumber: p.bedNumber,
            patientName: p.patientName,
            medicalRecord: p.medicalRecord
          },
          true,
          {
            verifiedAt: timestamp,
            verifiedBy: verifierName,
            verifiedByRole: verifierRoleLabel,
            verifierNotes: finalNotes || p.verifierNotes || '',
            nurseName: record.nurseName
          }
        );
      });
    }

    upsertVerificationRegistryEntry({
      id: record.id,
      submittedNurseName: record.nurseName,
      submittedNurseNip: record.nurseNip,
      submittedNurseRole: record.nurseRole || 'perawat_pelaksana',
      targetRole:
        record.targetRole || (userRole === 'kepala_ruangan' ? 'kepala_ruangan' : 'pj_shift'),
      targetVerifierName: record.targetVerifierName || verifierName,
      shift: record.shift,
      status: 'terverifikasi',
      submittedAt: record.submittedAt || timestamp,
      verifiedAt: timestamp,
      verifiedBy: verifierName,
      verifiedByRole: verifierRoleLabel,
      verifierNotes: finalNotes
    });

    syncNurseSubmissionStorage(record.nurseName, {
      status: 'terverifikasi',
      submittedNurseName: record.nurseName,
      submittedNurseNip: record.nurseNip,
      submittedAt: record.submittedAt || timestamp,
      verifiedAt: timestamp,
      verifiedBy: verifierName,
      verifiedByRole: verifierRoleLabel,
      verifierNotes: finalNotes
    });

    setRegistryEntries(getVerificationRegistry());

    if (onVerificationUpdated) {
      onVerificationUpdated(record.nurseName, 'terverifikasi', {
        verifiedAt: timestamp,
        verifiedBy: verifierName,
        verifiedByRole: verifierRoleLabel,
        verifierNotes: finalNotes
      });
    }

    if (showToastMsg) {
      showToast(`Logbook ${record.nurseName} telah diverifikasi oleh ${verifierRoleLabel}.`);
    }
  };

  const filteredRecords = queueRecords.filter((rec) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      rec.nurseName.toLowerCase().includes(q) ||
      rec.nurseNip.toLowerCase().includes(q) ||
      rec.patientsSummary.some(
        (p) =>
          p.patientName.toLowerCase().includes(q) ||
          p.bedNumber.toLowerCase().includes(q) ||
          (p.medicalRecord && p.medicalRecord.toLowerCase().includes(q))
      );
    const matchesStatus = statusFilter === 'all' || rec.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const waitingCount = queueRecords.filter((r) => r.status === 'diajukan').length;
  const verifiedCount = queueRecords.filter((r) => r.status === 'terverifikasi').length;
  const revisionCount = queueRecords.filter((r) => r.status === 'belum_diajukan').length;

  return (
    <div className="space-y-5">
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-400/40">
          <CheckCircle2 className="w-5 h-5 text-emerald-100 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Role Queue Context Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                userRole === 'kepala_ruangan'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-slate-900">
                  {userRole === 'kepala_ruangan'
                    ? 'Halaman Verifikasi Kepala Ruang'
                    : 'Halaman Verifikasi Penanggung Jawab (PJ) Shift'}
                </h2>
                <span className="text-xs text-slate-400" aria-hidden="true">
                  &middot;
                </span>
                <span className="text-xs font-bold text-indigo-700">{verifierName}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {userRole === 'kepala_ruangan'
                  ? 'Hanya menampilkan pengajuan verifikasi logbook yang ditujukan kepada Kepala Ruang (termasuk pasien kelolaan PJ Shift dan pengajuan mandiri Kepala Ruang). Pengajuan yang tidak ditujukan kepada Kepala Ruang tidak ditampilkan.'
                  : `Hanya menampilkan pengajuan verifikasi logbook yang ditujukan khusus untuk Anda (${verifierName}) sebagai PJ Shift (dari Perawat Pelaksana, PJ Shift lainnya, atau Kepala Ruang). Pengajuan yang tidak ditujukan untuk Anda otomatis disembunyikan.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0 tabular-nums">
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 whitespace-nowrap">
              {queueRecords.length} Pengajuan Aktif
            </span>
          </div>
        </div>
      </div>

      {/* Search & Status Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              userRole === 'kepala_ruangan'
                ? 'Cari nama PJ Shift pengaju, nomor bed, atau nama pasien kelolaan...'
                : 'Cari nama perawat / PJ Shift pengaju, nomor bed, atau nama pasien kelolaan...'
            }
            className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'all', label: `Semua (${queueRecords.length})` },
              { id: 'diajukan', label: `Menunggu Verifikasi (${waitingCount})` },
              { id: 'terverifikasi', label: `Terverifikasi (${verifiedCount})` },
              ...(revisionCount > 0
                ? [{ id: 'belum_diajukan' as const, label: `Perlu Revisi (${revisionCount})` }]
                : [])
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Verification Queue Cards */}
      <div className="space-y-4">
        {filteredRecords.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
            <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">
              {queueRecords.length === 0
                ? userRole === 'kepala_ruangan'
                  ? 'Belum ada pengajuan verifikasi logbook yang ditujukan kepada Kepala Ruang'
                  : `Belum ada pengajuan verifikasi logbook yang ditujukan kepada ${verifierName}`
                : 'Tidak ada data pengajuan verifikasi yang sesuai filter'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {queueRecords.length === 0
                ? userRole === 'kepala_ruangan'
                  ? 'Pengajuan dari PJ Shift atau Kepala Ruang akan otomatis muncul di halaman ini segera setelah diajukan pada Bagian VII Logbook.'
                  : 'Pengajuan dari Perawat Pelaksana yang memilih Anda sebagai PJ Shift tujuan akan otomatis muncul di halaman ini.'
                : 'Ubah kata kunci pencarian atau pilih filter status lainnya.'}
            </p>
          </div>
        ) : (
          filteredRecords.map((rec, nurseIdx) => {
            const palette = NURSE_COLOR_PALETTES[nurseIdx % NURSE_COLOR_PALETTES.length];
            const patSpoCompleted = rec.patientsSummary.reduce((acc, p) => acc + p.completed, 0);
            const patSpoTotal = rec.patientsSummary.reduce((acc, p) => acc + p.total, 0);
            const grandCompleted = rec.facilityCompleted + patSpoCompleted;
            const grandTotal = rec.facilityTotal + patSpoTotal;
            const grandPct = grandTotal > 0 ? Math.round((grandCompleted / grandTotal) * 100) : 0;
            const verifiedPatientsCount = rec.patientsSummary.filter(
              (p) => p.status === 'terverifikasi'
            ).length;

            const targetDisplay =
              rec.targetRole === 'kepala_ruangan' || rec.targetRole === 'mandiri'
                ? `Tujuan Kepala Ruang: ${rec.targetVerifierName}`
                : `Tujuan PJ Shift: ${rec.targetVerifierName}`;

            return (
              <div
                key={rec.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
              >
                {/* Top Row: Nurse Identity + Verification Status */}
                <div
                  className={`p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${palette.bgHeader}`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-sm tracking-wide ${palette.avatarBg}`}
                      title={`Inisial: ${getNurseInitials(rec.nurseName)}`}
                    >
                      <span>{getNurseInitials(rec.nurseName)}</span>
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
                        <span
                          className={`font-bold ${
                            rec.status === 'terverifikasi'
                              ? 'text-emerald-700'
                              : rec.status === 'diajukan'
                              ? 'text-indigo-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {rec.status === 'terverifikasi'
                            ? 'Terverifikasi'
                            : rec.status === 'diajukan'
                            ? 'Menunggu Verifikasi'
                            : 'Perlu Revisi'}
                        </span>
                        <span aria-hidden="true">&middot;</span>
                        <span>Shift {rec.shift}</span>
                        <span aria-hidden="true">&middot;</span>
                        <span>{formatSubmitterRoleLabel(rec.nurseRole)}</span>
                        <span aria-hidden="true">&middot;</span>
                        <span className="font-semibold text-slate-700">
                          {verifiedPatientsCount} dari {rec.patientsSummary.length} Pasien Disahkan
                        </span>
                      </div>

                      <h3 className={`text-base sm:text-lg tracking-tight font-black ${palette.nameColor}`}>
                        {rec.nurseName}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
                        <span className="font-mono">NIP: {rec.nurseNip}</span>
                        <span aria-hidden="true">&middot;</span>
                        <span>{targetDisplay}</span>
                        {rec.submittedAt && (
                          <>
                            <span aria-hidden="true">&middot;</span>
                            <span>Diajukan: {rec.submittedAt}</span>
                          </>
                        )}
                        {rec.verifiedAt && (
                          <>
                            <span aria-hidden="true">&middot;</span>
                            <span className="text-emerald-700 font-semibold">
                              Disahkan: {rec.verifiedAt}
                              {rec.verifiedBy ? ` oleh ${rec.verifiedBy}` : ''}
                            </span>
                          </>
                        )}
                      </div>

                      {rec.pelaksanaNotes && (
                        <p className="text-xs text-slate-600 pt-1 italic">
                          Catatan Pengaju: &ldquo;{rec.pelaksanaNotes}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right SPO Summary & Batch Verify Button */}
                  <div className="flex flex-col md:items-end gap-2 shrink-0 tabular-nums">
                    <div className="text-sm font-black text-slate-900 font-mono text-left md:text-right">
                      {grandCompleted}/{grandTotal} SPO ({grandPct}%)
                    </div>
                    <div className="text-xs text-slate-500 text-left md:text-right">
                      Bagian I: {rec.facilityCompleted}/{rec.facilityTotal} &middot;{' '}
                      {rec.patientsSummary.length} Pasien Kelolaan
                    </div>

                    {rec.patientsSummary.length > 0 &&
                      verifiedPatientsCount < rec.patientsSummary.length && (
                        <button
                          type="button"
                          onClick={() => handleVerifyAllPatients(rec)}
                          className="mt-1 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer self-start md:self-end shadow-2xs whitespace-nowrap shrink-0"
                          title="Verifikasi seluruh pasien kelolaan perawat ini sekaligus"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          <span>Sahkan Seluruh Pasien ({rec.patientsSummary.length})</span>
                        </button>
                      )}
                  </div>
                </div>

                {/* Middle Row: Managed Patients Detailed Cards */}
                <div className="p-4 sm:p-5 bg-white space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Daftar Logbook Pasien Kelolaan ({rec.patientsSummary.length} Pasien)</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Klik &ldquo;Koreksi &amp; Verifikasi&rdquo; untuk memeriksa detail SPO Bagian I–VI
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {rec.patientsSummary.map((pat) => {
                      const isPatVerified = pat.status === 'terverifikasi';
                      const sess = pat.session;

                      return (
                        <div
                          key={`${rec.id}-${pat.bedNumber}-${pat.id}`}
                          className={`rounded-2xl border p-4 transition-all flex flex-col justify-between gap-3 ${
                            isPatVerified
                              ? 'bg-emerald-50/30 border-emerald-300'
                              : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Card Top: Bed, Name, and Status */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                              <span className="font-mono font-bold text-blue-800">
                                {pat.bedNumber}
                                {pat.medicalRecord ? ` · RM ${pat.medicalRecord}` : ''}
                              </span>
                              {isPatVerified ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>Terverifikasi</span>
                                </span>
                              ) : pat.status === 'diajukan' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700">
                                  <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  <span>Menunggu</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span>Perlu Revisi</span>
                                </span>
                              )}
                            </div>

                            <div className="font-black text-slate-900 text-sm leading-tight pt-0.5">
                              {pat.patientName}
                            </div>

                            {/* SPO Indicator Score */}
                            <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500 font-mono tabular-nums">
                              <span>Kelengkapan SPO Bag. II–VI:</span>
                              <strong
                                className={
                                  pat.completed === pat.total ? 'text-emerald-700' : 'text-amber-700'
                                }
                              >
                                {pat.completed}/{pat.total} SPO
                              </strong>
                            </div>

                            {pat.isCorrected && (
                              <div className="text-[11px] font-semibold text-amber-700 pt-0.5">
                                Telah dikoreksi oleh verifikator
                              </div>
                            )}

                            {pat.verifierNotes && (
                              <div className="text-[11px] text-slate-600 pt-0.5 line-clamp-2">
                                Catatan: {pat.verifierNotes}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons: Koreksi & Verifikasi + Sahkan Pasien */}
                          <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPatientModal({
                                  patient: pat,
                                  nurseName: rec.nurseName,
                                  nurseNip: rec.nurseNip,
                                  session: sess
                                });
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-800 font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-200 whitespace-nowrap shrink-0"
                              title="Koreksi butir SPO dan verifikasi logbook pasien ini"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>Koreksi &amp; Verifikasi</span>
                            </button>

                            <div className="flex items-center gap-1.5">
                              {isPatVerified ? (
                                <button
                                  type="button"
                                  onClick={() => handleVerifyPatientRevise(rec, pat)}
                                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                                  title="Batalkan verifikasi pasien ini dan kembalikan untuk revisi"
                                >
                                  <RotateCcw className="w-3 h-3 shrink-0" />
                                  <span>Revisi</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleVerifyPatientApprove(rec, pat)}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                                  title="Verifikasi & sahkan logbook pasien ini"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                  <span>Sahkan Pasien</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Patient Logbook Verification Detail Modal */}
      {selectedPatientModal && (
        <PatientLogbookVerificationModal
          isOpen={!!selectedPatientModal}
          onClose={() => setSelectedPatientModal(null)}
          patient={selectedPatientModal.patient}
          nurseName={selectedPatientModal.nurseName}
          nurseNip={selectedPatientModal.nurseNip}
          shiftInfo={shiftInfo}
          userRole={userRole}
          verifierName={verifierName}
          session={selectedPatientModal.session}
          verificationStatus={selectedPatientModal.patient.status}
          verifiedAt={selectedPatientModal.patient.verifiedAt}
          verifiedBy={selectedPatientModal.patient.verifiedBy}
          verifiedByRole={selectedPatientModal.patient.verifiedByRole}
          verifierNotes={selectedPatientModal.patient.verifierNotes}
          initialScore={selectedPatientModal.patient.score}
          initialGrade={selectedPatientModal.patient.grade}
          isInitiallyCorrected={selectedPatientModal.patient.isCorrected}
          onSaveSession={onSaveSession}
          onSaveLogbookEdits={(payload) => {
            const rec = queueRecords.find((r) =>
              isMatchingNurse(r.nurseName, selectedPatientModal.nurseName)
            );
            if (rec) {
              handleSavePatientLogbookEdits(rec, selectedPatientModal.patient, payload);
            }
          }}
          onVerifyApprove={(_patientId, notes, evaluation) => {
            const rec = queueRecords.find((r) =>
              isMatchingNurse(r.nurseName, selectedPatientModal.nurseName)
            );
            if (rec) {
              handleVerifyPatientApprove(rec, selectedPatientModal.patient, notes, evaluation);
            }
            setSelectedPatientModal(null);
          }}
          onVerifyRevise={(_patientId, notes, evaluation) => {
            const rec = queueRecords.find((r) =>
              isMatchingNurse(r.nurseName, selectedPatientModal.nurseName)
            );
            if (rec) {
              handleVerifyPatientRevise(rec, selectedPatientModal.patient, notes, evaluation);
            }
            setSelectedPatientModal(null);
          }}
        />
      )}
    </div>
  );
};
