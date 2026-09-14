export type Role = "member" | "admin" | "superadmin";
export type Page =
  "home" | "timeline" | "treasure" | "team" | "notices" | "profile" | "admin";
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
export interface WorkshopState {
  version: 1;
  settings: Settings;
  members: Record<string, Member>;
  schedule: Schedule[];
  treasures: Treasure[];
  notices: Notice[];
}
export type TreasureSecrets = Record<string, "treasure" | "bomb">;
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
  code?: string;
  memberId?: string;
  result?: ClaimResult;
  noticeId?: string;
  delivered?: number;
  failed?: number;
}
