"use client";
import { createContext, useContext, ReactNode } from "react";
export type Scenario = "university";
const ScenarioContext = createContext<{scenario: Scenario; setScenario:(s:Scenario)=>void}>({scenario:"university",setScenario:()=>{}});
export function ScenarioProvider({children}:{children:ReactNode}){return <ScenarioContext.Provider value={{scenario:"university",setScenario:()=>{}}}>{children}</ScenarioContext.Provider>}
export function useScenario(){return useContext(ScenarioContext)}
