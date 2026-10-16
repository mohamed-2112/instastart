import type { CSSProperties } from 'react';
const paths: Record<string, string> = {
  bolt: 'M13 2 4 14h7l-1 8 10-12h-7l1-8Z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  play: 'm8 5 11 7-11 7V5Z',
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11H3V7Z',
  terminal: 'm5 7 5 5-5 5M12 17h7',
  globe: 'M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  code: 'm8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
  file: 'M14 2H5v20h14V7l-5-5ZM14 2v5h5M8 12h8M8 16h6',
  history: 'M3 12a9 9 0 1 0 3-6L3 9M3 3v6h6M12 7v5l3 2',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  x: 'm6 6 12 12M18 6 6 18',
  down: 'm6 9 6 6 6-6',
  up: 'm6 15 6-6 6 6',
  edit: 'm15 3 6 6-12 12H3v-6L15 3ZM12 6l6 6',
  copy: 'M8 8h13v13H8zM16 8V3H3v13h5',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  shortcut: 'M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7',
  monitor: 'M2 3h20v14H2zM8 21h8M12 17v4',
  stop: 'M6 6h12v12H6z',
  alert: 'm12 3 10 18H2L12 3ZM12 9v5M12 17v1',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
};
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}
