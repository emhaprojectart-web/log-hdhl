import React, { useState, useEffect } from 'react';
import {
  Droplets,
  Sliders,
  UserCheck,
  Activity,
  GraduationCap,
  CheckCircle2,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
  Save,
  Square,
  ChevronRight,
  Users,
  Copy,
  Plus,
  Trash2,
  Hand,
  ClipboardCheck,
  Send,
  Clock,
  RotateCcw,
  AlertCircle,
  FileText,
  Sun,
  Sunset,
  CheckSquare,
  Stethoscope,
  MessageSquare
} from 'lucide-react';
import { OFFICIAL_LOGBOOK_ITEMS } from '../data/officialPelaksanaLogbookData.ts';
import {
  PatientHDSession,
  ShiftInfo,
  MasterPatient,
  MasterNurse,
  MasterBed,
  SystemAccessRole,
  HdTreatmentDay
} from '../types/dialysis.ts';
import {
  formatSystemAccessLabel,
  filterMasterPatientsForActiveSchedule
} from '../utils/masterDataHelpers.ts';
import { LoginUserData } from './LoginPage.tsx';
import {
  Poin2_1ClinicalData,
  PatientLogbookClinicalDetails,
  setAllPoin2_1,
  normalizePoin2_1Data,
  getPoin2_1Counts,
  formatPoin2_1Note,
  formatPoin3_1Note,
  createDefaultPatientClinicalDetails
} from '../utils/logbookClinicalHelpers.ts';
import {
  upsertVerificationRegistryEntry,
  getVerificationRegistry,
  isMatchingNurse,
  getNurseStorageKey,
  getNurseManagedPatientsKey,
  getNurseShiftScheduleKey,
  getNursePatientStatusesKey,
  getNursePatientNotesKey,
  getNurseClinicalDetailsKey,
  getNurseSubmissionKey,
  buildPatientVerificationKey,
  getNurseFacilityStatusesKey,
  getNurseFacilityNotesKey,
  readNurseFacilityStatuses,
  readNurseFacilityNotes,
  PER_PATIENT_STATUS_STORAGE_KEY
} from '../utils/nurseVerificationHelpers.ts';
import {
  extractActiveDayName,
  formatCurrentWibTimestamp,
  getCurrentIndonesianFullDate,
  normalizeIndonesianDateLabel
} from '../utils/dateHelpers.ts';
import {
  subscribeToNurseLogbook,
  saveNurseLogbookCloud
} from '../services/firebase.ts';

export interface ManagedPatient {
  id: string;
  bedNumber: string;
  patientName: string;
  medicalRecord?: string;
}

export type PjVerificationStatus = 'belum_diajukan' | 'diajukan' | 'terverifikasi';

export interface PjVerificationSubmission {
  id?: string;
  status: PjVerificationStatus;
  submittedNurseName: string;
  submittedNurseNip: string;
  submittedNurseRole?: 'perawat_pelaksana' | 'pj_shift' | 'kepala_ruangan';
  targetRole?: 'pj_shift' | 'kepala_ruangan' | 'mandiri';
  targetVerifierName?: string;
  targetVerifierNip?: string;
  pjShiftName: string;
  pjShiftNip: string;
  notes: string;
  declarationChecked: boolean;
  submittedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  verifiedByRole?: string;
  verifierNotes?: string;
}

interface Logbook5ButtonsViewProps {
  sessions?: PatientHDSession[];
  shiftInfo?: ShiftInfo;
  masterPatients?: MasterPatient[];
  masterNurses?: MasterNurse[];
  masterBeds?: MasterBed[];
  loggedInUser?: LoginUserData | null;
  userRole?: SystemAccessRole;
  onSyncNurseSessions?: (
    nurseName: string,
    managedPatients: ManagedPatient[],
    verification: {
      status: PjVerificationStatus;
      verifiedAt?: string;
      verifiedBy?: string;
      verifiedByRole?: string;
      verifierNotes?: string;
    }
  ) => void;
  onShiftChange?: (shift: 'Pagi' | 'Siang') => void;
  onDateChange?: (isoDate: string) => void;
  isCustomDate?: boolean;
  onResetDateToToday?: () => void;
  onNavigateToVerifikasi?: () => void;
  onNavigateToRiwayat?: () => void;
}

interface BagianMeta {
  num: number;
  roman: string;
  scopeLabel: string;
  title: string;
  fullName: string;
  subtitle: string;
  icon: React.ElementType;
  isPatientSpecific: boolean;
}

const BAGIAN_METAS: BagianMeta[] = [
  {
    num: 1,
    roman: 'BAGIAN I',
    scopeLabel: 'Fasilitas & Sistem RO Unit',
    title: 'Kesiapan Fasilitas Ruangan Hemodialisis & Sistem Water Treatment (RO)',
    fullName: 'BAGIAN I: Kesiapan Fasilitas Ruangan Hemodialisis & Sistem Water Treatment (RO)',
    subtitle:
      'Kesiapan RO & water treatment, suhu serta zonasi ruangan, dan kesiapan troli darurat beserta alat emergensi.',
    icon: Droplets,
    isPatientSpecific: false
  },
  {
    num: 2,
    roman: 'BAGIAN II',
    scopeLabel: 'Persiapan Pre-HD',
    title: 'Persiapan Perawat, Peralatan, Mesin HD & Alat Kesehatan (Pre-HD)',
    fullName: 'BAGIAN II: Persiapan Perawat, Peralatan, Mesin HD & Alat Kesehatan (Pre-HD)',
    subtitle:
      'Hand hygiene & APD, kelulusan self-test mesin HD, pemasangan acid/bikarbonat & RO, verifikasi dialyzer, priming, serta konduktivitas dialisat.',
    icon: Sliders,
    isPatientSpecific: true
  },
  {
    num: 3,
    roman: 'BAGIAN III',
    scopeLabel: 'Pengkajian & Keselamatan Pre-HD',
    title: 'Identifikasi Pasien, Pengkajian Pre-HD & Keselamatan Pasien (Patient Safety)',
    fullName:
      'BAGIAN III: Identifikasi Pasien, Pengkajian Pre-HD & Keselamatan Pasien (Patient Safety)',
    subtitle:
      'Identifikasi pasien (SKP 1), pengkajian berat badan & target cairan (UF Goal), TTV Pre-HD, risiko jatuh, konfirmasi resep, dan akses vaskular.',
    icon: UserCheck,
    isPatientSpecific: true
  },
  {
    num: 4,
    roman: 'BAGIAN IV',
    scopeLabel: 'Monitoring Intra-HD',
    title: 'Monitoring Intra-HD & Pencegahan Insiden Keselamatan Pasien (IKP)',
    fullName: 'BAGIAN IV: Monitoring Intra-HD & Pencegahan Insiden Keselamatan Pasien (IKP)',
    subtitle:
      'Observasi berkala TTV & parameter mesin (AP, VP, TMP, UF), respon alarm mesin < 1 menit, penanganan komplikasi, dan fiksasi akses.',
    icon: Activity,
    isPatientSpecific: true
  },
  {
    num: 5,
    roman: 'BAGIAN V',
    scopeLabel: 'Edukasi Pasien & Keluarga',
    title: 'Edukasi Terstruktur Kepada Pasien & Keluarga (Diet, Cairan, Kebersihan Diri)',
    fullName:
      'BAGIAN V: Edukasi Terstruktur Kepada Pasien & Keluarga (Diet, Cairan, Kebersihan Diri)',
    subtitle:
      'Edukasi pembatasan cairan harian, diet ginjal rendah kalium & fosfat, personal hygiene, perawatan akses vaskular di rumah, dan kepatuhan jadwal HD.',
    icon: GraduationCap,
    isPatientSpecific: true
  },
  {
    num: 6,
    roman: 'BAGIAN VI',
    scopeLabel: 'Terminasi & Dokumentasi Post-HD',
    title: 'Terminasi Aman, Evaluasi Post-HD, Disinfeksi Mesin & Pendokumentasian',
    fullName:
      'BAGIAN VI: Terminasi Aman, Evaluasi Post-HD, Disinfeksi Mesin & Pendokumentasian',
    subtitle:
      'Terminasi HD aman (washback), hemostasis akses, evaluasi TTV & BB Post-HD, disinfeksi mesin HD, serta dokumentasi asuhan CPPT.',
    icon: Stethoscope,
    isPatientSpecific: true
  },
  {
    num: 7,
    roman: 'BAGIAN VII',
    scopeLabel: 'Rekapitulasi & Verifikasi Shift',
    title: 'Pengajuan Verifikasi Logbook Shift',
    fullName: 'BAGIAN VII: Pengajuan Verifikasi Logbook Shift',
    subtitle:
      'Pemeriksaan kelengkapan indikator SPO Bagian I–VI seluruh pasien kelolaan dan pengajuan verifikasi capaian shift.',
    icon: ClipboardCheck,
    isPatientSpecific: false
  }
];

export type EmptyManagedPatientsList = ManagedPatient[];

function buildInitialClinicalDetailsMap(
  patients: ManagedPatient[]
): Record<string, PatientLogbookClinicalDetails> {
  const initial: Record<string, PatientLogbookClinicalDetails> = {};
  patients.forEach((p) => {
    initial[p.id] = createDefaultPatientClinicalDetails('new');
  });
  return initial;
}

function buildDefaultStatusesForPatients(
  patients: ManagedPatient[]
): Record<string, Record<string, boolean>> {
  const initial: Record<string, Record<string, boolean>> = {};
  const patientSpoItems = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian >= 2 && it.bagian <= 6);
  patients.forEach((p) => {
    initial[p.id] = {};
    patientSpoItems.forEach((it) => {
      initial[p.id][it.code] = false;
    });
  });
  return initial;
}

function buildDefaultNotesForPatients(
  patients: ManagedPatient[]
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  patients.forEach((p) => {
    result[p.id] = {};
  });
  return result;
}

