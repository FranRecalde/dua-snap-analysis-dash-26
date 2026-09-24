/**
 * Pure Suggested Actions Engine
 * Rule-based interventions combining Mock Assessment, Class Balance, and QLA targets.
 * 
 * Rules:
 * - Pure calculations only. No DOM, no browser storage, no network.
 * - Rule-based only. No AI.
 * - Each action names the class (following the existing view switch) and the number of students affected.
 * - Each action has a source tag: "Mock", "Class balance" or "QLA".
 * - Skip any class or group with fewer than 5 students.
 * - Reuses balance flag functions from src/movementStats.js.
 * - Imports QLA actions from src/qlaActions.js.
 */

import { generateQlaActions } from './qlaActions.js';
import {
  calculateBalanceFlags,
  calculateNewClassProfiles
} from './movementStats.js';
import { calculateDistanceBand } from './stats.js';

export const DEFAULT_SUGGESTED_ACTION_THRESHOLDS = {
  disadvantagedGap: 0.5,        // Rule 4: Disadvantaged gap in grades (default 0.5)
  attendanceThreshold: 90,      // Rule 6: Low attendance % threshold (default 90%)
  progressThreshold: -1.0,      // Rule 7: Negative progress threshold (default -1.0)
  topPrioritiesCount: 5         // Number of top priorities to show (default 5)
};

/**
 * Natural sort helper for class names
 */
