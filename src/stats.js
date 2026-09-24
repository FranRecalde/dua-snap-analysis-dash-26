/**
 * Class Snapshot Dashboard - Statistics and Data Utility Functions
 */

import { formatDateRange, formatUKDate } from './parser.js';

/**
 * Standard GCSE Grade list for distribution charts and breakdowns
 */
export const GCSE_GRADES = ['U', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Grade color palette for stacked bar chart and tags
 */
export const GRADE_COLORS = {
  'U': '#991b1b',
  '1': '#991b1b',
  '2': '#991b1b',
  '3': '#9a3412',
  '4': '#fbbf24',
  '5': '#d9f99d',
  '6': '#166534',
  '7': '#166534',
  '8': '#14532d',
  '9': '#14532d'
};

/**
 * Extract surname for sorting (handles single names, titles, and compound names)
 */
export function getSurname(fullName) {
  if (!fullName) return '';
  const clean = fullName.trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].toLowerCase();
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Robust Attendance percentage parser (handles "95%", "95.4", "0.95")
 */
export function parseAttendance(val) {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim().replace('%', '');
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  // If decimal representation like 0.945, convert to 94.5
  if (num > 0 && num <= 1) {
    return Math.round(num * 1000) / 10;
  }
  return Math.round(num * 10) / 10;
}

/**
 * Format progress with explicit + sign and 2 decimal places
 */
export function formatProgress(val) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  const prefix = val > 0 ? '+' : '';
  return `${prefix}${val.toFixed(2)}`;
}

/**
 * Format percentage to 1 decimal place
 */
export function formatPct(val) {
  if (val === null || val === undefined || isNaN(val)) return '0.0%';
  return `${val.toFixed(1)}%`;
}

/**
 * Calculate median from an array of numbers
 */
