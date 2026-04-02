"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/utils";

interface Run {
  id: string;
  status: string;
  itemsFound: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  intent: { id: string; title: string };
  source: { id: string; name: string };
}

const statusVariant: Record<string, "success" | "danger" | "info" | "warning" | "default"> = {
  COMPLETED: "success",
  FAILED: "danger",
  RUNNING: "info",
  PENDING: "warning",
  CANCELLED: "default",
};

export default function AdminRunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/runs")
      .then((r) => r.json())
      .then((data) => setRuns(data.runs ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Retrieval Runs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor and inspect deal retrieval run history
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center text-gray-500">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <p className="text-sm">No retrieval runs yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Runs are created when a search is triggered on an intent.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Intent</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items Found</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {run.intent.title}
                    </TableCell>
                    <TableCell>{run.source.name}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[run.status] ?? "default"}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{run.itemsFound}</TableCell>
                    <TableCell>{formatRelativeTime(run.createdAt)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-gray-500">
                      {run.errorMessage ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
