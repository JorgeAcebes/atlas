import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ProfileView } from "@/components/profile-view";
import { resolveRecordMetadata } from "@/lib/record-metadata";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(
  { params, searchParams }: Props
): Promise<Metadata> {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const username = resolvedParams.username;
  const challenge = typeof resolvedSearchParams?.challenge === "string" ? resolvedSearchParams.challenge : undefined;
  const recordId = typeof resolvedSearchParams?.record === "string" ? resolvedSearchParams.record : undefined;

  return resolveRecordMetadata({
    username,
    challenge,
    recordId,
  });
}

export default async function UserProfilePage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const username = resolvedParams.username;
  const challenge = resolvedSearchParams?.challenge;
  const from = (typeof resolvedSearchParams?.from === "string" ? resolvedSearchParams.from : undefined) as "ranking" | "social" | "mapa" | undefined;
  const initialMode = challenge === "peaks" ? "peaks" : "countries";
  const initialExperiences = challenge === "experiences";
  const initialRecord = typeof resolvedSearchParams?.record === "string" ? resolvedSearchParams.record : undefined;

  if (!supabase) return notFound();

  return (
    <ProfileView
      username={username}
      initialMode={initialMode}
      initialExperiences={initialExperiences}
      fromTab={from}
      initialRecord={initialRecord}
    />
  );
}
