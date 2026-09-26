/**
 * Ambient declarations for the browser half's non-bundled dependencies.
 *
 * `react` and `react-dom` are declared as peer dependencies and stay EXTERNAL in
 * the browser bundle, and `@deepseek-ai/dsh-client-ui-primitives` is provided by
 * the DSH page at runtime — neither ships type declarations into this package, and
 * the real DSH packages are not installed in a standalone checkout. Declaring the
 * small surface the plugin actually uses keeps `tsconfig.client.json` able to
 * typecheck the client half's own logic (the valuable half) without pretending to
 * typecheck the framework's.
 *
 * These are deliberately loose: a wrong guess here cannot mislead the build, since
 * the bundler treats these specifiers as external and resolves them at runtime.
 */
declare module 'react' {
  export type ReactElement = unknown
  export type ReactNode = unknown
  export type KeyboardEvent = { key: string; preventDefault(): void }
  export type MouseEvent = { target: unknown; currentTarget: unknown }
  export function createElement(type: unknown, props?: unknown, ...children: unknown[]): ReactElement
  export function useRef<T>(initial: T): { current: T }
  export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void]
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T
  export function useCallback<T>(callback: T, deps: readonly unknown[]): T
  export const Fragment: unknown
}

declare module 'react-dom' {
  export function createPortal(children: unknown, container: unknown, key?: string | null): unknown
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  export function FishLogo(props: { size?: number; className?: string }): unknown
  export function Tooltip(props: {
    label: string
    side?: 'top' | 'bottom' | 'left' | 'right'
    children?: unknown
  }): unknown
}
