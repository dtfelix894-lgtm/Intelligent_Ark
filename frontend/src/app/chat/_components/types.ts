export type RiskAssessment = {
  level: "green" | "yellow" | "red" | string;
  score: number;
  tags: string[];
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  risk?: RiskAssessment;
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
  hotlines?: Array<{ label: string; phone: string }>;
};
