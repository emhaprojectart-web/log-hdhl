import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNurseName,
  isMatchingNurse,
  isSameBed,
  extractBedCode,
  buildPatientVerificationKey,
  isSessionManagedByNurse,
  filterSessionsForNurseRiwayat,
  isSessionVerifiedByPj,
  filterVerificationQueueForUser
} from './nurseVerificationHelpers.ts';
import { PatientHDSession, MasterNurse } from '../types/dialysis.ts';

const mockMasterNurses: MasterNurse[] = [
  {
    id: 'nurse-01',
    name: 'M. Haikal Malilang, A.Md. Kep.',
    nip: '19920412',
    role: 'pj_shift',
    pernefriCertified: true,
    isOnDutyToday: true
  },
  {
    id: 'nurse-02',
    name: 'Twis Fertilianti PW., S.Kep., Ns.',
    nip: '19870315',
    role: 'kepala_ruangan',
    pernefriCertified: true,
    isOnDutyToday: true
  },
  {
    id: 'nurse-04',
    name: 'Ners Rina S.Kep',
    nip: '19950110',
    role: 'perawat_pelaksana',
    pernefriCertified: true,
    isOnDutyToday: true
  },
  {
    id: 'nurse-06',
    name: 'Ners Dewi A.Md.Kep',
    nip: '19940815',
    role: 'perawat_pelaksana',
    pernefriCertified: true,
    isOnDutyToday: true
  }
];

const sessionPelaksanaVerifiedByPj: PatientHDSession = {
  id: 'session-pasien-a',
  bedNumber: 'Bed 01',
  patientName: 'Ny. Siti Aminah',
  medicalRecordNumber: '452101',
  age: 56,
  gender: 'P',
  status: 'rajal',
  category: 'reguler',
  sessionStatus: 'selesai',
  isCito: false,
  vascularAccess: 'av_fistula',
  dialyzerModel: 'SAS HF 18',
  isReuse: false,
  dryWeight: 53.0,
  preWeight: 55.4,
  postWeight: 53.0,
  targetUf: 2400,
  achievedUf: 2400,
  durationPrescribed: 4.5,
  durationActual: 4.5,
  preBp: '140/90',
  postBp: '120/80',
  hasHypotension: false,
  hasMuscleCramps: false,
  hasClotting: false,
  hasFirstUseSyndrome: false,
  hasAccessBleeding: false,
  hasConsultDpjp: false,
  underUfTolerated: false,
  nurseInCharge: 'Ners Rina S.Kep',
  isVerifiedByPj: true,
  verificationStatus: 'terverifikasi',
  verifiedAt: 'Selasa, 20 Oktober 2026, 13:45 WIB',
  verifiedBy: 'M. Haikal Malilang, A.Md. Kep.',
  verifiedByRole: 'PJ Shift',
  updatedAt: '2026-10-20T13:45:00Z'
};

const sessionPelaksanaPending: PatientHDSession = {
  ...sessionPelaksanaVerifiedByPj,
  id: 'session-pasien-b',
  bedNumber: 'Bed 04',
  patientName: 'Tn. Bambang Haryono',
  medicalRecordNumber: '452104',
  nurseInCharge: 'Ners Dewi A.Md.Kep',
  isVerifiedByPj: false,
  verificationStatus: 'diajukan',
  verifiedAt: undefined,
  verifiedBy: undefined,
  verifiedByRole: undefined
};

test('normalizeNurseName and isMatchingNurse match across honorific variations', () => {
  assert.equal(normalizeNurseName('Ners Rina S.Kep'), 'rina');
  assert.equal(normalizeNurseName('Ns. Rina Kartika, S.Kep.'), 'rina kartika');
  assert.equal(normalizeNurseName('M. Haikal Malilang, A.Md. Kep.'), 'm haikal malilang');
  assert.ok(isMatchingNurse('Ners Rina S.Kep', 'Ns. Rina Kartika, S.Kep.'));
  assert.ok(!isMatchingNurse('Ners Rina S.Kep', 'Ners Dewi A.Md.Kep'));
});