export const Logbook5ButtonsView: React.FC<Logbook5ButtonsViewProps> = ({
  sessions = [],
  shiftInfo,
  masterPatients = [],
  masterNurses = [],
  masterBeds = [],
  loggedInUser,
  userRole = 'perawat_pelaksana',
  onSyncNurseSessions,
  onShiftChange,
  onNavigateToVerifikasi,
  onNavigateToRiwayat
}) => {
  const activeDate = shiftInfo?.date
    ? normalizeIndonesianDateLabel(shiftInfo.date)
    : getCurrentIndonesianFullDate();
  const shiftFromProps: 'Pagi' | 'Siang' = shiftInfo?.shift === 'Siang' ? 'Siang' : 'Pagi';

  const activeRole: 'perawat_pelaksana' | 'pj_shift' | 'kepala_ruangan' =
    userRole === 'pj_shift'
      ? 'pj_shift'
      : userRole === 'kepala_ruangan'
      ? 'kepala_ruangan'
      : 'perawat_pelaksana';

  const defaultPelaksanaNurse = React.useMemo(() => {
    const onDutyPelaksana =
      masterNurses.find((n) => n.role === 'perawat_pelaksana' && n.isOnDutyToday) ||
      masterNurses.find((n) => n.role === 'perawat_pelaksana');
    return {
      name: onDutyPelaksana?.name || '-',
      nip: onDutyPelaksana?.nip || '-'
    };
  }, [masterNurses]);

  const defaultPjShiftNurse = React.useMemo(() => {
    const shiftPj = masterNurses.find(
      (n) => n.role === 'pj_shift' && n.shiftAssigned === shiftFromProps
    );
    const validShiftInfoPj =
      shiftInfo?.pjShift && shiftInfo.pjShift !== '-' ? shiftInfo.pjShift : '';
    const targetName = validShiftInfoPj || shiftPj?.name;
    if (targetName) {
      const matched = masterNurses.find((n) => isMatchingNurse(n.name, targetName));
      return {
        name: matched?.name || targetName,
        nip: matched?.nip || shiftPj?.nip || '-'
      };
    }
    const pjNurse =
      masterNurses.find((n) => n.role === 'pj_shift' && n.isOnDutyToday) ||
      masterNurses.find((n) => n.role === 'pj_shift');
    return {
      name: pjNurse?.name || '-',
      nip: pjNurse?.nip || '-'
    };
  }, [shiftInfo?.pjShift, shiftFromProps, masterNurses]);

  const defaultKaruNurse = React.useMemo(() => {
    const validKaruShift =
      shiftInfo?.kepalaRuangan && shiftInfo.kepalaRuangan !== '-' ? shiftInfo.kepalaRuangan : '';
    if (validKaruShift) {
      const matched = masterNurses.find((n) => isMatchingNurse(n.name, validKaruShift));
      return {
        name: matched?.name || validKaruShift,
        nip: matched?.nip || '-'
      };
    }
    const karu = masterNurses.find((n) => n.role === 'kepala_ruangan');
    return {
      name: karu?.name || '-',
      nip: karu?.nip || '-'
    };
  }, [shiftInfo?.kepalaRuangan, masterNurses]);

  // Active nurse identity scoped strictly to the logged-in account & active role
  const currentNurse = React.useMemo(() => {
    if (loggedInUser?.name && loggedInUser.userRole === userRole) {
      const matched = masterNurses.find((n) => isMatchingNurse(n.name, loggedInUser.name));
      return {
        name: loggedInUser.name,
        nip: loggedInUser.nip || matched?.nip || '-'
      };
    }
    if (activeRole === 'pj_shift') return defaultPjShiftNurse;
    if (activeRole === 'kepala_ruangan') return defaultKaruNurse;
    if (loggedInUser?.name) {
      const matched = masterNurses.find((n) => isMatchingNurse(n.name, loggedInUser.name));
      return {
        name: loggedInUser.name,
        nip: loggedInUser.nip || matched?.nip || '-'
      };
    }
    return defaultPelaksanaNurse;
  }, [
    loggedInUser,
    userRole,
    activeRole,
    masterNurses,
    defaultPjShiftNurse,
    defaultKaruNurse,
    defaultPelaksanaNurse
  ]);

  // Other PJ Shift options (excluding the currently logged-in PJ Shift nurse)
  const otherPjShiftOptions = React.useMemo(() => {
    const list: { name: string; nip: string; shift?: string }[] = [];
    masterNurses
      .filter(
        (n) =>
          (n.role === 'pj_shift' || n.systemAccess === 'pj_shift') &&
          n.accountStatus !== 'nonaktif' &&
          !isMatchingNurse(n.name, currentNurse.name)
      )
      .forEach((n) => {
        if (n.name && n.name !== '-' && !list.some((item) => isMatchingNurse(item.name, n.name))) {
          list.push({ name: n.name, nip: n.nip || '-', shift: n.shiftAssigned });
        }
      });
    return list;
  }, [masterNurses, currentNurse.name]);

  const defaultOtherPjShiftNurse = React.useMemo(
    () => otherPjShiftOptions[0] || { name: '-', nip: '-' },
    [otherPjShiftOptions]
  );

  const managedPatientsStorageKey = getNurseManagedPatientsKey(currentNurse.name);
  const shiftScheduleStorageKey = getNurseShiftScheduleKey(currentNurse.name);
  const patientStatusesStorageKey = getNursePatientStatusesKey(currentNurse.name);
  const patientNotesStorageKey = getNursePatientNotesKey(currentNurse.name);
  const clinicalDetailsStorageKey = getNurseClinicalDetailsKey(currentNurse.name);
  const submissionStorageKey = getNurseSubmissionKey(currentNurse.name);
  const facilityStatusesStorageKey = getNurseFacilityStatusesKey(currentNurse.name);
  const facilityNotesStorageKey = getNurseFacilityNotesKey(currentNurse.name);

  // Per-nurse selected Shift Dinas (Pagi or Siang)
  const [activeShift, setActiveShift] = useState<'Pagi' | 'Siang'>(() => {
    try {
      const savedShift = localStorage.getItem(shiftScheduleStorageKey);
      if (savedShift === 'Pagi' || savedShift === 'Siang') {
        return savedShift;
      }
    } catch {
      // ignore
    }
    return shiftFromProps;
  });

  const activeDayName: HdTreatmentDay = extractActiveDayName(activeDate);

  // Strictly filter patient choices to patients scheduled on the active day AND active shift
  const scheduledMasterPatients = React.useMemo(
    () => filterMasterPatientsForActiveSchedule(masterPatients, activeDayName, activeShift),
    [masterPatients, activeDayName, activeShift]
  );

  // 0 to 4 Managed Patients State — strictly isolated per nurse
  const [managedPatients, setManagedPatients] = useState<ManagedPatient[]>(() => {
    try {
      const saved = localStorage.getItem(managedPatientsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }

    if (currentNurse.name && currentNurse.name !== '-') {
      const reg = getVerificationRegistry();
      const regEntry = reg.find((e) => isMatchingNurse(e.submittedNurseName, currentNurse.name));
      if (regEntry && Array.isArray(regEntry.patients) && regEntry.patients.length > 0) {
        return regEntry.patients.slice(0, 4).map((p, idx) => ({
          id: p.id || `p-${getNurseStorageKey(currentNurse.name)}-${idx + 1}`,
          bedNumber: p.bedNumber,
          patientName: p.patientName,
          medicalRecord: p.medicalRecord
        }));
      }

      const nurseSessions = sessions.filter((s) =>
        isMatchingNurse(s.nurseInCharge, currentNurse.name)
      );
      if (nurseSessions.length > 0) {
        return nurseSessions.slice(0, 4).map((s) => ({
          id: s.id,
          bedNumber: s.bedNumber,
          patientName: s.patientName,
          medicalRecord: s.medicalRecordNumber
        }));
      }
    }

    return [];
  });

  const [activePatientId, setActivePatientId] = useState<string>(() => {
    return managedPatients[0]?.id || '';
  });

  // Structured Clinical Sub-Data for Bagian 2 (2.1) & Bagian 3 (3.1, 3.2, 3.3)
  const [patientClinicalDetails, setPatientClinicalDetails] = useState<
    Record<string, PatientLogbookClinicalDetails>
  >(() => {
    const base = buildInitialClinicalDetailsMap(managedPatients);
    try {
      const saved = localStorage.getItem(clinicalDetailsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, PatientLogbookClinicalDetails>;
        if (parsed && typeof parsed === 'object') {
          const merged: Record<string, PatientLogbookClinicalDetails> = { ...base };
          Object.entries(parsed).forEach(([patId, detail]) => {
            if (detail && typeof detail === 'object') {
              const fallback = base[patId] || createDefaultPatientClinicalDetails('new');
              merged[patId] = {
                ...fallback,
                ...detail,
                poin2_1: normalizePoin2_1Data(detail.poin2_1)
              };
            }
          });
          return merged;
        }
      }
    } catch {
      // fallback
    }
    return base;
  });

  // Facility (Bagian 1) Checklists & Notes — isolated per staff
  const [facilityStatuses, setFacilityStatuses] = useState<Record<string, boolean>>(() =>
    readNurseFacilityStatuses(currentNurse.name)
  );

  const [facilityNotes, setFacilityNotes] = useState<Record<string, string>>(() =>
    readNurseFacilityNotes(currentNurse.name)
  );

  // Patient-specific (Bagian 2, 3, 4, 5, 6) Checklists & Notes — isolated per nurse
  const [patientStatuses, setPatientStatuses] = useState<Record<string, Record<string, boolean>>>(
    () => {
      const defaults = buildDefaultStatusesForPatients(managedPatients);
      try {
        const saved = localStorage.getItem(patientStatusesStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Record<string, Record<string, boolean>>;
          if (parsed && typeof parsed === 'object') {
            const merged: Record<string, Record<string, boolean>> = { ...defaults };
            Object.entries(parsed).forEach(([patId, patChecks]) => {
              if (patChecks && typeof patChecks === 'object') {
                merged[patId] = {
                  ...(defaults[patId] || {}),
                  ...patChecks
                };
              }
            });
            return merged;
          }
        }
      } catch {
        // fallback
      }
      return defaults;
    }
  );

  const [patientNotes, setPatientNotes] = useState<Record<string, Record<string, string>>>(() => {
    const defaults = buildDefaultNotesForPatients(managedPatients);
    try {
      const saved = localStorage.getItem(patientNotesStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, Record<string, string>>;
        if (parsed && typeof parsed === 'object') {
          return { ...defaults, ...parsed };
        }
      }
    } catch {
      // fallback
    }
    return defaults;
  });

  // Bagian VII: Verification Submission State
  const [pjVerification, setPjVerification] = useState<PjVerificationSubmission>(() => {
    const defaultTargetRole: 'pj_shift' | 'kepala_ruangan' =
      activeRole === 'pj_shift'
        ? defaultKaruNurse.name !== '-' || defaultOtherPjShiftNurse.name === '-'
          ? 'kepala_ruangan'
          : 'pj_shift'
        : activeRole === 'kepala_ruangan'
        ? 'kepala_ruangan'
        : 'pj_shift';

    const defaultTargetVerifier =
      activeRole === 'pj_shift'
        ? defaultTargetRole === 'pj_shift'
          ? defaultOtherPjShiftNurse
          : defaultKaruNurse
        : activeRole === 'kepala_ruangan'
        ? currentNurse
        : defaultPjShiftNurse;

    // 1. Check shared verification registry first
    const reg = getVerificationRegistry();
    const foundReg = reg.find((e) => isMatchingNurse(e.submittedNurseName, currentNurse.name));
    if (foundReg) {
      const normalizedTargetRole: 'pj_shift' | 'kepala_ruangan' =
        foundReg.targetRole === 'mandiri' || foundReg.targetRole === 'kepala_ruangan'
          ? 'kepala_ruangan'
          : 'pj_shift';
      return {
        id: foundReg.id,
        status: foundReg.status,
        submittedNurseName: currentNurse.name,
        submittedNurseNip: foundReg.submittedNurseNip || currentNurse.nip,
        submittedNurseRole: activeRole,
        targetRole: normalizedTargetRole,
        targetVerifierName: foundReg.targetVerifierName || defaultTargetVerifier.name,
        targetVerifierNip: foundReg.targetVerifierNip || defaultTargetVerifier.nip,
        pjShiftName:
          normalizedTargetRole === 'pj_shift'
            ? foundReg.targetVerifierName || defaultTargetVerifier.name
            : defaultPjShiftNurse.name,
        pjShiftNip:
          normalizedTargetRole === 'pj_shift'
            ? foundReg.targetVerifierNip || defaultTargetVerifier.nip
            : defaultPjShiftNurse.nip,
        notes: foundReg.pelaksanaNotes || '',
        declarationChecked: true,
        submittedAt: foundReg.submittedAt,
        verifiedAt: foundReg.verifiedAt,
        verifiedBy: foundReg.verifiedBy,
        verifiedByRole: foundReg.verifiedByRole,
        verifierNotes: foundReg.verifierNotes
      };
    }

    // 2. Check per-nurse submission in localStorage
    try {
      const saved = localStorage.getItem(submissionStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<PjVerificationSubmission>;
        if (parsed && typeof parsed === 'object' && parsed.status) {
          const normalizedTargetRole: 'pj_shift' | 'kepala_ruangan' =
            activeRole === 'perawat_pelaksana'
              ? 'pj_shift'
              : parsed.targetRole === 'mandiri' || parsed.targetRole === 'kepala_ruangan'
              ? 'kepala_ruangan'
              : parsed.targetRole === 'pj_shift'
              ? 'pj_shift'
              : defaultTargetRole;
          const fallbackForRole =
            normalizedTargetRole === 'kepala_ruangan'
              ? activeRole === 'kepala_ruangan'
                ? currentNurse
                : defaultKaruNurse
              : activeRole === 'pj_shift'
              ? defaultOtherPjShiftNurse
              : defaultPjShiftNurse;
          return {
            status: parsed.status,
            submittedNurseName: currentNurse.name,
            submittedNurseNip: currentNurse.nip,
            submittedNurseRole: activeRole,
            targetRole: normalizedTargetRole,
            targetVerifierName: parsed.targetVerifierName || fallbackForRole.name,
            targetVerifierNip: parsed.targetVerifierNip || fallbackForRole.nip,
            pjShiftName: parsed.pjShiftName || defaultPjShiftNurse.name,
            pjShiftNip: parsed.pjShiftNip || defaultPjShiftNurse.nip,
            notes: parsed.notes || '',
            declarationChecked:
              parsed.status === 'belum_diajukan'
                ? Boolean(parsed.declarationChecked)
                : (parsed.declarationChecked ?? true),
            submittedAt: parsed.submittedAt,
            verifiedAt: parsed.verifiedAt,
            verifiedBy: parsed.verifiedBy,
            verifiedByRole: parsed.verifiedByRole,
            verifierNotes: parsed.verifierNotes
          };
        }
      }
    } catch {
      // fallback
    }

    return {
      status: 'belum_diajukan',
      submittedNurseName: currentNurse.name,
      submittedNurseNip: currentNurse.nip,
      submittedNurseRole: activeRole,
      targetRole: defaultTargetRole,
      targetVerifierName: defaultTargetVerifier.name,
      targetVerifierNip: defaultTargetVerifier.nip,
      pjShiftName: defaultPjShiftNurse.name,
      pjShiftNip: defaultPjShiftNurse.nip,
      notes: '',
      declarationChecked: false
    };
  });

  // Modal & Note Toggle State
  const [selectedBagian, setSelectedBagian] = useState<number | null>(null);
  const [expandedNoteCodes, setExpandedNoteCodes] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string, ms = 2500) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), ms);
  };

  // Sync per-nurse shift schedule with parent App header & localStorage
  useEffect(() => {
    try {
      localStorage.setItem(shiftScheduleStorageKey, activeShift);
      localStorage.setItem('dialysis_last_logbook_shift', activeShift);
    } catch {
      // ignore
    }
    if (onShiftChange && shiftInfo?.shift !== activeShift) {
      onShiftChange(activeShift);
    }
  }, [activeShift, shiftScheduleStorageKey]);

  const handleSelectShiftSchedule = (nextShift: 'Pagi' | 'Siang') => {
    setActiveShift(nextShift);
    try {
      localStorage.setItem('dialysis_last_logbook_shift', nextShift);
    } catch {
      // ignore
    }
    if (onShiftChange) {
      onShiftChange(nextShift);
    }

    if (pjVerification.status === 'belum_diajukan' && pjVerification.targetRole === 'pj_shift') {
      const matchingPjForShift = masterNurses.find(
        (n) =>
          (n.role === 'pj_shift' || n.systemAccess === 'pj_shift') &&
          n.accountStatus !== 'nonaktif' &&
          n.shiftAssigned === nextShift &&
          (activeRole !== 'pj_shift' || !isMatchingNurse(n.name, currentNurse.name))
      );
      if (matchingPjForShift?.name) {
        setPjVerification((prev) => ({
          ...prev,
          targetVerifierName: matchingPjForShift.name,
          targetVerifierNip: matchingPjForShift.nip || '-',
          pjShiftName: matchingPjForShift.name,
          pjShiftNip: matchingPjForShift.nip || '-'
        }));
      }
    }

    const hoursLabel = nextShift === 'Siang' ? '14.00 - 21.00 WIB' : '07.00 - 14.00 WIB';
    showToast(`Jadwal shift logbook diatur ke Shift ${nextShift} (${hoursLabel}).`);
  };

  // Sync per-nurse state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(managedPatientsStorageKey, JSON.stringify(managedPatients));
    } catch {
      // ignore
    }
  }, [managedPatients, managedPatientsStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(clinicalDetailsStorageKey, JSON.stringify(patientClinicalDetails));
    } catch {
      // ignore
    }
  }, [patientClinicalDetails, clinicalDetailsStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(facilityStatusesStorageKey, JSON.stringify(facilityStatuses));
    } catch {
      // ignore
    }
  }, [facilityStatuses, facilityStatusesStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(facilityNotesStorageKey, JSON.stringify(facilityNotes));
    } catch {
      // ignore
    }
  }, [facilityNotes, facilityNotesStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(patientStatusesStorageKey, JSON.stringify(patientStatuses));
    } catch {
      // ignore
    }
  }, [patientStatuses, patientStatusesStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(patientNotesStorageKey, JSON.stringify(patientNotes));
    } catch {
      // ignore
    }
  }, [patientNotes, patientNotesStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(submissionStorageKey, JSON.stringify(pjVerification));
    } catch {
      // ignore
    }
  }, [pjVerification, submissionStorageKey]);

  // Real-time Cloud Sync for personal nurse logbook (Multi-Device Continuity)
  const isCloudIncomingRef = React.useRef(false);

  // 1. Subscribe to Cloud Firestore for this nurse's logbook across all devices
  useEffect(() => {
    if (!currentNurse.name || currentNurse.name === '-') return;

    const unsubscribe = subscribeToNurseLogbook(currentNurse.name, (cloudData) => {
      if (!cloudData) return;
      isCloudIncomingRef.current = true;

      if (Array.isArray(cloudData.managedPatients) && cloudData.managedPatients.length > 0) {
        setManagedPatients(cloudData.managedPatients);
        try {
          localStorage.setItem(managedPatientsStorageKey, JSON.stringify(cloudData.managedPatients));
        } catch {
          // ignore
        }
      }

      if (cloudData.clinicalDetails && typeof cloudData.clinicalDetails === 'object') {
        setPatientClinicalDetails((prev) => ({
          ...prev,
          ...cloudData.clinicalDetails
        }));
        try {
          localStorage.setItem(clinicalDetailsStorageKey, JSON.stringify(cloudData.clinicalDetails));
        } catch {
          // ignore
        }
      }

      if (cloudData.facilityStatuses && typeof cloudData.facilityStatuses === 'object') {
        setFacilityStatuses((prev) => ({
          ...prev,
          ...cloudData.facilityStatuses
        }));
        try {
          localStorage.setItem(facilityStatusesStorageKey, JSON.stringify(cloudData.facilityStatuses));
        } catch {
          // ignore
        }
      }

      if (cloudData.facilityNotes && typeof cloudData.facilityNotes === 'object') {
        setFacilityNotes((prev) => ({
          ...prev,
          ...cloudData.facilityNotes
        }));
        try {
          localStorage.setItem(facilityNotesStorageKey, JSON.stringify(cloudData.facilityNotes));
        } catch {
          // ignore
        }
      }

      if (cloudData.patientStatuses && typeof cloudData.patientStatuses === 'object') {
        setPatientStatuses((prev) => ({
          ...prev,
          ...cloudData.patientStatuses
        }));
        try {
          localStorage.setItem(patientStatusesStorageKey, JSON.stringify(cloudData.patientStatuses));
        } catch {
          // ignore
        }
      }

      if (cloudData.patientNotes && typeof cloudData.patientNotes === 'object') {
        setPatientNotes((prev) => ({
          ...prev,
          ...cloudData.patientNotes
        }));
        try {
          localStorage.setItem(patientNotesStorageKey, JSON.stringify(cloudData.patientNotes));
        } catch {
          // ignore
        }
      }

      if (cloudData.submission && cloudData.submission.status) {
        setPjVerification((prev) => ({
          ...prev,
          ...cloudData.submission
        }));
        try {
          localStorage.setItem(submissionStorageKey, JSON.stringify(cloudData.submission));
        } catch {
          // ignore
        }
      }

      if (cloudData.shiftSchedule?.shift) {
        setActiveShift(cloudData.shiftSchedule.shift);
      }

      setTimeout(() => {
        isCloudIncomingRef.current = false;
      }, 500);
    });

    return () => unsubscribe();
  }, [
    currentNurse.name,
    managedPatientsStorageKey,
    clinicalDetailsStorageKey,
    facilityStatusesStorageKey,
    facilityNotesStorageKey,
    patientStatusesStorageKey,
    patientNotesStorageKey,
    submissionStorageKey
  ]);

  // 2. Debounced save to Cloud Firestore whenever nurse makes changes locally
  useEffect(() => {
    if (!currentNurse.name || currentNurse.name === '-') return;
    if (isCloudIncomingRef.current) return;

    const timer = setTimeout(() => {
      saveNurseLogbookCloud(currentNurse.name, {
        nurseName: currentNurse.name,
        managedPatients,
        clinicalDetails: patientClinicalDetails,
        facilityStatuses,
        facilityNotes,
        patientStatuses,
        patientNotes,
        submission: pjVerification,
        shiftSchedule: { shift: activeShift, date: activeDate }
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [
    currentNurse.name,
    managedPatients,
    patientClinicalDetails,
    facilityStatuses,
    facilityNotes,
    patientStatuses,
    patientNotes,
    pjVerification,
    activeShift,
    activeDate
  ]);

  // Auto-sync default verifier when masterNurses are added and submission is still belum_diajukan
  useEffect(() => {
    if (pjVerification.status !== 'belum_diajukan') return;
    if (pjVerification.targetVerifierName && pjVerification.targetVerifierName !== '-') {
      if (
        activeRole === 'pj_shift' &&
        pjVerification.targetRole === 'pj_shift' &&
        isMatchingNurse(pjVerification.targetVerifierName, currentNurse.name)
      ) {
        setPjVerification((prev) => ({
          ...prev,
          targetVerifierName: defaultOtherPjShiftNurse.name,
          targetVerifierNip: defaultOtherPjShiftNurse.nip
        }));
      }
      return;
    }

    if (
      activeRole === 'pj_shift' &&
      pjVerification.targetRole === 'kepala_ruangan' &&
      defaultKaruNurse.name === '-' &&
      defaultOtherPjShiftNurse.name !== '-'
    ) {
      setPjVerification((prev) => ({
        ...prev,
        targetRole: 'pj_shift',
        targetVerifierName: defaultOtherPjShiftNurse.name,
        targetVerifierNip: defaultOtherPjShiftNurse.nip,
        pjShiftName: defaultOtherPjShiftNurse.name,
        pjShiftNip: defaultOtherPjShiftNurse.nip
      }));
      return;
    }

    const desiredTarget =
      pjVerification.targetRole === 'kepala_ruangan' || pjVerification.targetRole === 'mandiri'
        ? activeRole === 'kepala_ruangan'
          ? currentNurse
          : defaultKaruNurse
        : activeRole === 'pj_shift'
        ? defaultOtherPjShiftNurse
        : defaultPjShiftNurse;

    if (desiredTarget.name && desiredTarget.name !== '-') {
      setPjVerification((prev) => ({
        ...prev,
        targetVerifierName: desiredTarget.name,
        targetVerifierNip: desiredTarget.nip,
        pjShiftName:
          prev.targetRole === 'pj_shift' ? desiredTarget.name : defaultPjShiftNurse.name,
        pjShiftNip:
          prev.targetRole === 'pj_shift' ? desiredTarget.nip : defaultPjShiftNurse.nip
      }));
    }
  }, [
    pjVerification.status,
    pjVerification.targetRole,
    pjVerification.targetVerifierName,
    activeRole,
    currentNurse,
    defaultKaruNurse,
    defaultPjShiftNurse,
    defaultOtherPjShiftNurse
  ]);

  // Ensure active patient is valid
  useEffect(() => {
    if (managedPatients.length === 0) {
      if (activePatientId !== '') setActivePatientId('');
    } else if (!managedPatients.some((p) => p.id === activePatientId)) {
      setActivePatientId(managedPatients[0].id);
    }
  }, [managedPatients, activePatientId]);

  const activePatient: ManagedPatient =
    managedPatients.find((p) => p.id === activePatientId) ||
    managedPatients[0] || {
      id: 'empty',
      bedNumber: masterBeds[0]?.bedNumber || 'BED A01',
      patientName: '',
      medicalRecord: ''
    };

  const activeClinical: PatientLogbookClinicalDetails =
    patientClinicalDetails[activePatient.id] || createDefaultPatientClinicalDetails('new');

  // Helper to update status + note for a specific patient item
  const syncPatientStatusAndNote = (
    patientId: string,
    code: string,
    isChecked: boolean,
    noteText: string
  ) => {
    setPatientStatuses((prev) => ({
      ...prev,
      [patientId]: {
        ...(prev[patientId] || {}),
        [code]: isChecked
      }
    }));
    setPatientNotes((prev) => ({
      ...prev,
      [patientId]: {
        ...(prev[patientId] || {}),
        [code]: noteText
      }
    }));
  };

  // Update Poin 2.1 structured checklist
  const updatePoin2_1 = (nextPoin2_1: Poin2_1ClinicalData) => {
    if (managedPatients.length === 0) return;
    const patId = activePatient.id;
    setPatientClinicalDetails((prev) => ({
      ...prev,
      [patId]: {
        ...(prev[patId] || createDefaultPatientClinicalDetails('new')),
        poin2_1: nextPoin2_1
      }
    }));
    const counts = getPoin2_1Counts(nextPoin2_1);
    syncPatientStatusAndNote(patId, '2.1', counts.isComplete, formatPoin2_1Note(nextPoin2_1));
  };

  // Helper functions for Patient Management
  const handleAddPatient = (fromMaster?: MasterPatient) => {
    if (managedPatients.length >= 4) {
      showToast('Batas maksimum 4 pasien kelolaan per perawat telah tercapai.');
      return;
    }

    if (
      fromMaster &&
      managedPatients.some(
        (p) =>
          (fromMaster.medicalRecordNumber &&
            p.medicalRecord === fromMaster.medicalRecordNumber) ||
          p.patientName === fromMaster.patientName
      )
    ) {
      showToast(`Pasien ${fromMaster.patientName} sudah ada dalam daftar kelolaan shift ini.`);
      return;
    }

    const usedBeds = new Set(managedPatients.map((p) => p.bedNumber));
    const isIsolationPatient = Boolean(fromMaster && fromMaster.category !== 'reguler');
    const activeBeds = masterBeds.filter((b) => b.status !== 'maintenance');
    const prioritizedBeds =
      activeBeds.length > 0
        ? [
            ...activeBeds.filter((b) =>
              isIsolationPatient ? b.designation !== 'reguler' : b.designation === 'reguler'
            ),
            ...activeBeds.filter((b) =>
              isIsolationPatient ? b.designation === 'reguler' : b.designation !== 'reguler'
            )
          ].map((b) => b.bedNumber)
        : Array.from({ length: 12 }, (_, i) => `BED A${String(i + 1).padStart(2, '0')}`);
    const nextBed =
      prioritizedBeds.find((b) => !usedBeds.has(b)) ||
      `BED A${String(managedPatients.length + 1).padStart(2, '0')}`;

    const nextIdx = managedPatients.length + 1;
    const newId = `p${Date.now()}`;
    const newPatient: ManagedPatient = {
      id: newId,
      bedNumber: nextBed,
      patientName: fromMaster?.patientName || '',
      medicalRecord: fromMaster?.medicalRecordNumber || ''
    };

    const newClinical = createDefaultPatientClinicalDetails('new');

    setManagedPatients((prev) => [...prev, newPatient]);
    setPatientClinicalDetails((prev) => ({
      ...prev,
      [newId]: newClinical
    }));
    setActivePatientId(newId);

    setPatientStatuses((prev) => {
      const copy = { ...prev };
      copy[newId] = {};
      OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian >= 2 && it.bagian <= 6).forEach((it) => {
        copy[newId][it.code] = false;
      });
      return copy;
    });

    setPatientNotes((prev) => ({
      ...prev,
      [newId]: {}
    }));

    showToast(
      fromMaster
        ? `Pasien ${fromMaster.patientName} ditambahkan ke ${nextBed}.`
        : `Slot pasien kelolaan ke-${nextIdx} (${nextBed}) berhasil ditambahkan.`
    );
  };

  const handleRemovePatient = (idToRemove: string) => {
    setManagedPatients((prev) => prev.filter((p) => p.id !== idToRemove));
    showToast('Pasien telah dihapus dari daftar kelolaan shift.');
  };

  const handleUpdatePatientById = (
    targetPatientId: string,
    field: 'bedNumber' | 'patientName' | 'medicalRecord',
    value: string
  ) => {
    const targetPat = managedPatients.find((p) => p.id === targetPatientId);
    if (!targetPat) return;

    const nextName = field === 'patientName' ? value : targetPat.patientName;
    const nextMrn = field === 'medicalRecord' ? value : targetPat.medicalRecord;

    setManagedPatients((prev) =>
      prev.map((p) => (p.id === targetPatientId ? { ...p, [field]: value } : p))
    );

    if (field === 'patientName' || field === 'medicalRecord') {
      const patClin =
        patientClinicalDetails[targetPatientId] || createDefaultPatientClinicalDetails('new');
      const note = formatPoin3_1Note(patClin.poin3_1, nextName, nextMrn);
      setPatientNotes((prev) => ({
        ...prev,
        [targetPatientId]: {
          ...(prev[targetPatientId] || {}),
          '3.1': note
        }
      }));
    }
  };

  const handleUpdateActivePatient = (
    field: 'bedNumber' | 'patientName' | 'medicalRecord',
    value: string
  ) => {
    handleUpdatePatientById(activePatient.id, field, value);
  };

  const handleSelectMasterPatientForSlot = (targetPatientId: string, masterPatientId: string) => {
    if (!masterPatientId) {
      setManagedPatients((prev) =>
        prev.map((p) =>
          p.id === targetPatientId
            ? {
                ...p,
                patientName: '',
                medicalRecord: ''
              }
            : p
        )
      );
      return;
    }

    const found =
      scheduledMasterPatients.find((mp) => mp.id === masterPatientId) ||
      masterPatients.find((mp) => mp.id === masterPatientId);
    if (!found) return;

    const alreadyInOtherBed = managedPatients.find(
      (p) =>
        p.id !== targetPatientId &&
        ((found.medicalRecordNumber && p.medicalRecord === found.medicalRecordNumber) ||
          p.patientName === found.patientName)
    );
    if (alreadyInOtherBed) {
      showToast(
        `Pasien ${found.patientName} sudah dipilih pada ${alreadyInOtherBed.bedNumber}.`
      );
      return;
    }

    setManagedPatients((prev) =>
      prev.map((p) =>
        p.id === targetPatientId
          ? {
              ...p,
              patientName: found.patientName,
              medicalRecord: found.medicalRecordNumber
            }
          : p
      )
    );

    const patClin =
      patientClinicalDetails[targetPatientId] || createDefaultPatientClinicalDetails('new');
    const note = formatPoin3_1Note(
      patClin.poin3_1,
      found.patientName,
      found.medicalRecordNumber
    );
    setPatientNotes((prev) => ({
      ...prev,
      [targetPatientId]: {
        ...(prev[targetPatientId] || {}),
        '3.1': note
      }
    }));
  };

  const handleSelectMasterPatient = (masterPatientId: string) => {
    handleSelectMasterPatientForSlot(activePatient.id, masterPatientId);
  };

  // Copy current active patient's SPO checklists to all managed patients
  const handleCopyCurrentChecksToAllPatients = () => {
    const currentChecks = patientStatuses[activePatient.id] || {};
    const currentPoin2_1 = activeClinical.poin2_1;

    setPatientStatuses((prev) => {
      const next = { ...prev };
      managedPatients.forEach((p) => {
        next[p.id] = { ...currentChecks };
      });
      return next;
    });

    setPatientClinicalDetails((prev) => {
      const next = { ...prev };
      managedPatients.forEach((p) => {
        const existing = next[p.id] || createDefaultPatientClinicalDetails('new');
        next[p.id] = {
          ...existing,
          poin2_1: normalizePoin2_1Data(currentPoin2_1)
        };
      });
      return next;
    });

    setPatientNotes((prev) => {
      const next = { ...prev };
      const poin2_1Note = formatPoin2_1Note(currentPoin2_1);
      managedPatients.forEach((p) => {
        next[p.id] = {
          ...(next[p.id] || {}),
          '2.1': poin2_1Note
        };
      });
      return next;
    });

    showToast(
      `Checklist dari ${activePatient.bedNumber} berhasil disalin ke seluruh ${managedPatients.length} pasien kelolaan.`,
      3000
    );
  };

  // Toggle item status (default false / Belum Dilaksanakan)
  const handleToggleItem = (code: string) => {
    if (selectedBagian === 1) {
      setFacilityStatuses((prev) => ({
        ...prev,
        [code]: !Boolean(prev[code])
      }));
      return;
    }

    const currentlyChecked = Boolean(
      patientStatuses[activePatient.id] && patientStatuses[activePatient.id][code]
    );
    const nextChecked = !currentlyChecked;

    if (code === '2.1') {
      updatePoin2_1(setAllPoin2_1(nextChecked));
      return;
    }

    setPatientStatuses((prev) => {
      const patChecks = prev[activePatient.id] || {};
      return {
        ...prev,
        [activePatient.id]: {
          ...patChecks,
          [code]: nextChecked
        }
      };
    });
  };

  // Update optional item note (Bagian I facility or Bagian II-VI patient)
  const handleUpdateItemNote = (code: string, nextNote: string) => {
    if (selectedBagian === 1) {
      setFacilityNotes((prev) => ({
        ...prev,
        [code]: nextNote
      }));
      return;
    }
    if (managedPatients.length === 0) return;
    setPatientNotes((prev) => ({
      ...prev,
      [activePatient.id]: {
        ...(prev[activePatient.id] || {}),
        [code]: nextNote
      }
    }));
  };

  // Bulk set or reset all SPO items in a specific Bagian (1–6)
  const handleSetBagianChecklists = (bagianNum: number, checked: boolean) => {
    const items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === bagianNum);
    if (bagianNum === 1) {
      const nextFac: Record<string, boolean> = {};
      items.forEach((it) => {
        nextFac[it.code] = checked;
      });
      setFacilityStatuses((prev) => ({ ...prev, ...nextFac }));
      showToast(
        checked
          ? 'Seluruh checklist Bagian I ditandai DILAKSANAKAN.'
          : 'Checklist Bagian I direset ke Belum Dilaksanakan.'
      );
      return;
    }

    if (managedPatients.length === 0) return;
    const patId = activePatient.id;

    setPatientStatuses((prev) => {
      const patChecks = { ...(prev[patId] || {}) };
      items.forEach((it) => {
        patChecks[it.code] = checked;
      });
      return {
        ...prev,
        [patId]: patChecks
      };
    });

    if (bagianNum === 2) {
      setPatientClinicalDetails((prev) => ({
        ...prev,
        [patId]: {
          ...(prev[patId] || createDefaultPatientClinicalDetails('new')),
          poin2_1: setAllPoin2_1(checked)
        }
      }));
    }

    showToast(
      checked
        ? `Seluruh checklist Bagian ${bagianNum} (${activePatient.bedNumber}) ditandai DILAKSANAKAN.`
        : `Checklist Bagian ${bagianNum} (${activePatient.bedNumber}) direset ke Belum Dilaksanakan.`
    );
  };

  // Reset ALL checklists across Bagian I–VI back to empty (Belum Dilaksanakan)
  const handleResetAllChecklists = () => {
    setFacilityStatuses({
      '1.1': false,
      '1.2': false,
      '1.3': false
    });
    setFacilityNotes({
      '1.1': '',
      '1.2': '',
      '1.3': ''
    });

    setPatientStatuses(buildDefaultStatusesForPatients(managedPatients));
    setPatientClinicalDetails(buildInitialClinicalDetailsMap(managedPatients));
    setPatientNotes(buildDefaultNotesForPatients(managedPatients));

    if (pjVerification.status === 'belum_diajukan') {
      setPjVerification((prev) => ({
        ...prev,
        declarationChecked: false
      }));
    }

    showToast('Seluruh checklist logbook telah direset ke keadaan Belum Dilaksanakan.');
  };

  // Bed options derived from Master Data (if available) + fallback
  const baseBedOptions = React.useMemo(() => {
    return masterBeds.length > 0
      ? masterBeds.map((b) => b.bedNumber)
      : [
          ...Array.from({ length: 12 }, (_, i) => `BED A${String(i + 1).padStart(2, '0')}`),
          ...Array.from({ length: 9 }, (_, i) => `BED B${String(i + 1).padStart(2, '0')}`),
          ...Array.from({ length: 8 }, (_, i) => `BED C${String(i + 1).padStart(2, '0')}`),
          ...Array.from({ length: 3 }, (_, i) => `BED D${String(i + 1).padStart(2, '0')}`),
          ...Array.from({ length: 2 }, (_, i) => `BED E${String(i + 1).padStart(2, '0')}`),
          ...Array.from({ length: 2 }, (_, i) => `BED F${String(i + 1).padStart(2, '0')}`),
          ...Array.from({ length: 4 }, (_, i) => `BED ISOLASI ${String(i + 1).padStart(2, '0')}`)
        ];
  }, [masterBeds]);

  const availableBedOptions = React.useMemo(() => {
    if (activePatient.bedNumber && !baseBedOptions.includes(activePatient.bedNumber)) {
      return [activePatient.bedNumber, ...baseBedOptions];
    }
    return baseBedOptions;
  }, [baseBedOptions, activePatient.bedNumber]);

  // Stats computation
  const getBagianItems = (bagianNum: number) => {
    return OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === bagianNum);
  };

  const getPatientBagianStats = (bagianNum: number, patientId: string) => {
    const items = getBagianItems(bagianNum);
    const checks = patientStatuses[patientId] || {};
    const total = items.length;
    const completed = items.filter((it) => Boolean(checks[it.code])).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pct, items };
  };

  const getAggregatePatientBagianStats = (bagianNum: number) => {
    const items = getBagianItems(bagianNum);
    if (managedPatients.length === 0) {
      return {
        perPatientCount: items.length,
        total: items.length,
        completed: 0,
        pct: 0
      };
    }

    let total = 0;
    let completed = 0;
    managedPatients.forEach((pat) => {
      const checks = patientStatuses[pat.id] || {};
      total += items.length;
      completed += items.filter((it) => Boolean(checks[it.code])).length;
    });
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      perPatientCount: items.length,
      total,
      completed,
      pct
    };
  };

  const getFacilityBagianStats = () => {
    const items = getBagianItems(1);
    const total = items.length;
    const completed = items.filter((it) => Boolean(facilityStatuses[it.code])).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pct, items };
  };

  const overallShiftStats = React.useMemo(() => {
    const fac = getFacilityBagianStats();
    let total = fac.total;
    let completed = fac.completed;

    const perPatient = managedPatients.map((pat) => {
      const b2 = getPatientBagianStats(2, pat.id);
      const b3 = getPatientBagianStats(3, pat.id);
      const b4 = getPatientBagianStats(4, pat.id);
      const b5 = getPatientBagianStats(5, pat.id);
      const b6 = getPatientBagianStats(6, pat.id);
      const patTotal = b2.total + b3.total + b4.total + b5.total + b6.total;
      const patCompleted =
        b2.completed + b3.completed + b4.completed + b5.completed + b6.completed;
      const patPct = patTotal > 0 ? Math.round((patCompleted / patTotal) * 100) : 0;
      total += patTotal;
      completed += patCompleted;
      return {
        patient: pat,
        b2,
        b3,
        b4,
        b5,
        b6,
        total: patTotal,
        completed: patCompleted,
        pct: patPct
      };
    });

    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { facility: fac, perPatient, total, completed, pct };
  }, [facilityStatuses, patientStatuses, managedPatients]);

  // Options for PJ Shift & Kepala Ruang selectors in Bagian VII
  const pjShiftOptions = React.useMemo(() => {
    const list: { name: string; nip: string; shift?: string }[] = [];
    const addUnique = (name: string, nip: string, shift?: string) => {
      if (name && name !== '-' && !list.some((item) => isMatchingNurse(item.name, name))) {
        list.push({ name, nip: nip || '-', shift });
      }
    };
    addUnique(defaultPjShiftNurse.name, defaultPjShiftNurse.nip);
    masterNurses
      .filter(
        (n) =>
          (n.role === 'pj_shift' || n.systemAccess === 'pj_shift') && n.accountStatus !== 'nonaktif'
      )
      .forEach((n) => addUnique(n.name, n.nip, n.shiftAssigned));
    return list;
  }, [defaultPjShiftNurse, masterNurses]);

  const kepalaRuangOptions = React.useMemo(() => {
    const list: { name: string; nip: string }[] = [];
    const addUnique = (name: string, nip: string) => {
      if (name && name !== '-' && !list.some((item) => isMatchingNurse(item.name, name))) {
        list.push({ name, nip: nip || '-' });
      }
    };
    addUnique(defaultKaruNurse.name, defaultKaruNurse.nip);
    masterNurses
      .filter(
        (n) =>
          (n.role === 'kepala_ruangan' || n.systemAccess === 'kepala_ruangan') &&
          n.accountStatus !== 'nonaktif'
      )
      .forEach((n) => addUnique(n.name, n.nip));
    return list;
  }, [defaultKaruNurse, masterNurses]);

  const formatNowWib = () => {
    return formatCurrentWibTimestamp(activeDate);
  };

  const handleSubmitVerification = () => {
    if (managedPatients.length === 0) {
      showToast(
        'Tambahkan minimal 1 pasien kelolaan pada Bagian II–VI sebelum mengajukan verifikasi.',
        3200
      );
      return;
    }
    if (managedPatients.some((p) => !p.patientName.trim())) {
      showToast('Lengkapi nama pasien kelolaan pada Bagian II–VI terlebih dahulu.', 3200);
      return;
    }
    if (!pjVerification.declarationChecked) {
      showToast('Harap centang pernyataan kelengkapan pengisian SPO terlebih dahulu.');
      return;
    }
    const timestamp = formatNowWib();

    const resolvedTargetRole: 'pj_shift' | 'kepala_ruangan' =
      activeRole === 'perawat_pelaksana'
        ? 'pj_shift'
        : pjVerification.targetRole === 'pj_shift'
        ? 'pj_shift'
        : 'kepala_ruangan';

    const cleanVerifierCandidate =
      pjVerification.targetVerifierName && pjVerification.targetVerifierName !== '-'
        ? pjVerification.targetVerifierName
        : '';

    const resolvedTargetName =
      resolvedTargetRole === 'kepala_ruangan'
        ? activeRole === 'kepala_ruangan'
          ? currentNurse.name
          : cleanVerifierCandidate || defaultKaruNurse.name
        : activeRole === 'pj_shift'
        ? cleanVerifierCandidate && !isMatchingNurse(cleanVerifierCandidate, currentNurse.name)
          ? cleanVerifierCandidate
          : defaultOtherPjShiftNurse.name
        : cleanVerifierCandidate || defaultPjShiftNurse.name;

    if (!resolvedTargetName || resolvedTargetName === '-') {
      if (activeRole === 'pj_shift' && resolvedTargetRole === 'pj_shift') {
        showToast(
          'Belum ada akun PJ Shift lainnya yang terdaftar di Data Perawat. Pilih tujuan Kepala Ruang atau tambahkan akun PJ Shift lain terlebih dahulu.',
          3600
        );
      } else if (resolvedTargetRole === 'kepala_ruangan') {
        showToast(
          'Belum ada akun Kepala Ruang yang terdaftar di Data Perawat. Tambahkan akun Kepala Ruang atau pilih tujuan PJ Shift lainnya.',
          3600
        );
      } else {
        showToast(
          'Belum ada akun PJ Shift yang terdaftar di Data Perawat. Tambahkan akun PJ Shift melalui Administrator terlebih dahulu.',
          3600
        );
      }
      return;
    }

    if (
      activeRole === 'pj_shift' &&
      resolvedTargetRole === 'pj_shift' &&
      isMatchingNurse(resolvedTargetName, currentNurse.name)
    ) {
      showToast(
        'PJ Shift tidak dapat mengajukan verifikasi kepada diri sendiri. Silakan pilih PJ Shift lainnya atau Kepala Ruang.',
        3500
      );
      return;
    }

    const resolvedTargetNip =
      resolvedTargetRole === 'kepala_ruangan'
        ? activeRole === 'kepala_ruangan'
          ? currentNurse.nip
          : pjVerification.targetVerifierNip && pjVerification.targetVerifierNip !== '-'
          ? pjVerification.targetVerifierNip
          : defaultKaruNurse.nip
        : activeRole === 'pj_shift'
        ? otherPjShiftOptions.find((opt) => isMatchingNurse(opt.name, resolvedTargetName))?.nip ||
          defaultOtherPjShiftNurse.nip
        : pjVerification.targetVerifierNip && pjVerification.targetVerifierNip !== '-'
        ? pjVerification.targetVerifierNip
        : defaultPjShiftNurse.nip;

    const updatedSub: PjVerificationSubmission = {
      ...pjVerification,
      submittedNurseName: currentNurse.name,
      submittedNurseNip: currentNurse.nip,
      submittedNurseRole: activeRole,
      targetRole: resolvedTargetRole,
      targetVerifierName: resolvedTargetName,
      targetVerifierNip: resolvedTargetNip,
      pjShiftName:
        resolvedTargetRole === 'pj_shift' ? resolvedTargetName : defaultPjShiftNurse.name,
      status: 'diajukan',
      submittedAt: timestamp,
      verifiedAt: undefined,
      verifiedBy: undefined,
      verifiedByRole: undefined,
      verifierNotes: undefined
    };

    setPjVerification(updatedSub);

    try {
      const rawPerPat = localStorage.getItem(PER_PATIENT_STATUS_STORAGE_KEY);
      if (rawPerPat) {
        const perPat = JSON.parse(rawPerPat);
        if (perPat && typeof perPat === 'object') {
          managedPatients.forEach((p) => {
            const k1 = buildPatientVerificationKey(currentNurse.name, p.bedNumber, p.medicalRecord);
            const k2 = buildPatientVerificationKey(currentNurse.name, p.bedNumber, '0');
            if (perPat[k1] && perPat[k1].status !== 'terverifikasi') {
              delete perPat[k1];
            }
            if (perPat[k2] && perPat[k2].status !== 'terverifikasi') {
              delete perPat[k2];
            }
          });
          localStorage.setItem(PER_PATIENT_STATUS_STORAGE_KEY, JSON.stringify(perPat));
        }
      }
    } catch {
      // ignore
    }

    upsertVerificationRegistryEntry({
      id: pjVerification.id || `sub-${activeRole}-${getNurseStorageKey(currentNurse.name)}`,
      submittedNurseName: currentNurse.name,
      submittedNurseNip: currentNurse.nip,
      submittedNurseRole: activeRole,
      targetRole: resolvedTargetRole,
      targetVerifierName: resolvedTargetName,
      targetVerifierNip: resolvedTargetNip,
      status: 'diajukan',
      shift: activeShift,
      submittedAt: timestamp,
      verifiedAt: undefined,
      verifiedBy: undefined,
      verifiedByRole: undefined,
      pelaksanaNotes: pjVerification.notes,
      verifierNotes: '',
      facilityCompleted: overallShiftStats.facility.completed,
      facilityTotal: overallShiftStats.facility.total,
      patients: managedPatients
    });

    if (onSyncNurseSessions) {
      onSyncNurseSessions(currentNurse.name, managedPatients, {
        status: 'diajukan'
      });
    }

    if (resolvedTargetRole === 'kepala_ruangan') {
      showToast(
        activeRole === 'kepala_ruangan'
          ? `Pengajuan verifikasi berhasil dikirim ke halaman Verifikasi Kepala Ruang (${resolvedTargetName}).`
          : `Pengajuan verifikasi berhasil dikirim kepada Kepala Ruang (${resolvedTargetName}).`,
        3200
      );
    } else {
      showToast(
        activeRole === 'pj_shift'
          ? `Pengajuan verifikasi berhasil dikirim kepada PJ Shift lainnya (${resolvedTargetName}).`
          : `Pengajuan verifikasi berhasil dikirim kepada PJ Shift (${resolvedTargetName}).`,
        3200
      );
    }
  };

  const handleCancelVerificationSubmission = () => {
    const resetSub: PjVerificationSubmission = {
      ...pjVerification,
      status: 'belum_diajukan',
      submittedAt: undefined,
      verifiedAt: undefined,
      verifiedBy: undefined,
      verifiedByRole: undefined,
      verifierNotes: undefined
    };
    setPjVerification(resetSub);

    try {
      const rawPerPat = localStorage.getItem(PER_PATIENT_STATUS_STORAGE_KEY);
      if (rawPerPat) {
        const perPat = JSON.parse(rawPerPat);
        if (perPat && typeof perPat === 'object') {
          managedPatients.forEach((p) => {
            const k1 = buildPatientVerificationKey(currentNurse.name, p.bedNumber, p.medicalRecord);
            const k2 = buildPatientVerificationKey(currentNurse.name, p.bedNumber, '0');
            delete perPat[k1];
            delete perPat[k2];
          });
          localStorage.setItem(PER_PATIENT_STATUS_STORAGE_KEY, JSON.stringify(perPat));
        }
      }
    } catch {
      // ignore
    }

    upsertVerificationRegistryEntry({
      id: pjVerification.id || `sub-${activeRole}-${getNurseStorageKey(currentNurse.name)}`,
      submittedNurseName: currentNurse.name,
      submittedNurseNip: currentNurse.nip,
      submittedNurseRole: activeRole,
      targetRole:
        pjVerification.targetRole || (activeRole === 'pj_shift' ? 'kepala_ruangan' : 'pj_shift'),
      targetVerifierName: pjVerification.targetVerifierName || defaultPjShiftNurse.name,
      targetVerifierNip: pjVerification.targetVerifierNip,
      status: 'belum_diajukan',
      shift: activeShift,
      submittedAt: undefined,
      verifiedAt: undefined,
      verifiedBy: undefined,
      verifiedByRole: undefined,
      verifierNotes: undefined,
      pelaksanaNotes: pjVerification.notes,
      patients: managedPatients
    });

    if (onSyncNurseSessions) {
      onSyncNurseSessions(currentNurse.name, managedPatients, {
        status: 'belum_diajukan'
      });
    }

    showToast('Pengajuan verifikasi ditarik kembali untuk pembaruan data.');
  };

  const bagian7RoleTitle =
    activeRole === 'pj_shift'
      ? 'Pengajuan Verifikasi kepada Kepala Ruang atau PJ Shift Lainnya'
      : activeRole === 'kepala_ruangan'
      ? 'Pengajuan Verifikasi kepada PJ Shift atau Kepala Ruang'
      : 'Pengajuan Verifikasi kepada PJ Shift';

  const bagian7RoleSubtitle =
    activeRole === 'pj_shift'
      ? 'Pemeriksaan kelengkapan SPO Bagian I–VI pasien kelolaan PJ Shift dan pengajuan verifikasi kepada Kepala Ruang atau PJ Shift lainnya.'
      : activeRole === 'kepala_ruangan'
      ? 'Pemeriksaan kelengkapan SPO Bagian I–VI pasien kelolaan Kepala Ruang dan pengajuan verifikasi kepada PJ Shift atau Kepala Ruang.'
      : 'Pemeriksaan kelengkapan SPO Bagian I–VI seluruh pasien kelolaan dan pengajuan verifikasi kepada PJ Shift.';

  const targetVerifierLabel =
    pjVerification.targetRole === 'kepala_ruangan' || pjVerification.targetRole === 'mandiri'
      ? `Kepala Ruang: ${pjVerification.targetVerifierName || defaultKaruNurse.name}`
      : activeRole === 'pj_shift'
      ? `PJ Shift Lainnya: ${pjVerification.targetVerifierName || defaultOtherPjShiftNurse.name}`
      : `PJ Shift: ${pjVerification.targetVerifierName || defaultPjShiftNurse.name}`;

  const activeMeta = selectedBagian ? BAGIAN_METAS.find((m) => m.num === selectedBagian) : null;
  const poin2_1Counts = getPoin2_1Counts(activeClinical.poin2_1);

  // Remaining scheduled patients not yet selected in managedPatients
  const unselectedScheduledPatients = React.useMemo(() => {
    return scheduledMasterPatients.filter(
      (mp) =>
        !managedPatients.some(
          (p) =>
            (mp.medicalRecordNumber && p.medicalRecord === mp.medicalRecordNumber) ||
            p.patientName === mp.patientName
        )
    );
  }, [scheduledMasterPatients, managedPatients]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#0e7876] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 border border-white/30">
          <CheckCircle2 className="w-4 h-4 text-emerald-100 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION HEADER: LOGBOOK + KONTROL SHIFT & RESET                           */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-[19px] sm:text-[21px] font-extrabold text-[#1c3144] tracking-tight uppercase">
            LOGBOOK
          </h2>
          <p className="mt-0.5 text-xs text-slate-700 tabular-nums">
            Hari {activeDayName} &middot; Shift {activeShift} (
            {activeShift === 'Siang' ? '14.00–21.00' : '07.00–14.00'} WIB) &middot; Capaian SPO
            Shift:{' '}
            <strong className="font-semibold text-slate-950">
              {overallShiftStats.completed}/{overallShiftStats.total} ({overallShiftStats.pct}%)
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Segmented Shift Selector: Pagi | Siang */}
          <div
            role="group"
            aria-label="Pemilihan Jadwal Shift"
            className="inline-flex items-center gap-1 p-1 bg-white/82 backdrop-blur-xs rounded-xl border border-white/90 shadow-2xs"
          >
            <button
              type="button"
              onClick={() => handleSelectShiftSchedule('Pagi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                activeShift === 'Pagi'
                  ? 'bg-[#19588f] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/70'
              }`}
            >
              <Sun className="w-3.5 h-3.5 shrink-0" />
              <span>Shift Pagi (07.00–14.00)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectShiftSchedule('Siang')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                activeShift === 'Siang'
                  ? 'bg-[#19588f] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/70'
              }`}
            >
              <Sunset className="w-3.5 h-3.5 shrink-0" />
              <span>Shift Siang (14.00–21.00)</span>
            </button>
          </div>

          {/* Reset Semua Checklist Button */}
          <button
            type="button"
            onClick={handleResetAllChecklists}
            className="px-3 py-2 rounded-xl bg-white/82 hover:bg-white text-slate-700 border border-white/90 shadow-2xs text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Reset seluruh checklist SPO ke keadaan kosong (Belum Dilaksanakan)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Reset Checklist</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PANEL PASIEN KELOLAAN SHIFT INI (MAKSIMAL 4 PASIEN)                       */}
      {/* ========================================================================= */}
      <div className="rounded-[14px] bg-white/84 backdrop-blur-xs border border-white/90 shadow-[0_6px_18px_rgba(14,42,74,0.08)] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h3 className="text-[14.5px] sm:text-[15.5px] font-bold text-slate-950">
                Pasien Kelolaan Shift {activeShift}
              </h3>
              <span className="text-slate-400" aria-hidden="true">
                &middot;
              </span>
              <span className="text-xs font-semibold text-[#19588f] tabular-nums">
                {managedPatients.length}/4 Pasien
              </span>
              <span className="text-slate-400" aria-hidden="true">
                &middot;
              </span>
              <span className="text-xs text-slate-600 tabular-nums">
                Terjadwal Hari {activeDayName} Shift {activeShift}:{' '}
                <strong className="font-semibold text-slate-900">
                  {scheduledMasterPatients.length} pasien
                </strong>
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Pilih pasien sesuai jadwal aktif untuk mengisi indikator SPO Bagian II–VI (maksimal 4
              pasien kelolaan per perawat).
            </p>
          </div>

          {managedPatients.length < 4 && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value=""
                onChange={(e) => {
                  const found = scheduledMasterPatients.find((mp) => mp.id === e.target.value);
                  if (found) {
                    handleAddPatient(found);
                  }
                }}
                disabled={unselectedScheduledPatients.length === 0}
                aria-label="Pilih pasien dari jadwal aktif"
                className="w-full sm:w-64 bg-white hover:bg-slate-50/80 disabled:opacity-65 text-slate-900 text-xs font-semibold border border-slate-300/90 focus:border-[#19588f] rounded-xl px-3 py-2 focus:outline-hidden tabular-nums cursor-pointer"
              >
                <option value="">
                  {unselectedScheduledPatients.length > 0
                    ? `+ Pilih Pasien ${activeDayName} ${activeShift} (${unselectedScheduledPatients.length})`
                    : scheduledMasterPatients.length > 0
                    ? 'Semua pasien jadwal ini sudah dipilih'
                    : `Tidak ada pasien jadwal ${activeDayName} ${activeShift}`}
                </option>
                {unselectedScheduledPatients.map((mp) => (
                  <option key={mp.id} value={mp.id}>
                    {mp.patientName} (RM: {mp.medicalRecordNumber})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleAddPatient()}
                className="px-3 py-2 bg-[#19588f] hover:bg-[#144775] text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Tambah Slot Bed</span>
              </button>
            </div>
          )}
        </div>

        {managedPatients.length === 0 ? (
          <div className="pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Belum ada pasien kelolaan dipilih pada shift ini. Bagian I (Fasilitas &amp; RO) dapat
              langsung diisi untuk unit, lalu pilih pasien di atas untuk Bagian II–VI.
            </span>
          </div>
        ) : (
          <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {overallShiftStats.perPatient.map((row, idx) => {
              const pat = row.patient;
              const isSelected = pat.id === activePatient.id;

              return (
                <div
                  key={pat.id}
                  onClick={() => setActivePatientId(pat.id)}
                  className={`rounded-xl border px-3.5 py-2.5 transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#e8f3fb]/90 border-[#19588f]/60 ring-1 ring-[#19588f]/20'
                      : 'bg-white/90 hover:bg-white border-slate-200/90'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 tabular-nums flex-wrap">
                        <span className="font-mono text-[#19588f]">#{idx + 1}</span>
                        <span>&middot;</span>
                        <select
                          value={pat.bedNumber}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleUpdatePatientById(pat.id, 'bedNumber', e.target.value)
                          }
                          aria-label={`Pilih mesin/bed untuk pasien #${idx + 1}`}
                          className="bg-slate-100/90 hover:bg-white text-slate-900 font-bold text-[11px] border border-slate-300/90 rounded-md px-1.5 py-0.5 focus:outline-hidden focus:border-[#19588f] cursor-pointer tabular-nums"
                        >
                          {!baseBedOptions.includes(pat.bedNumber) && pat.bedNumber && (
                            <option value={pat.bedNumber}>{pat.bedNumber}</option>
                          )}
                          {baseBedOptions.map((bedOpt) => {
                            const usedOther = managedPatients.some(
                              (other) => other.id !== pat.id && other.bedNumber === bedOpt
                            );
                            return (
                              <option key={bedOpt} value={bedOpt} disabled={usedOther}>
                                {bedOpt}
                              </option>
                            );
                          })}
                        </select>
                        {pat.medicalRecord && (
                          <>
                            <span>&middot;</span>
                            <span className="font-mono text-slate-500">RM {pat.medicalRecord}</span>
                          </>
                        )}
                      </div>

                      {pat.patientName ? (
                        <p className="mt-0.5 text-xs sm:text-[13px] font-bold text-slate-950 truncate">
                          {pat.patientName}
                        </p>
                      ) : (
                        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                          <select
                            value=""
                            onChange={(e) =>
                              handleSelectMasterPatientForSlot(pat.id, e.target.value)
                            }
                            aria-label={`Pilih pasien untuk ${pat.bedNumber}`}
                            className="w-full bg-slate-50 text-slate-800 text-[11px] font-semibold border border-slate-300 rounded-lg px-2 py-1 focus:outline-hidden focus:border-[#19588f]"
                          >
                            <option value="">-- Pilih Nama Pasien --</option>
                            {scheduledMasterPatients.map((mp) => {
                              const usedElsewhere = managedPatients.some(
                                (other) =>
                                  other.id !== pat.id &&
                                  ((mp.medicalRecordNumber &&
                                    other.medicalRecord === mp.medicalRecordNumber) ||
                                    other.patientName === mp.patientName)
                              );
                              return (
                                <option key={mp.id} value={mp.id} disabled={usedElsewhere}>
                                  {mp.patientName} ({mp.medicalRecordNumber})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePatient(pat.id);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                      title={`Hapus ${pat.bedNumber} dari kelolaan shift`}
                      aria-label={`Hapus ${pat.bedNumber}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-[11px] tabular-nums">
                    <span
                      className={`font-semibold ${
                        row.pct === 100
                          ? 'text-[#0e7876]'
                          : row.completed > 0
                          ? 'text-[#19588f]'
                          : 'text-slate-500'
                      }`}
                    >
                      {row.completed}/{row.total} SPO ({row.pct}%)
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePatientId(pat.id);
                        setSelectedBagian(2);
                      }}
                      className="font-semibold text-[#19588f] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Isi SPO &rarr;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DAFTAR 7 BAGIAN LOGBOOK (BAGIAN I – BAGIAN VII)                           */}
      {/* ========================================================================= */}
      <div className="space-y-2.5">
        {BAGIAN_METAS.map((bagian) => {
          const IconComponent = bagian.icon;

          const isFacility = bagian.num === 1;
          const isVerification = bagian.num === 7;
          const facStats = isFacility ? getFacilityBagianStats() : null;
          const aggPatStats = bagian.isPatientSpecific
            ? getAggregatePatientBagianStats(bagian.num)
            : null;

          const stats = isVerification
            ? {
                total: overallShiftStats.total,
                completed: overallShiftStats.completed,
                pct: overallShiftStats.pct
              }
            : isFacility && facStats
            ? {
                total: facStats.total,
                completed: facStats.completed,
                pct: facStats.pct
              }
            : {
                total: aggPatStats?.total || 0,
                completed: aggPatStats?.completed || 0,
                pct: aggPatStats?.pct || 0
              };

          const isComplete = isVerification
            ? pjVerification.status === 'terverifikasi'
            : bagian.isPatientSpecific
            ? managedPatients.length > 0 && stats.total > 0 && stats.completed === stats.total
            : stats.total > 0 && stats.completed === stats.total;

          return (
            <button
              key={bagian.num}
              type="button"
              onClick={() => setSelectedBagian(bagian.num)}
              className="w-full text-left rounded-[14px] bg-white/86 hover:bg-white/96 backdrop-blur-xs border border-white/90 hover:border-[#22749b]/45 px-4 sm:px-5 py-3.5 sm:py-4 shadow-[0_6px_18px_rgba(14,42,74,0.07)] transition-colors duration-150 cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-5"
            >
              {/* Left: Icon + Editorial Kicker + Title + Subtitle */}
              <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 flex-1 min-w-0">
                <div
                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isComplete
                      ? 'bg-[#118f8d]/14 text-[#0e7876]'
                      : 'bg-[#22749b]/12 text-[#19588f]'
                  }`}
                >
                  <IconComponent className="w-5 h-5 sm:w-[22px] sm:h-[22px]" />
                </div>

                <div className="min-w-0 flex-1 space-y-0.5">
                  {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 tabular-nums">
                    <span className="font-extrabold text-[#19588f] tracking-wide">
                      {bagian.roman}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      &middot;
                    </span>
                    {isVerification ? (
                      <>
                        <span className="font-medium text-slate-700">{bagian.scopeLabel}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          &middot;
                        </span>
                        <span className="text-slate-600">{targetVerifierLabel}</span>
                      </>
                    ) : bagian.isPatientSpecific ? (
                      <>
                        <span className="font-medium text-slate-700">{bagian.scopeLabel}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          &middot;
                        </span>
                        <span>
                          {aggPatStats?.perPatientCount || 0} Indikator SPO / Pasien
                          {managedPatients.length > 0
                            ? ` (${managedPatients.length} Pasien Kelolaan)`
                            : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-slate-700">{bagian.scopeLabel}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          &middot;
                        </span>
                        <span>{stats.total} Indikator SPO (1x/Hari Unit)</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-[14.5px] sm:text-[15.5px] font-bold text-slate-950 group-hover:text-[#19588f] transition-colors leading-snug">
                    {isVerification ? bagian7RoleTitle : bagian.title}
                  </h3>

                  <p className="text-xs text-slate-600 line-clamp-1 leading-relaxed">
                    {isVerification ? bagian7RoleSubtitle : bagian.subtitle}
                  </p>
                </div>
              </div>

              {/* Right: Tabular Progress + Consistent RSHL CTA */}
              <div className="flex items-center justify-between md:justify-end gap-3.5 sm:gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200/70">
                {isVerification ? (
                  <div className="text-left md:text-right tabular-nums">
                    <div className="text-xs font-bold text-slate-900">
                      {overallShiftStats.completed}/{overallShiftStats.total} SPO (
                      {overallShiftStats.pct}%)
                    </div>
                    {pjVerification.status === 'terverifikasi' ? (
                      <div className="text-[11px] text-[#0e7876] font-semibold flex items-center md:justify-end gap-1 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Terverifikasi</span>
                      </div>
                    ) : pjVerification.status === 'diajukan' ? (
                      <div className="text-[11px] text-[#19588f] font-semibold flex items-center md:justify-end gap-1 mt-0.5">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Menunggu{' '}
                          {pjVerification.targetRole === 'kepala_ruangan'
                            ? 'Kepala Ruang'
                            : 'PJ Shift'}
                        </span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-700 font-semibold mt-0.5">
                        Belum Diajukan
                      </div>
                    )}
                  </div>
                ) : bagian.isPatientSpecific && managedPatients.length === 0 ? (
                  <div className="text-left md:text-right tabular-nums">
                    <div className="text-xs font-bold text-slate-700">
                      0/{aggPatStats?.perPatientCount || 0} SPO
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                      Pilih Pasien Kelolaan
                    </div>
                  </div>
                ) : (
                  <div className="text-left md:text-right tabular-nums">
                    <div className="text-xs font-bold text-slate-900">
                      {stats.completed}/{stats.total} SPO
                    </div>
                    {stats.completed === 0 ? (
                      <div className="text-[11px] text-amber-700 font-semibold flex items-center md:justify-end gap-1 mt-0.5">
                        <Square className="w-3 h-3 shrink-0" />
                        <span>Belum Dilaksanakan</span>
                      </div>
                    ) : stats.completed < stats.total ? (
                      <div className="text-[11px] text-[#19588f] font-semibold flex items-center md:justify-end gap-1 mt-0.5">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{stats.pct}% Terisi</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#0e7876] font-semibold flex items-center md:justify-end gap-1 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>100% Terpenuhi</span>
                      </div>
                    )}
                  </div>
                )}

                <div
                  className={`px-3.5 py-2 rounded-xl text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    isComplete
                      ? 'bg-[#0e7876] group-hover:bg-[#0b6361]'
                      : 'bg-[#19588f] group-hover:bg-[#144775]'
                  }`}
                >
                  <span>
                    {isVerification
                      ? pjVerification.status === 'belum_diajukan'
                        ? 'Ajukan Verifikasi'
                        : 'Buka Verifikasi'
                      : 'Buka Bagian'}
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* WORKSPACE MODAL LOGBOOK BAGIAN I – VII (TEMA KLINIS RSHL)                 */}
      {/* ========================================================================= */}
      {selectedBagian && activeMeta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/45 backdrop-blur-xs"
          onClick={() => setSelectedBagian(null)}
        >
          <div
            className="bg-[#f4f9fd] rounded-[18px] shadow-2xl border border-white w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* RSHL Clinical Blue Modal Header */}
            <div className="px-4 sm:px-6 py-3.5 bg-gradient-to-r from-[#164c7d] via-[#19588f] to-[#1f6a96] text-white flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 bg-white/15 text-white border border-white/25">
                  {React.createElement(activeMeta.icon, { className: 'w-5 h-5' })}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-sky-100 tabular-nums">
                    <span className="font-extrabold text-white">{activeMeta.roman}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span>{activeDate}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span>Shift {activeShift}</span>
                  </div>

                  <h2 className="text-sm sm:text-[15.5px] font-bold text-white leading-snug truncate">
                    {selectedBagian === 7 ? bagian7RoleTitle : activeMeta.title}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Quick Shift Switcher inside Workspace Header */}
                <div className="hidden sm:flex items-center gap-1 p-1 bg-black/15 rounded-xl border border-white/15">
                  <button
                    type="button"
                    onClick={() => handleSelectShiftSchedule('Pagi')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                      activeShift === 'Pagi'
                        ? 'bg-white text-[#19588f] shadow-2xs'
                        : 'text-sky-100 hover:text-white'
                    }`}
                  >
                    <Sun className="w-3 h-3 shrink-0" />
                    <span>Pagi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectShiftSchedule('Siang')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                      activeShift === 'Siang'
                        ? 'bg-white text-[#19588f] shadow-2xs'
                        : 'text-sky-100 hover:text-white'
                    }`}
                  >
                    <Sunset className="w-3 h-3 shrink-0" />
                    <span>Siang</span>
                  </button>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setSelectedBagian(null)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/12 hover:bg-white/22 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Tutup Jendela Logbook"
                  aria-label="Tutup Jendela Logbook"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Light Clinical Ice-Blue Quick Switcher Between Bagian I – VII */}
            <div className="bg-[#e5f0f8] px-4 sm:px-6 py-2 flex items-center justify-between gap-3 border-b border-[#cbe0f0] text-xs shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                {BAGIAN_METAS.map((m) => {
                  const isActive = m.num === selectedBagian;
                  return (
                    <button
                      key={m.num}
                      type="button"
                      onClick={() => setSelectedBagian(m.num)}
                      className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-[#19588f] text-white shadow-2xs'
                          : 'bg-white/80 hover:bg-white text-slate-700 hover:text-slate-950 border border-white'
                      }`}
                    >
                      {m.roman}
                    </button>
                  );
                })}
              </div>

              <span className="hidden md:flex items-center gap-1.5 font-semibold text-[#19588f] tabular-nums shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {selectedBagian === 7
                    ? `${overallShiftStats.completed}/${overallShiftStats.total} SPO Shift (${overallShiftStats.pct}%)`
                    : activeMeta.isPatientSpecific
                    ? managedPatients.length === 0
                      ? 'Belum ada pasien kelolaan'
                      : `${getPatientBagianStats(selectedBagian, activePatient.id).completed}/${getPatientBagianStats(selectedBagian, activePatient.id).total} SPO (${activePatient.bedNumber})`
                    : `${getFacilityBagianStats().completed}/${getFacilityBagianStats().total} SPO Unit`}
                </span>
              </span>
            </div>

            {/* ========================================================================= */}
            {/* SLIM STICKY PATIENT TABS BAR (KHUSUS BAGIAN II – VI)                      */}
            {/* ========================================================================= */}
            {activeMeta.isPatientSpecific && (
              <div className="bg-white px-4 sm:px-6 py-2.5 border-b border-slate-200/90 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                  <span className="text-[11px] font-semibold text-slate-500 mr-1 hidden lg:inline whitespace-nowrap shrink-0">
                    Pasien Aktif:
                  </span>
                  {managedPatients.length === 0 ? (
                    <span className="text-xs font-medium text-slate-500">
                      Belum ada pasien kelolaan pada shift ini
                    </span>
                  ) : (
                    managedPatients.map((pat, idx) => {
                      const isSelected = pat.id === activePatient.id;
                      const patStats = getPatientBagianStats(selectedBagian, pat.id);

                      return (
                        <button
                          key={pat.id}
                          type="button"
                          onClick={() => setActivePatientId(pat.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border tabular-nums ${
                            isSelected
                              ? 'bg-[#19588f] text-white border-[#19588f] shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span className="font-mono text-[11px] opacity-80">#{idx + 1}</span>
                          <span>{pat.bedNumber || `Bed ${idx + 1}`}</span>
                          <span
                            className={isSelected ? 'text-sky-200' : 'text-slate-300'}
                            aria-hidden="true"
                          >
                            &middot;
                          </span>
                          <span className="max-w-[135px] truncate">
                            {pat.patientName || 'Pilih Pasien'}
                          </span>
                          <span
                            className={`text-[11px] font-mono ${
                              isSelected
                                ? 'text-sky-100'
                                : patStats.pct === 100
                                ? 'text-[#0e7876]'
                                : 'text-amber-700'
                            }`}
                          >
                            ({patStats.completed}/{patStats.total})
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Quick Patient Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {managedPatients.length > 1 && (
                    <button
                      type="button"
                      onClick={handleCopyCurrentChecksToAllPatients}
                      className="px-3 py-1.5 bg-white hover:bg-[#edf5fb] text-[#19588f] border border-[#19588f]/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      title="Salin checklist SPO pasien saat ini ke semua pasien kelolaan"
                    >
                      <Copy className="w-3.5 h-3.5 shrink-0" />
                      <span>Salin ke {managedPatients.length} Pasien</span>
                    </button>
                  )}

                  {managedPatients.length < 4 && (
                    <button
                      type="button"
                      onClick={() => handleAddPatient()}
                      className="px-3 py-1.5 bg-[#19588f] hover:bg-[#144775] text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      title="Tambah pasien kelolaan baru (maksimal 4 pasien)"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Tambah Pasien</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* MAIN SCROLLABLE CLINICAL WORKSPACE (BAGIAN I – VII)                       */}
            {/* ========================================================================= */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 min-h-0">
              {selectedBagian === 7 ? (
                <div className="space-y-4">
                  {/* Catatan Revisi Verifikator (jika dikembalikan) */}
                  {pjVerification.status === 'belum_diajukan' && pjVerification.verifierNotes && (
                    <div className="rounded-[14px] border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-950 space-y-1">
                        <div className="font-bold">Catatan Revisi dari Verifikator:</div>
                        <p className="leading-relaxed">{pjVerification.verifierNotes}</p>
                      </div>
                    </div>
                  )}

                  {/* 1. Status Pengajuan Verifikasi Banner */}
                  <div
                    className={`rounded-[14px] border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      pjVerification.status === 'terverifikasi'
                        ? 'bg-emerald-50/80 border-emerald-200'
                        : pjVerification.status === 'diajukan'
                        ? 'bg-[#e8f3fb] border-[#19588f]/30'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`font-bold tracking-wide ${
                            pjVerification.status === 'terverifikasi'
                              ? 'text-[#0e7876]'
                              : pjVerification.status === 'diajukan'
                              ? 'text-[#19588f]'
                              : 'text-amber-700'
                          }`}
                        >
                          {pjVerification.status === 'terverifikasi'
                            ? (pjVerification.verifiedByRole || '')
                                .toLowerCase()
                                .includes('kepala') ||
                              pjVerification.targetRole === 'kepala_ruangan'
                              ? 'TERVERIFIKASI KEPALA RUANG'
                              : 'TERVERIFIKASI PJ SHIFT'
                            : pjVerification.status === 'diajukan'
                            ? pjVerification.targetRole === 'kepala_ruangan'
                              ? 'MENUNGGU VERIFIKASI KEPALA RUANG'
                              : activeRole === 'pj_shift'
                              ? 'MENUNGGU VERIFIKASI PJ SHIFT LAINNYA'
                              : 'MENUNGGU VERIFIKASI PJ SHIFT'
                            : 'BELUM DIAJUKAN'}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          &middot;
                        </span>
                        <span className="text-slate-600 font-medium tabular-nums">
                          Capaian Shift: {overallShiftStats.completed}/{overallShiftStats.total} SPO
                          ({overallShiftStats.pct}%)
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug">
                        {pjVerification.status === 'terverifikasi'
                          ? `Logbook pasien kelolaan telah diverifikasi oleh ${pjVerification.verifiedBy || pjVerification.targetVerifierName} (${pjVerification.verifiedByRole || 'Verifikator'}) pada ${pjVerification.verifiedAt} dan tercatat pada halaman Riwayat.`
                          : pjVerification.status === 'diajukan'
                          ? `Pengajuan verifikasi telah dikirim oleh ${currentNurse.name} kepada ${pjVerification.targetRole === 'kepala_ruangan' ? 'Kepala Ruang' : activeRole === 'pj_shift' ? 'PJ Shift lainnya' : 'PJ Shift'} (${pjVerification.targetVerifierName}) pada ${pjVerification.submittedAt}.`
                          : activeRole === 'pj_shift'
                          ? 'PJ Shift dapat mengajukan verifikasi logbook pasien kelolaan kepada Kepala Ruang atau kepada PJ Shift lainnya.'
                          : activeRole === 'kepala_ruangan'
                          ? 'Kepala Ruang dapat mengajukan verifikasi logbook pasien kelolaan kepada Kepala Ruang itu sendiri atau kepada PJ Shift.'
                          : 'Periksa rekapitulasi kelengkapan pengisian SPO Bagian I–VI di bawah ini, lalu ajukan verifikasi kepada PJ Shift.'}
                      </p>
                    </div>

                    {pjVerification.status !== 'belum_diajukan' && (
                      <button
                        type="button"
                        onClick={handleCancelVerificationSubmission}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
                      >
                        <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                        <span>Perbarui Pengajuan</span>
                      </button>
                    )}
                  </div>

                  {/* 2. Rekapitulasi Kelengkapan SPO Bagian I – Bagian VI */}
                  <div className="bg-white rounded-[14px] border border-slate-200 overflow-hidden">
                    <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-950">
                          Rekapitulasi Kelengkapan Logbook Shift (Bagian I – Bagian VI)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Klik angka bagian untuk meninjau atau melengkapi indikator SPO sebelum
                          pengajuan verifikasi.
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-900 font-mono tabular-nums">
                        Total: {overallShiftStats.completed}/{overallShiftStats.total} (
                        {overallShiftStats.pct}%)
                      </span>
                    </div>

                    {/* Bagian I Row */}
                    <div className="px-4 sm:px-5 py-2.5 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-[#19588f]">BAGIAN I</span>
                        <span className="text-slate-300" aria-hidden="true">
                          &middot;
                        </span>
                        <span className="text-slate-700 truncate">
                          Kesiapan Fasilitas Ruangan &amp; Water Treatment (RO)
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 tabular-nums">
                        <span
                          className={`font-mono font-bold ${
                            overallShiftStats.facility.pct === 100
                              ? 'text-[#0e7876]'
                              : 'text-amber-700'
                          }`}
                        >
                          {overallShiftStats.facility.completed}/{overallShiftStats.facility.total}{' '}
                          SPO
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedBagian(1)}
                          className="text-[#19588f] hover:underline font-semibold underline-offset-2 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Tinjau
                        </button>
                      </div>
                    </div>

                    {/* Bagian II–VI Per Patient High-Density Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 bg-white">
                            <th className="py-2.5 px-4 sm:px-5 font-semibold">Pasien Kelolaan</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Bag. II</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Bag. III</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Bag. IV</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Bag. V</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Bag. VI</th>
                            <th className="py-2.5 px-4 sm:px-5 font-semibold text-right">
                              Total SPO
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {overallShiftStats.perPatient.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="py-6 px-4 sm:px-5 text-center text-slate-500"
                              >
                                Belum ada pasien kelolaan yang ditambahkan pada shift ini. Silakan
                                tambahkan pasien kelolaan pada{' '}
                                <button
                                  type="button"
                                  onClick={() => setSelectedBagian(2)}
                                  className="text-[#19588f] hover:underline font-bold underline-offset-2 cursor-pointer"
                                >
                                  Bagian II–VI
                                </button>{' '}
                                sebelum mengajukan verifikasi.
                              </td>
                            </tr>
                          ) : (
                            overallShiftStats.perPatient.map((row) => (
                              <tr
                                key={row.patient.id}
                                className="hover:bg-slate-50/80 transition-colors"
                              >
                                <td className="py-2.5 px-4 sm:px-5 font-medium text-slate-900">
                                  <span className="font-bold tabular-nums">
                                    {row.patient.bedNumber}
                                  </span>
                                  <span className="text-slate-300 mx-1.5" aria-hidden="true">
                                    &middot;
                                  </span>
                                  <span>{row.patient.patientName || 'Nama belum diisi'}</span>
                                  {row.patient.medicalRecord && (
                                    <span className="text-slate-400 font-mono tabular-nums ml-1.5">
                                      (RM {row.patient.medicalRecord})
                                    </span>
                                  )}
                                </td>
                                {[
                                  { num: 2, stat: row.b2 },
                                  { num: 3, stat: row.b3 },
                                  { num: 4, stat: row.b4 },
                                  { num: 5, stat: row.b5 },
                                  { num: 6, stat: row.b6 }
                                ].map(({ num, stat }) => (
                                  <td
                                    key={num}
                                    className="py-2.5 px-3 text-right font-mono tabular-nums"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActivePatientId(row.patient.id);
                                        setSelectedBagian(num);
                                      }}
                                      className={`font-semibold hover:underline underline-offset-2 cursor-pointer ${
                                        stat.completed === stat.total
                                          ? 'text-[#0e7876]'
                                          : 'text-amber-700'
                                      }`}
                                    >
                                      {stat.completed}/{stat.total}
                                    </button>
                                  </td>
                                ))}
                                <td className="py-2.5 px-4 sm:px-5 text-right font-mono font-bold tabular-nums">
                                  <span
                                    className={
                                      row.pct === 100 ? 'text-[#0e7876]' : 'text-amber-700'
                                    }
                                  >
                                    {row.completed}/{row.total} ({row.pct}%)
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 3. Formulir Pengajuan Verifikasi Sesuai Hak Akses */}
                  <div className="bg-white rounded-[14px] border border-slate-200 p-4 sm:p-5 space-y-4">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-slate-950">
                        {activeRole === 'pj_shift'
                          ? 'Formulir Pengajuan Verifikasi Logbook PJ Shift'
                          : activeRole === 'kepala_ruangan'
                          ? 'Formulir Pengajuan Verifikasi Logbook Kepala Ruang'
                          : 'Formulir Pengajuan Verifikasi kepada PJ Shift'}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {activeRole === 'pj_shift'
                          ? 'PJ Shift dapat mengajukan verifikasi logbook pasien kelolaan kepada Kepala Ruang atau kepada PJ Shift lainnya. Setelah diverifikasi, data tercatat pada halaman Riwayat.'
                          : activeRole === 'kepala_ruangan'
                          ? 'Kepala Ruang dapat mengajukan verifikasi kepada Kepala Ruang itu sendiri atau kepada PJ Shift. Setelah diverifikasi, data tercatat pada halaman Riwayat.'
                          : 'Logbook pasien kelolaan Perawat Pelaksana diajukan kepada PJ Shift. Setelah diverifikasi oleh PJ Shift, data tercatat pada halaman Riwayat.'}
                      </p>
                    </div>

                    {/* Selector Tujuan Verifikasi Khusus PJ Shift */}
                    {activeRole === 'pj_shift' && pjVerification.status === 'belum_diajukan' && (
                      <div className="bg-[#f0f6fc] border border-[#cbe0f0] rounded-xl p-3.5 space-y-2">
                        <label className="block text-xs font-bold text-slate-900">
                          Pilih Tujuan Pengajuan Verifikasi Logbook PJ Shift:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPjVerification((prev) => ({
                                ...prev,
                                targetRole: 'kepala_ruangan',
                                targetVerifierName: defaultKaruNurse.name,
                                targetVerifierNip: defaultKaruNurse.nip
                              }))
                            }
                            className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                              pjVerification.targetRole === 'kepala_ruangan' ||
                              pjVerification.targetRole === 'mandiri'
                                ? 'bg-white border-[#19588f] ring-1 ring-[#19588f]/30 text-slate-950 font-bold'
                                : 'bg-white/60 border-slate-200 text-slate-700 font-medium hover:bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <CheckCircle2
                                className={`w-4 h-4 shrink-0 ${
                                  pjVerification.targetRole === 'kepala_ruangan' ||
                                  pjVerification.targetRole === 'mandiri'
                                    ? 'text-[#19588f]'
                                    : 'text-slate-300'
                                }`}
                              />
                              <span className="text-xs">Ajukan kepada Kepala Ruang</span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-normal mt-1 pl-6">
                              Masuk ke halaman Verifikasi Kepala Ruang untuk diverifikasi oleh
                              Kepala Ruang.
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setPjVerification((prev) => ({
                                ...prev,
                                targetRole: 'pj_shift',
                                targetVerifierName: defaultOtherPjShiftNurse.name,
                                targetVerifierNip: defaultOtherPjShiftNurse.nip,
                                pjShiftName: defaultOtherPjShiftNurse.name,
                                pjShiftNip: defaultOtherPjShiftNurse.nip
                              }))
                            }
                            className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                              pjVerification.targetRole === 'pj_shift'
                                ? 'bg-white border-[#19588f] ring-1 ring-[#19588f]/30 text-slate-950 font-bold'
                                : 'bg-white/60 border-slate-200 text-slate-700 font-medium hover:bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <CheckCircle2
                                className={`w-4 h-4 shrink-0 ${
                                  pjVerification.targetRole === 'pj_shift'
                                    ? 'text-[#19588f]'
                                    : 'text-slate-300'
                                }`}
                              />
                              <span className="text-xs">Ajukan kepada PJ Shift Lainnya</span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-normal mt-1 pl-6">
                              Masuk ke halaman Verifikasi PJ Shift tujuan (rekan PJ Shift lain)
                              untuk diverifikasi.
                            </p>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Selector Tujuan Verifikasi Khusus Kepala Ruangan */}
                    {activeRole === 'kepala_ruangan' &&
                      pjVerification.status === 'belum_diajukan' && (
                        <div className="bg-[#f0f6fc] border border-[#cbe0f0] rounded-xl p-3.5 space-y-2">
                          <label className="block text-xs font-bold text-slate-900">
                            Pilih Tujuan Pengajuan Verifikasi Logbook Kepala Ruang:
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPjVerification((prev) => ({
                                  ...prev,
                                  targetRole: 'kepala_ruangan',
                                  targetVerifierName: currentNurse.name,
                                  targetVerifierNip: currentNurse.nip
                                }))
                              }
                              className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                                pjVerification.targetRole === 'kepala_ruangan' ||
                                pjVerification.targetRole === 'mandiri'
                                  ? 'bg-white border-[#19588f] ring-1 ring-[#19588f]/30 text-slate-950 font-bold'
                                  : 'bg-white/60 border-slate-200 text-slate-700 font-medium hover:bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <CheckCircle2
                                  className={`w-4 h-4 shrink-0 ${
                                    pjVerification.targetRole === 'kepala_ruangan' ||
                                    pjVerification.targetRole === 'mandiri'
                                      ? 'text-[#19588f]'
                                      : 'text-slate-300'
                                  }`}
                                />
                                <span className="text-xs">
                                  Ajukan kepada Kepala Ruang itu sendiri
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 font-normal mt-1 pl-6">
                                Masuk ke halaman Verifikasi Kepala Ruang untuk diverifikasi oleh
                                Kepala Ruang.
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setPjVerification((prev) => ({
                                  ...prev,
                                  targetRole: 'pj_shift',
                                  targetVerifierName: defaultPjShiftNurse.name,
                                  targetVerifierNip: defaultPjShiftNurse.nip,
                                  pjShiftName: defaultPjShiftNurse.name,
                                  pjShiftNip: defaultPjShiftNurse.nip
                                }))
                              }
                              className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                                pjVerification.targetRole === 'pj_shift'
                                  ? 'bg-white border-[#19588f] ring-1 ring-[#19588f]/30 text-slate-950 font-bold'
                                  : 'bg-white/60 border-slate-200 text-slate-700 font-medium hover:bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <CheckCircle2
                                  className={`w-4 h-4 shrink-0 ${
                                    pjVerification.targetRole === 'pj_shift'
                                      ? 'text-[#19588f]'
                                      : 'text-slate-300'
                                  }`}
                                />
                                <span className="text-xs">Ajukan kepada PJ Shift</span>
                              </div>
                              <p className="text-[11px] text-slate-500 font-normal mt-1 pl-6">
                                Masuk ke halaman Verifikasi PJ Shift tujuan untuk diverifikasi oleh
                                PJ Shift.
                              </p>
                            </button>
                          </div>
                        </div>
                      )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Pengaju */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          {activeRole === 'pj_shift'
                            ? 'PJ Shift Pengaju'
                            : activeRole === 'kepala_ruangan'
                            ? 'Kepala Ruang Pengaju'
                            : 'Perawat Pelaksana Pengaju'}
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={currentNurse.name}
                          className="w-full bg-slate-100/80 text-slate-900 text-xs sm:text-sm font-semibold border border-slate-300 rounded-xl px-3 py-2.5 cursor-not-allowed"
                        />
                        <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                          NIP/NIRA: {currentNurse.nip} &middot; Role:{' '}
                          {formatSystemAccessLabel(activeRole)}
                        </div>
                      </div>

                      {/* Penerima / Target Verifikasi */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          {activeRole === 'pj_shift'
                            ? pjVerification.targetRole === 'pj_shift'
                              ? 'PJ Shift Lainnya Tujuan Verifikasi'
                              : 'Kepala Ruang Tujuan Verifikasi'
                            : activeRole === 'kepala_ruangan'
                            ? pjVerification.targetRole === 'pj_shift'
                              ? 'PJ Shift Tujuan Verifikasi'
                              : 'Kepala Ruang Tujuan Verifikasi (Diri Sendiri)'
                            : 'PJ Shift Tujuan Verifikasi'}
                        </label>

                        {activeRole === 'kepala_ruangan' &&
                        pjVerification.targetRole !== 'pj_shift' ? (
                          <input
                            type="text"
                            readOnly
                            value={`${currentNurse.name} (Kepala Ruang)`}
                            className="w-full bg-[#e8f3fb] text-slate-950 text-xs sm:text-sm font-semibold border border-[#19588f]/35 rounded-xl px-3 py-2.5 cursor-not-allowed"
                          />
                        ) : activeRole === 'pj_shift' && pjVerification.targetRole === 'pj_shift' ? (
                          <select
                            disabled={pjVerification.status !== 'belum_diajukan'}
                            value={
                              pjVerification.targetVerifierName &&
                              pjVerification.targetVerifierName !== '-' &&
                              !isMatchingNurse(pjVerification.targetVerifierName, currentNurse.name)
                                ? pjVerification.targetVerifierName
                                : defaultOtherPjShiftNurse.name !== '-'
                                ? defaultOtherPjShiftNurse.name
                                : ''
                            }
                            onChange={(e) => {
                              const selected = otherPjShiftOptions.find(
                                (opt) => opt.name === e.target.value
                              );
                              setPjVerification((prev) => ({
                                ...prev,
                                targetRole: 'pj_shift',
                                targetVerifierName: e.target.value,
                                targetVerifierNip: selected?.nip || prev.targetVerifierNip,
                                pjShiftName: e.target.value,
                                pjShiftNip: selected?.nip || prev.pjShiftNip
                              }));
                            }}
                            className="w-full bg-slate-50 focus:bg-white disabled:opacity-75 text-slate-900 text-xs sm:text-sm font-semibold border border-slate-300 focus:border-[#19588f] rounded-xl px-3 py-2.5 focus:outline-hidden"
                          >
                            {otherPjShiftOptions.length === 0 ? (
                              <option value="">
                                -- Belum ada akun PJ Shift lainnya di Data Perawat --
                              </option>
                            ) : (
                              otherPjShiftOptions.map((opt) => (
                                <option key={opt.name} value={opt.name}>
                                  {opt.name}
                                  {opt.shift ? ` (Shift ${opt.shift})` : ''}
                                </option>
                              ))
                            )}
                          </select>
                        ) : activeRole === 'pj_shift' ? (
                          <select
                            disabled={pjVerification.status !== 'belum_diajukan'}
                            value={
                              pjVerification.targetVerifierName &&
                              pjVerification.targetVerifierName !== '-'
                                ? pjVerification.targetVerifierName
                                : defaultKaruNurse.name !== '-'
                                ? defaultKaruNurse.name
                                : ''
                            }
                            onChange={(e) => {
                              const selected = kepalaRuangOptions.find(
                                (opt) => opt.name === e.target.value
                              );
                              setPjVerification((prev) => ({
                                ...prev,
                                targetRole: 'kepala_ruangan',
                                targetVerifierName: e.target.value,
                                targetVerifierNip: selected?.nip || prev.targetVerifierNip
                              }));
                            }}
                            className="w-full bg-slate-50 focus:bg-white disabled:opacity-75 text-slate-900 text-xs sm:text-sm font-semibold border border-slate-300 focus:border-[#19588f] rounded-xl px-3 py-2.5 focus:outline-hidden"
                          >
                            {kepalaRuangOptions.length === 0 ? (
                              <option value="">
                                -- Belum ada akun Kepala Ruang di Data Perawat --
                              </option>
                            ) : (
                              kepalaRuangOptions.map((opt) => (
                                <option key={opt.name} value={opt.name}>
                                  {opt.name}
                                </option>
                              ))
                            )}
                          </select>
                        ) : (
                          <select
                            disabled={pjVerification.status !== 'belum_diajukan'}
                            value={
                              pjVerification.targetVerifierName &&
                              pjVerification.targetVerifierName !== '-'
                                ? pjVerification.targetVerifierName
                                : defaultPjShiftNurse.name !== '-'
                                ? defaultPjShiftNurse.name
                                : ''
                            }
                            onChange={(e) => {
                              const selected = pjShiftOptions.find(
                                (opt) => opt.name === e.target.value
                              );
                              setPjVerification((prev) => ({
                                ...prev,
                                targetRole: 'pj_shift',
                                targetVerifierName: e.target.value,
                                targetVerifierNip: selected?.nip || prev.targetVerifierNip,
                                pjShiftName: e.target.value,
                                pjShiftNip: selected?.nip || prev.pjShiftNip
                              }));
                            }}
                            className="w-full bg-slate-50 focus:bg-white disabled:opacity-75 text-slate-900 text-xs sm:text-sm font-semibold border border-slate-300 focus:border-[#19588f] rounded-xl px-3 py-2.5 focus:outline-hidden"
                          >
                            {pjShiftOptions.length === 0 ? (
                              <option value="">
                                -- Belum ada akun PJ Shift di Data Perawat --
                              </option>
                            ) : (
                              pjShiftOptions.map((opt) => (
                                <option key={opt.name} value={opt.name}>
                                  {opt.name}
                                  {opt.shift ? ` (Shift ${opt.shift})` : ''}
                                </option>
                              ))
                            )}
                          </select>
                        )}

                        <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                          NIP/NIRA: {pjVerification.targetVerifierNip || '-'} &middot; Shift{' '}
                          {activeShift}
                        </div>
                      </div>
                    </div>

                    {/* Catatan Pengajuan Opsional */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Catatan Pengajuan / Operan Verifikasi (Opsional)
                      </label>
                      <textarea
                        rows={2}
                        disabled={pjVerification.status !== 'belum_diajukan'}
                        value={pjVerification.notes}
                        onChange={(e) =>
                          setPjVerification((prev) => ({ ...prev, notes: e.target.value }))
                        }
                        placeholder="Catatan tambahan terkait pasien kelolaan atau kendala selama shift (jika ada)..."
                        className="w-full bg-slate-50 focus:bg-white disabled:opacity-75 text-slate-900 text-xs sm:text-sm border border-slate-300 focus:border-[#19588f] rounded-xl px-3.5 py-2.5 focus:outline-hidden resize-none"
                      />
                    </div>

                    {/* Pernyataan Konfirmasi */}
                    <button
                      type="button"
                      disabled={pjVerification.status !== 'belum_diajukan'}
                      onClick={() =>
                        setPjVerification((prev) => ({
                          ...prev,
                          declarationChecked: !prev.declarationChecked
                        }))
                      }
                      className={`w-full px-4 py-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                        pjVerification.status !== 'belum_diajukan'
                          ? 'opacity-80 cursor-default'
                          : 'cursor-pointer'
                      } ${
                        pjVerification.declarationChecked
                          ? 'bg-emerald-50/60 border-emerald-300 text-slate-900'
                          : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                          pjVerification.declarationChecked
                            ? 'bg-[#0e7876] border-[#0e7876] text-white'
                            : 'bg-white border-slate-300 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                      <span className="text-xs sm:text-sm font-semibold leading-snug">
                        {activeRole === 'pj_shift'
                          ? pjVerification.targetRole === 'pj_shift'
                            ? 'Seluruh pengisian indikator SPO Bagian I–VI pasien kelolaan PJ Shift telah diperiksa dan siap diajukan untuk diverifikasi oleh PJ Shift lainnya.'
                            : 'Seluruh pengisian indikator SPO Bagian I–VI pasien kelolaan PJ Shift telah diperiksa dan siap diajukan untuk diverifikasi oleh Kepala Ruang.'
                          : activeRole === 'kepala_ruangan'
                          ? 'Seluruh pengisian indikator SPO Bagian I–VI pasien kelolaan Kepala Ruang telah diperiksa dan siap diajukan untuk verifikasi.'
                          : 'Seluruh pengisian indikator SPO Bagian I–VI pasien kelolaan telah diperiksa dan siap diajukan untuk diverifikasi oleh PJ Shift.'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : activeMeta.isPatientSpecific && managedPatients.length === 0 ? (
                <div className="bg-white rounded-[14px] border border-slate-200 p-7 sm:p-9 text-center space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-[#e8f3fb] text-[#19588f] flex items-center justify-center mx-auto">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="max-w-lg mx-auto space-y-1">
                    <div className="text-xs font-bold text-[#19588f]">
                      Jadwal Aktif: Hari {activeDayName} &middot; Shift {activeShift}
                    </div>
                    <h3 className="text-base font-bold text-slate-950">
                      Belum Ada Pasien Kelolaan pada Shift Ini
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {scheduledMasterPatients.length > 0
                        ? `Pilih nama pasien yang terjadwal pada Hari ${activeDayName} Shift ${activeShift} (${scheduledMasterPatients.length} pasien) di bawah ini untuk mulai mencatat indikator SPO Bagian II–VI.`
                        : `Belum ada data pasien yang terjadwal pada Hari ${activeDayName} Shift ${activeShift}. Pastikan hari & shift dinas sudah sesuai jadwal, atau minta Administrator menambahkan pasien pada jadwal ${activeDayName} ${activeShift}.`}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
                    <select
                      value=""
                      onChange={(e) => {
                        const found = scheduledMasterPatients.find(
                          (mp) => mp.id === e.target.value
                        );
                        if (found) {
                          handleAddPatient(found);
                        }
                      }}
                      disabled={scheduledMasterPatients.length === 0}
                      className="w-full sm:w-80 bg-slate-50 hover:bg-white disabled:opacity-70 text-slate-900 text-xs font-semibold border border-slate-300 focus:border-[#19588f] rounded-xl px-3.5 py-2.5 focus:outline-hidden tabular-nums"
                    >
                      <option value="">
                        {scheduledMasterPatients.length > 0
                          ? `-- Pilih Nama Pasien ${activeDayName} ${activeShift} (${scheduledMasterPatients.length} Pasien) --`
                          : `-- Tidak ada pasien terjadwal (${activeDayName} ${activeShift}) --`}
                      </option>
                      {scheduledMasterPatients.map((mp) => (
                        <option key={mp.id} value={mp.id}>
                          {mp.patientName} (RM: {mp.medicalRecordNumber})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handleAddPatient()}
                      className="px-4 py-2.5 bg-[#19588f] hover:bg-[#144775] text-white rounded-xl text-xs font-bold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span>Tambah Slot Bed</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Compact Inline Identity Card inside Scroll Area for Bagian II–VI */}
                  {activeMeta.isPatientSpecific && (
                    <div className="bg-white p-3.5 sm:p-4 rounded-[14px] border border-slate-200 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            No. Bed / Mesin HD
                          </label>
                          <select
                            value={activePatient.bedNumber}
                            onChange={(e) => handleUpdateActivePatient('bedNumber', e.target.value)}
                            className="w-full bg-slate-50 focus:bg-white text-slate-900 text-xs font-semibold border border-slate-300 focus:border-[#19588f] rounded-lg px-2.5 py-2 focus:outline-hidden tabular-nums"
                          >
                            {availableBedOptions.map((bedOpt) => (
                              <option key={bedOpt} value={bedOpt}>
                                {bedOpt}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-5">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Nama Pasien (Jadwal {activeDayName} {activeShift})
                          </label>
                          <select
                            value={
                              scheduledMasterPatients.find(
                                (mp) =>
                                  mp.medicalRecordNumber === activePatient.medicalRecord &&
                                  mp.patientName === activePatient.patientName
                              )?.id || ''
                            }
                            onChange={(e) => handleSelectMasterPatient(e.target.value)}
                            className="w-full bg-slate-50 focus:bg-white text-slate-900 text-xs font-semibold border border-slate-300 focus:border-[#19588f] rounded-lg px-3 py-2 focus:outline-hidden tabular-nums"
                          >
                            <option value="">
                              {scheduledMasterPatients.length > 0
                                ? `-- Pilih Pasien ${activeDayName} ${activeShift} (${scheduledMasterPatients.length} Pasien) --`
                                : `-- Belum ada pasien terjadwal (${activeDayName} ${activeShift}) --`}
                            </option>
                            {scheduledMasterPatients.map((mp) => {
                              const usedByOther = managedPatients.find(
                                (other) =>
                                  other.id !== activePatient.id &&
                                  ((mp.medicalRecordNumber &&
                                    other.medicalRecord === mp.medicalRecordNumber) ||
                                    other.patientName === mp.patientName)
                              );
                              return (
                                <option
                                  key={mp.id}
                                  value={mp.id}
                                  disabled={Boolean(usedByOther)}
                                >
                                  {mp.patientName} (RM: {mp.medicalRecordNumber})
                                  {usedByOther ? ` — Sudah di ${usedByOther.bedNumber}` : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            No. Rekam Medis
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={activePatient.medicalRecord || ''}
                            placeholder="Otomatis"
                            className="w-full bg-slate-100 text-slate-800 text-xs font-mono tabular-nums font-semibold border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-hidden"
                          />
                        </div>

                        <div className="sm:col-span-2 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemovePatient(activePatient.id)}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                            title="Hapus pasien ini dari daftar kelolaan shift"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </div>

                      {activePatient.patientName &&
                        !scheduledMasterPatients.some(
                          (mp) =>
                            mp.medicalRecordNumber === activePatient.medicalRecord &&
                            mp.patientName === activePatient.patientName
                        ) && (
                          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                            Pasien terpilih sebelumnya (
                            <strong>{activePatient.patientName}</strong>) tidak berada pada jadwal{' '}
                            <strong>
                              {activeDayName} Shift {activeShift}
                            </strong>
                            . Silakan sesuaikan pasien sesuai jadwal aktif.
                          </div>
                        )}
                    </div>
                  )}

                  {/* Header Status Bar & Bulk Actions inside Body */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-0.5">
                    <div>
                      <span className="font-bold text-slate-900">
                        Daftar Indikator Standar Prosedur Operasional (SPO)
                      </span>
                      {activeMeta.isPatientSpecific && (
                        <span className="text-[#19588f] font-semibold ml-1.5">
                          &mdash; {activePatient.bedNumber} (
                          {activePatient.patientName || 'Nama belum diisi'})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800 tabular-nums mr-1">
                        {activeMeta.isPatientSpecific
                          ? `${getPatientBagianStats(selectedBagian, activePatient.id).completed}/${getPatientBagianStats(selectedBagian, activePatient.id).total} Dilaksanakan`
                          : `${getFacilityBagianStats().completed}/${getFacilityBagianStats().total} Dilaksanakan`}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleSetBagianChecklists(selectedBagian, true)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#0e7876] border border-emerald-200 font-semibold text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                        <span>Semua Dilaksanakan</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetBagianChecklists(selectedBagian, false)}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 font-semibold text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3 shrink-0" />
                        <span>Reset Bagian</span>
                      </button>
                    </div>
                  </div>

                  {/* SPO Items List */}
                  <div className="space-y-2.5">
                    {getBagianItems(selectedBagian).map((item) => {
                      const isFacility = selectedBagian === 1;
                      const isChecked = isFacility
                        ? Boolean(facilityStatuses[item.code])
                        : Boolean(
                            patientStatuses[activePatient.id] &&
                              patientStatuses[activePatient.id][item.code]
                          );

                      const currentNote = isFacility
                        ? facilityNotes[item.code] || ''
                        : (patientNotes[activePatient.id] &&
                            patientNotes[activePatient.id][item.code]) ||
                          '';

                      const noteKey = isFacility
                        ? `fac-${item.code}`
                        : `${activePatient.id}-${item.code}`;
                      const isNoteExpanded =
                        Boolean(expandedNoteCodes[noteKey]) || Boolean(currentNote.trim());

                      return (
                        <div
                          key={item.code}
                          className={`bg-white rounded-[14px] border p-3.5 sm:p-4 transition-colors ${
                            isChecked
                              ? 'border-emerald-200/90'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Top Row: Code + Description + Guide + Actions */}
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="font-mono font-bold text-slate-900 tabular-nums">
                                  Poin {item.code}
                                </span>
                                <span aria-hidden="true">&middot;</span>
                                <span className="font-semibold text-[#19588f]">
                                  {item.category}
                                </span>
                              </div>

                              <p className="text-xs sm:text-sm font-bold text-slate-950 leading-snug">
                                {item.description}
                              </p>

                              {item.simpleGuide && (
                                <p className="text-xs text-slate-600 leading-relaxed">
                                  {item.simpleGuide}
                                </p>
                              )}

                              {/* Unboxed Standar Mutu Metadata (Zero-Pill Discipline) */}
                              {item.keyMetrics &&
                                item.keyMetrics.length > 0 &&
                                item.code !== '2.1' && (
                                  <p className="pt-0.5 text-[11px] text-slate-500 leading-relaxed">
                                    <strong className="font-semibold text-slate-700">
                                      Standar:
                                    </strong>{' '}
                                    {item.keyMetrics.join(' · ')}
                                  </p>
                                )}
                            </div>

                            {/* Right Action Cluster: Optional Note Toggle + SPO Checkbox */}
                            <div className="flex items-center justify-end gap-2 shrink-0">
                              {item.code !== '2.1' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedNoteCodes((prev) => ({
                                      ...prev,
                                      [noteKey]: !isNoteExpanded
                                    }))
                                  }
                                  className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                                    isNoteExpanded
                                      ? 'bg-[#edf5fb] text-[#19588f] border-[#19588f]/30'
                                      : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                                  }`}
                                  title="Tambahkan catatan atau hasil ukur pada poin SPO ini"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                                  <span>Catatan</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleToggleItem(item.code)}
                                className={`px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  isChecked
                                    ? 'bg-[#0e7876] text-white hover:bg-[#0b6361]'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                                }`}
                              >
                                {isChecked ? (
                                  <>
                                    <Check className="w-4 h-4 stroke-[2.5] shrink-0" />
                                    <span>DILAKSANAKAN</span>
                                  </>
                                ) : (
                                  <>
                                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span>Belum Dilaksanakan</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* ===================================================================== */}
                          {/* KHUSUS BAGIAN II - POIN 2.1: HAND HYGIENE & PENGGUNAAN APD            */}
                          {/* ===================================================================== */}
                          {item.code === '2.1' && (
                            <div className="mt-3 pt-3 border-t border-slate-200/80">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updatePoin2_1({
                                      apd: poin2_1Counts.apdChecked,
                                      cuciTangan: !poin2_1Counts.handwashChecked
                                    })
                                  }
                                  className={`min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                                    poin2_1Counts.handwashChecked
                                      ? 'bg-emerald-50/70 border-emerald-300 text-slate-900'
                                      : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 text-slate-700'
                                  }`}
                                >
                                  <span
                                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                                      poin2_1Counts.handwashChecked
                                        ? 'bg-[#0e7876] border-[#0e7876] text-white'
                                        : 'bg-white border-slate-300 text-transparent'
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  </span>
                                  <Hand className="w-4 h-4 text-[#19588f] shrink-0" />
                                  <span className="text-xs font-bold leading-snug">
                                    HAND HYGIENE
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    updatePoin2_1({
                                      apd: !poin2_1Counts.apdChecked,
                                      cuciTangan: poin2_1Counts.handwashChecked
                                    })
                                  }
                                  className={`min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                                    poin2_1Counts.apdChecked
                                      ? 'bg-emerald-50/70 border-emerald-300 text-slate-900'
                                      : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 text-slate-700'
                                  }`}
                                >
                                  <span
                                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                                      poin2_1Counts.apdChecked
                                        ? 'bg-[#0e7876] border-[#0e7876] text-white'
                                        : 'bg-white border-slate-300 text-transparent'
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  </span>
                                  <ShieldCheck className="w-4 h-4 text-[#19588f] shrink-0" />
                                  <span className="text-xs font-bold leading-snug">
                                    PENGGUNAAN APD
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Optional Expandable Note Field */}
                          {item.code !== '2.1' && isNoteExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                              {item.quickNotes && item.quickNotes.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-medium text-slate-500">
                                    Isi cepat:
                                  </span>
                                  {item.quickNotes.map((qn, qIdx) => (
                                    <button
                                      key={qIdx}
                                      type="button"
                                      onClick={() => handleUpdateItemNote(item.code, qn)}
                                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#e8f3fb] text-slate-700 hover:text-[#19588f] text-[11px] font-medium transition-colors cursor-pointer text-left"
                                    >
                                      {qn}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={currentNote}
                                onChange={(e) => handleUpdateItemNote(item.code, e.target.value)}
                                placeholder={
                                  item.notePlaceholder ||
                                  'Tulis catatan atau hasil pengukuran (opsional)...'
                                }
                                className="w-full bg-slate-50 focus:bg-white text-slate-900 text-xs border border-slate-200 focus:border-[#19588f] rounded-lg px-3 py-2 focus:outline-hidden"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Compact Modal Bottom Footer Actions */}
            <div className="px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-600 font-medium tabular-nums">
                {selectedBagian === 7 ? (
                  pjVerification.status === 'terverifikasi' ? (
                    <span className="text-[#0e7876] font-semibold">
                      Terverifikasi oleh {pjVerification.verifiedByRole || 'Verifikator'} (
                      {pjVerification.verifiedBy || pjVerification.targetVerifierName}) &middot;{' '}
                      {pjVerification.verifiedAt}
                    </span>
                  ) : pjVerification.status === 'diajukan' ? (
                    <span className="text-[#19588f] font-semibold">
                      Menunggu verifikasi{' '}
                      {pjVerification.targetRole === 'kepala_ruangan'
                        ? 'Kepala Ruang'
                        : 'PJ Shift'}{' '}
                      ({pjVerification.targetVerifierName}) &middot; Diajukan{' '}
                      {pjVerification.submittedAt}
                    </span>
                  ) : (
                    <span>
                      Status: <strong className="text-slate-900">Belum Diajukan</strong> &middot;{' '}
                      {targetVerifierLabel}
                    </span>
                  )
                ) : activeMeta.isPatientSpecific ? (
                  managedPatients.length === 0 ? (
                    <span>
                      Tambahkan pasien kelolaan terlebih dahulu untuk mengisi indikator SPO bagian
                      ini.
                    </span>
                  ) : (
                    <span>
                      Tersimpan otomatis:{' '}
                      <strong className="text-slate-900">
                        {activePatient.bedNumber} (
                        {activePatient.patientName || 'Nama belum diisi'})
                      </strong>{' '}
                      &middot; {managedPatients.length} pasien kelolaan.
                    </span>
                  )
                ) : (
                  <span>Data kesiapan fasilitas &amp; RO tersimpan untuk seluruh unit shift ini.</span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedBagian(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Tutup
                </button>

                {selectedBagian < 7 ? (
                  <button
                    type="button"
                    onClick={() => {
                      showToast(
                        `Bagian ${selectedBagian} tersimpan. Lanjut ke Bagian ${selectedBagian + 1}.`
                      );
                      setSelectedBagian(selectedBagian + 1);
                    }}
                    className="px-4 sm:px-5 py-2 rounded-xl bg-[#19588f] hover:bg-[#144775] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <span>Simpan &amp; Lanjut Bagian {selectedBagian + 1}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                ) : pjVerification.status === 'belum_diajukan' ? (
                  <button
                    type="button"
                    onClick={handleSubmitVerification}
                    className="px-4 sm:px-5 py-2 rounded-xl bg-[#19588f] hover:bg-[#144775] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Send className="w-4 h-4 shrink-0" />
                    <span>
                      {pjVerification.targetRole === 'kepala_ruangan'
                        ? 'Ajukan Verifikasi ke Kepala Ruang'
                        : activeRole === 'pj_shift'
                        ? 'Ajukan Verifikasi ke PJ Shift Lainnya'
                        : 'Ajukan Verifikasi ke PJ Shift'}
                    </span>
                  </button>
                ) : pjVerification.status === 'diajukan' ? (
                  <>
                    {activeRole === 'kepala_ruangan' &&
                      pjVerification.targetRole === 'kepala_ruangan' &&
                      onNavigateToVerifikasi && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBagian(null);
                            onNavigateToVerifikasi();
                          }}
                          className="px-4 sm:px-5 py-2 rounded-xl bg-[#19588f] hover:bg-[#144775] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <ShieldCheck className="w-4 h-4 shrink-0" />
                          <span>Buka Halaman Verifikasi</span>
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => setSelectedBagian(null)}
                      className="px-4 sm:px-5 py-2 rounded-xl bg-[#19588f] hover:bg-[#144775] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Save className="w-4 h-4 shrink-0" />
                      <span>Selesai</span>
                    </button>
                  </>
                ) : (
                  <>
                    {onNavigateToRiwayat && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBagian(null);
                          onNavigateToRiwayat();
                        }}
                        className="px-4 sm:px-5 py-2 rounded-xl bg-[#19588f] hover:bg-[#144775] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <FileText className="w-4 h-4 shrink-0" />
                        <span>Lihat di Halaman Riwayat</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedBagian(null)}
                      className="px-4 sm:px-5 py-2 rounded-xl bg-[#0e7876] hover:bg-[#0b6361] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Selesai</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
