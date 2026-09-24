import { describe, it, expect } from 'vitest';
import {
  filterQlaStudents,
  calculatePaperStats,
  calculateMedian,
  calculateCohortTierHighlights,
  calculateClassPaperMatrix,
  calculateClassPaperHighlights,
  calculateSectionAverages,
  extractAosFromLabel,
  calculateQuestionStats,
  calculateBestAndWorstQuestions,
  calculateQuestionHeatmap,
  calculateTopicAndAOSummaries,
  getDictationAndTranslationQuestions,
  calculateClassReport,
  pickStrongestWeakestWithinTier,
  calculateStudentSkillProfiles,
  filterStudentProfiles,
  calculateGrade4sByWeakestPaper,
  calculateFarthestFrom5ByWeakestPaper,
  calculateWeakQuestionsAnalysis,
  calculateDemographicGroupGaps,
  calculateMissedPapersList,
  calculateStudentsReport
} from '../src/qlaStats.js';
import { processQlaWorkbookData } from '../src/qlaService.js';
import { buildNameKey } from '../src/parser.js';

describe('QLA Papers and Skills Pure Stats Tests (Invented Data)', () => {
  // Invented Paper: Listening Foundation with 6 students (5 present, 1 absent)
  // totalMax = 20 (Q1-2 Section A max 10, Q3-4 Section B max 10)
  const mockListeningFPaper = {
    sheetName: 'Listening F',
    paper: 'Listening',
    tier: 'Foundation',
    totalMax: 20,
    questions: [
      { key: 'q1', label: 'Q1-2 Free time', section: 'Section A', maxMarks: 10 },
      { key: 'q2', label: 'Q3-4 School', section: 'Section B', maxMarks: 10 }
    ],
    students: [
      {
        name: 'Rivera, Carlos',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        marks: { q1: 8, q2: 8 },
        total: 16, // 80%
        status: 'present'
      },
      {
        name: 'Patel, Priya',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'SEN Support',
        disadvantaged: 'Yes',
        marks: { q1: 7, q2: 7 },
        total: 14, // 70%
        status: 'present'
      },
      {
        name: 'Taylor, Dan',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        marks: { q1: 6, q2: 6 },
        total: 12, // 60%
        status: 'present'
      },
      {
        name: 'Wilson, Sophie',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        marks: { q1: 5, q2: 5 },
        total: 10, // 50%
        status: 'present'
      },
      {
        name: 'Green, Oliver',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        marks: { q1: 4, q2: 4 },
        total: 8, // 40%
        status: 'present'
      },
      {
        name: 'Clark, Emma',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        marks: { q1: null, q2: null },
        total: 0,
        status: 'absent' // Absent student
      }
    ]
  };

  // Mock Listening Higher paper
  const mockListeningHPaper = {
    sheetName: 'Listening H',
    paper: 'Listening',
    tier: 'Higher',
    totalMax: 20,
    questions: [
      { key: 'q1', label: 'Q1-2 Media', section: 'Section A', maxMarks: 10 },
      { key: 'q2', label: 'Q3-4 Culture', section: 'Section B', maxMarks: 10 }
    ],
    students: [
      {
        name: 'Davies, Lucas',
        activeClass: '10SP2',
        className: '10SP2',
        sen: 'No SEN',
        disadvantaged: 'No',
        marks: { q1: 9, q2: 9 },
        total: 18, // 90%
        status: 'present'
      }
    ]
  };

  it('1. An absent student is strictly excluded from all counts and averages', () => {
    const stats = calculatePaperStats(mockListeningFPaper);

    // Total students in paper array is 6, but only 5 are present
    expect(stats.n).toBe(5);

    // Eligible students scores: 16 (80%), 14 (70%), 12 (60%), 10 (50%), 8 (40%)
    // Average %: (80 + 70 + 60 + 50 + 40) / 5 = 60.0%
    // If the absent student (0%) were included, average would have been 50.0%
    expect(stats.avgPct).toBe(60.0);
    expect(stats.medianPct).toBe(60.0);

    // % at 50% or more: 4 out of 5 = 80.0%
    expect(stats.countAtOrAbove50).toBe(4);
    expect(stats.pctAtOrAbove50).toBe(80.0);

    // Highest and lowest
    expect(stats.highestScore.marks).toBe(16);
    expect(stats.highestScore.pct).toBe(80.0);
    expect(stats.lowestScore.marks).toBe(8);
    expect(stats.lowestScore.pct).toBe(40.0);
  });

  it('2. Foundation and Higher are never combined in calculations or highlights', () => {
    const mockReadingFPaper = {
      sheetName: 'Reading F',
      paper: 'Reading',
      tier: 'Foundation',
      totalMax: 20,
      questions: [{ key: 'q1', label: 'Q1', maxMarks: 20 }],
      students: [
        {
          name: 'Student 1',
          activeClass: '10SP1',
          total: 14, // 70%
          status: 'present'
        }
      ]
    };

    const mockReadingHPaper = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 20,
      questions: [{ key: 'q1', label: 'Q1', maxMarks: 20 }],
      students: [
        {
          name: 'Student 2',
          activeClass: '10SP2',
          total: 10, // 50%
          status: 'present'
        }
      ]
    };

    const allPapers = [mockListeningFPaper, mockListeningHPaper, mockReadingFPaper, mockReadingHPaper];
    const highlights = calculateCohortTierHighlights(allPapers);

    // Foundation highlights only look at Foundation papers (Listening F avg: 60%, Reading F avg: 70%)
    expect(highlights.foundation.strongest.paper).toBe('Reading');
    expect(highlights.foundation.strongest.tier).toBe('Foundation');
    expect(highlights.foundation.strongest.avgPct).toBe(70.0);

    expect(highlights.foundation.weakest.paper).toBe('Listening');
    expect(highlights.foundation.weakest.tier).toBe('Foundation');
    expect(highlights.foundation.weakest.avgPct).toBe(60.0);

    // Higher highlights only look at Higher papers (Listening H avg: 90%, Reading H avg: 50%)
    expect(highlights.higher.strongest.paper).toBe('Listening');
    expect(highlights.higher.strongest.tier).toBe('Higher');
    expect(highlights.higher.strongest.avgPct).toBe(90.0);

    expect(highlights.higher.weakest.paper).toBe('Reading');
    expect(highlights.higher.weakest.tier).toBe('Higher');
    expect(highlights.higher.weakest.avgPct).toBe(50.0);
  });

  it('3. A class with fewer than 5 students is flagged as too few and has "too few to compare" tooltip', () => {
    const matrix = calculateClassPaperMatrix([mockListeningFPaper, mockListeningHPaper]);

    // 10SP1 has 5 present students on Listening F -> not too few
    const row10SP1 = matrix.rows.find(r => r.className === '10SP1');
    expect(row10SP1).toBeDefined();
    expect(row10SP1.cells['Listening F'].n).toBe(5);
    expect(row10SP1.cells['Listening F'].tooFew).toBe(false);
    expect(row10SP1.cells['Listening F'].tooltip).toBeNull();

    // 10SP2 has only 1 student on Listening H -> flagged as tooFew
    const row10SP2 = matrix.rows.find(r => r.className === '10SP2');
    expect(row10SP2).toBeDefined();
    expect(row10SP2.cells['Listening H'].n).toBe(1);
    expect(row10SP2.cells['Listening H'].tooFew).toBe(true);
    expect(row10SP2.cells['Listening H'].tooltip).toBe('too few to compare');

    // In class paper highlights, 10SP2 has no paper with >= 5 students, so it skips comparison
    const classHighlights = calculateClassPaperHighlights([mockListeningFPaper, mockListeningHPaper]);
    const highlight10SP2 = classHighlights.find(h => h.className === '10SP2');
    expect(highlight10SP2.hasEnoughData).toBe(false);
    expect(highlight10SP2.summaryText).toContain('too few students across papers to compare');
  });

  it('4. Class rows change when the view switch changes (current vs new classes)', () => {
    // Invented sheets
    const rowsListening = [
      ['Title'],
      ['', 'Student Name', 'Class', 'Q1', 'TOTAL MARKS', 'PERCENTAGE'],
      ['', 'Marks per Q', '', 20, 20, ''],
      [1, 'Rivera, Carlos', '10SP1', 16, 16, '80%'],
      [2, 'Patel, Priya', '10SP1', 14, 14, '70%'],
      [3, 'Taylor, Dan', '10SP1', 12, 12, '60%'],
      [4, 'Wilson, Sophie', '10SP1', 10, 10, '50%'],
      [5, 'Green, Oliver', '10SP1', 8, 8, '40%']
    ];

    const sheets = [{ name: 'Listening F', rows: rowsListening }];

    // Snapshot records with both current class and new class
    const snapshotRecords = [
      { surname: 'Rivera', firstName: 'Carlos', className: '10SP1', newClassName: '11A' },
      { surname: 'Patel', firstName: 'Priya', className: '10SP1', newClassName: '11A' },
      { surname: 'Taylor', firstName: 'Dan', className: '10SP1', newClassName: '11B' },
      { surname: 'Wilson', firstName: 'Sophie', className: '10SP1', newClassName: '11B' },
      { surname: 'Green', firstName: 'Oliver', className: '10SP1', newClassName: '11B' }
    ];

    // Current classes view
    const currentQla = processQlaWorkbookData(sheets, 'test.xlsx', snapshotRecords, 'current');
    const currentMatrix = calculateClassPaperMatrix(currentQla.papers);
    expect(currentMatrix.classes).toEqual(['10SP1']);
    expect(currentMatrix.rows).toHaveLength(1);
    expect(currentMatrix.rows[0].className).toBe('10SP1');

    // New classes view
    const newQla = processQlaWorkbookData(sheets, 'test.xlsx', snapshotRecords, 'new');
    const newMatrix = calculateClassPaperMatrix(newQla.papers);
    expect(newMatrix.classes).toEqual(['11A', '11B']);
    expect(newMatrix.rows).toHaveLength(2);
    expect(newMatrix.rows[0].className).toBe('11A');
    expect(newMatrix.rows[1].className).toBe('11B');
  });

  it('5. The colour band is correct for a cell 6 points below the cohort average (and amber / green)', () => {
    // Paper with two classes: 10A (5 students, avg 54%) and 10B (5 students, avg 66%)
    // Cohort avg = 60%
    const mockPaper = {
      sheetName: 'Reading F',
      paper: 'Reading',
      tier: 'Foundation',
      totalMax: 100,
      questions: [{ key: 'q1', label: 'Q1', maxMarks: 100 }],
      students: [
        // 10A: 5 students at 54% (6 points below cohort average of 60%)
        { name: 'A1', activeClass: '10A', total: 54, status: 'present' },
        { name: 'A2', activeClass: '10A', total: 54, status: 'present' },
        { name: 'A3', activeClass: '10A', total: 54, status: 'present' },
        { name: 'A4', activeClass: '10A', total: 54, status: 'present' },
        { name: 'A5', activeClass: '10A', total: 54, status: 'present' },
        // 10B: 5 students at 66% (6 points above cohort average of 60%)
        { name: 'B1', activeClass: '10B', total: 66, status: 'present' },
        { name: 'B2', activeClass: '10B', total: 66, status: 'present' },
        { name: 'B3', activeClass: '10B', total: 66, status: 'present' },
        { name: 'B4', activeClass: '10B', total: 66, status: 'present' },
        { name: 'B5', activeClass: '10B', total: 66, status: 'present' },
        // 10C: 5 students at 62% (2 points above cohort average -> amber)
        { name: 'C1', activeClass: '10C', total: 62, status: 'present' },
        { name: 'C2', activeClass: '10C', total: 62, status: 'present' },
        { name: 'C3', activeClass: '10C', total: 62, status: 'present' },
        { name: 'C4', activeClass: '10C', total: 62, status: 'present' },
        { name: 'C5', activeClass: '10C', total: 62, status: 'present' }
      ]
    };

    const matrix = calculateClassPaperMatrix([mockPaper]);

    const row10A = matrix.rows.find(r => r.className === '10A');
    const cell10A = row10A.cells['Reading F'];
    // 54% vs 60.7% cohort -> diff is <= -5.0 -> red
    expect(cell10A.diff).toBeLessThanOrEqual(-5.0);
    expect(cell10A.band).toBe('red');

    const row10B = matrix.rows.find(r => r.className === '10B');
    const cell10B = row10B.cells['Reading F'];
    // 66% vs 60.7% -> diff is >= +5.0 -> green
    expect(cell10B.diff).toBeGreaterThanOrEqual(5.0);
    expect(cell10B.band).toBe('green');

    const row10C = matrix.rows.find(r => r.className === '10C');
    const cell10C = row10C.cells['Reading F'];
    // 62% vs 60.7% -> diff is within 5.0 -> amber
    expect(cell10C.band).toBe('amber');
  });

  it('6. Section averages correctly calculate Section A against Section B only where sections exist', () => {
    // mockListeningFPaper has Section A (q1 max 10) and Section B (q2 max 10)
    // Marks:
    // Student 1: q1=8 (80%), q2=8 (80%)
    // Student 2: q1=7 (70%), q2=7 (70%)
    // Student 3: q1=6 (60%), q2=6 (60%)
    // Student 4: q1=5 (50%), q2=5 (50%)
    // Student 5: q1=4 (40%), q2=4 (40%)
    // Section A avg: 60.0%, Section B avg: 60.0%
    const eligibleStudents = mockListeningFPaper.students.filter(s => s.status !== 'absent');
    const sections = calculateSectionAverages(mockListeningFPaper, eligibleStudents);

    expect(sections).toHaveLength(2);
    expect(sections[0].section).toBe('Section A');
    expect(sections[0].avgPct).toBe(60.0);
    expect(sections[1].section).toBe('Section B');
    expect(sections[1].avgPct).toBe(60.0);

    // When a paper has no sections, it returns an empty array
    const paperNoSections = {
      ...mockListeningFPaper,
      questions: [
        { key: 'q1', label: 'Q1', section: '', maxMarks: 10 },
        { key: 'q2', label: 'Q2', section: '', maxMarks: 10 }
      ]
    };
    expect(calculateSectionAverages(paperNoSections, eligibleStudents)).toEqual([]);
  });

  it('7. Filters for class, SEN, disadvantaged, and tier apply accurately', () => {
    // Filter by SEN: 'SEN Support' -> only Priya Patel (70%)
    const senStats = calculatePaperStats(mockListeningFPaper, { sen: 'SEN Support' });
    expect(senStats.n).toBe(1);
    expect(senStats.avgPct).toBe(70.0);

    // Filter by disadvantaged: 'Yes' -> only Priya Patel
    const disStats = calculatePaperStats(mockListeningFPaper, { disadvantaged: 'Yes' });
    expect(disStats.n).toBe(1);
    expect(disStats.avgPct).toBe(70.0);

    // Filter by Tier: 'Higher' on Foundation paper -> returns null
    const tierStats = calculatePaperStats(mockListeningFPaper, { tier: 'Higher' });
    expect(tierStats).toBeNull();
  });

  // -------------------------------------------------------------
  // Questions Tab Pure Function Tests
  // -------------------------------------------------------------
  const mockPaperForQuestions = {
    sheetName: 'Reading F',
    paper: 'Reading',
    tier: 'Foundation',
    totalMax: 30,
    questions: [
      { key: 'q1', label: 'Q1 Free time AO1', topic: 'Free time', maxMarks: 10 },
      { key: 'q2', label: 'Q2 School AO2 AO3', topic: 'School', maxMarks: 10 },
      { key: 'q3', label: 'Q3 Dictation', topic: 'Dictation', maxMarks: 10 }
    ],
    students: [
      // Top third (k = 3): students 1, 2, 3
      { name: 'S1', activeClass: '10A', marks: { q1: 10, q2: 10, q3: 10 }, total: 30, status: 'present' },
      { name: 'S2', activeClass: '10A', marks: { q1: 9, q2: 9, q3: 9 }, total: 27, status: 'present' },
      { name: 'S3', activeClass: '10A', marks: { q1: 8, q2: 8, q3: 8 }, total: 24, status: 'present' },
      // Middle third: students 4, 5, 6
      { name: 'S4', activeClass: '10A', marks: { q1: 6, q2: 6, q3: 6 }, total: 18, status: 'present' },
      { name: 'S5', activeClass: '10A', marks: { q1: 5, q2: 5, q3: 5 }, total: 15, status: 'present' },
      { name: 'S6', activeClass: '10B', marks: { q1: 4, q2: 4, q3: 4 }, total: 12, status: 'present' },
      // Bottom third (k = 3): students 7, 8, 9
      { name: 'S7', activeClass: '10B', marks: { q1: 3, q2: 3, q3: 3 }, total: 9, status: 'present' },
      { name: 'S8', activeClass: '10B', marks: { q1: 2, q2: 2, q3: 2 }, total: 6, status: 'present' },
      { name: 'S9', activeClass: '10B', marks: { q1: 0, q2: 0, q3: 0 }, total: 0, status: 'present' },
      // Absent student: excluded from all calculations
      { name: 'S10_Absent', activeClass: '10B', marks: { q1: null, q2: null, q3: null }, total: 0, status: 'absent' }
    ]
  };

  it('8. Facility, zero rate and discrimination on a small sheet, checked against hand calculations', () => {
    const stats = calculateQuestionStats(mockPaperForQuestions);

    expect(stats.n).toBe(9); // 9 present students (absent student excluded)
    expect(stats.questions).toHaveLength(3);

    // Q1 Hand Calculation Check:
    // Total marks gained = 10 + 9 + 8 + 6 + 5 + 4 + 3 + 2 + 0 = 47
    // Total max possible = 9 * 10 = 90
    // Facility = (47 / 90) * 100 = 52.222... -> 52.2%
    // Zero count = 1 (Student 9 scored 0)
    // Zero rate = (1 / 9) * 100 = 11.111... -> 11.1%
    // Discrimination:
    // Top 3 students marks = 10 + 9 + 8 = 27 (facility: 27 / 30 = 90.0%)
    // Bottom 3 students marks = 3 + 2 + 0 = 5 (facility: 5 / 30 = 16.666...%)
    // Discrimination = 90.0 - 16.666... = 73.333... -> 73.3 percentage points
    const q1 = stats.questions[0];
    expect(q1.facility).toBe(52.2);
    expect(q1.zeroRate).toBe(11.1);
    expect(q1.discrimination).toBe(73.3);
    expect(q1.facilityBand).toBe('secure'); // 52.2% is between 40% and 69%
  });

  it('9. Discrimination shows n/a (null) with fewer than 9 present students', () => {
    // Only 8 present students
    const paperWith8 = {
      ...mockPaperForQuestions,
      students: mockPaperForQuestions.students.slice(0, 8)
    };

    const stats = calculateQuestionStats(paperWith8);
    expect(stats.n).toBe(8);
    for (const q of stats.questions) {
      expect(q.discrimination).toBeNull();
    }
  });

  it('10. Absent students are strictly excluded from question metrics', () => {
    // Adding 3 more absent students should not change n (still 9) or any question metric
    const paperWithMoreAbsent = {
      ...mockPaperForQuestions,
      students: [
        ...mockPaperForQuestions.students,
        { name: 'Abs1', activeClass: '10A', marks: { q1: null }, total: 0, status: 'absent' },
        { name: 'Abs2', activeClass: '10B', marks: { q1: null }, total: 0, status: 'absent' }
      ]
    };

    const stats = calculateQuestionStats(paperWithMoreAbsent);
    expect(stats.n).toBe(9);
    expect(stats.questions[0].facility).toBe(52.2);
    expect(stats.questions[0].zeroRate).toBe(11.1);
    expect(stats.questions[0].discrimination).toBe(73.3);
  });

  it('11. Best and worst lists exclude small classes (fewer than 5 present students)', () => {
    // 10A has 5 students (S1, S2, S3, S4, S5) -> >= 5
    // 10B has 4 present students (S6, S7, S8, S9) + 1 absent -> only 4 present (< 5)
    const bestWorst = calculateBestAndWorstQuestions(mockPaperForQuestions);

    expect(bestWorst.cohortBest).toHaveLength(3);
    expect(bestWorst.cohortWorst).toHaveLength(3);

    // Only 10A should be present in classBreakdowns; 10B must be left out because n < 5
    expect(bestWorst.classBreakdowns).toHaveLength(1);
    expect(bestWorst.classBreakdowns[0].className).toBe('10A');
    expect(bestWorst.classBreakdowns[0].n).toBe(5);
  });

  it('12. A heatmap cell 10 or more points below the cohort is flagged', () => {
    // Let's create a paper where class 10A is 10+ points below the cohort on Q1
    const testHeatmapPaper = {
      sheetName: 'Reading F',
      paper: 'Reading',
      tier: 'Foundation',
      totalMax: 10,
      questions: [{ key: 'q1', label: 'Q1 Vocabulary', maxMarks: 10 }],
      students: [
        // 10A: 5 students with marks 4/10 -> facility 40%
        { name: 'A1', activeClass: '10A', marks: { q1: 4 }, total: 4, status: 'present' },
        { name: 'A2', activeClass: '10A', marks: { q1: 4 }, total: 4, status: 'present' },
        { name: 'A3', activeClass: '10A', marks: { q1: 4 }, total: 4, status: 'present' },
        { name: 'A4', activeClass: '10A', marks: { q1: 4 }, total: 4, status: 'present' },
        { name: 'A5', activeClass: '10A', marks: { q1: 4 }, total: 4, status: 'present' },
        // 10B: 5 students with marks 8/10 -> facility 80%
        { name: 'B1', activeClass: '10B', marks: { q1: 8 }, total: 8, status: 'present' },
        { name: 'B2', activeClass: '10B', marks: { q1: 8 }, total: 8, status: 'present' },
        { name: 'B3', activeClass: '10B', marks: { q1: 8 }, total: 8, status: 'present' },
        { name: 'B4', activeClass: '10B', marks: { q1: 8 }, total: 8, status: 'present' },
        { name: 'B5', activeClass: '10B', marks: { q1: 8 }, total: 8, status: 'present' }
      ]
    };

    // Cohort facility = (5*4 + 5*8) / (10 * 10) * 100 = 60.0%
    // 10A facility = 40.0% -> diff = 60 - 40 = 20.0 (>= 10.0 points below cohort) -> flagged!
    // 10B facility = 80.0% -> not flagged
    const heatmap = calculateQuestionHeatmap(testHeatmapPaper);

    const q1Row = heatmap.rows[0];
    expect(q1Row.cohortFacility).toBe(60.0);

    const cell10A = q1Row.cells['10A'];
    expect(cell10A.facility).toBe(40.0);
    expect(cell10A.diff).toBe(20.0);
    expect(cell10A.flagged).toBe(true);

    const cell10B = q1Row.cells['10B'];
    expect(cell10B.facility).toBe(80.0);
    expect(cell10B.diff).toBe(-20.0);
    expect(cell10B.flagged).toBe(false);
  });

  it('13. A question labelled "AO2 AO3" counts in both AO summaries', () => {
    const summary = calculateTopicAndAOSummaries(mockPaperForQuestions);

    expect(summary.hasAOs).toBe(true);
    // Questions:
    // Q1: "AO1"
    // Q2: "AO2 AO3"
    // Q3: No AO
    const aoNames = summary.aos.map(a => a.ao);
    expect(aoNames).toContain('AO1');
    expect(aoNames).toContain('AO2');
    expect(aoNames).toContain('AO3');

    const ao2 = summary.aos.find(a => a.ao === 'AO2');
    const ao3 = summary.aos.find(a => a.ao === 'AO3');

    expect(ao2.questionCount).toBe(1);
    expect(ao3.questionCount).toBe(1);
    // Both AO2 and AO3 should have Q2's facility
    expect(ao2.avgFacility).toBe(52.2);
    expect(ao3.avgFacility).toBe(52.2);
  });

  it('14. A dictation question appears in the dictation and translation card', () => {
    const special = getDictationAndTranslationQuestions(mockPaperForQuestions);

    expect(special.hasSpecialQuestions).toBe(true);
    expect(special.questions).toHaveLength(1);
    expect(special.questions[0].label).toBe('Q3 Dictation');
    expect(special.questions[0].facility).toBe(52.2);
  });

  // -------------------------------------------------------------
  // Classes Tab Pure Function Tests (Invented Data)
  // -------------------------------------------------------------
  const mockClassReportPaper = {
    sheetName: 'Writing F',
    paper: 'Writing',
    tier: 'Foundation',
    totalMax: 40,
    questions: [
      { key: 'q1', label: 'Q1 Description', topic: 'Free time', maxMarks: 10 },
      { key: 'q2', label: 'Q2 Message', topic: 'School', maxMarks: 10 },
      { key: 'q3', label: 'Q3 Translation', topic: 'Holidays', maxMarks: 10 },
      { key: 'q4', label: 'Q4 90 words', topic: 'Future plans', maxMarks: 10 }
    ],
    students: [
      // Class 10SP1 (5 present, 1 absent)
      { name: 'S1', activeClass: '10SP1', marks: { q1: 10, q2: 8, q3: 7, q4: 5 }, total: 30, percentage: 75.0, status: 'present', result: 5, displayResult: '5' },
      { name: 'S2', activeClass: '10SP1', marks: { q1: 8, q2: 8, q3: 6, q4: 6 }, total: 28, percentage: 70.0, status: 'present', result: 5, displayResult: '5' },
      { name: 'S3', activeClass: '10SP1', marks: { q1: 7, q2: 6, q3: 5, q4: 4 }, total: 22, percentage: 55.0, status: 'present', result: 4, displayResult: '4' },
      { name: 'S4', activeClass: '10SP1', marks: { q1: 6, q2: 5, q3: 4, q4: 3 }, total: 18, percentage: 45.0, status: 'present', result: 4, displayResult: '4' },
      { name: 'S5', activeClass: '10SP1', marks: { q1: 5, q2: 4, q3: 3, q4: 2 }, total: 14, percentage: 35.0, status: 'present', result: 3, displayResult: '3' },
      { name: 'S6_Absent', activeClass: '10SP1', marks: {}, total: 0, percentage: null, status: 'absent', result: 3, displayResult: '3' },
      // Class 10SP2 (5 present)
      { name: 'S7', activeClass: '10SP2', marks: { q1: 4, q2: 5, q3: 8, q4: 9 }, total: 26, percentage: 65.0, status: 'present', result: 5, displayResult: '5' },
      { name: 'S8', activeClass: '10SP2', marks: { q1: 3, q2: 4, q3: 7, q4: 8 }, total: 22, percentage: 55.0, status: 'present', result: 4, displayResult: '4' },
      { name: 'S9', activeClass: '10SP2', marks: { q1: 2, q2: 3, q3: 6, q4: 7 }, total: 18, percentage: 45.0, status: 'present', result: 4, displayResult: '4' },
      { name: 'S10', activeClass: '10SP2', marks: { q1: 1, q2: 2, q3: 5, q4: 6 }, total: 14, percentage: 35.0, status: 'present', result: 3, displayResult: '3' },
      { name: 'S11', activeClass: '10SP2', marks: { q1: 0, q2: 1, q3: 4, q4: 5 }, total: 10, percentage: 25.0, status: 'present', result: 2, displayResult: '2' }
    ]
  };

  it('15. Class and cohort figures for one paper, checked against hand calculations', () => {
    const report = calculateClassReport([mockClassReportPaper], '10SP1');

    // Header metrics
    expect(report.className).toBe('10SP1');
    expect(report.totalStudents).toBe(6); // 5 present + 1 absent
    expect(report.satAtLeastOneCount).toBe(5); // 5 sat the paper
    expect(report.absencesPerPaper).toHaveLength(1);
    expect(report.absencesPerPaper[0].absentCount).toBe(1);
    expect(report.absencesPerPaper[0].presentCount).toBe(5);

    // Paper summary check:
    // 10SP1 total marks = 30 + 28 + 22 + 18 + 14 = 112 (max 200) -> 56.0%
    // Cohort total marks = 112 + 90 = 202 (max 400) -> 50.5%
    // Points diff = 56.0 - 50.5 = +5.5 points
    // Band: 'green' (diff >= 5.0)
    expect(report.paperSummaries).toHaveLength(1);
    const summary = report.paperSummaries[0];
    expect(summary.paper).toBe('Writing');
    expect(summary.tier).toBe('Foundation');
    expect(summary.n).toBe(5);
    expect(summary.tooFew).toBe(false);
    expect(summary.classAvgPct).toBe(56.0);
    expect(summary.cohortAvgPct).toBe(50.5);
    expect(summary.diff).toBe(5.5);
    expect(summary.band).toBe('green');

    // Strongest & weakest paper
    expect(report.strongestPaper).not.toBeNull();
    expect(report.strongestPaper.paper).toBe('Writing');
    expect(report.strongestPaper.avgPct).toBe(56.0);
  });

  it('16. The largest negative gap list is sorted correctly (most negative gap first)', () => {
    const report = calculateClassReport([mockClassReportPaper], '10SP1');

    // From hand calculations:
    // Q4: class facility = 40.0%, cohort = 55.0% -> gap = -15.0 pts
    // Q3: class facility = 50.0%, cohort = 55.0% -> gap = -5.0 pts
    // Q2: class facility = 62.0%, cohort = 46.0% -> gap = +16.0 pts
    // Q1: class facility = 72.0%, cohort = 46.0% -> gap = +26.0 pts
    expect(report.furthestBelowCohort).toHaveLength(2);
    expect(report.furthestBelowCohort[0].key).toBe('q4');
    expect(report.furthestBelowCohort[0].gap).toBe(-15.0);
    expect(report.furthestBelowCohort[1].key).toBe('q3');
    expect(report.furthestBelowCohort[1].gap).toBe(-5.0);
  });

  it('17. The beating the cohort list (approaches worth sharing) is sorted correctly (most positive gap first)', () => {
    const report = calculateClassReport([mockClassReportPaper], '10SP1');

    expect(report.beatingCohort).toHaveLength(2);
    expect(report.beatingCohort[0].key).toBe('q1');
    expect(report.beatingCohort[0].gap).toBe(26.0);
    expect(report.beatingCohort[1].key).toBe('q2');
    expect(report.beatingCohort[1].gap).toBe(16.0);

    // Best 3 and Worst 3 by class facility
    expect(report.bestQuestions).toHaveLength(3);
    expect(report.bestQuestions[0].key).toBe('q1'); // 72.0%
    expect(report.bestQuestions[1].key).toBe('q2'); // 62.0%
    expect(report.bestQuestions[2].key).toBe('q3'); // 50.0%

    expect(report.worstQuestions).toHaveLength(3);
    expect(report.worstQuestions[0].key).toBe('q4'); // 40.0%
    expect(report.worstQuestions[1].key).toBe('q3'); // 50.0%
    expect(report.worstQuestions[2].key).toBe('q2'); // 62.0%
  });

  it('18. A class with fewer than 5 present students is marked tooFew: true and left out of question lists', () => {
    // Paper with only 3 present students in 10Small
    const mockSmallClassPaper = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 20,
      questions: [
        { key: 'q1', label: 'Q1 Grammar', topic: 'Grammar', maxMarks: 10 },
        { key: 'q2', label: 'Q2 Translation', topic: 'Translation', maxMarks: 10 }
      ],
      students: [
        { name: 'ST1', activeClass: '10Small', marks: { q1: 8, q2: 8 }, total: 16, percentage: 80.0, status: 'present' },
        { name: 'ST2', activeClass: '10Small', marks: { q1: 7, q2: 7 }, total: 14, percentage: 70.0, status: 'present' },
        { name: 'ST3', activeClass: '10Small', marks: { q1: 6, q2: 6 }, total: 12, percentage: 60.0, status: 'present' },
        { name: 'ST4_Other', activeClass: '10Other', marks: { q1: 5, q2: 5 }, total: 10, percentage: 50.0, status: 'present' },
        { name: 'ST5_Other', activeClass: '10Other', marks: { q1: 5, q2: 5 }, total: 10, percentage: 50.0, status: 'present' },
        { name: 'ST6_Other', activeClass: '10Other', marks: { q1: 5, q2: 5 }, total: 10, percentage: 50.0, status: 'present' },
        { name: 'ST7_Other', activeClass: '10Other', marks: { q1: 5, q2: 5 }, total: 10, percentage: 50.0, status: 'present' },
        { name: 'ST8_Other', activeClass: '10Other', marks: { q1: 5, q2: 5 }, total: 10, percentage: 50.0, status: 'present' }
      ]
    };

    const report = calculateClassReport([mockSmallClassPaper], '10Small');

    expect(report.paperSummaries).toHaveLength(1);
    expect(report.paperSummaries[0].tooFew).toBe(true);
    expect(report.paperSummaries[0].n).toBe(3);

    // Left out of strongest/weakest papers
    expect(report.strongestPaper).toBeNull();
    expect(report.weakestPaper).toBeNull();
    expect(report.hasEnoughPaperData).toBe(false);

    // Left out of all question lists
    expect(report.bestQuestions).toHaveLength(0);
    expect(report.worstQuestions).toHaveLength(0);
    expect(report.furthestBelowCohort).toHaveLength(0);
    expect(report.beatingCohort).toHaveLength(0);
    expect(report.hasEnoughQuestionData).toBe(false);
  });

  it('19. Absent students are excluded from all class report averages and gap calculations', () => {
    // Compare 10SP1 in mockClassReportPaper (which had 1 absent student)
    // The absent student should not skew student count for averages (n = 5),
    // and should be recorded in absencesPerPaper
    const report = calculateClassReport([mockClassReportPaper], '10SP1');

    expect(report.paperSummaries[0].n).toBe(5);
    const absentStudent = report.students.find(s => s.name === 'S6_Absent');
    expect(absentStudent).toBeDefined();
    expect(absentStudent.paperPercentages['Writing F']).toBeNull();
    expect(absentStudent.paperStatuses['Writing F']).toBe('absent');
    expect(absentStudent.weakestPaper).toBe('-');
  });
});

