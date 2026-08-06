import { cn } from "./utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-xl bg-[linear-gradient(100deg,#F8F9FA_25%,#FFFFFF_45%,#F8F9FA_65%)] bg-[length:220%_100%] animate-[cangujet-shimmer_1.4s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