export function calculateMedian(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

/**
 * Compute comprehensive metrics for a cohort or subset of student records
 */
export function calculateMetrics(records) {
  const studentsCount = records.length;
  if (studentsCount === 0) {
    return {
      studentsCount: 0,
      satCount: 0,
      notSatCount: 0,
      averageGrade: null,
      medianGrade: null,
      pct5Plus: 0,
      pct4Plus: 0,
      pct7Plus: 0,
      uCount: 0,
      averageProgress: null,
      progressCount: 0,
      pctSENSupport: 0,
      pctDisadvantaged: 0,
      averageAttendance: null,
      attendanceCount: 0,
      gradeDistribution: { 'U': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 }
    };
  }

  // 1. Sat vs Not Sat
  // A blank result means "not sat": exclude from points averages
  const satRecords = records.filter(r => {
    if (r.isNotSat) return false;
    const pt = r.points !== undefined && r.points !== null ? r.points : r.score;
    return pt !== undefined && pt !== null && !isNaN(parseFloat(pt));
  });
  const satCount = satRecords.length;
  const notSatCount = studentsCount - satCount;

  // 2. Average Grade & Median Grade (Points / Score)
  const validPoints = satRecords.map(r => {
    const val = r.points !== undefined && r.points !== null ? r.points : r.score;
    return typeof val === 'number' ? val : parseFloat(val);
  }).filter(p => typeof p === 'number' && !isNaN(p));
  const pointsSum = validPoints.reduce((acc, p) => acc + p, 0);
  const averageGrade = validPoints.length > 0
    ? Math.round((pointsSum / validPoints.length) * 10) / 10
    : null;
  const medianGrade = calculateMedian(validPoints);

  // 3. Benchmarks (% 5+, % 4+, % 7+)
  // Benchmark percentages are calculated over sat entries
  const count5Plus = satRecords.filter(r => r.points >= 5).length;
  const count4Plus = satRecords.filter(r => r.points >= 4).length;
  const count7Plus = satRecords.filter(r => r.points >= 7).length;

  const pct5Plus = satCount > 0 ? (count5Plus / satCount) * 100 : 0;
  const pct4Plus = satCount > 0 ? (count4Plus / satCount) * 100 : 0;
  const pct7Plus = satCount > 0 ? (count7Plus / satCount) * 100 : 0;

  // 4. U count
  const uCount = records.filter(r => r.isU || r.result === 'U' || (r.points === 0 && !r.isNotSat)).length;

  // 5. Progress (Students with estimate only)
  // An estimate of 0 or blank means missing; progress is also missing.
  const progressRecords = records.filter(r => r.estimate !== null && r.progress !== null && !isNaN(r.progress));
  const progressCount = progressRecords.length;
  const progressSum = progressRecords.reduce((acc, r) => acc + r.progress, 0);
  const averageProgress = progressCount > 0
    ? Math.round((progressSum / progressCount) * 100) / 100
    : null;

  // 6. Demographics: SEN Support & Disadvantaged (calculated over all students in group)
  const countSENSupport = records.filter(r => r.sen === 'SEN Support').length;
  const countDisadvantaged = records.filter(r => r.disadvantaged === 'Yes').length;

  const pctSENSupport = studentsCount > 0 ? (countSENSupport / studentsCount) * 100 : 0;
  const pctDisadvantaged = studentsCount > 0 ? (countDisadvantaged / studentsCount) * 100 : 0;

  // 7. Attendance
  const attendanceValues = records
    .map(r => parseAttendance(r.attendance))
    .filter(a => a !== null && !isNaN(a));
  const attendanceSum = attendanceValues.reduce((acc, a) => acc + a, 0);
  const averageAttendance = attendanceValues.length > 0
    ? Math.round((attendanceSum / attendanceValues.length) * 10) / 10
    : null;

  // 8. Grade Distribution (U, 1 through 9)
  const gradeDistribution = {
    'U': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0
  };

  satRecords.forEach(r => {
    if (r.isU || r.result === 'U') {
      gradeDistribution['U']++;
    } else {
      const p = Math.round(r.points);
      const strP = String(p);
      if (gradeDistribution[strP] !== undefined) {
        gradeDistribution[strP]++;
      }
    }
  });

  return {
    studentsCount,
    satCount,
    notSatCount,
    averageGrade,
    medianGrade,
    pct5Plus,
    pct4Plus,
    pct7Plus,
    uCount,
    averageProgress,
    progressCount,
    pctSENSupport,
    pctDisadvantaged,
    averageAttendance,
    attendanceCount: attendanceValues.length,
    gradeDistribution
  };
}

/**
 * Group records by class and calculate individual class performance metrics
 */
export function calculateClassBreakdown(records) {
  const classMap = new Map();

  records.forEach(r => {
    const clsName = r.className || 'Unassigned';
    if (!classMap.has(clsName)) {
      classMap.set(clsName, {
        className: clsName,
        rawClass: r.rawClass || clsName,
        records: []
      });
    }
    classMap.get(clsName).records.push(r);
  });

  const classes = [];
  for (const [className, group] of classMap.entries()) {
    const metrics = calculateMetrics(group.records);
    classes.push({
      className,
      rawClass: group.rawClass,
      students: metrics.studentsCount,
      satCount: metrics.satCount,
      notSatCount: metrics.notSatCount,
      averageGrade: metrics.averageGrade,
      medianGrade: metrics.medianGrade,
      pct5Plus: metrics.pct5Plus,
      pct4Plus: metrics.pct4Plus,
      pct7Plus: metrics.pct7Plus,
      uCount: metrics.uCount,
      averageProgress: metrics.averageProgress,
      progressCount: metrics.progressCount,
      pctSENSupport: metrics.pctSENSupport,
      pctDisadvantaged: metrics.pctDisadvantaged,
      averageAttendance: metrics.averageAttendance,
      gradeDistribution: metrics.gradeDistribution,
      isSmallGroup: metrics.studentsCount < 10
    });
  }

  return classes;
}

/**
 * Determine highest and lowest values for each column across classes
 */
export function calculateColumnExtremes(classes) {
  if (!classes || classes.length < 2) return {};

  const columns = [
    'students',
    'averageGrade',
    'medianGrade',
    'pct5Plus',
    'pct4Plus',
    'pct7Plus',
    'uCount',
    'averageProgress',
    'pctSENSupport',
    'pctDisadvantaged',
    'averageAttendance'
  ];

  const extremes = {};

  columns.forEach(col => {
    const validVals = classes
      .map(c => c[col])
      .filter(v => typeof v === 'number' && !isNaN(v));

    if (validVals.length >= 2) {
      const maxVal = Math.max(...validVals);
      const minVal = Math.min(...validVals);
      if (maxVal !== minVal) {
        extremes[col] = { max: maxVal, min: minVal };
      }
    }
  });

  return extremes;
}

/**
 * Sort classes based on ranking mode or specific column
 */
export function sortClasses(classes, rankBy = 'average-grade', sortDirection = 'desc') {
  const sorted = [...classes];

  sorted.sort((a, b) => {
    let valA;
    let valB;

    switch (rankBy) {
      case 'average-grade':
      case 'averageGrade':
        valA = a.averageGrade;
        valB = b.averageGrade;
        break;
      case 'pct-5-plus':
      case 'pct5Plus':
        valA = a.pct5Plus;
        valB = b.pct5Plus;
        break;
      case 'avg-progress':
      case 'averageProgress':
        valA = a.averageProgress;
        valB = b.averageProgress;
        break;
      case 'className':
      case 'class':
        return sortDirection === 'asc'
          ? a.className.localeCompare(b.className)
          : b.className.localeCompare(a.className);
      case 'students':
        valA = a.students;
        valB = b.students;
        break;
      case 'medianGrade':
        valA = a.medianGrade;
        valB = b.medianGrade;
        break;
      case 'pct4Plus':
        valA = a.pct4Plus;
        valB = b.pct4Plus;
        break;
      case 'pct7Plus':
        valA = a.pct7Plus;
        valB = b.pct7Plus;
        break;
      case 'uCount':
        valA = a.uCount;
        valB = b.uCount;
        break;
      case 'pctSENSupport':
        valA = a.pctSENSupport;
        valB = b.pctSENSupport;
        break;
      case 'pctDisadvantaged':
        valA = a.pctDisadvantaged;
        valB = b.pctDisadvantaged;
        break;
      case 'averageAttendance':
        valA = a.averageAttendance;
        valB = b.averageAttendance;
        break;
      default:
        valA = a.averageGrade;
        valB = b.averageGrade;
        break;
    }

    // Handle nulls/undefined: push nulls to the bottom
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    if (sortDirection === 'asc') {
      return valA - valB;
    }
    return valB - valA;
  });

  return sorted;
}

/**
 * Filter records by class, cohort, teacher, or other attributes
 */
export function filterRecords(records, filters = {}) {
  const { className, teacherName, subject } = filters;

  return records.filter(r => {
    if (className && className !== 'ALL') {
      const target = String(className).trim().toLowerCase();
      const rClass = String(r.className || r.class || '').trim().toLowerCase();
      if (rClass !== target) return false;
    }
    if (teacherName && teacherName !== 'ALL') {
      const target = String(teacherName).trim().toLowerCase();
      const rTeacher = String(r.teacherName || r.teacher || '').trim().toLowerCase();
      if (rTeacher !== target) return false;
    }
    if (subject && subject !== 'ALL') {
      const target = String(subject).trim().toLowerCase();
      const rSub = String(r.subject || r.department || '').trim().toLowerCase();
      if (rSub !== target) return false;
    }
    return true;
  });
}

/**
 * Legacy computeHeadlines maintained for backwards compatibility
 */
export function computeHeadlines(records) {
  const m = calculateMetrics(records);
  return {
    total: m.studentsCount,
    classesCount: new Set(records.map(r => r.className)).size,
    studentsCount: m.studentsCount,
    averageScore: m.averageGrade || 0,
    dateRangeStr: `${m.studentsCount} entries recorded`
  };
}

/**
 * Build pseudonym maps for privacy / hide names mode
 */
export function buildPseudonymMaps(records) {
  const studentMap = new Map();
  const teacherMap = new Map();

  let studentIndex = 1;
  let teacherIndex = 1;

  records.forEach(r => {
    const student = (r.studentName || r.name || `${r.surname || ''} ${r.firstName || ''}`).trim();
    if (student && !studentMap.has(student.toLowerCase())) {
      studentMap.set(student.toLowerCase(), `Student ${studentIndex++}`);
    }

    const teacher = (r.teacherName || r.teacher || '').trim();
    if (teacher && !teacherMap.has(teacher.toLowerCase())) {
      teacherMap.set(teacher.toLowerCase(), `Teacher ${teacherIndex++}`);
    }
  });

  return { studentMap, teacherMap };
}

/**
 * Generates an executive summary suitable for copying
 */
export function generateAnonymisedSummary(records, metadata = {}) {
  const headlines = calculateMetrics(records);

  return [
    'DIXONS UNITY ACADEMY — CLASS SNAPSHOT SUMMARY',
    '=============================================',
    `Total Students: ${headlines.studentsCount}`,
    `Sat Exam: ${headlines.satCount}`,
    `Average Grade (Points): ${headlines.averageGrade !== null ? headlines.averageGrade : 'N/A'}`,
    `Median Grade: ${headlines.medianGrade !== null ? headlines.medianGrade : 'N/A'}`,
    `% Grade 5+: ${formatPct(headlines.pct5Plus)}`,
    `% Grade 4+: ${formatPct(headlines.pct4Plus)}`,
    `% Grade 7+: ${formatPct(headlines.pct7Plus)}`,
    `U Count: ${headlines.uCount}`,
    `Average Progress: ${formatProgress(headlines.averageProgress)} (n=${headlines.progressCount})`,
    '',
    `Generated on: ${formatUKDate(new Date())}`,
    'Confidential: for Head of Department analysis only.'
  ].filter(Boolean).join('\n');
}

/**
 * Distance from Grade 5 Bands
 */
export const DISTANCE_BANDS = {
  AT_OR_ABOVE_5: {
    key: 'at_or_above_5',
    label: 'At or above 5',
    shortLabel: 'At or above 5',
    description: 'Grade 5 to 9 (Strong Pass threshold met)',
    color: '#2e6930',
    badgeClass: 'band-at-above-5'
  },
  ONE_GRADE_AWAY: {
    key: 'one_grade_away',
    label: 'One grade away (grade 4)',
    shortLabel: 'One grade away',
    description: 'Grade 4 (1 grade from Grade 5)',
    color: '#eab308',
    badgeClass: 'band-one-away'
  },
  TWO_GRADES_AWAY: {
    key: 'two_grades_away',
    label: 'Two grades away (grade 3)',
    shortLabel: 'Two grades away',
    description: 'Grade 3 (2 grades from Grade 5)',
    color: '#f59e0b',
    badgeClass: 'band-two-away'
  },
  THREE_OR_MORE_AWAY: {
    key: 'three_or_more_away',
    label: 'Three or more away (grade 2, 1 or U)',
    shortLabel: 'Three or more away',
    description: 'Grade 2, 1 or U (3+ grades from Grade 5)',
    color: '#dc2626',
    badgeClass: 'band-three-plus-away'
  }
};

/**
 * Calculate student gap from grade 5.
 * gap = 5 - points (U counts as 0). Students at 5 or above have gap 0.
 * Blank/Not sat returns null.
 */
export function calculateStudentGap(points, isNotSat = false) {
  if (isNotSat || points === null || points === undefined) return null;
  const num = typeof points === 'number' ? points : parseFloat(points);
  if (isNaN(num)) return null;
  if (num >= 5) return 0;
  return Math.round((5 - num) * 10) / 10;
}

/**
 * Determine student distance band
 */
export function calculateDistanceBand(points, isNotSat = false) {
  if (isNotSat || points === null || points === undefined) return 'not_sat';
  const num = typeof points === 'number' ? points : parseFloat(points);
  if (isNaN(num)) return 'not_sat';
  if (num >= 5) return 'at_or_above_5';
  if (num === 4) return 'one_grade_away';
  if (num === 3) return 'two_grades_away';
  return 'three_or_more_away';
}

/**
 * Calculate distance metrics across an array of student records
 */
export function calculateDistanceMetrics(records) {
  const totalStudents = records.length;
  const satRecords = records.filter(r => {
    if (r.isNotSat) return false;
    const pt = r.points !== undefined && r.points !== null ? r.points : r.result;
    const num = typeof pt === 'number' ? pt : parseFloat(pt);
    return !isNaN(num);
  });
  const satCount = satRecords.length;
  const notSatCount = totalStudents - satCount;

  let countAtOrAbove5 = 0;
  let countOneAway = 0;
  let countTwoAway = 0;
  let countThreeOrMoreAway = 0;

  const below5Gaps = [];

  satRecords.forEach(r => {
    const pt = typeof r.points === 'number' ? r.points : parseFloat(r.points);
    if (pt >= 5) {
      countAtOrAbove5++;
    } else {
      const gap = 5 - pt;
      below5Gaps.push(gap);
      if (pt === 4) {
        countOneAway++;
      } else if (pt === 3) {
        countTwoAway++;
      } else {
        countThreeOrMoreAway++;
      }
    }
  });

  const below5Count = below5Gaps.length;
  const below5GapSum = below5Gaps.reduce((acc, g) => acc + g, 0);
  const averageGapBelow5 = below5Count > 0
    ? Math.round((below5GapSum / below5Count) * 100) / 100
    : null;

  const pct = count => satCount > 0 ? Math.round((count / satCount) * 1000) / 10 : 0;

  return {
    totalStudents,
    satCount,
    notSatCount,
    countAtOrAbove5,
    pctAtOrAbove5: pct(countAtOrAbove5),
    countOneAway,
    pctOneAway: pct(countOneAway),
    countTwoAway,
    pctTwoAway: pct(countTwoAway),
    countThreeOrMoreAway,
    pctThreeOrMoreAway: pct(countThreeOrMoreAway),
    below5Count,
    averageGapBelow5
  };
}

/**
 * Calculate distance breakdown by class with highest average gap highlighted
 */
export function calculateDistanceBreakdownByClass(records) {
  const classGroups = new Map();

  records.forEach(r => {
    const cName = r.className || 'Unknown Class';
    if (!classGroups.has(cName)) {
      classGroups.set(cName, {
        className: cName,
        rawClass: r.rawClass || cName,
        records: []
      });
    }
    classGroups.get(cName).records.push(r);
  });

  const cohort = calculateDistanceMetrics(records);
  const classes = [];

  classGroups.forEach((group, cName) => {
    const metrics = calculateDistanceMetrics(group.records);
    classes.push({
      className: cName,
      rawClass: group.rawClass,
      isSmallGroup: group.records.length < 10,
      studentsCount: group.records.length,
      ...metrics,
      isHighestAvgGap: false
    });
  });

  // Find class with highest average gap among those with below5Count > 0
  let maxGap = -1;
  classes.forEach(c => {
    if (c.below5Count > 0 && c.averageGapBelow5 !== null && c.averageGapBelow5 > maxGap) {
      maxGap = c.averageGapBelow5;
    }
  });

  if (maxGap > -1) {
    classes.forEach(c => {
      if (c.below5Count > 0 && c.averageGapBelow5 === maxGap) {
        c.isHighestAvgGap = true;
      }
    });
  }

  // Sort classes alphabetically
  classes.sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));

  return { classes, cohort };
}