test('extractBedCode and isSameBed prevent Bed 01 vs Bed 10 and zone prefix (BED A01 vs BED B01 vs BED ISOLASI 01) collisions', () => {
  assert.equal(extractBedCode('Bed 01'), 'bed_1');
  assert.equal(extractBedCode('Bed 1'), 'bed_1');
  assert.equal(extractBedCode('Bed 10'), 'bed_10');
  assert.equal(extractBedCode('BED A01'), 'bed_a_1');
  assert.equal(extractBedCode('Bed A1'), 'bed_a_1');
  assert.equal(extractBedCode('BED A12'), 'bed_a_12');
  assert.equal(extractBedCode('BED B01'), 'bed_b_1');
  assert.equal(extractBedCode('BED C01'), 'bed_c_1');
  assert.equal(extractBedCode('BED D01'), 'bed_d_1');
  assert.equal(extractBedCode('BED E01'), 'bed_e_1');
  assert.equal(extractBedCode('BED F01'), 'bed_f_1');
  assert.equal(extractBedCode('BED ISOLASI 01'), 'bed_isolasi_1');
  assert.equal(extractBedCode('BED ISOLASI 04'), 'bed_isolasi_4');

  assert.ok(isSameBed('Bed 01', 'Bed 1'));
  assert.ok(isSameBed('BED A01', 'Bed A1'));
  assert.ok(!isSameBed('Bed 01', 'Bed 10'));
  assert.ok(!isSameBed('BED A01', 'BED A10'));
  assert.ok(!isSameBed('BED A01', 'BED B01'));
  assert.ok(!isSameBed('BED A01', 'BED ISOLASI 01'));

  const keyA = buildPatientVerificationKey('Ners Rina S.Kep', 'BED A01', '452101');
  const keyB = buildPatientVerificationKey('Ners Rina S.Kep', 'BED B01', '452101');
  const keyIso = buildPatientVerificationKey('Ners Rina S.Kep', 'BED ISOLASI 01', '452101');
  assert.notEqual(keyA, keyB);
  assert.notEqual(keyA, keyIso);
  assert.notEqual(keyB, keyIso);
});

test('isSessionManagedByNurse isolates patients strictly by managing nurse', () => {
  assert.ok(isSessionManagedByNurse(sessionPelaksanaVerifiedByPj, 'Ners Rina S.Kep'));
  assert.ok(!isSessionManagedByNurse(sessionPelaksanaVerifiedByPj, 'Ners Dewi A.Md.Kep'));
  assert.ok(isSessionManagedByNurse(sessionPelaksanaPending, 'Ners Dewi A.Md.Kep'));
});

test('Hak Akses 1 (Perawat Pelaksana): Riwayat only displays own patients AFTER verified by PJ Shift', () => {
  const allSessions = [sessionPelaksanaVerifiedByPj, sessionPelaksanaPending];

  // Ners Rina (verified by PJ Shift) sees her patient
  const rinaRiwayat = filterSessionsForNurseRiwayat(
    allSessions,
    'Ners Rina S.Kep',
    'perawat_pelaksana',
    'mine',
    mockMasterNurses
  );
  assert.equal(rinaRiwayat.visibleSessions.length, 1);
  assert.equal(rinaRiwayat.visibleSessions[0].id, 'session-pasien-a');
  assert.equal(rinaRiwayat.unverifiedManagedCount, 0);

  // Ners Dewi (submitted to PJ Shift, not yet verified) sees 0 in Riwayat
  const dewiRiwayat = filterSessionsForNurseRiwayat(
    allSessions,
    'Ners Dewi A.Md.Kep',
    'perawat_pelaksana',
    'mine',
    mockMasterNurses
  );
  assert.equal(dewiRiwayat.visibleSessions.length, 0);
  assert.equal(dewiRiwayat.totalManagedByNurse, 1);
  assert.equal(dewiRiwayat.unverifiedManagedCount, 1);
});

