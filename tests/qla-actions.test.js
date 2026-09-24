import { describe, it, expect } from 'vitest';
import {
  generateQlaActions,
  formatActionsAsEmailText,
  selectTopPriorities,
  DEFAULT_QLA_ACTION_THRESHOLDS
} from '../src/qlaActions.js';

describe('QLA Actions Pure Module Tests (Invented Data)', () => {
  // Helper to generate invented students
  const makeStudents = (count, className, markVal, maxMarks, options = {}) => {
    return Array.from({ length: count }, (_, i) => ({
      name: `Student_${className}_${i + 1}`,
      surname: `Student_${className}`,
      firstName: `${i + 1}`,
      activeClass: className,
      className,
      status: options.status || 'present',
      total: options.total !== undefined ? options.total : markVal,
      marks: { q1: markVal, q2: options.markQ2 !== undefined ? options.markQ2 : markVal },
      sen: options.sen || 'No SEN',
      disadvantaged: options.disadvantaged || 'No',
      snapshotMatched: options.snapshotMatched || false,
      result: options.result !== undefined ? options.result : null,
      displayResult: options.displayResult !== undefined ? options.displayResult : ''
    }));
  };

  it('1. Rule 1: Weakest question in each paper and tier triggers, and does not trigger on paper with no questions', () => {
    const paperListeningF = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      questions: [
        { key: 'q1', label: 'Q1 Free time', topic: 'Free time', maxMarks: 10 },
        { key: 'q2', label: 'Q2 School', topic: 'School', maxMarks: 10 }
      ],
      // 10 students: Q1 average mark = 3/10 (30% facility), Q2 average mark = 8/10 (80% facility)
      students: Array.from({ length: 10 }, (_, i) => ({
        name: `Student_${i}`,
        activeClass: '10SP1',
        status: 'present',
        total: 11,
        marks: { q1: 3, q2: 8 }
      }))
    };

    const res = generateQlaActions([paperListeningF]);
    const r1 = res.actions.filter(a => a.ruleNumber === 1);

    expect(r1).toHaveLength(1);
    expect(r1[0].title).toBe('Reteach and retest Free time (Q1 Free time) in Listening F.');
    expect(r1[0].category).toBe('Whole department');
    expect(r1[0].studentsAffected).toBe(10); // All 10 scored 3 (< 5 marks)

    // Paper with no questions does not trigger Rule 1
    const emptyPaper = {
      sheetName: 'Empty F',
      paper: 'Empty',
      tier: 'Foundation',
      totalMax: 20,
      questions: [],
      students: []
    };
    const emptyRes = generateQlaActions([emptyPaper]);
    expect(emptyRes.actions.filter(a => a.ruleNumber === 1)).toHaveLength(0);
  });

  it('2. Rule 2: Class 10+ points below cohort on a question triggers, but does not trigger when gap is under 10 or class < 5 students', () => {
    // 10SP1: 5 students with mark 2 on q1 (facility 20%)
    // 10SP2: 5 students with mark 8 on q1 (facility 80%)
    // Cohort facility on q1 = (10 + 40) / 100 = 50%
    // 10SP1 gap vs cohort = 50 - 20 = 30 pts (>= 10 pts below cohort)
    const paperReadingH = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 10,
      questions: [
        { key: 'q1', label: 'Q1', topic: 'Technology', maxMarks: 10 }
      ],
      students: [
        ...makeStudents(5, '10SP1', 2, 10),
        ...makeStudents(5, '10SP2', 8, 10)
      ]
    };

    const res = generateQlaActions([paperReadingH], { thresholds: { classGap: 10 } });
    const r2 = res.actions.filter(a => a.ruleNumber === 2);

    expect(r2).toHaveLength(1);
    expect(r2[0].title).toBe('10SP1 is 30.0 points below the cohort on Q1, Reading H. Share the approach from 10SP2.');
    expect(r2[0].category).toBe('Class level');
    expect(r2[0].className).toBe('10SP1');
    expect(r2[0].studentsAffected).toBe(5);

    // Boundary check: If gap is 9.0 pts (< 10 pts), does NOT trigger
    // Cohort = 50%, 10SP1 facility = 41% -> gap = 9 pts
    const paperBoundary = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 100,
      questions: [
        { key: 'q1', label: 'Q1', topic: 'Technology', maxMarks: 100 }
      ],
      students: [
        ...makeStudents(5, '10SP1', 41, 100),
        ...makeStudents(5, '10SP2', 59, 100)
      ]
    };
    const resBoundary = generateQlaActions([paperBoundary], { thresholds: { classGap: 10 } });
    expect(resBoundary.actions.filter(a => a.ruleNumber === 2)).toHaveLength(0);

    // Size check: If 10SP1 has only 4 students (< 5), does NOT trigger
    const paperSmallClass = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 10,
      questions: [
        { key: 'q1', label: 'Q1', topic: 'Technology', maxMarks: 10 }
      ],
      students: [
        ...makeStudents(4, '10SP1', 2, 10), // Only 4 students!
        ...makeStudents(6, '10SP2', 8, 10)
      ]
    };
    const resSmall = generateQlaActions([paperSmallClass], { thresholds: { classGap: 10 } });
    expect(resSmall.actions.filter(a => a.ruleNumber === 2)).toHaveLength(0);
  });

  it('3. Rule 3: Weakest paper in each tier triggers per tier', () => {
    const paperListeningF = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      students: makeStudents(6, '10SP1', 14, 20, { total: 14 }) // 70%
    };
    const paperWritingF = {
      sheetName: 'Writing F',
      paper: 'Writing',
      tier: 'Foundation',
      totalMax: 20,
      students: makeStudents(6, '10SP1', 8, 20, { total: 8 }) // 40% -> Weakest in Foundation
    };
    const paperReadingH = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 20,
      students: makeStudents(6, '10SP2', 12, 20, { total: 12 }) // 60% -> Weakest in Higher
    };

    const res = generateQlaActions([paperListeningF, paperWritingF, paperReadingH]);
    const r3 = res.actions.filter(a => a.ruleNumber === 3);

    expect(r3).toHaveLength(2); // One for Foundation, one for Higher
    const fAction = r3.find(a => a.tier === 'Foundation');
    const hAction = r3.find(a => a.tier === 'Higher');

    expect(fAction.title).toBe('Department focus for Foundation next cycle: Writing F.');
    expect(fAction.category).toBe('Whole department');
    expect(hAction.title).toBe('Department focus for Higher next cycle: Reading H.');
    expect(hAction.category).toBe('Whole department');
  });

  it('4. Rule 4: Class whose weakest paper in a tier differs from department weakest triggers, but does not trigger when same or class < 5', () => {
    // Dept papers in Foundation:
    // Listening F: 10SP1 (6 students, 80%), 10SP2 (6 students, 60%) -> cohort 70%
    // Reading F:   10SP1 (6 students, 40%), 10SP2 (6 students, 80%) -> cohort 60%
    // Writing F:   10SP1 (6 students, 70%), 10SP2 (6 students, 30%) -> cohort 50% -> Dept weakest is Writing F!
    //
    // For 10SP1:
    // Listening F: 80%
    // Reading F: 40% -> 10SP1's weakest is Reading F (differs from Writing F!)
    // Writing F: 70%
    //
    // For 10SP2:
    // Listening F: 60%
    // Reading F: 80%
    // Writing F: 30% -> 10SP2's weakest is Writing F (matches department, should NOT trigger Rule 4)
    const paperListeningF = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        ...makeStudents(6, '10SP1', 16, 20, { total: 16 }),
        ...makeStudents(6, '10SP2', 12, 20, { total: 12 })
      ]
    };
    const paperReadingF = {
      sheetName: 'Reading F',
      paper: 'Reading',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        ...makeStudents(6, '10SP1', 8, 20, { total: 8 }),
        ...makeStudents(6, '10SP2', 16, 20, { total: 16 })
      ]
    };
    const paperWritingF = {
      sheetName: 'Writing F',
      paper: 'Writing',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        ...makeStudents(6, '10SP1', 14, 20, { total: 14 }),
        ...makeStudents(6, '10SP2', 6, 20, { total: 6 })
      ]
    };

    const res = generateQlaActions([paperListeningF, paperReadingF, paperWritingF]);
    const r4 = res.actions.filter(a => a.ruleNumber === 4);

    expect(r4).toHaveLength(1);
    expect(r4[0].title).toBe('10SP1 needs a different focus in Foundation: Reading F.');
    expect(r4[0].className).toBe('10SP1');
    expect(r4[0].category).toBe('Class level');

    // 10SP2 did not trigger because its weakest matches the department weakest
    expect(r4.some(a => a.className === '10SP2')).toBe(false);
  });

  it('5. Rule 5: Grade 4 students grouped by weakest paper per tier triggers, does not trigger with 0 grade 4s', () => {
    const paperListeningF = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        {
          name: 'Student_A',
          surname: 'Student_A',
          firstName: '',
          activeClass: '10SP1',
          status: 'present',
          snapshotMatched: true,
          result: 4,
          displayResult: '4',
          total: 16 // 80%
        },
        {
          name: 'Student_B',
          surname: 'Student_B',
          firstName: '',
          activeClass: '10SP1',
          status: 'present',
          snapshotMatched: true,
          result: 4,
          displayResult: '4',
          total: 14 // 70%
        }
      ]
    };

    const paperWritingF = {
      sheetName: 'Writing F',
      paper: 'Writing',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        {
          name: 'Student_A',
          surname: 'Student_A',
          firstName: '',
          activeClass: '10SP1',
          status: 'present',
          snapshotMatched: true,
          result: 4,
          displayResult: '4',
          total: 8 // 40% -> weakest is Writing F
        },
        {
          name: 'Student_B',
          surname: 'Student_B',
          firstName: '',
          activeClass: '10SP1',
          status: 'present',
          snapshotMatched: true,
          result: 4,
          displayResult: '4',
          total: 6 // 30% -> weakest is Writing F
        }
      ]
    };

    const res = generateQlaActions([paperListeningF, paperWritingF]);
    const r5 = res.actions.filter(a => a.ruleNumber === 5);

    expect(r5).toHaveLength(1);
    expect(r5[0].title).toBe('Targeted intervention: 2 grade 4s whose weakest paper is Writing F.');
    expect(r5[0].category).toBe('Students');
    expect(r5[0].studentsAffected).toBe(2);

    // If result is 5 (not 4), Rule 5 does NOT trigger
    paperListeningF.students.forEach(s => { s.result = 5; s.displayResult = '5'; });
    paperWritingF.students.forEach(s => { s.result = 5; s.displayResult = '5'; });
    const resNo4 = generateQlaActions([paperListeningF, paperWritingF]);
    expect(resNo4.actions.filter(a => a.ruleNumber === 5)).toHaveLength(0);
  });

  it('6. Rule 6: Zero rate of 30% or more triggers, but does not trigger when zero rate < 30%', () => {
    // 10 students: 3 score 0 (30.0% zero rate >= 30%)
    const paperReadingH = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 10,
      questions: [
        { key: 'q1', label: 'Q5', topic: 'Holidays', maxMarks: 10 }
      ],
      students: [
        ...Array.from({ length: 3 }, (_, i) => ({
          name: `Zero_${i}`,
          activeClass: '10SP1',
          status: 'present',
          total: 0,
          marks: { q1: 0 }
        })),
        ...Array.from({ length: 7 }, (_, i) => ({
          name: `Scored_${i}`,
          activeClass: '10SP1',
          status: 'present',
          total: 5,
          marks: { q1: 5 }
        }))
      ]
    };

    const res = generateQlaActions([paperReadingH], { thresholds: { zeroRate: 30 } });
    const r6 = res.actions.filter(a => a.ruleNumber === 6);

    expect(r6).toHaveLength(1);
    expect(r6[0].title).toBe('Check whether students are attempting Q5, Reading H. Model exam timing.');
    expect(r6[0].category).toBe('Whole department');
    expect(r6[0].studentsAffected).toBe(3);

    // Boundary check: 2 score 0 out of 10 = 20% (< 30%), does NOT trigger
    paperReadingH.students[2].marks.q1 = 2;
    const resUnder = generateQlaActions([paperReadingH], { thresholds: { zeroRate: 30 } });
    expect(resUnder.actions.filter(a => a.ruleNumber === 6)).toHaveLength(0);
  });

  it('7. Rule 7: Discrimination below 0 triggers when paper has >= 9 students, does not trigger when >= 0 or < 9 students', () => {
    // 9 students (min required for discrimination calculation)
    // Sorted by paper total:
    // Top 3 students (totals 10): score 0 on q1 (facility 0%)
    // Bottom 3 students (totals 2): score 2 on q1 (facility 100%)
    // Middle 3 students (totals 5): score 1 on q1
    // Discrimination = 0% - 100% = -100 pts (< 0)
    const paperDisc = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 10,
      questions: [
        { key: 'q1', label: 'Q3', topic: 'School', maxMarks: 2 }
      ],
      students: [
        ...Array.from({ length: 3 }, (_, i) => ({
          name: `Top_${i}`,
          activeClass: '10SP1',
          status: 'present',
          total: 10,
          marks: { q1: 0 }
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          name: `Mid_${i}`,
          activeClass: '10SP1',
          status: 'present',
          total: 5,
          marks: { q1: 1 }
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          name: `Bot_${i}`,
          activeClass: '10SP1',
          status: 'present',
          total: 2,
          marks: { q1: 2 }
        }))
      ]
    };

    const res = generateQlaActions([paperDisc]);
    const r7 = res.actions.filter(a => a.ruleNumber === 7);

    expect(r7).toHaveLength(1);
    expect(r7[0].title).toBe('Review the mark scheme or moderation for Q3, Listening F.');
    expect(r7[0].category).toBe('Whole department');

    // Positive discrimination check (top scores 2, bottom scores 0): does NOT trigger
    paperDisc.students[0].marks.q1 = 2;
    paperDisc.students[1].marks.q1 = 2;
    paperDisc.students[2].marks.q1 = 2;
    paperDisc.students[6].marks.q1 = 0;
    paperDisc.students[7].marks.q1 = 0;
    paperDisc.students[8].marks.q1 = 0;
    const resPos = generateQlaActions([paperDisc]);
    expect(resPos.actions.filter(a => a.ruleNumber === 7)).toHaveLength(0);

    // Size check: Fewer than 9 students (e.g. 8 students) -> discrimination is null, does NOT trigger
    const paperSmall = {
      ...paperDisc,
      students: paperDisc.students.slice(0, 8)
    };
    const resSmall = generateQlaActions([paperSmall]);
    expect(resSmall.actions.filter(a => a.ruleNumber === 7)).toHaveLength(0);
  });

  it('8. Rule 8: Dictation or translation question with facility below weak threshold triggers, does not trigger at/above threshold', () => {
    // 10 students on Dictation question, average mark = 3/10 (facility 30% < 40%)
    const paperDictation = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 10,
      questions: [
        { key: 'q1', label: 'Q13 Dictation', section: 'Section B', maxMarks: 10 }
      ],
      students: makeStudents(10, '10SP1', 3, 10)
    };

    const res = generateQlaActions([paperDictation], { thresholds: { weakFacility: 40 } });
    const r8 = res.actions.filter(a => a.ruleNumber === 8);

    expect(r8).toHaveLength(1);
    expect(r8[0].title).toBe('Build weekly dictation practice into lessons for Foundation.');
    expect(r8[0].category).toBe('Whole department');

    // Translation question on Higher tier
    const paperTranslation = {
      sheetName: 'Writing H',
      paper: 'Writing',
      tier: 'Higher',
      totalMax: 10,
      questions: [
        { key: 'q1', label: 'Q5 Translation', section: 'Section B', maxMarks: 10 }
      ],
      students: makeStudents(10, '10SP1', 3, 10)
    };
    const resTrans = generateQlaActions([paperTranslation], { thresholds: { weakFacility: 40 } });
    const r8Trans = resTrans.actions.filter(a => a.ruleNumber === 8);
    expect(r8Trans).toHaveLength(1);
    expect(r8Trans[0].title).toBe('Build weekly translation practice into lessons for Higher.');

    // Boundary check: Facility at 40% or above does NOT trigger
    const paperHighFac = {
      ...paperDictation,
      students: makeStudents(10, '10SP1', 4, 10) // 40% facility
    };
    const resHigh = generateQlaActions([paperHighFac], { thresholds: { weakFacility: 40 } });
    expect(resHigh.actions.filter(a => a.ruleNumber === 8)).toHaveLength(0);
  });

  it('9. Rule 9: SEN Support or Disadvantaged gap of 10+ points triggers, does not trigger when gap < 10 or group < 5 students', () => {
    // 5 SEN Support students with total 6/20 (30%)
    // 5 No SEN students with total 12/20 (60%)
    // Gap = 30 - 60 = -30 points (Math.abs(gap) = 30 >= 10)
    const paperGap = {
      sheetName: 'Reading F',
      paper: 'Reading',
      tier: 'Foundation',
      totalMax: 20,
      questions: [
        { key: 'q1', label: 'Q1', maxMarks: 20 }
      ],
      students: [
        ...makeStudents(5, '10SP1', 6, 20, { total: 6, sen: 'SEN Support' }),
        ...makeStudents(5, '10SP1', 12, 20, { total: 12, sen: 'No SEN' })
      ]
    };

    const res = generateQlaActions([paperGap], { thresholds: { demoGap: 10 }, isClassListsLoaded: true });
    const r9 = res.actions.filter(a => a.ruleNumber === 9);

    expect(r9).toHaveLength(1);
    expect(r9[0].title).toBe('Gap of 30.0 points for SEN Support on Reading F. Review scaffolds and access arrangements.');
    expect(r9[0].category).toBe('Students');
    expect(r9[0].studentsAffected).toBe(5);

    // Boundary check: Gap of 8.0 points (< 10 pts) does NOT trigger
    const paperSmallGap = {
      sheetName: 'Reading F',
      paper: 'Reading',
      tier: 'Foundation',
      totalMax: 100,
      questions: [{ key: 'q1', label: 'Q1', maxMarks: 100 }],
      students: [
        ...makeStudents(5, '10SP1', 42, 100, { total: 42, sen: 'SEN Support' }),
        ...makeStudents(5, '10SP1', 50, 100, { total: 50, sen: 'No SEN' })
      ]
    };
    const resSmallGap = generateQlaActions([paperSmallGap], { thresholds: { demoGap: 10 } });
    expect(resSmallGap.actions.filter(a => a.ruleNumber === 9)).toHaveLength(0);

    // Size check: Fewer than 5 students in SEN group (e.g. 4 students) does NOT trigger
    const paperSmallGroup = {
      sheetName: 'Reading F',
      paper: 'Reading',
      tier: 'Foundation',
      totalMax: 20,
      questions: [{ key: 'q1', label: 'Q1', maxMarks: 20 }],
      students: [
        ...makeStudents(4, '10SP1', 6, 20, { total: 6, sen: 'SEN Support' }), // 4 students
        ...makeStudents(6, '10SP1', 12, 20, { total: 12, sen: 'No SEN' })
      ]
    };
    const resSmallGroup = generateQlaActions([paperSmallGroup], { thresholds: { demoGap: 10 } });
    expect(resSmallGroup.actions.filter(a => a.ruleNumber === 9)).toHaveLength(0);
  });

  it('10. Rule 10: More than 10% absent from a paper triggers, does not trigger at 10% or below', () => {
    // 10 students enrolled: 2 absent (20% > 10%)
    const paperAbsent = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        ...makeStudents(2, '10SP1', 0, 20, { status: 'absent' }),
        ...makeStudents(8, '10SP1', 10, 20, { status: 'present' })
      ]
    };

    const res = generateQlaActions([paperAbsent], { thresholds: { absenceRate: 10 } });
    const r10 = res.actions.filter(a => a.ruleNumber === 10);

    expect(r10).toHaveLength(1);
    expect(r10[0].title).toBe('Catch up sitting needed for Listening F: 2 students.');
    expect(r10[0].category).toBe('Whole department');
    expect(r10[0].studentsAffected).toBe(2);

    // Boundary check: Exactly 10% absent (1 absent out of 10 = 10.0%, not > 10%) does NOT trigger
    const paperTenPct = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        ...makeStudents(1, '10SP1', 0, 20, { status: 'absent' }),
        ...makeStudents(9, '10SP1', 10, 20, { status: 'present' })
      ]
    };
    const resTen = generateQlaActions([paperTenPct], { thresholds: { absenceRate: 10 } });
    expect(resTen.actions.filter(a => a.ruleNumber === 10)).toHaveLength(0);
  });

  it('11. No action ever compares a Foundation paper with a Higher paper', () => {
    // Mixed tier dataset
    const paperListeningF = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      questions: [{ key: 'q1', label: 'Q1', maxMarks: 20 }],
      students: makeStudents(6, '10SP1', 12, 20, { total: 12 })
    };
    const paperReadingH = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 20,
      questions: [{ key: 'q1', label: 'Q1', maxMarks: 20 }],
      students: makeStudents(6, '10SP1', 8, 20, { total: 8 })
    };

    const res = generateQlaActions([paperListeningF, paperReadingH]);

    for (const a of res.actions) {
      if (a.tier === 'Foundation') {
        expect(a.title).not.toContain('Higher');
        expect(a.title).not.toContain('Reading H');
      }
      if (a.tier === 'Higher') {
        expect(a.title).not.toContain('Foundation');
        expect(a.title).not.toContain('Listening F');
      }
    }
  });

  it('12. Actions are ordered by studentsAffected descending and categorized under 3 headings', () => {
    const paperListeningF = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      questions: [
        { key: 'q1', label: 'Q1', maxMarks: 10 },
        { key: 'q2', label: 'Q2', maxMarks: 10 }
      ],
      students: [
        ...makeStudents(12, '10SP1', 3, 10, { total: 6, status: 'present' }),
        ...makeStudents(4, '10SP1', 0, 10, { status: 'absent' }) // 4 absent out of 16 = 25% > 10%
      ]
    };

    const res = generateQlaActions([paperListeningF]);

    expect(Object.keys(res.byCategory)).toEqual(['Whole department', 'Class level', 'Students']);

    for (let i = 0; i < res.actions.length - 1; i++) {
      expect(res.actions[i].studentsAffected).toBeGreaterThanOrEqual(res.actions[i + 1].studentsAffected);
    }
  });

  it('13. Email text format contains no full names when hide names is on', () => {
    const sampleActions = [
      {
        id: '1',
        category: 'Whole department',
        title: 'Reteach and retest Free time (Q1) in Listening F.',
        studentsAffected: 12
      },
      {
        id: '2',
        category: 'Class level',
        title: '10SP1 is 14.5 points below the cohort on Q3, Reading H. Share the approach from 10SP2.',
        studentsAffected: 8
      },
      {
        id: '3',
        category: 'Students',
        title: 'Targeted intervention: 4 grade 4s whose weakest paper is Writing F.',
        studentsAffected: 4
      }
    ];

    const emailText = formatActionsAsEmailText(sampleActions, {
      dateStr: '24 September 2026',
      schoolName: 'Dixons Unity Academy',
      isNameHidden: true
    });

    expect(emailText).toContain('QLA Targeted Actions - Dixons Unity Academy');
    expect(emailText).toContain('Generated: 24 September 2026');
    expect(emailText).toContain('WHOLE DEPARTMENT');
    expect(emailText).toContain('CLASS LEVEL');
    expect(emailText).toContain('STUDENTS');
    expect(emailText).toContain('• Reteach and retest Free time (Q1) in Listening F. (12 students affected)');

    // Ensure no personal pupil names appear
    expect(emailText).not.toMatch(/Rivera|Patel|Smith|Carlos|Priya/i);
  });

  it('14. Every generated action across all rules contains a why property starting with "Why: "', () => {
    // Dataset designed to trigger multiple rules
    const paperF = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 30,
      questions: [
        { key: 'q1', label: 'Q1 Free time', topic: 'Free time', maxMarks: 10 },
        { key: 'q2', label: 'Q2 School', topic: 'School', maxMarks: 10 },
        { key: 'q3', label: 'Q3 Writing', topic: 'Writing', maxMarks: 10 }
      ],
      students: [
        ...makeStudents(6, '10SP1', 2, 10, { total: 6, sen: 'SEN Support', status: 'present' }),
        ...makeStudents(6, '10SP2', 8, 10, { total: 24, sen: 'No SEN', status: 'present' }),
        ...makeStudents(3, '10SP1', 0, 10, { status: 'absent' }) // 3 absent out of 15 = 20% > 10%
      ]
    };

    const res = generateQlaActions([paperF], {
      thresholds: {
        weakFacility: 40,
        classGap: 10,
        zeroRate: 20,
        demoGap: 10,
        absenceRate: 10
      },
      isClassListsLoaded: true
    });

    expect(res.actions.length).toBeGreaterThan(0);
    for (const action of res.actions) {
      expect(action).toHaveProperty('why');
      expect(typeof action.why).toBe('string');
      expect(action.why.startsWith('Why: ')).toBe(true);
      expect(action.why.length).toBeGreaterThan(7);
    }
  });

  it('15. selectTopPriorities enforces variety (max 2 per rule), department guarantee, and custom limit', () => {
    // 10 candidate actions
    const candidateActions = [
      // Rule 2: 4 actions with large student counts
      { id: 'act-r2-1', ruleNumber: 2, category: 'Class level', title: 'R2-1', studentsAffected: 50 },
      { id: 'act-r2-2', ruleNumber: 2, category: 'Class level', title: 'R2-2', studentsAffected: 45 },
      { id: 'act-r2-3', ruleNumber: 2, category: 'Class level', title: 'R2-3', studentsAffected: 40 },
      { id: 'act-r2-4', ruleNumber: 2, category: 'Class level', title: 'R2-4', studentsAffected: 35 },
      // Rule 4: 2 actions
      { id: 'act-r4-1', ruleNumber: 4, category: 'Students', title: 'R4-1', studentsAffected: 25 },
      { id: 'act-r4-2', ruleNumber: 4, category: 'Students', title: 'R4-2', studentsAffected: 20 },
      // Rule 1: Whole department action with moderate count
      { id: 'act-r1-1', ruleNumber: 1, category: 'Whole department', title: 'R1-1', studentsAffected: 15 },
      // Rule 10: Whole department action with small count
      { id: 'act-r10-1', ruleNumber: 10, category: 'Whole department', title: 'R10-1', studentsAffected: 5 }
    ];

    // Default limit = 5
    const top5 = selectTopPriorities(candidateActions, 5);
    expect(top5).toHaveLength(5);

    // 1. Must include at least 1 Whole department action (act-r1-1)
    const hasDept = top5.some(a => a.category === 'Whole department');
    expect(hasDept).toBe(true);

    // 2. Max 2 from the same rule: Rule 2 had 4 candidates, but at most 2 can be selected
    const r2Selected = top5.filter(a => a.ruleNumber === 2);
    expect(r2Selected.length).toBeLessThanOrEqual(2);

    // 3. Must be ordered descending by studentsAffected
    for (let i = 0; i < top5.length - 1; i++) {
      expect(top5[i].studentsAffected).toBeGreaterThanOrEqual(top5[i + 1].studentsAffected);
    }

    // 4. Custom limit = 3
    const top3 = selectTopPriorities(candidateActions, 3);
    expect(top3).toHaveLength(3);
    expect(top3.some(a => a.category === 'Whole department')).toBe(true);

    // 5. Handles fewer items than limit (e.g. only 2 actions exist, requested limit 5)
    const fewActions = [
      { id: 'f1', ruleNumber: 1, category: 'Whole department', title: 'F1', studentsAffected: 10 },
      { id: 'f2', ruleNumber: 3, category: 'Whole department', title: 'F2', studentsAffected: 8 }
    ];
    const topFew = selectTopPriorities(fewActions, 5);
    expect(topFew).toHaveLength(2);

    // 6. Handles empty list or 0 limit
    expect(selectTopPriorities([], 5)).toEqual([]);
    expect(selectTopPriorities(null, 5)).toEqual([]);
    expect(selectTopPriorities(candidateActions, 0)).toEqual([]);
  });

  it('16. formatActionsAsEmailText formats Top Priorities first, then Full List by Category, preserving privacy', () => {
    const mockActionData = {
      actions: [
        {
          id: 'dept-1',
          ruleNumber: 1,
          category: 'Whole department',
          title: 'Reteach and retest Free time (Q1) in Listening F.',
          studentsAffected: 24,
          why: 'Why: affects 24 students across 2 classes'
        },
        {
          id: 'class-1',
          ruleNumber: 2,
          category: 'Class level',
          title: '10SP1 is 18.0 points below the cohort on Q2, Listening F. Share the approach from 10SP2.',
          studentsAffected: 12,
          why: 'Why: 10SP1 scored 32.0% vs cohort 50.0%'
        },
        {
          id: 'stud-1',
          ruleNumber: 4,
          category: 'Students',
          title: 'Targeted intervention: 5 grade 4s whose weakest paper is Listening F.',
          studentsAffected: 5,
          why: 'Why: 5 students sitting on grade 4'
        }
      ],
      topPriorities: [
        {
          id: 'dept-1',
          ruleNumber: 1,
          category: 'Whole department',
          title: 'Reteach and retest Free time (Q1) in Listening F.',
          studentsAffected: 24,
          why: 'Why: affects 24 students across 2 classes'
        },
        {
          id: 'class-1',
          ruleNumber: 2,
          category: 'Class level',
          title: '10SP1 is 18.0 points below the cohort on Q2, Listening F. Share the approach from 10SP2.',
          studentsAffected: 12,
          why: 'Why: 10SP1 scored 32.0% vs cohort 50.0%'
        }
      ],
      byCategory: {
        'Whole department': [
          {
            id: 'dept-1',
            ruleNumber: 1,
            category: 'Whole department',
            title: 'Reteach and retest Free time (Q1) in Listening F.',
            studentsAffected: 24,
            why: 'Why: affects 24 students across 2 classes'
          }
        ],
        'Class level': [
          {
            id: 'class-1',
            ruleNumber: 2,
            category: 'Class level',
            title: '10SP1 is 18.0 points below the cohort on Q2, Listening F. Share the approach from 10SP2.',
            studentsAffected: 12,
            why: 'Why: 10SP1 scored 32.0% vs cohort 50.0%'
          }
        ],
        'Students': [
          {
            id: 'stud-1',
            ruleNumber: 4,
            category: 'Students',
            title: 'Targeted intervention: 5 grade 4s whose weakest paper is Listening F.',
            studentsAffected: 5,
            why: 'Why: 5 students sitting on grade 4'
          }
        ]
      },
      totalActions: 3,
      totalStudentsAffected: 41
    };

    const email = formatActionsAsEmailText(mockActionData, {
      dateStr: '24 September 2026',
      schoolName: 'Dixons Unity Academy',
      isNameHidden: true
    });

    // Check header
    expect(email).toContain('QLA Targeted Actions - Dixons Unity Academy');
    expect(email).toContain('Generated: 24 September 2026');

    // Check Top Priorities appears before Full List
    const topPrioritiesIdx = email.indexOf('TOP 2 PRIORITIES');
    const fullListIdx = email.indexOf('FULL ACTION LIST BY CATEGORY');
    expect(topPrioritiesIdx).toBeGreaterThan(-1);
    expect(fullListIdx).toBeGreaterThan(topPrioritiesIdx);

    // Check content in Top Priorities
    expect(email).toContain('1. Reteach and retest Free time (Q1) in Listening F. (24 students affected)');
    expect(email).toContain('Why: affects 24 students across 2 classes');
    expect(email).toContain('2. 10SP1 is 18.0 points below the cohort on Q2, Listening F.');

    // Check category headings in full list
    expect(email).toContain('WHOLE DEPARTMENT');
    expect(email).toContain('CLASS LEVEL');
    expect(email).toContain('STUDENTS');
    expect(email).toContain('• Targeted intervention: 5 grade 4s whose weakest paper is Listening F. (5 students affected)');

    // Ensure privacy: no student names leaked
    expect(email).not.toMatch(/Carlos|Rivera|Priya|Patel|John|Smith/i);
  });
});
