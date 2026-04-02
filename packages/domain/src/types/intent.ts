import type {
  ShoppingIntent,
  IntentStatus,
  IntentPriority,
} from "@dealy/db";

export type IntentListItem = Pick<
  ShoppingIntent,
  | "id"
  | "title"
  | "query"
  | "status"
  | "priority"
  | "budgetMin"
  | "budgetMax"
  | "currency"
  | "monitorEnabled"
  | "createdAt"
  | "updatedAt"
>;

export interface CreateIntentInput {
  workspaceId: string;
  title: string;
  description?: string;
  query: string;
  priority?: IntentPriority;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  monitorEnabled?: boolean;
  monitorInterval?: number;
}

export interface UpdateIntentInput {
  title?: string;
  description?: string;
  query?: string;
  priority?: IntentPriority;
  budgetMin?: number | null;
  budgetMax?: number | null;
  currency?: string;
  monitorEnabled?: boolean;
  monitorInterval?: number | null;
}

export interface IntentStatusChange {
  status: IntentStatus;
}
