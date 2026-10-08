"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
/** 保留旧链接兼容性，但不再提供绕过真实鉴权的测试登录。 */
export default function TestLoginRedirect(){const router=useRouter();useEffect(()=>{router.replace("/login")},[router]);return <main className="grid min-h-screen place-items-center">正在跳转到高校登录…</main>}
