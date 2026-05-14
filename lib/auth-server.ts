import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { apiError, ErrorCode } from "@/lib/api-error";

// Initialize Firebase Admin (once)
if (admin.apps.length === 0) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else if (projectId) {
    admin.initializeApp({ projectId });
  }
}

/**
 * Verify Firebase ID token from Authorization header.
 * Returns user UID if valid, or null.
 */
export async function verifyAuth(req: NextRequest): Promise<string | null> {
  // Allow internal service calls (eval-worker, etc.) via shared secret
  const internalToken = req.headers.get("X-Internal-Token");
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (internalToken && expected && internalToken.length === expected.length) {
    try {
      const { timingSafeEqual } = await import("crypto");
      if (timingSafeEqual(Buffer.from(internalToken), Buffer.from(expected))) {
        return "internal-service";
      }
    } catch {
      // Length mismatch or encoding error — fall through
    }
  }

  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;

  try {
    const decoded = await admin.auth().verifyIdToken(header.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * Require auth — returns UID or standardized 401 error response.
 *
 * Usage:
 * ```
 * const auth = await requireAuth(req);
 * if (auth instanceof NextResponse) return auth;
 * // auth is UID string
 * ```
 */
export async function requireAuth(req: NextRequest): Promise<string | NextResponse> {
  const uid = await verifyAuth(req);
  if (!uid) return apiError(req, ErrorCode.UNAUTHORIZED, "Authentication required");
  return uid;
}
