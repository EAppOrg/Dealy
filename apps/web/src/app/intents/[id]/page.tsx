"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

interface IntentDetail {
  id: string;
  title: string;
  description: string | null;
  query: string;
  status: string;
  priority: string;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string;
  monitorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  retrievalRuns: Array<{
    id: string;
    status: string;
    sourceId: string;
    createdAt: string;
    itemsFound: number;
  }>;
  recommendations: Array<{
    id: string;
    version: number;
    confidence: number | null;
    algorithm: string;
    createdAt: string;
  }>;
  alertEvents: Array<{
    id: string;
    type: string;
    title: string;
    severity: string;
    createdAt: string;
  }>;
}

const statusBadge: Record<
  string,
  "success" | "info" | "warning" | "default" | "danger"
> = {
  ACTIVE: "success",
  MONITORING: "info",
  PAUSED: "warning",
  DRAFT: "default",
  COMPLETED: "success",
};

const runStatusBadge: Record<
  string,
  "success" | "info" | "warning" | "default" | "danger"
> = {
  COMPLETED: "success",
  FAILED: "danger",
  RUNNING: "info",
  PENDING: "warning",
};

export default function IntentDetailPage() {
  const params = useParams();
  const [intent, setIntent] = useState<IntentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const fetchIntent = useCallback(async () => {
    const res = await fetch(`/api/intents/${params.id}`);
    const data = await res.json();
    return data.intent as IntentDetail;
  }, [params.id]);

  useEffect(() => {
    fetchIntent()
      .then(setIntent)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchIntent]);

  // Poll while any runs are PENDING or RUNNING
  useEffect(() => {
    if (!polling || !intent) return;

    const hasActiveRuns = intent.retrievalRuns.some(
      (r) => r.status === "PENDING" || r.status === "RUNNING"
    );

    if (!hasActiveRuns) {
      setPolling(false);
      setRunLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const updated = await fetchIntent();
        setIntent(updated);
      } catch (err) {
        console.error("Poll failed:", err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [polling, intent, fetchIntent]);

  async function triggerRun() {
    setRunLoading(true);
    try {
      // POST returns immediately with PENDING runs
      await fetch(`/api/intents/${params.id}/run`, { method: "POST" });
      // Fetch to see the newly created PENDING runs
      const updated = await fetchIntent();
      setIntent(updated);
      // Start polling for completion
      setPolling(true);
    } catch (err) {
      console.error("Failed to trigger run:", err);
      setRunLoading(false);
    }
  }

  if (loading) {
    return <div className="text-gray-500">Loading intent...</div>;
  }

  if (!intent) {
    return <div className="text-red-600">Intent not found</div>;
  }

  const hasActiveRuns = intent.retrievalRuns.some(
    (r) => r.status === "PENDING" || r.status === "RUNNING"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{intent.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Query: &quot;{intent.query}&quot;
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/intents/${intent.id}/compare`}>
            <Button variant="secondary">Compare Offers</Button>
          </Link>
          <Button
            onClick={triggerRun}
            disabled={runLoading || hasActiveRuns}
          >
            {runLoading || hasActiveRuns ? "Running..." : "Run Search"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Details</h2>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Status</dt>
                  <dd className="mt-1">
                    <Badge
                      variant={statusBadge[intent.status] ?? "default"}
                    >
                      {intent.status}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Priority</dt>
                  <dd className="mt-1 font-medium">{intent.priority}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Budget Range</dt>
                  <dd className="mt-1 font-medium">
                    {intent.budgetMin || intent.budgetMax
                      ? `${intent.budgetMin ? formatCurrency(intent.budgetMin, intent.currency) : "—"} – ${intent.budgetMax ? formatCurrency(intent.budgetMax, intent.currency) : "—"}`
                      : "Not set"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Monitoring</dt>
                  <dd className="mt-1 font-medium">
                    {intent.monitorEnabled ? "Enabled" : "Disabled"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-500">Description</dt>
                  <dd className="mt-1">
                    {intent.description || "No description"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Recent runs */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Recent Retrieval Runs</h2>
            </CardHeader>
            <CardContent>
              {intent.retrievalRuns.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No retrieval runs yet. Click &quot;Run Search&quot; to start.
                </p>
              ) : (
                <div className="space-y-2">
                  {intent.retrievalRuns.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between rounded-md border border-gray-100 p-3 text-sm"
                    >
                      <div>
                        <Badge
                          variant={runStatusBadge[run.status] ?? "default"}
                        >
                          {run.status}
                        </Badge>
                        <span className="ml-2 text-gray-500">
                          {run.itemsFound} items
                        </span>
                      </div>
                      <span className="text-gray-400">
                        {formatRelativeTime(run.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recommendation */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Recommendation</h2>
            </CardHeader>
            <CardContent>
              {intent.recommendations.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No recommendations yet. Run a search first.
                </p>
              ) : (
                <div className="text-sm">
                  <p className="text-gray-500">
                    Version {intent.recommendations[0].version}
                  </p>
                  <p className="text-gray-500 mt-1">
                    Confidence:{" "}
                    {intent.recommendations[0].confidence
                      ? `${Math.round(intent.recommendations[0].confidence * 100)}%`
                      : "N/A"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {intent.recommendations[0].algorithm}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alerts */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Unread Alerts</h2>
            </CardHeader>
            <CardContent>
              {intent.alertEvents.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No unread alerts
                </p>
              ) : (
                <div className="space-y-2">
                  {intent.alertEvents.map((alert) => (
                    <div
                      key={alert.id}
                      className="rounded-md border border-gray-100 p-2 text-sm"
                    >
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {alert.type} · {formatRelativeTime(alert.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-xs text-gray-400">
            Created {formatRelativeTime(intent.createdAt)}
            <br />
            Updated {formatRelativeTime(intent.updatedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
