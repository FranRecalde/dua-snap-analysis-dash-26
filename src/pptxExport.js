/**
 * PowerPoint (.pptx) Export Generator using PptxGenJS
 * Runs completely client-side in the browser.
 * Generates an executive 16:9 presentation adhering strictly to Dixons Unity Academy styling.
 */

import pptxgen from 'pptxgenjs';
import {
  computeHeadlines, calculateClassBreakdown, calculateDistanceBreakdownByClass,
  calculateStudentGroupsBreakdown
} from './stats.js';
import { calculateMovementMatrix, calculateNewClassProfiles, calculateBalanceFlags } from './movementStats.js';
import { generateSuggestedActions } from './actions.js';
import { createStudentNameRedactor } from './pdfExport.js';

// Color Palette
const COLORS = {
  darkGreen: '1E3A24',
  accentGreen: '2E6930',
  lightGreenTint: 'F0FDF4',
  borderGreen: '86EFAC',
  white: 'FFFFFF',
  cardBg: 'F9FAFB',
  textDark: '111827',
  textBody: '374151',
  textMuted: '6B7280',
  borderGray: 'E5E7EB',
  ragGreen: '166534',
  ragGreenBg: 'DCFCE7',
  ragAmber: '92400E',
  ragAmberBg: 'FEF3C7',
  ragRed: '991B1B',
  ragRedBg: 'FEE2E2'
};

const FONT_TITLE = 'Calibri';
const FONT_BODY = 'Calibri';
const FOOTER = 'Contains pupil data. Handle under the trust data protection policy.';

function addSafeText(slide, value, x, y, w, h, options = {}) {
  const text = String(value ?? '');
  let size = options.fontSize || 12;
  while (size > 7) {
    const charsPerLine = Math.max(1, Math.floor(w * 72 / (size * 0.56)));
    const neededLines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    if (neededLines * size * 1.25 <= h * 72) break;
    size--;
  }
  slide.addText(text, { x, y, w, h, fontFace: FONT_BODY, valign: 'mid', margin: 0, fit: 'shrink', ...options, fontSize: size });
}

function addPagedTable(pres, title, headers, rows, widths, rowsPerSlide = 10, subtitle = '') {
  const pages = Math.max(1, Math.ceil(rows.length / rowsPerSlide));
  for (let page = 0; page < pages; page++) {
    const slide = pres.addSlide();
    setupSlideHeaderAndFooter(slide, pages > 1 ? `${title} (${page + 1} of ${pages})` : title, subtitle);
    const part = rows.slice(page * rowsPerSlide, (page + 1) * rowsPerSlide);
    slide.addTable([headers, ...part], {
      x: 0.8, y: 1.4, w: 8.4, h: 0.34 * (part.length + 1),
      colW: widths, rowH: 0.34, margin: 0.035, fontFace: FONT_BODY,
      fontSize: 9, color: COLORS.textDark,
      border: { type: 'solid', color: COLORS.borderGray, pt: 0.5 },
      autoPage: false,
      bold: false,
      fill: { color: COLORS.white }
    });
  }
}

function fmt(value, digits = 1, suffix = '') {
  return value === null || value === undefined || Number.isNaN(value) ? '–' : `${Number(value).toFixed(digits)}${suffix}`;
}

/**
 * Add standard header and confidential footer to a content slide
 */
function setupSlideHeaderAndFooter(slide, title, subtitle = '') {
  // Title
  slide.addText(title, {
    x: 0.8,
    y: 0.45,
    w: 8.4,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: COLORS.darkGreen,
    fontFace: FONT_TITLE
  });

  // Optional Subtitle
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.8,
      y: 0.85,
      w: 8.4,
      h: 0.25,
      fontSize: 10,
      color: COLORS.textMuted,
      fontFace: FONT_BODY
    });
  }

  // Thin dividing line
  const lineY = subtitle ? 1.15 : 0.95;
  slide.addShape('line', {
    x: 0.8,
    y: lineY,
    w: 8.4,
    h: 0,
    line: { color: COLORS.accentGreen, width: 1.5 }
  });

  // Standard Footer on all slides
  slide.addText(FOOTER, {
    x: 0.8,
    y: 5.18,
    w: 8.4,
    h: 0.25,
    fontSize: 8,
    bold: true,
    color: COLORS.ragRed,
    fontFace: FONT_BODY
  });

}

/**
 * Export PowerPoint Presentation
 */
