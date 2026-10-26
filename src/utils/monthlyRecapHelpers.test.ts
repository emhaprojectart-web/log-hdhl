import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaffMonthlyRecap,
  computeDailySpoScoresFromVerifiedLogbook,
  isVerificationEligibleForStaffRole,
  parseIndonesianLogbookDate,
  resolveLiveStaffVerifiedSnapshots
} from './monthlyRecapHelpers.ts';
import { OFFICIAL_LOGBOOK_ITEMS } from '../data/officialPelaksanaLogbookData.ts';
import { buildPatientVerificationKey } from './nurseVerificationHelpers.ts';

function createFullPatientChecks(overrides: Record<string, boolean> = {}): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian >= 2 && it.bagian <= 6).forEach((it) => {
    map[it.code] = true;
  });
  return { ...map, ...overrides };
}

test('parseIndonesianLogbookDate parses Indonesian and ISO clinical dates accurately', () => {
  const d1 = parseIndonesianLogbookDate('Selasa, 20 Oktober 2026, 14:15 WIB');
  assert.equal(d1.day, 20);
  assert.equal(d1.month, 10);
  assert.equal(d1.monthName, 'Oktober');
  assert.equal(d1.year, 2026);
  assert.equal(d1.dateKey, '2026-10-20');
  assert.equal(d1.daysInMonth, 31);

  const d2 = parseIndonesianLogbookDate('2026-11-05T08:30:00Z');
  assert.equal(d2.day, 5);
  assert.equal(d2.month, 11);
  assert.equal(d2.monthName, 'November');
  assert.equal(d2.daysInMonth, 30);
});

test('computeDailySpoScoresFromVerifiedLogbook enforces 1.1-1.3 = 1/day and 2.1-6.5 = patient count (example: 3 patients, 1 missed on 3.3 => score 2)', () => {
  const facilityStatuses = { '1.1': true, '1.2': true, '1.3': true };
  const pat1 = createFullPatientChecks();
  const pat2 = createFullPatientChecks();
  const pat3 = createFullPatientChecks({ '3.3': false });

  const result = computeDailySpoScoresFromVerifiedLogbook(facilityStatuses, [pat1, pat2, pat3]);
  assert.ok(result);
  assert.equal(result.verifiedPatientCount, 3);

  // Bagian I (1.1 - 1.3) strictly 1 (executed once per day, NOT multiplied by 3 patients)
  assert.equal(result.scores['1.1'], 1);
  assert.equal(result.scores['1.2'], 1);
  assert.equal(result.scores['1.3'], 1);

  // Bagian II - VI (2.1 - 6.5) follow managed patient count
  assert.equal(result.scores['2.1'], 3);
  assert.equal(result.scores['3.2'], 3);
  assert.equal(result.scores['3.3'], 2); // 1 of 3 patients not done -> score = 2
  assert.equal(result.scores['4.1'], 3);
  assert.equal(result.scores['5.1'], 3);
  assert.equal(result.scores['6.1'], 3);
  assert.equal(result.scores['6.5'], 3);
});

