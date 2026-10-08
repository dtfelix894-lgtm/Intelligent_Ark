export type RiskLevel = "green" | "yellow" | "red";

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  tags: string[];
  summary_for_admin: string;
}

export interface ChatRequest {
  user_id: string;
  message: string;
  scenario: "university";
  dev_override?: "normal" | "yellow_alert" | "red_alert";
}

export interface ChatResponse {
  reply: string;
  risk_assessment: RiskAssessment;
}

export interface ArkAlert extends RiskAssessment {
  id: number;
  timestamp: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  risk_assessment?: RiskAssessment;
}

export interface AlertCard {
  /** 事件流水主键：此次动作的唯一标识（稳定哈希，不依赖时间戳） */
  eventId: number;
  /** 用户身份主键：高校模式为学号（旧数据兼容） */
  user_id: string;
  level: RiskLevel;
  score: number;
  tags: string[];
  summary_for_admin: string;
  timestamp: string;
  resolved?: boolean;
  scenario: "university";
  /** 兼容旧数据兜底 */
  id?: number;
}
