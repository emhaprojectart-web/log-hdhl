import React from 'react';
import {
  PatientHDSession,
  ShiftInfo,
  MasterPatient,
  MasterNurse,
  MasterBed,
  SystemAccessRole
} from '../types/dialysis.ts';
import {
  Logbook5ButtonsView,
  ManagedPatient,
  PjVerificationStatus
} from './Logbook5ButtonsView.tsx';
import { LoginUserData } from './LoginPage.tsx';

interface PelaksanaViewProps {
  sessions?: PatientHDSession[];
  onOpenSessionModal?: (
    session?: PatientHDSession,
    initialTab?: 'bagian1' | 'bagian2' | 'bagian3' | 'bagian4' | 'bagian5'
  ) => void;
  onQuickToggleComplete?: (id: string) => void;
  onOpenMasterModal?: () => void;
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

export const PelaksanaView: React.FC<PelaksanaViewProps> = ({
  sessions = [],
  shiftInfo,
  masterPatients = [],
  masterNurses = [],
  masterBeds = [],
  loggedInUser,
  userRole = 'perawat_pelaksana',
  onSyncNurseSessions,
  onShiftChange,
  onDateChange,
  isCustomDate,
  onResetDateToToday,
  onNavigateToVerifikasi,
  onNavigateToRiwayat
}) => {
  return (
    <div className="w-full">
      <Logbook5ButtonsView
        key={`${userRole}-${loggedInUser?.name || 'default'}`}
        sessions={sessions}
        shiftInfo={shiftInfo}
        masterPatients={masterPatients}
        masterNurses={masterNurses}
        masterBeds={masterBeds}
        loggedInUser={loggedInUser}
        userRole={userRole}
        onSyncNurseSessions={onSyncNurseSessions}
        onShiftChange={onShiftChange}
        onDateChange={onDateChange}
        isCustomDate={isCustomDate}
        onResetDateToToday={onResetDateToToday}
        onNavigateToVerifikasi={onNavigateToVerifikasi}
        onNavigateToRiwayat={onNavigateToRiwayat}
      />
    </div>
  );
};
