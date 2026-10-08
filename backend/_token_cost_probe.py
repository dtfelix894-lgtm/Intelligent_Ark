# -*- coding: utf-8 -*-
"""一次性：用真实 DeepSeek API 测量各调用类型的真实 token 用量（读 response.usage）。"""
import os, json, httpx
from dotenv import load_dotenv
load_dotenv()
import llm_service as L

KEY = L.ZHIPU_API_KEY; MODEL = L.ZHIPU_MODEL; BASE = L.ZHIPU_BASE_URL
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def call(messages, json_mode=False, max_tokens=None, label=""):
    payload = {"model": MODEL, "messages": messages, "stream": False,
               "temperature": L.ZHIPU_TEMPERATURE}
    if json_mode: payload["response_format"] = {"type": "json_object"}
    if max_tokens: payload["max_tokens"] = max_tokens
    payload.update(L._thinking_payload())
    r = httpx.post(f"{BASE}/chat/completions", headers=H, json=payload, timeout=120)
    r.raise_for_status()
    u = r.json().get("usage", {})
    print(f"[{label}] prompt={u.get('prompt_tokens')} completion={u.get('completion_tokens')} total={u.get('total_tokens')}")
    return u

sys_u = L._build_system_prompt("university")
print(f"system_prompt(university) chars={len(sys_u)}")

# 1) 非流式首轮（无历史）—— /api/chat/stream 主路径
m1 = [{"role":"system","content":sys_u},
      {"role":"user","content":"最近考研压力好大，连着好几天失眠了，感觉撑不住"}]
u1 = call(m1, json_mode=True, label="非流式首轮(无历史)")

# 2) 非流式稳态（满 10 条历史）—— 对话进行中典型一轮
hist = []
samples = [("user","最近考研压力好大，连着好几天失眠了"),
           ("assistant","抱抱你～考研压力大到失眠真的很辛苦，能跟我说说最焦虑的是哪一科吗？"),
           ("user","数学，怎么刷题都记不住公式"),
           ("assistant","数学最磨人了。你不是记不住，是太累了大脑超载。试试睡前别再刷题好吗？"),
           ("user","可是我一闲下来就更焦虑，怕考不上"),
           ("assistant","这种'一停下来就慌'的感觉我懂。你最担心考不上之后会发生什么呢？"),
           ("user","怕家里人失望，他们供我读书不容易"),
           ("assistant","你这么替家里人着想，已经很懂事了。但你的价值不只由这一场考试决定。"),
           ("user","道理我都懂，可还是睡不着，今天又熬到三点"),
           ("assistant","连着熬夜身体会扛不住的。要不要我陪你做个两分钟的呼吸放松，试着躺下？")]
hist = [{"role":r,"content":c} for r,c in samples]
m2 = [{"role":"system","content":sys_u}] + hist + \
     [{"role":"user","content":"嗯好…可是脑子里还是停不下来，怎么办"}]
u2 = call(m2, json_mode=True, label="非流式稳态(满10条历史)")

# 3) SSE 路径的第二次调用：轻量风险评估
m3 = [{"role":"system","content":L._RISK_ASSESS_PROMPT},
      {"role":"user","content":"【用户消息】嗯好…可是脑子里还是停不下来，怎么办\n【陪伴助手回复】别急，我们一起慢慢来，先把灯调暗试着深呼吸好吗？"}]
u3 = call(m3, json_mode=True, max_tokens=400, label="SSE-轻量风险评估")

import pickle
pickle.dump({"u1":u1,"u2":u2,"u3":u3,"sys_chars":len(sys_u)}, open("_probe_out.pkl","wb"))
print("OK")
