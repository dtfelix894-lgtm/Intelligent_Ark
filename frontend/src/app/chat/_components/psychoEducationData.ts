/** 校园心理支持科普短文：非诊断；内容可由学校心理中心维护。 */

export type EduCategory = {
  id: string;
  label: string;
};

export type EduArticle = {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  body: string[];
  source: string;
};

export const EDU_CATEGORIES: EduCategory[] = [
  { id: "study", label: "学业" },
  { id: "sleep", label: "睡眠" },
  { id: "relation", label: "人际" },
  { id: "emotion", label: "情绪" },
  { id: "help", label: "求助" },
];

export const EDU_ARTICLES: EduArticle[] = [
  {
    id: "study-chunk",
    categoryId: "study",
    title: "大任务怎么拆小",
    summary: "面对堆成山的作业，先选一个 25 分钟能推进的切口。",
    body: [
      "当 DDL 叠在一起时，大脑常会把“整座山”当成一件事，于是迟迟不敢开始。",
      "可以试着只问自己：接下来 25 分钟，我能完成的最小一步是什么？例如打开文档、列出大纲、或写完第一段。",
      "完成一小步后给自己短暂休息。进度感往往比一次冲刺更可持续。",
      "这不是学习方法诊断，只是常见的压力应对小提示。若学业压力持续影响睡眠与日常，请联系辅导员或学校心理中心。",
    ],
    source: "校园心理支持资料",
  },
  {
    id: "sleep-wind-down",
    categoryId: "sleep",
    title: "睡前 30 分钟缓一缓",
    summary: "用可预期的睡前仪式，帮助身体切换到休息模式。",
    body: [
      "睡不着时越用力“命令自己睡着”，越容易紧张。可以先把目标改成：先让身体安静下来。",
      "试试固定的睡前流程：调暗灯光、放下含刺激内容的刷屏、做几轮缓慢呼吸，或听轻柔环境音。",
      "若连续多日失眠并影响白天状态，请寻求现实支持，而不是独自硬扛。",
      "本文仅供自我照顾参考，不能替代睡眠障碍的专业评估。",
    ],
    source: "校园心理支持资料",
  },
  {
    id: "relation-boundary",
    categoryId: "relation",
    title: "关系里的边界小练习",
    summary: "可以说清自己的限度，同时保持尊重。",
    body: [
      "边界不是拒绝所有人，而是让自己知道：什么让我安心，什么让我透支。",
      "可以用具体句子练习：“我今晚需要休息，我们明天再聊可以吗？”",
      "如果关系中出现持续的伤害或不安全，请优先联系可信任的人或学校支持资源。",
      "这不是人际关系诊断，只是沟通小提示。",
    ],
    source: "校园心理支持资料",
  },
  {
    id: "emotion-name-it",
    categoryId: "emotion",
    title: "给情绪一个名字",
    summary: "先命名，再决定要不要行动。",
    body: [
      "情绪上来时，先问：我现在更像难过、焦虑、委屈，还是疲惫？",
      "命名本身就能降低一点混沌感。你可以写在情绪日记或打卡里。",
      "若情绪强烈到难以自控，或出现伤害自己的想法，请立刻寻求现实帮助。",
      "这不是情绪障碍诊断，也不提供治疗或用药建议。",
    ],
    source: "校园心理支持资料",
  },
  {
    id: "help-when",
    categoryId: "help",
    title: "什么时候该找人帮忙",
    summary: "求助是能力，不是软弱。",
    body: [
      "当你持续两周以上情绪低落、睡眠或食欲明显改变、或学业功能明显下降时，值得找辅导员/心理中心聊聊。",
      "若出现伤害自己或他人的念头，请马上联系身边可信任的人、学校心理中心或当地紧急服务。",
      "平台「帮助」页会展示学校配置的求助电话与预约入口（以配置为准）。",
      "本文不构成诊断或治疗建议。",
    ],
    source: "校园心理支持资料",
  },
];
