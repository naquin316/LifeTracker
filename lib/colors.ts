// Stable per-member accent color derived from the name, so a person looks the
// same across the map, sidebar, and replay.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** A distinct, readable HSL color for a member name. */
export function memberColor(name: string): string {
  const hue = hashString(name) % 360;
  // Spread saturation/lightness a little by name too, but keep it vivid+legible.
  const sat = 65 + (hashString(name + "s") % 20); // 65–84%
  const light = 52 + (hashString(name + "l") % 10); // 52–61%
  return `hsl(${hue} ${sat}% ${light}%)`;
}
