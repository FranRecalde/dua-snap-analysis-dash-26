import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  calculateClassBreakdown,
  calculateColumnExtremes,
  sortClasses,
  calculateMedian,
  parseAttendance,
  formatProgress,
  formatPct
} from '../src/stats.js';

describe('Cohort and Class Metrics Engine', () => {

  describe('Attendance Parser', () => {
    it('parses percentages correctly from various formats', () => {
      expect(parseAttendance('94.5%')).toBe(94.5);
      expect(parseAttendance('94.5')).toBe(94.5);
      expect(parseAttendance('100%')).toBe(100);
      expect(parseAttendance(0.954)).toBe(95.4);
      expect(parseAttendance('')).toBeNull();
      expect(parseAttendance(null)).toBeNull();
    });
  });

  describe('Median Calculation', () => {
    it('calculates median for odd-length arrays', () => {
      expect(calculateMedian([3, 5, 7])).toBe(5);
      expect(calculateMedian([9, 2, 5])).toBe(5);
    });

    it('calculates median for even-length arrays', () => {
      expect(calculateMedian([4, 6])).toBe(5);
      expect(calculateMedian([3, 4, 5, 6])).toBe(4.5);
    });

    it('returns null for empty arrays', () => {
      expect(calculateMedian([])).toBeNull();
    });
  });

  describe('calculateMetrics for Cohort and Classes', () => {
    it('computes correct headlines including exclusions for Not sat and missing estimates', () => {
      const records = [
        {
          surname: 'Khan',
          firstName: 'Aisha',
          className: '10 Sp1',
          result: '5',
          points: 5,
          estimate: 4.6,
          progress: 0.4,
          isNotSat: false,
          isU: false,
          sen: 'No SEN',
          disadvantaged: 'No',
          attendance: '95%'
        },
        {
          surname: 'Doyle',
          firstName: 'Ben',
          className: '10 Sp1',
          result: 'U',
          points: 0,
          estimate: null,
          progress: null, // Estimate missing
          isNotSat: false,
          isU: true,
          sen: 'SEN Support',
          disadvantaged: 'Yes',
          attendance: '90%'
        },
        {
          surname: 'Evans',
          firstName: 'Chloe',
          className: '10 Sp1',
          result: 'Not sat',
          points: null, // Not sat excluded from points averages
          estimate: 5.0,
          progress: 0.5,
          isNotSat: true,
          isU: false,
          sen: 'No SEN',
          disadvantaged: 'Yes',
          attendance: '85%'
        },
        {
          surname: 'Taylor',
          firstName: 'Dan',
          className: '10 Sp1',
          result: '7',
          points: 7,
          estimate: 6.0,
          progress: 1.0,
          isNotSat: false,
          isU: false,
          sen: 'No SEN',
          disadvantaged: 'No',
          attendance: '98%'
        }
      ];

      const metrics = calculateMetrics(records);

      // Total students = 4
      expect(metrics.studentsCount).toBe(4);
      // Sat count = 3 (Dan 7, Aisha 5, Ben 0)
      expect(metrics.satCount).toBe(3);
      expect(metrics.notSatCount).toBe(1);

      // Points average = (7 + 5 + 0) / 3 = 12 / 3 = 4.0
      expect(metrics.averageGrade).toBe(4.0);

      // Median points: [0, 5, 7] -> 5
      expect(metrics.medianGrade).toBe(5);

      // Grade 5+ : Aisha (5), Dan (7) -> 2 out of 3 = 66.67%
      expect(Math.round(metrics.pct5Plus * 10) / 10).toBe(66.7);

      // Grade 4+ : Aisha (5), Dan (7) -> 2 out of 3 = 66.67%
      expect(Math.round(metrics.pct4Plus * 10) / 10).toBe(66.7);

      // Grade 7+ : Dan (7) -> 1 out of 3 = 33.33%
      expect(Math.round(metrics.pct7Plus * 10) / 10).toBe(33.3);

      // U count = 1 (Ben)
      expect(metrics.uCount).toBe(1);

      // Progress: Aisha (0.4), Chloe (0.5), Dan (1.0). Ben has estimate missing!
      // Total with progress = 3. Sum = 1.9. Mean = 1.9 / 3 = 0.63
      expect(metrics.progressCount).toBe(3);
      expect(metrics.averageProgress).toBe(0.63);

      // SEN Support: Ben -> 1 out of 4 = 25%
      expect(metrics.pctSENSupport).toBe(25);

      // Disadvantaged: Ben, Chloe -> 2 out of 4 = 50%
      expect(metrics.pctDisadvantaged).toBe(50);

      // Attendance: (95 + 90 + 85 + 98) / 4 = 368 / 4 = 92%
      expect(metrics.averageAttendance).toBe(92);

      // Distribution
      expect(metrics.gradeDistribution['U']).toBe(1);
      expect(metrics.gradeDistribution['5']).toBe(1);
      expect(metrics.gradeDistribution['7']).toBe(1);
      expect(metrics.gradeDistribution['1']).toBe(0);
    });
  });

  describe('Class Breakdown and Small Group Flag', () => {
    it('groups classes, marks small group when students < 10', () => {
      const records = [
        { className: '10 Sp1', points: 6, result: '6', estimate: 5, progress: 1, isNotSat: false },
        { className: '10 Sp1', points: 4, result: '4', estimate: 4, progress: 0, isNotSat: false },
        { className: '10 Sp2', points: 3, result: '3', estimate: 4, progress: -1, isNotSat: false }
      ];

      const classes = calculateClassBreakdown(records);
      expect(classes.length).toBe(2);

      const sp1 = classes.find(c => c.className === '10 Sp1');
      expect(sp1.students).toBe(2);
      expect(sp1.averageGrade).toBe(5.0);
      expect(sp1.isSmallGroup).toBe(true); // < 10 students

      const sp2 = classes.find(c => c.className === '10 Sp2');
      expect(sp2.students).toBe(1);
      expect(sp2.averageGrade).toBe(3.0);
      expect(sp2.isSmallGroup).toBe(true);
    });
  });

  describe('Column Extremes Highlighting', () => {
    it('finds min and max across class values', () => {
      const classes = [
        { className: '10 Sp1', students: 25, averageGrade: 5.6, pct5Plus: 70, averageProgress: 0.4 },
        { className: '10 Sp2', students: 22, averageGrade: 4.2, pct5Plus: 45, averageProgress: -0.1 },
        { className: '10 Sp3', students: 18, averageGrade: 4.9, pct5Plus: 55, averageProgress: 0.1 }
      ];

      const extremes = calculateColumnExtremes(classes);
      expect(extremes.averageGrade).toEqual({ max: 5.6, min: 4.2 });
      expect(extremes.pct5Plus).toEqual({ max: 70, min: 45 });
      expect(extremes.averageProgress).toEqual({ max: 0.4, min: -0.1 });
      expect(extremes.students).toEqual({ max: 25, min: 18 });
    });
  });

  describe('Sorting and Ranking Classes', () => {
    const classes = [
      { className: '10 Sp1', averageGrade: 4.5, pct5Plus: 50, averageProgress: 0.2 },
      { className: '10 Sp2', averageGrade: 6.0, pct5Plus: 80, averageProgress: 0.6 },
      { className: '10 Sp3', averageGrade: 3.8, pct5Plus: 30, averageProgress: -0.2 }
    ];

    it('ranks by average grade descending', () => {
      const sorted = sortClasses(classes, 'average-grade');
      expect(sorted[0].className).toBe('10 Sp2');
      expect(sorted[1].className).toBe('10 Sp1');
      expect(sorted[2].className).toBe('10 Sp3');
    });

    it('ranks by % 5+ descending', () => {
      const sorted = sortClasses(classes, 'pct-5-plus');
      expect(sorted[0].className).toBe('10 Sp2');
      expect(sorted[1].className).toBe('10 Sp1');
      expect(sorted[2].className).toBe('10 Sp3');
    });

    it('ranks by average progress descending', () => {
      const sorted = sortClasses(classes, 'avg-progress');
      expect(sorted[0].className).toBe('10 Sp2');
      expect(sorted[1].className).toBe('10 Sp1');
      expect(sorted[2].className).toBe('10 Sp3');
    });
  });
});
