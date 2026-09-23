/**
 * PowerPoint (.pptx) Export Generator using PptxGenJS
 * Runs completely client-side in the browser.
 * Generates an executive 16:9 presentation adhering strictly to Dixons Unity Academy styling.
 */

import pptxgen from 'pptxgenjs';
import { computeHeadlines } from './stats.js';

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
  slide.addText('Confidential: contains student assessment data.', {
    x: 0.8,
    y: 5.18,
    w: 4.8,
    h: 0.25,
    fontSize: 8.5,
    bold: true,
    color: COLORS.ragRed,
    fontFace: FONT_BODY
  });

  slide.addText('Dixons Unity Academy · Heads of Department', {
    x: 5.6,
    y: 5.18,
    w: 3.6,
    h: 0.25,
    align: 'right',
    fontSize: 8.5,
    color: COLORS.textMuted,
    fontFace: FONT_BODY
  });
}

/**
 * Export PowerPoint Presentation
 */
export async function exportPowerPointPresentation({
  filteredRecords = [],
  allRecords = [],
  options = {},
  snapshotName = 'Mock Exam Snapshot',
  filtersAppliedStr = 'All classes',
  ukDateToday = ''
}) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';

  const isAnon = !!options.hideNames;
  const headlines = computeHeadlines(filteredRecords.length > 0 ? filteredRecords : allRecords);

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
    ? 'Student & staff names hidden (Student 1, 2... / Teacher 1, 2...)'
    : 'Standard class and student identifiers';

  titleSlide.addText([
    { text: 'Snapshot Dataset:\n', options: { bold: true, fontSize: 11, color: COLORS.textMuted } },
    { text: `${snapshotName}\n\n`, options: { bold: true, fontSize: 15, color: COLORS.darkGreen } },
    { text: 'Filters Applied:\n', options: { bold: true, fontSize: 11, color: COLORS.textMuted } },
    { text: `${filtersAppliedStr}\n\n`, options: { fontSize: 13, color: COLORS.textDark } },
    { text: 'Prepared On:  ', options: { bold: true, fontSize: 11, color: COLORS.textMuted } },
    { text: `${ukDateToday || 'Today'}     ·     `, options: { fontSize: 11, color: COLORS.textDark } },
    { text: 'Privacy:  ', options: { bold: true, fontSize: 11, color: COLORS.textMuted } },
    { text: `${privacyText}`, options: { fontSize: 11, color: COLORS.textDark } }
  ], {
    x: 1.0,
    y: 2.8,
    w: 8.0,
    h: 1.6,
    fontFace: FONT_BODY
  });

  // Confidential footer
  titleSlide.addText('Confidential: for Head of Department analysis only.', {
    x: 0.8,
    y: 5.15,
    w: 8.4,
    h: 0.3,
    fontSize: 9,
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
      { title: 'Average Score', val: headlines.averageScore ? `${headlines.averageScore}%` : '--', sub: 'Cohort mean' }
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

    // Overview message
    summarySlide.addShape('rect', {
      x: 0.8,
      y: 4.0,
      w: 8.45,
      h: 0.9,
      fill: { color: COLORS.lightGreenTint },
      line: { color: COLORS.borderGreen, width: 1 }
    });

    summarySlide.addText('Upload a mock snapshot to begin full class-by-class cohort diagnostic analysis.', {
      x: 1.0,
      y: 4.25,
      w: 8.0,
      h: 0.4,
      fontSize: 12,
      bold: true,
      color: COLORS.darkGreen,
      fontFace: FONT_BODY,
      align: 'center'
    });
  }

  // Save / Trigger Download
  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `class-snapshot-dashboard-${dateStamp}.pptx`;
  await pres.writeFile({ fileName });
  return fileName;
}
