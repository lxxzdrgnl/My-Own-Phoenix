import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

/** Wait for Firebase auth to initialize (resolves with user or null). */
let _authReady: Promise<void> | null = null;
function waitForAuth(): Promise<void> {
  if (!_authReady) {
    _authReady = new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, () => { unsub(); resolve(); });
    });
  }
  return _authReady;
}

/**
 * Authenticated fetch — automatically includes Firebase ID token.
 * Waits for auth to initialize on first call (handles page refresh).
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await waitForAuth();
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
