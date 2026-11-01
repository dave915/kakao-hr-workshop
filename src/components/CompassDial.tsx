import { useEffect, useState } from "react";
import { Camera, Check, Compass, Navigation2 } from "lucide-react";
import { angleDifference, continuousRotation } from "../../shared/ar";

const tickMarks = Array.from({ length: 24 }, (_, index) => (
  <line
    key={index}
    className={index % 6 === 0 ? "is-major" : ""}
    x1="120"
    y1="18"
    x2="120"
    y2={index % 6 === 0 ? "29" : "24"}
    transform={`rotate(${index * 15} 120 120)`}
  />
));
const cardinals = [
  { label: "북", angle: 0, x: 120, y: 47 },
  { label: "동", angle: 90, x: 193, y: 120 },
  { label: "남", angle: 180, x: 120, y: 193 },
  { label: "서", angle: 270, x: 47, y: 120 },
];

/** The rose follows north; the pointer always follows the existing guidance. */
export default function CompassDial({
  heading,
  bearing,
  relative = true,
  aligned = false,
  arrived = false,
  compact = false,
}: {
  heading?: number | null;
  bearing?: number | null;
  relative?: boolean;
  aligned?: boolean;
  arrived?: boolean;
  compact?: boolean;
}) {
  const hasHeading = heading != null && Number.isFinite(heading);
  const hasBearing = bearing != null && Number.isFinite(bearing);
  const rose = relative && hasHeading ? -heading : 0;
  const pointer = hasBearing
    ? relative
      ? hasHeading
        ? angleDifference(bearing, heading)
        : null
      : bearing
    : null;
  const [rotation, setRotation] = useState({ rose, pointer: pointer ?? 0 });
  useEffect(() => {
    setRotation((previous) => {
      const next = {
        rose: continuousRotation(previous.rose, rose),
        pointer:
          pointer === null
            ? previous.pointer
            : continuousRotation(previous.pointer, pointer),
      };
      return next.rose === previous.rose && next.pointer === previous.pointer
        ? previous
        : next;
    });
  }, [rose, pointer]);

  return (
    <div
      className={`compass-dial ${compact ? "is-compact" : ""} ${aligned || arrived ? "is-aligned" : ""} ${arrived ? "is-arrived" : ""} ${pointer === null && !arrived ? "is-waiting" : ""}`}
      aria-hidden="true"
    >
      <svg className="compass-dial-face" viewBox="0 0 240 240" fill="none">
        <circle className="compass-dial-ring" cx="120" cy="120" r="108" />
        {!arrived && (
          <>
            {relative && pointer !== null && (
              <path
                className="compass-dial-alignment"
                d="M84.43 22.27 A104 104 0 0 1 155.57 22.27"
              />
            )}
            <g
              className="compass-dial-rose"
              style={{ transform: `rotate(${rotation.rose}deg)` }}
            >
              {tickMarks}
              {(!relative || hasHeading) &&
                cardinals.map(({ label, angle, x, y }) => (
                  <g key={angle} transform={`translate(${x} ${y})`}>
                    <text
                      className="compass-dial-cardinal"
                      transform={`rotate(${-rotation.rose})`}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {label}
                    </text>
                  </g>
                ))}
            </g>
            {relative && pointer !== null && (
              <path className="compass-dial-forward" d="M115 3h10l-5 7z" />
            )}
          </>
        )}
      </svg>
      {arrived ? (
        <Camera className="compass-dial-symbol" strokeWidth={1.6} />
      ) : pointer !== null ? (
        <Navigation2
          className="compass-dial-pointer"
          fill="currentColor"
          strokeWidth={1}
          style={{
            transform: `translate(-50%, -50%) rotate(${rotation.pointer}deg)`,
          }}
        />
      ) : (
        <Compass className="compass-dial-symbol" strokeWidth={1.4} />
      )}
      {aligned && !arrived && (
        <span className="compass-dial-check">
          <Check size={16} strokeWidth={2.5} />
        </span>
      )}
    </div>
  );
}
