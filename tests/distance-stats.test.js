import { describe, it, expect } from 'vitest';
import {
  calculateDistanceBand,
  calculateStudentGap,
  calculateDistanceMetrics,
  calculateDistanceBreakdownByClass,
  filterDistanceRecords,
  getFarthestFromGrade5,
  getClosestToGrade5ByClass,
  getEstimate5PlusShortfall,
  DISTANCE_BANDS
} from '../src/stats.js';

describe('Distance from Grade 5 Statistics Engine', () => {

  describe('Gap and Band Calculation', () => {
    it('calculates gap = 5 - points for students below 5, U counts as 0', () => {
      // U grade (points = 0) -> gap = 5 - 0 = 5
      expect(calculateStudentGap(0, false)).toBe(5);
      // Grade 1 (points = 1) -> gap = 5 - 1 = 4
      expect(calculateStudentGap(1, false)).toBe(4);
      // Grade 2 (points = 2) -> gap = 5 - 2 = 3
      expect(calculateStudentGap(2, false)).toBe(3);
      // Grade 3 (points = 3) -> gap = 5 - 3 = 2
      expect(calculateStudentGap(3, false)).toBe(2);
      // Grade 4 (points = 4) -> gap = 5 - 4 = 1
      expect(calculateStudentGap(4, false)).toBe(1);
    });

    it('sets gap = 0 for students at 5 or above', () => {
      expect(calculateStudentGap(5, false)).toBe(0);
      expect(calculateStudentGap(6, false)).toBe(0);
      expect(calculateStudentGap(7, false)).toBe(0);
      expect(calculateStudentGap(8, false)).toBe(0);
      expect(calculateStudentGap(9, false)).toBe(0);
    });

    it('returns null gap for Not sat or missing points', () => {
      expect(calculateStudentGap(null, true)).toBeNull();
      expect(calculateStudentGap(null, false)).toBeNull();
      expect(calculateStudentGap(undefined, false)).toBeNull();
    });

    it('assigns correct bands', () => {
      expect(calculateDistanceBand(5)).toBe('at_or_above_5');
      expect(calculateDistanceBand(7)).toBe('at_or_above_5');
      expect(calculateDistanceBand(4)).toBe('one_grade_away');
      expect(calculateDistanceBand(3)).toBe('two_grades_away');
      expect(calculateDistanceBand(2)).toBe('three_or_more_away');
      expect(calculateDistanceBand(1)).toBe('three_or_more_away');
      expect(calculateDistanceBand(0)).toBe('three_or_more_away');
      expect(calculateDistanceBand(null, true)).toBe('not_sat');
    });
  });

  describe('Distance Breakdown By Class and Cohort', () => {
    const mockRecords = [
      // Class 10 Sp1
      { surname: 'Khan', firstName: 'Aisha', className: '10 Sp1', result: '5', points: 5, estimate: 5.5, isNotSat: false, sen: 'No SEN', disadvantaged: 'No', attendance: '95%' }, // At or above 5, gap 0
      { surname: 'Doyle', firstName: 'Ben', className: '10 Sp1', result: '4', points: 4, estimate: 5.0, isNotSat: false, sen: 'SEN Support', disadvantaged: 'Yes', attendance: '90%' }, // One away, gap 1, est 5.0 shortfall 1.0
      { surname: 'Evans', firstName: 'Chloe', className: '10 Sp1', result: '3', points: 3, estimate: 5.2, isNotSat: false, sen: 'No SEN', disadvantaged: 'No', attendance: '92%' }, // Two away, gap 2, est 5.2 shortfall 2.2
      { surname: 'Taylor', firstName: 'Dan', className: '10 Sp1', result: 'U', points: 0, estimate: 4.0, isNotSat: false, sen: 'No SEN', disadvantaged: 'Yes', attendance: '88%' }, // Three+ away, gap 5
      { surname: 'Miller', firstName: 'Ella', className: '10 Sp1', result: 'Not sat', points: null, estimate: 5.0, isNotSat: true, sen: 'No SEN', disadvantaged: 'No', attendance: '70%' },

      // Class 10 Sp2
      { surname: 'Ahmed', firstName: 'Ali', className: '10 Sp2', result: '4', points: 4, estimate: 4.5, isNotSat: false, sen: 'SEN Support', disadvantaged: 'No', attendance: '96%' }, // One away, gap 1
      { surname: 'Brown', firstName: 'Bella', className: '10 Sp2', result: '4', points: 4, estimate: 5.4, isNotSat: false, sen: 'No SEN', disadvantaged: 'Yes', attendance: '94%' }, // One away, gap 1, est 5.4 shortfall 1.4
      { surname: 'Clark', firstName: 'Charlie', className: '10 Sp2', result: '2', points: 2, estimate: 5.0, isNotSat: false, sen: 'EHCP', disadvantaged: 'Yes', attendance: '85%' }, // Three+ away, gap 3, est 5.0 shortfall 3.0
      { surname: 'Davies', firstName: 'David', className: '10 Sp2', result: '6', points: 6, estimate: 6.0, isNotSat: false, sen: 'No SEN', disadvantaged: 'No', attendance: '98%' } // At or above 5, gap 0
    ];

    it('calculates class band counts, percentages, and average gap for students below 5', () => {
      const { classes, cohort } = calculateDistanceBreakdownByClass(mockRecords);

      expect(classes.length).toBe(2);

      const sp1 = classes.find(c => c.className === '10 Sp1');
      // Sat in SP1 = 4 (Khan 5, Doyle 4, Evans 3, Taylor 0)
      expect(sp1.satCount).toBe(4);
      expect(sp1.countAtOrAbove5).toBe(1); // 1 / 4 = 25%
      expect(sp1.pctAtOrAbove5).toBe(25.0);
      expect(sp1.countOneAway).toBe(1); // 1 / 4 = 25%
      expect(sp1.countTwoAway).toBe(1); // 1 / 4 = 25%
      expect(sp1.countThreeOrMoreAway).toBe(1); // 1 / 4 = 25%

      // Students below 5 in SP1: Doyle (gap 1), Evans (gap 2), Taylor (gap 5).
      // Sum = 1 + 2 + 5 = 8. Count = 3.
      // Average gap below 5 = 8 / 3 = 2.67
      expect(sp1.averageGapBelow5).toBe(2.67);

      const sp2 = classes.find(c => c.className === '10 Sp2');
      // Sat in SP2 = 4 (Ahmed 4, Brown 4, Clark 2, Davies 6)
      expect(sp2.satCount).toBe(4);
      expect(sp2.countAtOrAbove5).toBe(1); // 25%
      expect(sp2.countOneAway).toBe(2); // 50%
      expect(sp2.countTwoAway).toBe(0); // 0%
      expect(sp2.countThreeOrMoreAway).toBe(1); // 25%

      // Students below 5 in SP2: Ahmed (gap 1), Brown (gap 1), Clark (gap 3).
      // Sum = 1 + 1 + 3 = 5. Count = 3.
      // Average gap below 5 = 5 / 3 = 1.67
      expect(sp2.averageGapBelow5).toBe(1.67);

      // SP1 has averageGapBelow5 2.67 > SP2's 1.67
      expect(sp1.isHighestAvgGap).toBe(true);
      expect(sp2.isHighestAvgGap).toBe(false);

      // Cohort: Total sat = 8. Below 5 sum = 8 + 5 = 13. Count = 6.
      // 13 / 6 = 2.17
      expect(cohort.averageGapBelow5).toBe(2.17);
    });
  });

  describe('Farthest from grade 5', () => {
    it('sorts students by gap descending (largest gap first)', () => {
      const records = [
        { surname: 'A', firstName: 'Ann', className: '10 Sp1', result: '4', points: 4, estimate: 4 }, // gap 1
        { surname: 'B', firstName: 'Bob', className: '10 Sp1', result: 'U', points: 0, estimate: 4 }, // gap 5
        { surname: 'C', firstName: 'Cat', className: '10 Sp1', result: '2', points: 2, estimate: 4 }, // gap 3
        { surname: 'D', firstName: 'Dan', className: '10 Sp1', result: '7', points: 7, estimate: 7 }  // gap 0
      ];

      const farthest = getFarthestFromGrade5(records);
      expect(farthest[0].surname).toBe('B'); // gap 5
      expect(farthest[1].surname).toBe('C'); // gap 3
      expect(farthest[2].surname).toBe('A'); // gap 1
      expect(farthest[3].surname).toBe('D'); // gap 0
    });
  });

  describe('Closest to grade 5 (Grade 4 students)', () => {
    it('selects all grade 4 students and groups by class', () => {
      const records = [
        { surname: 'Khan', firstName: 'Aisha', className: '10 Sp1', result: '4', points: 4 },
        { surname: 'Doyle', firstName: 'Ben', className: '10 Sp2', result: '4', points: 4 },
        { surname: 'Evans', firstName: 'Chloe', className: '10 Sp1', result: '4', points: 4 },
        { surname: 'Taylor', firstName: 'Dan', className: '10 Sp1', result: '5', points: 5 }
      ];

      const closest = getClosestToGrade5ByClass(records);
      expect(closest['10 Sp1'].length).toBe(2);
      expect(closest['10 Sp2'].length).toBe(1);
    });
  });

  describe('Estimate says 5+, result below 5', () => {
    it('finds students with estimate >= 5 and result < 5, sorted by shortfall descending', () => {
      const records = [
        { surname: 'A', firstName: 'Ann', className: '10 Sp1', result: '4', points: 4, estimate: 5.0 }, // shortfall: 5.0 - 4 = 1.0
        { surname: 'B', firstName: 'Bob', className: '10 Sp1', result: '2', points: 2, estimate: 6.5 }, // shortfall: 6.5 - 2 = 4.5
        { surname: 'C', firstName: 'Cat', className: '10 Sp1', result: '3', points: 3, estimate: 5.5 }, // shortfall: 5.5 - 3 = 2.5
        { surname: 'D', firstName: 'Dan', className: '10 Sp1', result: '5', points: 5, estimate: 6.0 }, // result not below 5 -> excluded
        { surname: 'E', firstName: 'Eve', className: '10 Sp1', result: '3', points: 3, estimate: 4.2 }  // estimate not 5+ -> excluded
      ];

      const underperforming = getEstimate5PlusShortfall(records);
      expect(underperforming.length).toBe(3);
      expect(underperforming[0].surname).toBe('B'); // shortfall 4.5
      expect(underperforming[1].surname).toBe('C'); // shortfall 2.5
      expect(underperforming[2].surname).toBe('A'); // shortfall 1.0
    });
  });

  describe('Filtering records in Distance from Grade 5', () => {
    const records = [
      { surname: 'A', className: '10 Sp1', sen: 'No SEN', disadvantaged: 'No', points: 5 }, // at_or_above_5
      { surname: 'B', className: '10 Sp1', sen: 'SEN Support', disadvantaged: 'Yes', points: 4 }, // one_grade_away
      { surname: 'C', className: '10 Sp2', sen: 'EHCP', disadvantaged: 'Yes', points: 3 }, // two_grades_away
      { surname: 'D', className: '10 Sp2', sen: 'No SEN', disadvantaged: 'No', points: 0 }  // three_or_more_away
    ];

    it('filters by class', () => {
      const filtered = filterDistanceRecords(records, { className: '10 Sp1' });
      expect(filtered.length).toBe(2);
    });

    it('filters by SEN Support', () => {
      const filtered = filterDistanceRecords(records, { sen: 'SEN Support' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].surname).toBe('B');
    });

    it('filters by disadvantaged', () => {
      const filtered = filterDistanceRecords(records, { disadvantaged: 'Yes' });
      expect(filtered.length).toBe(2);
    });

    it('filters by band', () => {
      const filtered = filterDistanceRecords(records, { band: 'one_grade_away' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].surname).toBe('B');
    });
  });
});
