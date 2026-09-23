import { describe, it, expect } from 'vitest';
import { computeHeadlines, buildPseudonymMaps } from '../src/stats.js';

describe('Class Snapshot Dashboard PDF Export & Machinery', () => {
  const sampleRecords = [
    { id: 1, className: '11A/Ma1', studentName: 'Alex Smith', score: 72, teacherName: 'David Miller' },
    { id: 2, className: '11A/Ma1', studentName: 'Ben Jones', score: 58, teacherName: 'David Miller' },
    { id: 3, className: '11B/Ma2', studentName: 'Chloe Davies', score: 84, teacherName: 'Emma Taylor' }
  ];

  it('computes accurate headline figures for mock assessment snapshots', () => {
    const headlines = computeHeadlines(sampleRecords);
    expect(headlines.total).toBe(3);
    expect(headlines.classesCount).toBe(2);
    expect(headlines.studentsCount).toBe(3);
    expect(headlines.averageScore).toBe(71.3);
  });

  it('formats contents list based on selected sections', () => {
    const sectionOrder = [
      { key: 'headlines', label: 'Headline Summary' },
      { key: 'overview', label: 'Class Snapshot Overview' }
    ];

    const pdfExportOptions = {
      headlines: true,
      overview: true
    };

    const items = sectionOrder
      .filter(item => pdfExportOptions[item.key] !== false)
      .map(item => item.label);

    expect(items).toEqual([
      'Headline Summary',
      'Class Snapshot Overview'
    ]);
  });

  it('anonymises student and teacher names when hide names is active', () => {
    const { studentMap, teacherMap } = buildPseudonymMaps(sampleRecords);
    expect(studentMap.get('alex smith')).toBe('Student 1');
    expect(studentMap.get('ben jones')).toBe('Student 2');
    expect(teacherMap.get('david miller')).toBe('Teacher 1');
    expect(teacherMap.get('emma taylor')).toBe('Teacher 2');
  });
});
