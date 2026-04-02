import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Dashboard — server component that will fetch data when DB is connected.
// For now, renders the structural layout with placeholder data guidance.

const statusVariant = {
  ACTIVE: "success" as const,
  MONITORING: "info" as const,
  DRAFT: "default" as const,
  PAUSED: "warning" as const,
  COMPLETED: "success" as const,
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your shopping intents and deal intelligence at a glance
          </p>
        </div>
        <Link href="/intents/new">
          <Button>New Intent</Button>
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium text-gray-500">Active Intents</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium text-gray-500">Monitoring</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium text-gray-500">Unread Alerts</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium text-gray-500">Sources Active</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">0</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent intents */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Intents
          </h2>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No shopping intents yet.</p>
            <Link
              href="/intents/new"
              className="text-sm text-brand-600 hover:text-brand-700 mt-2 inline-block"
            >
              Create your first intent
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Alerts
            </h2>
            <Link
              href="/alerts"
              className="text-sm text-brand-600 hover:text-brand-700"
            >
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No alerts yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Alerts will appear when monitoring detects price changes or new
              offers.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
