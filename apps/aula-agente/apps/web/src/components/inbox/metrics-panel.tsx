"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/realtime";
import type { ConversationMetrics } from "@aula-agente/shared";

interface MetricsPanelProps {
  conversationId: string;
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function MetricsPanel({ conversationId }: MetricsPanelProps) {
  const [metrics, setMetrics] = useState<ConversationMetrics | null>(null);

  const fetchMetrics = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("conversation_metrics")
      .select("*")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    setMetrics((data as ConversationMetrics) || null);
  }, [conversationId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useRealtime<ConversationMetrics>({
    table: "conversation_metrics",
    filter: `conversation_id=eq.${conversationId}`,
    onInsert: fetchMetrics,
    onUpdate: fetchMetrics,
  });

  if (!metrics) {
    return <p className="text-xs text-muted-foreground">Sem métricas ainda</p>;
  }

  return (
    <dl className="grid grid-cols-2 gap-2 text-xs">
      <dt className="text-muted-foreground">Mensagens</dt>
      <dd className="text-right font-medium">{metrics.message_count}</dd>

      <dt className="text-muted-foreground">Humanas</dt>
      <dd className="text-right font-medium">{metrics.human_messages_count}</dd>

      <dt className="text-muted-foreground">1ª resposta</dt>
      <dd className="text-right font-medium">{formatMs(metrics.first_response_time_ms)}</dd>

      <dt className="text-muted-foreground">Resolução</dt>
      <dd className="text-right font-medium">{formatMs(metrics.resolution_time_ms)}</dd>
    </dl>
  );
}
