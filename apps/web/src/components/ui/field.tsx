import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function FieldGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex flex-col gap-5", className)}
      {...props}
    />
  );
}

export function Field({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn("text-xs font-semibold uppercase tracking-wider text-slate-700 leading-none", className)}
      {...props}
    />
  );
}

export function FieldDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-slate-500 leading-normal", className)}
      {...props}
    />
  );
}

export function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-separator"
      className={cn("relative my-2 flex items-center justify-center text-xs uppercase", className)}
      {...props}
    >
      <Separator className="absolute inset-0 m-auto bg-slate-200" />
      {children && (
        <span className="relative z-10 bg-white px-3 text-slate-400 font-semibold tracking-wider text-[11px]">
          {children}
        </span>
      )}
    </div>
  );
}
