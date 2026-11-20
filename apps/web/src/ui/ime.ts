type KeyLike = Pick<KeyboardEvent, 'key' | 'keyCode' | 'isComposing' | 'timeStamp'>;

// Safari fires the Enter that commits a composition after compositionend, with isComposing already false.
const afterCompositionMs = 100;
let lastCompositionEnd = Number.NEGATIVE_INFINITY;

if (typeof document !== 'undefined') {
  document.addEventListener('compositionend', (e) => { lastCompositionEnd = e.timeStamp; }, true);
}

export function isImeEnter(e: KeyLike | { nativeEvent: KeyLike }): boolean {
  const k = 'nativeEvent' in e ? e.nativeEvent : e;
  if (k.key !== 'Enter' || k.isComposing || k.keyCode === 229) return false;
  return k.timeStamp - lastCompositionEnd > afterCompositionMs;
}
