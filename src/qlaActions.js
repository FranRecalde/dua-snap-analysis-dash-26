/**
 * Pure QLA Actions Engine
 * Rule-based targeted action recommendations across whole department,
 * class level, and individual students.
 * 
 * Rules:
 * - Pure calculations only. No DOM, no browser storage, no network.
 * - Rule-based only. No AI.
 * - Each action names the paper and tier, the question or class, and the number of students affected.
 * - Has student list behind it for 'Show students'.
 * - Papers are only ever compared within the same tier.
 * - Absent students never count.
 * - Comparisons need at least 5 present students; student-list actions need at least 1.
 * - Classes follow the existing view switch (activeClass).
 */

import {
  filterQlaStudents,
  calculatePaperStats,
  calculateQuestionStats,
  calculateCohortTierHighlights,
  pickStrongestWeakestWithinTier,
  calculateStudentSkillProfiles,
  calculateGrade4sByWeakestPaper,
  calculateDemographicGroupGaps
} from './qlaStats.js';
import { minimumActionGroupSize } from './actionGroupSize.js';

export const DEFAULT_QLA_ACTION_THRESHOLDS = {
  weakFacility: 40,       // Question weak facility % (default 40)
  classGap: 10,           // Points below cohort on a question (default 10)
  zeroRate: 30,           // Zero rate % on a question (default 30)
  demoGap: 10,            // Demographic gap in pts (default 10)
  absenceRate: 10,        // Absence % on a paper (default 10)
  topPrioritiesCount: 5   // Number of top priorities to show (default 5)
};

/**
 * Selects and ranks top priority actions according to priority rules:
 * - Rank all actions by the number of students affected, largest first.
 * - Keep variety: no more than 2 priorities from the same rule.
 * - At least 1 from "Whole department" if any whole department actions exist.
 * - If fewer than limit actions exist, show only those.
 *
 * @param {Array<Object>} actions - Array of action objects
 * @param {number} limit - Maximum number of top priorities (default 5)
 * @returns {Array<Object>} Ranked top priority actions
 */
export function selectTopPriorities(actions = [], limit = 5) {
  if (!Array.isArray(actions) || actions.length === 0 || limit <= 0) {
    return [];
  }

  // Sort candidate actions by studentsAffected descending
  const sorted = [...actions].sort((a, b) => {
    const diff = (b.studentsAffected || 0) - (a.studentsAffected || 0);
    if (diff !== 0) return diff;
    if ((a.ruleNumber || 0) !== (b.ruleNumber || 0)) {
      return (a.ruleNumber || 0) - (b.ruleNumber || 0);
    }
    return String(a.id).localeCompare(String(b.id));
  });

  const hasWholeDept = sorted.some(a => a.category === 'Whole department');
  const selected = [];
  const ruleCounts = {};

  // If a Whole Department action exists, we must include at least 1.
  // Pre-select the highest-ranked Whole Department action:
  let preselectedWholeDept = null;
  if (hasWholeDept) {
    preselectedWholeDept = sorted.find(a => a.category === 'Whole department');
    if (preselectedWholeDept) {
      selected.push(preselectedWholeDept);
      ruleCounts[preselectedWholeDept.ruleNumber] = 1;
    }
  }

  // Fill up to `limit` with the largest studentsAffected actions, respecting max 2 per rule
  for (const a of sorted) {
    if (selected.length >= limit) break;
    if (preselectedWholeDept && a.id === preselectedWholeDept.id) continue;

    const rCount = ruleCounts[a.ruleNumber] || 0;
    if (rCount < 2) {
      selected.push(a);
      ruleCounts[a.ruleNumber] = rCount + 1;
    }
  }

  // Final sort of selected priorities by studentsAffected descending
  selected.sort((a, b) => {
    const diff = (b.studentsAffected || 0) - (a.studentsAffected || 0);
    if (diff !== 0) return diff;
    return (a.ruleNumber || 0) - (b.ruleNumber || 0);
  });

  return selected;
}

/**
 * Generates all rule-based QLA actions based on parsed papers and active thresholds.
 *
 * @param {Array<Object>} papers - Array of parsed QLA papers
 * @param {Object} options - { thresholds, filters, isClassListsLoaded }
 * @returns {{ actions: Array<Object>, topPriorities: Array<Object>, byCategory: Object, totalActions: number, totalStudentsAffected: number }}
 */
