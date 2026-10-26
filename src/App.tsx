/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  PatientHDSession,
  ShiftInfo,
  MachineOverview,
  OperationalItem,
  SbarData,
  ShiftSignatures,
  MasterPatient,
  MasterNurse,
  MasterBed,
  SystemAccessRole,
  HdTreatmentDay
} from './types/dialysis.ts';
import {
  initialShiftInfo,
  initialMachineOverview,
  initialOperationalItems,
  initialSbar,
  initialPatients,
  benchmarkShiftInfo,
  benchmarkMachineOverview,
  benchmarkSamplePatients
} from './data/mockShiftData.ts';
import {
  initialMasterPatients,
  initialMasterNurses,
  initialMasterBeds,
  sampleBenchmarkPatients,
  sampleBenchmarkNurses,
  sampleBenchmarkBeds
} from './data/mockMasterData.ts';
import {
  computeCensusAndAccess,
  computeClinicalIndicators
} from './utils/hdCalculator.ts';
import {
  calculateStaffingDetails,
  canAccessMasterData,
  canVerifyLogbook,
  filterMasterPatientsForActiveSchedule,
  getAccessibleTabs,
  getDefaultTabForRole,
  normalizeMasterPatient,
  resolveNurseSystemAccess,
  updateMasterNurseData
} from './utils/masterDataHelpers.ts';
import { ensureFullBagianData } from './utils/logbookStandards.ts';
import { AppShellLayout, HeaderNavTab } from './components/HeaderNavbar.tsx';
import { PelaksanaView } from './components/PelaksanaView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { LapHarianView } from './components/LapHarianView.tsx';
import { VerifikasiView } from './components/VerifikasiView.tsx';
import { RiwayatView } from './components/RiwayatView.tsx';
import { LapBulananView } from './components/LapBulananView.tsx';
import { SessionModal } from './components/SessionModal.tsx';
import { DeviceAccessModal } from './components/DeviceAccessModal.tsx';
import {
  testFirestoreConnection,
  subscribeToDialysisSessions,
  saveDialysisSessionCloud,
  deleteDialysisSessionCloud,
  subscribeToShiftReport,
  saveShiftReportCloud,
  subscribeToMasterPatients,
  saveMasterPatientsCloud,
  subscribeToMasterNurses,
  saveMasterNursesCloud,
  subscribeToVerificationRegistry,
  saveVerificationRegistryCloud
} from './services/firebase.ts';
import { VERIFICATION_REGISTRY_STORAGE_KEY } from './utils/nurseVerificationHelpers.ts';
import { SystemDesignExplainerModal } from './components/SystemDesignExplainerModal.tsx';
import { MasterDataManagementModal } from './components/MasterDataManagementModal.tsx';
import { MasterDataView } from './components/MasterDataView.tsx';
import { MyAccountView } from './components/MyAccountView.tsx';
import { LoginPage, LoginUserData } from './components/LoginPage.tsx';
import { useCleanHospitalBackground } from './utils/useCleanHospitalBackground.ts';
import {
  isMatchingNurse,
  isSameBed,
  isKepalaRuangVerifier,
  resetVerificationStorageToBenchmark
} from './utils/nurseVerificationHelpers.ts';
import {
  extractActiveDayName,
  formatCurrentWibTimestamp,
  formatIsoDateToIndonesianFull,
  formatShortIndonesianTimestampWib,
  getCurrentIndonesianFullDate,
  getCurrentIsoDateWib,
  indonesianDateLabelToIso
} from './utils/dateHelpers.ts';
import { ManagedPatient, PjVerificationStatus } from './components/Logbook5ButtonsView.tsx';

function loadPersistedArray<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as T[];
      }
    }
  } catch {
    // ignore corrupt localStorage
  }
  return fallback;
}

