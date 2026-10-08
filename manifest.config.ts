import type { ManifestV3Export } from "@crxjs/vite-plugin";
import { version } from "./package.json";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "TikTok LIVE Like Assistant",
  short_name: "LIVE Like",
  description:
    "Likes manuels ou automatiques sur TikTok LIVE, cadence réglable et compteur de session local.",
  version,
  minimum_chrome_version: "114",
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_popup: "popup.html",
    default_title: "TikTok LIVE Like Assistant",
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  permissions: ["storage", "contextMenus", "debugger"],
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
