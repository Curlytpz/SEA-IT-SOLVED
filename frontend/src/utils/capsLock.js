export function readCapsLockState(event) {
  return Boolean(event?.getModifierState?.('CapsLock'));
}
