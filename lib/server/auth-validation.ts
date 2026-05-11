import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});

export const authSubmissionSchema = credentialsSchema.extend({
  turnstileToken: z.string().trim().max(4096).optional()
});
