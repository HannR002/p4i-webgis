import type { BrowserAuthProvider } from './contracts';
import { createSupabaseBrowserAuthProvider } from './providers/supabaseAuthProvider';

let provider: BrowserAuthProvider | undefined;

export function getBrowserAuthProvider(): BrowserAuthProvider {
  provider ??= createSupabaseBrowserAuthProvider();
  return provider;
}
