"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

interface ComparisonRow {
  offerId: string;
  productName: string;
  sellerName: string | null;
  sourceName: string;
  price: number;
  shippingCost: number | null;
  totalCost: number;
  condition: string;
  url: string;
  lastSeenAt: string;
}

export default function ComparePage() {
  const params = useParams();
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/intents/${params.id}/compare`)
      .then((r) => r.json())
      .then((data) => setRows(data.comparison ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <div className="text-gray-500">Loading comparison...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compare Offers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Side-by-side comparison of all offers for this intent
          </p>
        </div>
        <Link href={`/intents/${params.id}`}>
          <Button variant="secondary">Back to Intent</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-sm">No offers to compare yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Run a search from the intent detail page to find offers.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Shipping</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={row.offerId}>
                    <TableCell className="font-medium">
                      {idx === 0 && (
                        <Badge variant="success" className="mr-2">
                          Best
                        </Badge>
                      )}
                      {row.productName}
                    </TableCell>
                    <TableCell>{row.sourceName}</TableCell>
                    <TableCell>{row.sellerName ?? "—"}</TableCell>
                    <TableCell>{formatCurrency(row.price)}</TableCell>
                    <TableCell>
                      {row.shippingCost != null
                        ? formatCurrency(row.shippingCost)
                        : "Free"}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(row.totalCost)}
                    </TableCell>
                    <TableCell>
                      <Badge>{row.condition}</Badge>
                    </TableCell>
                    <TableCell>{formatRelativeTime(row.lastSeenAt)}</TableCell>
                    <TableCell>
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:text-brand-700 text-sm"
                      >
                        View
                      </a>
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
