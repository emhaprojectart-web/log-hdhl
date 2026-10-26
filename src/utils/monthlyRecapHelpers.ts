import {
  MasterNurse,
  OfficialNurseLogbookMonth,
  PatientHDSession,
  ShiftInfo,
  ShiftName,
  SystemAccessRole
} from '../types/dialysis.ts';
import { OFFICIAL_LOGBOOK_ITEMS } from '../data/officialPelaksanaLogbookData.ts';
import { getCurrentIndonesianFullDate, getWibDateParts } from './dateHelpers.ts';
import {
  PER_PATIENT_STATUS_STORAGE_KEY,
  ManagedPatientMinimal,
  buildPatientVerificationKey,
  getNurseManagedPatientsKey,
  getNurseMonthlySnapshotsKey,
  getNursePatientStatusesKey,
  getNurseVerificationInfo,
  getVerificationRegistry,
  isKepalaRuangVerifier,
  isMatchingNurse,
  isSameBed,
  isSessionVerifiedByPj,
  readNurseFacilityStatuses
} from './nurseVerificationHelpers.ts';

export interface ParsedLogbookDate {
  day: number; // 1..31
  month: number; // 1..12
  monthName: string;
  year: number;
  dateKey: string; // 'YYYY-MM-DD'
  daysInMonth: number;
}

export interface VerifiedDailySnapshot {
  dateKey: string; // 'YYYY-MM-DD'
  day: number;
  month: number;
  year: number;
  verifiedPatientCount: number;
  scores: Record<string, number>;
  verifiedBy?: string;
  verifiedByRole?: string;
  verifiedAt?: string;
  shift?: ShiftName;
}

export interface MonthlyItemSummaryStat {
  code: string;
  bagian: number;
  totalScore: number;
  maxScore: number;
  pct: number;
}

export interface StaffMonthlyRecapResult {
  logbook: OfficialNurseLogbookMonth;
  roleLabel: string;
  daysInMonth: number;
  verifiedDaysCount: number;
  totalVerifiedPatientsInMonth: number;
  unverifiedPatientsCount: number;
  totalManagedToday: number;
  itemStats: Record<string, MonthlyItemSummaryStat>;
  dailyTotalScores: (number | null)[];
  dailyMaxScores: (number | null)[];
  grandTotalScore: number;
  grandMaxScore: number;
  overallCompliancePct: number;
}

const INDONESIAN_MONTHS: { names: string[]; month: number; label: string }[] = [
  { names: ['januari', 'jan', 'january'], month: 1, label: 'Januari' },
  { names: ['februari', 'feb', 'february'], month: 2, label: 'Februari' },
  { names: ['maret', 'mar', 'march'], month: 3, label: 'Maret' },
  { names: ['april', 'apr'], month: 4, label: 'April' },
  { names: ['mei', 'may'], month: 5, label: 'Mei' },
  { names: ['juni', 'jun', 'june'], month: 6, label: 'Juni' },
  { names: ['juli', 'jul', 'july'], month: 7, label: 'Juli' },
  { names: ['agustus', 'agu', 'agt', 'aug', 'august'], month: 8, label: 'Agustus' },
  { names: ['september', 'sep', 'sept'], month: 9, label: 'September' },
  { names: ['oktober', 'okt', 'oct', 'october'], month: 10, label: 'Oktober' },
  { names: ['november', 'nov'], month: 11, label: 'November' },
  { names: ['desember', 'des', 'dec', 'december'], month: 12, label: 'Desember' }
];

