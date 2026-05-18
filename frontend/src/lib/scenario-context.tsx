"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Scenario = "university" | "community";

interface ScenarioContextType {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
}

const ScenarioContext = createContext<ScenarioContextType>({
  scenario: "university",
  setScenario: () => {},
});

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>("university");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("ark_scenario") as Scenario | null;
    if (saved === "university" || saved === "community") {
      setScenario(saved);
    }
    setMounted(true);
  }, []);

  const handleSetScenario = (s: Scenario) => {
    setScenario(s);
    localStorage.setItem("ark_scenario", s);
  };

  // SSR / first render: return null to avoid hydration mismatch
  if (!mounted) return null;

  return (
    <ScenarioContext.Provider value={{ scenario, setScenario: handleSetScenario }}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  return useContext(ScenarioContext);
}
