import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type CheckoutResponse =
  | { success: true; url: string }
  | { success: false; error: string };

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!origin) {
    return Response.json(
      { success: false, error: "Missing origin header" } satisfies CheckoutResponse,
      { status: 400 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Croissant Classification" },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
    });

    if (!session.url) {
      return Response.json(
        { success: false, error: "Stripe did not return a session URL" } satisfies CheckoutResponse,
        { status: 502 },
      );
    }

    return Response.json({ success: true, url: session.url } satisfies CheckoutResponse);
  } catch (error) {
    console.error("checkout error:", error);
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return Response.json(
        { success: false, error: "STRIPE_SECRET_KEY missing or invalid" } satisfies CheckoutResponse,
        { status: 500 },
      );
    }
    if (error instanceof Stripe.errors.StripeError) {
      return Response.json(
        { success: false, error: `Stripe error: ${error.message}` } satisfies CheckoutResponse,
        { status: 502 },
      );
    }
    return Response.json(
      { success: false, error: "Unexpected server error" } satisfies CheckoutResponse,
      { status: 500 },
    );
  }
}
