// Required for React 18 act() support in jsdom test environments.
// Without this, React logs "The current testing environment is not configured to support act(...)"
// whenever act() is called in tests that use createRoot / react-dom/client directly.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
