import { noticeLinks } from "../lib/notice-links";

export default function NoticeBody({ body }: { body: string }) {
  return (
    <p>
      {noticeLinks(body).map((part, index) =>
        part.href ? (
          <a
            key={index}
            className="notice-link"
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            title="새 창에서 열기"
          >
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}
