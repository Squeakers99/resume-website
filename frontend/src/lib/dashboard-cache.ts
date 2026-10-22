import "server-only";
import { cache } from "react";
import { getBackendStatus } from "./api";

export const getBackendConnected = cache(async (): Promise<boolean> => {
  try {
    return (await getBackendStatus()) === "connected";
  } catch {
    return false;
  }
});
