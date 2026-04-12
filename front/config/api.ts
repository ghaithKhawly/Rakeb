import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeBaseUrl(value: string): string {
  return trimTrailingSlash(value.trim());
}

function resolveHostFromExpoConfig(): string | null {
  const maybeExpoConfigHostUri = (Constants as unknown as { expoConfig?: { hostUri?: string } }).expoConfig?.hostUri;
  const maybeManifestDebuggerHost = (
    Constants as unknown as { manifest?: { debuggerHost?: string } }
  ).manifest?.debuggerHost;

  const hostUri = maybeExpoConfigHostUri ?? maybeManifestDebuggerHost;
  if (!hostUri) {
    return null;
  }

  return hostUri.split(":")[0] ?? null;
}

export function resolveApiBaseUrl(): string {
  const envBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (Platform.OS === "web") {
    if (envBaseUrl) {
      return normalizeBaseUrl(envBaseUrl);
    }

    return "http://localhost:3000";
  }

  const host = resolveHostFromExpoConfig();
  if (host) {
    return `http://${host}:3000`;
  }

  if (envBaseUrl) {
    return normalizeBaseUrl(envBaseUrl);
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:3000";
  }

  return "http://127.0.0.1:3000";
}

export const API_BASE_URL = resolveApiBaseUrl();

if (__DEV__) {
  console.log("[api] base URL", API_BASE_URL);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});