test('Hak Akses 2 (PJ Shift): Riwayat displays PJ Shift own patients AFTER verified by Kepala Ruang OR another PJ Shift (blocking self-verification)', () => {
  const pjPatientPending: PatientHDSession = {
    ...sessionPelaksanaVerifiedByPj,
    id: 'session-pj-pending',
    bedNumber: 'Bed 07',
    patientName: 'Ny. Maria Kristina',
    nurseInCharge: 'M. Haikal Malilang, A.Md. Kep.',
    isVerifiedByPj: false,
    isVerifiedByKepalaRuang: false,
    verificationStatus: 'diajukan',
    verifiedBy: undefined,
    verifiedByRole: undefined
  };

  const pjPatientVerifiedByKaru: PatientHDSession = {
    ...pjPatientPending,
    id: 'session-pj-verified-karu',
    bedNumber: 'Bed 08',
    patientName: 'Tn. Adji Tri Subarkah',
    isVerifiedByPj: true,
    isVerifiedByKepalaRuang: true,
    verificationStatus: 'terverifikasi',
    verifiedBy: 'Twis Fertilianti PW., S.Kep., Ns.',
    verifiedByRole: 'Kepala Ruangan'
  };

  const pjPatientVerifiedByOtherPj: PatientHDSession = {
    ...pjPatientPending,
    id: 'session-pj-verified-other-pj',
    bedNumber: 'Bed 10',
    patientName: 'Tn. Rahmat Hidayat',
    isVerifiedByPj: true,
    isVerifiedByKepalaRuang: false,
    verificationStatus: 'terverifikasi',
    verifiedBy: 'Aprillia Dwi N, S.Kep., Ns.',
    verifiedByRole: 'PJ Shift'
  };

  // Self-verified by the SAME PJ Shift must STILL NOT be displayed in Riwayat
  const pjPatientSelfVerifiedInvalid: PatientHDSession = {
    ...pjPatientPending,
    id: 'session-pj-self-invalid',
    bedNumber: 'Bed 09',
    patientName: 'Ny. Eko Supriyatin',
    isVerifiedByPj: true,
    isVerifiedByKepalaRuang: false,
    verificationStatus: 'terverifikasi',
    verifiedBy: 'M. Haikal Malilang, A.Md. Kep.',
    verifiedByRole: 'PJ Shift'
  };

  const sessions = [
    sessionPelaksanaVerifiedByPj,
    pjPatientPending,
    pjPatientVerifiedByKaru,
    pjPatientVerifiedByOtherPj,
    pjPatientSelfVerifiedInvalid
  ];

  const haikalRiwayat = filterSessionsForNurseRiwayat(
    sessions,
    'M. Haikal Malilang, A.Md. Kep.',
    'pj_shift',
    'mine',
    mockMasterNurses
  );

  // Both pjPatientVerifiedByKaru AND pjPatientVerifiedByOtherPj appear in PJ Shift's Riwayat,
  // while pending and self-verified remain excluded!
  assert.equal(haikalRiwayat.visibleSessions.length, 2);
  assert.deepEqual(
    haikalRiwayat.visibleSessions.map((s) => s.id),
    ['session-pj-verified-karu', 'session-pj-verified-other-pj']
  );
  assert.equal(haikalRiwayat.totalManagedByNurse, 4);
  assert.equal(haikalRiwayat.unverifiedManagedCount, 2);
});

