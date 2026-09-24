/**
 * Pure QLA Statistics and Calculation Module
 * Provides pure functions for calculating question-level analysis statistics across
 * papers, tiers, classes, and sections.
 * 
 * Strict rules:
 * - Pure calculations only. No DOM, no browser storage, no network.
 * - Absent students (status === 'absent') NEVER count in any count, average, median, or percentage.
 * - Foundation and Higher tiers are NEVER averaged together.
 * - Classes respect the active grouping (student.activeClass).
 */

/**
 * Filter students by class, SEN, and disadvantaged status.
 *
 * @param {Array<Object>} students
 * @param {Object} filters - { class?: string, sen?: string, disadvantaged?: string }
 * @returns {Array<Object>}
 */
export function filterQlaStudents(students = [], filters = {}) {
  const { className = 'ALL', sen = 'ALL', disadvantaged = 'ALL' } = filters;

  return students.filter(student => {
    // 1. Class filter (matches activeClass)
    if (className && className !== 'ALL') {
      const studentClass = student.activeClass || student.className || student.currentClass;
      if (studentClass !== className) return false;
    }

    // 2. SEN filter
    if (sen && sen !== 'ALL') {
      const studentSen = student.sen || 'No SEN';
      if (sen === 'ALL_SEN') {
        if (studentSen === 'No SEN' || studentSen === 'No') return false;
      } else {
        if (studentSen !== sen) return false;
      }
    }

    // 3. Disadvantaged filter
    if (disadvantaged && disadvantaged !== 'ALL') {
      const studentDis = student.disadvantaged || 'No';
      if (studentDis !== disadvantaged) return false;
    }

    return true;
  });
}

/**
 * Calculates the median of an array of numbers.
 *
 * @param {number[]} numbers
 * @returns {number|null}
 */
