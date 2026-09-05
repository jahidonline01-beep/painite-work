export type Language = 'bn' | 'en';
export type Theme = 'dark' | 'light';

export interface UserAccount {
  name: string;
  phone: string;
  pass: string;
  uid: string;
  balance: number;
  completedTasks: number;
  completedNewTasks?: number;
  completedOldTasks?: number;
  completedPageCreateTasks?: number;
  completedBotNewIds?: number;
  completedPcClones?: number;
  idHubReport?: string;
  idHubReportAt?: number;
  idHubReportLabel?: string;
  idHubSuspendReport?: string;
  idHubSuspendReportAt?: number;
  idHubBotReport?: string;
  idHubBotReportAt?: number;
  idHubPcReport?: string;
  idHubPcReportAt?: number;
  isApproved: boolean;
  /** Master task access (all job types when false) */
  taskAccess?: boolean;
  /** Per-member New Job permission; default true if undefined */
  newJobAccess?: boolean;
  oldJobAccess?: boolean;
  /** Per-member Page Create permission; default true if undefined */
  pageCreateAccess?: boolean;
  botNewIdAccess?: boolean;
  pcCloneAccess?: boolean;
  newReport?: string;
  oldReport?: string;
  pageCreateReport?: string;
  newReportAt?: number;
  oldReportAt?: number;
  pageCreateReportAt?: number;
  /** Admin broadcast message (separate from reports) */
  adminMessage?: string;
  adminMessageAt?: number;
  suspendReport?: string;
  suspendReportAt?: number;
  withdrawNumber?: string;
  withdrawMethod?: 'bkash' | 'nagad';
  referredBy?: string;
  referredByName?: string;
  referredByPhone?: string;
  starred?: boolean;
}

export interface SheetTask {
  id?: string;
  fn?: string;
  ln?: string;
  fuln?: string;
  gen?: string;
  st?: string;
  dob?: string;
  listing?: string;
  checker?: string;
  phone?: string;
  inbox?: string;
  assignedUserUid?: string;
  assignedUserName?: string;
  assignedUserPhone?: string;
  assignedTime?: string;
  seq?: number;
  createdAt?: number;
  rawLine?: string;
}

export interface OldSheetTask {
  id?: string;
  phone?: string;
  inbox?: string;
  assignedUserUid?: string;
  assignedUserName?: string;
  assignedUserPhone?: string;
  assignedTime?: string;
  seq?: number;
  createdAt?: number;
  rawLine?: string;
}

export interface SubmittedTask extends SheetTask {
  id: string;
  user: string;
  jobType: 'New Job' | 'Old Job' | 'Page Create';
  userName: string;
  userUid: string;
  uid: string;
  pass: string;
  key2fa: string;
  mail: string;
  mailLink: string;
  status: 'pending' | 'approved' | 'rejected';
  time?: string;
}

export interface ReportedTask extends SheetTask {
  /** Change | Suspend — shown next to member UID in admin bad list */
  reportReason?: string;
  id: string;
  user: string;
  userName: string;
  userUid: string;
  jobType: 'New Job' | 'Old Job' | 'Page Create';
  time: string;
}

export interface RevokedTask {
  id: string;
  userName: string;
  userUid: string;
  jobType: 'New Job' | 'Old Job' | 'Page Create';
  taskInfo: string;
  phone: string;
  inbox: string;
  fullDetails?: SheetTask;
  time: string;
}

export interface WithdrawRequest {
  id: string;
  user: string;
  userName: string;
  userUid: string;
  method: 'bkash' | 'nagad';
  number: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  time: string;
}

export interface SystemSettings {
  newJob: boolean;
  oldJob: boolean;
  pageCreate: boolean;
  withdraw: boolean;
  botNewId?: boolean;
  pcClone?: boolean;
}
