import * as React from "react";

import { cn } from "./utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "resize-none border-input placeholder:text-muted-foreground flex field-sizing-content min-h-28 w-full rounded-xl border bg-white px-4 py-3 text-base shadow-sm transition-[background-color,border-color,box-shadow] outline-none hover:border-[#ECECEC] focus-visible:border-ring focus-visible:ring-ring/10 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-secondary disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
