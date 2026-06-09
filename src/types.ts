export type Priority = 'low' | 'medium' | 'high' | 'urgent' | 'none';

export interface AttachmentFile {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string; // Base64 data url
  googleDriveId?: string; // Google Drive file ID if uploaded there
  webViewLink?: string; // Optional Google Drive web view URL
  webContentLink?: string; // Optional Google Drive direct download/content link
}

export interface TaskNode {
  id: string;
  projectId: string;
  text: string;
  x: number;
  y: number;
  parentId: string | null;
  priority: Priority;
  tags: string[];
  notes: string;
  completed: boolean;
  files: AttachmentFile[];
  color?: string; // Optional custom border/connector color for the node
  collapsed?: boolean; // Optional state to collapse/hide sub-branches
  isCardCollapsed?: boolean; // Optional state to collapse/fold only the task card visual details
  dueDate?: string; // Optional due date string (YYYY-MM-DD)
  dueTime?: string; // Optional due time string (HH:MM)
  startDate?: string; // Optional start date string (YYYY-MM-DD)
  startTime?: string; // Optional start time string (HH:MM)
  progress?: number; // Optional progress percentage (0 to 100)
  isFloating?: boolean; // Optional flag for independent floating nodes
  isContainer?: boolean; // Optional flag for a container box node
  width?: number; // Optional custom width (for containers)
  height?: number; // Optional custom height (for containers)
  updatedAt?: string; // ISO string for conflict resolution sync
  reminderDate?: string; // Optional reminder date string (YYYY-MM-DD)
  reminderTime?: string; // Optional reminder time string (HH:MM)
  reminderMinutesBefore?: number; // Optional offset minutes before dueDate/dueTime (e.g. 0, 5, 15, 30, 60, 1440)
  reminderDismissed?: boolean; // Optional dismiss marker for reminders
  pomodoroTotalTime?: number; // Optional total focus seconds spent on this task
  pomodoroSessionsCount?: number; // Optional count of completed pomodoro focus sessions
  archived?: boolean; // Optional flag to mark task as archived
}

export interface Project {
  id: string;
  name: string;
  folderId: string | null; // null means root directory
  createdAt: string;
  updatedAt: string;
  tagCategories?: TagCategory[];
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // supports nested folders
  updatedAt?: string; // ISO string for conflict resolution sync
}

export interface TagCategory {
  id: string;
  name: string;
  color: string; // hex string, e.g. '#6366f1'
  tags: string[];
  updatedAt?: string; // ISO string for conflict resolution sync
}

export interface WorkspaceState {
  folders: Folder[];
  projects: Project[];
  nodes: Record<string, TaskNode[]>; // projectId maps to task nodes
  activeProjectId: string | null;
  tagCategories?: TagCategory[];
}

export interface SyncReport {
  uploadedCount: number;
  downloadedCount: number;
  deletedTableCount: number;
  deletedLocallyCount: number;
  foldersAdded: number;
  foldersUpdated: number;
  projectsAdded: number;
  projectsUpdated: number;
  nodesAdded: number;
  nodesUpdated: number;
  tagCategoriesAdded: number;
  tagCategoriesUpdated: number;
}

