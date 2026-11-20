import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import type { TaskStatusName } from "@/lib/solana/config";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "ghost" | "danger";
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-primary text-primary-fg hover:opacity-90",
        variant === "accent" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "ghost" && "border border-border bg-transparent text-fg hover:bg-surface-2",
        variant === "danger" && "border border-danger bg-transparent text-danger hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-fg">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const control =
  "min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-fg outline-none placeholder:text-muted focus:border-primary";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, "min-h-28 resize-y", props.className)} />;
}

export function Select(props: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return <select {...props} className={cn(control, props.className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-border bg-surface p-5", className)}>{children}</section>
  );
}

export function StatusPill({ status }: { status: TaskStatusName | string }) {
  const tone =
    status === "Open" || status === "Approved" || status === "Completed"
      ? "bg-accent text-accent-fg"
      : status === "Assigned" || status === "Pending"
        ? "bg-primary text-primary-fg"
        : status === "Rejected" || status === "Cancelled"
          ? "bg-danger text-primary-fg"
          : "bg-surface-2 text-fg";
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tone)}>{status}</span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums text-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}
