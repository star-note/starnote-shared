// Non-TS imports the cover renderer uses (resolved by the apps' Vite builds).
declare module '*.svg?raw' {
  const source: string;
  export default source;
}
declare module '*.css';
declare module '*.css?inline' {
  const css: string;
  export default css;
}
