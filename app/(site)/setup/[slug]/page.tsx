import type { Metadata } from "next";
import { SetupClient } from "./setup-client";

export const metadata: Metadata = {
  title: "Configure a receptionist",
  description: "Set up a named AI receptionist demo for a client.",
};

export default async function SetupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <SetupClient slug={slug} />;
}