test('Hak Akses 3 (Kepala Ruang): Riwayat displays Kepala Ruang own patients verified by EITHER PJ Shift OR Kepala Ruang', () => {
  const karuPatientUnverified: PatientHDSession = {
    ...sessionPelaksanaVerifiedByPj,
    id: 'karu-unverified',
    bedNumber: 'Bed 13',
    patientName: 'Tn. Gunawan Wibisono',
    nurseInCharge: 'Twis Fertilianti PW., S.Kep., Ns.',
    isVerifiedByPj: false,
    isVerifiedByKepalaRuang: false,
    verificationStatus: 'belum_diajukan',
    verifiedBy: undefined,
    verifiedByRole: undefined
  };

  const karuPatientVerifiedByPj: PatientHDSession = {
    ...karuPatientUnverified,
    id: 'karu-verified-by-pj',
    bedNumber: 'Bed 14',
    patientName: 'Ny. Sri Wahyuni',
    isVerifiedByPj: true,
    isVerifiedByKepalaRuang: false,
    verificationStatus: 'terverifikasi',
    verifiedBy: 'M. Haikal Malilang, A.Md. Kep.',
    verifiedByRole: 'PJ Shift'
  };

  const karuPatientVerifiedBySelf: PatientHDSession = {
    ...karuPatientUnverified,
    id: 'karu-verified-by-karu',
    bedNumber: 'Bed 15',
    patientName: 'Tn. Suryo Pranoto',
    isVerifiedByPj: true,
    isVerifiedByKepalaRuang: true,
    verificationStatus: 'terverifikasi',
    verifiedBy: 'Twis Fertilianti PW., S.Kep., Ns.',
    verifiedByRole: 'Kepala Ruangan'
  };

  const sessions = [
    sessionPelaksanaVerifiedByPj,
    karuPatientUnverified,
    karuPatientVerifiedByPj,
    karuPatientVerifiedBySelf
  ];

  const karuRiwayat = filterSessionsForNurseRiwayat(
    sessions,
    'Twis Fertilianti PW., S.Kep., Ns.',
    'kepala_ruangan',
    'mine',
    mockMasterNurses
  );

  assert.equal(karuRiwayat.visibleSessions.length, 2);
  assert.deepEqual(
    karuRiwayat.visibleSessions.map((s) => s.id),
    ['karu-verified-by-pj', 'karu-verified-by-karu']
  );
  assert.equal(karuRiwayat.verifiedByPjCount, 1);
  assert.equal(karuRiwayat.verifiedByKaruCount, 1);
  assert.equal(karuRiwayat.unverifiedManagedCount, 1);
});

