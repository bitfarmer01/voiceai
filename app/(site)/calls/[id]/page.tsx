import type { Metadata } from "next";
import { CallReportClient } from "./call-report-client";

export const metadata: Metadata = {
  title: "Call summary",
  description: "What happened on this call — booking, summary, and what the caller wanted.",
};

export default async function CallReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CallReportClient id={id} />;
}