/**
 * Filter records for the Distance from Grade 5 section
 */
export function filterDistanceRecords(records, { className, sen, disadvantaged, band } = {}) {
  return records.filter(r => {
    // 1. Class filter
    if (className && className !== 'ALL') {
      const cTarget = String(className).trim().toLowerCase();
      const rClass = String(r.className || '').trim().toLowerCase();
      if (rClass !== cTarget) return false;
    }

    // 2. SEN filter
    if (sen && sen !== 'ALL') {
      const sTarget = String(sen).trim().toLowerCase();
      const rSEN = String(r.sen || 'no sen').trim().toLowerCase();

      if (sTarget === 'all_sen' || sTarget === 'all sen') {
        if (rSEN === 'no sen' || rSEN === '') return false;
      } else if (rSEN !== sTarget) {
        return false;
      }
    }

    // 3. Disadvantaged filter
    if (disadvantaged && disadvantaged !== 'ALL') {
      const dTarget = String(disadvantaged).trim().toLowerCase();
      const rDis = String(r.disadvantaged || 'no').trim().toLowerCase();
      if (dTarget === 'yes' || dTarget === 'disadvantaged') {
        if (rDis !== 'yes') return false;
      } else if (dTarget === 'no' || dTarget === 'not disadvantaged') {
        if (rDis !== 'no') return false;
      }
    }

    // 4. Band filter
    if (band && band !== 'ALL') {
      const rBand = calculateDistanceBand(r.points, r.isNotSat);
      if (rBand !== band) return false;
    }

    return true;
  });
}