test('Verifikasi Queue Isolation: PJ Shift & Kepala Ruang only see submissions strictly targeted to them (including PJ Shift -> PJ Shift Lainnya)', () => {
  const entries: Parameters<typeof filterVerificationQueueForUser>[0] = [
    // Unsubmitted draft -> hidden from everyone
    {
      id: 'draft-siti',
      submittedNurseName: 'Siti Rahayu, S.Kep., Ners',
      submittedNurseRole: 'perawat_pelaksana',
      targetRole: 'pj_shift',
      targetVerifierName: 'M. Haikal Malilang, A.Md. Kep.',
      status: 'belum_diajukan'
    },
    // Pelaksana Pagi -> PJ Shift Pagi (Haikal)
    {
      id: 'sub-dewi',
      submittedNurseName: 'Ners Dewi A.Md.Kep',
      submittedNurseRole: 'perawat_pelaksana',
      targetRole: 'pj_shift',
      targetVerifierName: 'M. Haikal Malilang, A.Md. Kep.',
      status: 'diajukan'
    },
    // Pelaksana Siang -> PJ Shift Siang (Aprillia)
    {
      id: 'sub-budi',
      submittedNurseName: 'Ners Budi Santoso, S.Kep.',
      submittedNurseRole: 'perawat_pelaksana',
      targetRole: 'pj_shift',
      targetVerifierName: 'Aprillia Dwi N, S.Kep., Ns.',
      status: 'diajukan'
    },
    // PJ Shift Pagi (Haikal) -> Kepala Ruang (Twis)
    {
      id: 'sub-haikal',
      submittedNurseName: 'M. Haikal Malilang, A.Md. Kep.',
      submittedNurseRole: 'pj_shift',
      targetRole: 'kepala_ruangan',
      targetVerifierName: 'Twis Fertilianti PW., S.Kep., Ns.',
      status: 'diajukan'
    },
    // PJ Shift Malam (Dian) -> PJ Shift Siang Lainnya (Aprillia)
    {
      id: 'sub-pj-dian-to-aprillia',
      submittedNurseName: 'Ns. Dian Pratama, S.Kep.',
      submittedNurseRole: 'pj_shift',
      targetRole: 'pj_shift',
      targetVerifierName: 'Aprillia Dwi N, S.Kep., Ns.',
      status: 'diajukan'
    },
    // Kepala Ruang -> PJ Shift Pagi (Haikal)
    {
      id: 'sub-karu-to-pj',
      submittedNurseName: 'Twis Fertilianti PW., S.Kep., Ns.',
      submittedNurseRole: 'kepala_ruangan',
      targetRole: 'pj_shift',
      targetVerifierName: 'M. Haikal Malilang, A.Md. Kep.',
      status: 'diajukan'
    }
  ];

  // 1. Haikal (PJ Shift Pagi) sees ONLY sub-dewi and sub-karu-to-pj (targeted to Haikal)
  const haikalQueue = filterVerificationQueueForUser(
    entries,
    'pj_shift',
    'M. Haikal Malilang, A.Md. Kep.'
  );
  assert.deepEqual(
    haikalQueue.map((e) => e.id),
    ['sub-dewi', 'sub-karu-to-pj']
  );

  // 2. Aprillia (PJ Shift Siang) sees sub-budi (Pelaksana) AND sub-pj-dian-to-aprillia (PJ Shift Lainnya)
  const aprilliaQueue = filterVerificationQueueForUser(
    entries,
    'pj_shift',
    'Aprillia Dwi N, S.Kep., Ns.'
  );
  assert.deepEqual(
    aprilliaQueue.map((e) => e.id),
    ['sub-budi', 'sub-pj-dian-to-aprillia']
  );

  // 2b. Dian (PJ Shift Malam) does NOT see his own submission in his Verifikasi queue
  const dianQueue = filterVerificationQueueForUser(
    entries,
    'pj_shift',
    'Ns. Dian Pratama, S.Kep.'
  );
  assert.equal(dianQueue.length, 0);

  // 3. Twis (Kepala Ruang) sees ONLY sub-haikal (targeted to Kepala Ruang);
  // sub-pj-dian-to-aprillia was targeted to PJ Shift Lainnya so it is NOT shown on Kepala Ruang's Verifikasi page
  const karuQueueWhenSentToPj = filterVerificationQueueForUser(
    entries,
    'kepala_ruangan',
    'Twis Fertilianti PW., S.Kep., Ns.'
  );
  assert.deepEqual(
    karuQueueWhenSentToPj.map((e) => e.id),
    ['sub-haikal']
  );

  // 4. When Kepala Ruang submits to Kepala Ruang itu sendiri, it DOES appear in Kepala Ruang's Verifikasi queue
  const entriesWithKaruSelf: Parameters<typeof filterVerificationQueueForUser>[0] = [
    ...entries.filter((e) => e.id !== 'sub-karu-to-pj'),
    {
      id: 'sub-karu-to-self',
      submittedNurseName: 'Twis Fertilianti PW., S.Kep., Ns.',
      submittedNurseRole: 'kepala_ruangan',
      targetRole: 'kepala_ruangan',
      targetVerifierName: 'Twis Fertilianti PW., S.Kep., Ns.',
      status: 'diajukan'
    }
  ];
  const karuQueueSelf = filterVerificationQueueForUser(
    entriesWithKaruSelf,
    'kepala_ruangan',
    'Twis Fertilianti PW., S.Kep., Ns.'
  );
  assert.deepEqual(
    karuQueueSelf.map((e) => e.id),
    ['sub-haikal', 'sub-karu-to-self']
  );
});

test('isSessionVerifiedByPj distinguishes PJ Shift vs Kepala Ruang verifiers cleanly', () => {
  const vPj = isSessionVerifiedByPj(sessionPelaksanaVerifiedByPj, mockMasterNurses);
  assert.equal(vPj.isVerified, true);
  assert.equal(vPj.isVerifiedByPjShift, true);
  assert.equal(vPj.isVerifiedByKepalaRuang, false);

  const vPending = isSessionVerifiedByPj(sessionPelaksanaPending, mockMasterNurses);
  assert.equal(vPending.isVerified, false);
});
