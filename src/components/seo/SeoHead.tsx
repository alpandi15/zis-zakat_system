import Head from "next/head";
import { useRouter } from "next/router";

interface SeoHeadProps {
  title: string;
  description: string;
  noIndex?: boolean;
  image?: string;
}

const APP_NAME = "AmanahZIS";
const DEFAULT_IMAGE = "/placeholder.svg";
const DEFAULT_KEYWORDS =
  "zakat, zakat fitrah, zakat mal, fidyah, mustahik, muzakki, manajemen zakat, aplikasi masjid";

export function SeoHead({ title, description, noIndex = false, image = DEFAULT_IMAGE }: SeoHeadProps) {
  const router = useRouter();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const cleanPath = router.asPath.split("?")[0].split("#")[0] || "/";
  const canonicalUrl = `${siteUrl}${cleanPath === "/" ? "" : cleanPath}`;
  const imageUrl = image.startsWith("http") ? image : `${siteUrl}${image}`;
  const fullTitle = `${title} | ${APP_NAME}`;

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={DEFAULT_KEYWORDS} />
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      <meta name="theme-color" content="#1b9e77" />
      <meta name="robots" content={noIndex ? "noindex,nofollow" : "index,follow"} />
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={APP_NAME} />
      <meta property="og:locale" content="id_ID" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={imageUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Head>
  );
}
