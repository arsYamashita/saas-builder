import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface FormAlertProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Root/summary-level form error banner. Matches the destructive alert
 * convention already used ad hoc on the login and signup pages
 * (`role="alert"`, destructive border/background, leading icon) — kept here
 * as one shared component so the `useZodForm` foundation and any future
 * migrated form render errors identically.
 */
const FormAlert = React.forwardRef<HTMLDivElement, FormAlertProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5",
          className
        )}
        {...props}
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm text-destructive">{children}</p>
      </div>
    );
  }
);
FormAlert.displayName = "FormAlert";

export { FormAlert };
