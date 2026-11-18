import React from 'react';
import { splitForDisplay } from '../lib/pathDisplay.js';
import type { MediaSource } from '../../shared/types.js';

/**
 * Displays a file path with its full value always available on hover.
 *
 * Two rules, both from the same complaint that paths are long and unreadable:
 *
 *  - `title` carries the complete path, always. A shortened path that cannot be
 *    recovered is worse than a long one, because you cannot act on it.
 *  - The text itself is shortened from the left when a source root is known, since the
 *    end of a path — the filename — is the part being read. The elided prefix is
 *    dimmed so the eye lands on the name.
 *
 * `truncate` is the caller's choice: list rows want one line, a detail panel may wrap.
 */
export const PathText: React.FC<{
  /** The real, full path. Used verbatim in the tooltip. */
  path: string | null | undefined;
  /** Source roots to shorten against. Longest match wins. */
  sources?: MediaSource[] | Array<string | null | undefined>;
  /** Show only the filename, keeping the directory in the tooltip. */
  nameOnly?: boolean;
  /** Show the containing directory instead of the file name. */
  directoryOnly?: boolean;
  className?: string;
  /** Element to render; `code` matches the existing monospace path styling. */
  as?: 'code' | 'span';
  /** Single line with an ellipsis. */
  truncate?: boolean;
}> = ({
  path,
  sources = [],
  nameOnly = false,
  directoryOnly = false,
  className = '',
  as = 'span',
  truncate = false,
}) => {
  if (!path) return null;

  // Accept either source records (the common case) or bare root strings.
  const roots = sources.map((s) => (typeof s === 'string' ? s : s?.path));
  const { prefix, name } = splitForDisplay(path, roots);
  const Component = as;

  const content = directoryOnly ? (
    <span className="text-slate-300">{prefix || name}</span>
  ) : nameOnly ? (
    <span className="text-slate-200">{name}</span>
  ) : (
    <>
      {prefix && <span className="text-slate-500">{prefix}</span>}
      <span className="text-slate-200">{name}</span>
    </>
  );

  return (
    <Component
      // Always the full path, never the shortened one: the tooltip is the escape hatch.
      title={path}
      className={`${className} ${truncate ? 'block truncate' : ''}`.trim()}
    >
      {content}
    </Component>
  );
};