export function generateQlaActions(papers = [], options = {}) {
  if (!Array.isArray(papers) || papers.length === 0) {
    return {
      actions: [],
      topPriorities: [],
      byCategory: {
        'Whole department': [],
        'Class level': [],
        'Students': []
      },
      totalActions: 0,
      totalStudentsAffected: 0
    };
  }

  const rawThresholds = options.thresholds || {};
  const thresholds = {
    weakFacility: typeof rawThresholds.weakFacility === 'number' ? rawThresholds.weakFacility : DEFAULT_QLA_ACTION_THRESHOLDS.weakFacility,
    classGap: typeof rawThresholds.classGap === 'number' ? rawThresholds.classGap : DEFAULT_QLA_ACTION_THRESHOLDS.classGap,
    zeroRate: typeof rawThresholds.zeroRate === 'number' ? rawThresholds.zeroRate : DEFAULT_QLA_ACTION_THRESHOLDS.zeroRate,
    demoGap: typeof rawThresholds.demoGap === 'number' ? rawThresholds.demoGap : DEFAULT_QLA_ACTION_THRESHOLDS.demoGap,
    absenceRate: typeof rawThresholds.absenceRate === 'number' ? rawThresholds.absenceRate : DEFAULT_QLA_ACTION_THRESHOLDS.absenceRate,
    topPrioritiesCount: typeof rawThresholds.topPrioritiesCount === 'number' ? rawThresholds.topPrioritiesCount : DEFAULT_QLA_ACTION_THRESHOLDS.topPrioritiesCount
  };

  const filters = options.filters || {};
  const isClassListsLoaded = Boolean(options.isClassListsLoaded);

  const actions = [];
  let actionSeq = 0;
  const nextId = (ruleNum) => `action-${ruleNum}-${++actionSeq}`;

  // Helper to format paper & tier label consistently (e.g. "Listening F", "Reading H")
  const getPaperTierLabel = (paper) => {
    const tShort = paper.tier === 'Foundation' ? 'F' : paper.tier === 'Higher' ? 'H' : '';
    return `${paper.paper} ${tShort}`.trim();
  };

  // Helper to get present students on a paper
  const getEligibleStudents = (paper) => {
    const students = paper.students || [];
    return students.filter(s => s.status === 'present' || s.status === 'incomplete');
  };

  // =========================================================================
  // RULE 1: Weakest question in each paper and tier (lowest facility)
  // Text: "Reteach and retest [topic] ([question]) in [paper and tier]."
  // Category: "Whole department"
  // =========================================================================
  for (const paper of papers) {
    const qStats = calculateQuestionStats(paper, filters, { strong: 70, weak: thresholds.weakFacility });
    if (!qStats || qStats.n < minimumActionGroupSize('QLA', 1) || !qStats.questions || qStats.questions.length === 0) continue;

    const validQuestions = qStats.questions.filter(q => q.facility !== null && q.maxMarks > 0);
    if (validQuestions.length === 0) continue;

    // Sort ascending by facility: weakest question is first
    const sorted = [...validQuestions].sort((a, b) => a.facility - b.facility);
    const weakestQ = sorted[0];

    const topic = weakestQ.topic || 'General';
    const paperAndTier = getPaperTierLabel(paper);
    const title = `Reteach and retest ${topic} (${weakestQ.label}) in ${paperAndTier}.`;

    // Affected students: present students scoring < 50% on this question
    const eligibleStudents = getEligibleStudents(paper);
    let affectedStudents = [];
    for (const s of eligibleStudents) {
      const rawMark = s.marks ? s.marks[weakestQ.key] : null;
      const mark = typeof rawMark === 'number' && !isNaN(rawMark) ? rawMark : 0;
      if (mark < (weakestQ.maxMarks / 2)) {
        affectedStudents.push({
          name: s.name,
          surname: s.surname,
          firstName: s.firstName,
          activeClass: s.activeClass || s.className || s.currentClass,
          mark,
          maxMarks: weakestQ.maxMarks,
          pct: weakestQ.maxMarks > 0 ? Math.round((mark / weakestQ.maxMarks) * 1000) / 10 : 0
        });
      }
    }

    // If no student scored < 50%, include those who dropped marks
    if (affectedStudents.length === 0) {
      for (const s of eligibleStudents) {
        const rawMark = s.marks ? s.marks[weakestQ.key] : null;
        const mark = typeof rawMark === 'number' && !isNaN(rawMark) ? rawMark : 0;
        if (mark < weakestQ.maxMarks) {
          affectedStudents.push({
            name: s.name,
            surname: s.surname,
            firstName: s.firstName,
            activeClass: s.activeClass || s.className || s.currentClass,
            mark,
            maxMarks: weakestQ.maxMarks,
            pct: weakestQ.maxMarks > 0 ? Math.round((mark / weakestQ.maxMarks) * 1000) / 10 : 0
          });
        }
      }
    }

    const classCount = new Set(affectedStudents.map(s => s.activeClass).filter(Boolean)).size;
    const why = `Why: affects ${affectedStudents.length} student${affectedStudents.length === 1 ? '' : 's'}${classCount > 1 ? ` across ${classCount} classes` : ''} on lowest facility question (${weakestQ.facility.toFixed(1)}%)`;

    actions.push({
      id: nextId(1),
      ruleNumber: 1,
      category: 'Whole department',
      title,
      paper: paper.paper,
      tier: paper.tier,
      paperAndTier,
      question: weakestQ.label,
      studentsAffected: affectedStudents.length,
      students: affectedStudents,
      why,
      rationale: `Lowest facility on paper: ${weakestQ.facility.toFixed(1)}%`
    });
  }

  // =========================================================================
  // RULE 2: A class 10+ points below the cohort on a question
  // Text: "[class] is [x] points below the cohort on [question], [paper and tier]. Share the approach from [strongest class on that question]."
  // Category: "Class level"
  // Skip any class with fewer than 5 present students
  // =========================================================================
  for (const paper of papers) {
    const cohortQStats = calculateQuestionStats(paper, { className: 'ALL' });
    if (!cohortQStats || cohortQStats.n < minimumActionGroupSize('QLA', 2) || !cohortQStats.questions) continue;

    const cohortMap = new Map();
    for (const q of cohortQStats.questions) {
      if (q.facility !== null) cohortMap.set(q.key, q.facility);
    }

    // Collect classes on this paper with >= 5 present students
    const classStudentMap = new Map();
    for (const s of (paper.students || [])) {
      if (s.status !== 'present' && s.status !== 'incomplete') continue;
      const cls = s.activeClass || s.className || s.currentClass;
      if (cls && cls !== 'Unassigned') {
        if (!classStudentMap.has(cls)) classStudentMap.set(cls, []);
        classStudentMap.get(cls).push(s);
      }
    }

    const eligibleClasses = [];
    const classStatsMap = new Map();

    for (const [cls, stList] of classStudentMap.entries()) {
      if (stList.length >= minimumActionGroupSize('QLA', 2)) {
        eligibleClasses.push(cls);
        const cStats = calculateQuestionStats(paper, { className: cls });
        classStatsMap.set(cls, cStats);
      }
    }

    if (eligibleClasses.length < 2) continue; // Need at least 2 eligible classes to share approaches

    const paperAndTier = getPaperTierLabel(paper);

    for (const cls of eligibleClasses) {
      const cStats = classStatsMap.get(cls);
      if (!cStats || !cStats.questions) continue;

      for (const q of cStats.questions) {
        const cohortFac = cohortMap.get(q.key);
        if (cohortFac === undefined || q.facility === null) continue;

        const gap = Math.round((cohortFac - q.facility) * 10) / 10;
        if (gap >= thresholds.classGap) {
          // Find the strongest other class on this question with >= 5 students
          let bestOtherClass = null;
          let bestFacility = -1;

          for (const otherCls of eligibleClasses) {
            if (otherCls === cls) continue;
            const otherStats = classStatsMap.get(otherCls);
            const otherQ = otherStats?.questions?.find(oq => oq.key === q.key);
            if (otherQ && otherQ.facility !== null && otherQ.facility > bestFacility) {
              bestFacility = otherQ.facility;
              bestOtherClass = otherCls;
            }
          }

          if (bestOtherClass && bestFacility > q.facility) {
            const title = `${cls} is ${gap.toFixed(1)} points below the cohort on ${q.label}, ${paperAndTier}. Share the approach from ${bestOtherClass}.`;

            // Students in this class struggling on this question
            const classStudents = classStudentMap.get(cls) || [];
            const affectedStudents = [];
            for (const s of classStudents) {
              const rawMark = s.marks ? s.marks[q.key] : null;
              const mark = typeof rawMark === 'number' && !isNaN(rawMark) ? rawMark : 0;
              if (mark < (q.maxMarks / 2)) {
                affectedStudents.push({
                  name: s.name,
                  surname: s.surname,
                  firstName: s.firstName,
                  activeClass: cls,
                  mark,
                  maxMarks: q.maxMarks,
                  pct: q.maxMarks > 0 ? Math.round((mark / q.maxMarks) * 1000) / 10 : 0
                });
              }
            }

            const finalStudents = affectedStudents.length > 0 ? affectedStudents : classStudents.map(s => {
              const rawMark = s.marks ? s.marks[q.key] : null;
              const mark = typeof rawMark === 'number' && !isNaN(rawMark) ? rawMark : 0;
              return {
                name: s.name,
                surname: s.surname,
                firstName: s.firstName,
                activeClass: cls,
                mark,
                maxMarks: q.maxMarks,
                pct: q.maxMarks > 0 ? Math.round((mark / q.maxMarks) * 1000) / 10 : 0
              };
            });

            const why = `Why: affects ${finalStudents.length} student${finalStudents.length === 1 ? '' : 's'} in ${cls} trailing cohort by ${gap.toFixed(1)} points`;

            actions.push({
              id: nextId(2),
              ruleNumber: 2,
              category: 'Class level',
              title,
              paper: paper.paper,
              tier: paper.tier,
              paperAndTier,
              question: q.label,
              className: cls,
              studentsAffected: finalStudents.length,
              students: finalStudents,
              why,
              rationale: `Class facility: ${q.facility.toFixed(1)}% vs Cohort: ${cohortFac.toFixed(1)}% (-${gap.toFixed(1)} pts). Strongest: ${bestOtherClass} (${bestFacility.toFixed(1)}%)`
            });
          }
        }
      }
    }
  }

  // =========================================================================
  // RULE 3: Weakest paper in each tier
  // Text: "Department focus for [tier] next cycle: [paper]."
  // Category: "Whole department"
  // Papers are only ever compared within the same tier
  // =========================================================================
  const deptWeakestByTier = {};

  const tiersToCheck = ['Foundation', 'Higher'];
  for (const tier of tiersToCheck) {
    const tierPapers = papers.filter(p => p.tier === tier);
    if (tierPapers.length === 0) continue;

    const paperStatsList = [];
    for (const p of tierPapers) {
      const stats = calculatePaperStats(p, filters);
      if (stats && stats.n >= minimumActionGroupSize('QLA', 3) && stats.avgPct !== null) {
        paperStatsList.push({ paper: p, stats });
      }
    }

    if (paperStatsList.length === 0) continue;

    // Pick weakest paper in tier strictly
    paperStatsList.sort((a, b) => a.stats.avgPct - b.stats.avgPct);
    const weakestEntry = paperStatsList[0];
    const weakestPaperObj = weakestEntry.paper;
    const paperAndTier = getPaperTierLabel(weakestPaperObj);

    deptWeakestByTier[tier] = weakestPaperObj;

    const title = `Department focus for ${tier} next cycle: ${paperAndTier}.`;

    // Affected students: students scoring < 50% on this weakest paper
    const eligibleStudents = getEligibleStudents(weakestPaperObj);
    const affectedStudents = eligibleStudents
      .filter(s => {
        const total = typeof s.total === 'number' ? s.total : 0;
        return weakestPaperObj.totalMax > 0 && (total / weakestPaperObj.totalMax) < 0.5;
      })
      .map(s => {
        const total = typeof s.total === 'number' ? s.total : 0;
        return {
          name: s.name,
          surname: s.surname,
          firstName: s.firstName,
          activeClass: s.activeClass || s.className || s.currentClass,
          total,
          totalMax: weakestPaperObj.totalMax,
          pct: weakestPaperObj.totalMax > 0 ? Math.round((total / weakestPaperObj.totalMax) * 1000) / 10 : 0
        };
      });

    const finalStudents = affectedStudents.length > 0 ? affectedStudents : eligibleStudents.map(s => ({
      name: s.name,
      surname: s.surname,
      firstName: s.firstName,
      activeClass: s.activeClass || s.className || s.currentClass,
      total: typeof s.total === 'number' ? s.total : 0,
      totalMax: weakestPaperObj.totalMax,
      pct: weakestPaperObj.totalMax > 0 ? Math.round((s.total / weakestPaperObj.totalMax) * 1000) / 10 : 0
    }));

    const classCount = new Set(finalStudents.map(s => s.activeClass).filter(Boolean)).size;
    const why = `Why: affects ${finalStudents.length} student${finalStudents.length === 1 ? '' : 's'}${classCount > 1 ? ` across ${classCount} classes` : ''} on weakest department paper (${weakestEntry.stats.avgPct.toFixed(1)}% average)`;

    actions.push({
      id: nextId(3),
      ruleNumber: 3,
      category: 'Whole department',
      title,
      paper: weakestPaperObj.paper,
      tier,
      paperAndTier,
      studentsAffected: finalStudents.length,
      students: finalStudents,
      why,
      rationale: `Lowest tier cohort average: ${weakestEntry.stats.avgPct.toFixed(1)}%`
    });
  }

  // =========================================================================
  // RULE 4: A class whose weakest paper in a tier differs from department's weakest in that tier
  // Text: "[class] needs a different focus in [tier]: [paper]."
  // Category: "Class level"
  // Skip classes with fewer than 5 present students
  // =========================================================================
  for (const tier of tiersToCheck) {
    const deptWeakest = deptWeakestByTier[tier];
    if (!deptWeakest) continue;

    const tierPapers = papers.filter(p => p.tier === tier);
    if (tierPapers.length < 2) continue; // Need at least 2 papers in tier to have a different weakest

    // Collect active classes with >= 5 students on at least 2 papers in this tier
    const classSet = new Set();
    for (const p of tierPapers) {
      for (const s of (p.students || [])) {
        if (s.status !== 'present' && s.status !== 'incomplete') continue;
        const cls = s.activeClass || s.className || s.currentClass;
        if (cls && cls !== 'Unassigned') classSet.add(cls);
      }
    }

    for (const cls of Array.from(classSet).sort()) {
      const eligibleClassPapers = [];

      for (const p of tierPapers) {
        const stats = calculatePaperStats(p, { className: cls });
        if (stats && stats.n >= minimumActionGroupSize('QLA', 4) && stats.avgPct !== null) {
          eligibleClassPapers.push({
            sheetName: p.sheetName,
            paper: p.paper,
            tier: p.tier,
            avgPct: stats.avgPct,
            rawPaper: p
          });
        }
      }

      if (eligibleClassPapers.length >= 2) {
        // Find class's weakest paper in this tier
        eligibleClassPapers.sort((a, b) => a.avgPct - b.avgPct);
        const classWeakest = eligibleClassPapers[0];

        if (classWeakest.sheetName !== deptWeakest.sheetName) {
          const classWeakestPaperAndTier = getPaperTierLabel(classWeakest.rawPaper);
          const title = `${cls} needs a different focus in ${tier}: ${classWeakestPaperAndTier}.`;

          // Affected students: class students scoring < 50% on this paper
          const classStudents = (classWeakest.rawPaper.students || []).filter(s => {
            if (s.status !== 'present' && s.status !== 'incomplete') return false;
            return (s.activeClass || s.className || s.currentClass) === cls;
          });

          const affected = classStudents
            .filter(s => {
              const total = typeof s.total === 'number' ? s.total : 0;
              return classWeakest.rawPaper.totalMax > 0 && (total / classWeakest.rawPaper.totalMax) < 0.5;
            })
            .map(s => {
              const total = typeof s.total === 'number' ? s.total : 0;
              return {
                name: s.name,
                surname: s.surname,
                firstName: s.firstName,
                activeClass: cls,
                total,
                totalMax: classWeakest.rawPaper.totalMax,
                pct: classWeakest.rawPaper.totalMax > 0 ? Math.round((total / classWeakest.rawPaper.totalMax) * 1000) / 10 : 0
              };
            });

          const finalStudents = affected.length > 0 ? affected : classStudents.map(s => ({
            name: s.name,
            surname: s.surname,
            firstName: s.firstName,
            activeClass: cls,
            total: typeof s.total === 'number' ? s.total : 0,
            totalMax: classWeakest.rawPaper.totalMax,
            pct: classWeakest.rawPaper.totalMax > 0 ? Math.round((s.total / classWeakest.rawPaper.totalMax) * 1000) / 10 : 0
          }));

          const why = `Why: affects ${finalStudents.length} student${finalStudents.length === 1 ? '' : 's'} in ${cls} whose weakest paper is ${classWeakestPaperAndTier} (${classWeakest.avgPct.toFixed(1)}%)`;

          actions.push({
            id: nextId(4),
            ruleNumber: 4,
            category: 'Class level',
            title,
            paper: classWeakest.paper,
            tier,
            paperAndTier: classWeakestPaperAndTier,
            className: cls,
            studentsAffected: finalStudents.length,
            students: finalStudents,
            why,
            rationale: `Class weakest is ${classWeakestPaperAndTier} (${classWeakest.avgPct.toFixed(1)}%) whereas department weakest is ${getPaperTierLabel(deptWeakest)}`
          });
        }
      }
    }
  }

  // =========================================================================
  // RULE 5: Grade 4 students grouped by weakest paper, per tier
  // Text: "Targeted intervention: [n] grade 4s whose weakest paper is [paper and tier]."
  // Category: "Students"
  // =========================================================================
  const allProfiles = calculateStudentSkillProfiles(papers);
  const grade4Groups = calculateGrade4sByWeakestPaper(allProfiles);

  for (const tierKey of ['foundation', 'higher']) {
    const groups = grade4Groups[tierKey] || [];
    for (const group of groups) {
      if (group.count >= minimumActionGroupSize('QLA', 5) && group.weakestPaper && group.weakestPaper !== 'not enough papers') {
        const title = `Targeted intervention: ${group.count} grade 4s whose weakest paper is ${group.weakestPaper}.`;
        const tierName = tierKey === 'foundation' ? 'Foundation' : 'Higher';

        const classCount = new Set(group.students.map(s => s.activeClass || s.className || s.currentClass).filter(Boolean)).size;
        const why = `Why: affects ${group.count} grade 4 student${group.count === 1 ? '' : 's'}${classCount > 1 ? ` across ${classCount} classes` : ''} needing targeted grade 5 push`;

        actions.push({
          id: nextId(5),
          ruleNumber: 5,
          category: 'Students',
          title,
          paper: group.weakestPaper,
          tier: tierName,
          paperAndTier: group.weakestPaper,
          studentsAffected: group.count,
          students: group.students.map(s => ({
            name: s.name,
            surname: s.surname,
            firstName: s.firstName,
            activeClass: s.activeClass || s.className || s.currentClass,
            mockResult: s.displayResult || s.result,
            weakestPaper: s.weakestPaper
          })),
          why,
          rationale: `${group.count} Grade 4 student${group.count === 1 ? '' : 's'} dropping most marks on ${group.weakestPaper}`
        });
      }
    }
  }

  // =========================================================================
  // RULE 6: Zero rate of 30% or more on a question
  // Text: "Check whether students are attempting [question], [paper and tier]. Model exam timing."
  // Category: "Whole department"
  // =========================================================================
  for (const paper of papers) {
    const qStats = calculateQuestionStats(paper, filters);
    if (!qStats || qStats.n < minimumActionGroupSize('QLA', 6) || !qStats.questions) continue;

    const paperAndTier = getPaperTierLabel(paper);

    for (const q of qStats.questions) {
      if (q.zeroRate !== null && q.zeroRate >= thresholds.zeroRate) {
        const title = `Check whether students are attempting ${q.label}, ${paperAndTier}. Model exam timing.`;

        // Affected students: present students scoring 0 on this question
        const eligible = getEligibleStudents(paper);
        const zeroStudents = [];
        for (const s of eligible) {
          const rawMark = s.marks ? s.marks[q.key] : null;
          const mark = typeof rawMark === 'number' && !isNaN(rawMark) ? rawMark : 0;
          if (mark === 0) {
            zeroStudents.push({
              name: s.name,
              surname: s.surname,
              firstName: s.firstName,
              activeClass: s.activeClass || s.className || s.currentClass,
              mark: 0,
              maxMarks: q.maxMarks,
              pct: 0
            });
          }
        }

        const classCount = new Set(zeroStudents.map(s => s.activeClass || s.className || s.currentClass).filter(Boolean)).size;
        const why = `Why: affects ${zeroStudents.length} student${zeroStudents.length === 1 ? '' : 's'}${classCount > 1 ? ` across ${classCount} classes` : ''} scoring 0 marks (${q.zeroRate.toFixed(1)}% zero rate)`;

        actions.push({
          id: nextId(6),
          ruleNumber: 6,
          category: 'Whole department',
          title,
          paper: paper.paper,
          tier: paper.tier,
          paperAndTier,
          question: q.label,
          studentsAffected: zeroStudents.length,
          students: zeroStudents,
          why,
          rationale: `Zero rate: ${q.zeroRate.toFixed(1)}% (${zeroStudents.length} of ${qStats.n} students scored 0)`
        });
      }
    }
  }

  // =========================================================================
  // RULE 7: Discrimination below 0
  // Text: "Review the mark scheme or moderation for [question], [paper and tier]."
  // Category: "Whole department"
  // Discrimination is only calculated when paper has >= 9 present students
  // =========================================================================
  for (const paper of papers) {
    const qStats = calculateQuestionStats(paper, filters);
    if (!qStats || qStats.n < 9 || !qStats.questions) continue; // Requires >= 9 present students

    const paperAndTier = getPaperTierLabel(paper);

    for (const q of qStats.questions) {
      if (q.discrimination !== null && q.discrimination < 0) {
        const title = `Review the mark scheme or moderation for ${q.label}, ${paperAndTier}.`;

        // Affected students: students dropping marks on this question
        const eligible = getEligibleStudents(paper);
        const struggling = [];
        for (const s of eligible) {
          const rawMark = s.marks ? s.marks[q.key] : null;
          const mark = typeof rawMark === 'number' && !isNaN(rawMark) ? rawMark : 0;
          if (mark < q.maxMarks) {
            struggling.push({
              name: s.name,
              surname: s.surname,
              firstName: s.firstName,
              activeClass: s.activeClass || s.className || s.currentClass,
              mark,
              maxMarks: q.maxMarks,
              pct: q.maxMarks > 0 ? Math.round((mark / q.maxMarks) * 1000) / 10 : 0
            });
          }
        }

        const classCount = new Set(struggling.map(s => s.activeClass || s.className || s.currentClass).filter(Boolean)).size;
        const why = `Why: affects ${struggling.length} student${struggling.length === 1 ? '' : 's'}${classCount > 1 ? ` across ${classCount} classes` : ''} where higher attainers scored worse (${q.discrimination.toFixed(1)} pts)`;

        actions.push({
          id: nextId(7),
          ruleNumber: 7,
          category: 'Whole department',
          title,
          paper: paper.paper,
          tier: paper.tier,
          paperAndTier,
          question: q.label,
          studentsAffected: struggling.length,
          students: struggling,
          why,
          rationale: `Negative discrimination: ${q.discrimination.toFixed(1)} pts (bottom third outperformed top third)`
        });
      }
    }
  }

  // =========================================================================
  // RULE 8: A dictation or translation question with facility below the weak threshold
  // Text: "Build weekly [dictation / translation] practice into lessons for [tier]."
  // Category: "Whole department"
  // =========================================================================
  const dictationTranslationTriggered = new Set(); // Prevent duplicate action per tier & type

  for (const paper of papers) {
    const qStats = calculateQuestionStats(paper, filters, { strong: 70, weak: thresholds.weakFacility });
    if (!qStats || qStats.n < minimumActionGroupSize('QLA', 8) || !qStats.questions) continue;

    for (const q of qStats.questions) {
      const isDictation = /dictation/i.test(q.label) || /dictation/i.test(q.section || '') || /dictation/i.test(q.topic || '');
      const isTranslation = /translation/i.test(q.label) || /translation/i.test(q.section || '') || /translation/i.test(q.topic || '');

      if ((isDictation || isTranslation) && q.facility !== null && q.facility < thresholds.weakFacility) {
        const type = isDictation ? 'dictation' : 'translation';
        const dedupeKey = `${paper.tier}-${type}`;

        if (!dictationTranslationTriggered.has(dedupeKey)) {
          dictationTranslationTriggered.add(dedupeKey);

          const title = `Build weekly ${type} practice into lessons for ${paper.tier}.`;

          const eligible = getEligibleStudents(paper);
          const affected = [];
          for (const s of eligible) {
            const rawMark = s.marks ? s.marks[q.key] : null;
            const mark = typeof rawMark === 'number' && !isNaN(rawMark) ? rawMark : 0;
            if (mark < (q.maxMarks / 2)) {
              affected.push({
                name: s.name,
                surname: s.surname,
                firstName: s.firstName,
                activeClass: s.activeClass || s.className || s.currentClass,
                mark,
                maxMarks: q.maxMarks,
                pct: q.maxMarks > 0 ? Math.round((mark / q.maxMarks) * 1000) / 10 : 0
              });
            }
          }

          const finalStudents = affected.length > 0 ? affected : eligible.map(s => ({
            name: s.name,
            surname: s.surname,
            firstName: s.firstName,
            activeClass: s.activeClass || s.className || s.currentClass
          }));
          const classCount = new Set(finalStudents.map(s => s.activeClass).filter(Boolean)).size;
          const why = `Why: affects ${finalStudents.length} student${finalStudents.length === 1 ? '' : 's'}${classCount > 1 ? ` across ${classCount} classes` : ''} dropping marks on key skill (${q.facility.toFixed(1)}% facility)`;

          actions.push({
            id: nextId(8),
            ruleNumber: 8,
            category: 'Whole department',
            title,
            paper: paper.paper,
            tier: paper.tier,
            paperAndTier: getPaperTierLabel(paper),
            question: q.label,
            studentsAffected: finalStudents.length,
            students: finalStudents,
            why,
            rationale: `${type.charAt(0).toUpperCase() + type.slice(1)} question ${q.label} facility: ${q.facility.toFixed(1)}% (< ${thresholds.weakFacility}%)`
          });
        }
      }
    }
  }

  // =========================================================================
  // RULE 9: A SEN Support or disadvantaged gap of 10+ points on a paper
  // Text: "Gap of [x] points for [group] on [paper and tier]. Review scaffolds and access arrangements."
  // Category: "Students"
  // Skip any group with fewer than 5 present students
  // =========================================================================
  const demographicGaps = calculateDemographicGroupGaps(papers, filters, isClassListsLoaded);

  for (const paperGap of demographicGaps) {
    const paperObj = papers.find(p => p.sheetName === paperGap.sheetName);
    const paperAndTier = paperObj ? getPaperTierLabel(paperObj) : paperGap.sheetName;

    for (const comp of (paperGap.comparisons || [])) {
      if (comp.nA < minimumActionGroupSize('QLA', 9) || comp.nB < minimumActionGroupSize('QLA', 9)) continue;
      if (comp.id !== 'sen' && comp.id !== 'disadvantaged') continue;

      // Group A is target group (SEN Support or Disadvantaged)
      // Gap is avgA - avgB. A gap of 10+ points below means gap <= -10.0
      if (comp.gap !== null && comp.gap <= -thresholds.demoGap) {
        const ptsGap = Math.abs(comp.gap).toFixed(1);
        const groupName = comp.groupAName;
        const title = `Gap of ${ptsGap} points for ${groupName} on ${paperAndTier}. Review scaffolds and access arrangements.`;

        // Affected students: present students in group A
        const eligible = paperObj ? getEligibleStudents(paperObj) : [];
        const groupAStudents = eligible
          .filter(s => {
            if (comp.id === 'sen') return s.sen === 'SEN Support';
            if (comp.id === 'disadvantaged') return s.disadvantaged === 'Yes';
            return false;
          })
          .map(s => {
            const total = typeof s.total === 'number' ? s.total : 0;
            const maxMarks = paperObj ? paperObj.totalMax : 0;
            return {
              name: s.name,
              surname: s.surname,
              firstName: s.firstName,
              activeClass: s.activeClass || s.className || s.currentClass,
              group: groupName,
              total,
              totalMax: maxMarks,
              pct: maxMarks > 0 ? Math.round((total / maxMarks) * 1000) / 10 : 0
            };
          });

        const classCount = new Set(groupAStudents.map(s => s.activeClass).filter(Boolean)).size;
        const why = `Why: affects ${groupAStudents.length} ${groupName} student${groupAStudents.length === 1 ? '' : 's'}${classCount > 1 ? ` across ${classCount} classes` : ''} with ${ptsGap} point attainment gap`;

        actions.push({
          id: nextId(9),
          ruleNumber: 9,
          category: 'Students',
          title,
          paper: paperGap.paper,
          tier: paperGap.tier,
          paperAndTier,
          targetGroup: `${groupName} (${ptsGap} pt gap)`,
          studentsAffected: groupAStudents.length,
          students: groupAStudents,
          why,
          rationale: `${groupName} average: ${comp.avgA.toFixed(1)}% vs Non-${groupName}: ${comp.avgB.toFixed(1)}% (-${ptsGap} pts)`
        });
      }
    }
  }

  // =========================================================================
  // RULE 10: More than 10% of students absent from a paper
  // Text: "Catch up sitting needed for [paper and tier]: [n] students."
  // Category: "Whole department"
  // =========================================================================
  for (const paper of papers) {
    const totalEnrolled = (paper.students || []).length;
    if (totalEnrolled === 0) continue;

    const absentStudents = (paper.students || []).filter(s => s.status === 'absent');
    const absentCount = absentStudents.length;
    const absentRate = (absentCount / totalEnrolled) * 100;

    if (absentCount >= minimumActionGroupSize('QLA', 10) && absentRate > thresholds.absenceRate) {
      const paperAndTier = getPaperTierLabel(paper);
      const title = `Catch up sitting needed for ${paperAndTier}: ${absentCount} students.`;

      const classCount = new Set(absentStudents.map(s => s.activeClass || s.className || s.currentClass).filter(Boolean)).size;
      const why = `Why: affects ${absentCount} student${absentCount === 1 ? '' : 's'}${classCount > 1 ? ` across ${classCount} classes` : ''} who missed the paper (${absentRate.toFixed(1)}% absence rate)`;

      actions.push({
        id: nextId(10),
        ruleNumber: 10,
        category: 'Whole department',
        title,
        paper: paper.paper,
        tier: paper.tier,
        paperAndTier,
        targetGroup: `${absentCount} absent`,
        studentsAffected: absentCount,
        students: absentStudents.map(s => ({
          name: s.name,
          surname: s.surname,
          firstName: s.firstName,
          activeClass: s.activeClass || s.className || s.currentClass,
          status: 'absent'
        })),
        why,
        rationale: `Absence rate: ${absentRate.toFixed(1)}% (${absentCount} of ${totalEnrolled} students absent)`
      });
    }
  }

  // =========================================================================
  // ORDERING & GROUPING
  // Order actions by number of students affected, largest first
  // Group under three headings: "Whole department", "Class level", "Students"
  // =========================================================================
  actions.sort((a, b) => (b.studentsAffected || 0) - (a.studentsAffected || 0) || a.title.localeCompare(b.title));

  const byCategory = {
    'Whole department': [],
    'Class level': [],
    'Students': []
  };

  for (const action of actions) {
    if (byCategory[action.category]) {
      byCategory[action.category].push(action);
    }
  }

  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => (b.studentsAffected || 0) - (a.studentsAffected || 0));
  }

  const topPrioritiesCount = typeof thresholds.topPrioritiesCount === 'number'
    ? thresholds.topPrioritiesCount
    : DEFAULT_QLA_ACTION_THRESHOLDS.topPrioritiesCount;

  const topPriorities = selectTopPriorities(actions, topPrioritiesCount);

  const totalStudentsAffected = actions.reduce((sum, a) => sum + (a.studentsAffected || 0), 0);

  return {
    actions,
    topPriorities,
    byCategory,
    totalActions: actions.length,
    totalStudentsAffected
  };
}

