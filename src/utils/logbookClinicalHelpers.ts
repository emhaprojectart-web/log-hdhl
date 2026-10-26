/**
 * Structured clinical checklists & calculators for Logbook Harian Perawat HD
 * Covers Bagian 2 (Poin 2.1) and Bagian 3 (Poin 3.1, 3.2, 3.3)
 */

export interface Poin2_1ClinicalData {
  apd: boolean;
  cuciTangan: boolean;
}

export interface Poin3_1ClinicalData {
  verbal: {
    namaLengkap: boolean;
    tanggalLahir: boolean;
  };
  nonVerbal: {
    gelangIdentitas: boolean;
    dokumenRmDanResep: boolean;
  };
  tanggalLahirPasien: string;
}

export interface Poin3_2ClinicalData {
  bbPre: string; // kg
  bbPost: string; // kg
  bbKering: string; // kg
  ufg: string; // mL
}

export interface Poin3_3ClinicalData {
  tdSistolik: string; // mmHg
  tdDiastolik: string; // mmHg
  posisiTd: 'Duduk' | 'Berbaring';
  nadi: string; // x/menit
  pernapasan: string; // x/menit
  suhu: string; // °C
  spo2: string; // %
}

export interface PatientLogbookClinicalDetails {
  poin2_1: Poin2_1ClinicalData;
  poin3_1: Poin3_1ClinicalData;
  poin3_2: Poin3_2ClinicalData;
  poin3_3: Poin3_3ClinicalData;
}

export const IDENTIFIKASI_VERBAL_ITEMS: Array<{
  key: keyof Poin3_1ClinicalData['verbal'];
  label: string;
  detail: string;
}> = [
  {
    key: 'namaLengkap',
    label: 'Konfirmasi Verbal Nama Lengkap',
    detail: 'Pasien menyebutkan nama lengkap secara aktif (pertanyaan terbuka)'
  },
  {
    key: 'tanggalLahir',
    label: 'Konfirmasi Verbal Tanggal Lahir',
    detail: 'Pasien / pendamping menyebutkan tanggal lahir atau usia'
  }
];

export const IDENTIFIKASI_NON_VERBAL_ITEMS: Array<{
  key: keyof Poin3_1ClinicalData['nonVerbal'];
  label: string;
  detail: string;
}> = [
  {
    key: 'gelangIdentitas',
    label: 'Cek Visual Gelang Identitas Pasien',
    detail: 'Cocokkan Nama Lengkap, No. RM & Tanggal Lahir pada gelang'
  },
  {
    key: 'dokumenRmDanResep',
    label: 'Cek Berkas RM, Resep HD & Label Dialyzer',
    detail: 'Cocokkan rekam medis, instruksi DPJP, dan identitas dialyzer'
  }
];

