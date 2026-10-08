"""Synthetic rule contracts, not a clinical validation dataset."""
import unittest
from llm_service import _risk, _fallback, _build_system_prompt

# Explicit, reviewable product expectations; ambiguous disclosures stay escalated.
CASES = [
    ("普通近况", "今天和同学吃饭很开心", "green"),
    ("本人轻生", "我不想活了", "red"),
    ("本人自伤", "我想伤害自己", "red"),
    ("空白变体", "我 不 想 活 了", "red"),
    ("明确否定意图", "我不想自杀", "green"),
    ("明确否定念头", "我没有自杀的想法", "green"),
    ("否定自伤", "我不会伤害自己", "green"),
    ("否定轻生念头", "我没有不想活的念头", "green"),
    ("否定后转折", "我不想自杀，但我想伤害自己", "red"),
    ("无标点转折", "我不想自杀但是我想割腕", "red"),
    ("双重否定", "我不是不想自杀", "red"),
    ("犹豫不排除", "我不敢自杀", "red"),
    ("否定混合黄", "我没有自杀的想法，但最近很焦虑", "yellow"),
    ("本人引用", "我脑子里一直是“我不想活了”", "red"),
    ("单独引号", "“我不想活了”", "red"),
    ("虚构引用", "小说里的人物说“我不想活了”", "green"),
    ("虚构后本人", "小说里的人物说“我不想活了”，我也想伤害自己", "red"),
    ("虚构同句本人", "小说里的人物说“我不想活了”我也想伤害自己", "red"),
    ("现实同学", "室友说“我不想活了”，我该怎么办", "red"),
    ("教学预防", "今天心理课讨论自杀预防", "green"),
    ("论文主题", "我在写关于自杀预防的论文", "green"),
    ("教学混合风险", "今天心理课讨论自杀预防，但我现在不想活了", "red"),
    ("课程不能豁免", "心理课上我说我想自杀", "red"),
    ("焦虑定义", "焦虑是什么意思", "green"),
    ("情绪否定", "我并不焦虑，状态还可以", "green"),
    ("情绪双重否定", "我不是不焦虑", "yellow"),
    ("否定换行后风险", "我没有自杀的想法\n我想伤害自己", "red"),
    ("否定不跨句", "我不焦虑，但我睡不着", "yellow"),
    ("第三人称否定不猜测", "室友说他不会自杀", "red"),
    ("历史风险仍核实", "我以前自残过", "red"),
    ("不确定引用", "新闻提到自杀，我不知道怎么办", "red"),
    ("失眠", "最近睡不着", "yellow"),
    ("单次难过", "我好难过", "yellow"),
    ("学业压力", "最近学习压力很大", "yellow"),
    ("多类困扰", "最近失眠而且焦虑", "yellow"),
]


class RiskLanguageTests(unittest.TestCase):
    def test_language_matrix(self):
        for name, message, expected in CASES:
            with self.subTest(name=name, message=message):
                result = _risk(message)
                self.assertEqual(result.level, expected)
                self.assertEqual(bool(result.tags), expected != "green")
                self.assertTrue(0 <= result.score <= 100)

    def test_yellow_reply_does_not_invent_symptoms(self):
        for message in ("我好难过", "最近学习压力很大", "最近睡不着"):
            with self.subTest(message=message):
                reply = _fallback(message)
                self.assertEqual(reply.risk_assessment.level, "yellow")
                self.assertNotIn("连续几天", reply.reply)
                self.assertIn("辅导员", reply.reply)
                if "睡" not in message:
                    self.assertNotIn("睡不好", reply.reply)

    def test_third_party_summary_does_not_assert_student_intent(self):
        result = _risk("室友说他想自杀")
        self.assertEqual(result.level, "red")
        self.assertIn("对象", result.summary_for_admin)

    def test_model_prompt_matches_rule_result(self):
        for _, message, level in CASES:
            with self.subTest(message=message):
                prompt = _build_system_prompt("senior_sister", None, message)
                self.assertIn(f"规则分级={level}", prompt)
                self.assertIn("不得虚构症状", prompt)
                self.assertEqual("停止玩梗和表情" in prompt, level != "green")


if __name__ == "__main__":
    unittest.main()
