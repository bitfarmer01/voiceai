import { CallReportClient } from "./call-report-client";

export default async function CallReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CallReportClient id={id} />;
}
