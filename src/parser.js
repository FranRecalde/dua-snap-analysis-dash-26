/**
 * Class Snapshot Dashboard - Parser & Cleaner
 * Private, browser only class and cohort analysis for Heads of Department
 * Dixons Unity Academy
 */

/**
 * Clean and collapse text: strip HTML tags, trim and collapse multiple internal whitespace into single space
 */
export function cleanText(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ');
}

/**
 * Normalise header text for comparison
 */
export function normaliseHeader(str) {
  return cleanText(str).toLowerCase();
}

/**
 * Column definitions and keywords matching rule
 * MATCH COLUMNS BY KEYWORD, NOT POSITION (case insensitive, trimmed)
 */
export const COLUMN_DEFINITIONS = [
  {
    key: 'surname',
    label: 'Surname',
    keywords: ['legal surname', 'last name', 'surname']
  },
  {
    key: 'firstName',
    label: 'First name',
    keywords: ['first name', 'forename']
  },
  {
    key: 'admissionNumber',
    label: 'Admission number',
    keywords: ['admission number', 'admission no', 'adm number', 'adm no', 'adno', 'admission']
  },
  {
    key: 'yearGroup',
    label: 'Year group',
    keywords: ['year group', 'year']
  },
  {
    key: 'tutorGroup',
    label: 'Tutor group',
    keywords: ['tutor group', 'reg group', 'form']
  },
  {
    key: 'sex',
    label: 'Sex',
    keywords: ['gender', 'sex']
  },
  {
    key: 'attendance',
    label: 'Attendance',
    keywords: ['att. %', 'att %', 'att.%', 'attendance']
  },
  {
    key: 'disadvantaged',
    label: 'Disadvantaged',
    keywords: ['disadvantaged', 'pupil premium', 'pp', 'disadv']
  },
  {
    key: 'sen',
    label: 'SEN',
    keywords: ['sen status', 'sen']
  },
  {
    key: 'eal',
    label: 'EAL',
    keywords: ['eal', 'english as an additional language', 'first language', 'first lang', 'language']
  },
  {
    key: 'ks2Band',
    label: 'KS2 band',
    keywords: ['ks2 pag band', 'ks2 band']
  },
  {
    key: 'scaledScore',
    label: 'Scaled score',
    keywords: ['ave scaled score', 'scaled score']
  },
  {
    key: 'attainmentLevel',
    label: 'Attainment level',
    keywords: ['attainment level', 'prior attainment']
  },
  {
    key: 'subject',
    label: 'Subject',
    keywords: ['subject']
  },
  {
    key: 'className',
    label: 'Class',
    keywords: ['teaching group', 'class', 'set']
  },
  {
    key: 'result',
    label: 'Result',
    keywords: ['result', 'grade']
  },
  {
    key: 'points',
    label: 'Points',
    keywords: ['points']
  },
  {
    key: 'estimate',
    label: 'Estimate',
    keywords: ['estimate']
  },
  {
    key: 'progress',
    label: 'Progress',
    keywords: ['progress']
  }
];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a header string against column definitions by keyword
 */
export function matchColumn(headerStr) {
  const norm = normaliseHeader(headerStr);
  if (!norm) return null;

  // 1. First pass: exact normalized match
  for (const col of COLUMN_DEFINITIONS) {
    for (const kw of col.keywords) {
      if (norm === kw) {
        return col.key;
      }
      // Also match without punctuation (e.g. att % vs att. %)
      const normNoDot = norm.replace(/\./g, '');
      const kwNoDot = kw.replace(/\./g, '');
      if (normNoDot === kwNoDot) {
        return col.key;
      }
    }
  }

  // 2. Second pass: phrase match with word boundaries or bracket wrapping
  for (const col of COLUMN_DEFINITIONS) {
    for (const kw of col.keywords) {
      const escaped = escapeRegex(kw);
      const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
      if (re.test(norm)) {
        return col.key;
      }
    }
  }

  return null;
}

/**
 * Scan first 10 rows and use the first row containing both Surname and First name
 * Show any title text above it as snapshotName
 */