/**
 * Formats actions as clean, professional plain text for copying into an email.
 * Strictly respects anonymisation and never includes full student names.
 * Copies the Top 5 priorities first, followed by the full list by category.
 *
 * @param {Array<Object>|Object} actionsData - Array of actions or report object with byCategory
 * @param {Object} options - { dateStr, schoolName, isNameHidden }
 * @returns {string} Plain text formatted email content
 */
export function formatActionsAsEmailText(actionsData, options = {}) {
  const dateStr = options.dateStr || '24 September 2026';
  const schoolName = options.schoolName || 'Dixons Unity Academy';

  let actionsList = [];
  let topPriorities = [];
  let byCat = {
    'Whole department': [],
    'Class level': [],
    'Students': []
  };

  if (actionsData && actionsData.actions) {
    actionsList = actionsData.actions;
    topPriorities = actionsData.topPriorities || selectTopPriorities(actionsList, 5);
    byCat = actionsData.byCategory || byCat;
  } else if (Array.isArray(actionsData)) {
    actionsList = actionsData;
    topPriorities = selectTopPriorities(actionsList, 5);
    for (const a of actionsList) {
      if (byCat[a.category]) byCat[a.category].push(a);
    }
  }

  const lines = [
    `QLA Targeted Actions - ${schoolName}`,
    `Generated: ${dateStr}`,
    ''
  ];

  // TOP PRIORITIES SECTION
  const topCount = topPriorities.length;
  lines.push(`TOP ${topCount} PRIORITIES`);
  lines.push('----------------------------------------');

  if (topPriorities.length === 0) {
    lines.push('No priorities currently identified.');
  } else {
    topPriorities.forEach((a, idx) => {
      const studentSuffix = a.studentsAffected > 0 ? ` (${a.studentsAffected} student${a.studentsAffected === 1 ? '' : 's'} affected)` : '';
      lines.push(`${idx + 1}. ${a.title}${studentSuffix}`);
      if (a.why) {
        lines.push(`   ${a.why}`);
      }
    });
  }
  lines.push('');

  // FULL LIST BY CATEGORY SECTION
  lines.push('FULL ACTION LIST BY CATEGORY');
  lines.push('========================================');
  lines.push('');

  const categories = ['Whole department', 'Class level', 'Students'];

  for (const cat of categories) {
    const catActions = byCat[cat] || [];
    lines.push(cat.toUpperCase());
    lines.push('----------------------------------------');

    if (catActions.length === 0) {
      lines.push('No actions currently required in this category.');
    } else {
      for (const a of catActions) {
        const studentSuffix = a.studentsAffected > 0 ? ` (${a.studentsAffected} student${a.studentsAffected === 1 ? '' : 's'} affected)` : '';
        lines.push(`• ${a.title}${studentSuffix}`);
        if (a.why) {
          lines.push(`  ${a.why}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
