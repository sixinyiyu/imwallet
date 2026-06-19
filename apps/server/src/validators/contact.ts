import { z } from "zod";

export const contactSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(64, "Name must be at most 64 characters"),
  address: z.string().min(1, "Address is required"),
  network: z.string().min(1, "Network is required"),
  memo: z.string().max(256).optional(),
});
