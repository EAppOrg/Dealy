import type { AlertType, AlertSeverity, AlertStatus } from "@dealy/db";

export interface AlertListItem {
  id: string;
  intentId: string;
  intentTitle: string;
  type: AlertType;
  title: string;
  message: string | null;
  severity: AlertSeverity;
  status: AlertStatus;
  createdAt: Date;
  readAt: Date | null;
}

export interface CreateAlertInput {
  intentId: string;
  type: AlertType;
  title: string;
  message?: string;
  severity?: AlertSeverity;
  metadata?: Record<string, unknown>;
}
