"use client";

import { useState } from "react";
import { apiFetch, saveToken } from "@/lib/api";

export default function SimpleLogin() {
  const [account, setAccount] = useState("001");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      console.log("Sending request...");
      const res = await apiFetch("/api/auth/c-login", {
        method: "POST",
        autoRedirectOn401: false,
        body: { account, password } as any,
      });
      console.log("Response status:", res.status);

      const json = await res.json();
      console.log("Response:", json);

      if (json.success && json.token) {
        saveToken("c", json.token);
        const currentUser = {
          role: "student" as const,
          studentId: account,
          school: "保定学院",
          degree: "本科生",
          displayName: "张同学",
        };
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        setMessage("登录成功！正在跳转...");
        window.location.href = "/chat";
      } else {
        setMessage("错误: " + (json.detail || "登录失败"));
      }
    } catch (err) {
      console.error("Error:", err);
      setMessage("网络错误: " + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "400px", margin: "0 auto" }}>
      <h1>简单登录测试</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label>账号:</label>
          <input
            type="text"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          />
        </div>
        <div>
          <label>密码:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          />
        </div>
        <button type="submit" disabled={loading} style={{ padding: "12px", backgroundColor: "#3b82f6", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
      {message && <p style={{ marginTop: "16px", color: message.includes("成功") ? "green" : "red" }}>{message}</p>}
      <p style={{ marginTop: "20px", color: "#666", fontSize: "12px" }}>
        演示账号: 001 / 123456
      </p>
    </div>
  );
}
