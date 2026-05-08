import "server-only";

import { Queue } from "bullmq";
import IORedis from "ioredis";

let generationQueue: Queue | null | undefined;

export function getGenerationQueue() {
  if (!process.env.REDIS_URL) return null;
  if (generationQueue === undefined) {
    const connection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null
    });
    generationQueue = new Queue("video-product-replacement", { connection });
  }
  return generationQueue;
}

export async function enqueueGenerationJob(jobId: string) {
  const queue = getGenerationQueue();
  if (!queue) {
    return {
      mode: "mock",
      queued: false
    };
  }
  await queue.add("replace-product", { jobId });
  return {
    mode: "bullmq",
    queued: true
  };
}
