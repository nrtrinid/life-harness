import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

export interface LocalTextFilePayload {
  json: string;
  fileName: string;
}

export function readWebFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result ?? ""));
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file."));
    };
    reader.readAsText(file);
  });
}

export function pickWebJsonFile(): Promise<LocalTextFilePayload | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";

    const finish = (payload: LocalTextFilePayload | null) => {
      input.remove();
      resolve(payload);
    };

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      try {
        const json = await readWebFileAsText(file);
        finish({ json, fileName: file.name });
      } catch {
        finish(null);
      }
    });

    document.body.appendChild(input);
    input.click();
  });
}

export async function pickNativeJsonFile(): Promise<LocalTextFilePayload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/json", "public.json", "*/*"],
    copyToCacheDirectory: true
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  const json = await FileSystem.readAsStringAsync(asset.uri);
  return {
    json,
    fileName: asset.name ?? "career-pack.json"
  };
}

export async function pickLocalJsonFile(): Promise<LocalTextFilePayload | null> {
  if (Platform.OS === "web") {
    return pickWebJsonFile();
  }
  return pickNativeJsonFile();
}

export async function fetchCareerPackTestFixture(): Promise<LocalTextFilePayload> {
  const response = await fetch("/fixtures/sample-career-source-pack.v1.json");
  if (!response.ok) {
    throw new Error(`Failed to load test fixture (${response.status}).`);
  }
  const json = await response.text();
  return {
    json,
    fileName: "sample-career-source-pack.v1.json"
  };
}
