/**
 * QLA (Question Level Analysis) Workbook Parser
 * Pure module for parsing question-level assessment workbooks and CSVs.
 * Runs completely offline and client-side (no DOM, no storage, no network).
 */

import { cleanText, buildNameKey, formatClass } from './parser.js';

/**
 * Splits "Surname, First" on the FIRST comma into { surname, firstName },
 * both trimmed with cleanText.
 * If no comma is present: { surname: fullName trimmed, firstName: "" }
 */
export function splitSurnameFirst(fullName) {
  const text = cleanText(fullName);
  if (!text) {
    return { surname: '', firstName: '' };
  }
  const commaIdx = text.indexOf(',');
  if (commaIdx === -1) {
    return {
      surname: text,
      firstName: ''
    };
  }
  const surname = cleanText(text.slice(0, commaIdx));
  const firstName = cleanText(text.slice(commaIdx + 1));
  return { surname, firstName };
}

/**
 * Parses paper name and tier from a sheet name.
 * Examples:
 * - "Listening F" -> paper: "Listening", tier: "Foundation"
 * - "Reading H"   -> paper: "Reading", tier: "Higher"
 * - "Writing"     -> paper: "Writing", tier: "All"
 */
export function parsePaperAndTier(sheetName) {
  const clean = cleanText(sheetName);
  const match = clean.match(/^(.*?)(?:\s+|-|_)([FHfh])$/);
  if (match && match[1].trim()) {
    const tierChar = match[2].toUpperCase();
    return {
      paper: match[1].trim(),
      tier: tierChar === 'F' ? 'Foundation' : 'Higher'
    };
  }
  return {
    paper: clean || 'Paper',
    tier: 'All'
  };
}

/**
 * Derives qRange, topic, and assessment objective (AO) from a question label string.
 * Example:
 * - "Q1-4 A busy week" -> qRange: "Q1-4", topic: "A busy week", ao: null
 * - "Q5 90-word - AO3 Grammar & Voc" -> qRange: "Q5", topic: "90-word - AO3 Grammar & Voc", ao: "AO3"
 */
export function parseQuestionLabel(rawLabel) {
  const clean = cleanText(rawLabel);
  if (!clean) {
    return { qRange: '', topic: '', ao: null };
  }

  // qRange: leading question reference, e.g. "Q1-4", "Q40", "Q5"
  const qRangeMatch = clean.match(/^([Qq]\d+(?:[\s]*[-–—][\s]*\d+)?[a-zA-Z]?)\b/);
  let qRange = '';
  let topic = clean;

  if (qRangeMatch) {
    const rawRef = qRangeMatch[1].replace(/\s+/g, '');
    qRange = 'Q' + rawRef.slice(1);
    topic = clean.slice(qRangeMatch[0].length).trim();
    // Strip leading punctuation/separators like "- " or ": "
    topic = topic.replace(/^[-–—:]\s*/, '').trim();
  }

  // AO tag: "AO1", "AO2", or "AO3"
  const aoMatch = clean.match(/\b(AO[123])\b/i);
  const ao = aoMatch ? aoMatch[1].toUpperCase() : null;

  return { qRange, topic, ao };
}

/**
 * Checks if a cell string represents a section header (e.g. "Section A")
 */
function isSectionLabel(text) {
  return /^Section\s+[A-Za-z0-9]/i.test(cleanText(text));
}

/**
 * Finds the first non-empty cell in the first 3 rows
 */
function findAssessmentTitle(rows) {
  const maxScan = Math.min(3, rows.length);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const text = cleanText(row[c]);
      if (text) {
        return text;
      }
    }
  }
  return '';
}

/**
 * Finds the header row containing "Student Name" (case and spaces ignored)
 */
function findHeaderRow(rows) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    let nameCol = -1;
    let classCol = -1;

    for (let c = 0; c < row.length; c++) {
      const norm = cleanText(row[c]).toLowerCase().replace(/[^a-z]/g, '');
      if (norm === 'studentname' || norm === 'studentnames' || norm === 'student') {
        nameCol = c;
      }
      if (norm === 'class' || norm === 'classname' || norm === 'teachinggroup') {
        classCol = c;
      }
    }

    if (nameCol !== -1) {
      return {
        headerRowIndex: r,
        nameColIndex: nameCol,
        classColIndex: classCol,
        headerRow: row
      };
    }
  }
  return null;
}

/**
 * Finds the row where the cell in nameColIndex reads "Marks per Q"
 */
