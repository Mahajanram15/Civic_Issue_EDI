const DEPARTMENT_MAP: Record<string, string> = {
  pothole: 'Roads Department',
  garbage: 'Waste Management',
  broken_streetlight: 'Electricity Department',
  water_leak: 'Water Supply Department',
  road_damage: 'Roads Department',
  other: 'General Services',
};

export function routeIssueToDepartment(issueType: string): string {
  return DEPARTMENT_MAP[issueType] || 'General Services';
}

export function calculatePriorityScore(
  urgency: string,
  confidence: number
): number {
  const urgencyScores: Record<string, number> = {
    critical: 90,
    high: 70,
    medium: 50,
    low: 30,
  };
  const base = urgencyScores[urgency] || 50;
  return Math.min(100, Math.round(base * confidence + Math.random() * 10));
}