function parseClinicalNumber(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const normalized = raw.trim().replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function roundOneDecimal(val: number): number {
  return Math.round(val * 10) / 10;
}

export function setAllPoin2_1(checked: boolean): Poin2_1ClinicalData {
  return {
    apd: checked,
    cuciTangan: checked
  };
}

export function normalizePoin2_1Data(raw: unknown): Poin2_1ClinicalData {
  if (!raw || typeof raw !== 'object') {
    return setAllPoin2_1(false);
  }
  const obj = raw as Record<string, unknown>;

  let apd = false;
  if (typeof obj.apd === 'boolean') {
    apd = obj.apd;
  } else if (obj.apd && typeof obj.apd === 'object') {
    apd = Object.values(obj.apd as Record<string, unknown>).every(Boolean);
  }

  let cuciTangan = false;
  if (typeof obj.cuciTangan === 'boolean') {
    cuciTangan = obj.cuciTangan;
  } else if (obj.cuciTangan && typeof obj.cuciTangan === 'object') {
    cuciTangan = Object.values(obj.cuciTangan as Record<string, unknown>).every(Boolean);
  }

  return { apd, cuciTangan };
}

export function getPoin2_1Counts(data: Poin2_1ClinicalData) {
  const normalized = normalizePoin2_1Data(data);
  const apdChecked = normalized.apd;
  const handwashChecked = normalized.cuciTangan;
  const checkedCount = (apdChecked ? 1 : 0) + (handwashChecked ? 1 : 0);
  const total = 2;
  const isComplete = apdChecked && handwashChecked;

  return {
    apdChecked,
    handwashChecked,
    checkedCount,
    total,
    isComplete
  };
}

export function formatPoin2_1Note(data: Poin2_1ClinicalData): string {
  const { apdChecked, handwashChecked } = getPoin2_1Counts(data);
  const handwashSummary = handwashChecked
    ? 'HAND HYGIENE: DILAKSANAKAN'
    : 'HAND HYGIENE: Belum Dilaksanakan';
  const apdSummary = apdChecked
    ? 'PENGGUNAAN APD: DILAKSANAKAN'
    : 'PENGGUNAAN APD: Belum Dilaksanakan';

  return `${handwashSummary} | ${apdSummary}`;
}

export function setAllPoin3_1(
  prev: Poin3_1ClinicalData,
  checked: boolean
): Poin3_1ClinicalData {
  return {
    ...prev,
    verbal: {
      namaLengkap: checked,
      tanggalLahir: checked
    },
    nonVerbal: {
      gelangIdentitas: checked,
      dokumenRmDanResep: checked
    }
  };
}

export function getPoin3_1Counts(data: Poin3_1ClinicalData) {
  const verbalCount = IDENTIFIKASI_VERBAL_ITEMS.filter(
    (it) => data.verbal[it.key]
  ).length;
  const nonVerbalCount = IDENTIFIKASI_NON_VERBAL_ITEMS.filter(
    (it) => data.nonVerbal[it.key]
  ).length;
  const verbalTotal = IDENTIFIKASI_VERBAL_ITEMS.length;
  const nonVerbalTotal = IDENTIFIKASI_NON_VERBAL_ITEMS.length;
  const isComplete = verbalCount === verbalTotal && nonVerbalCount === nonVerbalTotal;

  return {
    verbalCount,
    verbalTotal,
    nonVerbalCount,
    nonVerbalTotal,
    isComplete
  };
}

export function formatPoin3_1Note(
  data: Poin3_1ClinicalData,
  patientName: string,
  medicalRecord?: string
): string {
  const { verbalCount, verbalTotal, nonVerbalCount, nonVerbalTotal, isComplete } =
    getPoin3_1Counts(data);

  const identityLabel = [
    patientName || 'Pasien',
    medicalRecord ? `RM: ${medicalRecord}` : null,
    data.tanggalLahirPasien ? `Tgl Lahir: ${data.tanggalLahirPasien}` : null
  ]
    .filter(Boolean)
    .join(', ');

  if (isComplete) {
    return `Identifikasi Verbal (${verbalCount}/${verbalTotal}) & Non-Verbal (${nonVerbalCount}/${nonVerbalTotal}) DILAKSANAKAN (${identityLabel})`;
  }
  return `Identifikasi Verbal ${verbalCount}/${verbalTotal}, Non-Verbal ${nonVerbalCount}/${nonVerbalTotal} (${identityLabel})`;
}

export function computeWeightMetrics(data: Poin3_2ClinicalData) {
  const pre = parseClinicalNumber(data.bbPre);
  const post = parseClinicalNumber(data.bbPost);
  const dry = parseClinicalNumber(data.bbKering);
  const ufg = parseClinicalNumber(data.ufg);

  const idwgKg =
    pre !== null && dry !== null && pre > 0 && dry > 0
      ? roundOneDecimal(pre - dry)
      : null;

  const idwgPct =
    idwgKg !== null && dry !== null && dry > 0
      ? roundOneDecimal((idwgKg / dry) * 100)
      : null;

  const deltaPrePostKg =
    pre !== null && post !== null && pre > 0 && post > 0
      ? roundOneDecimal(pre - post)
      : null;

  const recommendedUfgMl =
    pre !== null && dry !== null && pre > 0 && dry > 0
      ? Math.max(0, Math.round((pre - dry) * 1000))
      : null;

  let overloadStatus: 'normal' | 'moderate' | 'high' | 'incomplete' = 'incomplete';
  if (idwgPct !== null) {
    if (idwgPct > 5) {
      overloadStatus = 'high';
    } else if (idwgPct > 4) {
      overloadStatus = 'moderate';
    } else {
      overloadStatus = 'normal';
    }
  }

  const isComplete =
    pre !== null &&
    pre > 0 &&
    dry !== null &&
    dry > 0 &&
    ufg !== null &&
    ufg >= 0;

  return {
    pre,
    post,
    dry,
    ufg,
    idwgKg,
    idwgPct,
    deltaPrePostKg,
    recommendedUfgMl,
    overloadStatus,
    isComplete
  };
}

export function formatPoin3_2Note(data: Poin3_2ClinicalData): string {
  const metrics = computeWeightMetrics(data);
  const parts: string[] = [];

  if (metrics.pre !== null) parts.push(`BB Pre: ${metrics.pre} kg`);
  if (metrics.post !== null) parts.push(`BB Post: ${metrics.post} kg`);
  if (metrics.dry !== null) parts.push(`BB Kering: ${metrics.dry} kg`);
  if (metrics.ufg !== null) parts.push(`UFG: ${Math.round(metrics.ufg).toLocaleString('id-ID')} mL`);

  if (metrics.idwgKg !== null && metrics.idwgPct !== null) {
    const sign = metrics.idwgKg > 0 ? '+' : '';
    parts.push(`IDWG: ${sign}${metrics.idwgKg} kg (${metrics.idwgPct}%)`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'Parameter berat badan & UFG belum diinput';
}

export function computePreHdVitalsMetrics(data: Poin3_3ClinicalData) {
  const sys = parseClinicalNumber(data.tdSistolik);
  const dia = parseClinicalNumber(data.tdDiastolik);
  const hr = parseClinicalNumber(data.nadi);
  const rr = parseClinicalNumber(data.pernapasan);
  const temp = parseClinicalNumber(data.suhu);
  const spo2 = parseClinicalNumber(data.spo2);

  const mapMmHg =
    sys !== null && dia !== null && sys > 0 && dia > 0
      ? Math.round(dia + (sys - dia) / 3)
      : null;

  const alerts: string[] = [];
  let severity: 'normal' | 'warning' | 'critical' | 'incomplete' = 'incomplete';

  const isComplete =
    sys !== null &&
    sys > 0 &&
    dia !== null &&
    dia > 0 &&
    hr !== null &&
    hr > 0 &&
    rr !== null &&
    rr > 0 &&
    temp !== null &&
    temp > 0 &&
    spo2 !== null &&
    spo2 > 0;

  if (sys !== null && sys > 0) {
    if (sys < 90) {
      alerts.push(`Hipotensi Pre-HD (TD Sistolik ${sys} mmHg < 90 mmHg)`);
      severity = 'critical';
    } else if (sys >= 180 || (dia !== null && dia >= 110)) {
      alerts.push(`Hipertensi Berat Pre-HD (${sys}/${dia ?? '-'} mmHg)`);
      severity = 'warning';
    }
  }

  if (spo2 !== null && spo2 > 0 && spo2 < 94) {
    alerts.push(`Desaturasi Oksigen (SpO2 ${spo2}% < 94%)`);
    severity = 'critical';
  }

  if (temp !== null && temp >= 37.8) {
    alerts.push(`Febris Pre-HD (Suhu ${temp}°C ≥ 37.8°C)`);
    if (severity !== 'critical') severity = 'warning';
  }

  if (hr !== null && hr > 0 && (hr < 50 || hr > 110)) {
    alerts.push(`Frekuensi Nadi ${hr} x/mnt di luar rentang 50–110 x/mnt`);
    if (severity !== 'critical') severity = 'warning';
  }

  if (rr !== null && rr > 0 && (rr < 12 || rr > 24)) {
    alerts.push(`Frekuensi Napas ${rr} x/mnt di luar rentang 12–24 x/mnt`);
    if (severity !== 'critical') severity = 'warning';
  }

  if (isComplete && alerts.length === 0) {
    severity = 'normal';
  }

  return {
    sys,
    dia,
    hr,
    rr,
    temp,
    spo2,
    mapMmHg,
    alerts,
    severity,
    isComplete
  };
}

export function formatPoin3_3Note(data: Poin3_3ClinicalData): string {
  const m = computePreHdVitalsMetrics(data);
  const parts: string[] = [];

  if (m.sys !== null && m.dia !== null) {
    const mapStr = m.mapMmHg !== null ? `, MAP ${m.mapMmHg}` : '';
    parts.push(`TD Pre: ${m.sys}/${m.dia} mmHg (${data.posisiTd}${mapStr})`);
  }
  if (m.hr !== null) parts.push(`Nadi: ${m.hr} x/mnt`);
  if (m.rr !== null) parts.push(`RR: ${m.rr} x/mnt`);
  if (m.temp !== null) parts.push(`Suhu: ${m.temp}°C`);
  if (m.spo2 !== null) parts.push(`SpO2: ${m.spo2}%`);

  return parts.length > 0 ? parts.join(' | ') : 'TTV Pre-HD belum diinput';
}

export function createDefaultPatientClinicalDetails(
  preset: 'p1' | 'p2' | 'p3' | 'new' = 'new'
): PatientLogbookClinicalDetails {
  if (preset === 'p1') {
    return {
      poin2_1: setAllPoin2_1(true),
      poin3_1: {
        verbal: { namaLengkap: true, tanggalLahir: true },
        nonVerbal: { gelangIdentitas: true, dokumenRmDanResep: true },
        tanggalLahirPasien: '14/05/1972'
      },
      poin3_2: {
        bbPre: '64.2',
        bbPost: '61.6',
        bbKering: '61.5',
        ufg: '2700'
      },
      poin3_3: {
        tdSistolik: '145',
        tdDiastolik: '85',
        posisiTd: 'Duduk',
        nadi: '80',
        pernapasan: '20',
        suhu: '36.6',
        spo2: '98'
      }
    };
  }

  if (preset === 'p2') {
    return {
      poin2_1: setAllPoin2_1(true),
      poin3_1: {
        verbal: { namaLengkap: true, tanggalLahir: true },
        nonVerbal: { gelangIdentitas: true, dokumenRmDanResep: true },
        tanggalLahirPasien: '22/08/1968'
      },
      poin3_2: {
        bbPre: '55.4',
        bbPost: '53.1',
        bbKering: '53.0',
        ufg: '2400'
      },
      poin3_3: {
        tdSistolik: '138',
        tdDiastolik: '80',
        posisiTd: 'Duduk',
        nadi: '78',
        pernapasan: '19',
        suhu: '36.5',
        spo2: '99'
      }
    };
  }

  if (preset === 'p3') {
    return {
      poin2_1: setAllPoin2_1(true),
      poin3_1: {
        verbal: { namaLengkap: true, tanggalLahir: true },
        nonVerbal: { gelangIdentitas: true, dokumenRmDanResep: true },
        tanggalLahirPasien: '09/11/1975'
      },
      poin3_2: {
        bbPre: '68.0',
        bbPost: '65.2',
        bbKering: '65.0',
        ufg: '3000'
      },
      poin3_3: {
        tdSistolik: '150',
        tdDiastolik: '90',
        posisiTd: 'Berbaring',
        nadi: '84',
        pernapasan: '20',
        suhu: '36.7',
        spo2: '98'
      }
    };
  }

  return {
    poin2_1: setAllPoin2_1(false),
    poin3_1: {
      verbal: { namaLengkap: false, tanggalLahir: false },
      nonVerbal: { gelangIdentitas: false, dokumenRmDanResep: false },
      tanggalLahirPasien: ''
    },
    poin3_2: {
      bbPre: '',
      bbPost: '',
      bbKering: '',
      ufg: ''
    },
    poin3_3: {
      tdSistolik: '',
      tdDiastolik: '',
      posisiTd: 'Duduk',
      nadi: '',
      pernapasan: '',
      suhu: '',
      spo2: ''
    }
  };
}
