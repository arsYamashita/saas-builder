import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface FormFieldErrorProps extends React.HTMLAttributes<HTMLParagraphElement> {
  id: string;
  message?: string;
}

/**
 * Inline field-level error message. Matches the `<p id=... className="text-sm
 * text-destructive">` convention already used ad hoc in the project-creation
 * wizard, so callers only need to wire `formState.errors.<field>?.message`.
 * Renders nothing when `message` is falsy, so it can be mounted
 * unconditionally next to every field.
 */
const FormFieldError = React.forwardRef<HTMLParagraphElement, FormFieldErrorProps>(
  ({ id, message, className, ...props }, ref) => {
    if (!message) return null;
    return (
      <p ref={ref} id={id} className={cn("text-sm text-destructive", className)} {...props}>
        {message}
      </p>
    );
  }
);
FormFieldError.displayName = "FormFieldError";

export { FormFieldError };
