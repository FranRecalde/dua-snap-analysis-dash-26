import { describe, it, expect } from 'vitest';
import {
  calculateMovementMatrix,
  calculateNewClassProfiles,
  calculateBalanceFlags,
  DEFAULT_MOVEMENT_THRESHOLDS
} from '../src/movementStats.js';

describe('Movement & Class Balance Pure Statistics Tests (Invented Data)', () => {
  // Helper to create invented snapshot records
  const createSnapshotRecord = (id, currentClass, points, options = {}) => ({
    id,
    surname: `Student${id}`,
    firstName: `Test${id}`,
    className: currentClass,
    currentClassName: currentClass,
    result: points !== null ? String(points) : null,
    points: points,
    isNotSat: points === null,
    sen: options.sen || 'No SEN',
    disadvantaged: options.disadvantaged || 'No',
    eal: options.eal || 'No',
    attainmentLevel: options.attainmentLevel || 'Middle',
    hasNewClass: options.hasNewClass !== undefined ? options.hasNewClass : true,
    newClassName: options.newClassName || null
  });

  it('1. Matrix totals equal the number of matched students', () => {
    // 6 students in 10 Sp1 matched to 11 Sp1 (3) and 11 Sp2 (3)
    // 4 students in 10 Sp2 matched to 11 Sp1 (2) and 11 Sp2 (2)
    // Total matched = 10
    const matchedStudents = [
      createSnapshotRecord(1, '10 Sp1', 5, { newClassName: '11 Sp1' }),
      createSnapshotRecord(2, '10 Sp1', 6, { newClassName: '11 Sp1' }),
      createSnapshotRecord(3, '10 Sp1', 4, { newClassName: '11 Sp1' }),
      createSnapshotRecord(4, '10 Sp1', 7, { newClassName: '11 Sp2' }),
      createSnapshotRecord(5, '10 Sp1', 5, { newClassName: '11 Sp2' }),
      createSnapshotRecord(6, '10 Sp1', 3, { newClassName: '11 Sp2' }),
      createSnapshotRecord(7, '10 Sp2', 6, { newClassName: '11 Sp1' }),
      createSnapshotRecord(8, '10 Sp2', 5, { newClassName: '11 Sp1' }),
      createSnapshotRecord(9, '10 Sp2', 4, { newClassName: '11 Sp2' }),
      createSnapshotRecord(10, '10 Sp2', 8, { newClassName: '11 Sp2' })
    ];

    const classListsData = {
      allNewClassStudents: [
        { className: '11 Sp1' },
        { className: '11 Sp2' }
      ],
      inSnapshotNotInNewClass: [],
      inNewClassesNoMockResult: []
    };

    const matrix = calculateMovementMatrix(matchedStudents, classListsData);

    expect(matrix.totalMatched).toBe(10);

    // Sum of all cells in grid equals total matched
    let cellSum = 0;
    matrix.currentClasses.forEach(cur => {
      matrix.newClasses.forEach(nw => {
        cellSum += matrix.grid[cur][nw].length;
      });
    });
    expect(cellSum).toBe(10);
    expect(matrix.rowTotals['10 Sp1']).toBe(6);
    expect(matrix.rowTotals['10 Sp2']).toBe(4);
    expect(matrix.colTotals['11 Sp1']).toBe(5);
    expect(matrix.colTotals['11 Sp2']).toBe(5);
    expect(matrix.grandTotal).toBe(10);
  });

  it('2. A student not in any new class appears in the "Not in a new class" column', () => {
    const student1 = createSnapshotRecord(1, '10 Sp1', 5, { hasNewClass: true, newClassName: '11 Sp1' });
    const studentUnmatched = createSnapshotRecord(2, '10 Sp1', 4, { hasNewClass: false, newClassName: null });

    const classListsData = {
      allNewClassStudents: [{ className: '11 Sp1' }],
      inSnapshotNotInNewClass: [studentUnmatched],
      inNewClassesNoMockResult: []
    };

    const matrix = calculateMovementMatrix([student1, studentUnmatched], classListsData);

    expect(matrix.totalMatched).toBe(1);
    expect(matrix.totalNotInNewClass).toBe(1);
    expect(matrix.notInNewByCurrent['10 Sp1']).toHaveLength(1);
    expect(matrix.notInNewByCurrent['10 Sp1'][0].id).toBe(2);
    expect(matrix.notInNewColTotal).toBe(1);
    expect(matrix.rowTotals['10 Sp1']).toBe(2); // 1 matched + 1 unmatched
    expect(matrix.grandTotal).toBe(2);
  });

  it('3. A student with no mock result appears in the "New to the cohort" row and is excluded from the average grade', () => {
    const studentMatched = createSnapshotRecord(1, '10 Sp1', 6, { hasNewClass: true, newClassName: '11 Sp1' });
    const studentNewToCohort = {
      id: 99,
      surname: 'NewStudent',
      firstName: 'Alex',
      className: null,
      newClassName: '11 Sp1',
      result: null,
      points: null,
      isNotSat: true,
      sen: 'No SEN',
      disadvantaged: 'No',
      eal: 'No'
    };

    const classListsData = {
      allNewClassStudents: [{ className: '11 Sp1' }],
      inSnapshotNotInNewClass: [],
      inNewClassesNoMockResult: [studentNewToCohort]
    };

    // Matrix check
    const matrix = calculateMovementMatrix([studentMatched], classListsData);
    expect(matrix.totalNewToCohort).toBe(1);
    expect(matrix.newToCohortByNew['11 Sp1']).toHaveLength(1);
    expect(matrix.newToCohortRowTotal).toBe(1);
    expect(matrix.colTotals['11 Sp1']).toBe(2); // 1 matched + 1 new to cohort

    // Profile check: student with no mock result counts in class size (2) but excluded from avg grade
    const profiles = calculateNewClassProfiles([studentMatched], classListsData);
    expect(profiles.classProfiles).toHaveLength(1);
    const cp = profiles.classProfiles[0];
    expect(cp.className).toBe('11 Sp1');
    expect(cp.totalStudents).toBe(2);
    expect(cp.studentsWithResults).toBe(1);
    expect(cp.resultRatioText).toBe('results for 1 of 2');
    expect(cp.averageGrade).toBe(6.0); // Exact score of studentMatched only, Alex not averaged in as 0
    expect(cp.pctGrade5Plus).toBe(100.0);
  });

  it('4. Each balance flag fires when its threshold is crossed and not when just under it', () => {
    // Flag 1: Average grade gap > 0.75 above or below cohort average
    // Cohort has 2 classes: 11 Sp1 (avg 6.0, 5 students) and 11 Sp2 (avg 4.0, 5 students)
    // Cohort average = 5.0
    // 11 Sp1 gap = +1.0 (> 0.75) -> FIRES
    // 11 Sp2 gap = -1.0 (> 0.75 below) -> FIRES
    const cpHigh = {
      className: '11 Sp1',
      totalStudents: 5,
      studentsWithResults: 5,
      averageGrade: 6.0,
      distanceBands: { threeOrMoreAway: 0 },
      senSupportCount: 0,
      disadvCount: 0,
      pctSenSupport: 0,
      pctDisadvantaged: 0,
      students: Array.from({ length: 5 }, (_, i) => ({ id: i, points: 6 }))
    };

    const cpLow = {
      className: '11 Sp2',
      totalStudents: 5,
      studentsWithResults: 5,
      averageGrade: 4.0,
      distanceBands: { threeOrMoreAway: 0 },
      senSupportCount: 0,
      disadvCount: 0,
      pctSenSupport: 0,
      pctDisadvantaged: 0,
      students: Array.from({ length: 5 }, (_, i) => ({ id: 10 + i, points: 4 }))
    };

    const cohort = {
      className: 'Cohort',
      totalStudents: 10,
      studentsWithResults: 10,
      averageGrade: 5.0,
      distanceBands: { threeOrMoreAway: 0 },
      pctSenSupport: 0,
      pctDisadvantaged: 0
    };

    const resFlags = calculateBalanceFlags([cpHigh, cpLow], cohort, { gradeGap: 0.75 });
    const gradeFlags = resFlags.flags.filter(f => f.ruleNumber === 1);
    expect(gradeFlags).toHaveLength(2);
    expect(gradeFlags[0].text).toContain('11 Sp1 average grade (6.00) is 1.00 grades above the cohort average (5.00).');
    expect(gradeFlags[1].text).toContain('11 Sp2 average grade (4.00) is 1.00 grades below the cohort average (5.00).');

    // Boundary check for Flag 1: If gap is 0.75 exactly (not > 0.75), does NOT fire
    const cpHalf = {
      ...cpHigh,
      averageGrade: 5.75
    };
    const resBoundary = calculateBalanceFlags([cpHalf], cohort, { gradeGap: 0.75 });
    expect(resBoundary.flags.filter(f => f.ruleNumber === 1)).toHaveLength(0);

    // Flag 2: 3+ grades from 5 concentration (> 30% of cohort)
    // Cohort has 10 students 3+ away. Class 11 Sp3 has 4 students 3+ away (40% > 30%) -> FIRES
    const cpThreeAway = {
      className: '11 Sp3',
      totalStudents: 10,
      studentsWithResults: 10,
      averageGrade: 5.0,
      distanceBands: { threeOrMoreAway: 4 },
      pctSenSupport: 0,
      pctDisadvantaged: 0,
      students: Array.from({ length: 4 }, (_, i) => ({ id: 30 + i, points: 2 }))
    };
    const cohortWithThreeAway = {
      ...cohort,
      distanceBands: { threeOrMoreAway: 10 }
    };
    const resThree = calculateBalanceFlags([cpThreeAway], cohortWithThreeAway, { threeOrMoreConcentration: 30 });
    const flagThree = resThree.flags.find(f => f.ruleNumber === 2);
    expect(flagThree).toBeDefined();
    expect(flagThree.text).toBe('11 Sp3 holds 40% of the students three or more grades from 5.');

    // Boundary check for Flag 2: 30% exactly (3 out of 10) does NOT fire
    const cpThreeExact = {
      ...cpThreeAway,
      distanceBands: { threeOrMoreAway: 3 }
    };
    const resThreeExact = calculateBalanceFlags([cpThreeExact], cohortWithThreeAway, { threeOrMoreConcentration: 30 });
    expect(resThreeExact.flags.filter(f => f.ruleNumber === 2)).toHaveLength(0);

    // Flag 3: SEN Support share (> 10 percentage points above cohort share)
    // Cohort SEN share = 15%. Class has 30% SEN (gap = 15 pts > 10 pts) -> FIRES
    const cpSen = {
      className: '11 Sp4',
      totalStudents: 10,
      studentsWithResults: 10,
      averageGrade: 5.0,
      distanceBands: { threeOrMoreAway: 0 },
      senSupportCount: 3,
      pctSenSupport: 30.0,
      pctDisadvantaged: 0,
      students: []
    };
    const cohortSen = {
      ...cohort,
      pctSenSupport: 15.0
    };
    const resSen = calculateBalanceFlags([cpSen], cohortSen, { senGap: 10 });
    const flagSen = resSen.flags.find(f => f.ruleNumber === 3);
    expect(flagSen).toBeDefined();
    expect(flagSen.text).toContain('11 Sp4 SEN Support share (30.0%) is 15.0 percentage points above the cohort share (15.0%).');

    // Boundary check for Flag 3: exactly 10 pts (25% vs 15%) does NOT fire
    const cpSenExact = {
      ...cpSen,
      pctSenSupport: 25.0
    };
    const resSenExact = calculateBalanceFlags([cpSenExact], cohortSen, { senGap: 10 });
    expect(resSenExact.flags.filter(f => f.ruleNumber === 3)).toHaveLength(0);

    // Flag 4: Disadvantaged share (> 10 percentage points above cohort)
    // Cohort Disadv = 20%. Class Disadv = 35% (gap = 15 pts > 10 pts) -> FIRES
    const cpDisadv = {
      className: '11 Sp5',
      totalStudents: 10,
      studentsWithResults: 10,
      averageGrade: 5.0,
      distanceBands: { threeOrMoreAway: 0 },
      senSupportCount: 0,
      pctSenSupport: 0,
      disadvCount: 4,
      pctDisadvantaged: 35.0,
      students: []
    };
    const cohortDisadv = {
      ...cohort,
      pctDisadvantaged: 20.0
    };
    const resDisadv = calculateBalanceFlags([cpDisadv], cohortDisadv, { disadvantagedGap: 10 });
    const flagDisadv = resDisadv.flags.find(f => f.ruleNumber === 4);
    expect(flagDisadv).toBeDefined();
    expect(flagDisadv.text).toContain('11 Sp5 disadvantaged share (35.0%) is 15.0 percentage points above the cohort share (20.0%).');

    // Flag 5: No mock result share (> 15% of class)
    // 2 out of 10 students have no mock result (20% > 15%) -> FIRES
    const cpNoMock = {
      className: '11 Sp6',
      totalStudents: 10,
      studentsWithResults: 8,
      averageGrade: 5.0,
      distanceBands: { threeOrMoreAway: 0 },
      senSupportCount: 0,
      pctSenSupport: 0,
      disadvCount: 0,
      pctDisadvantaged: 0,
      students: []
    };
    const resNoMock = calculateBalanceFlags([cpNoMock], cohort, { noMockRate: 15 });
    const flagNoMock = resNoMock.flags.find(f => f.ruleNumber === 5);
    expect(flagNoMock).toBeDefined();
    expect(flagNoMock.text).toContain('More than 15% of 11 Sp6 has no mock result (20%).');

    // Boundary check for Flag 5: exactly 15% (3 out of 20 = 15.0%) does NOT fire
    const cpNoMockExact = {
      className: '11 Sp6',
      totalStudents: 20,
      studentsWithResults: 17, // 3 no mock out of 20 = 15%
      averageGrade: 5.0,
      distanceBands: { threeOrMoreAway: 0 },
      senSupportCount: 0,
      pctSenSupport: 0,
      disadvCount: 0,
      pctDisadvantaged: 0,
      students: []
    };
    const resNoMockExact = calculateBalanceFlags([cpNoMockExact], cohort, { noMockRate: 15 });
    expect(resNoMockExact.flags.filter(f => f.ruleNumber === 5)).toHaveLength(0);
  });

  it('5. Skips percentage flags for classes with fewer than 5 students', () => {
    // Class with 4 students (small class rule)
    const smallClass = {
      className: '11 Small',
      totalStudents: 4,
      studentsWithResults: 2, // 50% no mock result
      averageGrade: 8.0,
      distanceBands: { threeOrMoreAway: 4 }, // 40% of cohort's 10
      pctSenSupport: 50.0,
      pctDisadvantaged: 50.0,
      students: []
    };

    const cohort = {
      className: 'Cohort',
      totalStudents: 20,
      studentsWithResults: 15,
      averageGrade: 5.0,
      distanceBands: { threeOrMoreAway: 10 },
      pctSenSupport: 10.0,
      pctDisadvantaged: 10.0
    };

    const res = calculateBalanceFlags([smallClass], cohort);
    expect(res.flags).toHaveLength(0);
    expect(res.hasFlags).toBe(false);
  });

  it('6. Empty state when no flags fire', () => {
    const balancedClass = {
      className: '11 Sp1',
      totalStudents: 20,
      studentsWithResults: 20,
      averageGrade: 5.2, // diff 0.2 <= 0.75
      distanceBands: { threeOrMoreAway: 1 }, // 10% <= 30%
      pctSenSupport: 12.0, // gap 2 pts <= 10
      pctDisadvantaged: 15.0, // gap 5 pts <= 10
      students: []
    };

    const cohort = {
      className: 'Cohort',
      totalStudents: 20,
      studentsWithResults: 20,
      averageGrade: 5.0,
      distanceBands: { threeOrMoreAway: 10 },
      pctSenSupport: 10.0,
      pctDisadvantaged: 10.0
    };

    const res = calculateBalanceFlags([balancedClass], cohort);
    expect(res.flags).toHaveLength(0);
    expect(res.hasFlags).toBe(false);
  });
});
