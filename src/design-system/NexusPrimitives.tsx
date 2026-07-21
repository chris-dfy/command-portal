import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Info,
  Inbox,
  LoaderCircle,
} from "lucide-react";

export type NexusTone = "neutral" | "info" | "success" | "attention" | "critical";
export type NexusState = "idle" | "loading" | "empty" | "success" | "failure";
export type NexusButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type NexusControlSize = "sm" | "md" | "lg";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface NexusButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NexusButtonVariant;
  size?: NexusControlSize;
  loading?: boolean;
}

export function NexusButton({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: NexusButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={classes("nx-button", `nx-button--${variant}`, size !== "md" && `nx-button--${size}`, className)}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
    >
      {loading && <span className="nx-button__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export interface NexusIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: NexusButtonVariant;
  size?: NexusControlSize;
  loading?: boolean;
}

export function NexusIconButton({
  label,
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: NexusIconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={classes("nx-icon-button", `nx-button--${variant}`, `nx-icon-button--${variant}`, size !== "md" && `nx-icon-button--${size}`, className)}
      aria-label={label}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      disabled={disabled || loading}
    >
      {loading ? <span className="nx-button__spinner" aria-hidden="true" /> : children}
    </button>
  );
}

export interface NexusStatusProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  tone?: NexusTone;
  children: ReactNode;
  pulse?: boolean;
}

export function NexusStatus({
  tone = "neutral",
  pulse = false,
  className,
  children,
  ...props
}: NexusStatusProps) {
  return (
    <span
      {...props}
      className={classes("nx-status", className)}
      data-nexus-tone={tone}
      data-pulse={pulse || undefined}
    >
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export interface NexusPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  bodyClassName?: string;
  interactive?: boolean;
}

export function NexusPanel({
  eyebrow,
  title,
  description,
  actions,
  icon,
  bodyClassName,
  interactive = false,
  className,
  children,
  ...props
}: NexusPanelProps) {
  const hasHeader = eyebrow !== undefined || title !== undefined || description !== undefined || actions !== undefined || icon !== undefined;
  return (
    <section
      {...props}
      className={classes("nx-panel", className)}
      data-interactive={interactive || undefined}
    >
      {hasHeader && (
        <header className="nx-panel__header">
          <div>
            {eyebrow !== undefined && <span className="nx-eyebrow">{eyebrow}</span>}
            {title !== undefined && <h2>{title}</h2>}
            {description !== undefined && <p>{description}</p>}
          </div>
          {(actions !== undefined || icon !== undefined) && (
            <div className="nx-panel__actions">
              {actions}
              {icon !== undefined && <span className="nx-panel__icon">{icon}</span>}
            </div>
          )}
        </header>
      )}
      <div className={classes("nx-panel__body", bodyClassName)}>{children}</div>
    </section>
  );
}

export interface NexusMetricProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: NexusTone;
}

export function NexusMetric({
  label,
  value,
  detail,
  tone = "neutral",
  className,
  ...props
}: NexusMetricProps) {
  return (
    <article {...props} className={classes("nx-metric", className)} data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail !== undefined && <small>{detail}</small>}
    </article>
  );
}

export interface NexusPageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function NexusPageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  className,
  ...props
}: NexusPageHeaderProps) {
  return (
    <header {...props} className={classes("nx-page-header", "nx-motion-enter", className)}>
      <div className="nx-page-header__identity">
        {icon !== undefined && <span className="nx-page-header__icon">{icon}</span>}
        <div>
          <small>{eyebrow}</small>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {actions !== undefined && <div className="nx-page-header__actions">{actions}</div>}
    </header>
  );
}

export interface NexusProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  value: number;
  label: string;
  max?: number;
  tone?: NexusTone;
}

export function NexusProgress({
  value,
  label,
  max = 100,
  tone = "neutral",
  className,
  ...props
}: NexusProgressProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? value : 0;
  const bounded = Math.max(0, Math.min(safeMax, safeValue));
  const percentage = (bounded / safeMax) * 100;
  return (
    <div
      {...props}
      className={classes("nx-progress", className)}
      data-tone={tone}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={bounded}
      role="progressbar"
    >
      <span style={{ width: `${percentage}%` }} />
    </div>
  );
}

export interface NexusStateViewProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  state: NexusState;
  title?: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
}

export function NexusStateView({
  state,
  title,
  detail,
  actions,
  className,
  ...props
}: NexusStateViewProps) {
  const content = {
    idle: [Circle, "Ready", "Waiting for an operational signal."],
    loading: [LoaderCircle, "Establishing context", "NEXUS is verifying the available Runtime evidence."],
    empty: [Inbox, "No evidence recorded", "This workspace will populate when verified evidence is available."],
    success: [CheckCircle2, "Verified", "The operation completed with recorded evidence."],
    failure: [AlertTriangle, "Unable to establish state", "Review the evidence and retry when the source is available."],
  } as const;
  const [Icon, defaultTitle, defaultDetail] = content[state];
  return (
    <div
      {...props}
      className={classes("nx-state", className)}
      data-state={state}
      role={state === "failure" ? "alert" : "status"}
      aria-busy={state === "loading" || undefined}
    >
      <span className="nx-state__icon"><Icon aria-hidden="true" /></span>
      <strong>{title ?? defaultTitle}</strong>
      <p>{detail ?? defaultDetail}</p>
      {actions !== undefined && <div className="nx-state__actions">{actions}</div>}
    </div>
  );
}

export interface NexusTabItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
  controls?: string;
}

export interface NexusTabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  label: string;
  items: NexusTabItem[];
  active: string;
  onChange: (id: string) => void;
}

export function NexusTabs({
  label,
  items,
  active,
  onChange,
  className,
  ...props
}: NexusTabsProps) {
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? []);
    if (!tabs.length) return;
    event.preventDefault();
    const currentIndex = Math.max(0, tabs.indexOf(event.currentTarget));
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const target = tabs[targetIndex];
    target.focus();
    const nextId = target.dataset.tabId;
    if (nextId) onChange(nextId);
  }

  return (
    <div {...props} className={classes("nx-tabs", className)} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          data-tab-id={item.id}
          aria-selected={active === item.id}
          aria-controls={item.controls}
          tabIndex={active === item.id ? 0 : -1}
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
          onKeyDown={moveFocus}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export interface NexusCalloutProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  tone?: Exclude<NexusTone, "neutral">;
  title: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
}

export function NexusCallout({
  tone = "info",
  title,
  children,
  icon,
  className,
  ...props
}: NexusCalloutProps) {
  const DefaultIcon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <aside {...props} className={classes("nx-callout", className)} data-tone={tone}>
      {icon ?? <DefaultIcon aria-hidden="true" />}
      <div>
        <strong>{title}</strong>
        {children !== undefined && <p>{children}</p>}
      </div>
    </aside>
  );
}

export interface NexusSkeletonProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}

export function NexusSkeleton({
  width,
  height,
  className,
  style,
  ...props
}: NexusSkeletonProps) {
  return (
    <span
      {...props}
      className={classes("nx-skeleton", className)}
      style={{ ...style, width, height }}
      aria-hidden="true"
    />
  );
}