test('Unverified logbook entries produce zero verified days and empty monthly scores', () => {
  const nurseName = 'Ners Rina S.Kep';
  const managedPatients = [
    { id: 'p1', bedNumber: 'Bed 01', patientName: 'Pasien A', medicalRecord: '1001' },
    { id: 'p2', bedNumber: 'Bed 02', patientName: 'Pasien B', medicalRecord: '1002' }
  ];
  const patStatuses = {
    p1: createFullPatientChecks(),
    p2: createFullPatientChecks()
  };
  const perPatUnverified = {
    [buildPatientVerificationKey(nurseName, 'Bed 01', '1001')]: {
      status: 'diajukan'
    },
    [buildPatientVerificationKey(nurseName, 'Bed 02', '1002')]: {
      status: 'belum_diajukan'
    }
  };

  const live = resolveLiveStaffVerifiedSnapshots({
    nurseName,
    userRole: 'perawat_pelaksana',
    overrideManagedPatients: managedPatients,
    overridePatientStatuses: patStatuses,
    overrideFacilityStatuses: { '1.1': true, '1.2': true, '1.3': true },
    overridePerPatientRecords: perPatUnverified
  });

  assert.equal(live.totalManagedCount, 2);
  assert.equal(live.unverifiedCount, 2);
  assert.deepEqual(live.verifiedSnapshotsByDate, {});

  const recap = buildStaffMonthlyRecap({
    nurseName,
    userRole: 'perawat_pelaksana',
    liveVerificationOverride: live,
    storedSnapshotsOverride: {}
  });

  assert.equal(recap.verifiedDaysCount, 0);
  assert.equal(recap.totalVerifiedPatientsInMonth, 0);
  assert.equal(recap.grandTotalScore, 0);
  assert.equal(recap.overallCompliancePct, 0);
  assert.equal(recap.logbook.dailyScores?.['1.1']?.[19], null);
  assert.equal(recap.logbook.dailyScores?.['3.3']?.[19], null);
});

test('3-role verification eligibility supports Perawat Pelaksana, PJ Shift (Karu or other PJ), and Kepala Ruang', () => {
  // Perawat Pelaksana verified by PJ Shift
  assert.equal(
    isVerificationEligibleForStaffRole({
      staffName: 'Ners Rina',
      staffRole: 'perawat_pelaksana',
      isVerified: true,
      verifiedBy: 'Ns. Haikal',
      verifiedByRole: 'PJ Shift'
    }),
    true
  );

  // PJ Shift verified by Kepala Ruang -> allowed
  assert.equal(
    isVerificationEligibleForStaffRole({
      staffName: 'Ns. Haikal',
      staffRole: 'pj_shift',
      isVerified: true,
      verifiedBy: 'Ns. Twis',
      verifiedByRole: 'Kepala Ruangan'
    }),
    true
  );

  // PJ Shift verified by another PJ Shift -> allowed
  assert.equal(
    isVerificationEligibleForStaffRole({
      staffName: 'Ns. Haikal',
      staffRole: 'pj_shift',
      isVerified: true,
      verifiedBy: 'Ns. Riska',
      verifiedByRole: 'PJ Shift'
    }),
    true
  );

  // PJ Shift self-verified -> blocked
  assert.equal(
    isVerificationEligibleForStaffRole({
      staffName: 'Ns. Haikal',
      staffRole: 'pj_shift',
      isVerified: true,
      verifiedBy: 'Ns. Haikal',
      verifiedByRole: 'PJ Shift'
    }),
    false
  );

  // Kepala Ruang verified by Kepala Ruang or PJ Shift -> allowed
  assert.equal(
    isVerificationEligibleForStaffRole({
      staffName: 'Ns. Twis',
      staffRole: 'kepala_ruangan',
      isVerified: true,
      verifiedBy: 'Ns. Twis',
      verifiedByRole: 'Kepala Ruangan'
    }),
    true
  );
});

