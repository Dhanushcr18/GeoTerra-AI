import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AIMode, ResultsResponse, StatusResponse } from "../types";

interface GeoTerraContextValue {
  data: ResultsResponse | null;
  status: StatusResponse | null;
  loading: boolean;
  error: string | null;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  aiMode: AIMode;
  updateAiMode: (mode: AIMode) => void;
  customLossPerHa: number | null;
  setCustomLossPerHa: (val: number | null) => void;
  refresh: () => Promise<void>;
}

const GeoTerraContext = createContext<GeoTerraContextValue | undefined>(undefined);

export const GeoTerraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoModeState] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>("cached");
  const [customLossPerHa, setCustomLossPerHa] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, resultsRes] = await Promise.all([api.getStatus(), api.getResults()]);
      setStatus(statusRes);
      setData(resultsRes);
      setAiMode(demoMode ? "cached" : statusRes.ai_mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to GeoTerra backend.");
    } finally {
      setLoading(false);
    }
  }, [demoMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setDemoMode = useCallback(
    (val: boolean) => {
      setDemoModeState(val);
      if (val) {
        setAiMode("cached");
      } else if (status) {
        setAiMode(status.ai_mode);
      }
    },
    [status]
  );

  const updateAiMode = useCallback(
    (mode: AIMode) => {
      setAiMode(demoMode ? "cached" : mode);
    },
    [demoMode]
  );

  return (
    <GeoTerraContext.Provider
      value={{
        data,
        status,
        loading,
        error,
        demoMode,
        setDemoMode,
        aiMode,
        updateAiMode,
        customLossPerHa,
        setCustomLossPerHa,
        refresh,
      }}
    >
      {children}
    </GeoTerraContext.Provider>
  );
};

export function useGeoTerra(): GeoTerraContextValue {
  const ctx = useContext(GeoTerraContext);
  if (!ctx) throw new Error("useGeoTerra must be used inside GeoTerraProvider");
  return ctx;
}