describe('QLA Students Tab Pure Stats Tests (Invented Data)', () => {
  // Invented multi-paper dataset
  const paperListeningF = {
    sheetName: 'Listening F',
    paper: 'Listening',
    tier: 'Foundation',
    totalMax: 20,
    questions: [
      { key: 'q1', label: 'Q1 Free time', maxMarks: 10, topic: 'Free time' },
      { key: 'q2', label: 'Q2 School', maxMarks: 10, topic: 'School' }
    ],
    students: [
      {
        name: 'Rivera, Carlos',
        surname: 'Rivera',
        firstName: 'Carlos',
        nameKey: 'rivera_carlos',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 4,
        points: 4,
        displayResult: '4',
        total: 16, // 80%
        marks: { q1: 8, q2: 8 },
        status: 'present'
      },
      {
        name: 'Patel, Priya',
        surname: 'Patel',
        firstName: 'Priya',
        nameKey: 'patel_priya',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'SEN Support',
        disadvantaged: 'Yes',
        eal: 'Yes',
        snapshotMatched: true,
        result: 4,
        points: 4,
        displayResult: '4',
        total: 14, // 70%
        marks: { q1: 7, q2: 7 },
        status: 'present'
      },
      {
        name: 'Taylor, Dan',
        surname: 'Taylor',
        firstName: 'Dan',
        nameKey: 'taylor_dan',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 4,
        points: 4,
        displayResult: '4',
        total: 8, // 40%
        marks: { q1: 4, q2: 4 },
        status: 'present'
      },
      {
        name: 'Wilson, Sophie',
        surname: 'Wilson',
        firstName: 'Sophie',
        nameKey: 'wilson_sophie',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 5,
        points: 5,
        displayResult: '5',
        total: 10, // 50%
        marks: { q1: 5, q2: 5 },
        status: 'present'
      },
      {
        name: 'Green, Oliver',
        surname: 'Green',
        firstName: 'Oliver',
        nameKey: 'green_oliver',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 2,
        points: 2,
        displayResult: '2',
        total: 8, // 40%
        marks: { q1: 4, q2: 4 },
        status: 'present'
      },
      {
        name: 'Clark, Emma',
        surname: 'Clark',
        firstName: 'Emma',
        nameKey: 'clark_emma',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: false, // Unmatched
        result: null,
        points: null,
        displayResult: '',
        total: 12, // 60%
        marks: { q1: 6, q2: 6 },
        status: 'present'
      },
      {
        name: 'Davis, Lucas',
        surname: 'Davis',
        firstName: 'Lucas',
        nameKey: 'davis_lucas',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 3,
        points: 3,
        displayResult: '3',
        total: 15, // 75%
        marks: { q1: 8, q2: 7 },
        status: 'present'
      }
    ]
  };

  const paperReadingF = {
    sheetName: 'Reading F',
    paper: 'Reading',
    tier: 'Foundation',
    totalMax: 20,
    questions: [
      { key: 'q1', label: 'Q1 Family', maxMarks: 10, topic: 'Family' },
      { key: 'q2', label: 'Q2 Town', maxMarks: 10, topic: 'Town' }
    ],
    students: [
      {
        name: 'Rivera, Carlos',
        surname: 'Rivera',
        firstName: 'Carlos',
        nameKey: 'rivera_carlos',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 4,
        points: 4,
        displayResult: '4',
        total: 10, // 50%
        marks: { q1: 5, q2: 5 },
        status: 'present'
      },
      {
        name: 'Patel, Priya',
        surname: 'Patel',
        firstName: 'Priya',
        nameKey: 'patel_priya',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'SEN Support',
        disadvantaged: 'Yes',
        eal: 'Yes',
        snapshotMatched: true,
        result: 4,
        points: 4,
        displayResult: '4',
        total: 12, // 60%
        marks: { q1: 6, q2: 6 },
        status: 'present'
      },
      {
        name: 'Taylor, Dan',
        surname: 'Taylor',
        firstName: 'Dan',
        nameKey: 'taylor_dan',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 4,
        points: 4,
        displayResult: '4',
        total: 14, // 70%
        marks: { q1: 7, q2: 7 },
        status: 'present'
      },
      {
        name: 'Wilson, Sophie',
        surname: 'Wilson',
        firstName: 'Sophie',
        nameKey: 'wilson_sophie',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 5,
        points: 5,
        displayResult: '5',
        total: 16, // 80%
        marks: { q1: 8, q2: 8 },
        status: 'present'
      },
      {
        name: 'Green, Oliver',
        surname: 'Green',
        firstName: 'Oliver',
        nameKey: 'green_oliver',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 2,
        points: 2,
        displayResult: '2',
        total: 6, // 30%
        marks: { q1: 3, q2: 3 },
        status: 'present'
      },
      {
        name: 'Clark, Emma',
        surname: 'Clark',
        firstName: 'Emma',
        nameKey: 'clark_emma',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: false,
        result: null,
        points: null,
        displayResult: '',
        total: null,
        marks: {},
        status: 'absent' // Absent on Reading F
      },
      {
        name: 'Davis, Lucas',
        surname: 'Davis',
        firstName: 'Lucas',
        nameKey: 'davis_lucas',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 3,
        points: 3,
        displayResult: '3',
        total: null,
        marks: {},
        status: 'absent' // Absent on Reading F
      }
    ]
  };

  const paperWritingF = {
    sheetName: 'Writing F',
    paper: 'Writing',
    tier: 'Foundation',
    totalMax: 20,
    questions: [
      { key: 'q1', label: 'Q1 Message AO1', maxMarks: 10, topic: 'Writing' },
      { key: 'q2', label: 'Q2 Task AO2', maxMarks: 10, topic: 'Writing' }
    ],
    students: [
      {
        name: 'Rivera, Carlos',
        surname: 'Rivera',
        firstName: 'Carlos',
        nameKey: 'rivera_carlos',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 4,
        points: 4,
        displayResult: '4',
        total: 8, // 40%
        marks: { q1: 4, q2: 4 },
        status: 'present'
      },
      {
        name: 'Patel, Priya',
        surname: 'Patel',
        firstName: 'Priya',
        nameKey: 'patel_priya',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'SEN Support',
        disadvantaged: 'Yes',
        eal: 'Yes',
        snapshotMatched: true,
        result: 4,
        points: 4,
        displayResult: '4',
        total: 10, // 50%
        marks: { q1: 5, q2: 5 },
        status: 'present'
      },
      {
        name: 'Taylor, Dan',
        surname: 'Taylor',
        firstName: 'Dan',
        nameKey: 'taylor_dan',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 4,
        points: 4,
        displayResult: '4',
        total: 16, // 80%
        marks: { q1: 8, q2: 8 },
        status: 'present'
      },
      {
        name: 'Wilson, Sophie',
        surname: 'Wilson',
        firstName: 'Sophie',
        nameKey: 'wilson_sophie',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 5,
        points: 5,
        displayResult: '5',
        total: 12, // 60%
        marks: { q1: 6, q2: 6 },
        status: 'present'
      },
      {
        name: 'Green, Oliver',
        surname: 'Green',
        firstName: 'Oliver',
        nameKey: 'green_oliver',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 2,
        points: 2,
        displayResult: '2',
        total: 4, // 20%
        marks: { q1: 2, q2: 2 },
        status: 'present'
      },
      {
        name: 'Clark, Emma',
        surname: 'Clark',
        firstName: 'Emma',
        nameKey: 'clark_emma',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: false,
        result: null,
        points: null,
        displayResult: '',
        total: 14, // 70%
        marks: { q1: 7, q2: 7 },
        status: 'present'
      },
      {
        name: 'Davis, Lucas',
        surname: 'Davis',
        firstName: 'Lucas',
        nameKey: 'davis_lucas',
        activeClass: '10SP1',
        className: '10SP1',
        sen: 'No SEN',
        disadvantaged: 'No',
        eal: 'No',
        snapshotMatched: true,
        result: 3,
        points: 3,
        displayResult: '3',
        total: null,
        marks: {},
        status: 'absent' // Absent on Writing F as well
      }
    ]
  };

  const allThreePapers = [paperListeningF, paperReadingF, paperWritingF];

  it('20. Absent paper is left out of strongest/weakest calculations and never counted as 0%', () => {
    // Clark, Emma sat Listening F (60%) and Writing F (70%), but was ABSENT on Reading F.
    // If Reading F were counted as 0%, Reading F would be weakest.
    // Because absent papers are left out, strongest is Writing F (70%) and weakest is Listening F (60%).
    const profiles = calculateStudentSkillProfiles(allThreePapers);
    const emma = profiles.find(s => s.name === 'Clark, Emma');

    expect(emma).toBeDefined();
    expect(emma.satPapers).toHaveLength(2); // Only Listening and Writing
    expect(emma.paperPercentages['Reading F']).toBeNull();
    expect(emma.paperStatuses['Reading F']).toBe('absent');
    expect(emma.strongestPaper).toBe('Writing F');
    expect(emma.weakestPaper).toBe('Listening F');
  });

  it('21. A student with only 1 paper sat shows "not enough papers" for both strongest and weakest', () => {
    // Davis, Lucas sat Listening F (75%), but was ABSENT on Reading F and Writing F.
    // Sat papers = 1 (< 2).
    const profiles = calculateStudentSkillProfiles(allThreePapers);
    const lucas = profiles.find(s => s.name === 'Davis, Lucas');

    expect(lucas).toBeDefined();
    expect(lucas.satPapers).toHaveLength(1);
    expect(lucas.strongestPaper).toBe('not enough papers');
    expect(lucas.weakestPaper).toBe('not enough papers');
  });

  it('22. Grade 4 grouping counts match hand-checked expected numbers', () => {
    // In our dataset:
    // Students with Grade 4:
    // 1. Rivera, Carlos: Listening 80%, Reading 50%, Writing 40% -> weakest: Writing F
    // 2. Patel, Priya: Listening 70%, Reading 60%, Writing 50% -> weakest: Writing F
    // 3. Taylor, Dan: Listening 40%, Reading 70%, Writing 80% -> weakest: Listening F
    // (Wilson, Sophie is Grade 5, Green, Oliver is Grade 2, Clark, Emma is unmatched, Davis, Lucas is Grade 3)
    //
    // Hand-checked expected grouping for Grade 4:
    // - Writing F: 2 students (Rivera, Carlos & Patel, Priya)
    // - Listening F: 1 student (Taylor, Dan)
    // Total Grade 4 students = 3.
    const profiles = calculateStudentSkillProfiles(allThreePapers);
    const grade4Groups = calculateGrade4sByWeakestPaper(profiles);

    expect(grade4Groups.foundation).toHaveLength(2);
    expect(grade4Groups.higher).toHaveLength(0);

    const writingGroup = grade4Groups.foundation.find(g => g.weakestPaper === 'Writing F');
    expect(writingGroup).toBeDefined();
    expect(writingGroup.count).toBe(2);
    expect(writingGroup.students.map(s => s.name).sort()).toEqual(['Patel, Priya', 'Rivera, Carlos']);

    const listeningGroup = grade4Groups.foundation.find(g => g.weakestPaper === 'Listening F');
    expect(listeningGroup).toBeDefined();
    expect(listeningGroup.count).toBe(1);
    expect(listeningGroup.students[0].name).toBe('Taylor, Dan');
  });

  it('23. Unmatched student shows "no mock data" for mock result and gap to grade 5', () => {
    // Clark, Emma is snapshotMatched: false
    const profiles = calculateStudentSkillProfiles(allThreePapers);
    const emma = profiles.find(s => s.name === 'Clark, Emma');

    expect(emma).toBeDefined();
    expect(emma.snapshotMatched).toBe(false);
    expect(emma.mockResult).toBe('no mock data');
    expect(emma.gapToGrade5).toBe('no mock data');
    expect(emma.gapValue).toBeNull();
  });

  it('24. EAL gap only appears when class lists are loaded (isClassListsLoaded: true)', () => {
    // Without class lists loaded:
    const gapsWithoutClassLists = calculateDemographicGroupGaps(allThreePapers, {}, false);
    for (const paperGap of gapsWithoutClassLists) {
      const ealComp = paperGap.comparisons.find(c => c.id === 'eal');
      expect(ealComp).toBeUndefined();
      expect(paperGap.comparisons.map(c => c.id)).toEqual(['sen', 'disadvantaged']);
    }

    // With class lists loaded:
    const gapsWithClassLists = calculateDemographicGroupGaps(allThreePapers, {}, true);
    for (const paperGap of gapsWithClassLists) {
      const ealComp = paperGap.comparisons.find(c => c.id === 'eal');
      expect(ealComp).toBeDefined();
      expect(ealComp.title).toBe('EAL vs Not');
      expect(paperGap.comparisons.map(c => c.id)).toEqual(['sen', 'disadvantaged', 'eal']);
    }
  });

  it('25. Missed papers list correctly identifies students absent from one or more papers', () => {
    // In our dataset:
    // - Clark, Emma was absent on Reading F (1 missed paper)
    // - Davis, Lucas was absent on Reading F and Writing F (2 missed papers)
    // - All other students (Rivera, Patel, Taylor, Wilson, Green) were present on all 3 papers (0 missed)
    const profiles = calculateStudentSkillProfiles(allThreePapers);
    const missedList = calculateMissedPapersList(profiles);

    expect(missedList).toHaveLength(2);

    // Sorted descending by missedCount (Davis, Lucas first with 2, then Clark, Emma with 1)
    expect(missedList[0].name).toBe('Davis, Lucas');
    expect(missedList[0].missedCount).toBe(2);
    expect(missedList[0].missedPapers).toEqual(['Reading F', 'Writing F']);

    expect(missedList[1].name).toBe('Clark, Emma');
    expect(missedList[1].missedCount).toBe(1);
    expect(missedList[1].missedPapers).toEqual(['Reading F']);
  });

  it('26. Farthest from grade 5 groups students with gap >= 3 by weakest paper', () => {
    // Green, Oliver has mock result 2 -> points 2 -> gap = 5 - 2 = 3 (gap >= 3)
    // Green sat Listening 40%, Reading 30%, Writing 20% -> weakest: Writing F
    const profiles = calculateStudentSkillProfiles(allThreePapers);
    const farthest = calculateFarthestFrom5ByWeakestPaper(profiles);

    expect(farthest.foundation).toHaveLength(1);
    expect(farthest.higher).toHaveLength(0);
    expect(farthest.foundation[0].weakestPaper).toBe('Writing F');
    expect(farthest.foundation[0].count).toBe(1);
    expect(farthest.foundation[0].students[0].name).toBe('Green, Oliver');
  });

  it('27. Weak questions analysis counts students scoring < 50% on questions with facility < weak threshold', () => {
    // On Writing F:
    // q2 maxMarks: 10. Marks: Rivera 4, Patel 5, Taylor 8, Wilson 6, Green 2, Clark 7, Davis (absent).
    // Total marks = 4 + 5 + 8 + 6 + 2 + 7 = 32. Present students = 6. Max = 60. Facility = 32 / 60 = 53.3% (> 40%).
    // But q1 on Writing F: marks: Rivera 4, Patel 5, Taylor 8, Wilson 6, Green 2, Clark 7. Total 32.
    // Let's test with a weakThreshold of 60% so questions qualify:
    const weakQuestions = calculateWeakQuestionsAnalysis(allThreePapers, {}, { strong: 70, weak: 60 });
    expect(weakQuestions.length).toBeGreaterThan(0);

    const writingQ2 = weakQuestions.find(q => q.sheetName === 'Writing F' && q.key === 'q2');
    expect(writingQ2).toBeDefined();
    // Students scoring < 50% (< 5 marks out of 10) on Writing F Q2:
    // Rivera (4 marks < 5) and Green (2 marks < 5)
    expect(writingQ2.weakStudentCount).toBe(2);
    expect(writingQ2.students.map(s => s.name).sort()).toEqual(['Green, Oliver', 'Rivera, Carlos']);
  });

  it('28. calculateStudentsReport returns full consolidated report object', () => {
    const report = calculateStudentsReport(allThreePapers, { className: 'ALL' }, { strong: 70, weak: 40 }, { isClassListsLoaded: true });

    expect(report.papers).toHaveLength(3);
    expect(report.allStudents).toHaveLength(7);
    expect(report.students).toHaveLength(7);
    expect(report.grade4sByWeakest.foundation.length).toBeGreaterThan(0);
    expect(report.farthestFrom5ByWeakest.foundation.length).toBeGreaterThan(0);
    expect(report.groupGaps).toHaveLength(3);
    expect(report.missedPapersStudents).toHaveLength(2);
  });

  it('29. A student with Reading H 70% and Writing F 30% never gets strongest/weakest across tiers and is marked "Mixed tiers"', () => {
    // Invented multi-tier student
    const paperReadingH = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 20,
      students: [
        {
          name: 'Ahmed, Tariq',
          surname: 'Ahmed',
          firstName: 'Tariq',
          nameKey: 'ahmed_tariq',
          activeClass: '10SP1',
          total: 14, // 70%
          status: 'present'
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
          name: 'Ahmed, Tariq',
          surname: 'Ahmed',
          firstName: 'Tariq',
          nameKey: 'ahmed_tariq',
          activeClass: '10SP1',
          total: 6, // 30%
          status: 'present'
        }
      ]
    };

    const profiles = calculateStudentSkillProfiles([paperReadingH, paperWritingF]);
    const tariq = profiles.find(s => s.name === 'Ahmed, Tariq');

    expect(tariq).toBeDefined();
    expect(tariq.tier).toBe('Mixed tiers');
    expect(tariq.isMixedTiers).toBe(true);
    // Because neither tier has >= 2 papers sat, neither tier can produce a strongest/weakest
    expect(tariq.strongestPaper).toBe('not enough papers');
    expect(tariq.weakestPaper).toBe('not enough papers');
  });

  it('30. A student who sat 2 Foundation papers and 1 Higher paper chooses strongest and weakest from Foundation only', () => {
    const paperListeningF = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        {
          name: 'Khan, Zainab',
          surname: 'Khan',
          firstName: 'Zainab',
          nameKey: 'khan_zainab',
          activeClass: '10SP1',
          total: 16, // 80%
          status: 'present'
        }
      ]
    };

    const paperReadingF = {
      sheetName: 'Reading F',
      paper: 'Reading',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        {
          name: 'Khan, Zainab',
          surname: 'Khan',
          firstName: 'Zainab',
          nameKey: 'khan_zainab',
          activeClass: '10SP1',
          total: 10, // 50%
          status: 'present'
        }
      ]
    };

    const paperWritingH = {
      sheetName: 'Writing H',
      paper: 'Writing',
      tier: 'Higher',
      totalMax: 20,
      students: [
        {
          name: 'Khan, Zainab',
          surname: 'Khan',
          firstName: 'Zainab',
          nameKey: 'khan_zainab',
          activeClass: '10SP1',
          total: 18, // 90% (higher than listening, but in a different tier!)
          status: 'present'
        }
      ]
    };

    const profiles = calculateStudentSkillProfiles([paperListeningF, paperReadingF, paperWritingH]);
    const zainab = profiles.find(s => s.name === 'Khan, Zainab');

    expect(zainab).toBeDefined();
    expect(zainab.tier).toBe('Mixed tiers');
    expect(zainab.isMixedTiers).toBe(true);
    expect(zainab.primaryTier).toBe('Foundation');
    // Strongest is Listening F (80%), NOT Writing H (90%) because tier comparison rule strictly prevents mixing tiers
    expect(zainab.strongestPaper).toBe('Listening F');
    expect(zainab.weakestPaper).toBe('Reading F');
  });

  it('31. A student who sat equal papers in both tiers shows strongest and weakest separately for each tier', () => {
    const paperListeningF = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        {
          name: 'Lewis, Maya',
          surname: 'Lewis',
          firstName: 'Maya',
          nameKey: 'lewis_maya',
          activeClass: '10SP1',
          total: 16, // 80%
          status: 'present'
        }
      ]
    };
    const paperReadingF = {
      sheetName: 'Reading F',
      paper: 'Reading',
      tier: 'Foundation',
      totalMax: 20,
      students: [
        {
          name: 'Lewis, Maya',
          surname: 'Lewis',
          firstName: 'Maya',
          nameKey: 'lewis_maya',
          activeClass: '10SP1',
          total: 10, // 50%
          status: 'present'
        }
      ]
    };
    const paperWritingH = {
      sheetName: 'Writing H',
      paper: 'Writing',
      tier: 'Higher',
      totalMax: 20,
      students: [
        {
          name: 'Lewis, Maya',
          surname: 'Lewis',
          firstName: 'Maya',
          nameKey: 'lewis_maya',
          activeClass: '10SP1',
          total: 18, // 90%
          status: 'present'
        }
      ]
    };
    const paperDictationH = {
      sheetName: 'Dictation H',
      paper: 'Dictation',
      tier: 'Higher',
      totalMax: 20,
      students: [
        {
          name: 'Lewis, Maya',
          surname: 'Lewis',
          firstName: 'Maya',
          nameKey: 'lewis_maya',
          activeClass: '10SP1',
          total: 8, // 40%
          status: 'present'
        }
      ]
    };

    const profiles = calculateStudentSkillProfiles([paperListeningF, paperReadingF, paperWritingH, paperDictationH]);
    const maya = profiles.find(s => s.name === 'Lewis, Maya');

    expect(maya).toBeDefined();
    expect(maya.tier).toBe('Mixed tiers');
    expect(maya.strongestPaper).toBe('Foundation: Listening F; Higher: Writing H');
    expect(maya.weakestPaper).toBe('Foundation: Reading F; Higher: Dictation H');
  });

  it('32. Class one-liners in calculateClassPaperHighlights name strongest and weakest strictly per tier', () => {
    // Build a dataset where 10SP1 sat both Foundation and Higher papers with >= 5 students each
    const makeStudents = (className, score) => [1, 2, 3, 4, 5].map(i => ({
      name: `Student_${i}`,
      activeClass: className,
      status: 'present',
      total: score
    }));

    const paperF1 = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      students: makeStudents('10SP1', 16) // 80%
    };
    const paperF2 = {
      sheetName: 'Writing F',
      paper: 'Writing',
      tier: 'Foundation',
      totalMax: 20,
      students: makeStudents('10SP1', 8) // 40%
    };
    const paperH1 = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 20,
      students: makeStudents('10SP1', 14) // 70%
    };
    const paperH2 = {
      sheetName: 'Listening H',
      paper: 'Listening',
      tier: 'Higher',
      totalMax: 20,
      students: makeStudents('10SP1', 6) // 30%
    };

    const highlights = calculateClassPaperHighlights([paperF1, paperF2, paperH1, paperH2], {});

    // There must be separate highlights for Foundation and Higher for 10SP1
    const fHighlight = highlights.find(h => h.className === '10SP1' && h.tier === 'Foundation');
    const hHighlight = highlights.find(h => h.className === '10SP1' && h.tier === 'Higher');

    expect(fHighlight).toBeDefined();
    expect(hHighlight).toBeDefined();
    expect(fHighlight.summaryText).toBe('10SP1 Foundation: strongest Listening F (80%), weakest Writing F (40%)');
    expect(hHighlight.summaryText).toBe('10SP1 Higher: strongest Reading H (70%), weakest Listening H (30%)');
  });

  it('33. calculateClassReport tierHighlights strictly isolates Foundation and Higher', () => {
    const makeStudents = (className, score) => [1, 2, 3, 4, 5].map(i => ({
      name: `Student_${i}`,
      surname: `Student_${i}`,
      firstName: '',
      activeClass: className,
      status: 'present',
      total: score
    }));

    const paperF1 = {
      sheetName: 'Listening F',
      paper: 'Listening',
      tier: 'Foundation',
      totalMax: 20,
      students: makeStudents('10SP1', 16)
    };
    const paperH1 = {
      sheetName: 'Reading H',
      paper: 'Reading',
      tier: 'Higher',
      totalMax: 20,
      students: makeStudents('10SP1', 14)
    };

    const report = calculateClassReport([paperF1, paperH1], '10SP1');

    expect(report.tierHighlights.byTier['Foundation']).toBeDefined();
    expect(report.tierHighlights.byTier['Higher']).toBeDefined();
    expect(report.tierHighlights.byTier['Foundation'].strongest.tier).toBe('Foundation');
    expect(report.tierHighlights.byTier['Higher'].strongest.tier).toBe('Higher');
  });
});

