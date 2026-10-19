/** Shared UI/server limits for the legacy project upload, not the workspace editor. */
export const PROJECT_UPLOAD = {
  requestBytes: 320 * 1024,
  fileBytes: 256 * 1024,
  deadlineMs: 10_000,
  parts: 5,
  headerBytes: 1024,
  features: 500,
  vertices: 5_000,
  featureVertices: 512,
  propertyBytes: 4096,
} as const;
