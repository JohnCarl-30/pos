"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function useLiveRefresh(table: "tabs" | "kitchen_tickets", storeId: string) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    const channel = supabase
      .channel(`live-${table}-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `store_id=eq.${storeId}` }, refresh);
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    const fallback = setInterval(() => router.refresh(), 30_000);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [router, table, storeId]);
}
