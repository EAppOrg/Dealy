"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Preferences {
  currency: string;
  locale: string;
  alertEmail: boolean;
  alertPush: boolean;
  maxBudgetAlert: number | null;
}

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => setPrefs(data.preferences))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!prefs) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });

      if (!res.ok) throw new Error("Failed to save");
      setMessage("Preferences saved successfully.");
    } catch {
      setMessage("Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !prefs) {
    return <div className="text-gray-500">Loading preferences...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">
          Customize your Dealy experience
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">General</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="currency"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Currency
              </label>
              <select
                id="currency"
                value={prefs.currency}
                onChange={(e) =>
                  setPrefs({ ...prefs, currency: e.target.value })
                }
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="locale"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Locale
              </label>
              <select
                id="locale"
                value={prefs.locale}
                onChange={(e) =>
                  setPrefs({ ...prefs, locale: e.target.value })
                }
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="de-DE">German</option>
                <option value="fr-FR">French</option>
              </select>
            </div>

            <Input
              id="maxBudgetAlert"
              label="Default Max Budget Alert"
              type="number"
              step="0.01"
              placeholder="No limit"
              value={prefs.maxBudgetAlert ?? ""}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  maxBudgetAlert: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />

            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Notifications
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="alertEmail"
                  checked={prefs.alertEmail}
                  onChange={(e) =>
                    setPrefs({ ...prefs, alertEmail: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="alertEmail" className="text-sm text-gray-700">
                  Email alerts
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="alertPush"
                  checked={prefs.alertPush}
                  onChange={(e) =>
                    setPrefs({ ...prefs, alertPush: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="alertPush" className="text-sm text-gray-700">
                  Push notifications
                </label>
              </div>
            </div>

            {message && (
              <div
                className={`rounded-md p-3 text-sm ${
                  message.includes("success")
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {message}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Preferences"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
