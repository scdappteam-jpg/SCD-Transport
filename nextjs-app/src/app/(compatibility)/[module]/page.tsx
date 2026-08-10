import { notFound, redirect } from "next/navigation";
import {
  compatibilityRedirects,
  isCompatibilityRedirectRoute,
  isLegacyViewRoute,
  legacyViewRoutes
} from "@/server/legacy-route-manifest";

type PageProps = {
  params: Promise<{ module: string }>;
};

export default async function CompatibilityPage({ params }: PageProps) {
  const { module } = await params;

  if (isCompatibilityRedirectRoute(module)) {
    redirect(compatibilityRedirects[module]);
  }

  if (isLegacyViewRoute(module)) {
    redirect(`/legacy/index.html?view=${encodeURIComponent(legacyViewRoutes[module])}`);
  }

  notFound();
}
