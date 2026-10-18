import type { MetadataRoute } from "next";

const publicRoutes = [
  "/",
  "/predictions",
  "/combinations",
  "/ai-search",
  "/live",
  "/favorites",
  "/lottery",
  "/faq",
  "/contact",
  "/payment",
  "/help",
  "/fotmob",
  "/terms",
  "/privacy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ikprono.onrender.com";

  return publicRoutes.map(route => ({
    url: new URL(route, siteUrl).toString(),
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
