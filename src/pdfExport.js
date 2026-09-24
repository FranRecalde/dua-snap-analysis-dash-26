export const PDF_SECTIONS = [
  { key: 'overview', label: 'Overview and class comparison', id: 'section-overview' },
  { key: 'suggested', label: 'Suggested actions', id: 'print-suggested-actions' },
  { key: 'distance', label: 'Distance from grade 5', id: 'section-distance-grade-5' },
  { key: 'groups', label: 'Student groups', id: 'section-student-groups' },
  { key: 'movement', label: 'Movement and class balance', id: 'section-movement-balance', needsClassLists: true },
  { key: 'qlaTop', label: 'QLA: Top 5 priorities', id: 'print-qla-top', needsQla: true },
  { key: 'qlaPapers', label: 'QLA: Papers and skills', id: 'print-qla-papers', needsQla: true },
  { key: 'qlaQuestions', label: 'QLA: Questions', id: 'print-qla-questions', needsQla: true },
  { key: 'qlaClasses', label: 'QLA: Classes', id: 'print-qla-classes', needsQla: true },
  { key: 'qlaStudents', label: 'QLA: Students', id: 'print-qla-students', needsQla: true },
  { key: 'qlaActions', label: 'QLA: All actions', id: 'print-qla-actions', needsQla: true },
  { key: 'diagnostics', label: 'Diagnostics', id: 'diagnostics-panel' }
];

export function selectedPdfSections(options, hasClassLists, hasQla = false) {
  return PDF_SECTIONS.filter(section =>
    options[section.key] && (!section.needsClassLists || hasClassLists) && (!section.needsQla || hasQla)
  );
}

export function setPdfSectionVisibility(documentRef, options, hasClassLists, hasQla = false) {
  const selected = selectedPdfSections(options, hasClassLists, hasQla);
  for (const section of PDF_SECTIONS) {
    documentRef.getElementById(section.id)?.classList.toggle('pdf-export-hidden', !selected.includes(section));
  }
  return {
    selected,
    restore: () => PDF_SECTIONS.forEach(section =>
      documentRef.getElementById(section.id)?.classList.remove('pdf-export-hidden')
    )
  };
}

export function qlaPrintClasses(papers, selection = 'ALL') {
  const classes = [...new Set(papers.flatMap(paper => (paper.students || [])
    .map(student => student.activeClass || student.className || student.currentClass)
    .filter(name => name && name !== 'Unassigned')))].sort();
  return selection === 'ALL' ? classes : classes.filter(name => name === selection);
}

export function qlaPrintTiers(papers) {
  return ['Foundation', 'Higher'].filter(tier => papers.some(paper => paper.tier === tier));
}

export function heatmapPrintColumns(columnCount, columnsPerPage = 6) {
  const chunks = [];
  for (let start = 2; start < columnCount; start += columnsPerPage) {
    chunks.push([0, 1, ...Array.from({ length: Math.min(columnsPerPage, columnCount - start) }, (_, i) => start + i)]);
  }
  return chunks.length ? chunks : [[0, 1].slice(0, columnCount)];
}

export function livePdfFilterSummary(filters = {}, topPerformersClass = null) {
  const labels = [
    ['className', 'Class'], ['sen', 'SEN'],
    ['disadvantaged', 'Disadvantaged'], ['band', 'Distance band']
  ];
  const bandLabels = {
    at_or_above_5: 'At or above 5',
    one_grade_away: 'One grade away',
    two_grades_away: 'Two grades away',
    three_or_more_away: 'Three or more away'
  };
  const active = labels
    .filter(([key]) => filters[key] && filters[key] !== 'ALL')
    .map(([key, label]) => `${label}: ${key === 'band' ? bandLabels[filters[key]] || filters[key] : filters[key]}`);
  if (topPerformersClass && topPerformersClass !== 'ALL') {
    active.push(`Top performers class: ${topPerformersClass}`);
  }
  return active.length ? active.join(' · ') : 'No active section filters';
}

