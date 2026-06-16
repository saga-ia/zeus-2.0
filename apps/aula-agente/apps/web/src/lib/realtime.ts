import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface UseRealtimeOptions<T> {
  table: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: T) => void;
  onDelete?: (payload: T) => void;
  enabled?: boolean;
}

interface RealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: unknown;
  old: unknown;
}

export function useRealtime<T>({
  table,
  filter,
  event = "*",
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeOptions<T>) {
  // Keep callbacks in refs so identity changes (inline arrow functions on every
  // render) don't tear down and recreate the channel.
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
    onDeleteRef.current = onDelete;
  }, [onInsert, onUpdate, onDelete]);

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    const channelConfig: Record<string, string> = {
      event,
      schema: "public",
      table,
    };

    if (filter) {
      channelConfig.filter = filter;
    }

    const channel = supabase
      .channel(`realtime:${table}:${filter || "all"}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, channelConfig as any, (payload: RealtimePayload) => {
        if (payload.eventType === "INSERT") {
          onInsertRef.current?.(payload.new as T);
        }
        if (payload.eventType === "UPDATE") {
          onUpdateRef.current?.(payload.new as T);
        }
        if (payload.eventType === "DELETE") {
          onDeleteRef.current?.(payload.old as T);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, event, enabled]);
}
