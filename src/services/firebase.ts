import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  query,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  PatientHDSession,
  ShiftInfo,
  OperationalItem,
  SbarData,
  ShiftSignatures,
  MasterPatient,
  MasterNurse,
  MasterBed
} from '../types/dialysis.ts';

// Initialize Firebase App singleton
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with custom databaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Auth
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

/**
 * Validate connection to Cloud Firestore
 */
export async function testFirestoreConnection(): Promise<boolean> {
  const testPath = 'test/connection';
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore is running in offline mode.');
      return false;
    }
    // Any successful contact with server (even document not existing) counts as connected
    return true;
  }
}

// ============================================================================
// REAL-TIME CLOUD DATA LISTENERS & MUTATIONS
// ============================================================================

/**
 * Listen to live Patient HD Sessions across all staff devices
 */
export function subscribeToDialysisSessions(
  onUpdate: (sessions: PatientHDSession[]) => void,
  onError?: (err: unknown) => void
) {
  const sessionsCol = collection(db, 'dialysis_sessions');
  return onSnapshot(
    sessionsCol,
    (snapshot) => {
      const items: PatientHDSession[] = [];
      snapshot.forEach((d) => {
        const raw = d.data() as PatientHDSession;
        items.push({ ...raw, id: d.id });
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'dialysis_sessions');
      if (onError) onError(error);
    }
  );
}

/**
 * Save single Patient HD Session to Cloud Firestore
 */
export async function saveDialysisSessionCloud(session: PatientHDSession) {
  const cleanId = session.id || `sess-${Date.now()}`;
  const docRef = doc(db, 'dialysis_sessions', cleanId);
  try {
    await setDoc(docRef, {
      ...session,
      id: cleanId,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `dialysis_sessions/${cleanId}`);
    throw err;
  }
}

/**
 * Delete a session from Cloud Firestore
 */
export async function deleteDialysisSessionCloud(sessionId: string) {
  const docRef = doc(db, 'dialysis_sessions', sessionId);
  try {
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `dialysis_sessions/${sessionId}`);
    throw err;
  }
}

/**
 * Listen to Daily Shift Report (SBAR, signatures, shift info)
 */
export function subscribeToShiftReport(
  dateIsoKey: string,
  shiftKey: string,
  onUpdate: (data: {
    shiftInfo?: Partial<ShiftInfo>;
    sbar?: SbarData;
    signatures?: ShiftSignatures;
    operationalItems?: OperationalItem[];
  }) => void
) {
  const cleanDocKey = `${dateIsoKey}_${shiftKey}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const docRef = doc(db, 'shift_reports', cleanDocKey);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as any);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `shift_reports/${cleanDocKey}`);
    }
  );
}

/**
 * Save Shift Report to Cloud Firestore
 */
export async function saveShiftReportCloud(
  dateIsoKey: string,
  shiftKey: string,
  payload: {
    shiftInfo?: ShiftInfo;
    sbar?: SbarData;
    signatures?: ShiftSignatures;
    operationalItems?: OperationalItem[];
  }
) {
  const cleanDocKey = `${dateIsoKey}_${shiftKey}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const docRef = doc(db, 'shift_reports', cleanDocKey);
  try {
    await setDoc(
      docRef,
      {
        ...payload,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `shift_reports/${cleanDocKey}`);
    throw err;
  }
}

/**
 * Real-time sync for Master Patients
 */
export function subscribeToMasterPatients(
  onUpdate: (patients: MasterPatient[]) => void
) {
  const colRef = collection(db, 'master_patients');
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (!snapshot.empty) {
        const list: MasterPatient[] = [];
        snapshot.forEach((d) => list.push({ ...d.data(), id: d.id } as MasterPatient));
        onUpdate(list);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'master_patients');
    }
  );
}

export async function saveMasterPatientsCloud(patients: MasterPatient[]) {
  try {
    for (const p of patients) {
      if (p.id) {
        const cleanId = p.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        await setDoc(doc(db, 'master_patients', cleanId), p);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'master_patients');
  }
}

/**
 * Real-time sync for Master Nurses
 */
export function subscribeToMasterNurses(onUpdate: (nurses: MasterNurse[]) => void) {
  const colRef = collection(db, 'master_nurses');
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (!snapshot.empty) {
        const list: MasterNurse[] = [];
        snapshot.forEach((d) => list.push({ ...d.data(), id: d.id } as MasterNurse));
        onUpdate(list);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'master_nurses');
    }
  );
}

export async function saveMasterNursesCloud(nurses: MasterNurse[]) {
  try {
    for (const n of nurses) {
      if (n.id) {
        const cleanId = n.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        await setDoc(doc(db, 'master_nurses', cleanId), n);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'master_nurses');
  }
}

/**
 * Real-time sync for Master Beds
 */
export function subscribeToMasterBeds(onUpdate: (beds: MasterBed[]) => void) {
  const colRef = collection(db, 'master_beds');
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (!snapshot.empty) {
        const list: MasterBed[] = [];
        snapshot.forEach((d) => list.push({ ...d.data(), id: d.id } as MasterBed));
        onUpdate(list);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'master_beds');
    }
  );
}

export async function saveMasterBedsCloud(beds: MasterBed[]) {
  try {
    for (const b of beds) {
      if (b.id) {
        const cleanId = b.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        await setDoc(doc(db, 'master_beds', cleanId), b);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'master_beds');
  }
}

export interface NurseLogbookCloudData {
  nurseName: string;
  managedPatients: any[];
  facilityStatuses?: Record<string, boolean>;
  facilityNotes?: Record<string, string>;
  patientStatuses?: Record<string, Record<string, boolean>>;
  patientNotes?: Record<string, Record<string, string>>;
  clinicalDetails?: Record<string, any>;
  submission?: any;
  shiftSchedule?: { shift: 'Pagi' | 'Siang'; date: string };
  updatedAt?: string;
}

/**
 * Real-time sync for a specific nurse's personal logbook
 */
export function subscribeToNurseLogbook(
  nurseName: string,
  onUpdate: (data: NurseLogbookCloudData) => void
) {
  if (!nurseName || nurseName === '-') return () => {};
  const cleanKey = nurseName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const docRef = doc(db, 'nurse_logbooks', cleanKey);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as NurseLogbookCloudData);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `nurse_logbooks/${cleanKey}`);
    }
  );
}

/**
 * Save a nurse's personal logbook to Firestore
 */
export async function saveNurseLogbookCloud(
  nurseName: string,
  data: Partial<NurseLogbookCloudData>
) {
  if (!nurseName || nurseName === '-') return;
  const cleanKey = nurseName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const docRef = doc(db, 'nurse_logbooks', cleanKey);
  try {
    await setDoc(
      docRef,
      {
        ...data,
        nurseName,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `nurse_logbooks/${cleanKey}`);
  }
}

/**
 * Real-time sync for Verification Registry (PJ Shift & Kepala Ruangan)
 */
export function subscribeToVerificationRegistry(
  onUpdate: (entries: any[]) => void
) {
  const docRef = doc(db, 'verification_registry', 'active_registry');
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const d = snapshot.data();
        if (Array.isArray(d?.entries)) {
          onUpdate(d.entries);
        }
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'verification_registry/active_registry');
    }
  );
}

export async function saveVerificationRegistryCloud(entries: any[]) {
  const docRef = doc(db, 'verification_registry', 'active_registry');
  try {
    await setDoc(
      docRef,
      {
        entries,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'verification_registry/active_registry');
  }
}

