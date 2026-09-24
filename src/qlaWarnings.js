/** Group parser notices by sheet and anonymise student references for privacy mode. */
export function groupQlaWarnings(warnings, papers = [], hideNames = false) {
  const students = new Map();
  for (const paper of papers) {
    for (const student of paper.students || []) {
      students.set(`${paper.sheetName}|${student.name}`.toLowerCase(), student);
    }
  }

  const groups = new Map();
  for (const warning of warnings) {
    const match = /^\[([^\]]+)\]\s*(.*)$/.exec(warning);
    const sheetName = match?.[1] || 'Workbook';
    let message = match?.[2] || warning;
    if (hideNames) {
      message = message.replace(/\bstudent "([^"]+)"/gi, (text, name) => {
        const student = students.get(`${sheetName}|${name}`.toLowerCase());
        if (!student) return 'student "Initials unavailable"';
        const initials = `${student.firstName?.[0] || ''}.${student.surname?.[0] || ''}.`;
        return `student "${initials}, ${student.className || 'Unassigned'}"`;
      });
    }
    if (!groups.has(sheetName)) groups.set(sheetName, []);
    groups.get(sheetName).push(message);
  }

  return Array.from(groups, ([sheetName, messages]) => ({
    sheetName,
    messages: [
      ...messages.filter(message => message.startsWith('Corrected question maximum')),
      ...messages.filter(message => !message.startsWith('Corrected question maximum'))
    ]
  }));
}
