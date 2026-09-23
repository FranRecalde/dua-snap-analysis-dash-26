import { describe, it, expect } from 'vitest';
import {
  calculateGroupMetrics,
  calculateStudentGroupsBreakdown,
  calculateGroupBreakdownPerClass,
  getTopPerformersByClass
} from '../src/stats.js';

describe('Student Groups and Top Performers Statistics', () => {
  const sampleCohort = [
    // Class 10 Sp1
    {
      id: 1,
      surname: 'Adams',
      firstName: 'Alice',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'Female',
      sen: 'No SEN',
      disadvantaged: 'No',
      attainmentLevel: 'High',
      attendance: '98%',
      result: '8',
      points: 8,
      estimate: 6.5,
      progress: 1.5
    },
    {
      id: 2,
      surname: 'Brown',
      firstName: 'Bob',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'Male',
      sen: 'SEN Support',
      disadvantaged: 'Yes',
      attainmentLevel: 'Middle',
      attendance: '92%',
      result: '5',
      points: 5,
      estimate: 4.8,
      progress: 0.2
    },
    {
      id: 3,
      surname: 'Clark',
      firstName: 'Chloe',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'Female',
      sen: 'No SEN',
      disadvantaged: 'Yes',
      attainmentLevel: 'Middle',
      attendance: '88%',
      result: '4',
      points: 4,
      estimate: 5.2,
      progress: -1.2
    },
    {
      id: 4,
      surname: 'Davis',
      firstName: 'Dan',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'Male',
      sen: 'No SEN',
      disadvantaged: 'No',
      attainmentLevel: 'Low',
      attendance: '96%',
      result: '3',
      points: 3,
      estimate: 3.5,
      progress: -0.5
    },
    {
      id: 5,
      surname: 'Evans',
      firstName: 'Ella',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'Female',
      sen: 'EHCP',
      disadvantaged: 'Yes',
      attainmentLevel: 'Low',
      attendance: '85%',
      result: '2',
      points: 2,
      estimate: 3.0,
      progress: -1.0
    },
    {
      id: 6,
      surname: 'Foster',
      firstName: 'Fin',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'Male',
      sen: 'No SEN',
      disadvantaged: 'No',
      attainmentLevel: 'No KS2 data',
      attendance: '91%',
      result: '6',
      points: 6,
      estimate: null, // No estimate!
      progress: null
    },

    // Class 10 Sp2
    {
      id: 7,
      surname: 'Green',
      firstName: 'Grace',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      sex: 'Female',
      sen: 'No SEN',
      disadvantaged: 'No',
      attainmentLevel: 'High',
      attendance: '99%',
      result: '9',
      points: 9,
      estimate: 7.0,
      progress: 2.0
    },
    {
      id: 8,
      surname: 'Harris',
      firstName: 'Harry',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      sex: 'Male',
      sen: 'SEN Support',
      disadvantaged: 'Yes',
      attainmentLevel: 'Middle',
      attendance: '89%',
      result: '4',
      points: 4,
      estimate: 5.5,
      progress: -1.5
    },
    {
      id: 9,
      surname: 'Iqbal',
      firstName: 'Imran',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      sex: 'Male',
      sen: 'No SEN',
      disadvantaged: 'No',
      attainmentLevel: 'Middle',
      attendance: '94%',
      result: '7',
      points: 7,
      estimate: 5.0,
      progress: 2.0
    },
    {
      id: 10,
      surname: 'Jones',
      firstName: 'Jack',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      sex: 'Male',
      sen: 'No SEN',
      disadvantaged: 'Yes',
      attainmentLevel: 'Low',
      attendance: '93%',
      result: 'U',
      points: 0,
      estimate: 3.2,
      progress: -3.2
    }
  ];

  it('correctly calculates metrics and gap against rest of cohort for groups', () => {
    const disadvRecords = sampleCohort.filter(r => r.disadvantaged === 'Yes');
    const notDisadvRecords = sampleCohort.filter(r => r.disadvantaged === 'No');

    // 4 Disadvantaged: Bob (5), Chloe (4), Ella (2), Harry (4), Jack (0) -> total 5 students!
    // Sat points: 5, 4, 2, 4, 0 -> sum = 15, avg = 3.0
    // 5 Not Disadvantaged: Alice (8), Dan (3), Fin (6), Grace (9), Imran (7) -> sat points sum = 33, avg = 6.6
    const metrics = calculateGroupMetrics(disadvRecords, sampleCohort);

    expect(metrics.studentsCount).toBe(5);
    expect(metrics.satCount).toBe(5);
    expect(metrics.averageGrade).toBe(3.0);
    // Grade 5+: only Bob (points 5) out of 5 -> 20.0%
    expect(metrics.pct5Plus).toBe(20.0);
    // Disadvantaged Progress:
    // Bob: 0.2, Chloe: -1.2, Ella: -1.0, Harry: -1.5, Jack: -3.2 -> sum = -6.7, avg = -1.34 (n=5)
    expect(metrics.progressCount).toBe(5);
    expect(metrics.averageProgress).toBe(-1.34);

    // Gap vs Rest:
    // Average Grade gap = 3.0 - 6.6 = -3.6
    expect(metrics.gradeGap).toBe(-3.6);
  });

  it('includes EHCP in breakdown only when present', () => {
    // sampleCohort has Ella with EHCP -> EHCP must be included
    const breakdownWithEHCP = calculateStudentGroupsBreakdown(sampleCohort);
    const senCatWith = breakdownWithEHCP.find(c => c.category === 'SEN Status');
    const hasEHCPRowWith = senCatWith.groups.some(g => g.name === 'EHCP');
    expect(hasEHCPRowWith).toBe(true);

    // Cohort without EHCP
    const noEHCPCohort = sampleCohort.filter(r => r.sen !== 'EHCP');
    const breakdownWithoutEHCP = calculateStudentGroupsBreakdown(noEHCPCohort);
    const senCatWithout = breakdownWithoutEHCP.find(c => c.category === 'SEN Status');
    const hasEHCPRowWithout = senCatWithout.groups.some(g => g.name === 'EHCP');
    expect(hasEHCPRowWithout).toBe(false);
  });

  it('flags groups with fewer than 5 students as tooFew = true', () => {
    const classBreakdowns = calculateGroupBreakdownPerClass(sampleCohort);
    expect(classBreakdowns.length).toBe(2);

    // In Class 10 Sp1 (6 students):
    // SEN Support has only Bob (1 student) -> tooFew must be true!
    const sp1 = classBreakdowns.find(c => c.className === '10 Sp1');
    const senCat = sp1.breakdown.find(cat => cat.category === 'SEN Status');
    const senSupport = senCat.groups.find(g => g.name === 'SEN Support');
    expect(senSupport.studentsCount).toBe(1);
    expect(senSupport.tooFew).toBe(true);

    // Attendance Band < 90% in 10 Sp1 has Chloe (88%) and Ella (85%) (2 students) -> tooFew = true
    const attCat = sp1.breakdown.find(cat => cat.category === 'Attendance Band');
    const below90 = attCat.groups.find(g => g.name === 'Below 90%');
    expect(below90.studentsCount).toBe(2);
    expect(below90.tooFew).toBe(true);
  });

  it('correctly calculates top performers per class with tie breaks and progress scores', () => {
    const topPerformers = getTopPerformersByClass(sampleCohort);

    // Class 10 Sp1:
    // Students points: Alice (8, prog +1.5), Fin (6, prog null), Bob (5, prog +0.2), Chloe (4, prog -1.2), Dan (3, prog -0.5), Ella (2, prog -1.0)
    const sp1 = topPerformers['10 Sp1'];
    expect(sp1.topPoints.length).toBe(5);
    expect(sp1.topPoints[0].surname).toBe('Adams'); // points 8
    expect(sp1.topPoints[1].surname).toBe('Foster'); // points 6
    expect(sp1.topPoints[2].surname).toBe('Brown'); // points 5
    expect(sp1.topPoints[3].surname).toBe('Clark'); // points 4
    expect(sp1.topPoints[4].surname).toBe('Davis'); // points 3

    // Positive progress in 10 Sp1:
    // Alice (+1.5), Bob (+0.2)
    expect(sp1.positiveProgress.length).toBe(2);
    expect(sp1.positiveProgress[0].surname).toBe('Adams');
    expect(sp1.positiveProgress[0].progress).toBe(1.5);
    expect(sp1.positiveProgress[1].surname).toBe('Brown');
    expect(sp1.positiveProgress[1].progress).toBe(0.2);

    // Negative progress in 10 Sp1 (sorted most negative first):
    // Chloe (-1.2), Ella (-1.0), Dan (-0.5)
    expect(sp1.negativeProgress.length).toBe(3);
    expect(sp1.negativeProgress[0].surname).toBe('Clark'); // -1.2
    expect(sp1.negativeProgress[1].surname).toBe('Evans'); // -1.0
    expect(sp1.negativeProgress[2].surname).toBe('Davis'); // -0.5

    // Class 10 Sp2:
    // Grace (9, prog 2.0), Imran (7, prog 2.0), Harry (4, prog -1.5), Jack (0, prog -3.2)
    const sp2 = topPerformers['10 Sp2'];
    expect(sp2.topPoints.length).toBe(4);
    expect(sp2.topPoints[0].surname).toBe('Green'); // 9

    // Positive progress in 10 Sp2:
    // Grace (+2.0), Imran (+2.0)
    expect(sp2.positiveProgress.length).toBe(2);

    // Negative progress in 10 Sp2:
    // Jack (-3.2), Harry (-1.5)
    expect(sp2.negativeProgress[0].surname).toBe('Jones'); // -3.2
    expect(sp2.negativeProgress[1].surname).toBe('Harris'); // -1.5
  });

  it('correctly resolves tie-break for top points using higher progress', () => {
    const tiedRecords = [
      {
        id: 1,
        surname: 'Zeta',
        firstName: 'Zach',
        className: '10 A',
        result: '7',
        points: 7,
        estimate: 6.0,
        progress: 1.0
      },
      {
        id: 2,
        surname: 'Alpha',
        firstName: 'Adam',
        className: '10 A',
        result: '7',
        points: 7,
        estimate: 4.5,
        progress: 2.5
      }
    ];

    const result = getTopPerformersByClass(tiedRecords);
    // Adam Alpha has progress +2.5 vs Zach Zeta's +1.0 -> Adam should be ranked first despite surname
    expect(result['10 A'].topPoints[0].surname).toBe('Alpha');
    expect(result['10 A'].topPoints[1].surname).toBe('Zeta');
  });
});
