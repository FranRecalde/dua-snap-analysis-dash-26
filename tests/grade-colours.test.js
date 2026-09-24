import { describe, expect, it } from 'vitest';
import { GRADE_COLORS } from '../src/stats.js';

function luminance(hex) {
  const [red, green, blue] = hex.slice(1).match(/../g)
    .map(part => parseInt(part, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first, second) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('shared grade colours', () => {
  it('uses the requested grade bands', () => {
    expect(GRADE_COLORS.U).toBe(GRADE_COLORS['1']);
    expect(GRADE_COLORS['1']).toBe(GRADE_COLORS['2']);
    expect(GRADE_COLORS['6']).toBe(GRADE_COLORS['7']);
    expect(GRADE_COLORS['8']).toBe(GRADE_COLORS['9']);
    expect(new Set(Object.values(GRADE_COLORS)).size).toBe(6);
  });

  it('keeps every grade label at WCAG AA text contrast', () => {
    for (const [grade, background] of Object.entries(GRADE_COLORS)) {
      const foreground = grade === '4' || grade === '5' ? '#1c2421' : '#ffffff';
      expect(contrast(foreground, background), `grade ${grade}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
