/**
 * Movement and Class Balance Pure Statistics Module
 * 
 * Rules:
 * - Pure calculations only. No DOM, no browser storage, no network.
 * - Students with no mock result count in class sizes but never in grade statistics.
 * - Skip percentage flags for classes with fewer than 5 students.
 */

export const DEFAULT_MOVEMENT_THRESHOLDS = {
  gradeGap: 0.75,                // Class avg grade gap vs cohort (default 0.75)
  threeOrMoreConcentration: 30,  // % of cohort's 3+ away students held by class (default 30%)
  senGap: 10,                    // SEN Support share gap vs cohort in percentage points (default 10)
  disadvantagedGap: 10,          // Disadvantaged share gap vs cohort in percentage points (default 10)
  noMockRate: 15                 // % of class with no mock result (default 15%)
};

/**
 * Natural sort helper for class names (e.g. 10 Sp1, 10 Sp2, 10 Sp10)
 */
export function compareClassNames(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Calculate the Movement Matrix
 *
 * Rows: Current classes (e.g. 10 Sp1 to 10 Sp6)
 * Columns: New classes (e.g. 11 Sp1 to 11 Sp6)
 * Extra Column: "Not in a new class"
 * Extra Row: "New to the cohort (no mock result)"
 *
 * @param {Array<Object>} allRecords - Snapshot records
 * @param {Object} classListsData - Parsed class lists data { matchedPairs, inSnapshotNotInNewClass, inNewClassesNoMockResult, allNewClassStudents }
 * @returns {Object} Matrix data structure
 */
export function calculateMovementMatrix(allRecords = [], classListsData = null) {
  if (!classListsData) {
    return null;
  }

  const inSnapshotNotInNew = classListsData.inSnapshotNotInNewClass || [];
  const inNewClassesNoMock = classListsData.inNewClassesNoMockResult || [];

  // Extract distinct Current Classes (from all snapshot records)
  const currentClassSet = new Set();
  allRecords.forEach(r => {
    const c = r.className || r.currentClassName;
    if (c) currentClassSet.add(c);
  });
  const currentClasses = Array.from(currentClassSet).sort(compareClassNames);

  // Extract distinct New Classes (from new class students)
  const newClassSet = new Set();
  (classListsData.allNewClassStudents || []).forEach(s => {
    if (s.className) newClassSet.add(s.className);
  });
  // Also check any newClassName on matched snapshot or inNewClassesNoMock
  allRecords.forEach(r => {
    if (r.hasNewClass && r.newClassName) newClassSet.add(r.newClassName);
  });
  inNewClassesNoMock.forEach(s => {
    if (s.newClassName) newClassSet.add(s.newClassName);
  });
  const newClasses = Array.from(newClassSet).sort(compareClassNames);

  // Initialize Matrix grid: grid[currentClass][newClass] = []
  const grid = {};
  currentClasses.forEach(cur => {
    grid[cur] = {};
    newClasses.forEach(nw => {
      grid[cur][nw] = [];
    });
  });

  // Populate matched students
  let totalMatched = 0;
  allRecords.forEach(r => {
    if (r.hasNewClass && r.newClassName) {
      const cur = r.className || r.currentClassName;
      const nw = r.newClassName;
      if (grid[cur] && grid[cur][nw]) {
        grid[cur][nw].push(r);
        totalMatched++;
      }
    }
  });

  // "Not in a new class" mapping by current class
  const notInNewByCurrent = {};
  currentClasses.forEach(cur => {
    notInNewByCurrent[cur] = [];
  });
  inSnapshotNotInNew.forEach(r => {
    const cur = r.className || r.currentClassName;
    if (notInNewByCurrent[cur]) {
      notInNewByCurrent[cur].push(r);
    }
  });

  // "New to the cohort (no mock result)" mapping by new class
  const newToCohortByNew = {};
  newClasses.forEach(nw => {
    newToCohortByNew[nw] = [];
  });
  inNewClassesNoMock.forEach(s => {
    const nw = s.newClassName || s.className;
    if (newToCohortByNew[nw]) {
      newToCohortByNew[nw].push(s);
    }
  });

  // Row totals
  const rowTotals = {};
  currentClasses.forEach(cur => {
    let sum = 0;
    newClasses.forEach(nw => {
      sum += grid[cur][nw].length;
    });
    sum += notInNewByCurrent[cur].length;
    rowTotals[cur] = sum;
  });
  const newToCohortRowTotal = inNewClassesNoMock.length;

  // Column totals
  const colTotals = {};
  newClasses.forEach(nw => {
    let sum = 0;
    currentClasses.forEach(cur => {
      sum += grid[cur][nw].length;
    });
    sum += newToCohortByNew[nw].length;
    colTotals[nw] = sum;
  });
  const notInNewColTotal = inSnapshotNotInNew.length;

  const grandTotal = totalMatched + inSnapshotNotInNew.length + inNewClassesNoMock.length;

  // Find max cell count for shading scale
  let maxCellCount = 1;
  currentClasses.forEach(cur => {
    newClasses.forEach(nw => {
      if (grid[cur][nw].length > maxCellCount) {
        maxCellCount = grid[cur][nw].length;
      }
    });
    if (notInNewByCurrent[cur].length > maxCellCount) {
      maxCellCount = notInNewByCurrent[cur].length;
    }
  });
  newClasses.forEach(nw => {
    if (newToCohortByNew[nw].length > maxCellCount) {
      maxCellCount = newToCohortByNew[nw].length;
    }
  });

  return {
    currentClasses,
    newClasses,
    grid,
    notInNewByCurrent,
    newToCohortByNew,
    rowTotals,
    colTotals,
    newToCohortRowTotal,
    notInNewColTotal,
    totalMatched,
    totalNotInNewClass: inSnapshotNotInNew.length,
    totalNewToCohort: inNewClassesNoMock.length,
    grandTotal,
    maxCellCount
  };
}

/**
 * Determine distance from Grade 5 band for a numeric grade points value
 */
export function getDistanceBand(points, isNotSat = false) {
  if (isNotSat || points === null || points === undefined) return 'not_sat';
  const num = typeof points === 'number' ? points : parseFloat(points);
  if (isNaN(num)) return 'not_sat';
  if (num >= 5) return 'at_or_above_5';
  if (num === 4) return 'one_away';
  if (num === 3) return 'two_away';
  return 'three_or_more_away';
}

/**
 * Calculate New Class Profile statistics
 *
 * For each new class:
 * - students, students with a mock result (shown as "results for X of Y")
 * - average grade and % grade 5+ (students with results only)
 * - count in each distance from grade 5 band (at or above 5, one away, two away, three or more away)
 * - % SEN Support, % disadvantaged, % EAL
 * - prior attainment mix: High, Middle, Low, No KS2 data (counts)
 * - a cohort row at the bottom
 *
 * @param {Array<Object>} allRecords - Snapshot records
 * @param {Object} classListsData - Class lists data
 * @returns {{ classProfiles: Array<Object>, cohortProfile: Object }}
 */
export function calculateNewClassProfiles(allRecords = [], classListsData = null) {
  if (!classListsData) {
    return { classProfiles: [], cohortProfile: null };
  }

  const inNewClassesNoMock = classListsData.inNewClassesNoMockResult || [];

  // Group all students assigned to each new class
  const classStudentsMap = new Map();

  // Matched snapshot students
  allRecords.forEach(r => {
    if (r.hasNewClass && r.newClassName) {
      const cls = r.newClassName;
      if (!classStudentsMap.has(cls)) classStudentsMap.set(cls, []);
      classStudentsMap.get(cls).push(r);
    }
  });

  // Students in new classes with no mock result
  inNewClassesNoMock.forEach(s => {
    const cls = s.newClassName || s.className;
    if (cls) {
      if (!classStudentsMap.has(cls)) classStudentsMap.set(cls, []);
      classStudentsMap.get(cls).push(s);
    }
  });

  const sortedClassNames = Array.from(classStudentsMap.keys()).sort(compareClassNames);

  const buildProfile = (className, students) => {
    const totalStudents = students.length;

    // Students with valid mock result
    const withResults = students.filter(s => {
      if (s.isNotSat) return false;
      const pt = s.points !== undefined && s.points !== null ? s.points : s.result;
      const num = typeof pt === 'number' ? pt : parseFloat(pt);
      return !isNaN(num);
    });

    const studentsWithResults = withResults.length;
    const resultRatioText = `results for ${studentsWithResults} of ${totalStudents}`;

    // Average grade (students with results only)
    let averageGrade = null;
    let pctGrade5Plus = null;
    if (studentsWithResults > 0) {
      const sumPts = withResults.reduce((sum, s) => {
        const pt = typeof s.points === 'number' ? s.points : parseFloat(s.points || s.result || 0);
        return sum + pt;
      }, 0);
      averageGrade = Math.round((sumPts / studentsWithResults) * 100) / 100;

      const grade5PlusCount = withResults.filter(s => {
        const pt = typeof s.points === 'number' ? s.points : parseFloat(s.points || s.result || 0);
        return pt >= 5;
      }).length;
      pctGrade5Plus = Math.round((grade5PlusCount / studentsWithResults) * 1000) / 10;
    }

    // Distance bands (students with results only)
    const distanceBands = {
      atOrAbove5: 0,
      oneAway: 0,
      twoAway: 0,
      threeOrMoreAway: 0
    };

    withResults.forEach(s => {
      const pt = typeof s.points === 'number' ? s.points : parseFloat(s.points || s.result || 0);
      const band = getDistanceBand(pt, false);
      if (band === 'at_or_above_5') distanceBands.atOrAbove5++;
      else if (band === 'one_away') distanceBands.oneAway++;
      else if (band === 'two_away') distanceBands.twoAway++;
      else if (band === 'three_or_more_away') distanceBands.threeOrMoreAway++;
    });

    // Demographics (% of total students)
    const senSupportCount = students.filter(s => s.sen === 'SEN Support').length;
    const disadvCount = students.filter(s => s.disadvantaged === 'Yes').length;
    const ealCount = students.filter(s => s.eal === 'Yes').length;

    const pctSenSupport = totalStudents > 0 ? Math.round((senSupportCount / totalStudents) * 1000) / 10 : 0;
    const pctDisadvantaged = totalStudents > 0 ? Math.round((disadvCount / totalStudents) * 1000) / 10 : 0;
    const pctEAL = totalStudents > 0 ? Math.round((ealCount / totalStudents) * 1000) / 10 : 0;

    // Prior attainment mix (counts of total students)
    const priorAttainment = {
      high: 0,
      middle: 0,
      low: 0,
      noKs2: 0
    };

    students.forEach(s => {
      const level = s.attainmentLevel;
      if (level === 'High') priorAttainment.high++;
      else if (level === 'Middle') priorAttainment.middle++;
      else if (level === 'Low') priorAttainment.low++;
      else priorAttainment.noKs2++;
    });

    return {
      className,
      totalStudents,
      studentsWithResults,
      resultRatioText,
      averageGrade,
      pctGrade5Plus,
      distanceBands,
      senSupportCount,
      disadvCount,
      ealCount,
      pctSenSupport,
      pctDisadvantaged,
      pctEAL,
      priorAttainment,
      students
    };
  };

  const classProfiles = sortedClassNames.map(cls => buildProfile(cls, classStudentsMap.get(cls)));

  // Cohort Profile across all students in new classes
  const allCohortStudents = [];
  sortedClassNames.forEach(cls => {
    allCohortStudents.push(...classStudentsMap.get(cls));
  });
  const cohortProfile = buildProfile('Cohort', allCohortStudents);

  return {
    classProfiles,
    cohortProfile
  };
}

/**
 * Calculate Balance Flags based on class profiles and cohort benchmarks.
 *
 * Rules:
 * 1. Average grade gap: class average grade is > 0.75 above or below cohort average.
 * 2. 3+ away concentration: class holds > 30% of cohort's students 3+ grades from 5.
 * 3. SEN Support share: > 10 percentage points above cohort share.
 * 4. Disadvantaged share: > 10 percentage points above cohort share.
 * 5. No mock result share: > 15% of class has no mock result.
 *
 * Constraints:
 * - Students with no mock result count in class sizes but never in grade statistics.
 * - Skip percentage flags for classes with fewer than 5 students.
 *
 * @param {Array<Object>} classProfiles - Array of class profile objects
 * @param {Object} cohortProfile - Aggregate cohort profile
 * @param {Object} customThresholds - Optional thresholds override
 * @returns {{ flags: Array<Object>, hasFlags: boolean, count: number }}
 */
export function calculateBalanceFlags(classProfiles = [], cohortProfile = null, customThresholds = {}) {
  const thresholds = {
    ...DEFAULT_MOVEMENT_THRESHOLDS,
    ...customThresholds
  };

  if (!Array.isArray(classProfiles) || classProfiles.length === 0 || !cohortProfile) {
    return { flags: [], hasFlags: false, count: 0 };
  }

  const flags = [];

  classProfiles.forEach(cp => {
    const isSmallClass = cp.totalStudents < 5;

    // 1. Average Grade Gap (> 0.75 above or below cohort)
    // Only applies if class has at least 5 students with mock results
    if (cp.studentsWithResults >= 5 && cp.averageGrade !== null && cohortProfile.averageGrade !== null) {
      const diff = cp.averageGrade - cohortProfile.averageGrade;
      const absDiff = Math.abs(diff);

      if (absDiff > thresholds.gradeGap) {
        if (diff > 0) {
          flags.push({
            ruleNumber: 1,
            type: 'grade_gap_high',
            className: cp.className,
            studentsAffected: cp.studentsWithResults,
            text: `${cp.className} average grade (${cp.averageGrade.toFixed(2)}) is ${diff.toFixed(2)} grades above the cohort average (${cohortProfile.averageGrade.toFixed(2)}).`,
            why: `Why: ${cp.className} average grade (${cp.averageGrade.toFixed(2)}) exceeds cohort by ${diff.toFixed(2)} grades (threshold: ${thresholds.gradeGap}).`,
            students: cp.students.filter(s => s.points !== null && s.points !== undefined && !s.isNotSat)
          });
        } else {
          const gapBelow = Math.abs(diff).toFixed(2);
          flags.push({
            ruleNumber: 1,
            type: 'grade_gap_low',
            className: cp.className,
            studentsAffected: cp.studentsWithResults,
            text: `${cp.className} average grade (${cp.averageGrade.toFixed(2)}) is ${gapBelow} grades below the cohort average (${cohortProfile.averageGrade.toFixed(2)}).`,
            why: `Why: ${cp.className} average grade (${cp.averageGrade.toFixed(2)}) is ${gapBelow} grades below cohort (threshold: ${thresholds.gradeGap}).`,
            students: cp.students.filter(s => s.points !== null && s.points !== undefined && !s.isNotSat)
          });
        }
      }
    }

    // Skip percentage flags for classes with fewer than 5 students
    if (isSmallClass) {
      return;
    }

    // 2. Concentration of 3+ Grades from 5 (> 30% of cohort's 3+ away students)
    const cohortThreeAway = cohortProfile.distanceBands?.threeOrMoreAway || 0;
    const classThreeAway = cp.distanceBands?.threeOrMoreAway || 0;

    if (cohortThreeAway > 0 && classThreeAway > 0) {
      const share = (classThreeAway / cohortThreeAway) * 100;
      if (share > thresholds.threeOrMoreConcentration) {
        flags.push({
          ruleNumber: 2,
          type: 'three_away_concentration',
          className: cp.className,
          studentsAffected: classThreeAway,
          text: `${cp.className} holds ${Math.round(share)}% of the students three or more grades from 5.`,
          why: `Why: ${cp.className} contains ${classThreeAway} of the cohort's ${cohortThreeAway} students who are 3+ grades from Grade 5 (${Math.round(share)}% vs ${thresholds.threeOrMoreConcentration}% threshold).`,
          students: cp.students.filter(s => getDistanceBand(s.points, s.isNotSat) === 'three_or_more_away')
        });
      }
    }

    // 3. SEN Support Share (> 10 percentage points above cohort share)
    const senDiff = cp.pctSenSupport - cohortProfile.pctSenSupport;
    if (senDiff > thresholds.senGap) {
      flags.push({
        ruleNumber: 3,
        type: 'sen_share_high',
        className: cp.className,
        studentsAffected: cp.senSupportCount,
        text: `${cp.className} SEN Support share (${cp.pctSenSupport.toFixed(1)}%) is ${senDiff.toFixed(1)} percentage points above the cohort share (${cohortProfile.pctSenSupport.toFixed(1)}%).`,
        why: `Why: ${cp.className} has ${cp.pctSenSupport.toFixed(1)}% SEN Support vs cohort ${cohortProfile.pctSenSupport.toFixed(1)}% (gap: +${senDiff.toFixed(1)} pts, threshold: ${thresholds.senGap} pts).`,
        students: cp.students.filter(s => s.sen === 'SEN Support')
      });
    }

    // 4. Disadvantaged Share (> 10 percentage points above cohort share)
    const disadvDiff = cp.pctDisadvantaged - cohortProfile.pctDisadvantaged;
    if (disadvDiff > thresholds.disadvantagedGap) {
      flags.push({
        ruleNumber: 4,
        type: 'disadvantaged_share_high',
        className: cp.className,
        studentsAffected: cp.disadvCount,
        text: `${cp.className} disadvantaged share (${cp.pctDisadvantaged.toFixed(1)}%) is ${disadvDiff.toFixed(1)} percentage points above the cohort share (${cohortProfile.pctDisadvantaged.toFixed(1)}%).`,
        why: `Why: ${cp.className} has ${cp.pctDisadvantaged.toFixed(1)}% disadvantaged vs cohort ${cohortProfile.pctDisadvantaged.toFixed(1)}% (gap: +${disadvDiff.toFixed(1)} pts, threshold: ${thresholds.disadvantagedGap} pts).`,
        students: cp.students.filter(s => s.disadvantaged === 'Yes')
      });
    }

    // 5. No Mock Result Share (> 15% of class has no mock result)
    const noMockCount = cp.totalStudents - cp.studentsWithResults;
    if (cp.totalStudents > 0) {
      const noMockRate = (noMockCount / cp.totalStudents) * 100;
      if (noMockRate > thresholds.noMockRate) {
        flags.push({
          ruleNumber: 5,
          type: 'no_mock_rate_high',
          className: cp.className,
          studentsAffected: noMockCount,
          text: `More than 15% of ${cp.className} has no mock result (${Math.round(noMockRate)}%).`,
          why: `Why: ${noMockCount} of ${cp.totalStudents} students in ${cp.className} (${noMockRate.toFixed(1)}%) have no recorded Year 10 mock result (threshold: ${thresholds.noMockRate}%).`,
          students: cp.students.filter(s => s.isNotSat || s.points === null || s.points === undefined)
        });
      }
    }
  });

  return {
    flags,
    hasFlags: flags.length > 0,
    count: flags.length
  };
}
