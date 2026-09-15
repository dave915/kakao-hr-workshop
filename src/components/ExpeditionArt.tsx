export function ExpeditionArt() {
  return (
    <svg
      className="expedition-art"
      viewBox="0 0 650 380"
      role="img"
      aria-label="초록 언덕과 보물 상자, 함께 떠나는 탐험 지도"
    >
      <defs>
        <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#d7d59e" />
        </pattern>
      </defs>
      <path d="M0 66Q150 22 269 57T650 46V380H0Z" fill="url(#dots)" />
      <circle cx="520" cy="66" r="35" fill="#f5bb4b" />
      <path
        d="M503 24l-4-13m42 24 10-11m8 47 15 2"
        stroke="#cca247"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M13 222Q140 95 276 163Q399 70 522 155Q613 179 650 225V380H0Z"
        fill="#c3d2a0"
      />
      <path
        d="M0 293Q110 206 265 254Q404 142 566 254L650 260V380H0Z"
        fill="#9fb67c"
      />
      <path d="M0 329Q133 239 319 309Q478 206 650 304V380H0Z" fill="#698a58" />
      <path
        d="M34 322C133 337 211 238 273 259S418 295 408 195 497 169 523 147"
        fill="none"
        stroke="#f6efd4"
        strokeWidth="35"
      />
      <path
        d="M34 322C133 337 211 238 273 259S418 295 408 195 497 169 523 147"
        fill="none"
        stroke="#bcb89c"
        strokeWidth="2"
        strokeDasharray="5 9"
      />
      <g transform="translate(89 125)">
        <path
          d="M26 119V34"
          stroke="#526448"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M26 0C-28 52-2 79 26 66 69 82 76 41 26 0" fill="#577950" />
        <path
          d="M26 55 9 41m17 21 18-18"
          stroke="#7e9961"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <g transform="translate(557 208) scale(.7)">
        <path
          d="M26 119V34"
          stroke="#526448"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M26 0C-28 52-2 79 26 66 69 82 76 41 26 0" fill="#446849" />
      </g>
      <g transform="translate(265 96) rotate(-7)">
        <path
          d="M0 96V0"
          stroke="#73674e"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M2 3 63 14 2 39Z" fill="#f2a154" />
        <path
          d="m15 14 16 5-16 8"
          fill="none"
          stroke="#fff6cd"
          strokeWidth="3"
        />
      </g>
      <g transform="translate(364 187) rotate(8)">
        <ellipse cx="50" cy="87" rx="63" ry="14" fill="#496041" opacity=".19" />
        <path
          d="M-9 32Q-12-3 19-8L88-8Q107-5 107 30L105 73Q52 92-4 73Z"
          fill="#6b4c30"
        />
        <path
          d="M-8 27Q-10-5 17-8L88-8Q109-5 106 29Z"
          fill="#b9823e"
          stroke="#694d30"
          strokeWidth="3"
        />
        <path
          d="M-7 29 50 42 106 29V72L51 88-7 73Z"
          fill="#d4a34b"
          stroke="#694d30"
          strokeWidth="3"
        />
        <path d="M50 42v45" stroke="#9e7339" strokeWidth="3" />
        <path
          d="M17-8Q9 3 14 34V77m68-85q13 15 7 42v43"
          stroke="#f5d571"
          strokeWidth="12"
          fill="none"
        />
        <path
          d="M-7 29 50 42 106 29"
          stroke="#694d30"
          strokeWidth="4"
          fill="none"
        />
        <rect
          x="40"
          y="35"
          width="23"
          height="28"
          rx="5"
          fill="#f4d576"
          stroke="#785735"
          strokeWidth="2"
        />
        <circle cx="51" cy="47" r="4" fill="#795e37" />
        <path d="m51 47-3 9h6Z" fill="#795e37" />
      </g>
      <g fill="#f8e168">
        <path d="m386 136 5 13 13 5-13 5-5 13-5-13-13-5 13-5Z" />
        <path d="m492 200 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" />
        <path d="m456 122 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      </g>
      <g transform="translate(174 300)">
        <path
          d="M0 0v24m-9-10 9 6 8-12"
          fill="none"
          stroke="#dce4b5"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="0" cy="-3" r="5" fill="#f6d371" />
      </g>
      <path
        d="m551 324 7-17m-7 17-5-11m-491-40 7-17m-7 17-5-11"
        stroke="#31553c"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <g transform="translate(479 81) rotate(10)">
        <rect
          width="103"
          height="35"
          rx="5"
          fill="#faf5df"
          stroke="#57714b"
          strokeWidth="1.5"
        />
        <text
          x="51"
          y="23"
          textAnchor="middle"
          fontFamily="Jua"
          fontSize="17"
          fill="#3e5b3d"
        >
          모험 시작!
        </text>
      </g>
      <g transform="translate(192 51) rotate(-10)">
        <path
          d="M0 0q10-15 20 0M30 0q10-15 20 0"
          fill="none"
          stroke="#6c7850"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
export function TreasureIllustration({ bomb = false }: { bomb?: boolean }) {
  return (
    <div
      className={`discovery-object ${bomb ? "bomb-object" : ""}`}
      aria-hidden="true"
    >
      {bomb ? "💣" : "🎁"}
    </div>
  );
}

/** The same chest as the expedition map, sized for a projected AR marker. */
export function TreasureChestArt() {
  return (
    <svg viewBox="-24 -30 148 145" aria-hidden="true">
      <ellipse cx="50" cy="91" rx="62" ry="12" fill="#243b2b" opacity=".2" />
      <path
        d="M-9 32Q-12-3 19-8L88-8Q107-5 107 30L105 73Q52 92-4 73Z"
        fill="#6b4c30"
      />
      <path
        d="M-8 27Q-10-5 17-8L88-8Q109-5 106 29Z"
        fill="#b9823e"
        stroke="#694d30"
        strokeWidth="3"
      />
      <path
        d="M-7 29 50 42 106 29V72L51 88-7 73Z"
        fill="#d4a34b"
        stroke="#694d30"
        strokeWidth="3"
      />
      <path d="M50 42v45" stroke="#9e7339" strokeWidth="3" />
      <path
        d="M17-8Q9 3 14 34V77m68-85q13 15 7 42v43"
        stroke="#f5d571"
        strokeWidth="12"
        fill="none"
      />
      <path
        d="M-7 29 50 42 106 29"
        stroke="#694d30"
        strokeWidth="4"
        fill="none"
      />
      <rect
        x="40"
        y="35"
        width="23"
        height="28"
        rx="5"
        fill="#f4d576"
        stroke="#785735"
        strokeWidth="2"
      />
      <circle cx="51" cy="47" r="4" fill="#795e37" />
      <path d="m51 47-3 9h6Z" fill="#795e37" />
      <path
        d="m6-27 3 8 8 3-8 3-3 8-3-8-8-3 8-3Zm106 8 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"
        fill="#f8e168"
      />
    </svg>
  );
}
