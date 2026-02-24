// NEW PROXY ANIMATION
export function selectLodSplatCount(userAgent = '') {
  const mobilePattern = /Android|iPhone|iPad|iPod|Mobile|Mobi/i;
  return mobilePattern.test(userAgent) ? 500000 : 1500000;
}
