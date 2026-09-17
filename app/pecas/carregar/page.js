"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RedirecionaCarregarBases() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/configuracoes/carregar-bases");
  }, [router]);
  return null;
}
