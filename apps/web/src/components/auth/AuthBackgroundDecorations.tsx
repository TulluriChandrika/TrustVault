import * as React from "react";

export const AuthBackgroundDecorations: React.FC = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none select-none z-0">
      {/* Base Light Background */}
      <div className="absolute inset-0 bg-[#FBFBFE]" />

      {/* Full-Viewport Scalable SVG Vector Layers */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1440 900"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* ==================================================================== */}
        {/* 1. UPPER-LEFT DEFINED LAVENDER SHAPE & OUTLINE CURVES                */}
        {/* ==================================================================== */}
        {/* Base Lavender Shape entering from top-left */}
        <path
          d="M -60 -60 L 360 -60 C 350 120, 290 220, 190 270 C 90 320, 10 340, -60 360 Z"
          fill="#D5D7FC"
          fillOpacity="0.78"
        />

        {/* Soft Lavender Accent Overlay for depth */}
        <path
          d="M -60 -60 L 250 -60 C 240 80, 190 170, 120 210 C 50 250, 0 270, -60 290 Z"
          fill="#E5E5FF"
          fillOpacity="0.5"
        />

        {/* Thin Purple Curved Outline tracing the upper-left boundary */}
        <path
          d="M -40 380 C 50 350, 150 300, 240 210 C 320 130, 360 40, 340 -60"
          stroke="#827AF5"
          strokeWidth="1.75"
          strokeOpacity="0.75"
          strokeLinecap="round"
        />

        {/* Secondary subtle parallel sweeping arc */}
        <path
          d="M -60 290 C 30 260, 120 210, 180 140 C 230 80, 260 0, 250 -60"
          stroke="#827AF5"
          strokeWidth="1.2"
          strokeOpacity="0.32"
          strokeLinecap="round"
        />

        {/* ==================================================================== */}
        {/* 2. LOWER-LEFT DEFINED LAVENDER CONTOUR                               */}
        {/* ==================================================================== */}
        <path
           d="M -60 810 L -60 500 C 80 510, 200 590, 250 680 C 290 750, 300 790, 320 810 Z"
          fill="#EBECFD"
          fillOpacity="0.8"
        />

        {/* ==================================================================== */}
        {/* 3. LOWER-RIGHT LAYERED SHAPES & SWEEPING OUTLINE STROKES             */}
        {/* ==================================================================== */}
        {/* Large outer circular shape entering from bottom-right */}
        <circle
          cx="1340"
          cy="820"
          r="380"
          fill="#DBDDFD"
          fillOpacity="0.68"
        />

        {/* Overlapping inner circular shape */}
        <circle
          cx="1160"
          cy="860"
          r="260"
          fill="#EBECFD"
          fillOpacity="0.85"
        />

        {/* Soft innermost lavender accent */}
        <circle
          cx="1260"
          cy="840"
          r="160"
          fill="#E5E5FF"
          fillOpacity="0.6"
        />

        {/* Sweeping Purple Outline Curve across lower-right background */}
        <path
          d="M 1480 380 C 1340 510, 1190 650, 1120 800 C 1070 900, 1060 930, 1050 960"
          stroke="#827AF5"
          strokeWidth="1.75"
          strokeOpacity="0.72"
          strokeLinecap="round"
        />

        {/* Secondary sweeping curve on the right */}
        <path
          d="M 1480 540 C 1280 590, 1110 710, 1020 930"
          stroke="#827AF5"
          strokeWidth="1.2"
          strokeOpacity="0.35"
          strokeLinecap="round"
        />
      </svg>

      {/* ==================================================================== */}
      {/* 4. PRECISE 6x3 CORNER DOT MATRICES                                    */}
      {/* ==================================================================== */}
      {/* Upper-Left Dot Matrix (6 cols x 3 rows) */}
      <div className="absolute top-8 left-8 sm:top-12 sm:left-12 z-10 pointer-events-none">
        <svg width="136" height="56" viewBox="0 0 136 56" fill="none">
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3, 4, 5].map((col) => (
              <circle
                key={`dot-tl-${row}-${col}`}
                cx={8 + col * 23}
                cy={8 + row * 18}
                r="2.4"
                fill="#827AF5"
                opacity="0.8"
              />
            ))
          )}
        </svg>
      </div>

      {/* Lower-Right Dot Matrix (6 cols x 3 rows) */}
      <div className="absolute bottom-8 right-8 sm:bottom-12 sm:right-12 z-10 pointer-events-none">
        <svg width="136" height="56" viewBox="0 0 136 56" fill="none">
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3, 4, 5].map((col) => (
              <circle
                key={`dot-br-${row}-${col}`}
                cx={8 + col * 23}
                cy={8 + row * 18}
                r="2.4"
                fill="#827AF5"
                opacity="0.8"
              />
            ))
          )}
        </svg>
      </div>
    </div>
  );
};
