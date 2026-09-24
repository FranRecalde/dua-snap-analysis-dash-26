import { describe, it, expect } from 'vitest';
import {
  processQlaWorkbookData,
  matchQlaStudents,
  createQlaTemplateSheets,
  generateQlaTemplateWorkbook
} from '../src/qlaService.js';
import { parseQlaWorkbook } from '../src/qlaParser.js';
import { buildNameKey } from '../src/parser.js';
import { calculateStudentsReport } from '../src/qlaStats.js';
import * as XLSX from 'xlsx';

describe('QLA Feature & Snapshot Integration Tests (Invented Data)', () => {
  // Invented Snapshot Data
  const mockSnapshotRecords = [
    {
      id: 1,
      surname: 'Rivera',
      firstName: 'Carlos',
      nameKey: buildNameKey('Rivera', 'Carlos'),
      className: '10SP1',
      rawClass: '10/Sp1 (25/26)',
      newClassName: '11SP2',
      result: '5',
      displayResult: '5',
      points: 5,
      sen: 'No SEN',
      disadvantaged: 'No',
      eal: 'No'
    },
    {
      id: 2,
      surname: 'Patel',
      firstName: 'Priya',
      nameKey: buildNameKey('Patel', 'Priya'),
      className: '10SP1',
      rawClass: '10/Sp1 (25/26)',
      newClassName: '11SP1',
      result: '7',
      displayResult: '7',
      points: 7,
      sen: 'SEN Support',
      disadvantaged: 'Yes',
      eal: 'Yes'
    }
  ];

  // Invented QLA Workbook Sheet: "Listening F"
  // Students: "Rivera, Carlos" and "Patel, Priya" in class 10SP1, plus "Smith, John" not in snapshot.
  const inventedListeningRows = [
    ['Question Level Analysis (QLA) for Y10 Spanish Mock Exam 2026'],
    ['', 'Student Name', 'Class', 'Section A', '', 'Section B', '', 'TOTAL MARKS', 'PERCENTAGE'],
    ['', '', '', 'Q1-4 A busy week', 'Q5 School life', 'Q6-8 Holidays', 'Q9 Future plans', '', ''],
    ['', 'Marks per Q', '', 5, 5, 10, 10, 30, ''],
    [1, 'Rivera, Carlos', '10SP1', 5, 4, 8, 9, 26, '86.7%'],
    [2, 'Patel, Priya', '10SP1', 3, 5, 7, 8, 23, '76.7%'],
    [3, 'Smith, John', '10SP1', 4, 3, 6, 7, 20, '66.7%']
  ];

  const inventedSheets = [
    {
      name: 'Listening F',
      rows: inventedListeningRows
    }
  ];

  it('1. Matches QLA students to snapshot using nameKey and attaches snapshot data', () => {
    const qlaResult = processQlaWorkbookData(
      inventedSheets,
      'Y10_Spanish_QLA.xlsx',
      mockSnapshotRecords,
      'current'
    );

    expect(qlaResult.assessmentTitle).toBe('Question Level Analysis (QLA) for Y10 Spanish Mock Exam 2026');
    expect(qlaResult.papers).toHaveLength(1);

    const paper = qlaResult.papers[0];
    expect(paper.paper).toBe('Listening');
    expect(paper.tier).toBe('Foundation');
    expect(paper.students).toHaveLength(3);

    // Rivera, Carlos (Matched)
    const carlos = paper.students.find(s => s.name === 'Rivera, Carlos');
    expect(carlos).toBeDefined();
    expect(carlos.snapshotMatched).toBe(true);
    expect(carlos.currentClass).toBe('10SP1');
    expect(carlos.newClass).toBe('11SP2');
    expect(carlos.activeClass).toBe('10SP1');
    expect(carlos.result).toBe('5');
    expect(carlos.points).toBe(5);
    expect(carlos.sen).toBe('No SEN');
    expect(carlos.disadvantaged).toBe('No');
    expect(carlos.eal).toBe('No');

    // Patel, Priya (Matched)
    const priya = paper.students.find(s => s.name === 'Patel, Priya');
    expect(priya).toBeDefined();
    expect(priya.snapshotMatched).toBe(true);
    expect(priya.currentClass).toBe('10SP1');
    expect(priya.newClass).toBe('11SP1');
    expect(priya.activeClass).toBe('10SP1');
    expect(priya.result).toBe('7');
    expect(priya.points).toBe(7);
    expect(priya.sen).toBe('SEN Support');
    expect(priya.disadvantaged).toBe('Yes');
    expect(priya.eal).toBe('Yes');
  });

  it('2. QLA student with no snapshot match keeps QLA class column and is listed as unmatched', () => {
    const qlaResult = processQlaWorkbookData(
      inventedSheets,
      'Y10_Spanish_QLA.xlsx',
      mockSnapshotRecords,
      'current'
    );

    const paper = qlaResult.papers[0];
    const john = paper.students.find(s => s.name === 'Smith, John');

    expect(john).toBeDefined();
    expect(john.snapshotMatched).toBe(false);
    expect(john.className).toBe('10 SP1');
    expect(john.currentClass).toBe('10 SP1'); // keeps QLA class column
    expect(john.activeClass).toBe('10 SP1');
    expect(john.newClass).toBeNull();
    expect(john.result).toBeNull();
    expect(john.points).toBeNull();

    // Diagnostics should list John Smith under unmatched
    const { unmatchedStudents, unmatchedCount } = qlaResult.diagnostics;
    expect(unmatchedCount).toBe(1);
    expect(unmatchedStudents).toHaveLength(1);
    expect(unmatchedStudents[0].name).toBe('Smith, John');
    expect(unmatchedStudents[0].className).toBe('10 SP1');
  });

  it('3. QLA results follow view switch: current classes vs new classes', () => {
    // Grouping: current
    const currentResult = processQlaWorkbookData(
      inventedSheets,
      'Y10_Spanish_QLA.xlsx',
      mockSnapshotRecords,
      'current'
    );
    const priyaCurrent = currentResult.papers[0].students.find(s => s.name === 'Patel, Priya');
    expect(priyaCurrent.activeClass).toBe('10SP1');

    // Grouping: new
    const newResult = processQlaWorkbookData(
      inventedSheets,
      'Y10_Spanish_QLA.xlsx',
      mockSnapshotRecords,
      'new'
    );
    const priyaNew = newResult.papers[0].students.find(s => s.name === 'Patel, Priya');
    expect(priyaNew.activeClass).toBe('11SP1');

    // Unmatched student keeps QLA class under new classes view
    const johnNew = newResult.papers[0].students.find(s => s.name === 'Smith, John');
    expect(johnNew.activeClass).toBe('10 SP1');
  });

  it('4. Diagnostics summary reports papers found, students per paper, attendance, unmatched, and warnings', () => {
    const qlaResult = processQlaWorkbookData(
      inventedSheets,
      'Y10_Spanish_QLA.xlsx',
      mockSnapshotRecords,
      'current'
    );

    const diag = qlaResult.diagnostics;
    expect(diag.assessmentTitle).toBe('Question Level Analysis (QLA) for Y10 Spanish Mock Exam 2026');
    expect(diag.papersFound).toEqual([
      {
        name: 'Listening',
        tier: 'Foundation',
        sheetName: 'Listening F',
        studentCount: 3,
        present: 3,
        absent: 0,
        incomplete: 0
      }
    ]);
    expect(diag.totalStudents).toBe(3);
    expect(diag.present).toBe(3);
    expect(diag.absent).toBe(0);
    expect(diag.incomplete).toBe(0);
    expect(diag.unmatchedCount).toBe(1);
    expect(diag.unmatchedStudents[0].name).toBe('Smith, John');
    expect(diag.warnings).toEqual([]);
  });

  it('5. Correctly handles multiple papers with mixed tiers and attendance statuses', () => {
    const multiSheets = [
      {
        name: 'Listening F',
        rows: inventedListeningRows
      },
      {
        name: 'Reading H',
        rows: [
          ['Reading Higher Tier QLA'],
          ['', 'Student Name', 'Class', 'Q1 Vocab', 'TOTAL MARKS', 'PERCENTAGE'],
          ['', 'Marks per Q', '', 10, 10, ''],
          [1, 'Patel, Priya', '10SP1', 9, 9, '90.0%'],
          [2, 'Absent Student', '10SP1', 'A', 0, '0%']
        ]
      }
    ];

    const result = processQlaWorkbookData(multiSheets, 'Multi_QLA.xlsx', mockSnapshotRecords);

    expect(result.papers).toHaveLength(2);
    expect(result.diagnostics.papersFound).toHaveLength(2);
    expect(result.diagnostics.papersFound[0].name).toBe('Listening');
    expect(result.diagnostics.papersFound[0].tier).toBe('Foundation');
    expect(result.diagnostics.papersFound[1].name).toBe('Reading');
    expect(result.diagnostics.papersFound[1].tier).toBe('Higher');

    expect(result.diagnostics.present).toBe(4);
    expect(result.diagnostics.absent).toBe(1);
    expect(result.diagnostics.unmatchedCount).toBe(2); // Smith, John and Absent Student
  });

  it('6. Incomplete student marks are correctly flagged with warnings and incomplete status', () => {
    const incompleteSheets = [
      {
        name: 'Writing',
        rows: [
          ['Writing Assessment'],
          ['', 'Student Name', 'Class', 'Q1 40-word', 'Q2 90-word', 'TOTAL MARKS', 'PERCENTAGE'],
          ['', 'Marks per Q', '', 10, 10, 20, ''],
          [1, 'Rivera, Carlos', '10SP1', 8, '', 8, '40.0%'] // Q2 blank -> incomplete
        ]
      }
    ];

    const result = processQlaWorkbookData(incompleteSheets, 'Writing.xlsx', mockSnapshotRecords);
    expect(result.papers[0].students[0].status).toBe('incomplete');
    expect(result.diagnostics.incomplete).toBe(1);
    expect(result.diagnostics.warnings.length).toBeGreaterThan(0);
    expect(result.diagnostics.warnings[0]).toContain('incomplete question marks');
  });

  it('7. Matches students resiliently with hyphenated names and case variations via buildNameKey', () => {
    const hyphenSnapshot = [
      {
        id: 1,
        surname: 'Rivera-Cruz',
        firstName: 'Carlos',
        nameKey: buildNameKey('Rivera-Cruz', 'Carlos'), // rivera cruz carlos
        className: '10SP1',
        result: '6',
        points: 6,
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No'
      }
    ];

    const qlaRows = [
      ['Title'],
      ['', 'Student Name', 'Class', 'Q1', 'TOTAL MARKS', 'PERCENTAGE'],
      ['', 'Marks per Q', '', 10, 10, ''],
      [1, 'Rivera Cruz, Carlos', '10SP1', 8, 8, '80.0%'] // Space instead of hyphen
    ];

    const result = processQlaWorkbookData(
      [{ name: 'Paper 1', rows: qlaRows }],
      'Test.xlsx',
      hyphenSnapshot
    );

    const student = result.papers[0].students[0];
    expect(student.snapshotMatched).toBe(true);
    expect(student.points).toBe(6);
    expect(student.result).toBe('6');
  });

  it('8. Operates safely when snapshot records are empty (all QLA students unmatched)', () => {
    const result = processQlaWorkbookData(
      inventedSheets,
      'Y10_Spanish_QLA.xlsx',
      [] // empty snapshot
    );

    expect(result.papers[0].students).toHaveLength(3);
    result.papers[0].students.forEach(s => {
      expect(s.snapshotMatched).toBe(false);
      expect(s.result).toBeNull();
      expect(s.points).toBeNull();
    });
    expect(result.diagnostics.unmatchedCount).toBe(3);
  });

  it('9. Builds downloadable QLA template in memory and parses with parseQlaWorkbook with 6 papers, 8 students per paper, and 1 absent per paper', () => {
    // 1. Build template workbook in memory
    const wb = generateQlaTemplateWorkbook();
    expect(wb.SheetNames).toEqual([
      'Listening F',
      'Listening H',
      'Reading F',
      'Reading H',
      'Writing F',
      'Writing H',
      'How to fill this in'
    ]);

    // 2. Read sheets back using SheetJS (simulating client file read)
    const sheets = wb.SheetNames.map(name => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
    }));

    // 3. Parse with parseQlaWorkbook
    const parsed = parseQlaWorkbook(sheets, 'Y10_Spanish_Assessment_QLA_Example.xlsx');

    // Assert: 6 papers (skipping the "How to fill this in" guide sheet)
    expect(parsed.papers).toHaveLength(6);
    expect(parsed.assessmentTitle).toBe('Question Level Analysis (QLA) for Y10 Spanish Assessment (example)');

    // For every paper, assert 8 students, 7 present, 1 absent, 0 incomplete
    for (const paper of parsed.papers) {
      expect(paper.students).toHaveLength(8);

      const presentStudents = paper.students.filter(s => s.status === 'present');
      const absentStudents = paper.students.filter(s => s.status === 'absent');
      const incompleteStudents = paper.students.filter(s => s.status === 'incomplete');

      expect(presentStudents).toHaveLength(7);
      expect(absentStudents).toHaveLength(1);
      expect(incompleteStudents).toHaveLength(0);

      // Verify the absent student is Clark, Emma
      expect(absentStudents[0].name).toBe('Clark, Emma');
      expect(absentStudents[0].className).toBe('10 SP2');
    }

    // The only warning in diagnostics is the informational note that the guide sheet was skipped
    expect(parsed.diagnostics.warnings).toEqual([
      '[How to fill this in] Could not find a "Student Name" header row; sheet was skipped.'
    ]);
  });

  it('10. Changing the view switch changes the class selector options in the Classes tab', () => {
    // 1. Process with activeGrouping = 'current'
    const qlaCurrent = processQlaWorkbookData(
      inventedSheets,
      'Y10_Spanish_QLA.xlsx',
      mockSnapshotRecords,
      'current'
    );
    // Distinct classes with 'current'
    const currentClasses = new Set();
    for (const p of qlaCurrent.papers) {
      for (const s of p.students) {
        currentClasses.add(s.activeClass);
      }
    }
    const currentList = Array.from(currentClasses).sort();
    expect(currentList).toContain('10SP1');
    expect(currentList).not.toContain('11SP1');
    expect(currentList).not.toContain('11SP2');

    // 2. Process with activeGrouping = 'new'
    const qlaNew = processQlaWorkbookData(
      inventedSheets,
      'Y10_Spanish_QLA.xlsx',
      mockSnapshotRecords,
      'new'
    );
    // Distinct classes with 'new' (Rivera is 11SP2, Patel is 11SP1)
    const newClasses = new Set();
    for (const p of qlaNew.papers) {
      for (const s of p.students) {
        newClasses.add(s.activeClass);
      }
    }
    const newClassList = Array.from(newClasses).sort();
    expect(newClassList).toContain('11SP1');
    expect(newClassList).toContain('11SP2');
    expect(newClassList).not.toEqual(currentList);
  });

  it('11. Complete Students tab report runs on parsed template workbook with snapshot matching', () => {
    // 1. Generate template workbook and read sheets
    const wb = generateQlaTemplateWorkbook();
    const sheets = wb.SheetNames.map(name => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
    }));

    // 2. Process with snapshot records
    const qlaResult = processQlaWorkbookData(
      sheets,
      'Y10_Spanish_Template.xlsx',
      mockSnapshotRecords,
      'current'
    );

    // 3. Run Students tab report calculation
    const report = calculateStudentsReport(
      qlaResult.papers,
      { className: 'ALL' },
      { strong: 70, weak: 40 },
      { isClassListsLoaded: true }
    );

    expect(report.papers).toHaveLength(6);
    expect(report.allStudents.length).toBeGreaterThan(0);

    // Clark, Emma is absent in the template on all papers
    const clark = report.allStudents.find(s => s.name === 'Clark, Emma');
    expect(clark).toBeDefined();
    expect(clark.satPapers).toHaveLength(0);
    expect(clark.strongestPaper).toBe('not enough papers');
    expect(clark.weakestPaper).toBe('not enough papers');
    expect(clark.missedCount).toBe(6);

    // Rivera, Carlos sat Foundation papers (Listening F, Reading F, Writing F)
    const carlos = report.allStudents.find(s => s.name === 'Rivera, Carlos');
    expect(carlos).toBeDefined();
    expect(carlos.satPapers.length).toBeGreaterThanOrEqual(3);
    expect(carlos.strongestPaper).not.toBe('not enough papers');
    expect(carlos.weakestPaper).not.toBe('not enough papers');
    expect(carlos.mockResult).toBe('5');
    expect(carlos.gapToGrade5).toBe('0');

    // Missed papers includes Emma
    expect(report.missedPapersStudents.some(s => s.name === 'Clark, Emma')).toBe(true);
  });
});


