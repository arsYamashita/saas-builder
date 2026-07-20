"use client";

import { useForm, type FieldValues, type UseFormProps, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

/**
 * Canonical react-hook-form + Zod integration for this codebase.
 *
 * Wires a Zod schema — the same schema `lib/validation/*` already exports
 * and that the corresponding API route re-parses server-side — into
 * `react-hook-form` via `@hookform/resolvers/zod`. The schema is the single
 * source of truth for validation rules and error messages on both sides of
 * the wire; this hook is the only place that should call `zodResolver`.
 *
 * ```ts
 * const form = useZodForm(loginSchema, { defaultValues: { email: "", password: "" } });
 * const onSubmit = form.handleSubmit(async (values) => { ... });
 * ```
 *
 * Defaults to `mode: "onBlur"` / `reValidateMode: "onChange"` (validate once
 * a field is left, then live-update while the user fixes it). Callers can
 * override either via `options`.
 */
export function useZodForm<TSchema extends z.ZodType<FieldValues, any, any>>(
  schema: TSchema,
  options?: Omit<UseFormProps<z.infer<TSchema>>, "resolver">
): UseFormReturn<z.infer<TSchema>> {
  return useForm<z.infer<TSchema>>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    reValidateMode: "onChange",
    ...options,
  });
}
