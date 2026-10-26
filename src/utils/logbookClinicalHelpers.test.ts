import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setAllPoin2_1,
  normalizePoin2_1Data,
  getPoin2_1Counts,
  formatPoin2_1Note,
  setAllPoin3_1,
  getPoin3_1Counts,
  formatPoin3_1Note,
  computeWeightMetrics,
  formatPoin3_2Note,
  computePreHdVitalsMetrics,
  formatPoin3_3Note,
  createDefaultPatientClinicalDetails
} from './logbookClinicalHelpers.ts';

test('Poin 2.1: Simplified single Ceklist APD and Ceklist Cuci Tangan tracking', () => {
  const full = setAllPoin2_1(true);
  const fullCounts = getPoin2_1Counts(full);
  assert.equal(fullCounts.apdChecked, true);
  assert.equal(fullCounts.handwashChecked, true);
  assert.equal(fullCounts.checkedCount, 2);
  assert.equal(fullCounts.total, 2);
  assert.equal(fullCounts.isComplete, true);
  assert.match(formatPoin2_1Note(full), /HAND HYGIENE: DILAKSANAKAN \| PENGGUNAAN APD: DILAKSANAKAN/);

  const partial = { apd: true, cuciTangan: false };
  const partialCounts = getPoin2_1Counts(partial);
  assert.equal(partialCounts.apdChecked, true);
  assert.equal(partialCounts.handwashChecked, false);
  assert.equal(partialCounts.checkedCount, 1);
  assert.equal(partialCounts.isComplete, false);

  // Legacy nested structure normalization
  const migrated = normalizePoin2_1Data({
    apd: { apronGaun: true, maskerBedah: true, faceshieldGoogle: false, sarungTangan: true },
    cuciTangan: { langkah1: true, langkah2: true }
  });
  assert.equal(migrated.apd, false);
  assert.equal(migrated.cuciTangan, true);
});

test('Poin 3.1: Verbal & Non-Verbal patient identification checklist tracking', () => {
  const base = createDefaultPatientClinicalDetails('p1').poin3_1;
  const counts = getPoin3_1Counts(base);
  assert.equal(counts.verbalCount, 2);
  assert.equal(counts.nonVerbalCount, 2);
  assert.equal(counts.isComplete, true);
  assert.match(
    formatPoin3_1Note(base, 'Tn. Bambang Sutrisno', '452101'),
    /Identifikasi Verbal \(2\/2\) & Non-Verbal \(2\/2\) DILAKSANAKAN/
  );

  const cleared = setAllPoin3_1(base, false);
  const clearedCounts = getPoin3_1Counts(cleared);
  assert.equal(clearedCounts.verbalCount, 0);
  assert.equal(clearedCounts.nonVerbalCount, 0);
  assert.equal(clearedCounts.isComplete, false);
});

test('Poin 3.2: BB Pre, BB Post, BB Kering, and UFG metrics & overload detection', () => {
  const metrics = computeWeightMetrics({
    bbPre: '64.2',
    bbPost: '61.6',
    bbKering: '61.5',
    ufg: '2700'
  });

  assert.equal(metrics.idwgKg, 2.7);
  assert.equal(metrics.idwgPct, 4.4);
  assert.equal(metrics.deltaPrePostKg, 2.6);
  assert.equal(metrics.recommendedUfgMl, 2700);
  assert.equal(metrics.overloadStatus, 'moderate');
  assert.equal(metrics.isComplete, true);

  const note = formatPoin3_2Note({
    bbPre: '64.2',
    bbPost: '61.6',
    bbKering: '61.5',
    ufg: '2700'
  });
  assert.match(note, /BB Pre: 64\.2 kg/);
  assert.match(note, /BB Post: 61\.6 kg/);
  assert.match(note, /BB Kering: 61\.5 kg/);
  assert.match(note, /UFG: 2\.700 mL/);
});

test('Poin 3.3: TTV Pre-HD MAP calculation and clinical alerts', () => {
  const normalVitals = computePreHdVitalsMetrics({
    tdSistolik: '145',
    tdDiastolik: '85',
    posisiTd: 'Duduk',
    nadi: '80',
    pernapasan: '20',
    suhu: '36.6',
    spo2: '98'
  });

  assert.equal(normalVitals.mapMmHg, 105);
  assert.equal(normalVitals.severity, 'normal');
  assert.equal(normalVitals.isComplete, true);

  const criticalVitals = computePreHdVitalsMetrics({
    tdSistolik: '84',
    tdDiastolik: '55',
    posisiTd: 'Berbaring',
    nadi: '115',
    pernapasan: '26',
    suhu: '38.1',
    spo2: '91'
  });

  assert.equal(criticalVitals.severity, 'critical');
  assert.ok(criticalVitals.alerts.length >= 3);
  assert.match(
    formatPoin3_3Note({
      tdSistolik: '145',
      tdDiastolik: '85',
      posisiTd: 'Duduk',
      nadi: '80',
      pernapasan: '20',
      suhu: '36.6',
      spo2: '98'
    }),
    /TD Pre: 145\/85 mmHg \(Duduk, MAP 105\)/
  );
});

test('Default new logbook clinical details start completely unchecked (belum dilaksanakan)', () => {
  const fresh = createDefaultPatientClinicalDetails('new');
  const p21Counts = getPoin2_1Counts(fresh.poin2_1);
  assert.equal(p21Counts.apdChecked, false);
  assert.equal(p21Counts.handwashChecked, false);
  assert.equal(p21Counts.checkedCount, 0);
  assert.equal(p21Counts.isComplete, false);
  assert.match(
    formatPoin2_1Note(fresh.poin2_1),
    /HAND HYGIENE: Belum Dilaksanakan \| PENGGUNAAN APD: Belum Dilaksanakan/
  );

  const p31Counts = getPoin3_1Counts(fresh.poin3_1);
  assert.equal(p31Counts.verbalCount, 0);
  assert.equal(p31Counts.nonVerbalCount, 0);
  assert.equal(p31Counts.isComplete, false);

  const fallbackEmpty = normalizePoin2_1Data(undefined);
  assert.equal(fallbackEmpty.apd, false);
  assert.equal(fallbackEmpty.cuciTangan, false);
});

test('Logbook Bagian 6 contains exact 5 Post-HD SPO items (6.1-6.5) across 29 total SPO', async () => {
  const { OFFICIAL_LOGBOOK_ITEMS } = await import('../data/officialPelaksanaLogbookData.ts');

  const bagian6Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 6);
  assert.equal(bagian6Items.length, 5);
  assert.deepEqual(
    bagian6Items.map((it) => ({ code: it.code, description: it.description })),
    [
      { code: '6.1', description: 'Terminasi HD Aman (Washback)' },
      { code: '6.2', description: 'Hemostasis & Balut Tekan Akses' },
      { code: '6.3', description: 'Evaluasi TTV & Berat Badan Post-HD' },
      { code: '6.4', description: 'Disinfeksi Mesin HD (Heat / Chemical)' },
      { code: '6.5', description: 'Dokumentasi Asuhan & Rekam Medis (CPPT)' }
    ]
  );

  const facilityItems = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 1);
  const patientSpoItems = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian >= 2 && it.bagian <= 6);
  assert.equal(facilityItems.length, 3);
  assert.equal(patientSpoItems.length, 26);
  assert.equal(OFFICIAL_LOGBOOK_ITEMS.length, 29);
});
