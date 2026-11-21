import { useEffect, useState } from "react";
import { Hourglass, Sparkles } from "lucide-react";
import { aiQueueStatus, onAIQueueStatus } from "../services/aiQueueStatus";

// Floating status while an AI request waits for, or holds, the AI server.
export function AIQueueNotice() {
  const [status, setStatus] = useState(aiQueueStatus);
  useEffect(() => onAIQueueStatus(setStatus), []);
  if (!status) return null;
  const answering = status.position === 0;
  return (
    <div className="toast ai-queue-notice" role="status" aria-live="polite">
      <span>{answering ? <Sparkles size={15} /> : <Hourglass size={15} />}</span>
      {answering
        ? "CLOQI KI denkt nach … das kann bis zu einer Minute dauern."
        : status.position === 1
          ? "Du bist als Nächstes dran. Die KI beantwortet gerade eine andere Anfrage."
          : `Platz ${status.position} in der KI-Warteschlange. Bitte Fenster offen lassen.`}
    </div>
  );
}
