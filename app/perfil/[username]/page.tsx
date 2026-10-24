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

  const rawChallenge = resolvedSearchParams?.challenge;
  const challenge =
    typeof rawChallenge === "string"
      ? rawChallenge
      : Array.isArray(rawChallenge)
      ? rawChallenge[0]
      : undefined;

  const rawRecord = resolvedSearchParams?.record ?? resolvedSearchParams?.panel;
  const recordId =
    typeof rawRecord === "string"
      ? rawRecord
      : Array.isArray(rawRecord)
      ? rawRecord[0]
      : undefined;

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

  const rawRecord = resolvedSearchParams?.record ?? resolvedSearchParams?.panel;
  const initialRecord =
    typeof rawRecord === "string"
      ? rawRecord
      : Array.isArray(rawRecord)
      ? rawRecord[0]
      : undefined;

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
