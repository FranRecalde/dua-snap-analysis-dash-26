import { describe, it, expect } from 'vitest';
import {
  cleanText,
  matchColumn,
  detectHeaderRow,
  cleanAttainmentLevel,
  cleanSEN,
  cleanDisadvantaged,
  formatClass,
  buildNameKey,
  getStudentKey,
  parseSnapshotSpreadsheet,
  COLUMN_DEFINITIONS
} from '../src/parser.js';

describe('Class Snapshot Parser & Data Cleaner', () => {

  describe('Rule 1: Trim all text and collapse double spaces', () => {
    it('trims leading/trailing whitespace and collapses internal multiple spaces', () => {
      expect(cleanText('   Aisha    Khan   ')).toBe('Aisha Khan');
      expect(cleanText('10 / Sp1    (25/26)')).toBe('10 / Sp1 (25/26)');
      expect(cleanText(null)).toBe('');
      expect(cleanText(undefined)).toBe('');
      expect(cleanText('Single')).toBe('Single');
    });
  });

  describe('Keyword Column Matching (Case Insensitive & Trimmed)', () => {
    it('matches all specified aliases for Surname', () => {
      expect(matchColumn('Last Name')).toBe('surname');
      expect(matchColumn('Surname')).toBe('surname');
      expect(matchColumn('Legal Surname')).toBe('surname');
      expect(matchColumn('  legal surname  ')).toBe('surname');
    });

    it('matches all specified aliases for First Name', () => {
      expect(matchColumn('First Name')).toBe('firstName');
      expect(matchColumn('Forename')).toBe('firstName');
      expect(matchColumn('FORENAME')).toBe('firstName');
    });

    it('matches Admission number aliases', () => {
      expect(matchColumn('Admission Number')).toBe('admissionNumber');
      expect(matchColumn('Adm No')).toBe('admissionNumber');
      expect(matchColumn('AdNo')).toBe('admissionNumber');
      expect(matchColumn('adno')).toBe('admissionNumber');
    });

    it('matches Year group aliases', () => {
      expect(matchColumn('Year Group')).toBe('yearGroup');
      expect(matchColumn('Year')).toBe('yearGroup');
    });

    it('matches Tutor group aliases', () => {
      expect(matchColumn('Tutor Group')).toBe('tutorGroup');
      expect(matchColumn('Form')).toBe('tutorGroup');
      expect(matchColumn('Reg Group')).toBe('tutorGroup');
    });

    it('matches Sex / Gender aliases', () => {
      expect(matchColumn('Sex')).toBe('sex');
      expect(matchColumn('Gender')).toBe('sex');
    });

    it('matches Attendance aliases', () => {
      expect(matchColumn('Att. %')).toBe('attendance');
      expect(matchColumn('Att %')).toBe('attendance');
      expect(matchColumn('attendance')).toBe('attendance');
    });

    it('matches Disadvantaged aliases', () => {
      expect(matchColumn('Disadvantaged')).toBe('disadvantaged');
      expect(matchColumn('Pupil Premium')).toBe('disadvantaged');
      expect(matchColumn('PP')).toBe('disadvantaged');
    });

    it('matches SEN aliases', () => {
      expect(matchColumn('SEN Status')).toBe('sen');
      expect(matchColumn('SEN')).toBe('sen');
    });

    it('matches KS2 band aliases', () => {
      expect(matchColumn('KS2 PAG Band')).toBe('ks2Band');
      expect(matchColumn('ks2 band')).toBe('ks2Band');
    });

    it('matches Scaled score aliases', () => {
      expect(matchColumn('Ave Scaled Score')).toBe('scaledScore');
      expect(matchColumn('Scaled Score')).toBe('scaledScore');
    });

    it('matches Attainment level aliases', () => {
      expect(matchColumn('Attainment Level')).toBe('attainmentLevel');
      expect(matchColumn('Prior Attainment')).toBe('attainmentLevel');
    });

    it('matches Subject, Class, Result, Points, Estimate, Progress', () => {
      expect(matchColumn('Subject')).toBe('subject');
      expect(matchColumn('Class')).toBe('className');
      expect(matchColumn('Teaching Group')).toBe('className');
      expect(matchColumn('Set')).toBe('className');
      expect(matchColumn('Result')).toBe('result');
      expect(matchColumn('Grade')).toBe('result');
      expect(matchColumn('Points')).toBe('points');
      expect(matchColumn('Estimate')).toBe('estimate');
      expect(matchColumn('Progress')).toBe('progress');
    });

    it('returns null for unrecognized columns', () => {
      expect(matchColumn('Candidate Number')).toBeNull();
      expect(matchColumn('Internal Note')).toBeNull();
      expect(matchColumn('Random Custom Header')).toBeNull();
    });
  });

  describe('Header Detection & Title Line Scanning', () => {
    it('scans first 10 rows and finds header row when title line sits above', () => {
      const rows = [
        ['Dixons Unity Academy - Year 11 Spanish Mock November 2025'],
        ['Confidential Data'],
        ['Admission Number', 'Legal Surname', 'Forename', 'Class', 'Result', 'Points', 'Estimate', 'Progress'],
        ['1001', 'Khan', 'Aisha', '10/Sp1 (25/26)', '5', '5', '4.6', '0.4']
      ];

      const detected = detectHeaderRow(rows);
      expect(detected.headerRowIndex).toBe(2);
      expect(detected.snapshotName).toBe('Dixons Unity Academy - Year 11 Spanish Mock November 2025 | Confidential Data');
    });

    it('works when headers are on the very first row', () => {
      const rows = [
        ['Surname', 'First Name', 'Class', 'Result'],
        ['Khan', 'Aisha', '10/Sp1 (25/26)', '5']
      ];

      const detected = detectHeaderRow(rows);
      expect(detected.headerRowIndex).toBe(0);
      expect(detected.snapshotName).toBe('');
    });

    it('throws an error if no header row has both surname and first name', () => {
      const rows = [
        ['Class', 'Result', 'Estimate'],
        ['10A', '5', '4.5']
      ];

      expect(() => detectHeaderRow(rows)).toThrow(/Could not find a valid header row containing both/);
    });
  });

  describe('Rule 4: Attainment Level Cleaning', () => {
    it('normalises H, M, L, and N/blank', () => {
      expect(cleanAttainmentLevel('H')).toBe('High');
      expect(cleanAttainmentLevel('h')).toBe('High');
      expect(cleanAttainmentLevel('High')).toBe('High');
      expect(cleanAttainmentLevel('M')).toBe('Middle');
      expect(cleanAttainmentLevel('m')).toBe('Middle');
      expect(cleanAttainmentLevel('L')).toBe('Low');
      expect(cleanAttainmentLevel('l')).toBe('Low');
      expect(cleanAttainmentLevel('N')).toBe('No KS2 data');
      expect(cleanAttainmentLevel('')).toBe('No KS2 data');
      expect(cleanAttainmentLevel(null)).toBe('No KS2 data');
    });
  });

  describe('Rule 5: SEN Cleaning', () => {
    it('normalises K, E, and N/blank', () => {
      expect(cleanSEN('K')).toBe('SEN Support');
      expect(cleanSEN('k')).toBe('SEN Support');
      expect(cleanSEN('SEN Support')).toBe('SEN Support');
      expect(cleanSEN('E')).toBe('EHCP');
      expect(cleanSEN('e')).toBe('EHCP');
      expect(cleanSEN('N')).toBe('No SEN');
      expect(cleanSEN('n')).toBe('No SEN');
      expect(cleanSEN('')).toBe('No SEN');
      expect(cleanSEN(null)).toBe('No SEN');
    });
  });

  describe('Rule 6: Disadvantaged Cleaning', () => {
    it('normalises Yes/Y/True as Yes, everything else as No', () => {
      expect(cleanDisadvantaged('Yes')).toBe('Yes');
      expect(cleanDisadvantaged('yes')).toBe('Yes');
      expect(cleanDisadvantaged('Y')).toBe('Yes');
      expect(cleanDisadvantaged('y')).toBe('Yes');
      expect(cleanDisadvantaged('True')).toBe('Yes');
      expect(cleanDisadvantaged(true)).toBe('Yes');
      expect(cleanDisadvantaged('No')).toBe('No');
      expect(cleanDisadvantaged('N')).toBe('No');
      expect(cleanDisadvantaged('False')).toBe('No');
      expect(cleanDisadvantaged('')).toBe('No');
      expect(cleanDisadvantaged(null)).toBe('No');
    });
  });

  describe('Rule 7: Class Formatting & Tooltip', () => {
    it('formats "10/Sp1 (25/26)" as "10 Sp1" and keeps full label in tooltip', () => {
      const res = formatClass('10/Sp1 (25/26)', '10');
      expect(res.displayClass).toBe('10 Sp1');
      expect(res.fullLabel).toBe('10/Sp1 (25/26)');
    });

    it('formats "10/Sp2 (25/26)" as "10 Sp2"', () => {
      const res = formatClass('10/Sp2 (25/26)', '10');
      expect(res.displayClass).toBe('10 Sp2');
    });

    it('prefixes year when class name does not contain year', () => {
      const res = formatClass('Sp1 (25/26)', '10');
      expect(res.displayClass).toBe('10 Sp1');
      expect(res.fullLabel).toBe('Sp1 (25/26)');
    });

    it('handles year group with text like "Year 11"', () => {
      const res = formatClass('En2', 'Year 11');
      expect(res.displayClass).toBe('11 En2');
    });
  });

  describe('Rule 8: Student Key and Name Key', () => {
    it('builds name key with lowercase, trimmed, internal spaces collapsed, hyphens as spaces', () => {
      expect(buildNameKey('  Khan  ', '  Aisha  ')).toBe('khan aisha');
      expect(buildNameKey('Smith-Jones', 'Mary-Jane')).toBe('smith jones mary jane');
      expect(buildNameKey('De  La  Cruz', 'Carlos')).toBe('de la cruz carlos');
    });

    it('uses admission number as student key when present, else name key', () => {
      expect(getStudentKey('12345', 'Khan', 'Aisha')).toBe('12345');
      expect(getStudentKey('', 'Khan', 'Aisha')).toBe('khan aisha');
      expect(getStudentKey(null, 'Khan', 'Aisha')).toBe('khan aisha');
    });
  });

  describe('Full Parsing, Invented Test Data & Diagnostics', () => {
    it('correctly processes user invented examples for Aisha Khan and Ben Doyle', () => {
      const rawRows = [
        ['Dixons Unity Academy - Spanish Mock Examination Snapshot'],
        ['Adm No', 'Surname', 'First name', 'Class', 'Result', 'Points', 'Estimate', 'Progress', 'Custom Unmatched Col'],
        ['AD001', 'Khan', 'Aisha', '10/Sp1 (25/26)', '5', '5', '4.6', '0.4', 'Val1'],
        ['AD002', 'Doyle', 'Ben', '10/Sp2 (25/26)', 'U', '0', '0', '0', 'Val2'],
        ['AD003', 'Evans', 'Chloe', '10/Sp1 (25/26)', '', '', '5.0', '0.5', 'Val3'],
        ['AD001', 'Khan', 'Aisha', '10/Sp1 (25/26)', '5', '5', '4.6', '0.4', 'Val1'] // Duplicate student
      ];

      const parsed = parseSnapshotSpreadsheet(rawRows, 'spanish_mock.xlsx');

      expect(parsed.snapshotName).toBe('Dixons Unity Academy - Spanish Mock Examination Snapshot');
      expect(parsed.records.length).toBe(4);

      // Student 1: Aisha Khan
      const aisha = parsed.records[0];
      expect(aisha.surname).toBe('Khan');
      expect(aisha.firstName).toBe('Aisha');
      expect(aisha.className).toBe('10 Sp1');
      expect(aisha.rawClass).toBe('10/Sp1 (25/26)');
      expect(aisha.result).toBe('5');
      expect(aisha.points).toBe(5);
      expect(aisha.estimate).toBe(4.6);
      expect(aisha.progress).toBe(0.4);
      expect(aisha.isNotSat).toBe(false);
      expect(aisha.isEstimateMissing).toBe(false);

      // Student 2: Ben Doyle (Result U, Points 0, Estimate 0 -> missing, Progress 0 -> missing)
      const ben = parsed.records[1];
      expect(ben.surname).toBe('Doyle');
      expect(ben.firstName).toBe('Ben');
      expect(ben.className).toBe('10 Sp2');
      expect(ben.rawClass).toBe('10/Sp2 (25/26)');
      expect(ben.result).toBe('U');
      expect(ben.points).toBe(0);
      expect(ben.estimate).toBeNull(); // Missing!
      expect(ben.progress).toBeNull(); // Missing!
      expect(ben.isU).toBe(true);
      expect(ben.isEstimateMissing).toBe(true);

      // Student 3: Chloe Evans (Result blank -> not sat, excluded from points averages)
      const chloe = parsed.records[2];
      expect(chloe.result).toBe('Not sat');
      expect(chloe.points).toBeNull(); // Excluded from averages
      expect(chloe.isNotSat).toBe(true);
      expect(chloe.estimate).toBe(5.0);
      expect(chloe.progress).toBe(0.5);

      // Diagnostics check
      const diag = parsed.diagnostics;
      expect(diag.rowsRead).toBe(4);
      expect(diag.rowsKept).toBe(4);
      expect(diag.numberOfUGrades).toBe(1);
      expect(diag.numberNotSat).toBe(1);
      expect(diag.numberMissingEstimate).toBe(1);
      expect(diag.duplicateStudents).toBe(1);
      expect(diag.duplicateStudentsList[0].name).toBe('Khan, Aisha');

      // Check matched & unmatched columns
      const matchedFieldKeys = diag.matchedColumns.map(c => c.key);
      expect(matchedFieldKeys).toContain('admissionNumber');
      expect(matchedFieldKeys).toContain('surname');
      expect(matchedFieldKeys).toContain('firstName');
      expect(matchedFieldKeys).toContain('className');
      expect(matchedFieldKeys).toContain('result');
      expect(matchedFieldKeys).toContain('points');
      expect(matchedFieldKeys).toContain('estimate');
      expect(matchedFieldKeys).toContain('progress');

      expect(diag.unmatchedColumns.length).toBe(1);
      expect(diag.unmatchedColumns[0].header).toBe('Custom Unmatched Col');
    });
  });
});
