"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ theme = "light", toastOptions, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "!rounded-2xl !border-[#ECECEC] !bg-white !text-[#1F1F1F] !shadow-[0_10px_30px_rgba(31,31,31,.10)]",
          description: "!text-[#6B7280]",
          actionButton:
            "!rounded-xl !bg-[#C41E19] !px-3 !font-semibold !text-white",
          cancelButton:
            "!rounded-xl !border !border-[#ECECEC] !bg-white !px-3 !font-semibold !text-[#1F1F1F]",
          ...toastOptions?.classNames,
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
