import path from "node:path";

import type { LanguageAdapter } from "../types";
import { createPythonAdapter } from "./python";
import { createTypeScriptAdapter } from "./typescript";

const adapters: LanguageAdapter[] = [createTypeScriptAdapter(), createPythonAdapter()];

export function getLanguageAdapter(filePath: string) {
  const normalizedPath = path.normalize(filePath);
  return adapters.find((adapter) => adapter.supports(normalizedPath)) ?? null;
}
