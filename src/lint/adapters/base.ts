import path from "node:path";
import { LANGUAGE_ADAPTERS } from "../../language-registry";

export function getLanguageAdapter(filePath: string) {
  const normalizedPath = path.normalize(filePath);
  return LANGUAGE_ADAPTERS.find((adapter) => adapter.supports(normalizedPath)) ?? null;
}
