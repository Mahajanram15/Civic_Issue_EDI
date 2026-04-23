export type UserRole = 'citizen' | 'admin' | 'worker';

export type IssueType = 'pothole' | 'garbage' | 'broken_streetlight' | 'water_leak' | 'road_damage' | 'other';

export type IssueStatus = 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'rejected';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Issue {
  id: string;
  user_id: string;
  image_url: string;
  description: string;
  latitude: number;
  longitude: number;
  issue_type: IssueType;
  urgency: UrgencyLevel;
  department: string;
  priority_score: number;
  status: IssueStatus;
  assigned_worker_id?: string;
  resolution_image_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface AIClassificationResult {
  issue_type: IssueType;
  confidence: number;
}

export interface AITextAnalysis {
  urgency: UrgencyLevel;
  sentiment: string;
  keywords: string[];
}

export const DEPARTMENTS: Record<IssueType, string> = {
  pothole: 'Roads Department',
  garbage: 'Waste Management',
  broken_streetlight: 'Electricity Department',
  water_leak: 'Water Supply Department',
  road_damage: 'Roads Department',
  other: 'General Services',
};

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  pothole: 'Pothole',
  garbage: 'Garbage Overflow',
  broken_streetlight: 'Broken Streetlight',
  water_leak: 'Water Leakage',
  road_damage: 'Road Damage',
  other: 'Other',
};

export const STATUS_LABELS: Record<IssueStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
};
