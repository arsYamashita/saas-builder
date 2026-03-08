import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("正しいメールアドレスを入力してください"),
  password: z.string().min(8, "パスワードは8文字以上にしてください"),
  displayName: z.string().min(1, "表示名を入力してください"),
  tenantName: z.string().min(1, "テナント名を入力してください"),
});

export const loginSchema = z.object({
  email: z.string().email("正しいメールアドレスを入力してください"),
  password: z.string().min(8, "パスワードは8文字以上にしてください"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
