"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";

interface Alert {
  id: string;
  intentId: string;
  intentTitle: string;
  type: string;
  title: string;
  message: string | null;
  severity: string;
  status: string;
  createdAt: string;
  readAt: string | null;
}

const severityVariant: Record<string, "info" | "warning" | "danger"> = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "danger",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((data) => setAlerts(data.alerts ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function markRead(id: string) {
    await fetch(`/api/alerts/${id}/read`, { method: "POST" });
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "READ", readAt: new Date().toISOString() } : a))
    );
  }

  async function dismiss(id: string) {
    await fetch(`/api/alerts/${id}/dismiss`, { method: "POST" });
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "DISMISSED" } : a))
    );
  }

  if (loading) {
    return <div className="text-gray-500">Loading alerts...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Price drops, new offers, and monitoring notifications
        </p>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-12 text-gray-500">
              <p className="text-sm">No alerts yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Enable monitoring on an intent to receive alerts.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={alert.status === "UNREAD" ? "border-l-4 border-l-brand-500" : ""}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={severityVariant[alert.severity] ?? "info"}>
                        {alert.severity}
                      </Badge>
                      <Badge>{alert.type.replace(/_/g, " ")}</Badge>
                      {alert.status === "UNREAD" && (
                        <span className="h-2 w-2 rounded-full bg-brand-500" />
                      )}
                    </div>
                    <p className="font-medium mt-2">{alert.title}</p>
                    {alert.message && (
                      <p className="text-sm text-gray-500 mt-1">
                        {alert.message}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      Intent: {alert.intentTitle} ·{" "}
                      {formatRelativeTime(alert.createdAt)}
                    </p>
                  </div>
                  {alert.status === "UNREAD" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markRead(alert.id)}
                      >
                        Mark read
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => dismiss(alert.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
