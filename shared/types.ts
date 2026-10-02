export type SourceType =
  | "note"
  | "communication"
  | "task"
  | "calendar"
  | "document"
  | "field"
  | "expense"
  | "contact";
export interface SourceRecord {
  id: string;
  type: SourceType;
  title: string;
  date?: string;
  text: string;
  locator?: string;
  url?: string;
}
export interface Fact {
  id: string;
  label: string;
  value: string;
  category: "coverage" | "treatment" | "financial" | "matter";
  certainty: "recorded" | "unknown" | "inferred";
  sourceIds: string[];
}
export interface Blocker {
  id: string;
  title: string;
  description: string;
  status:
    | "awaiting_response"
    | "not_requested"
    | "unavailable"
    | "needs_review"
    | "received_incomplete";
  priority: "high" | "medium" | "low";
  owner: string;
  providerId?: string;
  requestedAt?: string;
  lastActivityAt?: string;
  dueAt?: string;
  nextAction: string;
  sourceIds: string[];
}
export interface Provider {
  id: string;
  name: string;
}
export interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  category: string;
  sourceIds: string[];
}
export interface MatterSnapshot {
  id: string;
  number: string;
  clientName: string;
  description: string;
  status: string;
  stage: string;
  incidentDate?: string;
  attorney?: string;
  sourceMode: "sample" | "clio" | "import";
  importedAt: string;
  asOf: string;
  sources: SourceRecord[];
  facts: Fact[];
  blockers: Blocker[];
  events: TimelineEvent[];
  providers: Provider[];
  warnings: string[];
}
export interface MatterSummary {
  id: string;
  number: string;
  clientName: string;
  stage: string;
  sourceMode: MatterSnapshot["sourceMode"];
  blockers: number;
  importedAt: string;
}
export interface ClioStatus {
  configured: boolean;
  connected: boolean;
  region: string;
  missing: string[];
  lastSync?: string;
  message: string;
}
export interface ApprovedItem {
  id: string;
  label: string;
  value: string;
  kind: "fact" | "request";
  certainty: string;
  sources: { title: string; excerpt: string; locator?: string }[];
}
export interface ProviderShare {
  id: string;
  providerName: string;
  matterLabel: string;
  clientName: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastOpenedAt?: string;
  openCount: number;
  items: ApprovedItem[];
}
