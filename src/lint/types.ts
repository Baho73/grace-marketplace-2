export type LintSeverity = "error" | "warning";

export type ModuleRole = "RUNTIME" | "TEST" | "BARREL" | "CONFIG" | "TYPES" | "SCRIPT";
export type MapMode = "EXPORTS" | "LOCALS" | "SUMMARY" | "NONE";

export type LintIssue = {
  severity: LintSeverity;
  code: string;
  file: string;
  line?: number;
  message: string;
};

export type LintResult = {
  root: string;
  filesChecked: number;
  governedFiles: number;
  xmlFilesChecked: number;
  issues: LintIssue[];
};

export type LintOptions = {
  allowMissingDocs?: boolean;
};

export type GraceLintConfig = {
  ignoredDirs?: string[];
};

export type MarkupSection = {
  content: string;
  startLine: number;
  endLine: number;
};

export type ModuleContractInfo = {
  fields: Record<string, string>;
  purpose?: string;
  scope?: string;
  depends?: string;
  links?: string;
  role?: ModuleRole;
  mapMode?: MapMode;
};

export type ModuleMapItem = {
  label: string;
  symbolName?: string;
  line: number;
};

export type LanguageAnalysis = {
  adapterId: string;
  exports: Set<string>;
  valueExports: Set<string>;
  typeExports: Set<string>;
  exportConfidence: "exact" | "heuristic";
  hasDefaultExport: boolean;
  hasWildcardReExport: boolean;
  hasMainEntrypoint: boolean;
  directReExportCount: number;
  localExportCount: number;
  localImplementationCount: number;
  usesTestFramework: boolean;
};

export type LanguageAdapter = {
  id: string;
  supports(filePath: string): boolean;
  analyze(filePath: string, text: string): LanguageAnalysis;
};