/**
 * Farthest from grade 5:
 * Student list sorted by gap descending (largest gap first).
 */
export function getFarthestFromGrade5(records) {
  const satStudents = records
    .filter(r => !r.isNotSat && r.points !== null && r.points !== undefined && !isNaN(r.points))
    .map(r => {
      const gap = calculateStudentGap(r.points, r.isNotSat);
      const band = calculateDistanceBand(r.points, r.isNotSat);
      return {
        ...r,
        gap,
        band
      };
    });

  return satStudents.sort((a, b) => {
    // Largest gap first
    if (b.gap !== a.gap) return b.gap - a.gap;
    // Tie-break: by surname then first name
    const sDiff = (a.surname || '').localeCompare(b.surname || '');
    if (sDiff !== 0) return sDiff;
    return (a.firstName || '').localeCompare(b.firstName || '');
  });
}

/** Every active class, with all students at least two grades below grade 5. */
export function getFarthestFromGrade5ByClass(records) {
  const classNames = [...new Set(records.map(record => record.className || 'Unassigned'))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const farthest = getFarthestFromGrade5(records).filter(student => student.gap >= 2);
  return classNames.map(className => ({
    className,
    students: farthest.filter(student => (student.className || 'Unassigned') === className)
  }));
}

/**
 * Closest to grade 5:
 * All grade 4 students, grouped by class.
 */
export function getClosestToGrade5ByClass(records) {
  const grade4Students = records
    .filter(r => !r.isNotSat && r.points === 4)
    .map(r => ({
      ...r,
      gap: 1,
      band: 'one_grade_away'
    }));

  const grouped = {};
  grade4Students.forEach(r => {
    const cName = r.className || 'Unknown Class';
    if (!grouped[cName]) {
      grouped[cName] = [];
    }
    grouped[cName].push(r);
  });

  // Sort students within each class by surname
  Object.keys(grouped).forEach(cName => {
    grouped[cName].sort((a, b) => {
      const sDiff = (a.surname || '').localeCompare(b.surname || '');
      if (sDiff !== 0) return sDiff;
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
  });

  return grouped;
}

/**
 * Estimate says 5+, result below 5:
 * Students whose estimate is 5 or more but whose result is below 5,
 * sorted by the size of the shortfall (estimate - points descending).
 */
export function getEstimate5PlusShortfall(records) {
  const eligible = records.filter(r => {
    if (r.isNotSat) return false;
    if (r.estimate === null || r.estimate === undefined || isNaN(r.estimate)) return false;
    if (r.estimate < 5.0) return false;
    if (r.points === null || r.points === undefined || isNaN(r.points)) return false;
    return r.points < 5;
  });

  const withShortfall = eligible.map(r => {
    const shortfall = Math.round((r.estimate - r.points) * 10) / 10;
    const gap = 5 - r.points;
    const band = calculateDistanceBand(r.points, r.isNotSat);
    return {
      ...r,
      shortfall,
      gap,
      band
    };
  });

  return withShortfall.sort((a, b) => {
    // Largest shortfall first
    if (b.shortfall !== a.shortfall) return b.shortfall - a.shortfall;
    // Tie-break by surname
    const sDiff = (a.surname || '').localeCompare(b.surname || '');
    if (sDiff !== 0) return sDiff;
    return (a.firstName || '').localeCompare(b.firstName || '');
  });
}

/**
 * -------------------------------------------------------------
 * SECTION: Student Groups & Top Performers Analytics
 * -------------------------------------------------------------
 */

/**
 * Compute key group metrics (students, average grade, % 5+, average progress with n, and gaps vs rest)
 */
export function calculateGroupMetrics(groupRecords, allRecords = groupRecords) {
  const studentsCount = groupRecords.length;
  const isSmallGroup = studentsCount < 5;

  if (studentsCount === 0) {
    return {
      studentsCount: 0,
      satCount: 0,
      averageGrade: null,
      pct5Plus: 0,
      averageProgress: null,
      progressCount: 0,
      gradeGap: null,
      progressGap: null,
      pct5PlusGap: null,
      tooFew: true
    };
  }

  const satRecords = groupRecords.filter(r => !r.isNotSat && r.points !== null && !isNaN(r.points));
  const satCount = satRecords.length;

  const validPoints = satRecords.map(r => r.points);
  const averageGrade = validPoints.length > 0
    ? Math.round((validPoints.reduce((a, b) => a + b, 0) / validPoints.length) * 10) / 10
    : null;

  const count5Plus = satRecords.filter(r => r.points >= 5).length;
  const pct5Plus = satCount > 0 ? (count5Plus / satCount) * 100 : 0;

  const progressRecords = groupRecords.filter(r => r.estimate !== null && r.progress !== null && !isNaN(r.progress));
  const progressCount = progressRecords.length;
  const averageProgress = progressCount > 0
    ? Math.round((progressRecords.reduce((a, r) => a + r.progress, 0) / progressCount) * 100) / 100
    : null;

  // Rest of cohort / context (excluding this group)
  const groupIds = new Set(groupRecords.map(r => r.id || r.studentKey));
  const restRecords = allRecords.filter(r => !groupIds.has(r.id || r.studentKey));

  let gradeGap = null;
  let progressGap = null;
  let pct5PlusGap = null;

  if (restRecords.length > 0) {
    const restSat = restRecords.filter(r => !r.isNotSat && r.points !== null && !isNaN(r.points));
    if (restSat.length > 0 && averageGrade !== null) {
      const restAvgGrade = restSat.reduce((a, b) => a + b.points, 0) / restSat.length;
      gradeGap = Math.round((averageGrade - restAvgGrade) * 10) / 10;
    }

    const restProgress = restRecords.filter(r => r.estimate !== null && r.progress !== null && !isNaN(r.progress));
    if (restProgress.length > 0 && averageProgress !== null) {
      const restAvgProg = restProgress.reduce((a, r) => a + r.progress, 0) / restProgress.length;
      progressGap = Math.round((averageProgress - restAvgProg) * 100) / 100;
    }

    if (restSat.length > 0 && satCount > 0) {
      const restCount5Plus = restSat.filter(r => r.points >= 5).length;
      const restPct5Plus = (restCount5Plus / restSat.length) * 100;
      pct5PlusGap = Math.round((pct5Plus - restPct5Plus) * 10) / 10;
    }
  }

  return {
    studentsCount,
    satCount,
    averageGrade,
    pct5Plus,
    averageProgress,
    progressCount,
    gradeGap,
    progressGap,
    pct5PlusGap,
    tooFew: isSmallGroup
  };
}

/**
 * Standard group definitions:
 * - SEN Support vs no SEN, EHCP (only if present)
 * - Disadvantaged vs not
 * - Female vs male
 * - Prior attainment (High, Middle, Low, No KS2 data)
 * - Attendance band (below 90%, 90 to 95%, 95% and above)
 */
export function calculateStudentGroupsBreakdown(records, restContext = records, options = {}) {
  const hasEHCP = records.some(r => r.sen === 'EHCP');
  const includeEAL = options.includeEAL ?? records.some(r => r.eal !== undefined && r.eal !== null);

  const categories = [
    {
      category: 'SEN Status',
      groups: [
        {
          name: 'SEN Support',
          filter: r => r.sen === 'SEN Support'
        },
        {
          name: 'No SEN',
          filter: r => r.sen === 'No SEN'
        },
        ...(hasEHCP ? [{
          name: 'EHCP',
          filter: r => r.sen === 'EHCP'
        }] : [])
      ]
    },
    ...(includeEAL ? [{
      category: 'EAL',
      groups: [
        {
          name: 'EAL',
          filter: r => r.eal === 'Yes'
        },
        {
          name: 'Not EAL',
          filter: r => r.eal === 'No' || !r.eal
        }
      ]
    }] : []),
    {
      category: 'Disadvantage',
      groups: [
        {
          name: 'Disadvantaged',
          filter: r => r.disadvantaged === 'Yes'
        },
        {
          name: 'Not disadvantaged',
          filter: r => r.disadvantaged === 'No'
        }
      ]
    },
    {
      category: 'Gender',
      groups: [
        {
          name: 'Female',
          filter: r => {
            const s = (r.sex || '').trim().toLowerCase();
            return s === 'female' || s === 'f';
          }
        },
        {
          name: 'Male',
          filter: r => {
            const s = (r.sex || '').trim().toLowerCase();
            return s === 'male' || s === 'm';
          }
        }
      ]
    },
    {
      category: 'Prior Attainment',
      groups: [
        {
          name: 'High',
          filter: r => r.attainmentLevel === 'High'
        },
        {
          name: 'Middle',
          filter: r => r.attainmentLevel === 'Middle'
        },
        {
          name: 'Low',
          filter: r => r.attainmentLevel === 'Low'
        },
        {
          name: 'No KS2 data',
          filter: r => r.attainmentLevel === 'No KS2 data' || !r.attainmentLevel
        }
      ]
    },
    {
      category: 'Attendance Band',
      groups: [
        {
          name: 'Below 90%',
          filter: r => {
            const a = parseAttendance(r.attendance);
            return a !== null && a < 90;
          }
        },
        {
          name: '90 to 95%',
          filter: r => {
            const a = parseAttendance(r.attendance);
            return a !== null && a >= 90 && a < 95;
          }
        },
        {
          name: '95% and above',
          filter: r => {
            const a = parseAttendance(r.attendance);
            return a !== null && a >= 95;
          }
        }
      ]
    }
  ];

  return categories.map(cat => {
    const evaluatedGroups = cat.groups.map(grp => {
      const matchingRecords = records.filter(grp.filter);
      const metrics = calculateGroupMetrics(matchingRecords, restContext);
      return {
        name: grp.name,
        ...metrics
      };
    });

    return {
      category: cat.category,
      groups: evaluatedGroups
    };
  });
}

/**
 * Breakdown per class for expandable tables
 */
export function calculateGroupBreakdownPerClass(records, options = {}) {
  const classMap = new Map();
  records.forEach(r => {
    const cName = r.className || 'Unknown Class';
    if (!classMap.has(cName)) classMap.set(cName, []);
    classMap.get(cName).push(r);
  });

  const sortedClassNames = Array.from(classMap.keys())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return sortedClassNames.map(className => {
    const classRecords = classMap.get(className);
    const rawClass = classRecords[0]?.rawClass || className;
    const breakdown = calculateStudentGroupsBreakdown(classRecords, records, options);

    return {
      className,
      rawClass,
      studentsCount: classRecords.length,
      breakdown
    };
  });
}

/**
 * Top Performers per Class:
 * 1. Top 5 by points (tie-break: higher progress, then surname/firstName)
 * 2. 5 biggest positive progress scores (students with an estimate only)
 * 3. 5 biggest negative progress scores (students with an estimate only)
 */
export function getTopPerformersByClass(records) {
  const classMap = new Map();
  records.forEach(r => {
    const cName = r.className || 'Unknown Class';
    if (!classMap.has(cName)) classMap.set(cName, []);
    classMap.get(cName).push(r);
  });

  const sortedClassNames = Array.from(classMap.keys())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const result = {};

  sortedClassNames.forEach(className => {
    const classRecords = classMap.get(className);

    // 1. Top 5 by points
    const satStudents = classRecords.filter(r => !r.isNotSat && r.points !== null && !isNaN(r.points));
    const sortedByPoints = [...satStudents].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const aProg = (a.progress !== null && !isNaN(a.progress)) ? a.progress : -999;
      const bProg = (b.progress !== null && !isNaN(b.progress)) ? b.progress : -999;
      if (bProg !== aProg) return bProg - aProg;
      const sDiff = (a.surname || '').localeCompare(b.surname || '');
      if (sDiff !== 0) return sDiff;
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
    const topPoints = sortedByPoints.slice(0, 5);

    // 2. 5 biggest positive progress scores (estimate only, progress > 0)
    const withEstimate = classRecords.filter(r => !r.isNotSat && r.estimate !== null && r.progress !== null && !isNaN(r.progress));
    const positiveProgress = withEstimate
      .filter(r => r.progress > 0)
      .sort((a, b) => {
        if (b.progress !== a.progress) return b.progress - a.progress;
        const sDiff = (a.surname || '').localeCompare(b.surname || '');
        if (sDiff !== 0) return sDiff;
        return (a.firstName || '').localeCompare(b.firstName || '');
      })
      .slice(0, 5);

    // 3. 5 biggest negative progress scores (estimate only, progress < 0)
    const negativeProgress = withEstimate
      .filter(r => r.progress < 0)
      .sort((a, b) => {
        if (a.progress !== b.progress) return a.progress - b.progress; // Most negative first
        const sDiff = (a.surname || '').localeCompare(b.surname || '');
        if (sDiff !== 0) return sDiff;
        return (a.firstName || '').localeCompare(b.firstName || '');
      })
      .slice(0, 5);

    result[className] = {
      className,
      rawClass: classRecords[0]?.rawClass || className,
      totalStudents: classRecords.length,
      satCount: satStudents.length,
      topPoints,
      positiveProgress,
      negativeProgress
    };
  });

  return result;
}


