import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input flex h-12 w-full min-w-0 rounded-xl border bg-white px-4 py-2.5 text-base shadow-sm transition-[background-color,border-color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium hover:border-[#ECECEC] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-secondary disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:bg-white focus-visible:ring-ring/10 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
