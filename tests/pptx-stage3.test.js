import { describe, it, expect } from 'vitest';
import { buildPowerPointPresentation } from '../src/pptxExport.js';

const records = Array.from({ length: 16 }, (_, index) => ({
  id: `invented-${index}`,
  firstName: index === 0 ? 'Cara' : `First${index}`,
  surname: index === 0 ? 'Rivera' : `Surname${index}`,
  className: index < 8 ? '10 Sp1' : '10 Sp2',
  activeClass: index < 8 ? '10 Sp1' : '10 Sp2',
  newClassName: index < 8 ? '11 Sp1' : '11 Sp2',
  hasNewClass: true,
  points: index % 6,
  result: String(index % 6),
  isNotSat: false,
  estimate: 5,
  progress: index % 6 - 5,
  sen: index % 4 === 0 ? 'SEN Support' : 'No SEN',
  disadvantaged: index % 3 === 0 ? 'Yes' : 'No',
  sex: index % 2 === 0 ? 'F' : 'M',
  eal: index % 5 === 0 ? 'Yes' : 'No',
  attendance: 90 + index % 9
}));

const classListsData = {
  allNewClassStudents: records.map(record => ({ ...record, className: record.newClassName })),
  inSnapshotNotInNewClass: [],
  inNewClassesNoMockResult: []
};

const slideText = pres => JSON.stringify(pres._slides.map(slide => slide._slideObjects));

describe('PowerPoint stage 3 snapshot export', () => {
  it('builds a snapshot-only presentation with every required snapshot slide', async () => {
    const pres = buildPowerPointPresentation({
      filteredRecords: records,
      allRecords: records,
      distanceRecords: records.slice(0, 8),
      rawSnapshotRecords: records,
      snapshotName: 'Autumn mock',
      filtersAppliedStr: 'Grouping: Current classes · Class: 10 Sp1',
      ukDateToday: '24 September 2026'
    });
    const content = slideText(pres);
    for (const label of [
      'Autumn mock', '24 September 2026', 'Headline Summary', 'Class comparison',
      'Average grade by class', 'Suggested actions: Top 5',
      'Distance from grade 5', 'Student group gaps'
    ]) expect(content).toContain(label);
    expect(content).not.toContain('Movement matrix');
    expect(content).toContain('Contains pupil data. Handle under the trust data protection policy.');
    expect((await pres.write({ outputType: 'nodebuffer' })).length).toBeGreaterThan(1000);
  });

  it('adds the movement matrix and balance flags when class lists are loaded', async () => {
    const pres = buildPowerPointPresentation({
      filteredRecords: records,
      allRecords: records,
      rawSnapshotRecords: records,
      classListsData
    });
    const content = slideText(pres);
    expect(content).toContain('Movement matrix');
    expect(content).toContain('Class balance flags');
    expect((await pres.write({ outputType: 'nodebuffer' })).length).toBeGreaterThan(1000);
  });

  it('never puts invented full student names on a hidden-names slide', () => {
    const pres = buildPowerPointPresentation({
      filteredRecords: records,
      allRecords: records,
      rawSnapshotRecords: records,
      classListsData,
      snapshotName: 'Rivera, Cara assessment',
      options: { hideNames: true }
    });
    const content = slideText(pres);
    expect(content).not.toMatch(/Rivera, Cara|Cara Rivera|Rivera Cara/);
    expect(content).not.toMatch(/First\d+|Surname\d+/);
    expect(content).toContain('C.R., 10 Sp1');
  });

  it('adds count-only class slides for students two and three grades away', () => {
    const pres = buildPowerPointPresentation({
      filteredRecords: records,
      distanceRecords: records,
      options: { hideNames: true }
    });
    const slide = pres._slides.find(item => JSON.stringify(item._slideObjects).includes('Farthest from grade 5 by class'));
    const content = JSON.stringify(slide._slideObjects);
    expect(content).toContain('2+ grades away');
    expect(content).toContain('3+ grades away');
    expect(content).toContain('10 Sp1');
    expect(content).not.toMatch(/Rivera|Cara|First\d+|Surname\d+/);
  });
});
