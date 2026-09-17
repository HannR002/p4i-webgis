export interface BrowserSession {
  accessToken: string;
}

export interface BrowserAuthProvider {
  signInWithPassword(email: string, password: string): Promise<BrowserSession>;
  hasSession(): Promise<boolean>;
  onSessionChange(callback: (authenticated: boolean) => void): () => void;
}
