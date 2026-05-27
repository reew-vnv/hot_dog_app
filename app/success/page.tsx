import Stripe from "stripe";
import Link from "next/link";
import { auth } from "@/auth";
import { setPaid } from "@/lib/kv";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type SearchParams = Promise<{ session_id?: string }>;

export default async function SuccessPage({ searchParams }: { searchParams: SearchParams }) {
  const { session_id } = await searchParams;
  const userSession = await auth();
  const email = userSession?.user?.email;

  let status: "ok" | "pending" | "missing" | "mismatch" | "error" = "ok";
  let label = "";

  if (!session_id) {
    status = "missing";
  } else if (!email) {
    status = "error";
    label = "You must be signed in.";
  } else {
    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);
      if (checkoutSession.payment_status === "paid") {
        await setPaid(email);
      } else {
        status = "pending";
        label = checkoutSession.payment_status;
      }
    } catch (err) {
      console.error("success verify error:", err);
      status = "error";
      label = err instanceof Error ? err.message : "Stripe verification failed";
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-black text-white px-6 text-center">
      {status === "ok" && (
        <>
          <p className="text-5xl font-black tracking-tight text-amber-400">Unlocked ✦</p>
          <p className="mt-3 text-sm text-zinc-400">Unlimited croissant detection is on.</p>
        </>
      )}
      {status === "pending" && (
        <>
          <p className="text-3xl font-bold">Payment pending</p>
          <p className="mt-3 text-sm text-zinc-400">Status: {label}. Try again in a moment.</p>
        </>
      )}
      {status === "missing" && (
        <>
          <p className="text-3xl font-bold">No session</p>
          <p className="mt-3 text-sm text-zinc-400">This page expects a Stripe session_id.</p>
        </>
      )}
      {status === "error" && (
        <>
          <p className="text-3xl font-bold">Verification failed</p>
          <p className="mt-3 text-sm text-zinc-400">{label}</p>
        </>
      )}
      <Link
        href="/"
        className="mt-8 px-6 py-3 rounded-full bg-white text-black font-semibold"
      >
        Back to camera
      </Link>
    </div>
  );
}
