import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex min-h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold [&>svg]:pointer-events-none [&>svg]:size-3 focus-visible:border-ring focus-visible:ring-ring/20 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20 transition-[color,background-color,border-color,box-shadow]",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground [a&]:hover:bg-[#A8161A]",
        secondary:
          "border-border bg-secondary text-secondary-foreground [a&]:hover:border-[#ECECEC] [a&]:hover:bg-white",
        destructive:
          "border-primary bg-white text-primary [a&]:hover:bg-primary [a&]:hover:text-primary-foreground focus-visible:ring-destructive/20",
        outline:
          "border-border bg-white text-foreground [a&]:hover:bg-secondary [a&]:hover:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
