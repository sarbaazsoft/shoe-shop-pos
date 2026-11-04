import React from 'react';

interface ClickableMessageProps {
  text: string;
  className?: string;
  linkClassName?: string;
}

/**
 * Renders message text with clickable HTTP/HTTPS links and Markdown-style [label](url) links.
 * Preserves newlines and ensures links do not trigger parent card clicks unexpectedly.
 */
export const ClickableMessage: React.FC<ClickableMessageProps> = ({
  text,
  className = '',
  linkClassName = '',
}) => {
  if (!text) return null;

  // Regex to match markdown links [label](url) or standalone URLs (http:// or https://)
  const linkRegex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)|https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (match[2] && match[3]) {
      // Markdown link [label](url)
      const label = match[2];
      const url = match[3];
      parts.push(
        <a
          key={`md-link-${match.index}`}
          href={url}
          target={url.startsWith('http') ? '_blank' : undefined}
          rel={url.startsWith('http') ? 'noopener noreferrer' : undefined}
          onClick={(e) => e.stopPropagation()}
          className={
            linkClassName ||
            'text-indigo-600 dark:text-purple-300 hover:text-indigo-800 dark:hover:text-purple-100 font-bold underline transition-colors break-all'
          }
        >
          {label}
        </a>
      );
    } else {
      // Raw URL
      const rawUrl = match[0];
      const cleanUrl = rawUrl.replace(/[.,;:!?)]+$/, '');
      const trailing = rawUrl.slice(cleanUrl.length);
      parts.push(
        <a
          key={`raw-url-${match.index}`}
          href={cleanUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={
            linkClassName ||
            'text-indigo-600 dark:text-purple-300 hover:text-indigo-800 dark:hover:text-purple-100 font-bold underline transition-colors break-all'
          }
        >
          {cleanUrl}
        </a>
      );
      if (trailing) {
        parts.push(trailing);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <span className={className}>{parts}</span>;
};
