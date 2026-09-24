/**
 * QLA Service & Snapshot Integration
 * Pure module for matching QLA student data with mock snapshot records.
 * Runs completely offline and client-side (no DOM, no storage, no network).
 */

import { parseQlaWorkbook } from './qlaParser.js';
import { buildNameKey } from './parser.js';
import * as XLSX from 'xlsx';

/**
 * Matches QLA students from parsed papers to snapshot records using nameKey.
 * Attaches snapshot demographics, results, and resolves active class based on activeGrouping.
 *
 * @param {Array<Object>} papers - Array of parsed papers from parseQlaWorkbook
 * @param {Array<Object>} snapshotRecords - In-memory mock snapshot records
 * @param {string} activeGrouping - 'current' (Year 10) | 'new' (Year 11)
 * @returns {{ papers: Array<Object>, unmatchedStudents: Array<Object> }}
 */
export function matchQlaStudents(papers, snapshotRecords = [], activeGrouping = 'current') {
  const snapshotByNameKey = new Map();

  if (Array.isArray(snapshotRecords)) {
    for (const sr of snapshotRecords) {
      const key = sr.nameKey || buildNameKey(sr.surname, sr.firstName);
      if (key && !snapshotByNameKey.has(key)) {
        snapshotByNameKey.set(key, sr);
      }
    }
  }

  const unmatchedStudentsMap = new Map();

  const processedPapers = papers.map(paper => {
    const students = paper.students.map(student => {
      const sKey = student.nameKey || buildNameKey(student.surname, student.firstName);
      const snapshotMatch = sKey ? snapshotByNameKey.get(sKey) : null;

      if (snapshotMatch) {
        const currentClass = snapshotMatch.className || student.className;
        const newClass = snapshotMatch.newClassName || null;
        const activeClass = (activeGrouping === 'new' && newClass) ? newClass : currentClass;

        return {
          ...student,
          snapshotMatched: true,
          currentClass,
          newClass,
          activeClass,
          result: snapshotMatch.result ?? null,
          displayResult: snapshotMatch.displayResult ?? (snapshotMatch.result != null ? String(snapshotMatch.result) : ''),
          points: snapshotMatch.points ?? null,
          sen: snapshotMatch.sen || 'No SEN',
          disadvantaged: snapshotMatch.disadvantaged || 'No',
          eal: snapshotMatch.eal || 'No',
          snapshotRecord: snapshotMatch
        };
      }

      // Unmatched student: keeps QLA class column and flagged as unmatched
      const unmatchedKey = `${student.name}__${student.className}`;
      if (!unmatchedStudentsMap.has(unmatchedKey)) {
        unmatchedStudentsMap.set(unmatchedKey, {
          name: student.name,
          surname: student.surname,
          firstName: student.firstName,
          className: student.className,
          papers: [paper.paper]
        });
      } else {
        const entry = unmatchedStudentsMap.get(unmatchedKey);
        if (!entry.papers.includes(paper.paper)) {
          entry.papers.push(paper.paper);
        }
      }

      return {
        ...student,
        snapshotMatched: false,
        currentClass: student.className,
        newClass: null,
        activeClass: student.className,
        result: null,
        displayResult: '',
        points: null,
        sen: null,
        disadvantaged: null,
        eal: null,
        snapshotRecord: null
      };
    });

    return {
      ...paper,
      students
    };
  });

  return {
    papers: processedPapers,
    unmatchedStudents: Array.from(unmatchedStudentsMap.values())
  };
}

/**
 * Processes QLA raw sheets with parseQlaWorkbook, matches students with the snapshot,
 * and compiles diagnostics statistics.
 *
 * @param {Array<{ name: string, rows: any[][] }>} sheets
 * @param {string} fileName
 * @param {Array<Object>} snapshotRecords
 * @param {string} activeGrouping
 * @returns {Object}
 */