function compareClassNames(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Generates all Mock Assessment Actions (Rules 1 to 7)
 *
 * @param {Array<Object>} records - Active student records (pre-mapped to activeGrouping)
 * @param {Object} thresholds - Custom thresholds
 * @returns {Array<Object>} Array of Mock action objects
 */
export function generateMockActions(records = [], thresholds = DEFAULT_SUGGESTED_ACTION_THRESHOLDS) {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const actions = [];
  const t = { ...DEFAULT_SUGGESTED_ACTION_THRESHOLDS, ...thresholds };

  // Group records by class (using className or activeClass)
  const classMap = new Map();
  for (const r of records) {
    const cls = r.className || r.activeClass || 'Unassigned';
    if (!classMap.has(cls)) {
      classMap.set(cls, []);
    }
    classMap.get(cls).push(r);
  }

  const sortedClassNames = [...classMap.keys()].sort(compareClassNames);

  // =========================================================================
  // RULE 1: The class with the most students three or more grades from 5
  // Text: "Priority support group: [class], [n] students three or more grades from 5."
  // =========================================================================
  let maxThreeAwayClass = null;
  let maxThreeAwayCount = 0;
  let maxThreeAwayStudents = [];

  for (const cls of sortedClassNames) {
    const classRecords = classMap.get(cls);
    if (classRecords.length < 5) continue; // Skip class < 5 students

    const threeAway = classRecords.filter(r => calculateDistanceBand(r.points, r.isNotSat) === 'three_or_more_away');
    if (threeAway.length > maxThreeAwayCount) {
      maxThreeAwayCount = threeAway.length;
      maxThreeAwayClass = cls;
      maxThreeAwayStudents = threeAway;
    }
  }

  if (maxThreeAwayClass && maxThreeAwayCount > 0) {
    actions.push({
      id: `mock_rule_1_${maxThreeAwayClass}`,
      source: 'Mock',
      ruleNumber: 1,
      ruleName: 'Priority support group',
      ruleKey: 'Mock_1',
      className: maxThreeAwayClass,
      studentsAffected: maxThreeAwayCount,
      title: `Priority support group: ${maxThreeAwayClass}, ${maxThreeAwayCount} student${maxThreeAwayCount === 1 ? '' : 's'} three or more grades from 5.`,
      why: `Why: ${maxThreeAwayClass} has ${maxThreeAwayCount} students three or more grades from 5, highest in cohort.`,
      students: maxThreeAwayStudents
    });
  }

  // =========================================================================
  // RULE 2: Grade 4 students by class
  // Text: "Closest to grade 5: [n] grade 4s in [class]. Targeted exam practice."
  // =========================================================================
  for (const cls of sortedClassNames) {
    const classRecords = classMap.get(cls);
    if (classRecords.length < 5) continue;

    const grade4s = classRecords.filter(r => calculateDistanceBand(r.points, r.isNotSat) === 'one_grade_away');
    if (grade4s.length > 0) {
      actions.push({
        id: `mock_rule_2_${cls}`,
        source: 'Mock',
        ruleNumber: 2,
        ruleName: 'Closest to grade 5',
        ruleKey: 'Mock_2',
        className: cls,
        studentsAffected: grade4s.length,
        title: `Closest to grade 5: ${grade4s.length} grade 4${grade4s.length === 1 ? '' : 's'} in ${cls}. Targeted exam practice.`,
        why: `Why: ${grade4s.length} student${grade4s.length === 1 ? '' : 's'} currently sitting on grade 4, 1 grade from strong pass.`,
        students: grade4s
      });
    }
  }

  // =========================================================================
  // RULE 3: Students with an estimate of grade 5 or above who scored below grade 5
  // Text: "Underperforming against prior attainment: [n] students."
  // Small group rule: Skip if fewer than 5 students
  // =========================================================================
  const underperforming = records.filter(r => {
    if (r.isNotSat || r.points === null || isNaN(r.points)) return false;
    const est = typeof r.estimate === 'number' ? r.estimate : parseFloat(r.estimate);
    return !isNaN(est) && est >= 5.0 && r.points < 5;
  });

  if (underperforming.length >= 5) {
    actions.push({
      id: 'mock_rule_3',
      source: 'Mock',
      ruleNumber: 3,
      ruleName: 'Underperforming against prior attainment',
      ruleKey: 'Mock_3',
      className: 'Cohort',
      studentsAffected: underperforming.length,
      title: `Underperforming against prior attainment: ${underperforming.length} students.`,
      why: `Why: ${underperforming.length} students with prior attainment estimate of grade 5+ scored below grade 5.`,
      students: underperforming
    });
  }

  // =========================================================================
  // RULE 4: Disadvantaged gap
  // In classes where non-disadvantaged students outperform disadvantaged students by more than 0.5 grades:
  // Text: "Disadvantaged gap of [x] grades in [class]."
  // =========================================================================
  for (const cls of sortedClassNames) {
    const classRecords = classMap.get(cls);
    if (classRecords.length < 5) continue;

    const satDisadv = classRecords.filter(r => !r.isNotSat && r.points !== null && !isNaN(r.points) && r.disadvantaged === 'Yes');
    const satNonDisadv = classRecords.filter(r => !r.isNotSat && r.points !== null && !isNaN(r.points) && r.disadvantaged !== 'Yes');

    if (satDisadv.length > 0 && satNonDisadv.length > 0) {
      const avgDisadv = satDisadv.reduce((sum, r) => sum + r.points, 0) / satDisadv.length;
      const avgNonDisadv = satNonDisadv.reduce((sum, r) => sum + r.points, 0) / satNonDisadv.length;
      const gap = avgNonDisadv - avgDisadv;

      if (gap > t.disadvantagedGap) {
        const gapFormatted = gap.toFixed(1);
        actions.push({
          id: `mock_rule_4_${cls}`,
          source: 'Mock',
          ruleNumber: 4,
          ruleName: 'Disadvantaged gap',
          ruleKey: 'Mock_4',
          className: cls,
          studentsAffected: satDisadv.length,
          title: `Disadvantaged gap of ${gapFormatted} grades in ${cls}.`,
          why: `Why: non-disadvantaged students averaged ${avgNonDisadv.toFixed(1)} vs ${avgDisadv.toFixed(1)} for disadvantaged students.`,
          students: satDisadv
        });
      }
    }
  }

  // =========================================================================
  // RULE 5: SEN Support students three or more grades from 5
  // Text: "Check support plans with the SENCo: [n] students."
  // Small group rule: Skip if fewer than 5 students
  // =========================================================================
  const senThreeAway = records.filter(r => {
    return r.sen === 'SEN Support' && calculateDistanceBand(r.points, r.isNotSat) === 'three_or_more_away';
  });

  if (senThreeAway.length >= 5) {
    actions.push({
      id: 'mock_rule_5',
      source: 'Mock',
      ruleNumber: 5,
      ruleName: 'SEN Support support plans',
      ruleKey: 'Mock_5',
      className: 'Cohort',
      studentsAffected: senThreeAway.length,
      title: `Check support plans with the SENCo: ${senThreeAway.length} students.`,
      why: `Why: ${senThreeAway.length} SEN Support students are three or more grades from grade 5.`,
      students: senThreeAway
    });
  }

  // =========================================================================
  // RULE 6: Low attendance
  // Students with attendance below 90% who scored below grade 5:
  // Text: "Attendance and attainment concern: [n] students."
  // Small group rule: Skip if fewer than 5 students
  // =========================================================================
  const attendanceConcern = records.filter(r => {
    const rawAtt = String(r.attendance || '').replace('%', '').trim();
    const att = parseFloat(rawAtt);
    if (isNaN(att) || att >= t.attendanceThreshold) return false;
    // Scored below grade 5 (or not sat)
    return r.isNotSat || r.points === null || isNaN(r.points) || r.points < 5;
  });

  if (attendanceConcern.length >= 5) {
    actions.push({
      id: 'mock_rule_6',
      source: 'Mock',
      ruleNumber: 6,
      ruleName: 'Attendance and attainment concern',
      ruleKey: 'Mock_6',
      className: 'Cohort',
      studentsAffected: attendanceConcern.length,
      title: `Attendance and attainment concern: ${attendanceConcern.length} students.`,
      why: `Why: ${attendanceConcern.length} students have attendance below ${t.attendanceThreshold}% and scored below grade 5.`,
      students: attendanceConcern
    });
  }

  // =========================================================================
  // RULE 7: Class progress
  // Classes with an average progress score below -1.0:
  // Text: "Review curriculum coverage and exam preparation in [class]."
  // =========================================================================
  for (const cls of sortedClassNames) {
    const classRecords = classMap.get(cls);
    if (classRecords.length < 5) continue;

    const withProgress = classRecords.filter(r => typeof r.progress === 'number' && !isNaN(r.progress));
    if (withProgress.length > 0) {
      const avgProgress = withProgress.reduce((sum, r) => sum + r.progress, 0) / withProgress.length;
      if (avgProgress < t.progressThreshold) {
        actions.push({
          id: `mock_rule_7_${cls}`,
          source: 'Mock',
          ruleNumber: 7,
          ruleName: 'Review curriculum coverage',
          ruleKey: 'Mock_7',
          className: cls,
          studentsAffected: classRecords.length,
          title: `Review curriculum coverage and exam preparation in ${cls}.`,
          why: `Why: ${cls} average progress is ${avgProgress.toFixed(2)}, below the ${t.progressThreshold.toFixed(1)} threshold.`,
          students: withProgress
        });
      }
    }
  }

  return actions;
}

/**
 * Generates Class Balance Actions (Rules 8 & 9)
 * Only shown when new class lists are loaded.
 * Reuses the balance flag functions from Prompt 8 (src/movementStats.js).
 *
 * @param {Array<Object>} allRecords - Snapshot records
 * @param {Object} classListsData - Parsed class lists data
 * @param {Object} movementThresholds - Custom movement thresholds
 * @returns {Array<Object>} Array of Class balance action objects
 */
export function generateClassBalanceActions(allRecords = [], classListsData = null, movementThresholds = {}) {
  if (!classListsData) {
    return [];
  }

  const actions = [];

  // =========================================================================
  // RULE 8: Balance flags converted to actions
  // Text: "[flag text]. Review class allocation or plan extra support."
  // =========================================================================
  const profilesData = calculateNewClassProfiles(allRecords, classListsData);
  if (profilesData && profilesData.classProfiles && profilesData.cohortProfile) {
    const flagsResult = calculateBalanceFlags(
      profilesData.classProfiles,
      profilesData.cohortProfile,
      movementThresholds
    );

    if (flagsResult && Array.isArray(flagsResult.flags)) {
      for (const flag of flagsResult.flags) {
        const trimmed = (flag.text || '').trim();
        const textWithPeriod = trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
        actions.push({
          id: `balance_rule_8_${flag.id || flag.type + '_' + flag.className}`,
          source: 'Class balance',
          ruleNumber: 8,
          ruleName: 'Class balance flag',
          ruleKey: `Balance_8_${flag.type}`,
          className: flag.className,
          studentsAffected: flag.studentsAffected || 0,
          title: `${textWithPeriod} Review class allocation or plan extra support.`,
          why: flag.why || `Why: Balance flag triggered for ${flag.className}.`,
          students: flag.students || []
        });
      }
    }
  }

  // =========================================================================
  // RULE 9: Students in new classes with no mock result
  // Text: "Baseline assessment needed: [n] students in [classes]."
  // =========================================================================
  const inNewClassesNoMock = classListsData.inNewClassesNoMockResult || [];
  if (inNewClassesNoMock.length > 0) {
    const uniqueClasses = [...new Set(inNewClassesNoMock.map(s => s.newClassName).filter(Boolean))].sort(compareClassNames);
    const classesStr = uniqueClasses.length > 0 ? uniqueClasses.join(', ') : 'new classes';
    const n = inNewClassesNoMock.length;

    actions.push({
      id: 'balance_rule_9_no_mock',
      source: 'Class balance',
      ruleNumber: 9,
      ruleName: 'Baseline assessment needed',
      ruleKey: 'Balance_9',
      className: classesStr,
      studentsAffected: n,
      title: `Baseline assessment needed: ${n} student${n === 1 ? '' : 's'} in ${classesStr}.`,
      why: `Why: ${n} student${n === 1 ? '' : 's'} in new classes have no Year 10 mock result on record.`,
      students: inNewClassesNoMock
    });
  }

  return actions;
}

/**
 * Selects and ranks Top Priorities across all loaded sources:
 * - All actions ranked by studentsAffected descending.
 * - If multiple sources are loaded, must include at least one action from each loaded source that has actions.
 * - No more than two actions from the same rule in the top 5.
 *
 * @param {Array<Object>} allActions - Merged actions from all sources
 * @param {number} limit - Maximum number of top priorities (default 5)
 * @param {Array<string>} loadedSources - List of actively loaded sources (e.g. ['Mock', 'Class balance', 'QLA'])
 * @returns {Array<Object>} Array of top priority action objects
 */
export function selectTopPrioritiesAcrossSources(allActions = [], limit = 5, loadedSources = []) {
  if (!Array.isArray(allActions) || allActions.length === 0 || limit <= 0) {
    return [];
  }

  // Sort candidate actions by studentsAffected descending, with secondary tie-breakers
  const sorted = [...allActions].sort((a, b) => {
    const diff = (b.studentsAffected || 0) - (a.studentsAffected || 0);
    if (diff !== 0) return diff;
    if (a.source !== b.source) return String(a.source).localeCompare(String(b.source));
    if ((a.ruleNumber || 0) !== (b.ruleNumber || 0)) {
      return (a.ruleNumber || 0) - (b.ruleNumber || 0);
    }
    return String(a.id).localeCompare(String(b.id));
  });

  const selected = [];
  const ruleCounts = {};
  const selectedIds = new Set();

  const getRuleKey = (act) => act.ruleKey || `${act.source}_${act.ruleNumber}`;

  // If multiple sources are loaded, ensure at least one action from each loaded source that has active actions
  const activeSourcesWithActions = loadedSources.filter(src => sorted.some(a => a.source === src));

  if (activeSourcesWithActions.length > 1) {
    for (const src of activeSourcesWithActions) {
      if (selected.length >= limit) break;
      const topForSource = sorted.find(a => a.source === src && !selectedIds.has(a.id));
      if (topForSource) {
        selected.push(topForSource);
        selectedIds.add(topForSource.id);
        const rKey = getRuleKey(topForSource);
        ruleCounts[rKey] = (ruleCounts[rKey] || 0) + 1;
      }
    }
  }

  // Fill remaining slots up to limit, respecting max 2 per rule
  for (const act of sorted) {
    if (selected.length >= limit) break;
    if (selectedIds.has(act.id)) continue;

    const rKey = getRuleKey(act);
    const count = ruleCounts[rKey] || 0;
    if (count < 2) {
      selected.push(act);
      selectedIds.add(act.id);
      ruleCounts[rKey] = count + 1;
    }
  }

  // Final sort by studentsAffected descending
  selected.sort((a, b) => {
    const diff = (b.studentsAffected || 0) - (a.studentsAffected || 0);
    if (diff !== 0) return diff;
    return (a.ruleNumber || 0) - (b.ruleNumber || 0);
  });

  return selected;
}

/**
 * Master generator for all Suggested Actions across Mock, Class Balance, and QLA
 *
 * @param {Array<Object>} activeRecords - Formatted active snapshot records
 * @param {Object} options - { classListsData, qlaPapers, thresholds, qlaThresholds, movementThresholds, activeGrouping, rawSnapshotRecords }
 * @returns {Object} { actions, topPriorities, bySource, totalActions, totalStudentsAffected }
 */
export function generateSuggestedActions(activeRecords = [], options = {}) {
  const {
    classListsData = null,
    qlaPapers = null,
    thresholds = DEFAULT_SUGGESTED_ACTION_THRESHOLDS,
    qlaThresholds = {},
    movementThresholds = {},
    rawSnapshotRecords = activeRecords
  } = options;

  const t = { ...DEFAULT_SUGGESTED_ACTION_THRESHOLDS, ...thresholds };
  const loadedSources = [];

  // 1. Mock Actions
  let mockActions = [];
  if (Array.isArray(activeRecords) && activeRecords.length > 0) {
    mockActions = generateMockActions(activeRecords, t);
    loadedSources.push('Mock');
  }

  // 2. Class Balance Actions (only when class lists are loaded)
  let balanceActions = [];
  if (classListsData) {
    balanceActions = generateClassBalanceActions(rawSnapshotRecords, classListsData, movementThresholds);
    loadedSources.push('Class balance');
  }

  // 3. QLA Actions (only when QLA is loaded)
  let qlaActions = [];
  if (Array.isArray(qlaPapers) && qlaPapers.length > 0) {
    const qlaResult = generateQlaActions(qlaPapers, {
      thresholds: qlaThresholds,
      isClassListsLoaded: classListsData !== null
    });
    if (qlaResult && Array.isArray(qlaResult.actions)) {
      qlaActions = qlaResult.actions.map(a => ({
        ...a,
        source: 'QLA',
        ruleKey: `QLA_${a.ruleNumber || 1}`
      }));
    }
    loadedSources.push('QLA');
  }

  // Sort each source group by studentsAffected descending
  const sortByImpact = (arr) => [...arr].sort((a, b) => (b.studentsAffected || 0) - (a.studentsAffected || 0));

  mockActions = sortByImpact(mockActions);
  balanceActions = sortByImpact(balanceActions);
  qlaActions = sortByImpact(qlaActions);

  // Combine all actions
  const allActions = sortByImpact([...mockActions, ...balanceActions, ...qlaActions]);

  // Select Top Priorities
  const topCount = Math.max(1, parseInt(t.topPrioritiesCount, 10) || 5);
  const topPriorities = selectTopPrioritiesAcrossSources(allActions, topCount, loadedSources);

  const bySource = {
    'Mock': mockActions,
    'Class balance': balanceActions,
    'QLA': qlaActions
  };

  const totalStudentsAffected = allActions.reduce((sum, a) => sum + (a.studentsAffected || 0), 0);

  return {
    actions: allActions,
    topPriorities,
    bySource,
    loadedSources,
    totalActions: allActions.length,
    totalStudentsAffected
  };
}

/**
 * Formats suggested actions as clean plain text for email copying.
 * Respects student privacy: uses getStudentDisplayName if names are listed.
 *
 * @param {Object} actionsData - Result from generateSuggestedActions
 * @param {Object} options - { schoolName, dateStr, isNameHidden, getStudentDisplayName }
 * @returns {string} Plain text formatted email content
 */
export function formatSuggestedActionsAsEmailText(actionsData, options = {}) {
  const {
    schoolName = 'Dixons Unity Academy',
    dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    isNameHidden = false,
    getStudentDisplayName = (s, idx) => s.name || `${s.surname || ''}, ${s.firstName || ''}`.trim() || `Student ${idx}`
  } = options;

  let topPriorities = [];
  let bySource = { 'Mock': [], 'Class balance': [], 'QLA': [] };

  if (actionsData && actionsData.topPriorities) {
    topPriorities = actionsData.topPriorities;
    bySource = actionsData.bySource || bySource;
  }

  const lines = [
    `Suggested Actions Report - ${schoolName}`,
    `Generated: ${dateStr}`,
    ''
  ];

  // TOP PRIORITIES
  lines.push(`TOP ${topPriorities.length} PRIORITIES`);
  lines.push('----------------------------------------');

  if (topPriorities.length === 0) {
    lines.push('No priorities currently identified at current thresholds.');
  } else {
    topPriorities.forEach((a, idx) => {
      const studentSuffix = a.studentsAffected > 0 ? ` (${a.studentsAffected} student${a.studentsAffected === 1 ? '' : 's'} affected)` : '';
      lines.push(`${idx + 1}. [${a.source.toUpperCase()}] ${a.title}${studentSuffix}`);
      if (a.why) {
        lines.push(`   ${a.why}`);
      }
    });
  }
  lines.push('');

  // FULL LIST BY SOURCE
  lines.push('FULL ACTION LIST BY SOURCE');
  lines.push('========================================');
  lines.push('');

  const sources = [
    { key: 'Mock', label: 'MOCK ASSESSMENT ACTIONS' },
    { key: 'Class balance', label: 'CLASS BALANCE ACTIONS' },
    { key: 'QLA', label: 'QLA TARGETED ACTIONS' }
  ];

  for (const src of sources) {
    const list = bySource[src.key] || [];
    if (list.length === 0 && src.key !== 'Mock') {
      // Omit optional sources if not loaded / empty
      continue;
    }

    lines.push(`${src.label} (${list.length})`);
    lines.push('----------------------------------------');

    if (list.length === 0) {
      lines.push('No actions currently required in this category.');
    } else {
      for (const a of list) {
        const studentSuffix = a.studentsAffected > 0 ? ` (${a.studentsAffected} student${a.studentsAffected === 1 ? '' : 's'} affected)` : '';
        lines.push(`• ${a.title}${studentSuffix}`);
        if (a.why) {
          lines.push(`  ${a.why}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