export function detectHeaderRow(rawSheetRows) {
  const maxScan = Math.min(10, rawSheetRows.length);

  for (let r = 0; r < maxScan; r++) {
    const row = rawSheetRows[r];
    if (!Array.isArray(row)) continue;

    let hasSurname = false;
    let hasFirstName = false;

    for (const cell of row) {
      if (cell === null || cell === undefined) continue;
      const text = cleanText(cell);
      if (!text) continue;

      const matchedField = matchColumn(text);
      if (matchedField === 'surname') hasSurname = true;
      if (matchedField === 'firstName') hasFirstName = true;
    }

    if (hasSurname && hasFirstName) {
      // Collect any title text above this row
      const titleLines = [];
      for (let prev = 0; prev < r; prev++) {
        const prevRow = rawSheetRows[prev];
        if (Array.isArray(prevRow)) {
          const rowText = prevRow
            .map(c => cleanText(c))
            .filter(Boolean)
            .join(' - ');
          if (rowText) titleLines.push(rowText);
        }
      }
      const snapshotName = titleLines.join(' | ');

      return {
        headerRowIndex: r,
        snapshotName,
        headerRow: row
      };
    }
  }

  throw new Error('Could not find a valid header row containing both "Surname" and "First name" within the first 10 rows of the file.');
}

/**
 * CLEANING RULE 4:
 * Attainment level: H = High, M = Middle, L = Low, N or blank = "No KS2 data".
 */
export function cleanAttainmentLevel(val) {
  const text = cleanText(val).toUpperCase();
  if (text === 'H' || text.startsWith('HIGH')) return 'High';
  if (text === 'M' || text.startsWith('MID')) return 'Middle';
  if (text === 'L' || text.startsWith('LOW')) return 'Low';
  if (text === 'N' || text === '' || text.includes('NO KS2') || text.includes('NONE')) {
    return 'No KS2 data';
  }
  return text || 'No KS2 data';
}

/**
 * CLEANING RULE 5:
 * SEN: K = SEN Support, E = EHCP, N or blank = No SEN.
 */
export function cleanSEN(val) {
  const text = cleanText(val).toUpperCase();
  if (text === 'K' || text.includes('SUPPORT')) return 'SEN Support';
  if (text === 'E' || text.includes('EHCP')) return 'EHCP';
  if (text === 'N' || text === '' || text.includes('NO SEN') || text.includes('NONE')) {
    return 'No SEN';
  }
  return cleanText(val) || 'No SEN';
}

/**
 * CLEANING RULE 6:
 * Disadvantaged: Yes/Y/True = Yes, everything else = No.
 */
export function cleanDisadvantaged(val) {
  if (val === true) return 'Yes';
  const text = cleanText(val).toLowerCase();
  if (text === 'yes' || text === 'y' || text === 'true') {
    return 'Yes';
  }
  return 'No';
}

/**
 * Standardise Sex / Gender: 'F' / 'Female' -> 'Female', 'M' / 'Male' -> 'Male'
 */
export function cleanSex(val) {
  if (val === null || val === undefined) return '';
  const text = cleanText(val).toLowerCase();
  if (text === 'f' || text === 'female' || text.startsWith('fem')) return 'Female';
  if (text === 'm' || text === 'male' || text.startsWith('mal')) return 'Male';
  return cleanText(val);
}

/**
 * Standardise EAL (English as an Additional Language):
 * Yes/Y/True/EAL or non-English language -> 'Yes'
 * No/N/False/Blank/English -> 'No'
 */
export function cleanEAL(val) {
  if (val === null || val === undefined) return 'No';
  if (val === true) return 'Yes';
  const text = cleanText(val).toLowerCase();
  if (!text || text === 'no' || text === 'n' || text === 'false' || text === 'english' || text === 'eng' || text === 'not eal') {
    return 'No';
  }
  if (text === 'yes' || text === 'y' || text === 'true' || text === 'eal') {
    return 'Yes';
  }
  return 'Yes';
}

/**
 * CLEANING RULE 7:
 * Class "10/Sp1 (25/26)" displays as "10 Sp1". Keep the full label in a tooltip.
 * Always prefix the year so it never clashes with another year's class names.
 */
