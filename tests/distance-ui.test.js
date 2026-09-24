import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { renderFarthestFromGrade5 } from '../src/app.js';
import {
  DISTANCE_BANDS,
  calculateStudentGap,
  calculateDistanceBand,
  calculateDistanceMetrics,
  calculateDistanceBreakdownByClass,
  filterDistanceRecords,
  getFarthestFromGrade5,
  getFarthestFromGrade5ByClass,
  getClosestToGrade5ByClass,
  getEstimate5PlusShortfall
} from '../src/stats.js';

describe('Distance from grade 5 UI and Template Structure', () => {
  const templateHtml = fs.readFileSync(path.resolve(__dirname, '../src/template.html'), 'utf-8');

  const mockRecords = [
    {
      id: 1,
      surname: 'Smith',
      firstName: 'John',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      result: '4',
      points: 4,
      estimate: 5.5,
      progress: -1.5,
      sen: 'No SEN',
      disadvantaged: 'No',
      attendance: '95%'
    },
    {
      id: 2,
      surname: 'Khan',
      firstName: 'Aisha',
      className: '10 Sp1',
      rawClass: '10/Sp1 (25/26)',
      result: '5',
      points: 5,
      estimate: 4.6,
      progress: 0.4,
      sen: 'No SEN',
      disadvantaged: 'No',
      attendance: '98%'
    },
    {
      id: 3,
      surname: 'Doyle',
      firstName: 'Ben',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      result: 'U',
      points: 0,
      estimate: null,
      progress: null,
      sen: 'SEN Support',
      disadvantaged: 'Yes',
      attendance: '85%'
    },
    {
      id: 4,
      surname: 'Patel',
      firstName: 'Dev',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      result: '3',
      points: 3,
      estimate: 6.0,
      progress: -3.0,
      sen: 'EHCP',
      disadvantaged: 'Yes',
      attendance: '91%'
    },
    {
      id: 5,
      surname: 'Taylor',
      firstName: 'Chloe',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      result: '4',
      points: 4,
      estimate: 4.2,
      progress: -0.2,
      sen: 'No SEN',
      disadvantaged: 'No',
      attendance: '96%'
    },
    {
      id: 6,
      surname: 'Miller',
      firstName: 'Sam',
      className: '10 Sp2',
      rawClass: '10/Sp2 (25/26)',
      result: 'Not sat',
      points: null,
      isNotSat: true,
      estimate: 5.0,
      progress: null,
      sen: 'No SEN',
      disadvantaged: 'No',
      attendance: '75%'
    }
  ];

  it('verifies that template.html contains all required Distance from Grade 5 DOM elements', () => {
    // Check main section ID
    expect(templateHtml).toContain('id="section-distance-grade-5"');

    // Check filter controls
    expect(templateHtml).toContain('id="dist-filter-class"');
    expect(templateHtml).toContain('id="dist-filter-sen"');
    expect(templateHtml).toContain('id="dist-filter-disadvantaged"');
    expect(templateHtml).toContain('id="dist-filter-band"');
    expect(templateHtml).toContain('id="btn-dist-reset-filters"');
    expect(templateHtml).toContain('id="dist-filter-count-badge"');

    // Check Component 1: Distance by class table
    expect(templateHtml).toContain('id="table-distance-by-class"');
    expect(templateHtml).toContain('id="tbody-distance-by-class"');

    // Check Component 2: Farthest from grade 5
    expect(templateHtml).toContain('id="table-farthest"');
    expect(templateHtml).toContain('id="tbody-farthest"');

    // Check Component 3: Closest to grade 5
    expect(templateHtml).toContain('id="closest-classes-container"');

    // Check Component 4: Estimate says 5+, result below 5
    expect(templateHtml).toContain('id="table-estimate-shortfall"');
    expect(templateHtml).toContain('id="tbody-estimate-shortfall"');

    // Check quick toggle for hide names in action toolbar
    expect(templateHtml).toContain('id="btn-quick-toggle-hide-names"');
  });

  it('correctly calculates class breakdowns and highlights class with highest average gap', () => {
    const breakdown = calculateDistanceBreakdownByClass(mockRecords);

    expect(breakdown.classes.length).toBe(2);

    // 10 Sp1 has 2 sat students: John (gap 1), Aisha (gap 0).
    // Average gap for students below 5 = 1.0 (n=1)
    const sp1 = breakdown.classes.find(c => c.className === '10 Sp1');
    expect(sp1.satCount).toBe(2);
    expect(sp1.countAtOrAbove5).toBe(1);
    expect(sp1.countOneAway).toBe(1);
    expect(sp1.below5Count).toBe(1);
    expect(sp1.averageGapBelow5).toBe(1.0);
    expect(sp1.isHighestAvgGap).toBe(false);

    // 10 Sp2 has 3 sat students: Ben (U, gap 5), Dev (3, gap 2), Chloe (4, gap 1).
    // Sam did not sit (excluded).
    // Average gap for students below 5 = (5 + 2 + 1) / 3 = 2.67 (n=3)
    const sp2 = breakdown.classes.find(c => c.className === '10 Sp2');
    expect(sp2.satCount).toBe(3);
    expect(sp2.countAtOrAbove5).toBe(0);
    expect(sp2.countOneAway).toBe(1); // Chloe
    expect(sp2.countTwoAway).toBe(1); // Dev
    expect(sp2.countThreeOrMoreAway).toBe(1); // Ben
    expect(sp2.below5Count).toBe(3);
    expect(sp2.averageGapBelow5).toBeCloseTo(2.67, 1);
    expect(sp2.isHighestAvgGap).toBe(true);

    // Cohort totals:
    // Sat count = 5. Below 5 count = 4. Average gap = (1 + 5 + 2 + 1) / 4 = 2.25
    expect(breakdown.cohort.satCount).toBe(5);
    expect(breakdown.cohort.below5Count).toBe(4);
    expect(breakdown.cohort.averageGapBelow5).toBe(2.25);
  });

  it('correctly filters distance records across multiple criteria', () => {
    // 1. Filter by Class
    const classFiltered = filterDistanceRecords(mockRecords, { className: '10 Sp1' });
    expect(classFiltered.length).toBe(2);

    // 2. Filter by SEN
    const senFiltered = filterDistanceRecords(mockRecords, { sen: 'SEN Support' });
    expect(senFiltered.length).toBe(1);
    expect(senFiltered[0].surname).toBe('Doyle');

    // 3. Filter by Disadvantaged
    const disadvFiltered = filterDistanceRecords(mockRecords, { disadvantaged: 'Yes' });
    expect(disadvFiltered.length).toBe(2); // Doyle, Patel

    // 4. Filter by Band
    const bandOneAway = filterDistanceRecords(mockRecords, { band: 'one_grade_away' });
    expect(bandOneAway.length).toBe(2); // Smith, Taylor

    const bandThreeOrMore = filterDistanceRecords(mockRecords, { band: 'three_or_more_away' });
    expect(bandThreeOrMore.length).toBe(1); // Doyle (gap 5)
  });

  it('correctly orders students for Farthest from Grade 5 (largest gap first)', () => {
    const farthest = getFarthestFromGrade5(mockRecords);

    // Excludes Sam (Not sat).
    // Gaps: Doyle (gap 5), Patel (gap 2), Smith (gap 1), Taylor (gap 1), Khan (gap 0)
    expect(farthest.length).toBe(5);
    expect(farthest[0].surname).toBe('Doyle');
    expect(farthest[0].gap).toBe(5);
    expect(farthest[1].surname).toBe('Patel');
    expect(farthest[1].gap).toBe(2);
  });

  it('groups all students two or more grades away by class and keeps empty classes', () => {
    const groups = getFarthestFromGrade5ByClass(mockRecords);
    expect(groups.map(group => group.className)).toEqual(['10 Sp1', '10 Sp2']);
    expect(groups[0].students).toEqual([]);
    expect(groups[1].students.map(student => student.surname)).toEqual(['Doyle', 'Patel']);
    expect(groups[1].students.map(student => student.gap)).toEqual([5, 2]);
  });

  it('offers a class toggle and a grouped screen and print view', () => {
    expect(templateHtml).toContain('id="btn-group-farthest"');
    expect(templateHtml).toContain('aria-pressed="false">Group by class');
    expect(templateHtml).toContain('id="farthest-by-class"');
    expect(templateHtml).toContain('id="farthest-cohort-table"');

    const elements = Object.fromEntries([
      'tbody-farthest', 'farthest-count-badge', 'farthest-cohort-table',
      'farthest-by-class', 'btn-group-farthest'
    ].map(id => [id, { innerHTML: '', style: {}, setAttribute(key, value) { this[key] = value; } }]));
    const originalDocument = globalThis.document;
    globalThis.document = { getElementById: id => elements[id] || null };
    try {
      renderFarthestFromGrade5(mockRecords, false);
      expect(elements['farthest-cohort-table'].style.display).toBe('block');
      expect(elements['farthest-by-class'].style.display).toBe('none');
      renderFarthestFromGrade5(mockRecords, true);
      const groupedHtml = elements['farthest-by-class'].innerHTML;
      expect(elements['farthest-cohort-table'].style.display).toBe('none');
      expect(elements['farthest-by-class'].style.display).toBe('block');
      expect(elements['btn-group-farthest']['aria-pressed']).toBe('true');
      expect(groupedHtml).toContain('No students two or more grades from grade 5.');
      expect(groupedHtml.indexOf('Doyle, Ben')).toBeLessThan(groupedHtml.indexOf('Patel, Dev'));
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('correctly groups Closest to Grade 5 (all Grade 4 students, by class)', () => {
    const closest = getClosestToGrade5ByClass(mockRecords);

    expect(Object.keys(closest).sort()).toEqual(['10 Sp1', '10 Sp2']);
    expect(closest['10 Sp1'].length).toBe(1);
    expect(closest['10 Sp1'][0].surname).toBe('Smith');
    expect(closest['10 Sp1'][0].result).toBe('4');

    expect(closest['10 Sp2'].length).toBe(1);
    expect(closest['10 Sp2'][0].surname).toBe('Taylor');
    expect(closest['10 Sp2'][0].result).toBe('4');
  });

  it('correctly identifies students whose estimate is 5+ but result is below 5, sorted by shortfall', () => {
    const shortfalls = getEstimate5PlusShortfall(mockRecords);

    // Dev Patel: estimate 6.0, result 3 -> shortfall 3.0
    // John Smith: estimate 5.5, result 4 -> shortfall 1.5
    // Aisha Khan: result 5 (not below 5)
    // Chloe Taylor: estimate 4.2 (< 5.0)
    // Ben Doyle: estimate null
    // Sam Miller: not sat
    expect(shortfalls.length).toBe(2);
    expect(shortfalls[0].surname).toBe('Patel');
    expect(shortfalls[0].shortfall).toBe(3.0);
    expect(shortfalls[1].surname).toBe('Smith');
    expect(shortfalls[1].shortfall).toBe(1.5);
  });
});
