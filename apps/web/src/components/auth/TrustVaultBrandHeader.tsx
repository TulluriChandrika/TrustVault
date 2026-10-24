import * as React from "react";
import { cn } from "@/lib/utils";

interface TrustVaultBrandHeaderProps {
  className?: string;
}

export const TrustVaultBrandHeader: React.FC<TrustVaultBrandHeaderProps> = ({
  className,
}) => {
  return (
    <div className={cn("-mt-4 flex flex-col items-center justify-center text-center select-none", className)}>
      {/* Logo & Brand Name Row */}
      <div className="flex items-center justify-center gap-3">
        {/* Shield with Padlock */}
        <div className="relative flex items-center justify-center">
          <svg
            width="38"
            height="42"
            viewBox="0 0 38 42"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-sm"
          >
            {/* Outer Shield */}
            <path
              d="M19 2.2L35 8V19.5C35 30 19 40 19 40C19 40 3 30 3 19.5V8L19 2.2Z"
              fill="#FFFFFF"
              stroke="#6153CC"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Padlock Body */}
            <rect
              x="12.5"
              y="19"
              width="13"
              height="10"
              rx="2.2"
              fill="#6153CC"
            />
            {/* Padlock Shackle */}
            <path
              d="M15.2 19V15.2C15.2 13.1 16.9 11.4 19 11.4C21.1 11.4 22.8 13.1 22.8 15.2V19"
              stroke="#6153CC"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
            {/* Keyhole dot & slot */}
            <circle cx="19" cy="23" r="1.3" fill="#FFFFFF" />
            <path
              d="M19 24.3V26.5"
              stroke="#FFFFFF"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Brand Name (28-30px target) */}
        <span className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[#101936]">
          TrustVault
        </span>
      </div>

      {/* Uppercase Tagline (11-13px target) */}
      <div className="mt-2 text-[11.5px] sm:text-[12px] font-semibold tracking-[0.24em] text-[#6153CC] uppercase">
        SECURE &middot; ORGANIZE &middot; SHARE
      </div>
    </div>
  );
};
