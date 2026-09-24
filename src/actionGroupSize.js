// Comparisons need five students; student-list actions need one.
// Rule 7 in QLA retains its stronger nine-student discrimination requirement.
const comparisonRules = {
  Mock: [4, 7],
  'Class balance': [8],
  QLA: [1, 2, 3, 4, 6, 7, 8, 9]
};

export function minimumActionGroupSize(source, ruleNumber) {
  return comparisonRules[source]?.includes(ruleNumber) ? 5 : 1;
}
