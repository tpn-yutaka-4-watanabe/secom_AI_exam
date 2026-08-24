import { notFound } from "next/navigation";
import { expectedAdminPath } from "@/lib/admin-auth";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage({ params }: { params: Promise<{ accessKey: string }> }) {
  const { accessKey } = await params;
  if (accessKey !== expectedAdminPath()) notFound();
  return <AdminDashboard accessKey={accessKey} />;
}