export function formatClass(rawClassVal, yearGroupVal) {
  const fullLabel = cleanText(rawClassVal);
  if (!fullLabel) {
    const yearDigits = cleanText(yearGroupVal).replace(/\D/g, '');
    return {
      displayClass: yearDigits ? `Year ${yearDigits}` : 'Unassigned',
      fullLabel: fullLabel || 'Unassigned'
    };
  }

  // 1. Remove parenthetical notes/academic years: e.g. "(25/26)", "(2025/2026)"
  const withoutParens = fullLabel.replace(/\s*\([^)]*\)/g, '').trim();

  let yearPrefix = '';
  let restOfClass = withoutParens;

  // Check if class starts with year digits followed by / or space or letters: e.g. "10/Sp1", "10 Sp1", "10Sp1"
  const matchYearStart = withoutParens.match(/^(\d{1,2})\s*[\/\-_]?\s*(.*)$/);
  if (matchYearStart) {
    yearPrefix = matchYearStart[1];
    restOfClass = matchYearStart[2].trim();
  } else {
    // If class doesn't start with year digits, use yearGroup
    const ygDigits = cleanText(yearGroupVal).replace(/\D/g, '');
    if (ygDigits) {
      yearPrefix = ygDigits;
    }
  }

  let displayClass = '';
  if (yearPrefix && restOfClass) {
    const cleanedRest = restOfClass.replace(/[\/\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    displayClass = `${yearPrefix} ${cleanedRest}`;
  } else if (yearPrefix && !restOfClass) {
    displayClass = `Year ${yearPrefix}`;
  } else {
    displayClass = withoutParens.replace(/[\/\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return {
    displayClass,
    fullLabel
  };
}

/**
 * CLEANING RULE 8:
 * Student key: the admission number when present.
 * Also build a name key: lower case surname + first name, trimmed, internal spaces collapsed, hyphens treated as spaces.
 */
export function buildNameKey(surname, firstName) {
  const s = cleanText(surname)
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const f = cleanText(firstName)
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${s} ${f}`.trim();
}

export function getStudentKey(admissionNumber, surname, firstName) {
  const adm = cleanText(admissionNumber);
  if (adm) return adm;
  return buildNameKey(surname, firstName);
}

/**
 * Parse snapshot sheet 2D array and perform full cleaning & diagnostics
 */
export function parseSnapshotSpreadsheet(rawSheetRows, fileName = '') {
  if (!Array.isArray(rawSheetRows) || rawSheetRows.length === 0) {
    throw new Error('The spreadsheet appears to be empty or contains no readable rows.');
  }

  // 1. Scan first 10 rows and find header row
  const { headerRowIndex, snapshotName, headerRow } = detectHeaderRow(rawSheetRows);

  // 2. Map matched columns and collect unmatched columns
  const columnMap = new Map(); // colIndex -> fieldKey
  const fieldIndexMap = {}; // fieldKey -> colIndex
  const matchedColumns = [];
  const unmatchedColumns = [];

  headerRow.forEach((cell, idx) => {
    const headerText = cleanText(cell);
    if (!headerText) return;

    const matchedField = matchColumn(headerText);
    if (matchedField) {
      if (fieldIndexMap[matchedField] === undefined) {
        fieldIndexMap[matchedField] = idx;
        columnMap.set(idx, matchedField);
        const colDef = COLUMN_DEFINITIONS.find(c => c.key === matchedField);
        matchedColumns.push({
          key: matchedField,
          label: colDef ? colDef.label : matchedField,
          header: headerText,
          index: idx
        });
      }
    } else {
      unmatchedColumns.push({
        header: headerText,
        index: idx
      });
    }
  });

  const getCell = (row, fieldKey) => {
    const idx = fieldIndexMap[fieldKey];
    if (idx === undefined || idx === null || !row) return '';
    return row[idx];
  };

  // 3. Process Data Rows
  const totalRowsRead = rawSheetRows.length - 1 - headerRowIndex;
  const records = [];
  const notSatList = [];
  const missingEstimateList = [];
  const studentKeyCounts = new Map();
  const studentRecordsByKey = new Map();

  let uGradesCount = 0;
  let notSatCount = 0;
  let missingEstimateCount = 0;

  for (let r = headerRowIndex + 1; r < rawSheetRows.length; r++) {
    const row = rawSheetRows[r];
    if (!Array.isArray(row)) continue;

    // Check if row is completely blank
    const hasAnyContent = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasAnyContent) continue;

    // Rule 1: Trim all text, collapse double spaces
    const surname = cleanText(getCell(row, 'surname'));
    const firstName = cleanText(getCell(row, 'firstName'));
    const admissionNumber = cleanText(getCell(row, 'admissionNumber'));
    const yearGroup = cleanText(getCell(row, 'yearGroup'));
    const tutorGroup = cleanText(getCell(row, 'tutorGroup'));
    const sex = cleanSex(getCell(row, 'sex'));
    const attendance = cleanText(getCell(row, 'attendance'));
    const subject = cleanText(getCell(row, 'subject'));
    const rawClass = getCell(row, 'className');
    const rawResult = cleanText(getCell(row, 'result'));
    const rawPoints = cleanText(getCell(row, 'points'));
    const rawEstimate = cleanText(getCell(row, 'estimate'));
    const rawProgress = cleanText(getCell(row, 'progress'));
    const rawAttainment = getCell(row, 'attainmentLevel');
    const rawSEN = getCell(row, 'sen');
    const rawDisadvantaged = getCell(row, 'disadvantaged');
    const ks2Band = cleanText(getCell(row, 'ks2Band'));
    const scaledScore = cleanText(getCell(row, 'scaledScore'));

    // If surname and first name are both missing and admission number missing, skip empty noise
    if (!surname && !firstName && !admissionNumber) {
      continue;
    }

    // Rule 8: Student key & Name key
    const nameKey = buildNameKey(surname, firstName);
    const studentKey = getStudentKey(admissionNumber, surname, firstName);

    // Rule 7: Class formatting with year prefix and tooltip full label
    const { displayClass, fullLabel: classTooltip } = formatClass(rawClass, yearGroup);

    // Rule 2: Result "U" means Points = 0 and displays as "U".
    // A blank result means "not sat": exclude it from averages and list it in diagnostics.
    let result = '';
    let displayResult = '';
    let points = null;
    let isNotSat = false;
    let isU = false;

    if (rawResult === '') {
      isNotSat = true;
      result = 'Not sat';
      displayResult = 'Not sat';
      points = null; // Excluded from averages!
      notSatCount++;
      notSatList.push({
        name: `${surname}, ${firstName}`.trim().replace(/^,|,$/g, '') || 'Unnamed student',
        studentKey,
        className: displayClass
      });
    } else if (rawResult.toUpperCase() === 'U') {
      isU = true;
      result = 'U';
      displayResult = 'U';
      points = 0;
      uGradesCount++;
    } else {
      result = rawResult;
      displayResult = rawResult;
      if (rawPoints !== '') {
        const p = parseFloat(rawPoints);
        points = isNaN(p) ? null : p;
      } else {
        const rNum = parseFloat(rawResult);
        points = isNaN(rNum) ? null : rNum;
      }
    }

    // Rule 3: Estimate of 0 or blank means MISSING, not zero.
    // When the estimate is missing, progress is also MISSING, even if the file says 0.
    // Never include missing values in averages.
    let estimate = null;
    let progress = null;
    let isEstimateMissing = false;

    if (rawEstimate === '' || isNaN(parseFloat(rawEstimate)) || parseFloat(rawEstimate) === 0) {
      isEstimateMissing = true;
      estimate = null;
      progress = null; // Also missing!
      missingEstimateCount++;
      missingEstimateList.push({
        name: `${surname}, ${firstName}`.trim().replace(/^,|,$/g, '') || 'Unnamed student',
        studentKey,
        className: displayClass
      });
    } else {
      estimate = parseFloat(rawEstimate);
      if (rawProgress !== '' && !isNaN(parseFloat(rawProgress))) {
        progress = parseFloat(rawProgress);
      } else {
        progress = null;
      }
    }

    // Rule 4: Attainment level
    const attainmentLevel = cleanAttainmentLevel(rawAttainment || ks2Band);

    // Rule 5: SEN
    const sen = cleanSEN(rawSEN);

    // Rule 6: Disadvantaged
    const disadvantaged = cleanDisadvantaged(rawDisadvantaged);

    const record = {
      id: records.length + 1,
      studentKey,
      nameKey,
      admissionNumber,
      surname,
      firstName,
      yearGroup,
      tutorGroup,
      sex,
      attendance,
      disadvantaged,
      sen,
      ks2Band,
      scaledScore,
      attainmentLevel,
      subject,
      className: displayClass,
      rawClass: classTooltip,
      result,
      displayResult,
      points,
      estimate,
      progress,
      isNotSat,
      isU,
      isEstimateMissing
    };

    records.push(record);

    // Track duplicate students
    studentKeyCounts.set(studentKey, (studentKeyCounts.get(studentKey) || 0) + 1);
    if (!studentRecordsByKey.has(studentKey)) {
      studentRecordsByKey.set(studentKey, record);
    }
  }

  // Compile duplicate students list
  const duplicateStudentsList = [];
  for (const [key, count] of studentKeyCounts.entries()) {
    if (count > 1) {
      const firstRec = studentRecordsByKey.get(key);
      duplicateStudentsList.push({
        studentKey: key,
        count,
        name: `${firstRec.surname}, ${firstRec.firstName}`.trim().replace(/^,|,$/g, '') || key,
        admissionNumber: firstRec.admissionNumber,
        className: firstRec.className
      });
    }
  }

  const diagnostics = {
    rowsRead: totalRowsRead,
    rowsKept: records.length,
    matchedColumns,
    unmatchedColumns,
    numberOfUGrades: uGradesCount,
    numberNotSat: notSatCount,
    numberMissingEstimate: missingEstimateCount,
    duplicateStudents: duplicateStudentsList.length,
    duplicateStudentsList,
    notSatList,
    missingEstimateList
  };

  return {
    snapshotName,
    fileName,
    records,
    diagnostics
  };
}

/**
 * Format date as UK format: "23 September 2026"
 */
const MONTH_NAMES_UK = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function formatUKDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  const day = date.getDate();
  const month = MONTH_NAMES_UK[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return 'No dates available';
  if (!startDate) return formatUKDate(endDate);
  if (!endDate) return formatUKDate(startDate);
  return `${formatUKDate(startDate)} to ${formatUKDate(endDate)}`;
}

/**
 * Extract clean default class name from file name:
 * e.g. "Year 11 SP1.xlsx" -> "11 Sp1"
 * e.g. "Year 11 SP2.csv" -> "11 Sp2"
 * e.g. "11/Sp1 (25/26).xlsx" -> "11 Sp1"
 */
export function extractClassNameFromFileName(fileName) {
  if (!fileName) return 'Class 1';
  let name = String(fileName).replace(/\.[^/.]+$/, '').trim();
  name = name.replace(/\s*\([^)]*\)/g, '').trim();

  // If starts with "Year" or "Yr" or "Y" or "Class" followed by digits
  const yearMatch = name.match(/^(?:Year|Yr|Y|Class)\s*(\d{1,2})[\s\/\-_]*(.*)$/i);
  if (yearMatch) {
    const yr = yearMatch[1];
    let rest = yearMatch[2].trim();
    if (rest) {
      rest = rest.replace(/[\/\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
      rest = rest.replace(/\b([A-Za-z]+)(\d+)\b/g, (match, p1, p2) => {
        return p1.charAt(0).toUpperCase() + p1.slice(1).toLowerCase() + p2;
      });
      return `${yr} ${rest}`;
    }
    return `Year ${yr}`;
  }

  // If starts with digits e.g. "11/SP1" or "11 SP1"
  const digitMatch = name.match(/^(\d{1,2})[\s\/\-_]*(.*)$/);
  if (digitMatch) {
    const yr = digitMatch[1];
    let rest = digitMatch[2].replace(/[\/\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (rest) {
      rest = rest.replace(/\b([A-Za-z]+)(\d+)\b/g, (match, p1, p2) => {
        return p1.charAt(0).toUpperCase() + p1.slice(1).toLowerCase() + p2;
      });
      return `${yr} ${rest}`;
    }
    return `Year ${yr}`;
  }

  return name;
}

/**
 * Parse a new class list spreadsheet / CSV file
 * Handles both:
 * 1. One file per class (class name taken from file name or user confirmed box)
 * 2. Or one file with a class column
 * Ignores unknown columns (e.g. "Chk" or headers with HTML)
 * Reads: surname, first name, admission number, tutor group, sex, SEN, pupil premium, EAL
 */
export function parseClassListFile(rawMatrix, fileName = '') {
  if (!Array.isArray(rawMatrix) || rawMatrix.length === 0) {
    throw new Error(`File "${fileName}" appears to be empty or contains no readable rows.`);
  }

  // Detect header row containing both Surname and First name
  const { headerRowIndex, headerRow } = detectHeaderRow(rawMatrix);

  // Map matched columns and check for dedicated Class column
  const columnMap = new Map(); // colIndex -> fieldKey
  let hasClassColumn = false;

  headerRow.forEach((cell, idx) => {
    const headerText = cleanText(cell);
    if (!headerText) return;
    const fieldKey = matchColumn(headerText);
    if (fieldKey) {
      columnMap.set(idx, fieldKey);
      if (fieldKey === 'className') hasClassColumn = true;
    }
  });

  const classListFields = new Set(columnMap.values());
  const defaultClassName = extractClassNameFromFileName(fileName);
  const students = [];

  for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row)) continue;

    const rawObj = {};
    row.forEach((cell, colIdx) => {
      const fieldKey = columnMap.get(colIdx);
      if (fieldKey) {
        rawObj[fieldKey] = cell;
      }
    });

    const surname = cleanText(rawObj.surname);
    const firstName = cleanText(rawObj.firstName);

    // Skip empty lines
    if (!surname && !firstName) continue;

    const admissionNumber = cleanText(rawObj.admissionNumber);
    const tutorGroup = cleanText(rawObj.tutorGroup);
    const sex = cleanSex(rawObj.sex);
    const sen = classListFields.has('sen') ? cleanSEN(rawObj.sen) : '';
    const disadvantaged = classListFields.has('disadvantaged') ? cleanDisadvantaged(rawObj.disadvantaged) : '';
    const eal = cleanEAL(rawObj.eal);

    let className = defaultClassName;
    let rawClass = defaultClassName;
    if (hasClassColumn && rawObj.className) {
      const formatted = formatClass(rawObj.className, '11');
      className = formatted.displayClass;
      rawClass = formatted.fullLabel;
    }

    students.push({
      surname,
      firstName,
      admissionNumber,
      tutorGroup,
      sex,
      sen,
      disadvantaged,
      eal,
      className,
      rawClass,
      fileName,
      hasFileClassColumn: hasClassColumn
    });
  }

  return {
    fileName,
    defaultClassName,
    hasClassColumn,
    students
  };
}

/**
 * Merge new class lists into snapshot records:
 * MATCHING:
 * 1. Use the admission number when BOTH files have it.
 * 2. Otherwise use the name key (surname + first name, lower case, trimmed, spaces collapsed, hyphens as spaces).
 * MERGE:
 * - Attach each student's new class and EAL.
 * - If SEN or disadvantaged status differs between the files, keep snapshot value and list conflict in diagnostics.
 * TWO LISTS:
 * - inNewClassesNoMockResult: students in new classes with no mock result (by new class)
 * - inSnapshotNotInNewClass: students in snapshot not in any new class
 */
export function mergeClassListsIntoSnapshot(snapshotRecords, newClassStudents) {
  const matchedPairs = [];
  const conflicts = [];
  const matchedSnapshotIndices = new Set();
  const matchedNewIndices = new Set();

  // Pass 1: Match by admission number when BOTH files have it
  for (let ni = 0; ni < newClassStudents.length; ni++) {
    const ns = newClassStudents[ni];
    const nAdm = cleanText(ns.admissionNumber);
    if (!nAdm) continue;

    for (let si = 0; si < snapshotRecords.length; si++) {
      if (matchedSnapshotIndices.has(si)) continue;
      const sr = snapshotRecords[si];
      const sAdm = cleanText(sr.admissionNumber);
      if (!sAdm) continue;

      if (nAdm === sAdm) {
        matchedSnapshotIndices.add(si);
        matchedNewIndices.add(ni);
        matchedPairs.push({ snapshotRecord: sr, newClassStudent: ns, matchMethod: 'admissionNumber' });
        break;
      }
    }
  }

  // Pass 2: Match remaining students using name key
  // (surname + first name, lower case, trimmed, spaces collapsed, hyphens as spaces)
  for (let ni = 0; ni < newClassStudents.length; ni++) {
    if (matchedNewIndices.has(ni)) continue;
    const ns = newClassStudents[ni];
    const nKey = buildNameKey(ns.surname, ns.firstName);
    if (!nKey) continue;

    for (let si = 0; si < snapshotRecords.length; si++) {
      if (matchedSnapshotIndices.has(si)) continue;
      const sr = snapshotRecords[si];
      const sKey = buildNameKey(sr.surname, sr.firstName);
      if (nKey === sKey) {
        matchedSnapshotIndices.add(si);
        matchedNewIndices.add(ni);
        matchedPairs.push({ snapshotRecord: sr, newClassStudent: ns, matchMethod: 'nameKey' });
        break;
      }
    }
  }

  // Merge attributes for matched students
  matchedPairs.forEach(({ snapshotRecord, newClassStudent }) => {
    snapshotRecord.newClassName = newClassStudent.className;
    snapshotRecord.rawNewClassName = newClassStudent.rawClass || newClassStudent.className;
    snapshotRecord.eal = newClassStudent.eal || 'No';
    snapshotRecord.hasNewClass = true;

    // A class-list Y/Yes says only that the pupil has SEN; it does not distinguish Support from EHCP.
    const classListSen = cleanText(newClassStudent.sen).toLowerCase();
    const senConflict = ['y', 'yes', 'true'].includes(classListSen)
      ? snapshotRecord.sen === 'No SEN'
      : ['n', 'no', 'false'].includes(classListSen)
        ? snapshotRecord.sen !== 'No SEN'
        : newClassStudent.sen !== snapshotRecord.sen;
    // Check SEN conflict: keep snapshot value
    if (newClassStudent.sen && snapshotRecord.sen && senConflict) {
      conflicts.push({
        type: 'SEN Status',
        studentName: `${snapshotRecord.surname}, ${snapshotRecord.firstName}`,
        className: newClassStudent.className,
        snapshotValue: snapshotRecord.sen,
        classListValue: newClassStudent.sen
      });
    }

    // Check Disadvantaged conflict: keep snapshot value
    if (newClassStudent.disadvantaged && snapshotRecord.disadvantaged && newClassStudent.disadvantaged !== snapshotRecord.disadvantaged) {
      conflicts.push({
        type: 'Disadvantaged Status',
        studentName: `${snapshotRecord.surname}, ${snapshotRecord.firstName}`,
        className: newClassStudent.className,
        snapshotValue: snapshotRecord.disadvantaged,
        classListValue: newClassStudent.disadvantaged
      });
    }
  });

  // Students in snapshot not in any new class
  const inSnapshotNotInNewClass = [];
  snapshotRecords.forEach((sr, idx) => {
    if (!matchedSnapshotIndices.has(idx)) {
      sr.hasNewClass = false;
      sr.newClassName = null;
      sr.isSnapshotOnly = true;
      inSnapshotNotInNewClass.push(sr);
    }
  });

  // Students in new classes with no mock result
  const inNewClassesNoMockResult = [];
  newClassStudents.forEach((ns, idx) => {
    if (!matchedNewIndices.has(idx)) {
      const studentObj = {
        ...ns,
        className: null, // No Year 10 mock class
        currentClassName: null,
        newClassName: ns.className,
        rawNewClassName: ns.rawClass || ns.className,
        result: null,
        points: null,
        estimate: null,
        progress: null,
        isNotSat: true,
        hasMockResult: false,
        isNewClassOnly: true
      };
      inNewClassesNoMockResult.push(studentObj);
    }
  });

  return {
    matchedCount: matchedPairs.length,
    inSnapshotNotInNewClass,
    inNewClassesNoMockResult,
    conflicts
  };
}
