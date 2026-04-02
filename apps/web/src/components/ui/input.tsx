import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          "block w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors",
          "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
          error
            ? "border-red-300 text-red-900 placeholder:text-red-300"
            : "border-gray-300 text-gray-900 placeholder:text-gray-400",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
);

Input.displayName = "Input";
