import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "TikTok LIVE Like Assistant",
  short_name: "LIVE Like",
  description:
    "Une aide locale et manuelle pour interagir avec les TikTok LIVE depuis Chrome.",
  version: "0.1.0",
  minimum_chrome_version: "114",
  action: {
    default_popup: "popup.html",
    default_title: "TikTok LIVE Like Assistant",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  permissions: ["storage"],
  host_permissions: ["https://www.tiktok.com/*"],
  content_scripts: [
    {
      matches: ["https://www.tiktok.com/*"],
      js: ["src/content/content-script.tsx"],
      run_at: "document_idle",
    },
  ],
};

export default manifest;
