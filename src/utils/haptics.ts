// Mobile Haptic Feedback integration using Vibration API

export function triggerHaptic(pattern: number | number[] = 25) {
  if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Vibration not permitted or supported
    }
  }
}

export function hapticLight() {
  triggerHaptic(18);
}

export function hapticMedium() {
  triggerHaptic(35);
}

export function hapticHeavy() {
  triggerHaptic(60);
}

export function hapticWarning() {
  triggerHaptic([40, 60, 40, 60, 80]);
}

export function hapticSuccess() {
  triggerHaptic([30, 40, 50]);
}
