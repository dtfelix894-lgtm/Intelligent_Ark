export type RiskAssessment = {
  level: "green" | "yellow" | "red" | string;
  score: number;
  tags: string[];
};

export type HelpResourcePhone = {
  label: string;
  phone: string;
  kind?: "psych_center" | "hotline";
};

export type HelpResourceAppointment = {
  label: string;
  url: string;
};

export type HelpResourcesConfig = {
  psych_center?: HelpResourcePhone | null;
  hotlines?: HelpResourcePhone[];
  appointment?: HelpResourceAppointment | null;
  crisis_message?: string;
  configured: boolean;
  is_placeholder?: boolean;
  missing_hint?: string | null;
};

export type CrisisSupport = {
  message: string;
  resources: HelpResourcePhone[];
  appointment?: HelpResourceAppointment | null;
  configured: boolean;
  is_placeholder?: boolean;
  missing_hint?: string | null;
  trust_prompt?: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  risk?: RiskAssessment;
  /** COMP-04：仅 red 时由 /api/chat/stream 返回，刷新后可由 risk.level==="red" + /api/help-resources 重建 */
  crisis_support?: CrisisSupport;
};

export type CompanionPersona = "senior_sister" | "senior_brother";

export type CampusTermPhase = "term_start" | "term_time" | "exam_season" | "break";

export type CampusTimeContext = {
  local_hour: number;
  weekday: number;
  phase: CampusTermPhase;
};

export type CampusContext = {
  scenario: "university";
  daily_quote?: string;
  daily_quote_source?: string;
  hotlines?: HelpResourcePhone[];
  help_resources?: HelpResourcesConfig;
};