test('buildStaffMonthlyRecap aggregates multi-day verified scores accurately across a month', () => {
  const nurseName = 'Ners Rina S.Kep';

  // Day 10 historical snapshot: 2 verified patients, all SPO complete
  const day10Scores = computeDailySpoScoresFromVerifiedLogbook(
    { '1.1': true, '1.2': true, '1.3': false }, // 1.3 not done on Day 10 -> 0
    [createFullPatientChecks(), createFullPatientChecks()]
  )!;

  // Day 20 live verified: 3 verified patients, 1 patient missed on 3.3 -> score 2
  const managedToday = [
    { id: 'p1', bedNumber: 'Bed 01', patientName: 'Pasien 1', medicalRecord: '2001' },
    { id: 'p2', bedNumber: 'Bed 02', patientName: 'Pasien 2', medicalRecord: '2002' },
    { id: 'p3', bedNumber: 'Bed 03', patientName: 'Pasien 3', medicalRecord: '2003' }
  ];
  const patStatuses = {
    p1: createFullPatientChecks(),
    p2: createFullPatientChecks(),
    p3: createFullPatientChecks({ '3.3': false })
  };
  const perPatVerified = {
    [buildPatientVerificationKey(nurseName, 'Bed 01', '2001')]: {
      status: 'terverifikasi',
      verifiedAt: 'Selasa, 20 Oktober 2026, 14:10 WIB',
      verifiedBy: 'Ns. Haikal',
      verifiedByRole: 'PJ Shift'
    },
    [buildPatientVerificationKey(nurseName, 'Bed 02', '2002')]: {
      status: 'terverifikasi',
      verifiedAt: 'Selasa, 20 Oktober 2026, 14:10 WIB',
      verifiedBy: 'Ns. Haikal',
      verifiedByRole: 'PJ Shift'
    },
    [buildPatientVerificationKey(nurseName, 'Bed 03', '2003')]: {
      status: 'terverifikasi',
      verifiedAt: 'Selasa, 20 Oktober 2026, 14:10 WIB',
      verifiedBy: 'Ns. Haikal',
      verifiedByRole: 'PJ Shift'
    }
  };

  const live = resolveLiveStaffVerifiedSnapshots({
    nurseName,
    userRole: 'perawat_pelaksana',
    overrideManagedPatients: managedToday,
    overridePatientStatuses: patStatuses,
    overrideFacilityStatuses: { '1.1': true, '1.2': true, '1.3': true },
    overridePerPatientRecords: perPatVerified
  });

  const recap = buildStaffMonthlyRecap({
    nurseName,
    nurseNip: '19950110',
    userRole: 'perawat_pelaksana',
    targetMonth: 10,
    targetYear: 2026,
    liveVerificationOverride: live,
    storedSnapshotsOverride: {
      '2026-10-10': {
        dateKey: '2026-10-10',
        day: 10,
        month: 10,
        year: 2026,
        verifiedPatientCount: day10Scores.verifiedPatientCount,
        scores: day10Scores.scores,
        verifiedBy: 'Ns. Haikal',
        verifiedByRole: 'PJ Shift'
      }
    }
  });

  assert.equal(recap.verifiedDaysCount, 2); // Day 10 + Day 20
  assert.equal(recap.totalVerifiedPatientsInMonth, 5); // 2 + 3 patients

  // Check Day 20 (index 19)
  assert.equal(recap.logbook.dailyScores?.['1.1']?.[19], 1);
  assert.equal(recap.logbook.dailyScores?.['3.3']?.[19], 2);
  assert.equal(recap.logbook.dailyScores?.['6.5']?.[19], 3);
  assert.equal(recap.dailyTotalScores[19], 80); // 3 + (25*3 + 2) = 80

  // Check Monthly Item Totals
  assert.equal(recap.itemStats['1.1'].totalScore, 2); // 1 + 1
  assert.equal(recap.itemStats['1.1'].maxScore, 2);
  assert.equal(recap.itemStats['1.1'].pct, 100);

  assert.equal(recap.itemStats['1.3'].totalScore, 1); // 0 on Day 10 + 1 on Day 20
  assert.equal(recap.itemStats['1.3'].maxScore, 2);
  assert.equal(recap.itemStats['1.3'].pct, 50);

  assert.equal(recap.itemStats['2.1'].totalScore, 5); // 2 + 3
  assert.equal(recap.itemStats['2.1'].maxScore, 5);
  assert.equal(recap.itemStats['2.1'].pct, 100);

  assert.equal(recap.itemStats['3.3'].totalScore, 4); // 2 on Day 10 + 2 on Day 20
  assert.equal(recap.itemStats['3.3'].maxScore, 5);
  assert.equal(recap.itemStats['3.3'].pct, 80);
});
