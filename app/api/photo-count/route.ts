import { auth } from "@/auth";
import { getPhotoCount } from "@/lib/kv";

export const runtime = "nodejs";

type PhotoCountResponse =
  | { success: true; count: number }
  | { success: false; error: string };

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json(
      { success: false, error: "Sign in required" } satisfies PhotoCountResponse,
      { status: 401 },
    );
  }

  try {
    const count = await getPhotoCount(session.user.email);
    return Response.json({ success: true, count } satisfies PhotoCountResponse);
  } catch (error) {
    console.error("photo-count error:", error);
    return Response.json(
      { success: false, error: "Failed to read count" } satisfies PhotoCountResponse,
      { status: 500 },
    );
  }
}
