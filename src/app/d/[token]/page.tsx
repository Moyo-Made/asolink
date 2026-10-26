import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { getEventByAdminToken, getSummary } from "@/lib/dashboard";

export const metadata: Metadata = { title: "Order tracker", robots: { index: false, follow: false } };

export default async function DashboardPage({ params }: PageProps<"/d/[token]">) {
  const { token } = await params;
  const event = await getEventByAdminToken(token);
  if (!event) notFound();
  const summary = await getSummary(event);
  return (
    <Dashboard
      token={token}
      slug={event.slug}
      title={event.title}
      price={event.price_naira}
      initial={summary}
    />
  );
}
