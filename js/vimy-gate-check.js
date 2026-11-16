// ¿Es un teléfono o tableta? (Vimy solo se ofrece en móviles). La misma comprobación la repite vimy-gate.js.
export function isMobile() {
  const ua = navigator.userAgent || '';
  const uaMobile = navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);  // iPad con iPadOS
  return uaMobile && matchMedia('(pointer: coarse)').matches;
}
