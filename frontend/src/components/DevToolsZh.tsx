"use client";

import { useEffect } from "react";

/**
 * 开发环境专用：把 Next.js 开发者工具（左下角 “N” 标）的英文界面替换为中文。
 *
 * Next.js 15 的 dev tools 没有 i18n 配置项（next.config.js 的 devIndicators
 * 只接受 position 或 false），文案是编译进 node_modules 的，因此只能在运行时
 * 对其 shadow DOM 做文本替换。生产构建下 process.env.NODE_ENV 被静态替换为
 * "production"，整个副作用会被摇掉。
 */

/** 通用词条：多词、语义明确，可在任意位置替换。 */
const TEXT: Record<string, string> = {
  // 指示器菜单
  "Route Info": "路由信息",
  Preferences: "偏好设置",
  Issues: "问题",
  "Learn More": "了解更多",
  "Open in editor": "在编辑器中打开",
  "Click to open in your editor": "点击在编辑器中打开",
  "Close devtools panel": "关闭开发者工具面板",
  "Next.js Dev Tools Items": "Next.js 开发者工具",
  "Open issues overlay": "打开问题面板",
  "Collapse issues badge": "收起问题徽标",

  // 通用设置
  General: "通用",
  Theme: "主题",
  "Select your theme preference.": "选择主题外观。",
  Position: "位置",
  "Adjust the placement of your dev tools.": "调整开发者工具的位置。",
  Size: "大小",
  "Adjust the size of your dev tools.": "调整开发者工具的大小。",
  "Hide Dev Tools for this session": "本次会话隐藏开发者工具",
  "Hide Dev Tools until you restart your dev server, or 1 day.":
    "隐藏后需重启开发服务器，或等待 1 天才会再次显示。",
  "Hide Dev Tools shortcut": "隐藏开发者工具的快捷键",
  "Set a custom keyboard shortcut to toggle visibility.":
    "设置用于切换显示的自定义快捷键。",
  "Disable Dev Tools for this project": "为本项目禁用开发者工具",
  "To disable this UI completely, set": "如需完全禁用此界面，请将",
  "in your": "写入",
  "file.": "文件。",
  "Clear shortcut": "清除快捷键",
  Clear: "清除",
  Hide: "隐藏",
  Show: "显示",
  Recording: "录制中",
  "Record Shortcut": "录制快捷键",

  // 开发服务器
  "Development Server": "开发服务器",
  "Restart Dev Server": "重启开发服务器",
  Restart: "重启",
  "Restarts the development server without needing to leave the browser.":
    "无需离开浏览器即可重启开发服务器。",
  "Reset Bundler Cache": "重置打包器缓存",
  "Reset Cache": "重置缓存",
  "Clears the bundler cache and restarts the dev server. Helpful if you are seeing stale errors or changes are not appearing.":
    "清除打包器缓存并重启开发服务器。遇到残留报错或改动不生效时可用。",
  "Try Turbopack": "试用 Turbopack",
  "Turbopack is enabled.": "已启用 Turbopack。",
  "Clear Segment Overrides": "清除分段覆盖",
  "Toggle Overrides": "切换覆盖",

  // 路由信息
  Route: "路由",
  Static: "静态",
  Dynamic: "动态",

  // 错误浮层
  "Build Error": "构建错误",
  "Failed to compile": "编译失败",
  "Unknown Error": "未知错误",
  "Invalid date": "无效日期",
  "Copy Error Info": "复制错误信息",
  "Error Info Copied": "错误信息已复制",
  "Copy Chrome DevTools URL": "复制 Chrome DevTools 地址",
  "Copy to clipboard is not supported in this browser":
    "当前浏览器不支持复制到剪贴板",
  "Go to related documentation": "查看相关文档",
  "No related documentation found": "未找到相关文档",
  "Mark as helpful": "标记为有帮助",
  "Mark as not helpful": "标记为无帮助",
  "No node provided": "未提供节点",
};

/** 短词条：只在下拉框内替换，避免误伤路由信息等动态内容。 */
const OPTION: Record<string, string> = {
  System: "跟随系统",
  Light: "浅色",
  Dark: "深色",
  "Bottom Left": "左下角",
  "Bottom Right": "右下角",
  "Top Left": "左上角",
  "Top Right": "右上角",
  Small: "小",
  Medium: "中",
  Large: "大",
};

const SKIP_TAGS = new Set(["SCRIPT", "STYLE"]);

function translate(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName)) continue;

    const raw = text.nodeValue ?? "";
    const key = raw.trim();
    if (!key) continue;

    // 短词条（System/Light/Small 等）只在 select 内替换，避免误伤动态内容。
    const inSelect = parent.closest("option, select") !== null;
    const hit = (inSelect ? OPTION[key] : undefined) ?? TEXT[key];
    if (!hit) continue;

    // 只改 nodeValue，不替换节点：React 仍持有同一个 Text 引用，重渲染不会报错。
    text.nodeValue = raw.replace(key, hit);
  }
}

export function DevToolsZh() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const roots = new Set<ShadowRoot>();

    // 面板内容是动态渲染的，每次变更后重新翻译一次即可收敛：
    // 替换后的中文不再是词条 key，不会产生新的变更。
    const observer = new MutationObserver(() => {
      roots.forEach(translate);
    });

    function scan() {
      document.querySelectorAll("nextjs-portal").forEach((portal) => {
        const shadow = portal.shadowRoot;
        if (!shadow || roots.has(shadow)) return;
        roots.add(shadow);
        translate(shadow);
        observer.observe(shadow, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      });
    }

    scan();
    // portal 由 Next.js 注入脚本创建，监听 body 以捕获其挂载。
    const bodyObserver = new MutationObserver(scan);
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      bodyObserver.disconnect();
    };
  }, []);

  return null;
}
