import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const CACHE_TTL_MS = 10 * 60 * 1000;
const MOBILE_RELEASE_API =
  process.env.MOBILE_RELEASE_API ||
  "https://api.github.com/repos/mahammadanish321/lectureLog_mobile/releases/latest";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mobilePackagePath = path.resolve(__dirname, "../../../Merge_mobile/package.json");

function getMobilePackageVersion() {
  try {
    const mobilePackage = JSON.parse(fs.readFileSync(mobilePackagePath, "utf-8"));
    return mobilePackage.version || "1.0.0";
  } catch (error) {
    console.warn("[APP_VERSION] Could not read mobile package.json:", error.message);
    return "1.0.0";
  }
}

let cachedMobileRelease = null;
let cachedAt = 0;

const normalizeVersion = (tagName) => (tagName || "").replace(/^v/i, "") || "1.0.0";

async function getLatestMobileRelease() {
  const now = Date.now();

  if (cachedMobileRelease && now - cachedAt < CACHE_TTL_MS) {
    return cachedMobileRelease;
  }

  const response = await fetch(MOBILE_RELEASE_API, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub release lookup failed with HTTP ${response.status}`);
  }

  const release = await response.json();
  const apkAsset = release.assets?.find((asset) => /\.apk$/i.test(asset.name || ""));

  cachedMobileRelease = {
    version: normalizeVersion(release.tag_name),
    updateUrl: apkAsset?.browser_download_url || release.html_url || null,
  };
  cachedAt = now;

  return cachedMobileRelease;
}

router.get("/", async (_req, res) => {
  const mobilePackageVersion = getMobilePackageVersion();
  let latestRelease = {
    version: mobilePackageVersion,
    updateUrl: process.env.MOBILE_UPDATE_URL || null,
  };

  try {
    latestRelease = await getLatestMobileRelease();
  } catch (error) {
    console.warn("[APP_VERSION] Could not load latest mobile release:", error.message);
  }

  const latestVersion = process.env.MOBILE_LATEST_VERSION || mobilePackageVersion;
  const minRequiredVersion = process.env.MOBILE_MIN_REQUIRED_VERSION || latestVersion;

  res.status(200).json({
    success: true,
    mobile: {
      minRequiredVersion,
      latestVersion,
      updateUrl: process.env.MOBILE_UPDATE_URL || latestRelease.updateUrl,
      message:
        process.env.MOBILE_UPDATE_MESSAGE ||
        "Please update Merge to the latest version. This version can no longer receive automatic updates.",
    },
  });
});

export default router;
