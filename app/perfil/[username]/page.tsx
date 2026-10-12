import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ProfileView } from "@/components/profile-view";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function UserProfilePage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const username = resolvedParams.username;
  const challenge = resolvedSearchParams?.challenge;
  const from = (typeof resolvedSearchParams?.from === "string" ? resolvedSearchParams.from : undefined) as "ranking" | "social" | "mapa" | undefined;
  const initialMode = challenge === "peaks" ? "peaks" : "countries";
  const initialExperiences = challenge === "experiences";

  if (!supabase) return notFound();

  // We use the service role key or let RLS handle it? We are in a Server Component.
  // Wait, in Next.js App Router, server components fetching Supabase without cookies 
  // use the ANON key, which means they act as an unauthenticated user.
  // We can just pass the username to a client component and let it fetch.
  // The client component has the session cookie implicitly.
  return (
    <ProfileView
      username={username}
      initialMode={initialMode}
      initialExperiences={initialExperiences}
      fromTab={from}
    />
  );
}
