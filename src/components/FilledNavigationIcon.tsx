import type { LucideIcon } from "lucide-react";
import type { Page } from "../../shared/types";

const paths = {
  home: "M10.73 2.74a2 2 0 0 1 2.54 0l7 5.75A2 2 0 0 1 21 10.04V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.96a2 2 0 0 1 .73-1.55ZM10 13a1 1 0 0 0-1 1v7h6v-7a1 1 0 0 0-1-1Z",
  timeline:
    "M6 4h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9Z",
  treasure:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.5 5.5-2.7 6.3-6.3 2.7 2.7-6.3Z",
  team: "M5 3c2-1.2 4-1.2 7 0s6 1.4 8 .2v11.6c-2 1.2-5 1-8-.2s-5-1.2-7 0Z",
  photos:
    "M8 2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm4 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8 15v1h12v-4l-3-3-3 4-3-3Z",
};

/** Filled counterparts retain the silhouettes of the existing navigation icons. */
export default function FilledNavigationIcon({
  page,
  fallback: Fallback,
  className,
}: {
  page: Page;
  fallback: LucideIcon;
  className?: string;
}) {
  if (!(page in paths))
    return <Fallback className={className} size={22} aria-hidden="true" />;
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="1 1 22 22"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[page as keyof typeof paths]} fillRule="evenodd" />
      {page === "timeline" && (
        <>
          <path
            d="M8 2v4M16 2v4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M7 12h2v2H7Zm4 0h2v2h-2Zm4 0h2v2h-2ZM7 16h2v2H7Zm4 0h2v2h-2Z" />
        </>
      )}
      {page === "team" && (
        <path
          d="M4 2v20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {page === "photos" && <path d="M2 6h2v14h14v2H4a2 2 0 0 1-2-2Z" />}
    </svg>
  );
}
