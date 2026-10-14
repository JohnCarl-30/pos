import { cloneElement, isValidElement, type ReactNode } from "react";
import { Label } from "@/components/_ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
};

export default function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  trailing,
  className,
  children,
}: FieldProps) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span aria-hidden className="text-subtle">
              {" "}
              *
            </span>
          )}
        </Label>
        {trailing}
      </div>
      {control}
      {error ? (
        <span
          id={`${htmlFor}-error`}
          role="alert"
          className="caption-style text-danger block"
        >
          {error}
        </span>
      ) : (
        hint && (
          <span
            id={`${htmlFor}-hint`}
            className="caption-style text-subtle block"
          >
            {hint}
          </span>
        )
      )}
    </div>
  );
}
