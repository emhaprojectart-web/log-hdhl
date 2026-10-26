import React from 'react';

interface RshlLogoProps {
  className?: string;
  idPrefix?: string;
}

export const RshlLogo: React.FC<RshlLogoProps> = ({
  className = 'w-[186px] h-auto',
  idPrefix = 'rshl'
}) => {
  const blueClipId = `${idPrefix}-blue-half`;
  const greenClipId = `${idPrefix}-green-half`;

  return (
    <svg
      viewBox="0 0 250 84"
      className={`${className} overflow-visible select-none`}
      role="img"
      aria-label="RSHL Rumah Sakit Happy Land"
    >
      <defs>
        <clipPath id={blueClipId}>
          <path d="M -45 -45 L 45 -45 L 45 -18 C 18 -14, 4 -4, -14 18 L -45 45 Z" />
        </clipPath>
        <clipPath id={greenClipId}>
          <path d="M 45 45 L -45 45 L -45 24 C -10 4, 8 -6, 45 -12 Z" />
        </clipPath>
      </defs>

      <text
        x="16"
        y="56"
        fill="#19588f"
        fontFamily="'Plus Jakarta Sans', 'Outfit', sans-serif"
        fontWeight="800"
        fontSize="47"
        letterSpacing="-0.8"
      >
        RSHL
      </text>

      <g transform="translate(178, 30) skewX(-12)">
        <g clipPath={`url(#${blueClipId})`} fill="#19588f">
          <rect x="-8.5" y="-25" width="17" height="50" rx="5" />
          <rect x="-25" y="-8.5" width="50" height="17" rx="5" />
        </g>
        <g clipPath={`url(#${greenClipId})`} fill="#70b639">
          <rect x="-8.5" y="-25" width="17" height="50" rx="5" />
          <rect x="-25" y="-8.5" width="50" height="17" rx="5" />
        </g>
      </g>

      <text
        x="17"
        y="74"
        fill="#1b5b91"
        fontFamily="'Plus Jakarta Sans', 'DM Sans', sans-serif"
        fontWeight="500"
        fontSize="14.2"
        letterSpacing="-0.1"
      >
        Rumah Sakit Happy Land
      </text>
    </svg>
  );
};
