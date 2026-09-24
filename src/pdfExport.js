export const PDF_SECTIONS = [
  { key: 'overview', label: 'Overview and class comparison', id: 'section-overview' },
  { key: 'suggested', label: 'Suggested actions', id: 'print-suggested-actions' },
  { key: 'distance', label: 'Distance from grade 5', id: 'section-distance-grade-5' },
  { key: 'groups', label: 'Student groups', id: 'section-student-groups' },
  { key: 'movement', label: 'Movement and class balance', id: 'section-movement-balance', needsClassLists: true },
  { key: 'diagnostics', label: 'Diagnostics', id: 'diagnostics-panel' }
];

export function selectedPdfSections(options, hasClassLists) {
  return PDF_SECTIONS.filter(section =>
    options[section.key] && (!section.needsClassLists || hasClassLists)
  );
}

export function setPdfSectionVisibility(documentRef, options, hasClassLists) {
  const selected = selectedPdfSections(options, hasClassLists);
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
    const first = String(record.firstName || '').trim();
    const surname = String(record.surname || '').trim();
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
