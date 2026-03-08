import { z } from "zod";

export const contentFormSchema = z.object({
  title: z.string().min(1, "タイトルを入力してください"),
  body: z.string().optional().default(""),
  content_type: z.string().min(1).default("article"),
  visibility: z.string().min(1).default("members"),
  published: z.boolean().default(false),
});

export type ContentFormInput = z.infer<typeof contentFormSchema>;
