import "server-only";

export type AiProvider = "mock" | "fal" | "kling";

export type GeneratedVideo = {
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
};

export type ProviderPollResult =
  | {
      status: "processing";
      progress: number;
      metadata?: Record<string, unknown>;
    }
  | {
      status: "success";
      progress: 100;
      output: GeneratedVideo;
      metadata?: Record<string, unknown>;
    }
  | {
      status: "failed";
      progress: number;
      errorMessage: string;
      metadata?: Record<string, unknown>;
    };
