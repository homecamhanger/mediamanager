import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useRefreshStatus } from '../lib/useRefreshStatus.js';

/**
 * The panel's background-work indicator.
 *
 * "Updating…" then "Up to date", or nothing at all when the refresh was too quick
 * to be worth mentioning — see `useRefreshStatus` for why that timing matters.
 *
 * `aria-live="polite"` because the whole point is telling the user that stale-looking
 * data is being replaced; a screen reader should hear it too.
 */
export const RefreshIndicator: React.FC<{ active: boolean; className?: string }> = ({
  active,
  className = '',
}) => {
  const status = useRefreshStatus(active);

  if (status === 'idle') return null;

  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
        status === 'updating' ? 'text-sky-300/90' : 'text-emerald-300/90'
      } ${className}`}
    >
      {status === 'updating' ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Updating…
        </>
      ) : (
        <>
          <Check className="w-3 h-3" />
          Up to date
        </>
      )}
    </span>
  );
};
