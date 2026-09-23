import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  calculateGroupMetrics,
  calculateStudentGroupsBreakdown,
  calculateGroupBreakdownPerClass,
  getTopPerformersByClass,
  buildPseudonymMaps
} from '../src/stats.js';

describe('Student Groups and Top Performers UI & Integration Tests', () => {
  const templateHtml = fs.readFileSync(path.resolve(__dirname, '../src/template.html'), 'utf-8');

  const mockRecords = [
    // 10 Sp1 (6 students)
    {
      id: 1,
      surname: 'Adams',
      firstName: 'Alice',
      studentKey: '1001',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'F',
      result: '8',
      points: 8,
      estimate: 6.5,
      progress: 1.5,
      attainmentLevel: 'High',
      sen: 'No SEN',
      disadvantaged: 'No',
      attendance: '98%'
    },
    {
      id: 2,
      surname: 'Brown',
      firstName: 'Bob',
      studentKey: '1002',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'M',
      result: '5',
      points: 5,
      estimate: 4.8,
      progress: 0.2,
      attainmentLevel: 'Middle',
      sen: 'SEN Support',
      disadvantaged: 'Yes',
      attendance: '92%'
    },
    {
      id: 3,
      surname: 'Clark',
      firstName: 'Chloe',
      studentKey: '1003',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'F',
      result: '4',
      points: 4,
      estimate: 5.2,
      progress: -1.2,
      attainmentLevel: 'Middle',
      sen: 'No SEN',
      disadvantaged: 'Yes',
      attendance: '88%'
    },
    {
      id: 4,
      surname: 'Davis',
      firstName: 'Dan',
      studentKey: '1004',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'M',
      result: '3',
      points: 3,
      estimate: 3.5,
      progress: -0.5,
      attainmentLevel: 'Low',
      sen: 'No SEN',
      disadvantaged: 'No',
      attendance: '96%'
    },
    {
      id: 5,
      surname: 'Evans',
      firstName: 'Ella',
      studentKey: '1005',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'F',
      result: '2',
      points: 2,
      estimate: 3.0,
      progress: -1.0,
      attainmentLevel: 'Low',
      sen: 'EHCP',
      disadvantaged: 'Yes',
      attendance: '85%'
    },
    {
      id: 6,
      surname: 'Foster',
      firstName: 'Fin',
      studentKey: '1006',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      sex: 'M',
      result: '6',
      points: 6,
      estimate: null,
      progress: null,
      attainmentLevel: 'No KS2 data',
      sen: 'No SEN',
      disadvantaged: 'No',
      attendance: '91%'
    },

    // 10 Sp2 (4 students)
    {
      id: 7,
      surname: 'Green',
      firstName: 'Grace',
      studentKey: '1007',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      sex: 'F',
      result: '9',
      points: 9,
      estimate: 7.0,
      progress: 2.0,
      attainmentLevel: 'High',
      sen: 'No SEN',
      disadvantaged: 'No',
      attendance: '99%'
    },
    {
      id: 8,
      surname: 'Harris',
      firstName: 'Harry',
      studentKey: '1008',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      sex: 'M',
      result: '4',
      points: 4,
      estimate: 5.5,
      progress: -1.5,
      attainmentLevel: 'Middle',
      sen: 'SEN Support',
      disadvantaged: 'Yes',
      attendance: '89%'
    },
    {
      id: 9,
      surname: 'Iqbal',
      firstName: 'Imran',
      studentKey: '1009',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      sex: 'M',
      result: '7',
      points: 7,
      estimate: 5.0,
      progress: 2.0,
      attainmentLevel: 'Middle',
      sen: 'No SEN',
      disadvantaged: 'No',
      attendance: '94%'
    },
    {
      id: 10,
      surname: 'Jones',
      firstName: 'Jack',
      studentKey: '1010',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      sex: 'M',
      result: 'U',
      points: 0,
      estimate: 3.2,
      progress: -3.2,
      attainmentLevel: 'Low',
      sen: 'No SEN',
      disadvantaged: 'Yes',
      attendance: '93%'
    }
  ];

  it('verifies that template.html contains all required Student Groups and Top Performers DOM elements', () => {
    // Section container
    expect(templateHtml).toContain('id="section-student-groups"');

    // 1. Cohort summary table
    expect(templateHtml).toContain('id="table-cohort-student-groups"');
    expect(templateHtml).toContain('id="tbody-cohort-student-groups"');
    expect(templateHtml).toContain('id="cohort-groups-count-badge"');

    // 2. Class expandable breakdown
    expect(templateHtml).toContain('id="classes-group-accordion-container"');
    expect(templateHtml).toContain('id="btn-expand-all-classes"');
    expect(templateHtml).toContain('id="btn-collapse-all-classes"');

    // 3. Top Performers
    expect(templateHtml).toContain('id="top-performers-class-select"');
    expect(templateHtml).toContain('id="top-performers-content-container"');
  });

  it('cohort group breakdown includes all required groups and includes EHCP when present', () => {
    const breakdown = calculateStudentGroupsBreakdown(mockRecords, mockRecords);

    // Group categories
    const categoryTitles = breakdown.map(c => c.category);
    expect(categoryTitles).toContain('SEN Status');
    expect(categoryTitles).toContain('Disadvantage');
    expect(categoryTitles).toContain('Gender');
    expect(categoryTitles).toContain('Prior Attainment');
    expect(categoryTitles).toContain('Attendance Band');

    // Check EHCP presence (Ella Evans has EHCP)
    const senCat = breakdown.find(c => c.category === 'SEN Status');
    const groupNames = senCat.groups.map(g => g.name);
    expect(groupNames).toContain('SEN Support');
    expect(groupNames).toContain('No SEN');
    expect(groupNames).toContain('EHCP');

    // Check attendance bands
    const attCat = breakdown.find(c => c.category === 'Attendance Band');
    const attGroupNames = attCat.groups.map(g => g.name);
    expect(attGroupNames).toContain('Below 90%');
    expect(attGroupNames).toContain('90 to 95%');
    expect(attGroupNames).toContain('95% and above');

    // Check prior attainment
    const priorCat = breakdown.find(c => c.category === 'Prior Attainment');
    const priorGroupNames = priorCat.groups.map(g => g.name);
    expect(priorGroupNames).toContain('High');
    expect(priorGroupNames).toContain('Middle');
    expect(priorGroupNames).toContain('Low');
    expect(priorGroupNames).toContain('No KS2 data');
  });

  it('omits EHCP group when no student in cohort has EHCP', () => {
    const withoutEHCP = mockRecords.filter(r => r.sen !== 'EHCP');
    const breakdown = calculateStudentGroupsBreakdown(withoutEHCP, withoutEHCP);
    const senCat = breakdown.find(c => c.category === 'SEN Status');
    const groupNames = senCat.groups.map(g => g.name);
    expect(groupNames).toContain('SEN Support');
    expect(groupNames).toContain('No SEN');
    expect(groupNames).not.toContain('EHCP');
  });

  it('calculates class breakdowns and enforces "too few to compare" constraint for < 5 students', () => {
    const classBreakdown = calculateGroupBreakdownPerClass(mockRecords);
    expect(classBreakdown).toHaveLength(2); // 10 Sp1 and 10 Sp2

    const sp1 = classBreakdown.find(c => c.className === '10 Sp1');
    expect(sp1).toBeDefined();
    expect(sp1.studentsCount).toBe(6);

    const senCat = sp1.breakdown.find(b => b.category === 'SEN Status');
    const senSupportGroup = senCat.groups.find(g => g.name === 'SEN Support');
    expect(senSupportGroup.studentsCount).toBe(1); // Bob
    // Must flag tooFew true for < 5 students
    expect(senSupportGroup.tooFew).toBe(true);

    const disadvCat = sp1.breakdown.find(b => b.category === 'Disadvantage');
    const disadvYes = disadvCat.groups.find(g => g.name === 'Disadvantaged');
    expect(disadvYes.studentsCount).toBe(3); // Bob, Chloe, Ella
    expect(disadvYes.tooFew).toBe(true);
  });

  it('calculates top performers correctly with points, progress tie-breaker and positive/negative progress', () => {
    const topPerformers = getTopPerformersByClass(mockRecords);

    // 10 Sp1 checks:
    // Students in 10 Sp1:
    // Adams Alice (points: 8, prog: 1.5)
    // Foster Fin (points: 6, prog: null)
    // Brown Bob (points: 5, prog: 0.2)
    // Clark Chloe (points: 4, prog: -1.2)
    // Davis Dan (points: 3, prog: -0.5)
    // Evans Ella (points: 2, prog: -1.0)
    const sp1Data = topPerformers['10 Sp1'];
    expect(sp1Data).toBeDefined();
    expect(sp1Data.topPoints).toHaveLength(5);
    expect(sp1Data.topPoints[0].surname).toBe('Adams');
    expect(sp1Data.topPoints[1].surname).toBe('Foster');
    expect(sp1Data.topPoints[2].surname).toBe('Brown');
    expect(sp1Data.topPoints[3].surname).toBe('Clark');
    expect(sp1Data.topPoints[4].surname).toBe('Davis');

    // Positive progress in 10 Sp1:
    // Alice (+1.5), Bob (+0.2)
    expect(sp1Data.positiveProgress).toHaveLength(2);
    expect(sp1Data.positiveProgress[0].surname).toBe('Adams');
    expect(sp1Data.positiveProgress[0].progress).toBe(1.5);
    expect(sp1Data.positiveProgress[1].surname).toBe('Brown');
    expect(sp1Data.positiveProgress[1].progress).toBe(0.2);

    // Negative progress in 10 Sp1 (sorted largest negative first):
    // Chloe (-1.2), Ella (-1.0), Dan (-0.5)
    expect(sp1Data.negativeProgress).toHaveLength(3);
    expect(sp1Data.negativeProgress[0].surname).toBe('Clark');
    expect(sp1Data.negativeProgress[0].progress).toBe(-1.2);
    expect(sp1Data.negativeProgress[1].surname).toBe('Evans');
    expect(sp1Data.negativeProgress[1].progress).toBe(-1.0);
    expect(sp1Data.negativeProgress[2].surname).toBe('Davis');
    expect(sp1Data.negativeProgress[2].progress).toBe(-0.5);

    // 10 Sp2 checks:
    // Green Grace (9, +2.0)
    // Iqbal Imran (7, +2.0)
    // Harris Harry (4, -1.5)
    // Jones Jack (0, -3.2)
    const sp2Data = topPerformers['10 Sp2'];
    expect(sp2Data.topPoints).toHaveLength(4);
    expect(sp2Data.topPoints[0].surname).toBe('Green');
    expect(sp2Data.positiveProgress).toHaveLength(2); // Grace (+2.0), Imran (+2.0)
    expect(sp2Data.negativeProgress).toHaveLength(2); // Jack (-3.2), Harry (-1.5)
    expect(sp2Data.negativeProgress[0].surname).toBe('Jones');
    expect(sp2Data.negativeProgress[1].surname).toBe('Harris');
  });

  it('respects privacy pseudonym maps for student names when hide names is active', () => {
    const pseudoMaps = buildPseudonymMaps(mockRecords);
    expect(pseudoMaps.studentMap).toBeDefined();

    // Check that every student has a privacy pseudonym
    mockRecords.forEach(s => {
      const key = `${s.surname} ${s.firstName}`.toLowerCase();
      expect(pseudoMaps.studentMap.has(key)).toBe(true);
      const pseudo = pseudoMaps.studentMap.get(key);
      expect(pseudo).toMatch(/^Student \d+$/);
    });
  });
});
