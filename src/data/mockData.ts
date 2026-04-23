import { Issue, Notification, User } from '@/types';

export const mockUser: User = {
  id: '1',
  name: 'Rahul Sharma',
  email: 'rahul@example.com',
  role: 'citizen',
  created_at: '2025-01-15T10:00:00Z',
};

export const mockAdmin: User = {
  id: '2',
  name: 'Admin Priya',
  email: 'admin@civicfix.com',
  role: 'admin',
  created_at: '2025-01-01T10:00:00Z',
};

export const mockWorker: User = {
  id: '3',
  name: 'Amit Kumar',
  email: 'amit@civicfix.com',
  role: 'worker',
  department: 'Roads Department',
  created_at: '2025-01-05T10:00:00Z',
};

export const mockIssues: Issue[] = [
  {
    id: '1',
    user_id: '1',
    image_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=400',
    description: 'Large pothole on MG Road near the junction. Very dangerous for two-wheelers, especially at night.',
    latitude: 12.9716,
    longitude: 77.5946,
    issue_type: 'pothole',
    urgency: 'high',
    department: 'Roads Department',
    priority_score: 85,
    status: 'assigned',
    assigned_worker_id: '3',
    created_at: '2025-03-01T08:30:00Z',
  },
  {
    id: '2',
    user_id: '1',
    image_url: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=400',
    description: 'Garbage overflow at the corner of 5th Cross. Not collected for 3 days. Causing health hazard.',
    latitude: 12.9352,
    longitude: 77.6245,
    issue_type: 'garbage',
    urgency: 'medium',
    department: 'Waste Management',
    priority_score: 65,
    status: 'pending',
    created_at: '2025-03-02T14:20:00Z',
  },
  {
    id: '3',
    user_id: '1',
    image_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400',
    description: 'Streetlight broken on 3rd Main Road. The entire stretch is dark and unsafe for pedestrians.',
    latitude: 12.9081,
    longitude: 77.6476,
    issue_type: 'broken_streetlight',
    urgency: 'high',
    department: 'Electricity Department',
    priority_score: 78,
    status: 'in_progress',
    assigned_worker_id: '3',
    created_at: '2025-02-28T19:45:00Z',
  },
  {
    id: '4',
    user_id: '1',
    image_url: 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=400',
    description: 'Water pipe leak on Brigade Road. Water flowing onto the road for past 2 days. Wastage of water.',
    latitude: 12.9719,
    longitude: 77.6067,
    issue_type: 'water_leak',
    urgency: 'critical',
    department: 'Water Supply Department',
    priority_score: 92,
    status: 'pending',
    created_at: '2025-03-05T06:15:00Z',
  },
  {
    id: '5',
    user_id: '1',
    image_url: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400',
    description: 'Road surface damaged after recent rains. Multiple cracks and uneven surface causing accidents.',
    latitude: 12.9611,
    longitude: 77.5753,
    issue_type: 'road_damage',
    urgency: 'medium',
    department: 'Roads Department',
    priority_score: 70,
    status: 'resolved',
    assigned_worker_id: '3',
    created_at: '2025-02-20T11:00:00Z',
  },
];

export const mockNotifications: Notification[] = [
  {
    id: '1',
    user_id: '1',
    message: 'Your issue "Large pothole on MG Road" has been assigned to a worker.',
    is_read: false,
    created_at: '2025-03-05T10:00:00Z',
  },
  {
    id: '2',
    user_id: '1',
    message: 'Your issue "Road surface damaged" has been resolved.',
    is_read: true,
    created_at: '2025-03-04T16:30:00Z',
  },
  {
    id: '3',
    user_id: '1',
    message: 'Your issue "Streetlight broken" is now in progress.',
    is_read: false,
    created_at: '2025-03-03T09:15:00Z',
  },
];

export const mockStats = {
  totalReported: 1247,
  resolved: 892,
  inProgress: 203,
  pending: 152,
  avgResolutionDays: 3.2,
};
