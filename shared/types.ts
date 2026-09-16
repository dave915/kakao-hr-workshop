export type Role = "member" | "admin" | "superadmin";
export type Page =
  | "home"
  | "timeline"
  | "treasure"
  | "team"
  | "notices"
  | "photos"
  | "profile"
  | "admin";
export interface Member {
  id: string;
  name: string;
  handle: string;
  team: string;
  role: Role;
  score: number;
  found: number;
  blockedUntil: number;
  joined: boolean;
}
export interface Schedule {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  description: string;
  category: "gather" | "activity" | "meal" | "rest";
}
export interface Treasure {
  id: string;
  name: string;
  hint: string;
  lat: number;
  lng: number;
  points: number;
  radius: number;
  foundBy: string | null;
  foundAt: number | null;
  outcome?: "treasure" | "bomb";
}
export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: string;
  author: string;
  createdAt: number;
  pushStatus: "none" | "pending" | "sent" | "partial" | "failed";
  delivered?: number;
  failed?: number;
}
export interface Settings {
  title: string;
  subtitle: string;
  location: string;
  startsAt: string;
  endsAt: string;
  center: [number, number];
  gameOpen: boolean;
}
export type VisibleTreasure = Omit<Treasure, "lat" | "lng"> & {
  lat?: number;
  lng?: number;
};
export interface WorkshopState<T extends VisibleTreasure = Treasure> {
  resetGeneration?: number;
  version: 1;
  settings: Settings;
  members: Record<string, Member>;
  schedule: Schedule[];
  treasures: T[];
  notices: Notice[];
}
export type WorkshopView = WorkshopState<VisibleTreasure>;
export type Proximity = "far" | "warm" | "close" | "hot" | "within";
export interface TreasureGuidance {
  treasureId: string;
  bearing: number | null;
  direction: string;
  distance: number;
  proximity: Proximity;
  heat: number;
  withinRange: boolean;
  cameraOnly: boolean;
  updatedAt: number;
}
export type TreasureSecrets = Record<string, "treasure" | "bomb">;
export interface ArTarget {
  treasureId: string;
  lat: number;
  lng: number;
  visibilityRange: number;
  updatedAt: number;
}
export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}
export interface ClaimResult {
  outcome: "treasure" | "bomb";
  points: number;
  blockedUntil: number;
}
export interface ActionResponse {
  memberInvites?: Array<{ memberId: string; handle: string; code: string }>;
  invitations?: Array<{ memberId: string; code: string }>;
  memberDevices?: Record<string, MemberDevices>;
  arTarget?: ArTarget | null;
  guidance?: TreasureGuidance;
  code?: string;
  memberId?: string;
  result?: ClaimResult;
  noticeId?: string;
  delivered?: number;
  failed?: number;
}
export interface DeviceReport {
  deviceId: string;
  platform: "Android" | "iOS" | "Windows" | "macOS" | "기타";
  installation: "installed" | "not-installed" | "unknown";
  permission: "granted" | "denied" | "default" | "unsupported";
  push: "subscribed" | "unsubscribed" | "unknown";
}
export interface DeviceStatus extends DeviceReport {
  lastSeenAt: number;
  installedAt?: number;
  installationCheckedAt?: number;
  removedAt?: number;
}
export interface MemberDevices {
  devices: DeviceStatus[];
  pushDevices: number;
}
