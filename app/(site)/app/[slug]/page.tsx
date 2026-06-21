import type { Metadata } from "next";
import { AppDemoClient } from "./app-demo-client";

export const metadata: Metadata = {
  title: "Talk to your receptionist",
  description: "A quick 2-minute demo call with an AI receptionist.",
};

export default async function AppDemoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AppDemoClient slug={slug} />;
}
