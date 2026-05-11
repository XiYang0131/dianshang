export type AssetKind = "source_video" | "product_image" | "first_frame" | "output_video";

export type JobStatus = "pending" | "processing" | "success" | "failed";

export type JobStepStatus = "pending" | "processing" | "success" | "failed";

export type SelectionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
  normalizedX: number;
  normalizedY: number;
  normalizedWidth: number;
  normalizedHeight: number;
};

export type Asset = {
  id: string;
  userId?: string;
  kind: AssetKind;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type JobStep = {
  id: string;
  name: string;
  status: JobStepStatus;
  progress: number;
  message?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ReplacementJob = {
  id: string;
  userId?: string;
  sourceVideo: Asset;
  productImages: Asset[];
  outputVideo?: Asset;
  aiProvider?: "mock" | "fal" | "kling";
  aiProviderJobId?: string;
  providerMetadata?: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  replacementPrompt: string;
  selectionBox: SelectionBox;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedDurationMs: number;
  steps: JobStep[];
  createdAt: string;
  updatedAt: string;
};

export type UploadResponse = {
  asset: Asset;
};

export type JobResponse = {
  job: ReplacementJob;
};

export type JobsResponse = {
  jobs: ReplacementJob[];
};
