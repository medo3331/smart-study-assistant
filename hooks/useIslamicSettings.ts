"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import { useState, useEffect, useCallback } from "react";
import {
  loadSettings,
  saveSettings,
  type IslamicSettings,
  DEFAULT_ISLAMIC_SETTINGS,
  subscribeSettings,
} from "@/lib/islamic/worship-progress";

interface UseIslamicSettingsReturn {
  settings: IslamicSettings;
  updateSetting: <K extends keyof IslamicSettings>(
    key: K,
    value: IslamicSettings[K]
  ) => void;
  updateSettings: (partial: Partial<IslamicSettings>) => void;
  resetSettings: () => void;
  isLoaded: boolean;
}

/**
 * Centralized hook for Islamic settings.
 * All worship components should use this instead of
 * scattered localStorage calls.
 *
 * - Loads from localStorage on mount
 * - Persists every change
 * - Listens to cross-tab changes
 */
export function useIslamicSettings(): UseIslamicSettingsReturn {
  const [settings, setSettings] = useState<IslamicSettings>(DEFAULT_ISLAMIC_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
          setIsLoaded(true);

    const unsub = subscribeSettings((updated) => {
      setSettings(updated);
    });

    return unsub;
  }, []);

  // Also subscribe to our own storage events
  useEffect(() => {
    const handler = () => {
      setSettings(loadSettings());
    };
    window.addEventListener("islamic-settings-change", handler);
    return () => window.removeEventListener("islamic-settings-change", handler);
  }, []);

  const updateSetting = useCallback(
    <K extends keyof IslamicSettings>(key: K, value: IslamicSettings[K]) => {
      setSettings((prev) => {
        const updated = { ...prev, [key]: value };
        saveSettings(updated);
        window.dispatchEvent(new Event("islamic-settings-change"));
        return updated;
      });
    },
    []
  );

  const updateSettings = useCallback((partial: Partial<IslamicSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      saveSettings(updated);
      window.dispatchEvent(new Event("islamic-settings-change"));
      return updated;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_ISLAMIC_SETTINGS);
    saveSettings(DEFAULT_ISLAMIC_SETTINGS);
    window.dispatchEvent(new Event("islamic-settings-change"));
  }, []);

  return { settings, updateSetting, updateSettings, resetSettings, isLoaded };
}