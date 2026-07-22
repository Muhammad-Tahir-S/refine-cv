export const SCAN_ARTIFACT_NAMES = {
  report: "report.md",
  scanResult: "scan-result.json",
  manifest: "manifest.json",
} as const;

export type ScanArtifactName =
  (typeof SCAN_ARTIFACT_NAMES)[keyof typeof SCAN_ARTIFACT_NAMES];
