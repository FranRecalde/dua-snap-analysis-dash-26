import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateMetrics,
  calculateClassBreakdown,
  calculateColumnExtremes,
  sortClasses
} from '../src/stats.js';

describe('Overview and Class Comparison Dashboard Logic', () => {

  const mockSnapshotRecords = [
    // Class 10 Sp1 (Large group >= 10 students)
    { surname: 'Khan', firstName: 'Aisha', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: '5', points: 5, estimate: 4.6, progress: 0.4, isNotSat: false, isU: false, sen: 'No SEN', disadvantaged: 'No', attendance: '96%' },
    { surname: 'Doyle', firstName: 'Ben', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: 'U', points: 0, estimate: null, progress: null, isNotSat: false, isU: true, sen: 'SEN Support', disadvantaged: 'Yes', attendance: '88%' },
    { surname: 'Evans', firstName: 'Chloe', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: '7', points: 7, estimate: 5.5, progress: 1.5, isNotSat: false, isU: false, sen: 'No SEN', disadvantaged: 'Yes', attendance: '94%' },
    { surname: 'Taylor', firstName: 'Dan', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: '6', points: 6, estimate: 5.0, progress: 1.0, isNotSat: false, isU: false, sen: 'No SEN', disadvantaged: 'No', attendance: '98%' },
    { surname: 'Miller', firstName: 'Ella', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: '4', points: 4, estimate: 4.0, progress: 0.0, isNotSat: false, isU: false, sen: 'SEN Support', disadvantaged: 'No', attendance: '91%' },
    { surname: 'Wilson', firstName: 'Fred', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: '8', points: 8, estimate: 6.8, progress: 1.2, isNotSat: false, isU: false, sen: 'No SEN', disadvantaged: 'No', attendance: '99%' },
    { surname: 'Green', firstName: 'Grace', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: '5', points: 5, estimate: 4.8, progress: 0.2, isNotSat: false, isU: false, sen: 'No SEN', disadvantaged: 'Yes', attendance: '95%' },
    { surname: 'Hall', firstName: 'Harry', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: '3', points: 3, estimate: 3.5, progress: -0.5, isNotSat: false, isU: false, sen: 'No SEN', disadvantaged: 'No', attendance: '89%' },
    { surname: 'King', firstName: 'Isla', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: '9', points: 9, estimate: 7.5, progress: 1.5, isNotSat: false, isU: false, sen: 'No SEN', disadvantaged: 'No', attendance: '100%' },
    { surname: 'Wright', firstName: 'Jack', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: '4', points: 4, estimate: 4.2, progress: -0.2, isNotSat: false, isU: false, sen: 'No SEN', disadvantaged: 'No', attendance: '92%' },
    { surname: 'Lopez', firstName: 'Mia', className: '10 Sp1', rawClass: '10/Sp1 (25/26)', result: 'Not sat', points: null, estimate: 5.0, progress: 0.0, isNotSat: true, isU: false, sen: 'No SEN', disadvantaged: 'Yes', attendance: '70%' },

    // Class 10 Sp2 (Small group < 10 students: 3 students)
    { surname: 'Ahmed', firstName: 'Ali', className: '10 Sp2', rawClass: '10/Sp2 (25/26)', result: '2', points: 2, estimate: 3.0, progress: -1.0, isNotSat: false, isU: false, sen: 'SEN Support', disadvantaged: 'Yes', attendance: '84%' },
    { surname: 'Brown', firstName: 'Bella', className: '10 Sp2', rawClass: '10/Sp2 (25/26)', result: '3', points: 3, estimate: 3.5, progress: -0.5, isNotSat: false, isU: false, sen: 'No SEN', disadvantaged: 'Yes', attendance: '86%' },
    { surname: 'Clark', firstName: 'Charlie', className: '10 Sp2', rawClass: '10/Sp2 (25/26)', result: 'U', points: 0, estimate: null, progress: null, isNotSat: false, isU: true, sen: 'EHCP', disadvantaged: 'Yes', attendance: '80%' }
  ];

  it('calculates cohort headlines accurately', () => {
    const cohort = calculateMetrics(mockSnapshotRecords);

    // Total students = 11 in 10 Sp1 + 3 in 10 Sp2 = 14
    expect(cohort.studentsCount).toBe(14);
    // Not sat = 1 (Mia Lopez), sat = 13
    expect(cohort.notSatCount).toBe(1);
    expect(cohort.satCount).toBe(13);

    // Sat points: [5, 0, 7, 6, 4, 8, 5, 3, 9, 4, 2, 3, 0] = 56 / 13 = 4.31
    expect(cohort.averageGrade).toBe(4.3);

    // U grades count: Ben (10 Sp1), Charlie (10 Sp2) = 2
    expect(cohort.uCount).toBe(2);

    // % 5+: 5, 7, 6, 8, 5, 9 = 6 out of 13 = 46.15%
    expect(Math.round(cohort.pct5Plus * 10) / 10).toBe(46.2);

    // % 4+: 6 (5+) + 4, 4 = 8 out of 13 = 61.54%
    expect(Math.round(cohort.pct4Plus * 10) / 10).toBe(61.5);

    // % 7+: 7, 8, 9 = 3 out of 13 = 23.08%
    expect(Math.round(cohort.pct7Plus * 10) / 10).toBe(23.1);

    // Students with estimate only:
    // 10 Sp1: Ben has estimate null (excluded). Mia sat=false, estimate=5.0, progress=0.0 (included in progress).
    // Total with estimate: Aisha, Chloe, Dan, Ella, Fred, Grace, Harry, Isla, Jack, Mia (10), Ali, Bella (2) = 12 students.
    expect(cohort.progressCount).toBe(12);
  });

  it('generates class breakdown with small group flag', () => {
    const classes = calculateClassBreakdown(mockSnapshotRecords);
    expect(classes.length).toBe(2);

    const sp1 = classes.find(c => c.className === '10 Sp1');
    const sp2 = classes.find(c => c.className === '10 Sp2');

    expect(sp1.students).toBe(11);
    expect(sp1.isSmallGroup).toBe(false); // >= 10 students

    expect(sp2.students).toBe(3);
    expect(sp2.isSmallGroup).toBe(true); // < 10 students: triggers "small group, read with care"
  });

  it('identifies highest and lowest column extremes for visual highlighting', () => {
    const classes = calculateClassBreakdown(mockSnapshotRecords);
    const extremes = calculateColumnExtremes(classes);

    // 10 Sp1 average grade is higher than 10 Sp2
    const sp1 = classes.find(c => c.className === '10 Sp1');
    const sp2 = classes.find(c => c.className === '10 Sp2');

    expect(extremes.averageGrade.max).toBe(sp1.averageGrade);
    expect(extremes.averageGrade.min).toBe(sp2.averageGrade);

    expect(extremes.pct5Plus.max).toBe(sp1.pct5Plus);
    expect(extremes.pct5Plus.min).toBe(sp2.pct5Plus);

    expect(extremes.students.max).toBe(11);
    expect(extremes.students.min).toBe(3);
  });

  it('ranks classes correctly by average grade, % 5+, and average progress', () => {
    const classes = calculateClassBreakdown(mockSnapshotRecords);

    // By average grade
    const byAvgGrade = sortClasses(classes, 'average-grade', 'desc');
    expect(byAvgGrade[0].className).toBe('10 Sp1');
    expect(byAvgGrade[1].className).toBe('10 Sp2');

    // By % 5+
    const byPct5Plus = sortClasses(classes, 'pct-5-plus', 'desc');
    expect(byPct5Plus[0].className).toBe('10 Sp1');
    expect(byPct5Plus[1].className).toBe('10 Sp2');

    // By average progress
    const byProgress = sortClasses(classes, 'avg-progress', 'desc');
    expect(byProgress[0].className).toBe('10 Sp1');
    expect(byProgress[1].className).toBe('10 Sp2');

    // Ascending test
    const byAvgGradeAsc = sortClasses(classes, 'average-grade', 'asc');
    expect(byAvgGradeAsc[0].className).toBe('10 Sp2');
    expect(byAvgGradeAsc[1].className).toBe('10 Sp1');
  });

  it('computes complete grade distribution for stacked bar chart (U, 1 to 9)', () => {
    const classes = calculateClassBreakdown(mockSnapshotRecords);
    const sp1 = classes.find(c => c.className === '10 Sp1');

    expect(sp1.gradeDistribution['U']).toBe(1);
    expect(sp1.gradeDistribution['1']).toBe(0);
    expect(sp1.gradeDistribution['2']).toBe(0);
    expect(sp1.gradeDistribution['3']).toBe(1);
    expect(sp1.gradeDistribution['4']).toBe(2);
    expect(sp1.gradeDistribution['5']).toBe(2);
    expect(sp1.gradeDistribution['6']).toBe(1);
    expect(sp1.gradeDistribution['7']).toBe(1);
    expect(sp1.gradeDistribution['8']).toBe(1);
    expect(sp1.gradeDistribution['9']).toBe(1);

    const totalSatInDist = Object.values(sp1.gradeDistribution).reduce((a, b) => a + b, 0);
    expect(totalSatInDist).toBe(10);
  });
});
