import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SUGGESTED_ACTION_THRESHOLDS,
  generateMockActions,
  generateClassBalanceActions,
  selectTopPrioritiesAcrossSources,
  generateSuggestedActions,
  formatSuggestedActionsAsEmailText
} from '../src/actions.js';

describe('Pure Suggested Actions - Mock Rules (Rules 1 to 7)', () => {
  // Mock student dataset:
  // Class 10 Sp1: 6 students.
  //   3 students 3+ grades away (points <= 2), 2 students grade 4, 1 student grade 5.
  //   Disadv: 2 students (avg 1.5), Non-disadv: 4 students (avg 3.25). Gap = 1.75 grades > 0.5!
  //   Attendance: 2 students with 85% attendance and points < 5.
  //   Progress: 4 students with progress averaging -1.25 (< -1.0).
  // Class 10 Sp2: 6 students.
  //   6 students grade 4.
  //   Disadv: 3 students (avg 4.0), Non-disadv: 3 students (avg 4.3). Gap = 0.3 <= 0.5.
  //   Progress: averaging +0.4.
  // Class 10 Sp3: Small class (3 students < 5) -> should be skipped for class rules.
  //   3 students 3+ away.
  const mockStudents = [
    // 10 Sp1 (6 students)
    { id: 1, surname: 'Smith', firstName: 'John', className: '10 Sp1', result: '1', points: 1, estimate: 5.2, progress: -1.5, sen: 'SEN Support', disadvantaged: 'Yes', attendance: '85%' },
    { id: 2, surname: 'Jones', firstName: 'Sarah', className: '10 Sp1', result: '2', points: 2, estimate: 5.5, progress: -1.5, sen: 'SEN Support', disadvantaged: 'Yes', attendance: '88%' },
    { id: 3, surname: 'Taylor', firstName: 'Alex', className: '10 Sp1', result: 'U', points: 0, estimate: 5.0, progress: -1.0, sen: 'SEN Support', disadvantaged: 'No', attendance: '92%' },
    { id: 4, surname: 'Brown', firstName: 'Emma', className: '10 Sp1', result: '4', points: 4, estimate: 4.8, progress: -0.8, sen: 'No SEN', disadvantaged: 'No', attendance: '95%' },
    { id: 5, surname: 'Wilson', firstName: 'Liam', className: '10 Sp1', result: '4', points: 4, estimate: 5.1, progress: -1.4, sen: 'SEN Support', disadvantaged: 'No', attendance: '86%' },
    { id: 6, surname: 'Davis', firstName: 'Mia', className: '10 Sp1', result: '5', points: 5, estimate: 5.0, progress: -0.2, sen: 'No SEN', disadvantaged: 'No', attendance: '97%' },

    // 10 Sp2 (6 students) - disadv: (4+4+4)/3 = 4.0; non-disadv: (4+4+4)/3 = 4.0; gap = 0.0 <= 0.5
    { id: 7, surname: 'Evans', firstName: 'Noah', className: '10 Sp2', result: '4', points: 4, estimate: 3.5, progress: 0.2, sen: 'SEN Support', disadvantaged: 'Yes', attendance: '84%' },
    { id: 8, surname: 'King', firstName: 'Olivia', className: '10 Sp2', result: '4', points: 4, estimate: 5.2, progress: 0.1, sen: 'SEN Support', disadvantaged: 'Yes', attendance: '88%' },
    { id: 9, surname: 'White', firstName: 'Peter', className: '10 Sp2', result: '4', points: 4, estimate: 4.0, progress: 0.0, sen: 'No SEN', disadvantaged: 'Yes', attendance: '95%' },
    { id: 10, surname: 'Green', firstName: 'Quinn', className: '10 Sp2', result: '4', points: 4, estimate: 4.2, progress: 0.0, sen: 'No SEN', disadvantaged: 'No', attendance: '96%' },
    { id: 11, surname: 'Hall', firstName: 'Ruby', className: '10 Sp2', result: '4', points: 4, estimate: 3.8, progress: 0.2, sen: 'No SEN', disadvantaged: 'No', attendance: '98%' },
    { id: 12, surname: 'Clark', firstName: 'Sam', className: '10 Sp2', result: '4', points: 4, estimate: 4.5, progress: 0.5, sen: 'No SEN', disadvantaged: 'No', attendance: '99%' },

    // 10 Sp3 (Small class: 3 students, skipped for class-level rules)
    { id: 13, surname: 'Lee', firstName: 'Tom', className: '10 Sp3', result: '1', points: 1, estimate: 3.0, progress: -1.0, sen: 'SEN Support', disadvantaged: 'Yes', attendance: '80%' },
    { id: 14, surname: 'Scott', firstName: 'Una', className: '10 Sp3', result: '2', points: 2, estimate: 3.0, progress: -1.0, sen: 'No SEN', disadvantaged: 'Yes', attendance: '82%' },
    { id: 15, surname: 'Adams', firstName: 'Victor', className: '10 Sp3', result: '1', points: 1, estimate: 3.0, progress: -1.0, sen: 'No SEN', disadvantaged: 'Yes', attendance: '85%' }
  ];

  it('Rule 1: Identifies class with most students 3+ grades from 5 (skipping small classes)', () => {
    const actions = generateMockActions(mockStudents);
    const rule1 = actions.find(a => a.ruleNumber === 1);

    expect(rule1).toBeDefined();
    // 10 Sp1 has 3 students 3+ away. 10 Sp3 has 3, but is skipped because < 5 students.
    expect(rule1.className).toBe('10 Sp1');
    expect(rule1.studentsAffected).toBe(3);
    expect(rule1.title).toContain('Priority support group: 10 Sp1, 3 students three or more grades from 5.');
    expect(rule1.why).toContain('Why: 10 Sp1 has 3 students three or more grades from 5, highest in cohort.');
    expect(rule1.source).toBe('Mock');
  });

  it('Rule 2: Identifies grade 4 students per class (targeted exam practice)', () => {
    const actions = generateMockActions(mockStudents);
    const rule2Actions = actions.filter(a => a.ruleNumber === 2);

    expect(rule2Actions.length).toBe(2); // 10 Sp1 (2 grade 4s), 10 Sp2 (6 grade 4s)
    const sp2 = rule2Actions.find(a => a.className === '10 Sp2');
    expect(sp2).toBeDefined();
    expect(sp2.studentsAffected).toBe(6);
    expect(sp2.title).toBe('Closest to grade 5: 6 grade 4s in 10 Sp2. Targeted exam practice.');
  });

  it('Rule 3: Identifies underperforming students against prior attainment (estimate 5+, result < 5)', () => {
    const actions = generateMockActions(mockStudents);
    const rule3 = actions.find(a => a.ruleNumber === 3);

    expect(rule3).toBeDefined();
    // Students with est >= 5.0 and points < 5:
    // John (5.2, 1), Sarah (5.5, 2), Alex (5.0, 0), Liam (5.1, 4), Olivia (5.2, 4) = 5 students!
    expect(rule3.studentsAffected).toBe(5);
    expect(rule3.title).toBe('Underperforming against prior attainment: 5 students.');
    expect(rule3.why).toContain('Why: 5 students with prior attainment estimate of grade 5+ scored below grade 5.');
  });

  it('Rule 4: Detects disadvantaged attainment gap exceeding threshold (default 0.5 grades)', () => {
    const actions = generateMockActions(mockStudents);
    const rule4Actions = actions.filter(a => a.ruleNumber === 4);

    expect(rule4Actions.length).toBe(1);
    expect(rule4Actions[0].className).toBe('10 Sp1');
    expect(rule4Actions[0].studentsAffected).toBe(2); // 2 disadv sat students in 10 Sp1
    expect(rule4Actions[0].title).toBe('Disadvantaged gap of 1.8 grades in 10 Sp1.');
    expect(rule4Actions[0].why).toContain('Why: non-disadvantaged students averaged 3.3 vs 1.5 for disadvantaged students.');
  });

  it('Rule 5: Skips SEN Support groups below 5 and detects groups of 5', () => {
    const actions = generateMockActions(mockStudents);
    const rule5 = actions.find(a => a.ruleNumber === 5);

    // SEN Support with points <= 2:
    // John (1), Sarah (2), Alex (0), Tom (1) = 4 students; Noah has grade 4.
    expect(rule5).toBeUndefined();

    const fiveStudents = [...mockStudents, {
      id: 16, surname: 'Example', firstName: 'Pat', className: '10 Sp2',
      result: '2', points: 2, sen: 'SEN Support'
    }];
    const rule5WithFive = generateMockActions(fiveStudents).find(a => a.ruleNumber === 5);
    expect(rule5WithFive.studentsAffected).toBe(5);
    expect(rule5WithFive.title).toBe('Check support plans with the SENCo: 5 students.');
  });

  it('Rule 6: Identifies low attendance (< 90%) with points < 5', () => {
    const actions = generateMockActions(mockStudents);
    const rule6 = actions.find(a => a.ruleNumber === 6);

    expect(rule6).toBeDefined();
    // Attendance < 90% and points < 5:
    // John (85%, 1), Sarah (88%, 2), Liam (86%, 4), Noah (84%, 2), Olivia (88%, 4), Tom (80%, 1), Una (82%, 2), Victor (85%, 1) = 8 students!
    expect(rule6.studentsAffected).toBe(8);
    expect(rule6.title).toBe('Attendance and attainment concern: 8 students.');
    expect(rule6.why).toContain('Why: 8 students have attendance below 90% and scored below grade 5.');
  });

  it('Rule 7: Identifies classes with average progress score below threshold (default -1.0)', () => {
    const actions = generateMockActions(mockStudents);
    const rule7Actions = actions.filter(a => a.ruleNumber === 7);

    expect(rule7Actions.length).toBe(1);
    expect(rule7Actions[0].className).toBe('10 Sp1');
    expect(rule7Actions[0].title).toBe('Review curriculum coverage and exam preparation in 10 Sp1.');
    expect(rule7Actions[0].why).toContain('Why: 10 Sp1 average progress is -1.07, below the -1.0 threshold.');
  });
});

