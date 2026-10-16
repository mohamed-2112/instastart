declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
interface Window {
  instastart: import('./shared/types').DesktopApi;
}
