// Voice AI — domain placeholders.
// Call UI still in src/components/ops.tsx (CallPanel, TriggerCallButton).
export type VoiceCallType = "driver_check" | "customer_eta" | "pod_followup";

export interface VoiceCallRequest {
  loadId: string;
  type: VoiceCallType;
  toPhone: string;
}

export const moduleId = "voice-ai" as const;
