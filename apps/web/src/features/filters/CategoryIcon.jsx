// The icon on each category tile in the Filter tab (k: the category key).
import React from "react";

export default function CategoryIcon({ k, active }) {
  const stroke = active ? "var(--tile-accent, #5aa8ff)" : "rgba(255,255,255,.45)";
  const fill = active ? "var(--tile-accent, #5aa8ff)" : "rgba(255,255,255,.35)";
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", "aria-hidden": true };
  switch (k) {
    case "restaurants":
      return (
        <svg
          {...common}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 4v5M9 4v5M8 4v14" />
          <path d="M16 4c0 2-2 3-2 5v9" />
        </svg>
      );
    case "daycare":
      return (
        <svg
          {...common}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="9" cy="9" r="3" />
          <path d="M9 12v5m-3 0h6" />
          <circle cx="16" cy="16" r="2" />
          <path d="M18 18l3 3" />
        </svg>
      );
    case "hospitals":
      return (
        <svg
          {...common}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M12 7v10M8 12h8" />
        </svg>
      );
    case "schools":
      return (
        <svg
          {...common}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 10l9-5 9 5-9 5-9-5z" />
          <path d="M7 12v4l5 3 5-3v-4" />
        </svg>
      );
    case "concessions":
      return (
        <svg
          {...common}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 9h8l-1.2 8H9.2z" />
          <path d="M10 10v7M12 10v7M14 10v7" />
          <circle cx="10" cy="8.4" r="1" fill={active ? fill : "transparent"} />
          <circle cx="12.6" cy="7.9" r="1" fill={active ? fill : "transparent"} />
          <circle cx="15" cy="8.6" r="1" fill={active ? fill : "transparent"} />
        </svg>
      );
    case "retail":
      return (
        <svg
          {...common}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9h12l-1 9H7L6 9z" />
          <path d="M8 9a4 4 0 0 1 8 0" />
          <path d="M6 9l-2 0 1.4 9H7" />
        </svg>
      );
    case "caterers_commissary":
      return (
        <svg
          {...common}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 14h18" />
          <path d="M5 14a7 7 0 0 1 14 0" />
          <path d="M12 7v-2" />
        </svg>
      );
    default:
      return (
        <svg
          {...common}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 4.4 1.5c-.7.7-1.9 1.1-1.9 2.5" />
          <circle cx="12" cy="17" r="1" fill={active ? fill : "transparent"} />
        </svg>
      );
  }
}
