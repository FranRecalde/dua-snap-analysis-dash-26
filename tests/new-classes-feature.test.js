import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSnapshotSpreadsheet,
  parseClassListFile,
  mergeClassListsIntoSnapshot,
  extractClassNameFromFileName,
  buildNameKey
} from '../src/parser.js';
import {
  calculateMetrics,
  calculateClassBreakdown,
  calculateStudentGroupsBreakdown,
  calculateGroupBreakdownPerClass
} from '../src/stats.js';

describe('New Class Lists & Grouping Feature Tests', () => {
  it('extracts clean class name from file name', () => {
    expect(extractClassNameFromFileName('Year 11 SP1.xlsx')).toBe('11 Sp1');
    expect(extractClassNameFromFileName('Year 11 SP2.csv')).toBe('11 Sp2');
    expect(extractClassNameFromFileName('11A.xlsx')).toBe('11 A');
    expect(extractClassNameFromFileName('Class 10_Set_1.xlsx')).toBe('10 Set 1');
  });

  it('treats a class-list SEN Y as agreeing with a specific snapshot SEN status', () => {
    const snapshot = parseSnapshotSpreadsheet([
      ['Surname', 'First Name', 'Admission No', 'Class', 'SEN'],
      ['Fiction', 'Alex', 'X1', '10 A', 'SEN Support'],
      ['Fiction', 'Bea', 'X2', '10 A', 'EHCP'],
      ['Fiction', 'Cal', 'X3', '10 A', 'No SEN']
    ]).records;
    const classStudents = parseClassListFile([
      ['Surname', 'First Name', 'Admission No', 'SEN'],
      ['Fiction', 'Alex', 'X1', 'Y'],
      ['Fiction', 'Bea', 'X2', 'Y'],
      ['Fiction', 'Cal', 'X3', 'Y']
    ], 'Year 11 A.csv').students;

    const result = mergeClassListsIntoSnapshot(snapshot, classStudents);
    expect(result.matchedCount).toBe(3);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].studentName).toContain('Cal');
    expect(result.conflicts[0].type).toBe('SEN Status');
  });

  it('does not invent status conflicts when class lists omit status columns', () => {
    const snapshot = parseSnapshotSpreadsheet([
      ['Surname', 'First Name', 'Admission No', 'Class', 'SEN', 'Disadvantaged'],
      ['Fiction', 'Dee', 'X4', '10 B', 'SEN Support', 'Yes']
    ]).records;
    const classStudents = parseClassListFile([
      ['Surname', 'First Name', 'Admission No'],
      ['Fiction', 'Dee', 'X4']
    ], 'Year 11 B.csv').students;

    expect(mergeClassListsIntoSnapshot(snapshot, classStudents).conflicts).toHaveLength(0);
  });

  it('matches students with invented data: 3 snapshot students, 2 class files, 1 only in snapshot, 1 only in class list, 1 name with trailing space', () => {
    // 1. Snapshot with 3 students:
    // - Student 1: John Smith with trailing space, in 10A
    // - Student 2: Alice Jones in 10B (only in snapshot!)
    // - Student 3: Charlie Brown in 10A (no adm number, matched by name key)
    const snapshotMatrix = [
      ['Mock Assessment Snapshot - Year 10 - June 2026'],
      ['Surname', 'First Name', 'Admission No', 'Class', 'Result', 'Points', 'Estimate', 'Progress', 'SEN', 'Pupil Premium', 'Sex'],
      ['Smith ', 'John', '1001', '10A', '6', '6', '5.5', '0.50', 'No SEN', 'No', 'M'],
      ['Jones', 'Alice', '1002', '10B', '4', '4', '4.2', '-0.20', 'SEN Support', 'Yes', 'F'],
      ['Brown', 'Charlie ', '', '10A', '7', '7', '5.8', '1.20', 'No SEN', 'No', 'M']
    ];

    const snapshotResult = parseSnapshotSpreadsheet(snapshotMatrix, 'Year10_Snapshot.xlsx');
    expect(snapshotResult.records.length).toBe(3);

    // 2. Class File 1 ("Year 11 SP1.xlsx"):
    // Contains John Smith (matched by adm number 1001) and Emily Taylor (only in class list!)
    const class1Matrix = [
      ['Surname', 'First Name', 'Admission Number', 'Tutor Group', 'Sex', 'SEN', 'Pupil Premium', 'EAL'],
      ['Smith', 'John', '1001', '11S', 'M', 'No SEN', 'No', 'Yes'],
      ['Taylor', 'Emily', '1004', '11S', 'F', 'No SEN', 'No', 'No']
    ];
    const class1Parsed = parseClassListFile(class1Matrix, 'Year 11 SP1.xlsx');
    expect(class1Parsed.defaultClassName).toBe('11 Sp1');
    expect(class1Parsed.students.length).toBe(2);

    // 2. Class File 2 ("Year 11 SP2.xlsx"):
    // Contains Charlie Brown (no adm no, matched by name key, with SEN conflict: EHCP vs No SEN)
    const class2Matrix = [
      ['Surname', 'First Name', 'Admission No', 'Tutor Group', 'Sex', 'SEN', 'Pupil Premium', 'EAL'],
      ['Brown  ', ' Charlie', '', '11P', 'M', 'EHCP', 'No', 'No']
    ];
    const class2Parsed = parseClassListFile(class2Matrix, 'Year 11 SP2.xlsx');
    expect(class2Parsed.defaultClassName).toBe('11 Sp2');
    expect(class2Parsed.students.length).toBe(1);

    // Combine all class list students
    const allNewClassStudents = [
      ...class1Parsed.students,
      ...class2Parsed.students
    ];
    expect(allNewClassStudents.length).toBe(3);

    // Merge class lists into snapshot
    const mergeResult = mergeClassListsIntoSnapshot(snapshotResult.records, allNewClassStudents);

    // Verify Matching Counts
    expect(mergeResult.matchedCount).toBe(2); // John Smith & Charlie Brown

    // Verify "In new classes, no mock result"
    expect(mergeResult.inNewClassesNoMockResult.length).toBe(1);
    expect(mergeResult.inNewClassesNoMockResult[0].surname).toBe('Taylor');
    expect(mergeResult.inNewClassesNoMockResult[0].firstName).toBe('Emily');
    expect(mergeResult.inNewClassesNoMockResult[0].newClassName).toBe('11 Sp1');
    expect(mergeResult.inNewClassesNoMockResult[0].hasMockResult).toBe(false);

    // Verify "In the snapshot, not in any new class"
    expect(mergeResult.inSnapshotNotInNewClass.length).toBe(1);
    expect(mergeResult.inSnapshotNotInNewClass[0].surname).toBe('Jones');
    expect(mergeResult.inSnapshotNotInNewClass[0].firstName).toBe('Alice');
    expect(mergeResult.inSnapshotNotInNewClass[0].className).toBe('10 B');
    expect(mergeResult.inSnapshotNotInNewClass[0].hasNewClass).toBe(false);

    // Verify merge attached new class and EAL
    const smith = snapshotResult.records.find(r => r.studentKey === '1001');
    expect(smith.newClassName).toBe('11 Sp1');
    expect(smith.eal).toBe('Yes');

    const brown = snapshotResult.records.find(r => r.surname === 'Brown');
    expect(brown.newClassName).toBe('11 Sp2');
    expect(brown.eal).toBe('No');

    // Verify status conflict rule: keep snapshot value and record conflict
    expect(brown.sen).toBe('No SEN'); // Snapshot value kept!
    expect(mergeResult.conflicts.length).toBe(1);
    expect(mergeResult.conflicts[0].studentName).toContain('Brown');
    expect(mergeResult.conflicts[0].type).toBe('SEN Status');
    expect(mergeResult.conflicts[0].snapshotValue).toBe('No SEN');
    expect(mergeResult.conflicts[0].classListValue).toBe('EHCP');

    // Test Grouping Switch: Current classes vs New classes
    // In Current classes (10 A, 10 B):
    const currentClassBreakdown = calculateClassBreakdown(snapshotResult.records);
    expect(currentClassBreakdown.length).toBe(2);
    const class10A = currentClassBreakdown.find(c => c.className === '10 A');
    expect(class10A.students).toBe(2); // Smith and Brown

    // In New classes (11 Sp1, 11 Sp2):
    // Form active records for New classes (matched snapshot + newClassOnly)
    const newClassActiveRecords = [
      ...snapshotResult.records.filter(r => r.hasNewClass).map(r => ({
        ...r,
        activeClass: r.newClassName,
        className: r.newClassName
      })),
      ...mergeResult.inNewClassesNoMockResult.map(r => ({
        ...r,
        activeClass: r.newClassName,
        className: r.newClassName
      }))
    ];

    expect(newClassActiveRecords.length).toBe(3); // Smith (11 Sp1), Taylor (11 Sp1), Brown (11 Sp2)

    const newClassBreakdown = calculateClassBreakdown(newClassActiveRecords);
    const class11Sp1 = newClassBreakdown.find(c => c.className === '11 Sp1');
    expect(class11Sp1).toBeDefined();
    // Class size is 2 (Smith + Taylor)
    expect(class11Sp1.students).toBe(2);
    // Grade stats only count students with mock results!
    expect(class11Sp1.satCount).toBe(1);
    expect(class11Sp1.averageGrade).toBe(6.00); // John Smith's grade 6
    expect(class11Sp1.pct5Plus).toBe(100.0);

    const class11Sp2 = newClassBreakdown.find(c => c.className === '11 Sp2');
    expect(class11Sp2.students).toBe(1); // Charlie Brown
    expect(class11Sp2.satCount).toBe(1);
    expect(class11Sp2.averageGrade).toBe(7.00);

    // Verify Student Groups breakdown includes EAL when class lists are loaded
    const groupsWithEAL = calculateStudentGroupsBreakdown(newClassActiveRecords, newClassActiveRecords, { includeEAL: true });
    const ealCategory = groupsWithEAL.find(c => c.category === 'EAL');
    expect(ealCategory).toBeDefined();
    expect(ealCategory.groups.length).toBe(2);
    const ealYes = ealCategory.groups.find(g => g.name === 'EAL');
    expect(ealYes.studentsCount).toBe(1); // Smith
    expect(ealYes.averageGrade).toBe(6.00);
  });
});