export function processQlaWorkbookData(sheets, fileName = '', snapshotRecords = [], activeGrouping = 'current') {
  // Pure call to existing parseQlaWorkbook without modification
  const parsedQla = parseQlaWorkbook(sheets, fileName);

  const { papers, unmatchedStudents } = matchQlaStudents(
    parsedQla.papers,
    snapshotRecords,
    activeGrouping
  );

  let presentCount = 0;
  let absentCount = 0;
  let incompleteCount = 0;
  let totalStudentEntries = 0;

  const papersSummary = papers.map(p => {
    let pPresent = 0;
    let pAbsent = 0;
    let pIncomplete = 0;

    for (const s of p.students) {
      totalStudentEntries++;
      if (s.status === 'present') {
        presentCount++;
        pPresent++;
      } else if (s.status === 'absent') {
        absentCount++;
        pAbsent++;
      } else if (s.status === 'incomplete') {
        incompleteCount++;
        pIncomplete++;
      }
    }

    return {
      name: p.paper,
      tier: p.tier,
      sheetName: p.sheetName,
      studentCount: p.students.length,
      present: pPresent,
      absent: pAbsent,
      incomplete: pIncomplete
    };
  });

  return {
    assessmentTitle: parsedQla.assessmentTitle,
    papers,
    diagnostics: {
      assessmentTitle: parsedQla.assessmentTitle,
      papersFound: papersSummary,
      totalStudents: totalStudentEntries,
      present: presentCount,
      absent: absentCount,
      incomplete: incompleteCount,
      unmatchedCount: unmatchedStudents.length,
      unmatchedStudents,
      warnings: parsedQla.diagnostics?.warnings || []
    }
  };
}

/**
 * Creates the invented data sheet arrays for the downloadable QLA template.
 * Follows exact user layout: Row 1 title, Row 2 headers/sections, Row 3 question labels,
 * Row 4 max marks, Rows 5+ 8 students across 10SP1 and 10SP2 with 1 absent per paper.
 *
 * @returns {Array<{ name: string, rows: any[][] }>}
 */