describe('Pure Suggested Actions - Class Balance & QLA Integration', () => {
  const mockAllRecords = [
    { surname: 'Al-Mansoor', firstName: 'Tariq', className: '10 Sp1', result: '6', points: 6, isNotSat: false, sen: 'No SEN', disadvantaged: 'No', eal: 'No' },
    { surname: 'Khan', firstName: 'Aisha', className: '10 Sp1', result: '5', points: 5, isNotSat: false, sen: 'No SEN', disadvantaged: 'No', eal: 'No' }
  ];

  const mockClassListsData = {
    matchedPairs: [
      { snapshotRecord: mockAllRecords[0], newClassRecord: { surname: 'Al-Mansoor', firstName: 'Tariq', newClassName: '11 Sp1' } }
    ],
    inSnapshotNotInNewClass: [],
    inNewClassesNoMockResult: [
      { surname: 'Newbie', firstName: 'Alex', newClassName: '11 Sp2', isNotSat: true, points: null },
      { surname: 'Transfer', firstName: 'Sam', newClassName: '11 Sp3', isNotSat: true, points: null }
    ],
    allNewClassStudents: []
  };

  it('Rule 9: Generates Baseline assessment needed for students in new classes with no mock result', () => {
    const balanceActions = generateClassBalanceActions(mockAllRecords, mockClassListsData);
    const rule9 = balanceActions.find(a => a.ruleNumber === 9);

    expect(rule9).toBeDefined();
    expect(rule9.source).toBe('Class balance');
    expect(rule9.studentsAffected).toBe(2);
    expect(rule9.title).toBe('Baseline assessment needed: 2 students in 11 Sp2, 11 Sp3.');
    expect(rule9.why).toContain('Why: 2 students in new classes have no Year 10 mock result on record.');
  });

  it('selectTopPrioritiesAcrossSources ensures multi-source representation and limits max 2 per rule', () => {
    const candidateActions = [
      { id: 'm1', source: 'Mock', ruleNumber: 1, ruleKey: 'Mock_1', studentsAffected: 25, title: 'Mock 1' },
      { id: 'm2_a', source: 'Mock', ruleNumber: 2, ruleKey: 'Mock_2', studentsAffected: 20, title: 'Mock 2A' },
      { id: 'm2_b', source: 'Mock', ruleNumber: 2, ruleKey: 'Mock_2', studentsAffected: 18, title: 'Mock 2B' },
      { id: 'm2_c', source: 'Mock', ruleNumber: 2, ruleKey: 'Mock_2', studentsAffected: 15, title: 'Mock 2C' }, // Should be skipped (max 2 for Mock_2)
      { id: 'b8', source: 'Class balance', ruleNumber: 8, ruleKey: 'Balance_8', studentsAffected: 8, title: 'Balance 8' },
      { id: 'q1', source: 'QLA', ruleNumber: 1, ruleKey: 'QLA_1', studentsAffected: 12, title: 'QLA 1' }
    ];

    const top5 = selectTopPrioritiesAcrossSources(candidateActions, 5, ['Mock', 'Class balance', 'QLA']);

    expect(top5.length).toBe(5);
    // Guarantees at least 1 from each source with actions
    expect(top5.some(a => a.source === 'Mock')).toBe(true);
    expect(top5.some(a => a.source === 'Class balance')).toBe(true);
    expect(top5.some(a => a.source === 'QLA')).toBe(true);

    // Max 2 from rule Mock_2
    const mock2Count = top5.filter(a => a.ruleKey === 'Mock_2').length;
    expect(mock2Count).toBeLessThanOrEqual(2);

    // Top priorities are sorted by studentsAffected descending
    for (let i = 0; i < top5.length - 1; i++) {
      expect(top5[i].studentsAffected).toBeGreaterThanOrEqual(top5[i + 1].studentsAffected);
    }
  });

  it('formatSuggestedActionsAsEmailText produces clean plain-text output with top priorities and source groups', () => {
    const mockActionsData = {
      actions: [
        { id: 'm1', source: 'Mock', title: 'Priority support group: 10 Sp1', why: 'Why: 5 students 3+ away.', studentsAffected: 5 },
        { id: 'b9', source: 'Class balance', title: 'Baseline assessment needed: 2 students', why: 'Why: No mock result.', studentsAffected: 2 }
      ],
      topPriorities: [
        { id: 'm1', source: 'Mock', title: 'Priority support group: 10 Sp1', why: 'Why: 5 students 3+ away.', studentsAffected: 5 },
        { id: 'b9', source: 'Class balance', title: 'Baseline assessment needed: 2 students', why: 'Why: No mock result.', studentsAffected: 2 }
      ],
      bySource: {
        'Mock': [{ id: 'm1', source: 'Mock', title: 'Priority support group: 10 Sp1', why: 'Why: 5 students 3+ away.', studentsAffected: 5 }],
        'Class balance': [{ id: 'b9', source: 'Class balance', title: 'Baseline assessment needed: 2 students', why: 'Why: No mock result.', studentsAffected: 2 }],
        'QLA': []
      }
    };

    const text = formatSuggestedActionsAsEmailText(mockActionsData, {
      schoolName: 'Dixons Unity Academy',
      dateStr: '24 September 2026'
    });

    expect(text).toContain('Suggested Actions Report - Dixons Unity Academy');
    expect(text).toContain('TOP 2 PRIORITIES');
    expect(text).toContain('1. [MOCK] Priority support group: 10 Sp1 (5 students affected)');
    expect(text).toContain('2. [CLASS BALANCE] Baseline assessment needed: 2 students (2 students affected)');
    expect(text).toContain('FULL ACTION LIST BY SOURCE');
    expect(text).toContain('MOCK ASSESSMENT ACTIONS (1)');
    expect(text).toContain('CLASS BALANCE ACTIONS (1)');
  });
});