export function buildPowerPointPresentation({
  filteredRecords = [],
  allRecords = [],
  distanceRecords = filteredRecords,
  classListsData = null,
  qlaPapers = null,
  rawSnapshotRecords = allRecords,
  movementThresholds = {},
  options = {},
  snapshotName = 'Mock Exam Snapshot',
  filtersAppliedStr = 'All classes',
  ukDateToday = ''
}) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';

  const isAnon = !!options.hideNames;
  const headlines = computeHeadlines(filteredRecords);
  const redact = isAnon ? createStudentNameRedactor([
    ...filteredRecords,
    ...allRecords,
    ...(classListsData?.allNewClassStudents || []),
    ...(classListsData?.inNewClassesNoMockResult || []),
    ...(qlaPapers || []).flatMap(paper => paper.students || [])
  ]) : value => String(value ?? '');

  // -------------------------------------------------------------
  // SLIDE 1: Title Slide
  // -------------------------------------------------------------
  const titleSlide = pres.addSlide();

  // Decorative crest banner
  titleSlide.addShape('rect', {
    x: 0.8,
    y: 0.8,
    w: 8.4,
    h: 0.08,
    fill: { color: COLORS.accentGreen }
  });

  // Academy Masthead
  titleSlide.addText('DIXONS UNITY ACADEMY · HEADS OF DEPARTMENT', {
    x: 0.8,
    y: 1.1,
    w: 8.4,
    h: 0.35,
    fontSize: 12,
    bold: true,
    color: COLORS.accentGreen,
    fontFace: FONT_TITLE,
    charSpacing: 1.5
  });

  // Title
  titleSlide.addText('Class Snapshot Dashboard', {
    x: 0.8,
    y: 1.55,
    w: 8.4,
    h: 0.75,
    fontSize: 34,
    bold: true,
    color: COLORS.darkGreen,
    fontFace: FONT_TITLE
  });

  // Green accent rule
  titleSlide.addShape('line', {
    x: 0.8,
    y: 2.4,
    w: 8.4,
    h: 0,
    line: { color: COLORS.accentGreen, width: 2 }
  });

  // Context metadata card
  titleSlide.addShape('rect', {
    x: 0.8,
    y: 2.65,
    w: 8.4,
    h: 1.9,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.borderGray, width: 1 }
  });

  const privacyText = isAnon
    ? 'Student initials and class'
    : 'Standard class and student identifiers';

  addSafeText(titleSlide, 'Snapshot dataset', 1.0, 2.78, 8.0, 0.2,
    { fontSize: 10, bold: true, color: COLORS.textMuted });
  addSafeText(titleSlide, redact(snapshotName), 1.0, 3.0, 8.0, 0.35,
    { fontSize: 16, bold: true, color: COLORS.darkGreen });
  addSafeText(titleSlide, redact(filtersAppliedStr), 1.0, 3.47, 8.0, 0.5,
    { fontSize: 12, color: COLORS.textDark });
  addSafeText(titleSlide, `${ukDateToday || 'Today'} · ${privacyText}`, 1.0, 4.12, 8.0, 0.25,
    { fontSize: 10, color: COLORS.textMuted });

  // Confidential footer
  titleSlide.addText(FOOTER, {
    x: 0.8,
    y: 5.15,
    w: 8.4,
    h: 0.3,
    fontSize: 8,
    bold: true,
    color: COLORS.ragRed,
    fontFace: FONT_BODY
  });

  // -------------------------------------------------------------
  // SLIDE 2: Headline Summary
  // -------------------------------------------------------------
  if (options.headlines !== false) {
    const summarySlide = pres.addSlide();
    setupSlideHeaderAndFooter(summarySlide, 'Executive Headline Summary', 'Key mock assessment indicators at a glance');

    // Stat cards
    const cards = [
      { title: 'Total Assessment Entries', val: String(headlines.total), sub: 'Processed records' },
      { title: 'Classes Evaluated', val: String(headlines.classesCount), sub: 'Distinct teaching classes' },
      { title: 'Students', val: String(headlines.studentsCount), sub: 'Active cohort size' },
      { title: 'Average Grade', val: headlines.studentsCount ? fmt(headlines.averageScore) : '–', sub: 'Cohort mean' }
    ];

    cards.forEach((card, idx) => {
      const cardX = 0.8 + idx * 2.15;
      summarySlide.addShape('rect', {
        x: cardX,
        y: 1.5,
        w: 2.0,
        h: 2.2,
        fill: { color: COLORS.cardBg },
        line: { color: COLORS.borderGray, width: 1 }
      });

      summarySlide.addText(card.title, {
        x: cardX + 0.1,
        y: 1.65,
        w: 1.8,
        h: 0.4,
        fontSize: 10,
        bold: true,
        color: COLORS.textMuted,
        fontFace: FONT_TITLE,
        align: 'center'
      });

      summarySlide.addText(card.val, {
        x: cardX + 0.1,
        y: 2.2,
        w: 1.8,
        h: 0.7,
        fontSize: 26,
        bold: true,
        color: COLORS.darkGreen,
        fontFace: FONT_TITLE,
        align: 'center'
      });

      summarySlide.addText(card.sub, {
        x: cardX + 0.1,
        y: 3.1,
        w: 1.8,
        h: 0.35,
        fontSize: 9,
        color: COLORS.textMuted,
        fontFace: FONT_BODY,
        align: 'center'
      });
    });

  }

  const classes = calculateClassBreakdown(filteredRecords)
    .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));
  const comparisonParts = [
    {
      title: 'Class comparison: attainment',
      headers: ['Class', 'Students', 'Average', 'Median', '5+ %', '4+ %', '7+ %'],
      widths: [1.65, 0.9, 0.95, 0.9, 1.33, 1.33, 1.34],
      cells: c => [c.className, String(c.students), fmt(c.averageGrade, 2), fmt(c.medianGrade), fmt(c.pct5Plus, 1, '%'), fmt(c.pct4Plus, 1, '%'), fmt(c.pct7Plus, 1, '%')]
    },
    {
      title: 'Class comparison: progress and groups',
      headers: ['Class', 'U', 'Progress', 'SEN Support %', 'Disadvantaged %', 'Attendance %'],
      widths: [1.65, 0.65, 1.15, 1.65, 1.8, 1.5],
      cells: c => [c.className, String(c.uCount), fmt(c.averageProgress, 2), fmt(c.pctSENSupport, 1, '%'), fmt(c.pctDisadvantaged, 1, '%'), fmt(c.averageAttendance, 1, '%')]
    }
  ];
  comparisonParts.forEach(part => addPagedTable(pres, part.title, part.headers,
    classes.map(c => part.cells(c).map(redact)), part.widths, 10));

  const chartClasses = classes.filter(c => c.averageGrade !== null);
  for (let start = 0; start < Math.max(1, chartClasses.length); start += 10) {
    const part = chartClasses.slice(start, start + 10);
    const slide = pres.addSlide();
    setupSlideHeaderAndFooter(slide, 'Average grade by class',
      chartClasses.length > 10 ? `Classes ${start + 1}–${start + part.length} of ${chartClasses.length}` : '');
    if (part.length) {
      slide.addChart(pres.ChartType.bar, [{
        name: 'Average grade',
        labels: part.map(c => redact(c.className)),
        values: part.map(c => c.averageGrade)
      }], {
        x: 1.0, y: 1.35, w: 8.0, h: 3.55,
        showLegend: false, showValue: true,
        catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
        valAxisMinVal: 0, valAxisMaxVal: 9,
        chartColors: [COLORS.accentGreen],
        showTitle: false, showBorder: false
      });
    } else {
      addSafeText(slide, 'No results match the active filters.', 1, 2, 8, 0.6, { fontSize: 15 });
    }
  }

  const actions = generateSuggestedActions(distanceRecords, {
    classListsData, qlaPapers, rawSnapshotRecords, movementThresholds
  }).topPriorities;
  const actionCards = actions.flatMap((action, index) => {
    const why = redact(action.why || '');
    const parts = why ? Array.from({ length: Math.ceil(why.length / 220) }, (_, part) => why.slice(part * 220, (part + 1) * 220)) : [''];
    return parts.map((part, partIndex) => ({ action, index, part: part.trim(), partIndex }));
  });
  if (!actionCards.length) actionCards.push({ action: null, index: 0, part: 'No suggested actions at the current thresholds.', partIndex: 0 });
  for (let start = 0; start < actionCards.length; start += 2) {
    const slide = pres.addSlide();
    setupSlideHeaderAndFooter(slide, 'Suggested actions: Top 5',
      actionCards.length > 2 ? `Actions ${Math.floor(start / 2) * 2 + 1}–${Math.min(start + 2, actionCards.length)} of ${actionCards.length}` : '');
    actionCards.slice(start, start + 2).forEach((card, position) => {
      const y = 1.45 + position * 1.7;
      if (!card.action) {
        addSafeText(slide, card.part, 0.9, y, 8.2, 0.5, { fontSize: 14 });
        return;
      }
      addSafeText(slide, `${card.index + 1}. [${card.action.source}] ${redact(card.action.title)}${card.partIndex ? ' (continued)' : ''}`,
        0.9, y, 8.2, 0.55, { fontSize: 15, bold: true, color: COLORS.darkGreen });
      addSafeText(slide, card.part, 1.0, y + 0.6, 8.0, 0.85, { fontSize: 12, color: COLORS.textBody, valign: 'top' });
    });
  }

  const distance = calculateDistanceBreakdownByClass(distanceRecords).classes;
  addPagedTable(pres, 'Distance from grade 5: band counts by class',
    ['Class', 'Sat', '5+', '1 away', '2 away', '3+ away'],
    distance.map(c => [c.className, c.satCount, c.countAtOrAbove5, c.countOneAway, c.countTwoAway, c.countThreeOrMoreAway].map(String)),
    [2.4, 1.2, 1.2, 1.2, 1.2, 1.2], 10, 'Student counts only');

  const groupCategories = new Set(['SEN Status', 'Disadvantage', 'Gender', 'EAL']);
  const groups = calculateStudentGroupsBreakdown(filteredRecords)
    .filter(category => groupCategories.has(category.category))
    .flatMap(category => category.groups.map(group => ({ category: category.category, ...group })));
  addPagedTable(pres, 'Student group gaps',
    ['Group', 'Students', 'Grade gap', 'Progress gap', '5+ gap'],
    groups.map(group => [
      `${group.category}: ${group.name}`, String(group.studentsCount),
      group.tooFew ? 'Too few to compare' : fmt(group.gradeGap),
      group.tooFew ? 'Too few to compare' : fmt(group.progressGap, 2),
      group.tooFew ? 'Too few to compare' : fmt(group.pct5PlusGap, 1, ' pts')
    ]), [2.9, 0.9, 1.55, 1.55, 1.5], 10, 'Gap relative to the rest of the cohort');

  if (classListsData) {
    const matrix = calculateMovementMatrix(rawSnapshotRecords, classListsData);
    const newClasses = matrix.newClasses;
    for (let firstCol = 0; firstCol < Math.max(1, newClasses.length); firstCol += 5) {
      const columns = newClasses.slice(firstCol, firstCol + 5);
      const rows = matrix.currentClasses.map(current => [
        current,
        ...columns.map(next => String(matrix.grid[current]?.[next]?.length || 0)),
        String(matrix.notInNewByCurrent[current]?.length || 0),
        String(matrix.rowTotals[current] || 0)
      ]);
      rows.push(['New to cohort', ...columns.map(next => String(matrix.newToCohortByNew[next]?.length || 0)), '–', String(matrix.newToCohortRowTotal)]);
      rows.push(['Total', ...columns.map(next => String(matrix.colTotals[next] || 0)), String(matrix.notInNewColTotal), String(matrix.grandTotal)]);
      addPagedTable(pres, 'Movement matrix', ['Current class', ...columns, 'No new class', 'Total'], rows,
        [1.5, ...columns.map(() => 0.9), 1.2, 1.2], 9,
        newClasses.length > 5 ? `New classes ${firstCol + 1}–${firstCol + columns.length} of ${newClasses.length}` : '');
    }
    const profiles = calculateNewClassProfiles(rawSnapshotRecords, classListsData);
    const flags = calculateBalanceFlags(profiles.classProfiles, profiles.cohortProfile, movementThresholds).flags;
    if (!flags.length) {
      const slide = pres.addSlide();
      setupSlideHeaderAndFooter(slide, 'Class balance flags');
      addSafeText(slide, 'No balance concerns at the current thresholds.', 0.9, 1.6, 8.2, 0.6, { fontSize: 14 });
    }
    for (let start = 0; start < flags.length; start += 2) {
      const slide = pres.addSlide();
      setupSlideHeaderAndFooter(slide, 'Class balance flags',
        flags.length > 2 ? `Flags ${start + 1}–${Math.min(start + 2, flags.length)} of ${flags.length}` : '');
      flags.slice(start, start + 2).forEach((flag, position) => {
        const y = 1.45 + position * 1.7;
        addSafeText(slide, redact(flag.text), 0.9, y, 8.2, 0.7,
          { fontSize: 14, bold: true, color: COLORS.darkGreen });
        addSafeText(slide, redact(flag.why), 1.0, y + 0.75, 8.0, 0.7,
          { fontSize: 11, color: COLORS.textBody, valign: 'top' });
      });
    }
  }

  return pres;
}

export async function exportPowerPointPresentation(data) {
  const pres = buildPowerPointPresentation(data);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `class-snapshot-dashboard-${dateStamp}.pptx`;
  await pres.writeFile({ fileName });
  return fileName;
}