export function createQlaTemplateSheets() {
  const commonTitle = 'Question Level Analysis (QLA) for Y10 Spanish Assessment (example)';

  // 8 invented students across 10SP1 and 10SP2 (7 present, 1 absent)
  const students = [
    { name: 'Rivera, Carlos', className: '10SP1', absent: false },
    { name: 'Patel, Priya', className: '10SP1', absent: false },
    { name: 'Taylor, Dan', className: '10SP1', absent: false },
    { name: 'Wilson, Sophie', className: '10SP1', absent: false },
    { name: 'Green, Oliver', className: '10SP2', absent: false },
    { name: 'Ahmed, Maya', className: '10SP2', absent: false },
    { name: 'Davies, Lucas', className: '10SP2', absent: false },
    { name: 'Clark, Emma', className: '10SP2', absent: true }
  ];

  const paperConfigs = [
    {
      sheetName: 'Listening F',
      sectionA: ['Q1-4 Free time', 'Q5-8 School', 'Q9-12 Holidays'],
      sectionB: ['Q13 Dictation'],
      maxMarks: [10, 10, 10, 10],
      sampleScores: [
        [8, 7, 9, 8],
        [9, 8, 8, 9],
        [6, 7, 7, 6],
        [7, 8, 6, 8],
        [5, 6, 6, 5],
        [8, 9, 7, 8],
        [6, 5, 7, 6]
      ]
    },
    {
      sheetName: 'Listening H',
      sectionA: ['Q1-4 Future plans', 'Q5-8 Environment', 'Q9-12 Media'],
      sectionB: ['Q13 Dictation'],
      maxMarks: [10, 10, 10, 10],
      sampleScores: [
        [7, 8, 8, 7],
        [9, 8, 9, 8],
        [6, 6, 7, 6],
        [8, 7, 8, 7],
        [5, 5, 6, 6],
        [7, 8, 8, 8],
        [6, 6, 5, 6]
      ]
    },
    {
      sheetName: 'Reading F',
      sectionA: ['Q1-4 Family', 'Q5-8 Town', 'Q9-12 Technology'],
      sectionB: ['Q13 Translation into English'],
      maxMarks: [10, 10, 10, 10],
      sampleScores: [
        [8, 9, 8, 7],
        [9, 9, 8, 9],
        [7, 6, 7, 7],
        [8, 8, 7, 8],
        [6, 6, 5, 6],
        [9, 8, 8, 8],
        [6, 7, 6, 5]
      ]
    },
    {
      sheetName: 'Reading H',
      sectionA: ['Q1-4 Travel', 'Q5-8 Healthy living', 'Q9-12 Work'],
      sectionB: ['Q13 Translation into English'],
      maxMarks: [10, 10, 10, 10],
      sampleScores: [
        [7, 8, 8, 8],
        [9, 8, 9, 9],
        [6, 7, 6, 6],
        [8, 8, 7, 7],
        [5, 6, 6, 5],
        [8, 8, 7, 8],
        [6, 5, 6, 6]
      ]
    },
    {
      sheetName: 'Writing F',
      questions: [
        'Q1 Photo description AO1',
        'Q2 50 word message AO1',
        'Q3 Translation into Spanish AO3',
        'Q4 90 word task AO2 AO3'
      ],
      maxMarks: [8, 10, 10, 12],
      sampleScores: [
        [6, 8, 7, 10],
        [7, 9, 8, 11],
        [5, 7, 6, 8],
        [6, 8, 7, 9],
        [5, 6, 5, 7],
        [7, 8, 7, 10],
        [5, 6, 6, 7]
      ]
    },
    {
      sheetName: 'Writing H',
      questions: [
        'Q1 Translation into Spanish AO3',
        'Q2 90 word task AO2 AO3',
        'Q3 150 word task AO2 AO3'
      ],
      maxMarks: [10, 15, 25],
      sampleScores: [
        [8, 12, 19],
        [9, 13, 21],
        [7, 10, 16],
        [8, 12, 18],
        [6, 9, 14],
        [8, 12, 20],
        [6, 9, 15]
      ]
    }
  ];

  const sheets = [];

  for (const cfg of paperConfigs) {
    const rows = [];
    // Row 1: Assessment title
    rows.push([commonTitle]);

    const qLabels = cfg.questions || [...cfg.sectionA, ...cfg.sectionB];
    const totalMax = cfg.maxMarks.reduce((a, b) => a + b, 0);

    // Row 2: Section headers / table headers
    const row2 = ['', 'Student Name', 'Class'];
    if (cfg.sectionA && cfg.sectionB) {
      row2.push('Section A');
      for (let i = 1; i < cfg.sectionA.length; i++) row2.push('');
      row2.push('Section B');
      for (let i = 1; i < cfg.sectionB.length; i++) row2.push('');
    } else {
      for (let i = 0; i < qLabels.length; i++) row2.push('');
    }
    row2.push('TOTAL MARKS', 'PERCENTAGE');
    rows.push(row2);

    // Row 3: Question labels
    const row3 = ['', '', ''];
    for (const q of qLabels) row3.push(q);
    row3.push('', '');
    rows.push(row3);

    // Row 4: Marks per Q
    const row4 = ['', 'Marks per Q', ''];
    for (const m of cfg.maxMarks) row4.push(m);
    row4.push(totalMax, '');
    rows.push(row4);

    // Rows 5 onwards: 8 students (7 present, 1 absent)
    let scoreIdx = 0;
    for (let sIdx = 0; sIdx < students.length; sIdx++) {
      const st = students[sIdx];
      const sNum = sIdx + 1;
      const sRow = [sNum, st.name, st.className];

      if (st.absent) {
        for (let i = 0; i < qLabels.length; i++) sRow.push('A');
        sRow.push(0, '0.0%');
      } else {
        const scores = cfg.sampleScores[scoreIdx++] || cfg.maxMarks.map(m => Math.round(m * 0.75));
        const total = scores.reduce((a, b) => a + b, 0);
        const pct = Math.round((total / totalMax) * 1000) / 10;
        for (const sc of scores) sRow.push(sc);
        sRow.push(total, `${pct.toFixed(1)}%`);
      }
      rows.push(sRow);
    }

    sheets.push({
      name: cfg.sheetName,
      rows
    });
  }

  // Last sheet: "How to fill this in"
  sheets.push({
    name: 'How to fill this in',
    rows: [
      ['What a QLA file needs (Guide)'],
      [''],
      ['1. One sheet per paper. Add F or H at the end of the sheet name for tiered papers (e.g. "Listening F", "Reading H").'],
      ['2. A "Student Name" column in the form Surname, First Name (e.g. "Rivera, Carlos").'],
      ['3. A "Class" column.'],
      ['4. Question labels starting with Q (for example "Q5 School life"). Optional: "Section A" labels above them, and AO1, AO2 or AO3 in the label.'],
      ['5. A "Marks per Q" row with the maximum mark for each question.'],
      ['6. TOTAL MARKS and PERCENTAGE columns at the end. The app recalculates them.'],
      ['7. A for absent. Leave no other blanks.'],
      ['8. Works for any subject: sheet names and question labels can be anything.']
    ]
  });

  return sheets;
}

/**
 * Builds the SheetJS workbook object for the QLA template.
 * Runs completely in-memory.
 *
 * @returns {XLSX.WorkBook}
 */
export function generateQlaTemplateWorkbook() {
  const wb = XLSX.utils.book_new();
  const sheets = createQlaTemplateSheets();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return wb;
}

