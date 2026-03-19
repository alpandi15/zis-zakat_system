export interface ClientDeviceInfo {
  deviceType: "mobile" | "tablet" | "desktop" | "tv" | "unknown";
  deviceLabel: string;
  browser: string;
  os: string;
  viewport: string;
  userAgent: string;
}

const getBrowserName = (userAgent: string): string => {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) return "Opera";
  if (/samsungbrowser/i.test(userAgent)) return "Samsung Internet";
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent) && !/opr\//i.test(userAgent)) return "Chrome";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return "Safari";
  return "Browser Tidak Dikenal";
};

const getOsName = (userAgent: string): string => {
  if (/windows nt/i.test(userAgent)) return "Windows";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/mac os x/i.test(userAgent)) return "macOS";
  if (/cros/i.test(userAgent)) return "ChromeOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "OS Tidak Dikenal";
};

const getDeviceType = (userAgent: string): ClientDeviceInfo["deviceType"] => {
  if (/smart-tv|smarttv|googletv|appletv|hbbtv|netcast|viera|bravia|tizen|webos|roku|tv/i.test(userAgent)) {
    return "tv";
  }

  if (/ipad|tablet/i.test(userAgent) || (/android/i.test(userAgent) && !/mobile/i.test(userAgent))) {
    return "tablet";
  }

  if (/mobile|iphone|ipod|android/i.test(userAgent)) {
    return "mobile";
  }

  if (userAgent) {
    return "desktop";
  }

  return "unknown";
};

export const getDeviceTypeLabel = (deviceType: ClientDeviceInfo["deviceType"]): string => {
  switch (deviceType) {
    case "mobile":
      return "Mobile";
    case "tablet":
      return "Tablet";
    case "tv":
      return "TV";
    case "desktop":
      return "Desktop";
    default:
      return "Perangkat";
  }
};

export const getClientDeviceInfo = (): ClientDeviceInfo => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      deviceType: "unknown",
      deviceLabel: "Perangkat",
      browser: "Browser Tidak Dikenal",
      os: "OS Tidak Dikenal",
      viewport: "-",
      userAgent: "",
    };
  }

  const userAgent = navigator.userAgent || "";
  const browser = getBrowserName(userAgent);
  const os = getOsName(userAgent);
  const deviceType = getDeviceType(userAgent);
  const viewport = `${window.innerWidth}x${window.innerHeight}`;

  return {
    deviceType,
    deviceLabel: `${getDeviceTypeLabel(deviceType)} • ${browser}`,
    browser,
    os,
    viewport,
    userAgent,
  };
};
