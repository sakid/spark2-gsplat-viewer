// NEW PROXY ANIMATION
export const DEFAULT_BOOT_SPLAT_URL = '/assets/splats/Sean_Sheep.spz';
export const FALLBACK_SPLAT_URL = '/assets/splats/environment-lod.spz';
export const DEFAULT_BOOT_PROXY_URL = '/assets/proxies/sean_proxy_animated.glb';

export async function fetchAssetAsFile(url, fallbackName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset fetch failed: ${response.status}`);
  const blob = await response.blob();
  const rawName = url.split('/').pop() || fallbackName || 'asset.bin';
  return new File([blob], rawName, { type: blob.type || 'application/octet-stream' });
}
