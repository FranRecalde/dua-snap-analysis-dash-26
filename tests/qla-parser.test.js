import { describe, it, expect } from 'vitest';
import {
  splitSurnameFirst,
  parsePaperAndTier,
  parseQuestionLabel,
  parseQlaWorkbook
} from '../src/qlaParser.js';
import { formatClass } from '../src/parser.js';

describe('QLA Workbook Parser', () => {
  // Test 1: Listening layout (labels one row below header row)
  it('1. A sheet where the question labels sit one row below the header row (the Listening layout)', () => {
    const listeningRows = [
      ['Question Level Analysis (QLA) for Y10 Spanish Trust-wide Assessment C3 2026'],
      ['', 'Student Name', 'Class', 'Section A', '', 'Section B', '', 'TOTAL MARKS', 'PERCENTAGE'],
      ['', '', '', 'Q1-4 A busy week', 'Q5 School life', 'Q6-8 Holidays', 'Q9 Future plans', '', ''],
      ['', 'Marks per Q', '', 5, 5, 10, 10, 30, ''],
      [1, 'Rivera, Carlos', '10SP1', 5, 4, 8, 9, 26, '86.7%'],
      [2, 'Patel, Priya', '10SP1', 3, 5, 7, 8, 23, '76.7%']
    ];

    const result = parseQlaWorkbook([{ name: 'Listening F', rows: listeningRows }]);

    expect(result.assessmentTitle).toBe('Question Level Analysis (QLA) for Y10 Spanish Trust-wide Assessment C3 2026');
    expect(result.papers).toHaveLength(1);

    const paper = result.papers[0];
    expect(paper.sheetName).toBe('Listening F');
    expect(paper.paper).toBe('Listening');
    expect(paper.tier).toBe('Foundation');
    expect(paper.totalMax).toBe(30);

    expect(paper.questions).toHaveLength(4);
    expect(paper.questions[0]).toEqual({
      key: 'q1',
      label: 'Q1-4 A busy week',
      qRange: 'Q1-4',
      topic: 'A busy week',
      section: 'Section A',
      ao: null,
      maxMarks: 5
    });
    expect(paper.questions[1]).toEqual({
      key: 'q2',
      label: 'Q5 School life',
      qRange: 'Q5',
      topic: 'School life',
      section: 'Section A',
      ao: null,
      maxMarks: 5
    });
    expect(paper.questions[2]).toEqual({
      key: 'q3',
      label: 'Q6-8 Holidays',
      qRange: 'Q6-8',
      topic: 'Holidays',
      section: 'Section B',
      ao: null,
      maxMarks: 10
    });
    expect(paper.questions[3]).toEqual({
      key: 'q4',
      label: 'Q9 Future plans',
      qRange: 'Q9',
      topic: 'Future plans',
      section: 'Section B',
      ao: null,
      maxMarks: 10
    });

    expect(paper.students).toHaveLength(2);
    expect(paper.students[0]).toMatchObject({
      name: 'Rivera, Carlos',
      surname: 'Rivera',
      firstName: 'Carlos',
      nameKey: 'rivera carlos',
      classRaw: '10SP1',
      className: '10 SP1',
      marks: { q1: 5, q2: 4, q3: 8, q4: 9 },
      total: 26,
      pct: 86.7,
      status: 'present'
    });
  });

  // Test 2: Writing layout (extra blank row after title)
  it('2. A sheet with an extra blank row after the title (the Writing layout)', () => {
    const writingRows = [
      ['Spanish Writing Assessment C3 2026'],
      [''], // Extra blank row after title
      ['Student Name', 'Class', 'Q1 40-word', 'Q2 Grammar - AO3', 'TOTAL MARKS', 'PERCENTAGE'],
      ['Marks per Q', '', 16, 12, 28, ''],
      ['Taylor, Jordan', '10SP2', 12, 10, 22, '78.6%']
    ];

    const result = parseQlaWorkbook([{ name: 'Writing H', rows: writingRows }]);

    expect(result.assessmentTitle).toBe('Spanish Writing Assessment C3 2026');
    const paper = result.papers[0];
    expect(paper.paper).toBe('Writing');
    expect(paper.tier).toBe('Higher');
    expect(paper.totalMax).toBe(28);

    expect(paper.questions).toHaveLength(2);
    expect(paper.questions[0]).toMatchObject({
      key: 'q1',
      label: 'Q1 40-word',
      qRange: 'Q1',
      topic: '40-word',
      ao: null,
      maxMarks: 16
    });
    expect(paper.questions[1]).toMatchObject({
      key: 'q2',
      label: 'Q2 Grammar - AO3',
      qRange: 'Q2',
      topic: 'Grammar - AO3',
      ao: 'AO3',
      maxMarks: 12
    });

    expect(paper.students).toHaveLength(1);
    expect(paper.students[0]).toMatchObject({
      name: 'Taylor, Jordan',
      surname: 'Taylor',
      firstName: 'Jordan',
      className: '10 SP2',
      total: 22,
      pct: 78.6,
      status: 'present'
    });
  });

  // Test 3: Column A blank or undefined
  it('3. A student with no row number in column A is still parsed', () => {
    const rows = [
      ['Reading Assessment'],
      ['', 'Student Name', 'Class', 'Q1 Info', 'TOTAL MARKS'],
      ['', 'Marks per Q', '', 10, 10],
      ['', 'Davies, Morgan', '10SP1', 8, 8],
      [undefined, 'Gomez, Elena', '10SP1', 9, 9]
    ];

    const result = parseQlaWorkbook([{ name: 'Reading F', rows }]);
    expect(result.papers[0].students).toHaveLength(2);
    expect(result.papers[0].students[0].name).toBe('Davies, Morgan');
    expect(result.papers[0].students[1].name).toBe('Gomez, Elena');
  });

  // Test 4: Absent students
  it('4. A student with "A" in the first question and blanks elsewhere is absent. A student with every mark blank and TOTAL 0 is absent', () => {
    const rows = [
      ['Listening Assessment'],
      ['Student Name', 'Class', 'Q1 Intro', 'Q2 Details', 'TOTAL MARKS'],
      ['Marks per Q', '', 5, 5, 10],
      ['Evans, Alex', '10SP1', 'A', '', 0],
      ['Singh, Amara', '10SP1', '', '', 0],
      ['Cole, Ben', '10SP1', 4, 3, 7]
    ];

    const result = parseQlaWorkbook([{ name: 'Listening F', rows }]);
    const students = result.papers[0].students;
    expect(students).toHaveLength(3);

    const evans = students.find(s => s.name === 'Evans, Alex');
    expect(evans.status).toBe('absent');
    expect(evans.marks).toEqual({ q1: null, q2: null });
    expect(evans.total).toBe(0);

    const singh = students.find(s => s.name === 'Singh, Amara');
    expect(singh.status).toBe('absent');
    expect(singh.marks).toEqual({ q1: null, q2: null });
    expect(singh.total).toBe(0);

    const cole = students.find(s => s.name === 'Cole, Ben');
    expect(cole.status).toBe('present');

    expect(result.diagnostics.counts.present).toBe(1);
    expect(result.diagnostics.counts.absent).toBe(2);
  });

  // Test 5: Stray row with no name ignored
  it('5. A stray row with a number and zeros but no name is ignored', () => {
    const rows = [
      ['Listening Assessment'],
      ['Student Name', 'Class', 'Q1 Intro', 'Q2 Details', 'TOTAL MARKS'],
      ['Marks per Q', '', 5, 5, 10],
      ['Evans, Alex', '10SP1', 4, 5, 9],
      [120, 0, 0, 0, 0], // stray row where student name column is empty/0 or no name text
      ['', '', '', '', ''] // empty row
    ];

    const result = parseQlaWorkbook([{ name: 'Listening F', rows }]);
    expect(result.papers[0].students).toHaveLength(1);
    expect(result.papers[0].students[0].name).toBe('Evans, Alex');
  });

  // Test 6: Blank class becomes "Unassigned" with warning
  it('6. A blank class becomes className "Unassigned" with a warning', () => {
    const rows = [
      ['Writing Assessment'],
      ['Student Name', 'Class', 'Q1', 'TOTAL MARKS'],
      ['Marks per Q', '', 10, 10],
      ['Lee, Sam', '', 8, 8]
    ];

    const result = parseQlaWorkbook([{ name: 'Writing F', rows }]);
    const student = result.papers[0].students[0];
    expect(student.classRaw).toBe('');
    expect(student.className).toBe('Unassigned');

    expect(result.diagnostics.counts.unassigned).toBe(1);
    const classWarning = result.diagnostics.warnings.find(w => w.includes('Unassigned') && w.includes('Lee, Sam'));
    expect(classWarning).toBeDefined();
  });

  // Test 7: Recalculated pct (57.99999999999999 ignored -> 58)
  it('7. A sheet percentage of 57.99999999999999 is ignored; pct is recalculated as 58', () => {
    const rows = [
      ['Speaking Assessment'],
      ['Student Name', 'Class', 'Q1 Speaking', 'TOTAL MARKS', 'PERCENTAGE'],
      ['Marks per Q', '', 50, 50, '100%'],
      ['Brown, Chris', '10SP1', 29, 29, '57.99999999999999']
    ];

    const result = parseQlaWorkbook([{ name: 'Speaking H', rows }]);
    const student = result.papers[0].students[0];
    expect(student.total).toBe(29);
    expect(student.pct).toBe(58);
  });

  // Test 8: Label parsing for qRange, topic and ao
  it('8. Labels "Q1-4 A busy week" and "Q5 90-word - AO3 Grammar & Voc" give the right qRange, topic and ao', () => {
    const parsed1 = parseQuestionLabel('Q1-4 A busy week');
    expect(parsed1.qRange).toBe('Q1-4');
    expect(parsed1.topic).toBe('A busy week');
    expect(parsed1.ao).toBeNull();

    const parsed2 = parseQuestionLabel('Q5 90-word - AO3 Grammar & Voc');
    expect(parsed2.qRange).toBe('Q5');
    expect(parsed2.topic).toBe('90-word - AO3 Grammar & Voc');
    expect(parsed2.ao).toBe('AO3');
  });

  // Test 9: Sheet name paper and tier derivation
  it('9. Sheet names "Listening F", "Reading H" and "Writing" give the right paper and tier', () => {
    expect(parsePaperAndTier('Listening F')).toEqual({ paper: 'Listening', tier: 'Foundation' });
    expect(parsePaperAndTier('Reading H')).toEqual({ paper: 'Reading', tier: 'Higher' });
    expect(parsePaperAndTier('Writing')).toEqual({ paper: 'Writing', tier: 'All' });
  });

  // Test 10: Workbook with no usable sheet throws
  it('10. A workbook with no usable sheet throws', () => {
    expect(() => parseQlaWorkbook([])).toThrow('The workbook contains no sheets to parse.');
    expect(() => parseQlaWorkbook([{ name: 'Empty', rows: [] }])).toThrow(
      'No usable QLA sheets found in workbook. Each sheet must contain a "Student Name" header and a "Marks per Q" row.'
    );
    expect(() =>
      parseQlaWorkbook([
        {
          name: 'Invalid Sheet',
          rows: [
            ['Random Header 1', 'Random Header 2'],
            ['Val 1', 'Val 2']
          ]
        }
      ])
    ).toThrow(
      'No usable QLA sheets found in workbook. Each sheet must contain a "Student Name" header and a "Marks per Q" row.'
    );
  });

  // Test 11: splitSurnameFirst and formatClass
  it('11. splitSurnameFirst("Burke Hayward, Chance") gives surname "Burke Hayward", firstName "Chance"; class "10SP2" gives className "10 SP2" and classRaw "10SP2"', () => {
    const split = splitSurnameFirst('Burke Hayward, Chance');
    expect(split.surname).toBe('Burke Hayward');
    expect(split.firstName).toBe('Chance');

    const formatted = formatClass('10SP2');
    expect(formatted.displayClass).toBe('10 SP2');
    expect(formatted.fullLabel).toBe('10SP2');

    // Also test without comma
    const single = splitSurnameFirst('SingleNameOnly');
    expect(single.surname).toBe('SingleNameOnly');
    expect(single.firstName).toBe('');
  });
});
