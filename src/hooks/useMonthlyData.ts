"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

interface UseMonthlyDataOptions<T> {
  getMonthKey?: (data: T) => string;
}

interface UseMonthlyDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  selectedMonth: string;
  setMonth: (month: string) => void;
}

export function useMonthlyData<T>(
  endpoint: string,
  options?: UseMonthlyDataOptions<T>,
): UseMonthlyDataResult<T> {
  const searchParams = useSearchParams();
  const monthParam = searchParams.get("month");

  // Keep getMonthKey in a ref so an inline/option function passed by callers
  // doesn't change fetchData's identity on every render (which would re-fire
  // the effect below and cause an infinite fetch loop).
  const getMonthKeyRef = useRef<(data: T) => string>(() => "");
  getMonthKeyRef.current =
    options?.getMonthKey ?? ((d: T) => (d as Record<string, unknown>).monthKey as string);

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");

  const fetchData = useCallback(async (month?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = month ? `?month=${month}` : "";
      const res = await fetch(`${endpoint}${params}`);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const json = await res.json();
      setData(json);
      if (!month) {
        setSelectedMonth(getMonthKeyRef.current(json));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    fetchData(monthParam || undefined);
  }, [fetchData, monthParam]);

  function setMonth(month: string) {
    setSelectedMonth(month);
    fetchData(month);
  }

  return { data, loading, error, selectedMonth, setMonth };
}