export function getMonthLabel(month: number): string {
  return INDONESIAN_MONTHS.find((m) => m.month === month)?.label || 'Oktober';
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Parses Indonesian clinical logbook date strings such as:
 * - "Selasa, 20 Oktober 2026, 14:15 WIB"
 * - "20 Okt 2026 14:05 WIB"
 * - "2026-10-20T14:15:00.000Z"
 */
export function parseIndonesianLogbookDate(
  dateStr?: string,
  fallbackDateStr: string = getCurrentIndonesianFullDate()
): ParsedLogbookDate {
  const tryParseSingle = (raw?: string): ParsedLogbookDate | null => {
    if (!raw || !raw.trim()) return null;
    const text = raw.trim();

    // 1. Match "<day> <MonthName> <year>" e.g. "20 Oktober 2026" or "20 Okt 2026"
    const namedMatch = text.match(/(\d{1,2})\s+([a-zA-Z]+)\.?\s+(\d{4})/);
    if (namedMatch) {
      const dayNum = parseInt(namedMatch[1], 10);
      const monthToken = namedMatch[2].toLowerCase();
      const yearNum = parseInt(namedMatch[3], 10);
      const foundMonth = INDONESIAN_MONTHS.find((m) =>
        m.names.some((alias) => monthToken === alias || monthToken.startsWith(alias))
      );
      if (foundMonth && dayNum >= 1 && dayNum <= 31 && yearNum >= 2000 && yearNum <= 2100) {
        const daysInMonth = getDaysInMonth(yearNum, foundMonth.month);
        const clampedDay = Math.min(dayNum, daysInMonth);
        const dateKey = `${yearNum}-${String(foundMonth.month).padStart(2, '0')}-${String(
          clampedDay
        ).padStart(2, '0')}`;
        return {
          day: clampedDay,
          month: foundMonth.month,
          monthName: foundMonth.label,
          year: yearNum,
          dateKey,
          daysInMonth
        };
      }
    }

    // 2. Match ISO format "YYYY-MM-DD"
    const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const yearNum = parseInt(isoMatch[1], 10);
      const monthNum = parseInt(isoMatch[2], 10);
      const dayNum = parseInt(isoMatch[3], 10);
      if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
        const daysInMonth = getDaysInMonth(yearNum, monthNum);
        const clampedDay = Math.min(dayNum, daysInMonth);
        const monthName = getMonthLabel(monthNum);
        const dateKey = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(
          clampedDay
        ).padStart(2, '0')}`;
        return {
          day: clampedDay,
          month: monthNum,
          monthName,
          year: yearNum,
          dateKey,
          daysInMonth
        };
      }
    }

    return null;
  };

  const primary = tryParseSingle(dateStr);
  if (primary) return primary;

  const fallback = tryParseSingle(fallbackDateStr);
  if (fallback) return fallback;

  const liveWib = getWibDateParts();
  return {
    day: liveWib.day,
    month: liveWib.month,
    monthName: liveWib.monthName,
    year: liveWib.year,
    dateKey: liveWib.isoDate,
    daysInMonth: getDaysInMonth(liveWib.year, liveWib.month)
  };
}

/**
 * Pure scoring engine for a single verified working day:
 * - Poin 1.1..1.3: Bernilai 1 jika dikerjakan, 0 jika tidak (maksimal 1 per hari karena aktivitas 1x sehari).
 * - Poin 2.1..6.5: Nilainya mengikuti jumlah pasien kelolaan terverifikasi yang dikerjakan pada poin tersebut.
 *   Contoh: Mengelola 3 pasien terverifikasi, pada poin 3.3 ada 1 pasien tidak dikerjakan -> nilai poin 3.3 = 2.
 */
export function computeDailySpoScoresFromVerifiedLogbook(
  facilityStatuses: Record<string, boolean>,
  verifiedPatientsChecks: Array<Record<string, boolean>>
): { verifiedPatientCount: number; scores: Record<string, number> } | null {
  if (!verifiedPatientsChecks || verifiedPatientsChecks.length === 0) {
    return null;
  }

  const scores: Record<string, number> = {};

  OFFICIAL_LOGBOOK_ITEMS.forEach((item) => {
    if (item.bagian === 1) {
      scores[item.code] = facilityStatuses[item.code] ? 1 : 0;
    } else {
      const completedPatientsCount = verifiedPatientsChecks.reduce(
        (sum, patChecks) => sum + (patChecks && patChecks[item.code] ? 1 : 0),
        0
      );
      scores[item.code] = completedPatientsCount;
    }
  });

  return {
    verifiedPatientCount: verifiedPatientsChecks.length,
    scores
  };
}

/**
 * Checks whether a verification record satisfies the role rules for the staff member:
 * - Perawat Pelaksana: diverifikasi oleh PJ Shift atau Kepala Ruang.
 * - PJ Shift: diverifikasi oleh Kepala Ruang atau PJ Shift lainnya (bukan diri sendiri).
 * - Kepala Ruang: diverifikasi oleh PJ Shift atau Kepala Ruang.
 */
export function isVerificationEligibleForStaffRole(params: {
  staffName: string;
  staffRole: SystemAccessRole;
  isVerified: boolean;
  verifiedBy?: string;
  verifiedByRole?: string;
}): boolean {
  const { staffName, staffRole, isVerified, verifiedBy, verifiedByRole } = params;
  if (!isVerified) return false;

  const byKaru = isKepalaRuangVerifier(verifiedByRole, verifiedBy);

  if (staffRole === 'pj_shift') {
    if (byKaru) return true;
    // Verified by PJ Shift lainnya -> block self-verification
    if (verifiedBy && isMatchingNurse(verifiedBy, staffName)) {
      return false;
    }
    return true;
  }

  // Perawat Pelaksana & Kepala Ruang: valid when verified by PJ Shift or Kepala Ruang
  return true;
}

export function formatStaffRoleTitle(role?: SystemAccessRole): string {
  if (role === 'kepala_ruangan') return 'Kepala Ruang';
  if (role === 'pj_shift') return 'Penanggung Jawab (PJ) Shift';
  return 'Perawat Pelaksana';
}

function readStoredMonthlySnapshots(nurseName: string): Record<string, VerifiedDailySnapshot> {
  if (typeof window === 'undefined' || !window.localStorage || !nurseName || nurseName === '-') {
    return {};
  }
  try {
    const raw = localStorage.getItem(getNurseMonthlySnapshotsKey(nurseName));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, VerifiedDailySnapshot>;
      }
    }
  } catch {
    // ignore
  }
  return {};
}

function writeStoredMonthlySnapshots(
  nurseName: string,
  snapshots: Record<string, VerifiedDailySnapshot>
): void {
  if (typeof window === 'undefined' || !window.localStorage || !nurseName || nurseName === '-') {
    return;
  }
  try {
    localStorage.setItem(getNurseMonthlySnapshotsKey(nurseName), JSON.stringify(snapshots));
  } catch {
    // ignore
  }
}

interface ResolvedStaffPatientsVerification {
  totalManagedCount: number;
  unverifiedCount: number;
  verifiedSnapshotsByDate: Record<string, VerifiedDailySnapshot>;
}

/**
 * Resolves live managed patients, checks verification eligibility per patient,
 * and groups verified patient SPO checklists by calendar date ('YYYY-MM-DD').
 */
export function resolveLiveStaffVerifiedSnapshots(params: {
  nurseName: string;
  userRole: SystemAccessRole;
  shiftInfo?: ShiftInfo;
  sessions?: PatientHDSession[];
  masterNurses?: MasterNurse[];
  overrideManagedPatients?: ManagedPatientMinimal[];
  overridePatientStatuses?: Record<string, Record<string, boolean>>;
  overrideFacilityStatuses?: Record<string, boolean>;
  overridePerPatientRecords?: Record<
    string,
    {
      status: string;
      verifiedAt?: string;
      verifiedBy?: string;
      verifiedByRole?: string;
    }
  >;
}): ResolvedStaffPatientsVerification {
  const {
    nurseName,
    userRole,
    shiftInfo,
    sessions = [],
    masterNurses = [],
    overrideManagedPatients,
    overridePatientStatuses,
    overrideFacilityStatuses,
    overridePerPatientRecords
  } = params;

  if (!nurseName || nurseName === '-') {
    return {
      totalManagedCount: 0,
      unverifiedCount: 0,
      verifiedSnapshotsByDate: {}
    };
  }

  const fallbackDateStr = shiftInfo?.date || getCurrentIndonesianFullDate();

  // 1. Read managed patients list for this staff member
  let managedList: ManagedPatientMinimal[] = [];
  if (overrideManagedPatients) {
    managedList = overrideManagedPatients;
  } else if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const rawManaged = localStorage.getItem(getNurseManagedPatientsKey(nurseName));
      if (rawManaged) {
        const parsed = JSON.parse(rawManaged);
        if (Array.isArray(parsed) && parsed.length > 0) {
          managedList = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  const regEntry = getVerificationRegistry().find((e) =>
    isMatchingNurse(e.submittedNurseName, nurseName)
  );

  if (managedList.length === 0 && regEntry?.patients && regEntry.patients.length > 0) {
    managedList = regEntry.patients;
  }

  // Merge any sessions belonging to this nurse that aren't already in managedList
  const nurseSessions = sessions.filter((s) => isMatchingNurse(s.nurseInCharge, nurseName));
  const combinedPatients: Array<{
    id?: string;
    bedNumber: string;
    patientName: string;
    medicalRecord?: string;
    matchedSession?: PatientHDSession;
  }> = managedList.map((mp) => {
    const cleanRm = mp.medicalRecord?.trim();
    const cleanName = mp.patientName?.trim().toLowerCase();
    const matchedSession = nurseSessions.find((s) => {
      if (cleanRm && s.medicalRecordNumber?.trim() === cleanRm) return true;
      if (isSameBed(s.bedNumber, mp.bedNumber)) return true;
      if (cleanName && s.patientName.trim().toLowerCase() === cleanName) return true;
      return false;
    });
    return {
      id: mp.id,
      bedNumber: mp.bedNumber,
      patientName: mp.patientName,
      medicalRecord: mp.medicalRecord || matchedSession?.medicalRecordNumber,
      matchedSession
    };
  });

  nurseSessions.forEach((s) => {
    const alreadyExists = combinedPatients.some((cp) => {
      if (cp.medicalRecord && s.medicalRecordNumber && cp.medicalRecord.trim() === s.medicalRecordNumber.trim()) {
        return true;
      }
      if (isSameBed(cp.bedNumber, s.bedNumber)) return true;
      if (
        cp.patientName &&
        s.patientName &&
        cp.patientName.trim().toLowerCase() === s.patientName.trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    });
    if (!alreadyExists) {
      combinedPatients.push({
        id: s.id,
        bedNumber: s.bedNumber,
        patientName: s.patientName,
        medicalRecord: s.medicalRecordNumber,
        matchedSession: s
      });
    }
  });

  // 2. Read SPO statuses (Bagian I & Bagian II-VI)
  const facilityStatuses = overrideFacilityStatuses ?? readNurseFacilityStatuses(nurseName);

  let patientStatusesMap: Record<string, Record<string, boolean>> = {};
  if (overridePatientStatuses) {
    patientStatusesMap = overridePatientStatuses;
  } else if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const rawStat = localStorage.getItem(getNursePatientStatusesKey(nurseName));
      if (rawStat) {
        const parsed = JSON.parse(rawStat);
        if (parsed && typeof parsed === 'object') {
          patientStatusesMap = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Read per-patient verification overrides
  let perPatMap: Record<
    string,
    {
      status: string;
      verifiedAt?: string;
      verifiedBy?: string;
      verifiedByRole?: string;
    }
  > = {};
  if (overridePerPatientRecords) {
    perPatMap = overridePerPatientRecords;
  } else if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const rawPerPat = localStorage.getItem(PER_PATIENT_STATUS_STORAGE_KEY);
      if (rawPerPat) {
        const parsed = JSON.parse(rawPerPat);
        if (parsed && typeof parsed === 'object') {
          perPatMap = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  const nurseVerifInfo = getNurseVerificationInfo(nurseName, masterNurses);

  const groupedByDate: Record<
    string,
    {
      parsedDate: ParsedLogbookDate;
      checksList: Array<Record<string, boolean>>;
      verifiedBy?: string;
      verifiedByRole?: string;
      verifiedAt?: string;
    }
  > = {};

  let verifiedCountTotal = 0;

  combinedPatients.forEach((pat) => {
    const kExact = buildPatientVerificationKey(nurseName, pat.bedNumber, pat.medicalRecord);
    const kNoRm = buildPatientVerificationKey(nurseName, pat.bedNumber, '0');
    const perPatRec = perPatMap[kExact] || perPatMap[kNoRm];

    let isVerified = false;
    let verifiedBy: string | undefined;
    let verifiedByRole: string | undefined;
    let verifiedAt: string | undefined;

    if (perPatRec && perPatRec.status) {
      if (perPatRec.status === 'terverifikasi') {
        isVerified = true;
        verifiedBy = perPatRec.verifiedBy;
        verifiedByRole = perPatRec.verifiedByRole;
        verifiedAt = perPatRec.verifiedAt;
      } else {
        isVerified = false;
      }
    } else if (pat.matchedSession) {
      const sVerif = isSessionVerifiedByPj(pat.matchedSession, masterNurses);
      isVerified = sVerif.isVerified;
      verifiedBy = sVerif.verifiedBy;
      verifiedByRole = sVerif.verifiedByRole;
      verifiedAt = sVerif.verifiedAt;
    } else if (nurseVerifInfo.isVerified) {
      isVerified = true;
      verifiedBy = nurseVerifInfo.verifiedBy;
      verifiedByRole = nurseVerifInfo.verifiedByRole;
      verifiedAt = nurseVerifInfo.verifiedAt;
    }

    const eligible = isVerificationEligibleForStaffRole({
      staffName: nurseName,
      staffRole: userRole,
      isVerified,
      verifiedBy,
      verifiedByRole
    });

    if (!eligible) return;

    verifiedCountTotal++;

    // Resolve SPO checklist map for this verified patient
    let resolvedChecks: Record<string, boolean> | undefined =
      (pat.id ? patientStatusesMap[pat.id] : undefined) ||
      patientStatusesMap[pat.bedNumber] ||
      (pat.matchedSession?.id ? patientStatusesMap[pat.matchedSession.id] : undefined);

    if (!resolvedChecks) {
      const matchedMp = managedList.find(
        (mp) =>
          (mp.medicalRecord &&
            pat.medicalRecord &&
            mp.medicalRecord.trim() === pat.medicalRecord.trim()) ||
          isSameBed(mp.bedNumber, pat.bedNumber)
      );
      if (matchedMp?.id && patientStatusesMap[matchedMp.id]) {
        resolvedChecks = patientStatusesMap[matchedMp.id];
      }
    }

    const parsedDate = parseIndonesianLogbookDate(
      verifiedAt || regEntry?.submittedAt,
      fallbackDateStr
    );

    if (!groupedByDate[parsedDate.dateKey]) {
      groupedByDate[parsedDate.dateKey] = {
        parsedDate,
        checksList: [],
        verifiedBy,
        verifiedByRole,
        verifiedAt
      };
    }

    groupedByDate[parsedDate.dateKey].checksList.push(resolvedChecks || {});
  });

  const verifiedSnapshotsByDate: Record<string, VerifiedDailySnapshot> = {};
  Object.entries(groupedByDate).forEach(([dateKey, group]) => {
    const computed = computeDailySpoScoresFromVerifiedLogbook(
      facilityStatuses,
      group.checksList
    );
    if (computed) {
      verifiedSnapshotsByDate[dateKey] = {
        dateKey,
        day: group.parsedDate.day,
        month: group.parsedDate.month,
        year: group.parsedDate.year,
        verifiedPatientCount: computed.verifiedPatientCount,
        scores: computed.scores,
        verifiedBy: group.verifiedBy,
        verifiedByRole: group.verifiedByRole,
        verifiedAt: group.verifiedAt,
        shift: (regEntry?.shift as ShiftName) || shiftInfo?.shift || 'Pagi'
      };
    }
  });

  return {
    totalManagedCount: combinedPatients.length,
    unverifiedCount: Math.max(0, combinedPatients.length - verifiedCountTotal),
    verifiedSnapshotsByDate
  };
}

/**
 * Syncs the persisted daily verified snapshot for a staff member whenever verification or revision happens.
 */
export function syncNurseVerifiedDailySnapshot(params: {
  nurseName: string;
  userRole: SystemAccessRole;
  shiftInfo?: ShiftInfo;
  sessions?: PatientHDSession[];
  masterNurses?: MasterNurse[];
}): void {
  const { nurseName, userRole, shiftInfo, sessions, masterNurses } = params;
  if (!nurseName || nurseName === '-') return;

  const activeParsed = parseIndonesianLogbookDate(shiftInfo?.date);
  const live = resolveLiveStaffVerifiedSnapshots({
    nurseName,
    userRole,
    shiftInfo,
    sessions,
    masterNurses
  });

  const stored = readStoredMonthlySnapshots(nurseName);
  const nextStored: Record<string, VerifiedDailySnapshot> = { ...stored };

  // Update active shift date from live state (delete if returned for revision / unverified)
  if (live.verifiedSnapshotsByDate[activeParsed.dateKey]) {
    nextStored[activeParsed.dateKey] = live.verifiedSnapshotsByDate[activeParsed.dateKey];
  } else {
    delete nextStored[activeParsed.dateKey];
  }

  // Also upsert any other verified dates found in live state
  Object.entries(live.verifiedSnapshotsByDate).forEach(([dKey, snap]) => {
    nextStored[dKey] = snap;
  });

  writeStoredMonthlySnapshots(nurseName, nextStored);
}

/**
 * Builds the complete Monthly Report (Laporan Bulanan) data structure for a staff member.
 */
export function buildStaffMonthlyRecap(params: {
  nurseName: string;
  nurseNip?: string;
  userRole: SystemAccessRole;
  shiftInfo?: ShiftInfo;
  sessions?: PatientHDSession[];
  masterNurses?: MasterNurse[];
  targetMonth?: number;
  targetYear?: number;
  storedSnapshotsOverride?: Record<string, VerifiedDailySnapshot>;
  liveVerificationOverride?: ResolvedStaffPatientsVerification;
}): StaffMonthlyRecapResult {
  const {
    nurseName,
    nurseNip = '-',
    userRole,
    shiftInfo,
    sessions = [],
    masterNurses = [],
    targetMonth,
    targetYear,
    storedSnapshotsOverride,
    liveVerificationOverride
  } = params;

  const activeDateParsed = parseIndonesianLogbookDate(shiftInfo?.date);
  const month = targetMonth ?? activeDateParsed.month;
  const year = targetYear ?? activeDateParsed.year;
  const monthName = getMonthLabel(month);
  const daysInMonth = getDaysInMonth(year, month);
  const monthYearLabel = `${monthName} / ${year}`;

  const storedSnapshots = storedSnapshotsOverride ?? readStoredMonthlySnapshots(nurseName);
  const liveVerification =
    liveVerificationOverride ??
    resolveLiveStaffVerifiedSnapshots({
      nurseName,
      userRole,
      shiftInfo,
      sessions,
      masterNurses
    });

  // Merge historical snapshots in this month with live verified snapshots
  const effectiveMonthSnapshots: Record<number, VerifiedDailySnapshot> = {};

  Object.values(storedSnapshots).forEach((snap) => {
    if (
      snap &&
      snap.year === year &&
      snap.month === month &&
      snap.dateKey !== activeDateParsed.dateKey &&
      snap.verifiedPatientCount > 0
    ) {
      effectiveMonthSnapshots[snap.day] = snap;
    }
  });

  Object.values(liveVerification.verifiedSnapshotsByDate).forEach((snap) => {
    if (snap && snap.year === year && snap.month === month && snap.verifiedPatientCount > 0) {
      effectiveMonthSnapshots[snap.day] = snap;
    }
  });

  const dailyScores: Record<string, (number | null)[]> = {};
  const checks: Record<string, boolean[]> = {};
  const notes: Record<string, string> = {};
  const dailyVerifiedPatientCounts: number[] = new Array(31).fill(0);
  const verifiedDays: boolean[] = new Array(31).fill(false);

  for (let d = 1; d <= 31; d++) {
    const snap = d <= daysInMonth ? effectiveMonthSnapshots[d] : undefined;
    if (snap && snap.verifiedPatientCount > 0) {
      verifiedDays[d - 1] = true;
      dailyVerifiedPatientCounts[d - 1] = snap.verifiedPatientCount;
    }
  }

  const verifiedDaysCount = verifiedDays.filter(Boolean).length;
  const totalVerifiedPatientsInMonth = dailyVerifiedPatientCounts.reduce((a, b) => a + b, 0);

  const itemStats: Record<string, MonthlyItemSummaryStat> = {};

  OFFICIAL_LOGBOOK_ITEMS.forEach((item) => {
    const rowScores: (number | null)[] = new Array(31).fill(null);
    const rowChecks: boolean[] = new Array(31).fill(false);
    let totalScore = 0;

    for (let d = 1; d <= 31; d++) {
      const snap = d <= daysInMonth ? effectiveMonthSnapshots[d] : undefined;
      if (snap && snap.verifiedPatientCount > 0) {
        const val = typeof snap.scores[item.code] === 'number' ? snap.scores[item.code] : 0;
        rowScores[d - 1] = val;
        rowChecks[d - 1] = val > 0;
        totalScore += val;
      }
    }

    const maxScore = item.bagian === 1 ? verifiedDaysCount : totalVerifiedPatientsInMonth;
    const pct = maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(1)) : 0;

    dailyScores[item.code] = rowScores;
    checks[item.code] = rowChecks;
    itemStats[item.code] = {
      code: item.code,
      bagian: item.bagian,
      totalScore,
      maxScore,
      pct
    };

    if (maxScore === 0) {
      notes[item.code] = '-';
    } else if (totalScore === maxScore) {
      notes[item.code] = 'Terverifikasi (100%)';
    } else {
      notes[item.code] = `${totalScore}/${maxScore} (${pct}%)`;
    }
  });

  const dailyTotalScores: (number | null)[] = new Array(31).fill(null);
  const dailyMaxScores: (number | null)[] = new Array(31).fill(null);

  for (let d = 1; d <= 31; d++) {
    const snap = d <= daysInMonth ? effectiveMonthSnapshots[d] : undefined;
    if (snap && snap.verifiedPatientCount > 0) {
      const daySum = OFFICIAL_LOGBOOK_ITEMS.reduce(
        (acc, it) => acc + (snap.scores[it.code] ?? 0),
        0
      );
      const dayMax = 3 + 26 * snap.verifiedPatientCount;
      dailyTotalScores[d - 1] = daySum;
      dailyMaxScores[d - 1] = dayMax;
    }
  }

  const grandTotalScore = Object.values(itemStats).reduce((acc, st) => acc + st.totalScore, 0);
  const grandMaxScore = Object.values(itemStats).reduce((acc, st) => acc + st.maxScore, 0);
  const overallCompliancePct =
    grandMaxScore > 0 ? Number(((grandTotalScore / grandMaxScore) * 100).toFixed(1)) : 0;

  // Resolve latest verifier metadata across verified snapshots
  const sortedVerifiedDays = Object.values(effectiveMonthSnapshots).sort((a, b) => b.day - a.day);
  const latestSnapshot = sortedVerifiedDays[0];

  const karu = masterNurses.find(
    (n) => n.role === 'kepala_ruangan' || n.systemAccess === 'kepala_ruangan'
  );
  const resolvedVerifierName =
    latestSnapshot?.verifiedBy ||
    karu?.name ||
    (shiftInfo?.kepalaRuangan && shiftInfo.kepalaRuangan !== '-'
      ? shiftInfo.kepalaRuangan
      : shiftInfo?.pjShift || '-');
  const resolvedVerifierNip =
    masterNurses.find((n) => isMatchingNurse(n.name, resolvedVerifierName))?.nip ||
    karu?.nip ||
    '-';

  const resolvedNurseName = nurseName && nurseName !== '-' ? nurseName : '-';
  const hasVerifiedData = verifiedDaysCount > 0;

  const logbook: OfficialNurseLogbookMonth = {
    nurseName: resolvedNurseName,
    nipNira: nurseNip || '-',
    nurseRole: userRole,
    unitName: 'Unit Hemodialisis (Dialysis Center)',
    monthYear: monthYearLabel,
    daysInMonth,
    pkLevel: 'PK III Dialisis',
    shift: latestSnapshot?.shift || shiftInfo?.shift || 'Pagi',
    checks,
    dailyScores,
    dailyVerifiedPatientCounts,
    verifiedDays,
    verifierName: resolvedVerifierName,
    verifierRoleLabel: latestSnapshot?.verifiedByRole || 'PJ Shift / Kepala Ruang',
    notes,
    nurseSigned: hasVerifiedData && resolvedNurseName !== '-',
    nurseSignedAt: latestSnapshot?.verifiedAt || '',
    headNurseName: resolvedVerifierName,
    headNurseNip: resolvedVerifierNip,
    headNurseSigned: hasVerifiedData && resolvedVerifierName !== '-',
    headNurseSignedAt: latestSnapshot?.verifiedAt || ''
  };

  return {
    logbook,
    roleLabel: formatStaffRoleTitle(userRole),
    daysInMonth,
    verifiedDaysCount,
    totalVerifiedPatientsInMonth,
    unverifiedPatientsCount: liveVerification.unverifiedCount,
    totalManagedToday: liveVerification.totalManagedCount,
    itemStats,
    dailyTotalScores,
    dailyMaxScores,
    grandTotalScore,
    grandMaxScore,
    overallCompliancePct
  };
}
