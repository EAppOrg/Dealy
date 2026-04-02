"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface Source {
  id: string;
  name: string;
  slug: string;
  type: string;
  baseUrl: string | null;
  enabled: boolean;
  createdAt: string;
  _count: { retrievalRuns: number; offers: number };
}

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchSources();
  }, []);

  async function fetchSources() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sources");
      const data = await res.json();
      setSources(data.sources ?? []);
    } catch (err) {
      console.error("Failed to fetch sources:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/admin/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          slug: fd.get("slug"),
          type: fd.get("type"),
          baseUrl: fd.get("baseUrl") || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }

      setShowForm(false);
      fetchSources();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sources</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage data sources for deal retrieval
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add Source"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">New Source</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="name"
                  name="name"
                  label="Name"
                  placeholder="Amazon"
                  required
                />
                <Input
                  id="slug"
                  name="slug"
                  label="Slug"
                  placeholder="amazon"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="type"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    required
                  >
                    <option value="RETAILER">Retailer</option>
                    <option value="MARKETPLACE">Marketplace</option>
                    <option value="AGGREGATOR">Aggregator</option>
                    <option value="PRICE_COMPARISON">Price Comparison</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </div>
                <Input
                  id="baseUrl"
                  name="baseUrl"
                  label="Base URL"
                  placeholder="https://amazon.com"
                />
              </div>
              {formError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}
              <div className="flex justify-end">
                <Button type="submit">Create Source</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center text-gray-500">Loading...</div>
          ) : sources.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <p className="text-sm">No sources configured.</p>
              <p className="text-xs text-gray-400 mt-1">
                Add sources to enable deal retrieval.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Offers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell className="font-medium">{source.name}</TableCell>
                    <TableCell className="text-gray-500">{source.slug}</TableCell>
                    <TableCell>
                      <Badge>{source.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={source.enabled ? "success" : "warning"}>
                        {source.enabled ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>{source._count.retrievalRuns}</TableCell>
                    <TableCell>{source._count.offers}</TableCell>
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
