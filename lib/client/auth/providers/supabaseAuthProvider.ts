import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BrowserAuthProvider } from '../contracts';

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase auth environment is not configured');
  client = createClient(url, anonKey);
  return client;
}

export function createSupabaseBrowserAuthProvider(): BrowserAuthProvider {
  return {
    async signInWithPassword(email, password) {
      const { data, error } = await getClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('Provider did not create an authenticated session');
      return { accessToken: data.session.access_token };
    },

    async hasSession() {
      const { data, error } = await getClient().auth.getSession();
      if (error) return false;
      return Boolean(data.session);
    },

    onSessionChange(callback) {
      const { data } = getClient().auth.onAuthStateChange((_event, session) => {
        callback(Boolean(session));
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
