import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_MOVEMENT_THRESHOLDS,
  calculateMovementMatrix,
  calculateNewClassProfiles,
  calculateBalanceFlags,
  compareClassNames
} from '../src/movementStats.js';
import { getDisplayStudentName } from '../src/app.js';

describe('Movement & Class Balance UI & DOM Structure', () => {
  const templateHtml = fs.readFileSync(path.resolve(__dirname, '../src/template.html'), 'utf-8');

  it('1. Section exists in template.html and is placed after Student Groups and before QLA Insights', () => {
    expect(templateHtml).toContain('id="section-movement-balance"');
    expect(templateHtml).toContain('Movement and class balance');

    const studentGroupsIdx = templateHtml.indexOf('id="section-student-groups"');
    const movementBalanceIdx = templateHtml.indexOf('id="section-movement-balance"');
    const qlaInsightsIdx = templateHtml.indexOf('id="section-qla-insights"');

    expect(studentGroupsIdx).toBeGreaterThan(-1);
    expect(movementBalanceIdx).toBeGreaterThan(studentGroupsIdx);
    expect(qlaInsightsIdx).toBeGreaterThan(movementBalanceIdx);
  });

  it('2. Contains the Movement Matrix container and cell drilldown drawer', () => {
    expect(templateHtml).toContain('class="movement-matrix-scroll-container"');
    expect(templateHtml).toContain('id="movement-matrix-container"');
    expect(templateHtml).toContain('id="movement-cell-drilldown-drawer"');
  });

  it('3. Contains the New Class Profile table and sortable column headers', () => {
    expect(templateHtml).toContain('id="new-class-profile-table"');
    expect(templateHtml).toContain('id="new-class-profile-tbody"');
    expect(templateHtml).toContain('id="new-class-profile-tfoot"');
    expect(templateHtml).toContain('data-sort="className"');
    expect(templateHtml).toContain('data-sort="totalStudents"');
    expect(templateHtml).toContain('data-sort="studentsWithResults"');
    expect(templateHtml).toContain('data-sort="averageGrade"');
    expect(templateHtml).toContain('data-sort="pctGrade5Plus"');
    expect(templateHtml).toContain('data-sort="pctSenSupport"');
    expect(templateHtml).toContain('data-sort="pctDisadvantaged"');
    expect(templateHtml).toContain('data-sort="pctEAL"');
  });

  it('4. Contains the Balance Flags panel with count badge and list container', () => {
    expect(templateHtml).toContain('id="movement-balance-flags-list"');
    expect(templateHtml).toContain('id="movement-flags-count-badge"');
    expect(templateHtml).toContain('id="movement-classes-count-badge"');
  });

  it('5. Contains all 5 movement threshold settings in the settings modal', () => {
    expect(templateHtml).toContain('id="setting-movement-grade-gap"');
    expect(templateHtml).toContain('id="setting-movement-three-away"');
    expect(templateHtml).toContain('id="setting-movement-sen-gap"');
    expect(templateHtml).toContain('id="setting-movement-disadv-gap"');
    expect(templateHtml).toContain('id="setting-movement-no-mock-rate"');
  });
});

describe('Movement & Class Balance Drilldown & Privacy Rendering', () => {
  const mockStudent = {
    surname: 'Al-Mansoor',
    firstName: 'Tariq',
    className: '10 Sp1',
    newClassName: '11 Sp2',
    result: '4',
    displayResult: '4',
    sen: 'SEN Support',
    disadvantaged: 'Yes',
    eal: 'Yes'
  };

  it('formats student display name correctly when privacy mode is OFF', () => {
    const formatted = getDisplayStudentName(mockStudent, false, 1);
    expect(formatted).toBe('Al-Mansoor, Tariq');
  });

  it('formats student display name as Student N when privacy mode is ON', () => {
    const formatted = getDisplayStudentName(mockStudent, true, 42);
    expect(formatted).toBe('Student 42');
  });
});

describe('Movement & Class Balance Extreme Highlighting & Sort Logic', () => {
  const mockClassProfiles = [
    {
      className: '11 Sp1',
      totalStudents: 25,
      studentsWithResults: 24,
      averageGrade: 5.60,
      pctGrade5Plus: 72.0,
      pctSenSupport: 8.0,
      pctDisadvantaged: 20.0,
      pctEAL: 12.0,
      distanceBands: { atOrAbove5: 18, oneAway: 4, twoAway: 2, threeOrMoreAway: 0 },
      priorAttainment: { high: 15, middle: 8, low: 1, noKs2: 1 }
    },
    {
      className: '11 Sp2',
      totalStudents: 22,
      studentsWithResults: 20,
      averageGrade: 4.10,
      pctGrade5Plus: 45.0,
      pctSenSupport: 22.0,
      pctDisadvantaged: 35.0,
      pctEAL: 25.0,
      distanceBands: { atOrAbove5: 9, oneAway: 5, twoAway: 4, threeOrMoreAway: 2 },
      priorAttainment: { high: 5, middle: 12, low: 4, noKs2: 1 }
    },
    {
      className: '11 Sp3',
      totalStudents: 18,
      studentsWithResults: 15,
      averageGrade: 3.20,
      pctGrade5Plus: 20.0,
      pctSenSupport: 33.3,
      pctDisadvantaged: 55.0,
      pctEAL: 10.0,
      distanceBands: { atOrAbove5: 3, oneAway: 4, twoAway: 4, threeOrMoreAway: 4 },
      priorAttainment: { high: 1, middle: 7, low: 8, noKs2: 2 }
    }
  ];

  it('sorts profiles by class name, averageGrade, and totalStudents correctly', () => {
    const sortedByName = [...mockClassProfiles].sort((a, b) => compareClassNames(a.className, b.className));
    expect(sortedByName.map(c => c.className)).toEqual(['11 Sp1', '11 Sp2', '11 Sp3']);

    const sortedByAvgDesc = [...mockClassProfiles].sort((a, b) => b.averageGrade - a.averageGrade);
    expect(sortedByAvgDesc.map(c => c.className)).toEqual(['11 Sp1', '11 Sp2', '11 Sp3']);

    const sortedByAvgAsc = [...mockClassProfiles].sort((a, b) => a.averageGrade - b.averageGrade);
    expect(sortedByAvgAsc.map(c => c.className)).toEqual(['11 Sp3', '11 Sp2', '11 Sp1']);
  });

  it('computes highest and lowest extremes for highlight classes', () => {
    const keys = ['averageGrade', 'pctGrade5Plus', 'pctSenSupport', 'pctDisadvantaged'];
    const extremes = {};
    keys.forEach(k => {
      let max = -Infinity;
      let min = Infinity;
      mockClassProfiles.forEach(p => {
        const val = p[k];
        if (val !== null && val !== undefined) {
          if (val > max) max = val;
          if (val < min) min = val;
        }
      });
      extremes[k] = { max, min };
    });

    expect(extremes.averageGrade.max).toBe(5.60);
    expect(extremes.averageGrade.min).toBe(3.20);
    expect(extremes.pctSenSupport.max).toBe(33.3);
    expect(extremes.pctSenSupport.min).toBe(8.0);
  });
});
