"use client";

import { ProfilePage } from "@/components/profile/ProfilePage";
import { useParams } from "next/navigation";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <ProfilePage username={params.id} />;
}