export function calculateMedian(numbers = []) {
  if (!numbers || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculates statistics for a single paper, applying filters and strictly
 * excluding absent students.
 *
 * @param {Object} paper - Parsed paper object
 * @param {Object} filters - Tab filters { class?: string, sen?: string, disadvantaged?: string, tier?: string }
 * @returns {Object} Paper statistics
 */
export function calculatePaperStats(paper, filters = {}) {
  if (!paper) return null;

  // Check tier filter
  if (filters.tier && filters.tier !== 'ALL' && paper.tier !== filters.tier) {
    return null;
  }

  // Filter students by demographics/class
  const filteredStudents = filterQlaStudents(paper.students || [], filters);

  // Strictly exclude absent students: only 'present' and 'incomplete' count
  const eligibleStudents = filteredStudents.filter(
    s => s.status === 'present' || s.status === 'incomplete'
  );

  const n = eligibleStudents.length;

  if (n === 0) {
    return {
      sheetName: paper.sheetName,
      paper: paper.paper,
      tier: paper.tier,
      totalMax: paper.totalMax,
      n: 0,
      avgPct: null,
      medianPct: null,
      pctAtOrAbove50: null,
      countAtOrAbove50: 0,
      highestScore: null,
      lowestScore: null,
      sections: []
    };
  }

  // Calculate percentages for each eligible student
  const studentStats = eligibleStudents.map(s => {
    const total = typeof s.total === 'number' ? s.total : 0;
    const pct = paper.totalMax > 0 ? (total / paper.totalMax) * 100 : 0;
    return {
      student: s,
      total,
      pct
    };
  });

  const pcts = studentStats.map(s => s.pct);
  const totals = studentStats.map(s => s.total);

  // Average %
  const sumPct = pcts.reduce((sum, p) => sum + p, 0);
  const avgPct = Math.round((sumPct / n) * 10) / 10;

  // Median %
  const rawMedian = calculateMedian(pcts);
  const medianPct = rawMedian !== null ? Math.round(rawMedian * 10) / 10 : null;

  // % at 50% or more
  const countAtOrAbove50 = studentStats.filter(s => s.pct >= 50).length;
  const pctAtOrAbove50 = Math.round((countAtOrAbove50 / n) * 1000) / 10;

  // Highest and lowest scores
  let highest = studentStats[0];
  let lowest = studentStats[0];

  for (let i = 1; i < studentStats.length; i++) {
    if (studentStats[i].total > highest.total) {
      highest = studentStats[i];
    }
    if (studentStats[i].total < lowest.total) {
      lowest = studentStats[i];
    }
  }

  const highestScore = {
    marks: highest.total,
    totalMax: paper.totalMax,
    pct: Math.round(highest.pct * 10) / 10,
    studentName: highest.student.name
  };

  const lowestScore = {
    marks: lowest.total,
    totalMax: paper.totalMax,
    pct: Math.round(lowest.pct * 10) / 10,
    studentName: lowest.student.name
  };

  // Section averages within this paper (e.g. Section A vs Section B)
  const sections = calculateSectionAverages(paper, eligibleStudents);

  return {
    sheetName: paper.sheetName,
    paper: paper.paper,
    tier: paper.tier,
    totalMax: paper.totalMax,
    n,
    avgPct,
    medianPct,
    pctAtOrAbove50,
    countAtOrAbove50,
    highestScore,
    lowestScore,
    sections
  };
}

/**
 * Calculates section averages for a paper where sections are present.
 *
 * @param {Object} paper
 * @param {Array<Object>} eligibleStudents
 * @returns {Array<Object>} Array of section summaries
 */
export function calculateSectionAverages(paper, eligibleStudents = []) {
  if (!paper.questions || paper.questions.length === 0 || eligibleStudents.length === 0) {
    return [];
  }

  // Find distinct section names (e.g. 'Section A', 'Section B')
  const sectionMap = new Map();
  for (const q of paper.questions) {
    const sName = (q.section || '').trim();
    if (sName) {
      if (!sectionMap.has(sName)) {
        sectionMap.set(sName, []);
      }
      sectionMap.get(sName).push(q);
    }
  }

  // Only report if there are at least two distinct sections (e.g. Section A against Section B)
  if (sectionMap.size < 2) {
    return [];
  }

  const results = [];
  const n = eligibleStudents.length;

  for (const [sectionName, questions] of sectionMap.entries()) {
    const sectionMax = questions.reduce((sum, q) => sum + (q.maxMarks || 0), 0);
    if (sectionMax <= 0) continue;

    let totalSectionPctSum = 0;

    for (const student of eligibleStudents) {
      let studentSectionMarks = 0;
      for (const q of questions) {
        const mark = student.marks ? student.marks[q.key] : null;
        if (typeof mark === 'number' && !isNaN(mark)) {
          studentSectionMarks += mark;
        }
      }
      const studentPct = (studentSectionMarks / sectionMax) * 100;
      totalSectionPctSum += studentPct;
    }

    const avgPct = Math.round((totalSectionPctSum / n) * 10) / 10;

    results.push({
      section: sectionName,
      questionCount: questions.length,
      maxMarks: sectionMax,
      avgPct
    });
  }

  return results;
}

/**
 * Calculates strongest and weakest papers overall by average %, separated strictly
 * by Foundation and Higher tiers.
 *
 * @param {Array<Object>} papers
 * @param {Object} filters
 * @returns {{ foundation: { strongest: Object|null, weakest: Object|null }, higher: { strongest: Object|null, weakest: Object|null } }}
 */
export function calculateCohortTierHighlights(papers = [], filters = {}) {
  const highlights = {
    foundation: { strongest: null, weakest: null },
    higher: { strongest: null, weakest: null }
  };

  const foundationPapers = [];
  const higherPapers = [];

  for (const p of papers) {
    const stats = calculatePaperStats(p, filters);
    if (!stats || stats.n === 0 || stats.avgPct === null) continue;

    if (p.tier === 'Foundation') {
      foundationPapers.push(stats);
    } else if (p.tier === 'Higher') {
      higherPapers.push(stats);
    }
  }

  // Foundation
  if (foundationPapers.length > 0) {
    foundationPapers.sort((a, b) => b.avgPct - a.avgPct);
    highlights.foundation.strongest = foundationPapers[0];
    highlights.foundation.weakest = foundationPapers[foundationPapers.length - 1];
  }

  // Higher
  if (higherPapers.length > 0) {
    higherPapers.sort((a, b) => b.avgPct - a.avgPct);
    highlights.higher.strongest = higherPapers[0];
    highlights.higher.weakest = higherPapers[higherPapers.length - 1];
  }

  return highlights;
}

/**
 * Calculates the class by paper matrix.
 * Compares class average against the cohort average for each paper.
 * Colour coding rules:
 * - Green: >= +5.0 points above cohort average
 * - Red:   <= -5.0 points below cohort average
 * - Amber: within 5.0 points (-5.0 < diff < +5.0)
 * - Greyed out if n < 5: cell flagged as tooFew with tooltip "too few to compare".
 *
 * @param {Array<Object>} papers
 * @param {Object} filters
 * @returns {{ papers: Array<Object>, classes: Array<string>, rows: Array<Object>, cohortAverages: Object }}
 */
export function calculateClassPaperMatrix(papers = [], filters = {}) {
  // Filter papers by tier filter if specified
  const eligiblePapers = papers.filter(p => {
    if (filters.tier && filters.tier !== 'ALL' && p.tier !== filters.tier) {
      return false;
    }
    return true;
  });

  // Calculate cohort baseline for each paper using demographic filters (without class filter)
  const cohortFilter = { ...filters, className: 'ALL' };
  const cohortAverages = {};
  for (const p of eligiblePapers) {
    const cStats = calculatePaperStats(p, cohortFilter);
    cohortAverages[p.sheetName] = cStats ? cStats.avgPct : null;
  }

  // Collect distinct active classes across all eligible papers
  const classSet = new Set();
  for (const p of eligiblePapers) {
    for (const s of p.students || []) {
      const cls = s.activeClass || s.className || s.currentClass;
      if (cls && cls !== 'Unassigned') {
        classSet.add(cls);
      }
    }
  }

  let classes = Array.from(classSet).sort();

  // If a specific class filter is set, only show that class
  if (filters.className && filters.className !== 'ALL') {
    classes = classes.filter(c => c === filters.className);
  }

  // Build rows for each class
  const rows = classes.map(cls => {
    const classCells = {};

    for (const p of eligiblePapers) {
      const classPaperStats = calculatePaperStats(p, {
        ...filters,
        className: cls
      });

      const n = classPaperStats ? classPaperStats.n : 0;
      const avgPct = classPaperStats ? classPaperStats.avgPct : null;
      const cohortAvg = cohortAverages[p.sheetName];

      const tooFew = n < 5;
      let band = null;
      let diff = null;

      if (avgPct !== null && cohortAvg !== null) {
        diff = Math.round((avgPct - cohortAvg) * 10) / 10;
        if (diff >= 5.0) {
          band = 'green';
        } else if (diff <= -5.0) {
          band = 'red';
        } else {
          band = 'amber';
        }
      }

      classCells[p.sheetName] = {
        sheetName: p.sheetName,
        paper: p.paper,
        tier: p.tier,
        n,
        avgPct,
        cohortAvg,
        diff,
        band,
        tooFew,
        tooltip: tooFew ? 'too few to compare' : null
      };
    }

    return {
      className: cls,
      cells: classCells
    };
  });

  return {
    papers: eligiblePapers.map(p => ({
      sheetName: p.sheetName,
      paper: p.paper,
      tier: p.tier,
      cohortAvg: cohortAverages[p.sheetName]
    })),
    classes,
    rows,
    cohortAverages
  };
}

/**
 * Shared helper to pick strongest and weakest paper strictly within the same tier.
 * Foundation and Higher percentages are NEVER compared, ranked, averaged or mixed.
 *
 * Rules:
 * - Strongest and weakest paper are only ever chosen from papers of the same tier.
 * - Foundation and Higher percentages are never compared, ranked, averaged or put in the same list.
 * - If minPapers is 2 (for students), requires >= 2 papers sat in a tier to pick strongest and weakest.
 * - If a student sat papers in both tiers:
 *     - If they sat more papers in one tier, use that tier.
 *     - If equal, evaluate each tier separately (or 'not enough papers' if < 2).
 *     - Student is marked "Mixed tiers".
 * - If minPapers is 1 (for class/cohort highlights), picks from available papers in that tier.
 *
 * @param {Array<Object>} papersWithScore - Array of { paper, tier, pct|avgPct, ... }
 * @param {Object} options - { minPapers?: number, scoreKey?: string }
 * @returns {Object}
 */
export function pickStrongestWeakestWithinTier(papersWithScore = [], options = {}) {
  const minPapers = typeof options.minPapers === 'number' ? options.minPapers : 2;
  const scoreKey = options.scoreKey || 'pct';

  if (!Array.isArray(papersWithScore) || papersWithScore.length === 0) {
    return {
      byTier: {},
      foundation: null,
      higher: null,
      primaryTier: null,
      isMixedTiers: false,
      strongestSummary: 'not enough papers',
      weakestSummary: 'not enough papers',
      strongestObj: null,
      weakestObj: null
    };
  }

  // 1. Group papers strictly by tier
  const tierMap = new Map();
  for (const p of papersWithScore) {
    const rawTier = (p.tier || '').trim();
    const tier = /foundation/i.test(rawTier) ? 'Foundation' : (/higher/i.test(rawTier) ? 'Higher' : (rawTier || 'Unknown'));
    if (!tierMap.has(tier)) {
      tierMap.set(tier, []);
    }
    tierMap.get(tier).push(p);
  }

  const byTier = {};
  const tiers = Array.from(tierMap.keys());
  const isMixedTiers = tiers.length > 1;

  for (const tier of tiers) {
    const pList = tierMap.get(tier);
    // Sort descending by score
    const sorted = [...pList].sort((a, b) => {
      const valA = typeof a[scoreKey] === 'number' ? a[scoreKey] : (typeof a.pct === 'number' ? a.pct : 0);
      const valB = typeof b[scoreKey] === 'number' ? b[scoreKey] : (typeof b.pct === 'number' ? b.pct : 0);
      return valB - valA;
    });

    const hasEnough = sorted.length >= minPapers;
    const strongest = hasEnough ? sorted[0] : null;
    const weakest = hasEnough ? sorted[sorted.length - 1] : null;

    const tShort = tier === 'Foundation' ? 'F' : tier === 'Higher' ? 'H' : '';
    const strongestLabel = strongest ? `${strongest.paper} ${tShort}`.trim() : 'not enough papers';
    const weakestLabel = weakest ? `${weakest.paper} ${tShort}`.trim() : 'not enough papers';

    byTier[tier] = {
      tier,
      papers: sorted,
      count: sorted.length,
      hasEnough,
      strongest,
      weakest,
      strongestLabel,
      weakestLabel
    };
  }

  const foundation = byTier['Foundation'] || null;
  const higher = byTier['Higher'] || null;

  let strongestSummary = 'not enough papers';
  let weakestSummary = 'not enough papers';
  let strongestObj = null;
  let weakestObj = null;
  let primaryTier = null;

  if (tiers.length === 1) {
    const tData = byTier[tiers[0]];
    primaryTier = tiers[0];
    if (tData && tData.hasEnough) {
      strongestSummary = tData.strongestLabel;
      weakestSummary = tData.weakestLabel;
      strongestObj = tData.strongest;
      weakestObj = tData.weakest;
    }
  } else if (isMixedTiers) {
    // Check if one tier has strictly more papers
    const sortedByCount = [...tiers].sort((tA, tB) => byTier[tB].count - byTier[tA].count);
    const topTier = sortedByCount[0];
    const secondTier = sortedByCount[1];

    if (byTier[topTier].count > byTier[secondTier].count) {
      // Use the tier they sat most papers in
      primaryTier = topTier;
      const tData = byTier[topTier];
      if (tData && tData.hasEnough) {
        strongestSummary = tData.strongestLabel;
        weakestSummary = tData.weakestLabel;
        strongestObj = tData.strongest;
        weakestObj = tData.weakest;
      }
    } else {
      // Equal count between top tiers (e.g. 1 F and 1 H, or 2 F and 2 H)
      primaryTier = 'Equal';
      const validTiersWithEnough = tiers.filter(t => byTier[t].hasEnough);
      if (validTiersWithEnough.length > 0) {
        strongestSummary = validTiersWithEnough.map(t => `${t}: ${byTier[t].strongestLabel}`).join('; ');
        weakestSummary = validTiersWithEnough.map(t => `${t}: ${byTier[t].weakestLabel}`).join('; ');
        strongestObj = byTier[validTiersWithEnough[0]].strongest;
        weakestObj = byTier[validTiersWithEnough[0]].weakest;
      } else {
        strongestSummary = 'not enough papers';
        weakestSummary = 'not enough papers';
      }
    }
  }

  return {
    byTier,
    foundation,
    higher,
    primaryTier,
    isMixedTiers,
    strongestSummary,
    weakestSummary,
    strongestObj,
    weakestObj
  };
}

/**
 * Calculates one-line strongest and weakest paper summary for each class strictly per tier.
 * Skips papers where the class has fewer than 5 students.
 * Foundation and Higher papers are NEVER paired or compared together.
 * Format example: "10 Sp3 Foundation: strongest Reading F (64%), weakest Writing F (41%)"
 *
 * @param {Array<Object>} papers
 * @param {Object} filters
 * @returns {Array<Object>} List of class highlight objects
 */
export function calculateClassPaperHighlights(papers = [], filters = {}) {
  const matrix = calculateClassPaperMatrix(papers, filters);
  const highlights = [];

  for (const row of matrix.rows) {
    const validPapers = [];

    for (const paperInfo of matrix.papers) {
      const cell = row.cells[paperInfo.sheetName];
      // Skip papers where the class has fewer than 5 students
      if (cell && !cell.tooFew && cell.avgPct !== null) {
        validPapers.push({
          sheetName: cell.sheetName,
          paper: cell.paper,
          tier: cell.tier,
          avgPct: cell.avgPct,
          n: cell.n
        });
      }
    }

    if (validPapers.length === 0) {
      highlights.push({
        className: row.className,
        hasEnoughData: false,
        summaryText: `${row.className}: too few students across papers to compare`,
        strongest: null,
        weakest: null
      });
      continue;
    }

    // Pick strongest and weakest strictly per tier using shared helper
    const tierResult = pickStrongestWeakestWithinTier(validPapers, { minPapers: 1, scoreKey: 'avgPct' });
    let hasAdded = false;

    // Foundation
    if (tierResult.foundation && tierResult.foundation.hasEnough) {
      const s = tierResult.foundation.strongest;
      const w = tierResult.foundation.weakest;
      const sLabel = `${s.paper} F`;
      const wLabel = `${w.paper} F`;
      const summaryText = `${row.className} Foundation: strongest ${sLabel} (${Math.round(s.avgPct)}%), weakest ${wLabel} (${Math.round(w.avgPct)}%)`;
      highlights.push({
        className: row.className,
        tier: 'Foundation',
        hasEnoughData: true,
        summaryText,
        strongest: s,
        weakest: w
      });
      hasAdded = true;
    }

    // Higher
    if (tierResult.higher && tierResult.higher.hasEnough) {
      const s = tierResult.higher.strongest;
      const w = tierResult.higher.weakest;
      const sLabel = `${s.paper} H`;
      const wLabel = `${w.paper} H`;
      const summaryText = `${row.className} Higher: strongest ${sLabel} (${Math.round(s.avgPct)}%), weakest ${wLabel} (${Math.round(w.avgPct)}%)`;
      highlights.push({
        className: row.className,
        tier: 'Higher',
        hasEnoughData: true,
        summaryText,
        strongest: s,
        weakest: w
      });
      hasAdded = true;
    }

    // Other tiers if present
    for (const [tName, tData] of Object.entries(tierResult.byTier)) {
      if (tName !== 'Foundation' && tName !== 'Higher' && tData.hasEnough) {
        const s = tData.strongest;
        const w = tData.weakest;
        const summaryText = `${row.className} ${tName}: strongest ${tData.strongestLabel} (${Math.round(s.avgPct)}%), weakest ${tData.weakestLabel} (${Math.round(w.avgPct)}%)`;
        highlights.push({
          className: row.className,
          tier: tName,
          hasEnoughData: true,
          summaryText,
          strongest: s,
          weakest: w
        });
        hasAdded = true;
      }
    }

    if (!hasAdded) {
      highlights.push({
        className: row.className,
        hasEnoughData: false,
        summaryText: `${row.className}: too few students across papers to compare`,
        strongest: null,
        weakest: null
      });
    }
  }

  return highlights;
}

/**
 * Extracts all assessment objective (AO) tags from a question label string.
 * Example: "Q4 90 word task AO2 AO3" -> ["AO2", "AO3"]
 *
 * @param {string} label
 * @returns {Array<string>} Unique uppercase AO tags
 */
export function extractAosFromLabel(label = '') {
  if (!label || typeof label !== 'string') return [];
  const matches = label.match(/AO[1-9]/gi);
  if (!matches) return [];
  const unique = [];
  for (const m of matches) {
    const upper = m.toUpperCase();
    if (!unique.includes(upper)) {
      unique.push(upper);
    }
  }
  return unique;
}

/**
 * Calculates question-level statistics for a paper:
 * facility %, zero rate, discrimination, facility band, and quality flags.
 *
 * @param {Object} paper
 * @param {Object} filters - Demographic/class filters
 * @param {Object} thresholds - { strong: number, weak: number }
 * @returns {Object} Question stats object
 */
export function calculateQuestionStats(paper, filters = {}, thresholds = { strong: 70, weak: 40 }) {
  if (!paper || !paper.questions || paper.questions.length === 0) {
    return {
      paper: paper?.paper || '',
      tier: paper?.tier || '',
      n: 0,
      questions: []
    };
  }

  const strongThresh = typeof thresholds?.strong === 'number' ? thresholds.strong : 70;
  const weakThresh = typeof thresholds?.weak === 'number' ? thresholds.weak : 40;

  // Filter students (Class, SEN, Disadvantaged)
  const filteredStudents = filterQlaStudents(paper.students || [], filters);

  // Strictly exclude absent students: only 'present' and 'incomplete' count
  const eligibleStudents = filteredStudents.filter(
    s => s.status === 'present' || s.status === 'incomplete'
  );

  const n = eligibleStudents.length;

  // Prepare sorted students by paper total for discrimination calculation
  const sortedStudents = [...eligibleStudents].sort((a, b) => {
    const totalA = typeof a.total === 'number' ? a.total : 0;
    const totalB = typeof b.total === 'number' ? b.total : 0;
    return totalB - totalA;
  });

  const kThird = Math.floor(n / 3);
  const canCalculateDiscrimination = n >= 9 && kThird > 0;
  const topThird = canCalculateDiscrimination ? sortedStudents.slice(0, kThird) : [];
  const bottomThird = canCalculateDiscrimination ? sortedStudents.slice(n - kThird) : [];

  const questionStats = paper.questions.map((q, idx) => {
    const maxMarks = q.maxMarks || 0;
    const aos = extractAosFromLabel(q.label);
    const aoDisplay = aos.length > 0 ? aos.join(', ') : (q.ao || '');

    if (n === 0 || maxMarks <= 0) {
      return {
        key: q.key || `q${idx + 1}`,
        label: q.label || `Q${idx + 1}`,
        section: q.section || '',
        topic: q.topic || 'General',
        ao: aoDisplay,
        aos,
        maxMarks,
        facility: null,
        zeroRate: null,
        discrimination: null,
        facilityBand: null,
        qualityFlags: []
      };
    }

    // 1. Facility % = total marks gained / (students present * question maximum)
    let totalMarks = 0;
    let zeroCount = 0;

    for (const student of eligibleStudents) {
      const rawMark = student.marks ? student.marks[q.key] : null;
      const mark = (typeof rawMark === 'number' && !isNaN(rawMark)) ? rawMark : 0;
      totalMarks += mark;
      if (mark === 0) {
        zeroCount++;
      }
    }

    const maxPossible = n * maxMarks;
    const facility = maxPossible > 0 ? Math.round((totalMarks / maxPossible) * 1000) / 10 : 0;

    // 2. Zero rate % = % of present students scoring 0
    const zeroRate = Math.round((zeroCount / n) * 1000) / 10;

    // 3. Discrimination: facility of top third minus facility of bottom third (in percentage points)
    let discrimination = null;
    if (canCalculateDiscrimination) {
      let topMarks = 0;
      for (const st of topThird) {
        const m = (st.marks && typeof st.marks[q.key] === 'number') ? st.marks[q.key] : 0;
        topMarks += m;
      }
      const topFacility = (topMarks / (kThird * maxMarks)) * 100;

      let bottomMarks = 0;
      for (const st of bottomThird) {
        const m = (st.marks && typeof st.marks[q.key] === 'number') ? st.marks[q.key] : 0;
        bottomMarks += m;
      }
      const bottomFacility = (bottomMarks / (kThird * maxMarks)) * 100;

      discrimination = Math.round((topFacility - bottomFacility) * 10) / 10;
    }

    // 4. Facility Band
    let facilityBand = 'secure';
    if (facility >= strongThresh) {
      facilityBand = 'strong';
    } else if (facility < weakThresh) {
      facilityBand = 'weak';
    }

    // 5. Quality Flags
    const qualityFlags = [];
    if (discrimination !== null) {
      if (discrimination < 0) {
        qualityFlags.push('Weaker students did better. Check the question or the marking.');
      } else if (discrimination < 10) {
        qualityFlags.push('Does not separate stronger and weaker students.');
      }
    }
    if (zeroRate >= 30) {
      qualityFlags.push('Many students scored nothing. Possibly not attempted.');
    }

    return {
      key: q.key || `q${idx + 1}`,
      label: q.label || `Q${idx + 1}`,
      section: q.section || '',
      topic: q.topic || 'General',
      ao: aoDisplay,
      aos,
      maxMarks,
      facility,
      zeroRate,
      discrimination,
      facilityBand,
      qualityFlags
    };
  });

  return {
    paper: paper.paper,
    tier: paper.tier,
    sheetName: paper.sheetName,
    n,
    questions: questionStats
  };
}

/**
 * Calculates Best 3 and Worst 3 questions by facility % for the whole cohort
 * and for each class with at least 5 present students.
 *
 * @param {Object} paper
 * @param {Object} filters
 * @param {number} count - Default 3
 * @returns {Object} { cohortBest, cohortWorst, classBreakdowns }
 */
export function calculateBestAndWorstQuestions(paper, filters = {}, count = 3) {
  if (!paper || !paper.questions || paper.questions.length === 0) {
    return { cohortBest: [], cohortWorst: [], classBreakdowns: [] };
  }

  // 1. Cohort Best and Worst
  const cohortStats = calculateQuestionStats(paper, filters);
  const validCohortQuestions = cohortStats.questions.filter(q => q.facility !== null);

  const sortedCohortDesc = [...validCohortQuestions].sort((a, b) => b.facility - a.facility);
  const cohortBest = sortedCohortDesc.slice(0, count);
  const cohortWorst = [...sortedCohortDesc].reverse().slice(0, count);

  // 2. Class Breakdowns (only for classes with >= 5 present students)
  const classSet = new Set();
  for (const s of paper.students || []) {
    const cls = s.activeClass || s.className || s.currentClass;
    if (cls && cls !== 'Unassigned') classSet.add(cls);
  }
  const classes = Array.from(classSet).sort();

  const classBreakdowns = [];

  for (const cls of classes) {
    const classStats = calculateQuestionStats(paper, { ...filters, className: cls });
    // Leave out classes with fewer than 5 present students
    if (classStats.n < 5) continue;

    const validClassQuestions = classStats.questions.filter(q => q.facility !== null);
    const sortedClassDesc = [...validClassQuestions].sort((a, b) => b.facility - a.facility);
    const best = sortedClassDesc.slice(0, count);
    const worst = [...sortedClassDesc].reverse().slice(0, count);

    classBreakdowns.push({
      className: cls,
      n: classStats.n,
      best,
      worst
    });
  }

  return {
    cohortBest,
    cohortWorst,
    classBreakdowns
  };
}

/**
 * Calculates question by class heatmap data.
 * Highlights cells 10 or more points below the cohort facility for that question.
 * Greys out classes with fewer than 5 present students.
 *
 * @param {Object} paper
 * @param {Object} filters
 * @returns {Object} { questions, classes, rows, cohortFacilities }
 */
export function calculateQuestionHeatmap(paper, filters = {}) {
  if (!paper || !paper.questions || paper.questions.length === 0) {
    return { questions: [], classes: [], rows: [], cohortFacilities: {} };
  }

  // 1. Calculate cohort baseline for each question
  const cohortStats = calculateQuestionStats(paper, { ...filters, className: 'ALL' });
  const cohortFacilities = {};
  for (const q of cohortStats.questions) {
    cohortFacilities[q.key] = q.facility;
  }

  // 2. Identify classes present on this paper
  const classSet = new Set();
  for (const s of paper.students || []) {
    const cls = s.activeClass || s.className || s.currentClass;
    if (cls && cls !== 'Unassigned') classSet.add(cls);
  }
  let classes = Array.from(classSet).sort();

  if (filters.className && filters.className !== 'ALL') {
    classes = classes.filter(c => c === filters.className);
  }

  // Pre-calculate stats for each class
  const classStatsMap = {};
  for (const cls of classes) {
    classStatsMap[cls] = calculateQuestionStats(paper, { ...filters, className: cls });
  }

  // 3. Build rows: one row per question
  const rows = cohortStats.questions.map(q => {
    const cells = {};

    for (const cls of classes) {
      const cStats = classStatsMap[cls];
      const classQ = cStats.questions.find(item => item.key === q.key);
      const n = cStats.n;
      const tooFew = n < 5;

      const cohortFac = cohortFacilities[q.key];
      const classFac = classQ ? classQ.facility : null;

      let diff = null;
      let flagged = false;

      if (!tooFew && classFac !== null && cohortFac !== null) {
        diff = Math.round((cohortFac - classFac) * 10) / 10;
        // Highlight any cell 10 or more points below cohort facility
        if (diff >= 10.0) {
          flagged = true;
        }
      }

      cells[cls] = {
        className: cls,
        n,
        facility: classFac,
        cohortFacility: cohortFac,
        diff,
        tooFew,
        tooltip: tooFew ? 'too few to compare' : null,
        flagged
      };
    }

    return {
      key: q.key,
      label: q.label,
      section: q.section,
      topic: q.topic,
      ao: q.ao,
      maxMarks: q.maxMarks,
      cohortFacility: cohortFacilities[q.key],
      cells
    };
  });

  return {
    questions: cohortStats.questions,
    classes: classes.map(cls => ({
      className: cls,
      n: classStatsMap[cls]?.n || 0,
      tooFew: (classStatsMap[cls]?.n || 0) < 5
    })),
    rows,
    cohortFacilities
  };
}

/**
 * Calculates Topic Summary and AO Summary.
 * - Topic summary: average facility per topic.
 * - AO summary: only if paper has AO labels. A question labelled with two AOs
 *   (e.g. "AO2 AO3") counts towards both.
 *
 * @param {Object} paper
 * @param {Object} filters
 * @returns {Object} { topics: Array, aos: Array, hasAOs: boolean }
 */
export function calculateTopicAndAOSummaries(paper, filters = {}) {
  const qStats = calculateQuestionStats(paper, filters);
  const questions = qStats.questions.filter(q => q.facility !== null);

  if (questions.length === 0) {
    return { topics: [], aos: [], hasAOs: false };
  }

  // 1. Topic Summary
  const topicMap = new Map();
  for (const q of questions) {
    const topic = q.topic || 'General';
    if (!topicMap.has(topic)) {
      topicMap.set(topic, []);
    }
    topicMap.get(topic).push(q);
  }

  const topics = [];
  for (const [topic, qList] of topicMap.entries()) {
    const totalFacility = qList.reduce((sum, item) => sum + item.facility, 0);
    const avgFacility = Math.round((totalFacility / qList.length) * 10) / 10;
    const totalMax = qList.reduce((sum, item) => sum + item.maxMarks, 0);

    topics.push({
      topic,
      questionCount: qList.length,
      maxMarks: totalMax,
      avgFacility
    });
  }
  topics.sort((a, b) => b.avgFacility - a.avgFacility);

  // 2. AO Summary
  const aoMap = new Map();
  let hasAnyAo = false;

  for (const q of questions) {
    const aos = q.aos && q.aos.length > 0 ? q.aos : extractAosFromLabel(q.label);
    if (aos.length > 0) {
      hasAnyAo = true;
      for (const ao of aos) {
        if (!aoMap.has(ao)) {
          aoMap.set(ao, []);
        }
        aoMap.get(ao).push(q);
      }
    }
  }

  const aos = [];
  if (hasAnyAo) {
    for (const [ao, qList] of aoMap.entries()) {
      const totalFacility = qList.reduce((sum, item) => sum + item.facility, 0);
      const avgFacility = Math.round((totalFacility / qList.length) * 10) / 10;
      const totalMax = qList.reduce((sum, item) => sum + item.maxMarks, 0);

      aos.push({
        ao,
        questionCount: qList.length,
        maxMarks: totalMax,
        avgFacility
      });
    }
    aos.sort((a, b) => a.ao.localeCompare(b.ao));
  }

  return {
    topics,
    aos,
    hasAOs: hasAnyAo
  };
}

/**
 * Identifies dictation and translation questions in a paper (any label containing
 * "dictation" or "translation", case-insensitive) and compiles their metrics.
 *
 * @param {Object} paper
 * @param {Object} filters
 * @param {Object} thresholds
 * @returns {Object} { hasSpecialQuestions, questions }
 */
export function getDictationAndTranslationQuestions(paper, filters = {}, thresholds) {
  const qStats = calculateQuestionStats(paper, filters, thresholds);
  const matched = qStats.questions.filter(q => /dictation|translation/i.test(q.label));

  return {
    hasSpecialQuestions: matched.length > 0,
    questions: matched
  };
}

/**
 * Calculates a comprehensive class-level report comparing a single class against the cohort.
 * Reuses existing functions: calculatePaperStats, calculateQuestionStats, filterQlaStudents.
 *
 * @param {Array<Object>} papers - Array of QLA papers
 * @param {string} className - Selected class name
 * @param {Object} thresholds - Facility thresholds { strong, weak }
 * @returns {Object} Class report object
 */
export function calculateClassReport(papers = [], className = '', thresholds = { strong: 70, weak: 40 }) {
  if (!className || !Array.isArray(papers) || papers.length === 0) {
    return {
      className: className || '',
      totalStudents: 0,
      satAtLeastOneCount: 0,
      absencesPerPaper: [],
      paperSummaries: [],
      strongestPaper: null,
      weakestPaper: null,
      hasEnoughPaperData: false,
      bestQuestions: [],
      worstQuestions: [],
      furthestBelowCohort: [],
      beatingCohort: [],
      hasEnoughQuestionData: false,
      students: []
    };
  }

  // 1. Gather all distinct students registered in this class across papers
  const studentMap = new Map(); // key -> student info
  for (const paper of papers) {
    for (const s of paper.students || []) {
      const cls = s.activeClass || s.className || s.currentClass;
      if (cls === className) {
        const key = s.nameKey || s.name || `${s.surname}_${s.firstName}`;
        if (!studentMap.has(key)) {
          studentMap.set(key, {
            name: s.name,
            surname: s.surname,
            firstName: s.firstName,
            nameKey: key,
            displayResult: s.displayResult || (s.result != null ? String(s.result) : '-'),
            result: s.result ?? null,
            points: s.points ?? null,
            sen: s.sen || 'No SEN',
            disadvantaged: s.disadvantaged || 'No',
            activeClass: cls,
            snapshotRecord: s.snapshotRecord || null,
            paperStatuses: {},
            paperPercentages: {},
            tiers: new Set()
          });
        }
        const st = studentMap.get(key);
        st.paperStatuses[paper.sheetName] = s.status;
        if (s.status !== 'absent' && typeof s.percentage === 'number') {
          st.paperPercentages[paper.sheetName] = s.percentage;
        } else if (s.status === 'absent') {
          st.paperPercentages[paper.sheetName] = null;
        }
        if (paper.tier) {
          st.tiers.add(paper.tier);
        }
      }
    }
  }

  const classStudentsList = Array.from(studentMap.values());
  const totalStudents = classStudentsList.length;

  // Count students who sat at least one paper (i.e. status !== 'absent' on >= 1 paper)
  let satAtLeastOneCount = 0;
  for (const st of classStudentsList) {
    const hasSat = Object.values(st.paperStatuses).some(stat => stat === 'present' || stat === 'incomplete');
    if (hasSat) {
      satAtLeastOneCount++;
    }
  }

  // 2. Identify papers the class sat and absences per paper
  const absencesPerPaper = [];
  const paperSummaries = [];
  const eligiblePapersForHighlights = []; // papers where class has n >= 5 present students

  for (const paper of papers) {
    // Check students belonging to this class in this paper
    const studentsInPaper = (paper.students || []).filter(s => {
      const cls = s.activeClass || s.className || s.currentClass;
      return cls === className;
    });

    if (studentsInPaper.length === 0) continue; // Class did not sit this paper

    const absentCount = studentsInPaper.filter(s => s.status === 'absent').length;
    const presentCount = studentsInPaper.filter(s => s.status === 'present' || s.status === 'incomplete').length;

    absencesPerPaper.push({
      sheetName: paper.sheetName,
      paper: paper.paper,
      tier: paper.tier,
      absentCount,
      presentCount,
      totalCount: studentsInPaper.length
    });

    // Reuse existing calculatePaperStats
    const classStats = calculatePaperStats(paper, { className });
    const cohortStats = calculatePaperStats(paper, { className: 'ALL' });

    const n = classStats ? classStats.n : 0;
    const tooFew = n < 5;
    const classAvgPct = classStats ? classStats.avgPct : null;
    const cohortAvgPct = cohortStats ? cohortStats.avgPct : null;

    let diff = null;
    let band = null;

    if (classAvgPct !== null && cohortAvgPct !== null) {
      diff = Math.round((classAvgPct - cohortAvgPct) * 10) / 10;
      if (diff >= 5.0) {
        band = 'green';
      } else if (diff <= -5.0) {
        band = 'red';
      } else {
        band = 'amber';
      }
    }

    paperSummaries.push({
      sheetName: paper.sheetName,
      paper: paper.paper,
      tier: paper.tier,
      n,
      tooFew,
      classAvgPct,
      cohortAvgPct,
      diff,
      band
    });

    if (!tooFew && classAvgPct !== null) {
      eligiblePapersForHighlights.push({
        sheetName: paper.sheetName,
        paper: paper.paper,
        tier: paper.tier,
        avgPct: classAvgPct,
        diff,
        band
      });
    }
  }

  // 3. Strongest and Weakest Paper for this class per tier (only among papers with >= 5 present students)
  const tierHighlights = pickStrongestWeakestWithinTier(eligiblePapersForHighlights, { minPapers: 1, scoreKey: 'avgPct' });
  const hasEnoughPaperData = Object.values(tierHighlights.byTier).some(t => t.hasEnough);
  const strongestPaper = tierHighlights.strongestObj;
  const weakestPaper = tierHighlights.weakestObj;

  // 4. Questions Analysis for this class
  // Collect all questions from papers where class has >= 5 present students
  const eligibleQuestions = [];

  for (const paper of papers) {
    // Check if class has >= 5 present students on this paper
    const classStats = calculatePaperStats(paper, { className });
    if (!classStats || classStats.n < 5) continue; // Skip questions if < 5 students

    const classQStats = calculateQuestionStats(paper, { className }, thresholds);
    const cohortQStats = calculateQuestionStats(paper, { className: 'ALL' }, thresholds);

    const cohortMap = new Map();
    for (const cq of cohortQStats.questions) {
      cohortMap.set(cq.key, cq.facility);
    }

    for (const q of classQStats.questions) {
      if (q.facility === null) continue;
      const cohortFacility = cohortMap.has(q.key) ? cohortMap.get(q.key) : null;
      if (cohortFacility === null) continue;

      const gap = Math.round((q.facility - cohortFacility) * 10) / 10;

      eligibleQuestions.push({
        key: q.key,
        label: q.label,
        section: q.section,
        topic: q.topic,
        maxMarks: q.maxMarks,
        paper: paper.paper,
        tier: paper.tier,
        sheetName: paper.sheetName,
        classFacility: q.facility,
        cohortFacility,
        gap,
        facilityBand: q.facilityBand
      });
    }
  }

  const hasEnoughQuestionData = eligibleQuestions.length > 0;

  // Best 3 and Worst 3 by class facility
  const sortedByFacilityDesc = [...eligibleQuestions].sort((a, b) => b.classFacility - a.classFacility);
  const bestQuestions = sortedByFacilityDesc.slice(0, 3);
  const worstQuestions = [...sortedByFacilityDesc].reverse().slice(0, 3);

  // Furthest below cohort: 5 questions with largest negative gap (gap < 0, sorted ascending: most negative first)
  const negativeGaps = eligibleQuestions.filter(q => q.gap < 0).sort((a, b) => a.gap - b.gap);
  const furthestBelowCohort = negativeGaps.slice(0, 5);

  // Beating the cohort ("Approaches worth sharing"): 5 questions with largest positive gap (gap > 0, sorted descending: most positive first)
  const positiveGaps = eligibleQuestions.filter(q => q.gap > 0).sort((a, b) => b.gap - a.gap);
  const beatingCohort = positiveGaps.slice(0, 5);

  // 5. Finalize Class Student Roster
  const studentRoster = classStudentsList.map(st => {
    // Tier display: if only one tier sat, show it; if multiple, list them
    const tierArray = Array.from(st.tiers);
    const tierDisplay = tierArray.length === 1 ? tierArray[0] : (tierArray.length > 1 ? tierArray.join('/') : '-');

    // Weakest paper: lowest % among present/incomplete papers
    const satPapers = [];
    for (const [sName, pct] of Object.entries(st.paperPercentages)) {
      if (pct !== null) {
        const pObj = papers.find(p => p.sheetName === sName);
        satPapers.push({
          sheetName: sName,
          paper: pObj ? pObj.paper : sName,
          tier: pObj ? pObj.tier : '',
          pct
        });
      }
    }

    let weakestPaper = '-';
    if (satPapers.length > 0) {
      const tierRes = pickStrongestWeakestWithinTier(satPapers, { minPapers: 1, scoreKey: 'pct' });
      weakestPaper = tierRes.weakestSummary !== 'not enough papers' ? tierRes.weakestSummary : '-';
    }

    return {
      name: st.name,
      surname: st.surname,
      firstName: st.firstName,
      nameKey: st.nameKey,
      tier: tierDisplay,
      displayResult: st.displayResult,
      result: st.result,
      points: st.points,
      sen: st.sen,
      disadvantaged: st.disadvantaged,
      paperStatuses: st.paperStatuses,
      paperPercentages: st.paperPercentages,
      weakestPaper,
      rawStudent: st
    };
  });

  return {
    className,
    totalStudents,
    satAtLeastOneCount,
    absencesPerPaper,
    paperSummaries,
    strongestPaper,
    weakestPaper,
    tierHighlights,
    hasEnoughPaperData,
    bestQuestions,
    worstQuestions,
    furthestBelowCohort,
    beatingCohort,
    hasEnoughQuestionData,
    students: studentRoster
  };
}

/**
 * Calculates student-level skill profiles across all papers in the QLA workbook.
 * 
 * Rules:
 * - A student's paper % = total / paper maximum. Absent papers are left out, never counted as 0.
 * - Strongest and weakest paper = highest and lowest paper % among the papers the student sat.
 *   Shows tier with each (for example "Writing F").
 * - A student needs at least 2 papers sat to have a strongest and weakest paper. Otherwise "not enough papers".
 * - Mock result and gap to grade 5 come from the snapshot match. Unmatched students show "no mock data".
 *
 * @param {Array<Object>} papers - Array of parsed QLA papers
 * @returns {Array<Object>} List of student skill profiles
 */
export function calculateStudentSkillProfiles(papers = []) {
  if (!Array.isArray(papers) || papers.length === 0) return [];

  const studentMap = new Map();

  for (const paper of papers) {
    for (const s of (paper.students || [])) {
      const key = s.nameKey || (s.surname && s.firstName ? `${s.surname.toLowerCase().trim()}_${s.firstName.toLowerCase().trim()}` : (s.name || '').toLowerCase().trim());
      if (!key) continue;

      if (!studentMap.has(key)) {
        studentMap.set(key, {
          name: s.name,
          surname: s.surname,
          firstName: s.firstName,
          nameKey: s.nameKey || key,
          activeClass: s.activeClass || s.className || s.currentClass || 'Unassigned',
          className: s.className,
          currentClass: s.currentClass,
          newClass: s.newClass,
          sen: s.sen || 'No SEN',
          disadvantaged: s.disadvantaged || 'No',
          eal: s.eal || 'No',
          snapshotMatched: Boolean(s.snapshotMatched),
          result: s.result ?? null,
          points: s.points ?? null,
          displayResult: s.displayResult || '',
          snapshotRecord: s.snapshotRecord || null,
          paperStatuses: {},
          paperPercentages: {},
          satPapers: [],
          enteredPapers: []
        });
      }

      const st = studentMap.get(key);

      // Enhance with snapshot details if not already set
      if (!st.snapshotMatched && s.snapshotMatched) {
        st.snapshotMatched = true;
        st.result = s.result ?? null;
        st.points = s.points ?? null;
        st.displayResult = s.displayResult || '';
        st.sen = s.sen || 'No SEN';
        st.disadvantaged = s.disadvantaged || 'No';
        st.eal = s.eal || 'No';
        st.snapshotRecord = s.snapshotRecord || null;
        st.activeClass = s.activeClass || st.activeClass;
      }

      st.enteredPapers.push(paper);
      st.paperStatuses[paper.sheetName] = s.status;

      if (s.status === 'present' || s.status === 'incomplete') {
        const total = typeof s.total === 'number' ? s.total : 0;
        const pct = paper.totalMax > 0 ? (total / paper.totalMax) * 100 : 0;
        const roundedPct = Math.round(pct * 10) / 10;
        st.paperPercentages[paper.sheetName] = roundedPct;
        st.satPapers.push({
          sheetName: paper.sheetName,
          paper: paper.paper,
          tier: paper.tier,
          total,
          totalMax: paper.totalMax,
          pct: roundedPct
        });
      } else if (s.status === 'absent') {
        st.paperPercentages[paper.sheetName] = null;
      }
    }
  }

  const profiles = Array.from(studentMap.values()).map(st => {
    // 1. Strongest & Weakest Paper strictly within the same tier
    const tierResult = pickStrongestWeakestWithinTier(st.satPapers, { minPapers: 2, scoreKey: 'pct' });
    const strongestPaper = tierResult.strongestSummary;
    const weakestPaper = tierResult.weakestSummary;
    const strongestObj = tierResult.strongestObj;
    const weakestObj = tierResult.weakestObj;

    // 2. Mock Result and Gap to Grade 5
    let mockResult = 'no mock data';
    let gapToGrade5 = 'no mock data';
    let gapValue = null;

    if (st.snapshotMatched) {
      mockResult = st.displayResult || (st.result != null ? String(st.result) : 'no mock data');
      if (st.points != null) {
        gapValue = Math.max(0, 5 - st.points);
        gapToGrade5 = String(gapValue);
      }
    }

    // 3. Resolved Tier
    // Check sat papers first, then entered papers if 0 sat
    const satTiers = Array.from(new Set(st.satPapers.map(p => p.tier).filter(Boolean)));
    let tier = '-';
    let isMixedTiers = false;
    let primaryTier = tierResult.primaryTier;

    if (satTiers.length > 1) {
      tier = 'Mixed tiers';
      isMixedTiers = true;
    } else if (satTiers.length === 1) {
      tier = satTiers[0];
      primaryTier = satTiers[0];
    } else {
      const enteredTiers = Array.from(new Set(st.enteredPapers.map(p => p.tier).filter(Boolean)));
      if (enteredTiers.length > 1) {
        tier = 'Mixed tiers';
        isMixedTiers = true;
      } else if (enteredTiers.length === 1) {
        tier = enteredTiers[0];
        primaryTier = enteredTiers[0];
      } else {
        tier = '-';
      }
    }

    // 4. Missed Papers
    const missedPapers = [];
    for (const p of papers) {
      if (st.paperStatuses[p.sheetName] === 'absent') {
        const tShort = p.tier === 'Foundation' ? 'F' : p.tier === 'Higher' ? 'H' : '';
        const label = `${p.paper} ${tShort}`.trim();
        missedPapers.push(label || p.sheetName);
      }
    }

    return {
      ...st,
      tier,
      isMixedTiers,
      primaryTier,
      tierResult,
      strongestPaper,
      weakestPaper,
      strongestObj,
      weakestObj,
      mockResult,
      gapToGrade5,
      gapValue,
      missedPapers,
      missedCount: missedPapers.length
    };
  });

  // Sort alphabetically by surname, then firstName
  profiles.sort((a, b) => {
    const sA = (a.surname || a.name || '').toLowerCase();
    const sB = (b.surname || b.name || '').toLowerCase();
    const c1 = sA.localeCompare(sB);
    if (c1 !== 0) return c1;
    const fA = (a.firstName || '').toLowerCase();
    const fB = (b.firstName || '').toLowerCase();
    return fA.localeCompare(fB);
  });

  return profiles;
}

/**
 * Filters student profiles by class, SEN, disadvantaged, and weakest paper.
 *
 * @param {Array<Object>} profiles
 * @param {Object} filters
 * @returns {Array<Object>}
 */
export function filterStudentProfiles(profiles = [], filters = {}) {
  const { className = 'ALL', sen = 'ALL', disadvantaged = 'ALL', weakestPaper = 'ALL' } = filters;

  return profiles.filter(student => {
    // 1. Class filter
    if (className && className !== 'ALL') {
      const studentClass = student.activeClass || student.className || student.currentClass;
      if (studentClass !== className) return false;
    }

    // 2. SEN filter
    if (sen && sen !== 'ALL') {
      const studentSen = student.sen || 'No SEN';
      if (sen === 'ALL_SEN') {
        if (studentSen === 'No SEN' || studentSen === 'No') return false;
      } else {
        if (studentSen !== sen) return false;
      }
    }

    // 3. Disadvantaged filter
    if (disadvantaged && disadvantaged !== 'ALL') {
      const studentDis = student.disadvantaged || 'No';
      if (studentDis !== disadvantaged) return false;
    }

    // 4. Weakest Paper filter
    if (weakestPaper && weakestPaper !== 'ALL') {
      if (student.weakestPaper !== weakestPaper) {
        if (student.isMixedTiers && student.weakestPaper && student.weakestPaper.includes(weakestPaper)) {
          // matches one of their equal weakest papers
        } else {
          return false;
        }
      }
    }

    return true;
  });
}

/**
 * Helper to group students by their weakest paper for a specific tier.
 * Only includes students whose weakest paper belongs to that tier.
 *
 * @param {Array<Object>} students
 * @param {string} tierName - 'Foundation' or 'Higher'
 * @returns {Array<{ weakestPaper: string, count: number, students: Array<Object> }>}
 */
function groupStudentsByWeakestPaperForTier(students = [], tierName = 'Foundation') {
  const map = new Map();

  for (const s of students) {
    let weakest = null;

    if (s.tierResult) {
      if (s.primaryTier === tierName) {
        weakest = s.weakestPaper;
      } else if (s.primaryTier === 'Equal') {
        const tData = s.tierResult.byTier && s.tierResult.byTier[tierName];
        if (tData && tData.hasEnough) {
          weakest = tData.weakestLabel;
        }
      }
    } else {
      // Fallback for tests/mock objects created without tierResult
      const isMatch = s.tier === tierName ||
        (tierName === 'Foundation' && (/foundation/i.test(s.tier) || (s.weakestPaper && /\bF\b/.test(s.weakestPaper)))) ||
        (tierName === 'Higher' && (/higher/i.test(s.tier) || (s.weakestPaper && /\bH\b/.test(s.weakestPaper))));
      if (isMatch) {
        weakest = s.weakestPaper || 'not enough papers';
      }
    }

    if (weakest !== null) {
      if (!map.has(weakest)) {
        map.set(weakest, []);
      }
      map.get(weakest).push(s);
    }
  }

  const results = [];
  for (const [weakestPaper, groupStudents] of map.entries()) {
    results.push({
      weakestPaper,
      count: groupStudents.length,
      students: groupStudents
    });
  }

  results.sort((a, b) => b.count - a.count || a.weakestPaper.localeCompare(b.weakestPaper));
  return results;
}

/**
 * Groups students with mock result of 4 by their weakest paper, separated strictly by tier.
 *
 * @param {Array<Object>} studentProfiles
 * @returns {{ foundation: Array<{ weakestPaper: string, count: number, students: Array<Object> }>, higher: Array<{ weakestPaper: string, count: number, students: Array<Object> }> }}
 */
export function calculateGrade4sByWeakestPaper(studentProfiles = []) {
  const grade4Students = studentProfiles.filter(s => s.snapshotMatched && (s.result === 4 || s.displayResult === '4'));
  return {
    foundation: groupStudentsByWeakestPaperForTier(grade4Students, 'Foundation'),
    higher: groupStudentsByWeakestPaperForTier(grade4Students, 'Higher')
  };
}

/**
 * Groups students with gap >= 3 from grade 5 (grades 2, 1, U) by their weakest paper, separated strictly by tier.
 *
 * @param {Array<Object>} studentProfiles
 * @returns {{ foundation: Array<{ weakestPaper: string, count: number, students: Array<Object> }>, higher: Array<{ weakestPaper: string, count: number, students: Array<Object> }> }}
 */
export function calculateFarthestFrom5ByWeakestPaper(studentProfiles = []) {
  const farthestStudents = studentProfiles.filter(s => s.snapshotMatched && typeof s.gapValue === 'number' && s.gapValue >= 3);
  return {
    foundation: groupStudentsByWeakestPaperForTier(farthestStudents, 'Foundation'),
    higher: groupStudentsByWeakestPaperForTier(farthestStudents, 'Higher')
  };
}

/**
 * Identifies questions with facility below the weak threshold (default 40%)
 * and counts/lists students scoring < 50% marks on them (mark < maxMarks / 2).
 *
 * @param {Array<Object>} papers
 * @param {Object} filters
 * @param {Object} thresholds
 * @returns {Array<Object>}
 */
export function calculateWeakQuestionsAnalysis(papers = [], filters = {}, thresholds = { strong: 70, weak: 40 }) {
  const weakThresh = typeof thresholds?.weak === 'number' ? thresholds.weak : 40;
  const weakQuestionResults = [];

  for (const paper of papers) {
    const qStats = calculateQuestionStats(paper, filters, thresholds);
    const weakQuestions = qStats.questions.filter(q => q.facility !== null && q.facility < weakThresh);

    const filteredStudents = filterQlaStudents(paper.students || [], filters);
    const eligibleStudents = filteredStudents.filter(s => s.status === 'present' || s.status === 'incomplete');

    for (const q of weakQuestions) {
      const weakStudents = [];
      for (const s of eligibleStudents) {
        const rawMark = s.marks ? s.marks[q.key] : null;
        const mark = (typeof rawMark === 'number' && !isNaN(rawMark)) ? rawMark : 0;
        if (q.maxMarks > 0 && mark < (q.maxMarks / 2)) {
          weakStudents.push({
            name: s.name,
            surname: s.surname,
            firstName: s.firstName,
            activeClass: s.activeClass || s.className || s.currentClass,
            mark,
            maxMarks: q.maxMarks,
            pct: Math.round((mark / q.maxMarks) * 100)
          });
        }
      }

      weakQuestionResults.push({
        paper: paper.paper,
        tier: paper.tier,
        sheetName: paper.sheetName,
        key: q.key,
        label: q.label,
        section: q.section,
        topic: q.topic,
        facility: q.facility,
        maxMarks: q.maxMarks,
        weakStudentCount: weakStudents.length,
        students: weakStudents
      });
    }
  }

  // Sort weak questions by facility ascending (weakest first)
  weakQuestionResults.sort((a, b) => a.facility - b.facility || b.weakStudentCount - a.weakStudentCount);
  return weakQuestionResults;
}

/**
 * Calculates demographic group gaps across papers and tiers:
 * - SEN Support vs No SEN
 * - Disadvantaged vs Not
 * - EAL vs Not (ONLY when class lists are loaded: isClassListsLoaded === true)
 * Greys out (< 5 students) using tooFew: true.
 *
 * @param {Array<Object>} papers
 * @param {Object} filters
 * @param {boolean} isClassListsLoaded
 * @returns {Array<Object>}
 */
export function calculateDemographicGroupGaps(papers = [], filters = {}, isClassListsLoaded = false) {
  const results = [];

  for (const paper of papers) {
    const studentsOnPaper = paper.students || [];
    const filteredByClass = (filters.className && filters.className !== 'ALL')
      ? studentsOnPaper.filter(s => (s.activeClass || s.className || s.currentClass) === filters.className)
      : studentsOnPaper;

    const presentStudents = filteredByClass.filter(s => s.status === 'present' || s.status === 'incomplete');

    const comparisons = [];

    const calcGroupAvg = (group) => {
      if (!group || group.length === 0) return null;
      const sum = group.reduce((acc, s) => {
        const total = typeof s.total === 'number' ? s.total : 0;
        const pct = paper.totalMax > 0 ? (total / paper.totalMax) * 100 : 0;
        return acc + pct;
      }, 0);
      return Math.round((sum / group.length) * 10) / 10;
    };

    // 1. SEN Support vs No SEN
    const senA = presentStudents.filter(s => s.sen === 'SEN Support');
    const senB = presentStudents.filter(s => s.sen === 'No SEN' || s.sen === 'No' || !s.sen);
    const avgSenA = calcGroupAvg(senA);
    const avgSenB = calcGroupAvg(senB);
    comparisons.push({
      id: 'sen',
      title: 'SEN Support vs No SEN',
      groupAName: 'SEN Support',
      groupBName: 'No SEN',
      nA: senA.length,
      nB: senB.length,
      avgA: avgSenA,
      avgB: avgSenB,
      gap: (avgSenA !== null && avgSenB !== null) ? Math.round((avgSenA - avgSenB) * 10) / 10 : null,
      tooFew: senA.length < 5 || senB.length < 5
    });

    // 2. Disadvantaged vs Not
    const disA = presentStudents.filter(s => s.disadvantaged === 'Yes');
    const disB = presentStudents.filter(s => s.disadvantaged === 'No' || !s.disadvantaged);
    const avgDisA = calcGroupAvg(disA);
    const avgDisB = calcGroupAvg(disB);
    comparisons.push({
      id: 'disadvantaged',
      title: 'Disadvantaged vs Not',
      groupAName: 'Disadvantaged',
      groupBName: 'Not Disadvantaged',
      nA: disA.length,
      nB: disB.length,
      avgA: avgDisA,
      avgB: avgDisB,
      gap: (avgDisA !== null && avgDisB !== null) ? Math.round((avgDisA - avgDisB) * 10) / 10 : null,
      tooFew: disA.length < 5 || disB.length < 5
    });

    // 3. EAL vs Not (EAL shown ONLY when class lists are loaded)
    if (isClassListsLoaded) {
      const ealA = presentStudents.filter(s => s.eal === 'Yes');
      const ealB = presentStudents.filter(s => s.eal === 'No' || !s.eal);
      const avgEalA = calcGroupAvg(ealA);
      const avgEalB = calcGroupAvg(ealB);
      comparisons.push({
        id: 'eal',
        title: 'EAL vs Not',
        groupAName: 'EAL',
        groupBName: 'Not EAL',
        nA: ealA.length,
        nB: ealB.length,
        avgA: avgEalA,
        avgB: avgEalB,
        gap: (avgEalA !== null && avgEalB !== null) ? Math.round((avgEalA - avgEalB) * 10) / 10 : null,
        tooFew: ealA.length < 5 || ealB.length < 5
      });
    }

    results.push({
      sheetName: paper.sheetName,
      paper: paper.paper,
      tier: paper.tier,
      comparisons
    });
  }

  return results;
}

/**
 * Compiles a list of students absent from one or more papers.
 *
 * @param {Array<Object>} studentProfiles
 * @returns {Array<Object>}
 */
export function calculateMissedPapersList(studentProfiles = []) {
  const missedStudents = studentProfiles
    .filter(s => s.missedCount > 0)
    .map(s => ({
      name: s.name,
      surname: s.surname,
      firstName: s.firstName,
      activeClass: s.activeClass,
      missedPapers: s.missedPapers,
      missedCount: s.missedCount,
      rawStudent: s
    }));

  missedStudents.sort((a, b) => b.missedCount - a.missedCount || (a.surname || '').localeCompare(b.surname || ''));
  return missedStudents;
}

/**
 * Calculates a complete Students tab analysis report.
 *
 * @param {Array<Object>} papers
 * @param {Object} filters - { className, sen, disadvantaged, weakestPaper }
 * @param {Object} thresholds - { strong, weak }
 * @param {Object} options - { isClassListsLoaded: boolean }
 * @returns {Object}
 */
export function calculateStudentsReport(papers = [], filters = {}, thresholds = { strong: 70, weak: 40 }, options = {}) {
  const allProfiles = calculateStudentSkillProfiles(papers);
  const filteredProfiles = filterStudentProfiles(allProfiles, filters);

  const weakestPaperSet = new Set();
  for (const s of allProfiles) {
    if (s.weakestPaper && s.weakestPaper !== 'not enough papers') {
      if (s.weakestPaper.includes('; ')) {
        const parts = s.weakestPaper.split('; ');
        for (const part of parts) {
          const colonIdx = part.indexOf(': ');
          const label = colonIdx >= 0 ? part.slice(colonIdx + 2).trim() : part.trim();
          if (label && label !== 'not enough papers') weakestPaperSet.add(label);
        }
      } else {
        weakestPaperSet.add(s.weakestPaper);
      }
    }
  }
  const allWeakestPapers = Array.from(weakestPaperSet).sort();

  const grade4sByWeakest = calculateGrade4sByWeakestPaper(filteredProfiles);
  const farthestFrom5ByWeakest = calculateFarthestFrom5ByWeakestPaper(filteredProfiles);
  const weakQuestions = calculateWeakQuestionsAnalysis(papers, filters, thresholds);
  const groupGaps = calculateDemographicGroupGaps(papers, filters, Boolean(options.isClassListsLoaded));
  const missedPapersStudents = calculateMissedPapersList(filteredProfiles);

  return {
    papers: papers.map(p => ({
      sheetName: p.sheetName,
      paper: p.paper,
      tier: p.tier,
      totalMax: p.totalMax
    })),
    allStudents: allProfiles,
    students: filteredProfiles,
    allWeakestPapers,
    grade4sByWeakest,
    farthestFrom5ByWeakest,
    weakQuestions,
    groupGaps,
    missedPapersStudents
  };
}