export default function App() {
  const {
    bgSrc: hospitalBgSrc,
    hasError: hospitalBgError,
    onImageError: handleHospitalBgError
  } = useCleanHospitalBackground();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loggedInUser, setLoggedInUser] = useState<LoginUserData | null>(null);
  const [userRole, setUserRole] = useState<SystemAccessRole>('perawat_pelaksana');
  const [, setActiveRole] = useState<'pelaksana' | 'pj_shift'>('pelaksana');
  const [currentTab, setCurrentTab] = useState<HeaderNavTab>('dashboard');
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);

  const patientStorageKey = `master_patients_v6_${initialMasterPatients.length}`;
  const bedStorageKey = `master_beds_v6_${initialMasterBeds.length}`;

  // Master Data State persisted across sessions
  const [masterPatients, setMasterPatients] = useState<MasterPatient[]>(() => {
    try {
      const rawCurrent = localStorage.getItem(patientStorageKey);
      if (rawCurrent) {
        const parsedCurrent = JSON.parse(rawCurrent);
        if (Array.isArray(parsedCurrent) && parsedCurrent.length > 0) {
          return (parsedCurrent as MasterPatient[]).map(normalizeMasterPatient);
        }
      }

      // Find most recent previous master_patients_* storage to preserve edits & custom patients
      let legacyPatients: MasterPatient[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('master_patients_') && k !== patientStorageKey) {
          const rawLegacy = localStorage.getItem(k);
          if (rawLegacy) {
            const parsed = JSON.parse(rawLegacy);
            if (Array.isArray(parsed) && parsed.length > legacyPatients.length) {
              legacyPatients = parsed as MasterPatient[];
            }
          }
        }
      }

      if (legacyPatients.length > 0) {
        const legacyById = new Map(legacyPatients.map((p) => [p.id, p]));
        const merged = initialMasterPatients.map((seedPat) => legacyById.get(seedPat.id) || seedPat);
        const existingCustom = legacyPatients.filter((p) => !p.id?.startsWith('pat-hdhl-'));
        existingCustom.forEach((customPat) => {
          const duplicate = merged.some(
            (s) =>
              s.patientName.trim().toLowerCase() ===
                customPat.patientName.trim().toLowerCase() ||
              (customPat.medicalRecordNumber &&
                s.medicalRecordNumber === customPat.medicalRecordNumber)
          );
          if (!duplicate) {
            merged.push(customPat);
          }
        });
        return merged.map(normalizeMasterPatient);
      }
    } catch {
      // ignore corrupt localStorage
    }

    return initialMasterPatients.map(normalizeMasterPatient);
  });
  const [masterNurses, setMasterNurses] = useState<MasterNurse[]>(() => {
    try {
      const rawV7 = localStorage.getItem('master_nurses_v7');
      if (rawV7) {
        const parsedV7 = JSON.parse(rawV7);
        if (Array.isArray(parsedV7) && parsedV7.length > 0) {
          return (parsedV7 as MasterNurse[]).map((n) => ({
            ...n,
            systemAccess: resolveNurseSystemAccess(n)
          }));
        }
      }

      // Preserve any custom user-added nurses from v5/v6 while replacing synthetic seed records
      const legacyRaw =
        localStorage.getItem('master_nurses_v6') || localStorage.getItem('master_nurses_v5');
      if (legacyRaw) {
        const parsedLegacy = JSON.parse(legacyRaw);
        if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
          const customOnly = (parsedLegacy as MasterNurse[]).filter(
            (m) => !m.id?.startsWith('nurse-rshl-') && !m.id?.startsWith('nurse-hdhl-')
          );
          const merged = [...initialMasterNurses];
          customOnly.forEach((customNurse) => {
            const duplicate = merged.some(
              (s) =>
                (customNurse.username &&
                  s.username &&
                  customNurse.username.toLowerCase() === s.username.toLowerCase()) ||
                (customNurse.nip && s.nip === customNurse.nip)
            );
            if (!duplicate) {
              merged.push(customNurse);
            }
          });
          return merged.map((n) => ({
            ...n,
            systemAccess: resolveNurseSystemAccess(n)
          }));
        }
      }
    } catch {
      // ignore corrupt localStorage
    }

    return initialMasterNurses.map((n) => ({
      ...n,
      systemAccess: resolveNurseSystemAccess(n)
    }));
  });
  const [masterBeds, setMasterBeds] = useState<MasterBed[]>(() => {
    try {
      localStorage.removeItem('master_beds_v5');
    } catch {
      // ignore
    }
    return loadPersistedArray<MasterBed>(bedStorageKey, initialMasterBeds);
  });

  useEffect(() => {
    try {
      localStorage.setItem(patientStorageKey, JSON.stringify(masterPatients));
    } catch {
      // ignore storage quota errors
    }
  }, [masterPatients, patientStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem('master_nurses_v7', JSON.stringify(masterNurses));
    } catch {
      // ignore storage quota errors
    }
  }, [masterNurses]);

  useEffect(() => {
    try {
      localStorage.setItem(bedStorageKey, JSON.stringify(masterBeds));
    } catch {
      // ignore storage quota errors
    }
  }, [masterBeds, bedStorageKey]);

  // Enforce strict RBAC tab access whenever userRole or currentTab changes
  const accessibleTabs = useMemo(() => getAccessibleTabs(userRole), [userRole]);

  useEffect(() => {
    if (!accessibleTabs.includes(currentTab)) {
      setCurrentTab(getDefaultTabForRole(userRole));
    }
  }, [accessibleTabs, currentTab, userRole]);

  const handleSelectTab = (tab: HeaderNavTab) => {
    const allowed = getAccessibleTabs(userRole);
    if (!allowed.includes(tab)) {
      setCurrentTab(getDefaultTabForRole(userRole));
      return;
    }
    setCurrentTab(tab);
    if (tab === 'dashboard' || tab === 'verifikasi' || tab === 'lap_harian') {
      setActiveRole('pj_shift');
    } else if (tab === 'logbook') {
      setActiveRole('pelaksana');
    }
  };

  const handleRoleChange = (newRole: SystemAccessRole) => {
    setUserRole(newRole);
    const allowed = getAccessibleTabs(newRole);
    if (!allowed.includes(currentTab)) {
      const nextDefault = getDefaultTabForRole(newRole);
      setCurrentTab(nextDefault);
      setActiveRole(nextDefault === 'logbook' ? 'pelaksana' : 'pj_shift');
    }
  };

  const handleLogin = (userData: LoginUserData) => {
    setIsAuthenticated(true);
    setLoggedInUser(userData);
    const role: SystemAccessRole = userData.userRole || 'perawat_pelaksana';
    setUserRole(role);
    const nextDefault = getDefaultTabForRole(role);
    setCurrentTab(nextDefault);
    setActiveRole(role === 'pj_shift' || role === 'kepala_ruangan' ? 'pj_shift' : 'pelaksana');

    const normalizedShift: 'Pagi' | 'Siang' = userData.shift === 'Siang' ? 'Siang' : 'Pagi';
    const matchingShiftPj =
      masterNurses.find(
        (n) =>
          n.accountStatus !== 'nonaktif' &&
          resolveNurseSystemAccess(n) === 'pj_shift' &&
          n.shiftAssigned === normalizedShift &&
          n.isOnDutyToday
      ) ||
      masterNurses.find(
        (n) =>
          n.accountStatus !== 'nonaktif' &&
          resolveNurseSystemAccess(n) === 'pj_shift' &&
          n.shiftAssigned === normalizedShift
      );
    const karuNurse = masterNurses.find(
      (n) => n.accountStatus !== 'nonaktif' && resolveNurseSystemAccess(n) === 'kepala_ruangan'
    );

    const resolvedShiftHours =
      normalizedShift === 'Siang'
        ? 'Siang, jam 14.00 - 21.00 WIB'
        : 'Pagi, jam 07.00 - 14.00 WIB';

    setLoggedInUser({
      ...userData,
      shift: normalizedShift,
      shiftHours: resolvedShiftHours
    });

    setShiftInfo((prev) => ({
      ...prev,
      date: isCustomDate ? prev.date : getCurrentIndonesianFullDate(),
      shift: normalizedShift,
      shiftHours: resolvedShiftHours,
      pjShift:
        role === 'pj_shift'
          ? userData.name
          : matchingShiftPj?.name || (prev.pjShift && prev.pjShift !== '-' ? prev.pjShift : '-'),
      kepalaRuangan:
        role === 'kepala_ruangan'
          ? userData.name
          : karuNurse?.name || (prev.kepalaRuangan && prev.kepalaRuangan !== '-' ? prev.kepalaRuangan : '-')
    }));
  };

  const handleLogbookShiftChange = (nextShift: 'Pagi' | 'Siang') => {
    const nextShiftHours =
      nextShift === 'Siang'
        ? 'Siang, jam 14.00 - 21.00 WIB'
        : 'Pagi, jam 07.00 - 14.00 WIB';

    try {
      localStorage.setItem('dialysis_last_logbook_shift', nextShift);
    } catch {
      // ignore
    }

    setShiftInfo((prev) => ({
      ...prev,
      shift: nextShift,
      shiftHours: nextShiftHours
    }));

    setLoggedInUser((prev) =>
      prev
        ? {
            ...prev,
            shift: nextShift,
            shiftHours: nextShiftHours
          }
        : prev
    );
  };

  const handleActiveDateChange = (nextIsoDate: string) => {
    if (!nextIsoDate) return;
    const todayIso = getCurrentIsoDateWib();
    const formatted = formatIsoDateToIndonesianFull(nextIsoDate);
    setIsCustomDate(nextIsoDate !== todayIso);
    setShiftInfo((prev) => ({
      ...prev,
      date: formatted
    }));
  };

  const handleResetDateToToday = () => {
    setIsCustomDate(false);
    setShiftInfo((prev) => ({
      ...prev,
      date: getCurrentIndonesianFullDate()
    }));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setLoggedInUser(null);
    setUserRole('perawat_pelaksana');
    setCurrentTab('dashboard');
    setActiveRole('pelaksana');
  };

  // Shift & Sessions state (v6 starts completely clean with zero built-in patient sessions)
  const [isCustomDate, setIsCustomDate] = useState<boolean>(false);
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo>(() => ({
    ...initialShiftInfo,
    date: getCurrentIndonesianFullDate()
  }));

  // Keep active day/date automatically synchronized with real-time WIB clock unless custom date selected
  useEffect(() => {
    if (isCustomDate) return;
    const syncLiveDate = () => {
      const liveDateLabel = getCurrentIndonesianFullDate();
      setShiftInfo((prev) => (prev.date === liveDateLabel ? prev : { ...prev, date: liveDateLabel }));
    };
    syncLiveDate();
    const timerId = window.setInterval(syncLiveDate, 15000);
    return () => window.clearInterval(timerId);
  }, [isCustomDate]);

  const isDateCustomFromToday =
    isCustomDate && indonesianDateLabelToIso(shiftInfo.date) !== getCurrentIsoDateWib();
  const [operationalItems, setOperationalItems] = useState<OperationalItem[]>(() =>
    loadPersistedArray<OperationalItem>('dialysis_operational_v1', initialOperationalItems)
  );
  const [sbar, setSbar] = useState<SbarData>(() => {
    try {
      const saved = localStorage.getItem('dialysis_sbar_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return initialSbar;
  });

  useEffect(() => {
    try {
      localStorage.setItem('dialysis_operational_v1', JSON.stringify(operationalItems));
    } catch {
      // ignore
    }
  }, [operationalItems]);

  useEffect(() => {
    try {
      localStorage.setItem('dialysis_sbar_v1', JSON.stringify(sbar));
    } catch {
      // ignore
    }
  }, [sbar]);
  const [sessions, setSessions] = useState<PatientHDSession[]>(() =>
    loadPersistedArray<PatientHDSession>('dialysis_sessions_v6', initialPatients).map(
      ensureFullBagianData
    )
  );

  useEffect(() => {
    try {
      localStorage.setItem('dialysis_sessions_v6', JSON.stringify(sessions));
    } catch {
      // ignore
    }
  }, [sessions]);

  // 1. Initial Firestore connectivity validation (per SKILL.md mandate)
  useEffect(() => {
    testFirestoreConnection().then((connected) => {
      setIsCloudConnected(connected);
    });
  }, []);

  // 2. Real-time multi-device cloud synchronization for Patient HD Sessions
  useEffect(() => {
    const unsubscribe = subscribeToDialysisSessions((cloudSessions) => {
      setIsCloudConnected(true);
      if (cloudSessions.length > 0) {
        setSessions(cloudSessions.map(ensureFullBagianData));
      }
    });

    return () => unsubscribe();
  }, []);

  // 3. Real-time multi-device cloud synchronization for Master Patients
  useEffect(() => {
    const unsub = subscribeToMasterPatients((cloudPatients) => {
      if (cloudPatients.length > 0) {
        setMasterPatients(cloudPatients.map(normalizeMasterPatient));
      }
    });
    return () => unsub();
  }, []);

  // 4. Real-time multi-device cloud synchronization for Master Nurses
  useEffect(() => {
    const unsub = subscribeToMasterNurses((cloudNurses) => {
      if (cloudNurses.length > 0) {
        setMasterNurses(
          cloudNurses.map((n) => ({
            ...n,
            systemAccess: resolveNurseSystemAccess(n)
          }))
        );
      }
    });
    return () => unsub();
  }, []);

  // 5. Real-time multi-device cloud synchronization for Verification Registry
  useEffect(() => {
    const unsub = subscribeToVerificationRegistry((cloudEntries) => {
      if (Array.isArray(cloudEntries) && cloudEntries.length > 0) {
        try {
          localStorage.setItem(VERIFICATION_REGISTRY_STORAGE_KEY, JSON.stringify(cloudEntries));
          window.dispatchEvent(new CustomEvent('verification_registry_updated'));
        } catch {
          // ignore
        }
      }
    });
    return () => unsub();
  }, []);

  // Synchronize managed patients & submission status from Logbook5ButtonsView into sessions
  const handleSyncNurseLogbookSessions = (
    nurseName: string,
    managedPatients: ManagedPatient[],
    verification: {
      status: PjVerificationStatus;
      verifiedAt?: string;
      verifiedBy?: string;
      verifiedByRole?: string;
      verifierNotes?: string;
    }
  ) => {
    if (!nurseName) return;
    setSessions((prev) => {
      const otherNurseSessions = prev.filter((s) => !isMatchingNurse(s.nurseInCharge, nurseName));
      const existingMySessions = prev.filter((s) => isMatchingNurse(s.nurseInCharge, nurseName));

      const isVerified = verification.status === 'terverifikasi';
      const isKaru =
        isVerified && isKepalaRuangVerifier(verification.verifiedByRole, verification.verifiedBy);

      const syncedMySessions: PatientHDSession[] = managedPatients.map((mp, idx) => {
        const cleanMpRm = mp.medicalRecord?.trim();
        const cleanMpName = mp.patientName.toLowerCase().trim();

        const foundExisting = existingMySessions.find((s) => {
          if (cleanMpRm && s.medicalRecordNumber?.trim() === cleanMpRm) return true;
          if (isSameBed(s.bedNumber, mp.bedNumber)) return true;
          if (cleanMpName && s.patientName.toLowerCase().trim() === cleanMpName) return true;
          return false;
        });

        if (foundExisting) {
          return {
            ...foundExisting,
            bedNumber: mp.bedNumber,
            patientName: mp.patientName,
            medicalRecordNumber: mp.medicalRecord || foundExisting.medicalRecordNumber,
            nurseInCharge: nurseName,
            isVerifiedByPj: isVerified,
            isVerifiedByKepalaRuang: isKaru,
            verificationStatus: verification.status,
            verifiedAt: isVerified
              ? verification.verifiedAt || foundExisting.verifiedAt
              : undefined,
            verifiedBy: isVerified
              ? verification.verifiedBy || foundExisting.verifiedBy
              : undefined,
            verifiedByRole: isVerified
              ? verification.verifiedByRole || foundExisting.verifiedByRole
              : undefined,
            verifierNotes: verification.verifierNotes ?? foundExisting.verifierNotes,
            updatedAt: new Date().toISOString()
          };
        }

        const masterMatch = masterPatients.find(
          (m) =>
            (cleanMpRm && m.medicalRecordNumber === cleanMpRm) ||
            m.patientName.toLowerCase().trim() === cleanMpName
        );

        return ensureFullBagianData({
          id: `sess-lb-${Date.now()}-${idx}`,
          bedNumber: mp.bedNumber,
          patientName: mp.patientName,
          medicalRecordNumber:
            mp.medicalRecord || masterMatch?.medicalRecordNumber || `4529${idx + 1}`,
          age: masterMatch?.age || 54,
          gender: masterMatch?.gender || 'L',
          status: masterMatch?.defaultStatus || 'rajal',
          category: masterMatch?.category || 'reguler',
          sessionStatus: 'selesai',
          isCito: false,
          shift: shiftInfo.shift,
          vascularAccess: masterMatch?.defaultVascularAccess || 'av_fistula',
          accessSite: masterMatch?.defaultAccessSite || 'AVF Radiocephalica',
          dialyzerModel: masterMatch?.defaultDialyzer || 'SAS HF 18',
          isReuse: false,
          dryWeight: masterMatch?.defaultDryWeight || 60.0,
          preWeight: (masterMatch?.defaultDryWeight || 60.0) + 2.4,
          postWeight: masterMatch?.defaultDryWeight || 60.0,
          targetUf: 2400,
          achievedUf: 2400,
          durationPrescribed: 4.5,
          durationActual: 4.5,
          bloodFlowQb: 220,
          dialysateFlowQd: 500,
          preBp: '140/85',
          postBp: '125/80',
          hasHypotension: false,
          hasMuscleCramps: false,
          hasClotting: false,
          hasFirstUseSyndrome: false,
          hasAccessBleeding: false,
          hasConsultDpjp: false,
          underUfTolerated: false,
          nurseInCharge: nurseName,
          nurseNotes: 'Asuhan hemodialisis & checklist SPO Bagian I–VI terisi lengkap.',
          isVerifiedByPj: isVerified,
          isVerifiedByKepalaRuang: isKaru,
          verificationStatus: verification.status,
          verifiedAt: isVerified ? verification.verifiedAt : undefined,
          verifiedBy: isVerified ? verification.verifiedBy : undefined,
          verifiedByRole: isVerified ? verification.verifiedByRole : undefined,
          verifierNotes: verification.verifierNotes,
          updatedAt: new Date().toISOString()
        });
      });

      // Persist to Cloud Firestore for real-time synchronization across devices
      syncedMySessions.forEach((sessionItem) => {
        saveDialysisSessionCloud(sessionItem).catch((err) => {
          console.warn('Could not sync session to Firestore:', err);
        });
      });

      return [...otherNurseSessions, ...syncedMySessions];
    });
  };

  // Sync session verification status when PJ Shift or Kepala Ruang verifies a nurse's entire logbook
  const handleNurseVerificationUpdated = (
    nurseName: string,
    status: PjVerificationStatus,
    details: {
      verifiedAt?: string;
      verifiedBy?: string;
      verifiedByRole?: string;
      verifierNotes?: string;
    }
  ) => {
    const isVerified = status === 'terverifikasi';
    const isKaru =
      isVerified && isKepalaRuangVerifier(details.verifiedByRole, details.verifiedBy);

    setSessions((prev) =>
      prev.map((s) => {
        if (isMatchingNurse(s.nurseInCharge, nurseName)) {
          const updatedSession = {
            ...s,
            isVerifiedByPj: isVerified,
            isKepalaRuangVerifier: isKaru,
            verificationStatus: status,
            verifiedAt: isVerified ? details.verifiedAt : undefined,
            verifiedBy: isVerified ? details.verifiedBy : undefined,
            verifiedByRole: isVerified ? details.verifiedByRole : undefined,
            verifierNotes: details.verifierNotes
          };
          saveDialysisSessionCloud(updatedSession).catch(() => {});
          return updatedSession;
        }
        return s;
      })
    );
  };

  // Sync individual patient verification status scoped strictly by managing nurse + bed/RM
  const handleVerifyPatientSession = (
    patientIdentifier: { bedNumber?: string; patientName?: string; medicalRecord?: string },
    verified: boolean,
    details: {
      verifiedAt?: string;
      verifiedBy?: string;
      verifiedByRole?: string;
      verifierNotes?: string;
      nurseName?: string;
    }
  ) => {
    const isKaru =
      verified && isKepalaRuangVerifier(details.verifiedByRole, details.verifiedBy);

    setSessions((prev) => {
      let matched = false;
      const cleanTargetName = (patientIdentifier.patientName || '').toLowerCase().trim();
      const cleanTargetRm = patientIdentifier.medicalRecord?.trim();

      const updated = prev.map((s) => {
        if (details.nurseName && s.nurseInCharge && !isMatchingNurse(s.nurseInCharge, details.nurseName)) {
          return s;
        }

        const matchesRm = Boolean(cleanTargetRm && s.medicalRecordNumber?.trim() === cleanTargetRm);
        const matchesBed = isSameBed(s.bedNumber, patientIdentifier.bedNumber);
        const matchesName =
          cleanTargetName.length > 3 && s.patientName.toLowerCase().trim() === cleanTargetName;

        if (matchesRm || matchesBed || matchesName) {
          matched = true;
          return {
            ...s,
            nurseInCharge: s.nurseInCharge || details.nurseName || shiftInfo.pjShift,
            isVerifiedByPj: verified,
            isVerifiedByKepalaRuang: isKaru,
            verificationStatus: (verified ? 'terverifikasi' : 'belum_diajukan') as
              | 'terverifikasi'
              | 'belum_diajukan',
            verifiedAt: verified ? details.verifiedAt : undefined,
            verifiedBy: verified ? details.verifiedBy : undefined,
            verifiedByRole: verified ? details.verifiedByRole : undefined,
            verifierNotes: details.verifierNotes
          };
        }
        return s;
      });

      // If this verified logbook patient was not already in sessions, create and append it
      if (!matched && verified && (patientIdentifier.patientName || patientIdentifier.bedNumber)) {
        const newSession: PatientHDSession = ensureFullBagianData({
          id: `sess-verif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          bedNumber: patientIdentifier.bedNumber || masterBeds[0]?.bedNumber || 'BED A01',
          patientName: patientIdentifier.patientName || 'Pasien Dialisis',
          medicalRecordNumber: patientIdentifier.medicalRecord || '452100',
          age: 55,
          gender: 'L',
          status: 'rajal',
          category: 'reguler',
          sessionStatus: 'selesai',
          isCito: false,
          vascularAccess: 'av_fistula',
          accessSite: 'AVF Radiocephalica',
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
          preBp: '140/85',
          postBp: '125/80',
          hasHypotension: false,
          hasMuscleCramps: false,
          hasClotting: false,
          hasFirstUseSyndrome: false,
          hasAccessBleeding: false,
          hasConsultDpjp: false,
          underUfTolerated: false,
          nurseInCharge: details.nurseName || shiftInfo.pjShift,
          nurseNotes: 'Sesi hemodialisis dan checklist Bagian I–VI terisi lengkap.',
          isVerifiedByPj: true,
          isVerifiedByKepalaRuang: isKaru,
          verificationStatus: 'terverifikasi' as const,
          verifiedAt: details.verifiedAt || formatCurrentWibTimestamp(shiftInfo.date),
          verifiedBy: details.verifiedBy || (isKaru ? shiftInfo.kepalaRuangan : shiftInfo.pjShift),
          verifiedByRole: details.verifiedByRole || (isKaru ? 'Kepala Ruangan' : 'PJ Shift'),
          verifierNotes: details.verifierNotes,
          updatedAt: new Date().toISOString()
        });
        saveDialysisSessionCloud(newSession).catch(() => {});
        return [...updated, newSession];
      }

      updated.forEach((s) => {
        if (
          s.isVerifiedByPj === verified &&
          (s.patientName === patientIdentifier.patientName || s.bedNumber === patientIdentifier.bedNumber)
        ) {
          saveDialysisSessionCloud(s).catch(() => {});
        }
      });

      return updated;
    });
  };

  // Digital Signatures state (initial unsigned, persisted in localStorage)
  const [signatures, setSignatures] = useState<ShiftSignatures>(() => {
    try {
      const saved = localStorage.getItem('dialysis_signatures_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      pjShift: { name: initialShiftInfo.pjShift, signed: false, signedAt: '' },
      pjBerikutnya: { name: initialShiftInfo.pjShiftBerikutnya, signed: false, signedAt: '' },
      kepalaRuangan: { name: initialShiftInfo.kepalaRuangan, signed: false, signedAt: '' }
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('dialysis_signatures_v1', JSON.stringify(signatures));
    } catch {
      // ignore
    }
  }, [signatures]);

  // Modal states
  const [selectedSession, setSelectedSession] = useState<PatientHDSession | null>(null);
  const [sessionModalTab, setSessionModalTab] = useState<
    'bagian1' | 'bagian2' | 'bagian3' | 'bagian4' | 'bagian5'
  >('bagian3');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isExplainerModalOpen, setIsExplainerModalOpen] = useState(false);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [isDeviceAccessOpen, setIsDeviceAccessOpen] = useState(false);

  // Compute scheduled patient count specifically for the active day and shift (e.g. Senin Pagi / Senin Siang)
  const scheduledCountForShift = useMemo(() => {
    const activeDay = extractActiveDayName(shiftInfo.date) as HdTreatmentDay;
    const activeShift: 'Pagi' | 'Siang' = shiftInfo.shift === 'Siang' ? 'Siang' : 'Pagi';
    const scheduled = filterMasterPatientsForActiveSchedule(
      masterPatients,
      activeDay,
      activeShift
    );
    return scheduled.length;
  }, [masterPatients, shiftInfo.date, shiftInfo.shift]);

  // Compute live census and indicators dynamically from patient sessions
  const liveCensus = useMemo(() => {
    return computeCensusAndAccess(sessions, scheduledCountForShift);
  }, [sessions, scheduledCountForShift]);

  const liveClinicalIndicators = useMemo(() => {
    return computeClinicalIndicators(sessions);
  }, [sessions]);

  const [machineOverview, setMachineOverview] = useState<MachineOverview>(initialMachineOverview);

  // Sync machine overview whenever master beds change
  useEffect(() => {
    const total = masterBeds.length;
    const maintenance = masterBeds.filter((b) => b.status === 'maintenance').length;
    const ready = total - maintenance;
    const hepB = masterBeds.filter(
      (b) => b.designation === 'isolasi' || b.designation === 'isolasi_hepb'
    ).length;
    const hepC = masterBeds.filter((b) => b.designation === 'isolasi_hepc').length;
    setMachineOverview({
      totalCapacity: total,
      beroperasiSiapPakai: ready,
      maintenance,
      khususHepB: hepB,
      khususHepC: hepC
    });
  }, [masterBeds]);

  // Sync shift manpower, PJ Shift, Kepala Ruangan, and ratio dynamically whenever nurses or sessions change
  useEffect(() => {
    const staffing = calculateStaffingDetails(masterNurses, sessions.length);
    const activeNurses = masterNurses.filter((n) => n.accountStatus !== 'nonaktif');
    const karu = activeNurses.find((n) => resolveNurseSystemAccess(n) === 'kepala_ruangan');
    const shiftPj =
      activeNurses.find(
        (n) =>
          resolveNurseSystemAccess(n) === 'pj_shift' &&
          n.shiftAssigned === shiftInfo.shift &&
          n.isOnDutyToday
      ) ||
      activeNurses.find(
        (n) => resolveNurseSystemAccess(n) === 'pj_shift' && n.shiftAssigned === shiftInfo.shift
      ) ||
      activeNurses.find((n) => resolveNurseSystemAccess(n) === 'pj_shift');

    setShiftInfo((prev) => ({
      ...prev,
      pjShift:
        userRole === 'pj_shift' && loggedInUser?.name
          ? loggedInUser.name
          : shiftPj?.name || '-',
      kepalaRuangan:
        userRole === 'kepala_ruangan' && loggedInUser?.name
          ? loggedInUser.name
          : karu?.name || '-',
      totalPerawatDinas: staffing.totalDinas,
      detailPerawat: staffing.detailText,
      perawatRatio: staffing.ratioText
    }));
  }, [masterNurses, sessions.length, shiftInfo.shift, userRole, loggedInUser?.name]);

  const handleNurseDutySync = () => {
    const staffing = calculateStaffingDetails(masterNurses, sessions.length);
    setShiftInfo((prev) => ({
      ...prev,
      totalPerawatDinas: staffing.totalDinas,
      detailPerawat: staffing.detailText,
      perawatRatio: staffing.ratioText
    }));
  };

  // Propagate nurse name / role / account updates across active sessions, shiftInfo, and loggedInUser
  const handleNurseUpdated = (oldNurse: MasterNurse, updatedNurse: MasterNurse) => {
    if (oldNurse.name !== updatedNurse.name) {
      setSessions((prev) =>
        prev.map((s) =>
          s.nurseInCharge === oldNurse.name ? { ...s, nurseInCharge: updatedNurse.name } : s
        )
      );
    }

    setShiftInfo((prev) => ({
      ...prev,
      pjShift:
        updatedNurse.role === 'pj_shift' && updatedNurse.isOnDutyToday
          ? updatedNurse.name
          : prev.pjShift === oldNurse.name
          ? updatedNurse.name
          : prev.pjShift,
      kepalaRuangan:
        updatedNurse.role === 'kepala_ruangan'
          ? updatedNurse.name
          : prev.kepalaRuangan === oldNurse.name
          ? updatedNurse.name
          : prev.kepalaRuangan
    }));

    setLoggedInUser((prev) => {
      if (!prev || prev.nurseId !== updatedNurse.id) return prev;
      const nextAccess = resolveNurseSystemAccess(updatedNurse);
      setUserRole(nextAccess);
      return {
        ...prev,
        name: updatedNurse.name,
        email: updatedNurse.email || prev.email,
        username: updatedNurse.username,
        nip: updatedNurse.nip,
        userRole: nextAccess,
        role:
          nextAccess === 'administrator'
            ? 'Administrator Unit HD'
            : updatedNurse.role === 'kepala_ruangan'
            ? 'Kepala Ruangan (Ka. Ruangan)'
            : updatedNurse.role === 'pj_shift'
            ? 'Penanggung Jawab Shift (PJ Shift)'
            : 'Perawat Pelaksana Dialisis'
      };
    });
  };

  // Propagate bed number rename across active patient sessions
  const handleBedUpdated = (oldBed: MasterBed, updatedBed: MasterBed) => {
    if (oldBed.bedNumber !== updatedBed.bedNumber) {
      setSessions((prev) =>
        prev.map((s) =>
          s.bedNumber === oldBed.bedNumber ? { ...s, bedNumber: updatedBed.bedNumber } : s
        )
      );
    }
  };

  // Handle saving new or updated patient session
  const handleSaveSession = (savedSession: PatientHDSession) => {
    const fullSession = ensureFullBagianData(savedSession);
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === fullSession.id);
      if (exists) {
        return prev.map((s) => (s.id === fullSession.id ? fullSession : s));
      } else {
        return [...prev, fullSession];
      }
    });
    // Immediately persist to Cloud Firestore for real-time synchronization
    saveDialysisSessionCloud(fullSession).catch((err) => {
      console.warn('Could not sync session to Firestore:', err);
    });
  };

  const handleOpenEditSession = (
    session?: PatientHDSession,
    initialTab?: 'bagian1' | 'bagian2' | 'bagian3' | 'bagian4' | 'bagian5'
  ) => {
    setSelectedSession(session || null);
    if (initialTab) {
      setSessionModalTab(initialTab);
    } else {
      setSessionModalTab('bagian3');
    }
    setIsSessionModalOpen(true);
  };

  const handleQuickToggleComplete = (id: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, sessionStatus: 'selesai' } : s))
    );
  };

  const handleLoadBenchmarkData = () => {
    resetVerificationStorageToBenchmark();
    setSessions(benchmarkSamplePatients.map(ensureFullBagianData));
    setMasterPatients(sampleBenchmarkPatients);
    setMasterNurses(
      sampleBenchmarkNurses.map((n) => ({
        ...n,
        systemAccess: resolveNurseSystemAccess(n)
      }))
    );
    setMasterBeds(sampleBenchmarkBeds);
    setIsCustomDate(false);
    setShiftInfo({
      ...benchmarkShiftInfo,
      date: getCurrentIndonesianFullDate()
    });
    setMachineOverview(benchmarkMachineOverview);
    setOperationalItems(initialOperationalItems);
    setSbar(initialSbar);
    const shortStamp = formatShortIndonesianTimestampWib();
    setSignatures({
      pjShift: {
        name: benchmarkShiftInfo.pjShift,
        signed: true,
        signedAt: shortStamp
      },
      pjBerikutnya: {
        name: benchmarkShiftInfo.pjShiftBerikutnya,
        signed: true,
        signedAt: shortStamp
      },
      kepalaRuangan: {
        name: benchmarkShiftInfo.kepalaRuangan,
        signed: true,
        signedAt: shortStamp
      }
    });
  };

  // Render Login Page if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <LoginPage
          onLogin={handleLogin}
          shiftInfo={shiftInfo}
          masterNurses={masterNurses}
          onOpenDeviceAccess={() => setIsDeviceAccessOpen(true)}
        />
        <DeviceAccessModal
          isOpen={isDeviceAccessOpen}
          onClose={() => setIsDeviceAccessOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="relative min-h-screen text-slate-900 font-sans antialiased overflow-x-clip print:bg-white">
      {/* Full-Viewport Blurred RS Happy Land Hospital Exterior Background */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 bg-gradient-to-br from-[#6eb2dc] via-[#b8dcf0] to-[#8eb6c9] print:hidden"
      >
        {!hospitalBgError && (
          <img
            src={hospitalBgSrc}
            alt="Gedung RS Happy Land Medical Centre Yogyakarta"
            referrerPolicy="no-referrer"
            onError={handleHospitalBgError}
            className="w-full h-full object-cover object-center blur-[6px] scale-[1.04] opacity-90"
          />
        )}
        {/* Soft airy sky-blue atmospheric glaze matching RSHL glassmorphism UI */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#cbe5f6]/45 via-[#e4f1fa]/35 to-[#c5dce9]/45" />
      </div>

      {/* Unified RSHL Frosted-Glass Sidebar + Top Header + Workspace Container for All 4 Roles */}
      <AppShellLayout
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        shiftInfo={shiftInfo}
        userRole={userRole}
        loggedInUserName={loggedInUser?.name}
        onDateChange={handleActiveDateChange}
        isCustomDate={isDateCustomFromToday}
        onResetDateToToday={handleResetDateToToday}
        onLogout={handleLogout}
        onOpenDeviceAccess={() => setIsDeviceAccessOpen(true)}
        isCloudConnected={isCloudConnected}
      >
        {currentTab === 'dashboard' && accessibleTabs.includes('dashboard') && (
          <DashboardView
            masterNurses={masterNurses}
            masterPatients={masterPatients}
            sessions={sessions}
            shiftInfo={shiftInfo}
            loggedInUser={loggedInUser}
            userRole={userRole}
            onNavigateTab={handleSelectTab}
          />
        )}

        {currentTab === 'lap_harian' && accessibleTabs.includes('lap_harian') && (
          <LapHarianView
            shiftInfo={shiftInfo}
            setShiftInfo={setShiftInfo}
            census={liveCensus}
            machineOverview={machineOverview}
            setMachineOverview={setMachineOverview}
            clinicalIndicators={liveClinicalIndicators}
            operationalItems={operationalItems}
            setOperationalItems={setOperationalItems}
            sbar={sbar}
            setSbar={setSbar}
            signatures={signatures}
            setSignatures={setSignatures}
            sessions={sessions}
            userRole={userRole}
            loggedInUser={loggedInUser}
            masterNurses={masterNurses}
            masterPatients={masterPatients}
          />
        )}

        {currentTab === 'logbook' && accessibleTabs.includes('logbook') && (
          <PelaksanaView
            sessions={sessions}
            onOpenSessionModal={handleOpenEditSession}
            onQuickToggleComplete={handleQuickToggleComplete}
            onOpenMasterModal={() => {
              if (canAccessMasterData(userRole)) {
                setIsMasterModalOpen(true);
              }
            }}
            shiftInfo={shiftInfo}
            masterPatients={masterPatients}
            masterNurses={masterNurses}
            masterBeds={masterBeds}
            loggedInUser={loggedInUser}
            userRole={userRole}
            onShiftChange={handleLogbookShiftChange}
            onDateChange={handleActiveDateChange}
            isCustomDate={isDateCustomFromToday}
            onResetDateToToday={handleResetDateToToday}
            onSyncNurseSessions={handleSyncNurseLogbookSessions}
            onNavigateToVerifikasi={() => handleSelectTab('verifikasi')}
            onNavigateToRiwayat={() => handleSelectTab('riwayat')}
          />
        )}

        {currentTab === 'verifikasi' && canVerifyLogbook(userRole) && (
          <VerifikasiView
            shiftInfo={shiftInfo}
            masterNurses={masterNurses}
            userRole={userRole}
            loggedInUser={loggedInUser}
            sessions={sessions}
            onVerificationUpdated={handleNurseVerificationUpdated}
            onVerifyPatientSession={handleVerifyPatientSession}
            onSaveSession={handleSaveSession}
          />
        )}

        {currentTab === 'riwayat' && accessibleTabs.includes('riwayat') && (
          <RiwayatView
            sessions={sessions}
            shiftInfo={shiftInfo}
            userRole={userRole}
            loggedInUser={loggedInUser}
            masterNurses={masterNurses}
            onOpenSessionModal={handleOpenEditSession}
            onNavigateToLogbook={() => handleSelectTab('logbook')}
            onNavigateToVerifikasi={() => handleSelectTab('verifikasi')}
          />
        )}

        {currentTab === 'lap_bulanan' && accessibleTabs.includes('lap_bulanan') && (
          <LapBulananView
            masterNurses={masterNurses}
            loggedInUser={loggedInUser}
            shiftInfo={shiftInfo}
            userRole={userRole}
            sessions={sessions}
            onNavigateToLogbook={() => handleSelectTab('logbook')}
          />
        )}

        {(currentTab === 'data_pasien' ||
          currentTab === 'data_perawat' ||
          currentTab === 'data_mesin') &&
          canAccessMasterData(userRole) && (
            <MasterDataView
              section={
                currentTab === 'data_pasien'
                  ? 'patients'
                  : currentTab === 'data_perawat'
                  ? 'nurses'
                  : 'beds'
              }
              masterPatients={masterPatients}
              setMasterPatients={setMasterPatients}
              masterNurses={masterNurses}
              setMasterNurses={setMasterNurses}
              masterBeds={masterBeds}
              setMasterBeds={setMasterBeds}
              onNurseDutyChange={handleNurseDutySync}
              onNurseUpdated={handleNurseUpdated}
              onBedUpdated={handleBedUpdated}
            />
          )}

        {currentTab === 'my_account' && accessibleTabs.includes('my_account') && (
          <MyAccountView
            shiftInfo={shiftInfo}
            masterNurses={masterNurses}
            onOpenMasterDataModal={() => {
              if (canAccessMasterData(userRole)) {
                setIsMasterModalOpen(true);
              }
            }}
            onLogoutSuccess={handleLogout}
            userRole={userRole}
            onRoleChange={handleRoleChange}
            loggedInUser={loggedInUser}
            onUpdateOwnPassword={(currentPass, nextPass) => {
              if (!loggedInUser?.nurseId) return { ok: true };
              const target = masterNurses.find((n) => n.id === loggedInUser.nurseId);
              if (!target) return { ok: true };
              const expected = target.password || '12345';
              if (currentPass !== expected) {
                return { ok: false, error: 'Kata sandi saat ini tidak sesuai.' };
              }
              setMasterNurses((prev) =>
                updateMasterNurseData(prev, target.id, { password: nextPass })
              );
              return { ok: true };
            }}
          />
        )}
      </AppShellLayout>

      {/* Session Edit Modal */}
      <SessionModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        session={selectedSession}
        initialTab={sessionModalTab}
        onSave={handleSaveSession}
        masterPatients={masterPatients}
        masterNurses={masterNurses}
        masterBeds={masterBeds}
        shiftInfo={shiftInfo}
      />

      {/* Architecture Explainer Modal */}
      <SystemDesignExplainerModal
        isOpen={isExplainerModalOpen}
        onClose={() => setIsExplainerModalOpen(false)}
      />

      {/* Master Data Management Modal (Restricted to Administrator) */}
      {canAccessMasterData(userRole) && (
        <MasterDataManagementModal
          isOpen={isMasterModalOpen}
          onClose={() => setIsMasterModalOpen(false)}
          masterPatients={masterPatients}
          setMasterPatients={setMasterPatients}
          masterNurses={masterNurses}
          setMasterNurses={setMasterNurses}
          masterBeds={masterBeds}
          setMasterBeds={setMasterBeds}
          onNurseDutyChange={handleNurseDutySync}
        />
      )}

      {/* Device Access & QR Code Modal */}
      <DeviceAccessModal
        isOpen={isDeviceAccessOpen}
        onClose={() => setIsDeviceAccessOpen(false)}
      />
    </div>
  );
}
