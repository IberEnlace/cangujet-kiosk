import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:border-ring focus-visible:ring-ring/20 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(31,31,31,.10)] hover:bg-[#A8161A] hover:shadow-[0_5px_14px_rgba(31,31,31,.12)]",
        destructive:
          "border border-primary bg-white text-primary shadow-sm hover:bg-primary hover:text-primary-foreground hover:shadow-md focus-visible:ring-destructive/20",
        outline:
          "border border-border bg-white text-foreground shadow-sm hover:border-[#ECECEC] hover:bg-secondary hover:text-foreground hover:shadow-md",
        secondary:
          "border border-border bg-white text-secondary-foreground shadow-sm hover:border-[#ECECEC] hover:bg-secondary hover:shadow-md",
        ghost:
          "text-foreground shadow-none hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2.5 has-[>svg]:px-3.5",
        sm: "h-9 gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5",
        lg: "h-12 rounded-xl px-6 has-[>svg]:px-4",
        icon: "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
