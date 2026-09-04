import { z } from "zod";

export const UpdateDisplayNameBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(40, "Use 40 characters or fewer.")
    .regex(/^[^\p{C}\p{Zl}\p{Zp}]+$/u, "Use printable characters without line breaks."),
});
