/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_BASE_URL?: string;
  readonly VITE_AI_API_KEY?: string;
  readonly VITE_AI_MODEL?: string;
  readonly VITE_AI_APP_NAME?: string;
  readonly VITE_AI_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
