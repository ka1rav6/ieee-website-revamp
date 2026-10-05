/// <reference types="vite/client" />

/** Build-time configuration injected by Vite. */
interface ImportMetaEnv {
  /**
   * Base URL for API calls. Empty in production, where the API is served
   * from the same origin as the page.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
