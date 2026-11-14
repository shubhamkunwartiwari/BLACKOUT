import type { HeadlineStatResult } from './reportMetrics';

interface HeadlineStatBannerProps {
  stat: HeadlineStatResult;
}

export function HeadlineStatBanner({ stat }: HeadlineStatBannerProps) {
  const accentColor =
    stat.oursViolationsSoFar === 0
      ? 'var(--accent-amber)'
      : 'var(--status-critical)';

  return (
    <div
      data-testid="headline-stat-banner"
      aria-live="polite"
      className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-6 py-3"
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-3">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0"
          style={{ backgroundColor: accentColor }}
          aria-hidden="true"
        />
        <p
          data-testid="headline-stat-text"
          className="font-sans text-base font-medium tracking-tight text-[var(--text-primary)] sm:text-lg lg:text-xl lg:whitespace-nowrap lg:truncate"
        >
          {stat.headline}
        </p>
      </div>
    </div>
  );
}