function findMaxMarksRow(rows, nameColIndex, startRow = 0) {
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const norm = cleanText(row[nameColIndex]).toLowerCase().replace(/[^a-z]/g, '');
    if (norm.includes('marksperq') || norm.includes('marksperquestion') || norm === 'maxmarks') {
      return {
        maxMarksRowIndex: r,
        maxMarksRow: row
      };
    }
  }
  return null;
}

/**
 * Parses a QLA workbook already read by SheetJS.
 *
 * @param {Array<{ name: string, rows: any[][] }>} sheets
 * @param {string} [fileName]
 * @returns {{
 *   assessmentTitle: string,
 *   papers: Array<{
 *     sheetName: string,
 *     paper: string,
 *     tier: string,
 *     totalMax: number,
 *     questions: Array<{ key: string, label: string, qRange: string, topic: string, section: string, ao: string|null, maxMarks: number }>,
 *     students: Array<{ name: string, surname: string, firstName: string, nameKey: string, classRaw: string, className: string, marks: Record<string, number|null>, total: number, pct: number, status: string }>
 *   }>,
 *   diagnostics: {
 *     warnings: string[],
 *     counts: { papers: number, students: number, present: number, absent: number, incomplete: number, unassigned: number }
 *   }
 * }}
 */
export function parseQlaWorkbook(sheets, fileName = '') {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error('The workbook contains no sheets to parse.');
  }

  const warnings = [];
  const reconciliationNotices = [];
  const papers = [];
  let assessmentTitle = '';

  const cleanFileName = cleanText(fileName);
  const fileBaseName = cleanFileName.replace(/\.[^/.]+$/, '');
  const isCsv = cleanFileName.toLowerCase().endsWith('.csv');

  // Attempt to extract assessment title from the first sheet's first 3 rows
  for (const sheet of sheets) {
    if (Array.isArray(sheet.rows) && sheet.rows.length > 0) {
      const candidateTitle = findAssessmentTitle(sheet.rows);
      if (candidateTitle) {
        assessmentTitle = candidateTitle;
        break;
      }
    }
  }
  if (!assessmentTitle) {
    assessmentTitle = fileBaseName || 'Question Level Analysis';
  }

  for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
    const sheet = sheets[sIdx];
    let sheetName = cleanText(sheet.name);

    // If CSV file or sheet name missing/generic, use the file name without extension
    if ((isCsv && sheets.length === 1) || !sheetName || sheetName.toLowerCase() === 'sheet1') {
      sheetName = fileBaseName || sheetName || `Paper ${sIdx + 1}`;
    }

    const rows = sheet.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      warnings.push(`[${sheetName}] Sheet is empty and was skipped.`);
      continue;
    }

    // 1. Find Header Row containing "Student Name"
    const headerInfo = findHeaderRow(rows);
    if (!headerInfo) {
      warnings.push(`[${sheetName}] Could not find a "Student Name" header row; sheet was skipped.`);
      continue;
    }

    const { headerRowIndex, nameColIndex, classColIndex } = headerInfo;

    // 2. Find Max Marks Row ("Marks per Q" in the name column)
    const maxMarksInfo = findMaxMarksRow(rows, nameColIndex, headerRowIndex + 1);
    if (!maxMarksInfo) {
      warnings.push(`[${sheetName}] Could not find a "Marks per Q" row; sheet was skipped.`);
      continue;
    }

    const { maxMarksRowIndex, maxMarksRow } = maxMarksInfo;

    // 3. Identify TOTAL MARKS and PERCENTAGE columns
    let totalMarksColIndex = -1;
    let percentageColIndex = -1;

    for (let r = headerRowIndex; r <= maxMarksRowIndex; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const norm = cleanText(row[c]).toLowerCase().replace(/[^a-z]/g, '');
        if (totalMarksColIndex === -1 && (norm === 'totalmarks' || norm === 'total')) {
          totalMarksColIndex = c;
        }
        if (percentageColIndex === -1 && (norm === 'percentage' || norm === 'percent' || norm === 'pct')) {
          percentageColIndex = c;
        }
      }
    }

    // 4. Determine Question Columns
    // Every column after the Class column and before TOTAL MARKS (or before PERCENTAGE)
    const startCol = classColIndex !== -1 ? classColIndex + 1 : nameColIndex + 1;
    let endCol = -1;
    if (totalMarksColIndex !== -1) {
      endCol = totalMarksColIndex;
    } else if (percentageColIndex !== -1) {
      endCol = percentageColIndex;
    } else {
      endCol = Math.max(...rows.slice(headerRowIndex, maxMarksRowIndex + 1).map(r => (Array.isArray(r) ? r.length : 0)));
    }

    if (startCol >= endCol) {
      warnings.push(`[${sheetName}] No question columns found between Class and TOTAL MARKS; sheet was skipped.`);
      continue;
    }

    // 5. Track section labels across question columns
    // Sections sit above the question labels. Carry each section label rightwards across blank cells.
    const colSectionMap = new Map();
    for (let r = headerRowIndex; r < maxMarksRowIndex; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      let currentSection = '';
      for (let c = startCol; c < endCol; c++) {
        const cellText = cleanText(row[c]);
        if (isSectionLabel(cellText)) {
          currentSection = cellText;
        }
        if (currentSection && !colSectionMap.has(c)) {
          colSectionMap.set(c, currentSection);
        }
      }
    }

    // 6. Extract question definitions
    const questions = [];
    for (let c = startCol; c < endCol; c++) {
      // Find question label in rows between header row and max marks row
      let label = '';
      for (let r = headerRowIndex; r < maxMarksRowIndex; r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;
        const cellText = cleanText(row[c]);
        if (cellText && !isSectionLabel(cellText)) {
          label = cellText;
        }
      }

      if (!label) {
        label = `Q${questions.length + 1}`;
      }

      const { qRange, topic, ao } = parseQuestionLabel(label);
      const section = colSectionMap.get(c) || '';

      // Max marks for this question from the max marks row
      const rawMax = maxMarksRow[c];
      const maxNum = Number(cleanText(rawMax));
      let maxMarks = 0;
      if (!isNaN(maxNum) && maxNum > 0) {
        maxMarks = maxNum;
      } else {
        warnings.push(`[${sheetName}] Question "${label}" (col ${c + 1}) has invalid or missing max marks "${rawMax}".`);
      }

      questions.push({
        colIdx: c,
        key: `q${questions.length + 1}`,
        label,
        qRange,
        topic,
        section,
        ao,
        maxMarks
      });
    }

    // 7. Reconcile a misstated question maximum before validating student marks.
    const overscores = questions.map(q => ({ question: q, marks: [] }));
    for (let r = maxMarksRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row) || !/[a-zA-Z]/.test(cleanText(row[nameColIndex]))) continue;
      if (questions.some(q => cleanText(row[q.colIdx]).toUpperCase() === 'A')) continue;
      overscores.forEach(({ question, marks }) => {
        const cell = cleanText(row[question.colIdx]);
        const mark = Number(cell);
        if (cell && Number.isFinite(mark) && mark > question.maxMarks) marks.push(mark);
      });
    }

    const statedTotal = cleanText(maxMarksRow[totalMarksColIndex]);
    const sheetTotalMax = statedTotal && Number.isFinite(Number(statedTotal)) ? Number(statedTotal) : null;
    const statedSum = questions.reduce((sum, q) => sum + q.maxMarks, 0);
    const affectedQuestions = overscores.filter(entry => entry.marks.length > 0);
    if (sheetTotalMax !== null && sheetTotalMax > statedSum && affectedQuestions.length === 1) {
      const { question, marks } = affectedQuestions[0];
      const corrected = question.maxMarks + sheetTotalMax - statedSum;
      if (Math.max(...marks) <= corrected) {
        reconciliationNotices.push(`[${sheetName}] Corrected question maximum for "${question.label}" from ${question.maxMarks} to ${corrected} using sheet TOTAL MARKS.`);
        question.maxMarks = corrected;
      }
    }
    overscores.forEach(({ question, marks }) => {
      if (marks.length >= 3 && Math.max(...marks) > question.maxMarks) {
        const corrected = Math.max(...marks);
        reconciliationNotices.push(`[${sheetName}] Corrected question maximum for "${question.label}" from ${question.maxMarks} to ${corrected} using ${marks.length} student marks.`);
        question.maxMarks = corrected;
      }
    });

    const totalMax = questions.reduce((sum, q) => sum + q.maxMarks, 0);
    if (sheetTotalMax !== null && sheetTotalMax !== totalMax) {
      warnings.push(`[${sheetName}] Calculated totalMax (${totalMax}) differs from sheet TOTAL MARKS in max marks row (${sheetTotalMax}).`);
    }

    // 8. Parse student rows
    const students = [];
    for (let r = maxMarksRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const rawName = cleanText(row[nameColIndex]);
      // Ignore rows with no student name or whose name cell does not hold text (e.g. stray row "120, 0, 0")
      if (!rawName || !/[a-zA-Z]/.test(rawName)) continue;

      const { surname, firstName } = splitSurnameFirst(rawName);
      const nameKey = buildNameKey(surname, firstName);

      // Class handling
      let classRaw = '';
      let className = 'Unassigned';
      if (classColIndex !== -1 && row[classColIndex] !== undefined && row[classColIndex] !== null) {
        classRaw = cleanText(row[classColIndex]);
      }

      if (!classRaw) {
        classRaw = '';
        className = 'Unassigned';
        warnings.push(`[${sheetName}] Row ${r + 1}: Student "${rawName}" has a blank class, set to "Unassigned".`);
      } else {
        const formatted = formatClass(classRaw);
        className = formatted.displayClass;
      }

      // Check status: absent / incomplete / present
      let hasAbsent = false;
      let allBlank = true;
      let hasBlank = false;
      let hasNonBlank = false;

      for (const q of questions) {
        const cellVal = row[q.colIdx];
        const cellStr = cleanText(cellVal);
        if (cellStr.toUpperCase() === 'A') {
          hasAbsent = true;
          hasNonBlank = true;
          allBlank = false;
        } else if (cellStr === '') {
          hasBlank = true;
        } else {
          hasNonBlank = true;
          allBlank = false;
        }
      }

      let status = 'present';
      if (hasAbsent || allBlank) {
        status = 'absent';
      } else if (hasBlank && hasNonBlank) {
        status = 'incomplete';
        warnings.push(`[${sheetName}] Row ${r + 1}: Student "${rawName}" has incomplete question marks (blank marks treated as 0).`);
      } else {
        status = 'present';
      }

      // Parse question marks
      const marks = {};
      let total = 0;

      for (const q of questions) {
        const cellVal = row[q.colIdx];
        const cellStr = cleanText(cellVal);

        if (cellStr.toUpperCase() === 'A') {
          marks[q.key] = null;
        } else if (cellStr === '') {
          if (status === 'incomplete') {
            marks[q.key] = 0;
          } else {
            marks[q.key] = null;
          }
        } else {
          const num = Number(cellStr);
          if (isNaN(num)) {
            marks[q.key] = null;
            warnings.push(`[${sheetName}] Row ${r + 1}, Question "${q.label}": Mark "${cellStr}" is not a valid number.`);
          } else if (num < 0 || num > q.maxMarks) {
            marks[q.key] = null;
            warnings.push(`[${sheetName}] Row ${r + 1}, Question "${q.label}": Mark ${num} exceeds question maximum (${q.maxMarks}).`);
          } else {
            marks[q.key] = num;
            total += num;
          }
        }
      }

      // Recalculate percentage rounded to 1 decimal place
      const pct = totalMax > 0 ? Math.round((total / totalMax) * 100 * 10) / 10 : 0;

      // Validate recalculated total against sheet's TOTAL MARKS for present students
      if (status === 'present' && totalMarksColIndex !== -1) {
        const rawSheetTotal = row[totalMarksColIndex];
        if (rawSheetTotal !== undefined && rawSheetTotal !== null && cleanText(rawSheetTotal) !== '') {
          const sheetTotal = Number(cleanText(rawSheetTotal));
          if (!isNaN(sheetTotal) && sheetTotal !== total) {
            warnings.push(`[${sheetName}] Row ${r + 1}: Recalculated total (${total}) differs from sheet TOTAL MARKS (${sheetTotal}) for student "${rawName}".`);
          }
        }
      }

      students.push({
        name: rawName,
        surname,
        firstName,
        nameKey,
        classRaw,
        className,
        marks,
        total,
        pct,
        status
      });
    }

    const { paper, tier } = parsePaperAndTier(sheetName);

    // Clean question objects to match return shape
    const cleanQuestions = questions.map(({ key, label, qRange, topic, section, ao, maxMarks }) => ({
      key,
      label,
      qRange,
      topic,
      section,
      ao,
      maxMarks
    }));

    papers.push({
      sheetName,
      paper,
      tier,
      totalMax,
      questions: cleanQuestions,
      students
    });
  }

  if (papers.length === 0) {
    throw new Error('No usable QLA sheets found in workbook. Each sheet must contain a "Student Name" header and a "Marks per Q" row.');
  }

  // Calculate diagnostic counts
  let totalStudents = 0;
  let presentCount = 0;
  let absentCount = 0;
  let incompleteCount = 0;
  let unassignedCount = 0;

  for (const p of papers) {
    for (const s of p.students) {
      totalStudents++;
      if (s.status === 'present') presentCount++;
      else if (s.status === 'absent') absentCount++;
      else if (s.status === 'incomplete') incompleteCount++;
      if (s.className === 'Unassigned') unassignedCount++;
    }
  }

  return {
    assessmentTitle,
    papers,
    diagnostics: {
      warnings: [...reconciliationNotices, ...warnings],
      counts: {
        papers: papers.length,
        students: totalStudents,
        present: presentCount,
        absent: absentCount,
        incomplete: incompleteCount,
        unassigned: unassignedCount
      }
    }
  };
}
