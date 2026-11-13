export const devices = {
  desktop: {
    viewport: { width: 1440, height: 900 }, dpr: 1, trueDpr: 1, isMobile: false, hasTouch: false, userAgent: undefined,
  },
  tablet: {
    viewport: { width: 820, height: 1180 }, dpr: 2, trueDpr: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  mobile: {
    viewport: { width: 390, height: 844 }, dpr: 2, trueDpr: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
};

export function deviceOptions(key, hiDpi = false) {
  const d = devices[key];
  if (!d) throw new Error(`unknown device: ${key}`);
  const o = {
    viewport: d.viewport, deviceScaleFactor: hiDpi ? d.trueDpr : d.dpr,
    isMobile: d.isMobile, hasTouch: d.hasTouch,
  };
  if (d.userAgent) o.userAgent = d.userAgent;
  return o;
}
