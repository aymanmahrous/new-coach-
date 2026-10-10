export {};

declare global {
  interface Window {
    CC_SUPABASE_URL: string;
    CC_SUPABASE_KEY: string;
  }
}
