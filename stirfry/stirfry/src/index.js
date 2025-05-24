/**
 * Placeholder entry point for Stirfry.
 *
 * The final implementation will boot a small Debian-based VM compiled to
 * WebAssembly. For now, this simply logs a message so that the skeleton
 * can be loaded without errors.
 */

export function start() {
  console.log('[Stirfry] VM startup stub invoked.');
}

// Auto-start if running in a browser environment
if (typeof window !== 'undefined') {
  start();
}
