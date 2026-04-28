'use client';

interface ParsedFieldProps {
  value: unknown;
  sourceQuote?: string;
  originalEmail: string;
}

interface SourceAttributionProps {
  parsedField: ParsedFieldProps;
}

/**
 * Highlights the first occurrence of `quote` inside `body` by wrapping it in a
 * <mark> element.  Returns an array of React-renderable nodes.
 */
function highlightQuote(body: string, quote: string): React.ReactNode {
  const idx = body.indexOf(quote);
  if (idx === -1) return body;
  return (
    <>
      {body.slice(0, idx)}
      <mark className="bg-yellow-200">{quote}</mark>
      {body.slice(idx + quote.length)}
    </>
  );
}

/**
 * Split-view component showing the Quantika-parsed value alongside the
 * original email body with the source quote highlighted.
 *
 * Used by match detail page to provide Trust UX transparency.
 */
export function SourceAttribution({ parsedField }: SourceAttributionProps) {
  const { value, sourceQuote, originalEmail } = parsedField;

  return (
    <div className="grid grid-cols-2 gap-4 text-sm border rounded-lg overflow-hidden">
      {/* Left: parsed value */}
      <div className="p-3 border-r bg-white">
        <p className="text-xs font-medium text-gray-500 mb-1">Quantika</p>
        <p className="font-medium">{String(value)}</p>
      </div>

      {/* Right: original email with optional highlight */}
      <div className="p-3 bg-gray-50">
        <p className="text-xs font-medium text-gray-500 mb-1">Original</p>
        {!originalEmail ? (
          <p className="text-gray-400 italic">Original email not available</p>
        ) : (
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {sourceQuote
              ? highlightQuote(originalEmail, sourceQuote)
              : (
                <>
                  {originalEmail}
                  <span className="block mt-2 text-xs text-gray-400 italic">
                    (no source quote)
                  </span>
                </>
              )}
          </p>
        )}
      </div>
    </div>
  );
}
