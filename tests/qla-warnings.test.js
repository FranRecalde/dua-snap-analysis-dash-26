import { describe, it, expect } from 'vitest';
import { groupQlaWarnings } from '../src/qlaWarnings.js';

describe('QLA diagnostics warning presentation', () => {
  it('groups warnings by paper and puts maximum corrections first', () => {
    const warnings = [
      '[Reading F] Row 4: Student "Invented, Alex" has a blank class.',
      '[Writing H] Row 8: Mark is invalid.',
      '[Reading F] Corrected question maximum for "Q1" from 5 to 7 using sheet TOTAL MARKS.'
    ];
    const groups = groupQlaWarnings(warnings);
    expect(groups.map(group => group.sheetName)).toEqual(['Reading F', 'Writing H']);
    expect(groups[0].messages[0]).toContain('Corrected question maximum');
    expect(groups[0].messages).toHaveLength(2);
  });

  it('uses initials and class instead of full names in privacy mode', () => {
    const papers = [{ sheetName: 'Reading F', students: [
      { name: 'Invented, Alex', firstName: 'Alex', surname: 'Invented', className: '10 Sp1' }
    ] }];
    const [group] = groupQlaWarnings(
      ['[Reading F] Row 4: Student "Invented, Alex" has a blank mark.'], papers, true
    );
    expect(group.messages[0]).toContain('A.I., 10 Sp1');
    expect(group.messages[0]).not.toContain('Invented, Alex');
  });
});
