import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://saas-builder-cyan.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/projects/", "/auth/callback"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
