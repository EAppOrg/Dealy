"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewIntentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      query: formData.get("query") as string,
      priority: formData.get("priority") as string,
      budgetMin: formData.get("budgetMin")
        ? Number(formData.get("budgetMin"))
        : undefined,
      budgetMax: formData.get("budgetMax")
        ? Number(formData.get("budgetMax"))
        : undefined,
      monitorEnabled: formData.get("monitorEnabled") === "on",
    };

    try {
      const res = await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Failed to create intent");
      }

      const { intent } = await res.json();
      router.push(`/intents/${intent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        New Shopping Intent
      </h1>

      <Card>
        <CardHeader>
          <p className="text-sm text-gray-500">
            Describe what you&apos;re looking for. Dealy will search sources and
            find the best deals.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="title"
              name="title"
              label="Title"
              placeholder='e.g. "New laptop for development"'
              required
            />

            <Input
              id="query"
              name="query"
              label="Search Query"
              placeholder='e.g. "MacBook Pro 16 M3 Pro"'
              required
            />

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Description (optional)
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Additional details about what you're looking for..."
              />
            </div>

            <div>
              <label
                htmlFor="priority"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM" selected>
                  Medium
                </option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                id="budgetMin"
                name="budgetMin"
                label="Min Budget"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
              <Input
                id="budgetMax"
                name="budgetMax"
                label="Max Budget"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="monitorEnabled"
                name="monitorEnabled"
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label
                htmlFor="monitorEnabled"
                className="text-sm text-gray-700"
              >
                Enable price monitoring
              </label>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Intent"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
