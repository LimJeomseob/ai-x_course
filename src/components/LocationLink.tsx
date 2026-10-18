import clsx from "clsx";

interface LocationLinkProps {
  location: string;
  url: string | null;
  isOnline?: boolean;
  className?: string;
}

/**
 * 장소 표시 공통 규칙(PRD §5.6): 대면 장소 텍스트 자체를 네이버 지도 링크(새 창)로 렌더링한다.
 * 온라인 세션은 지도 링크 없이 "온라인(Zoom)" 텍스트만 표시한다(Zoom 링크는 메일로만 발송).
 */
export function LocationLink({ location, url, isOnline, className }: LocationLinkProps) {
  if (isOnline || !url) {
    return <span className={className}>{isOnline ? "온라인(Zoom)" : location}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx("inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2 hover:text-brand", className)}
    >
      {location}
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="currentColor">
        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
      </svg>
      <span className="sr-only">(새 창에서 네이버 지도 열기)</span>
    </a>
  );
}
