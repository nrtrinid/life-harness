import { useCallback } from "react";
import { Platform } from "react-native";

import {
  fetchCareerPackTestFixture,
  pickLocalJsonFile,
  type LocalTextFilePayload
} from "../platform/readLocalTextFile";

export function useCareerPackFilePicker() {
  const pickCareerPackFile = useCallback(async (): Promise<LocalTextFilePayload | null> => {
    return pickLocalJsonFile();
  }, []);

  const loadCareerPackTestFixture = useCallback(async (): Promise<LocalTextFilePayload | null> => {
    if (Platform.OS !== "web") {
      return null;
    }
    try {
      return await fetchCareerPackTestFixture();
    } catch {
      return null;
    }
  }, []);

  return {
    pickCareerPackFile,
    loadCareerPackTestFixture
  };
}

export type { LocalTextFilePayload };
