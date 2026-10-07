/** The 16 icon names of the design system (`docs/design/design-system/assets/Icons/README.md`), in its order. */
export const ICON_NAMES = [
  "wheel",
  "bell",
  "compass",
  "anchor",
  "sail",
  "aground",
  "send-back",
  "lock",
  "check",
  "close",
  "reset",
  "tool",
  "message",
  "info",
  "refresh",
  "offline",
] as const;

/** One of the design system's icons. */
export type IconName = (typeof ICON_NAMES)[number];

/** One SVG element of an icon, drawn on the 24px grid. */
export type IconShape =
  | { readonly kind: "path"; readonly d: string }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx: number;
    };

const path = (d: string): IconShape => ({ kind: "path", d });
const circle = (cx: number, cy: number, r: number): IconShape => ({ kind: "circle", cx, cy, r });

/** The shapes of each icon, copied from the design system's SVG files. The `Record` makes the map exhaustive. */
export const ICONS: Readonly<Record<IconName, readonly IconShape[]>> = {
  wheel: [
    circle(12, 12, 6),
    circle(12, 12, 1.8),
    path("M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"),
  ],
  bell: [path("M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"), path("M10 20a2 2 0 0 0 4 0")],
  compass: [circle(12, 12, 9), path("M15.5 8.5l-2 5-5 2 2-5z")],
  anchor: [circle(12, 5, 2), path("M12 7v14M8 10h8M4 13a8 8 0 0 0 16 0")],
  sail: [path("M12 3v14M12 4l7 12h-7M11 7l-6 9h6M3 19h18l-2 2H5z")],
  aground: [path("M2 18c2 0 3-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2"), path("M6 14l3-8 4 5 2-3 3 6")],
  "send-back": [path("M9 14L4 9l5-5"), path("M4 9h10a6 6 0 0 1 0 12h-3")],
  lock: [{ kind: "rect", x: 5, y: 11, width: 14, height: 9, rx: 2 }, path("M8 11V8a4 4 0 0 1 8 0v3")],
  check: [path("M5 12l4 4 10-10")],
  close: [path("M6 6l12 12M18 6L6 18")],
  reset: [path("M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5")],
  tool: [path("M4 17l6-6-6-6M12 19h8")],
  message: [path("M4 5h16v11H8l-4 4z")],
  info: [circle(12, 12, 9), path("M12 8v5M12 16h.01")],
  refresh: [path("M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5")],
  offline: [
    path("M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"),
    path("M12 19h.01"),
    path("M3 3l18 18"),
  ],
};

/** Whether a value names one of the design system's icons. */
export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && (ICON_NAMES as readonly string[]).includes(value);
}
