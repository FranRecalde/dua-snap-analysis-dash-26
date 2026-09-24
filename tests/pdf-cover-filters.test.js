import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeActiveFilters } from '../src/pdfExport.js';

describe('PDF cover filter text', () => {
  it('shows the grouping and no-filter message when no section filter is active', () => {
    expect(describeActiveFilters({
      grouping: 'current', selectedSections: { distance: true, groups: true },
      studentGroups: { topPerformersClass: '10 Sp1', classChosen: false }
    })).toEqual(['Grouping: Current classes (Year 10)', 'No filters applied']);
  });

  it('shows a live Distance class filter with its on-screen class label', () => {
    expect(describeActiveFilters({
      grouping: 'new', selectedSections: { distance: true },
      distance: { className: '11 Sp2', sen: 'SEN Support' }
    })).toEqual([
      'Grouping: New classes (Year 11)',
      'Distance from grade 5: class 11 Sp2, SEN Support only'
    ]);
  });

  it('reads changed filter state on a second export', () => {
    const liveState = {
      selectedSections: { distance: true },
      distance: { className: '10 Sp1' }
    };
    expect(describeActiveFilters(liveState)[1]).toBe('Distance from grade 5: class 10 Sp1');
    liveState.distance.className = '10 Sp3';
    expect(describeActiveFilters(liveState)[1]).toBe('Distance from grade 5: class 10 Sp3');
  });

  it('shows new-class grouping even with no section filters', () => {
    expect(describeActiveFilters({ grouping: 'new' })).toEqual([
      'Grouping: New classes (Year 11)', 'No filters applied'
    ]);
  });

  it('does not list a filter from an unticked section', () => {
    expect(describeActiveFilters({
      selectedSections: { distance: false, groups: true, qlaPapers: false },
      distance: { className: '10 Sp4' },
      qlaPapers: { tier: 'Higher' }
    })).toEqual(['Grouping: Current classes (Year 10)', 'No filters applied']);
  });

  it('describes each selected QLA and Student groups filter without student names', () => {
    const lines = describeActiveFilters({
      selectedSections: { groups: true, qlaPapers: true, qlaQuestions: true, qlaClasses: true, qlaStudents: true },
      studentGroups: { topPerformersClass: '10 Sp2', classChosen: true },
      qlaPapers: { tier: 'Foundation', disadvantaged: 'Yes' },
      qlaQuestions: { className: '10 Sp2', sen: 'ALL_SEN' },
      qlaClasses: { className: '10 Sp3' },
      qlaStudents: { weakestPaper: 'Listening F' },
      studentName: 'Rivera, Cara'
    });
    expect(lines).toContain('Student groups: top performers class 10 Sp2');
    expect(lines).toContain('QLA Papers and skills: Foundation tier, disadvantaged only');
    expect(lines).toContain('QLA Questions: class 10 Sp2, all SEN only');
    expect(lines).toContain('QLA Classes: class 10 Sp3');
    expect(lines).toContain('QLA Students: weakest paper Listening F');
    expect(lines.join(' ')).not.toContain('Rivera');
  });

  it('uses the live formatter in the export path with no static All classes fallback', () => {
    const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
    const template = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
    expect(app).toContain('coverFilters.textContent = describeActiveFilters({');
    expect(app.indexOf('updatePrintCoverAndContents();')).toBeGreaterThan(app.indexOf('pdfExportOptions[section.key] ='));
    expect(template).toContain('id="print-cover-filters"></span>');
  });
});
