import { z } from "zod";

export const createContactSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(64, "Name must be at most 64 characters"),
  address: z.string().min(1, "Address is required"),
  memo: z.string().max(256).optional(),
});

export const updateContactSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  address: z.string().min(1).optional(),
  memo: z.string().max(256).optional(),
});
