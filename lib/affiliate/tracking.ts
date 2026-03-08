import { cookies } from "next/headers";

const AFFILIATE_COOKIE_KEY = "affiliate_code";
const VISITOR_COOKIE_KEY = "visitor_token";

export async function getAffiliateTracking() {
  const cookieStore = await cookies();

  return {
    affiliateCode: cookieStore.get(AFFILIATE_COOKIE_KEY)?.value ?? null,
    visitorToken: cookieStore.get(VISITOR_COOKIE_KEY)?.value ?? null,
  };
}