export function describeActiveFilters({
  grouping = 'current', selectedSections = {}, distance = {}, studentGroups = {},
  qlaPapers = {}, qlaQuestions = {}, qlaClasses = {}, qlaStudents = {}
} = {}) {
  const lines = [`Grouping: ${grouping === 'new' ? 'New classes (Year 11)' : 'Current classes (Year 10)'}`];
  const active = value => value && value !== 'ALL';
  const labels = filters => {
    const parts = [];
    if (active(filters.className)) parts.push(`class ${filters.className}`);
    if (active(filters.tier)) parts.push(`${filters.tier} tier`);
    if (active(filters.sen)) {
      const sen = filters.sen === 'ALL_SEN' ? 'all SEN' : filters.sen;
      parts.push(`${sen} only`);
    }
    if (active(filters.disadvantaged)) {
      parts.push(filters.disadvantaged === 'Yes' ? 'disadvantaged only' : 'not disadvantaged only');
    }
    if (active(filters.band)) {
      const bands = {
        at_or_above_5: 'at or above grade 5',
        one_grade_away: 'one grade away (grade 4)',
        two_grades_away: 'two grades away (grade 3)',
        three_or_more_away: 'three or more grades away'
      };
      parts.push(bands[filters.band] || filters.band);
    }
    if (active(filters.weakestPaper)) parts.push(`weakest paper ${filters.weakestPaper}`);
    return parts;
  };
  const add = (selected, title, parts) => {
    if (selected && parts.length) lines.push(`${title}: ${parts.join(', ')}`);
  };
  add(selectedSections.distance, 'Distance from grade 5', labels(distance));
  add(selectedSections.groups, 'Student groups',
    studentGroups.classChosen && active(studentGroups.topPerformersClass)
      ? [`top performers class ${studentGroups.topPerformersClass}`] : []);
  add(selectedSections.qlaPapers, 'QLA Papers and skills', labels(qlaPapers));
  add(selectedSections.qlaQuestions, 'QLA Questions', labels(qlaQuestions));
  add(selectedSections.qlaClasses, 'QLA Classes', labels(qlaClasses));
  add(selectedSections.qlaStudents, 'QLA Students', labels(qlaStudents));
  if (lines.length === 1) lines.push('No filters applied');
  return lines;
}

export function matrixPrintColumns(columnCount, columnsPerPage = 7) {
  const newClassCount = columnCount - 3;
  const chunks = [];
  for (let start = 1; start <= newClassCount; start += columnsPerPage) {
    const end = Math.min(start + columnsPerPage - 1, newClassCount);
    chunks.push([0, ...Array.from({ length: end - start + 1 }, (_, i) => start + i), columnCount - 2, columnCount - 1]);
  }
  return chunks;
}

export function createStudentNameRedactor(records = [], pseudonymMap = new Map()) {
  const replacements = [];
  for (const record of records) {
    const commaName = String(record.name || record.studentName || '').split(',');
    const first = String(record.firstName || (commaName.length > 1 ? commaName.slice(1).join(',') : '')).trim();
    const surname = String(record.surname || (commaName.length > 1 ? commaName[0] : '')).trim();
    if (!first || !surname) continue;
    const className = record.activeClass || record.newClassName || record.className || 'Unassigned';
    const initials = `${first[0].toUpperCase()}.${surname[0].toUpperCase()}., ${className}`;
    for (const fullName of [`${surname}, ${first}`, `${first} ${surname}`, `${surname} ${first}`]) {
      const escaped = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      replacements.push([new RegExp(escaped, 'gi'), initials]);
    }
    const studentKey = String(record.studentName || record.name || `${surname} ${first}`).trim().toLowerCase();
    const pseudonym = pseudonymMap.get(studentKey);
    if (pseudonym) replacements.push([new RegExp(`\\b${pseudonym}\\b`, 'g'), initials]);
  }
  return text => replacements.reduce((value, [pattern, initials]) => value.replace(pattern, initials), String(text));
}

export function redactStudentNames(text, records = []) {
  return createStudentNameRedactor(records)(text);
}
