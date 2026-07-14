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

export interface TaskVersion {
  id: string;
  timestamp: string; // ISO string
  text: string;
  notes: string;
  description?: string; // Description of the change (auto/manual/restore etc.)
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  createdAt: string; // ISO string
  imageUrl?: string; // Base64 data url or direct download/content link
  imageGoogleDriveId?: string; // Google Drive file ID if uploaded there
  imageWebViewLink?: string; // Optional Google Drive web view URL
}

export interface WorkflowConnection {
  id: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toNodeId: string;
  toSide: 'top' | 'right' | 'bottom' | 'left';
  text?: string;
  bendX?: number;
  bendY?: number;
  bendOffsetX?: number;
  bendOffsetY?: number;
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
  status?: 'todo' | 'progress' | 'waiting' | 'done';
  files: AttachmentFile[];
  comments?: Comment[]; // Task chat feedback comments list
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
  isWorkflowRectangle?: boolean; // Optional flag for workflow rectangle nodes
  workflowShape?: 'rectangle' | 'rhomb'; // Optional shape for workflow nodes
  isZoneTriggerDisabled?: boolean; // Optional flag to disable the outer trigger zone
  workflowConnections?: WorkflowConnection[]; // Optional outgoing workflow connections
  zoneWidth?: number; // Optional outer dashed trigger zone width
  zoneHeight?: number; // Optional outer dashed trigger zone height
  zoneOffsetX?: number; // Optional outer dashed trigger zone X offset from node center
  zoneOffsetY?: number; // Optional outer dashed trigger zone Y offset from node center
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
  history?: TaskVersion[]; // Version history stack/list for tracking edits
  tagCategories?: TagCategory[]; // Optional private card-specific tag categories and tags
  externalLink?: string; // Optional external URL link
  containerPlace?: string; // Optional field for container addition place
  subtaskOrder?: number; // Optional field for manual sorting of subtasks
  googleCalendarEventId?: string; // Optional reference to synced Google Calendar event ID
  googleCalendarId?: string; // Optional reference to specific Google Calendar ID
  estimatedTime?: number; // Optional estimated time of work (in hours)
  isNotTask?: boolean; // Optional flag to mark task as a non-task (hide from all views)
  blockedBy?: string[]; // Optional array of node IDs that block this node
  defaultView?: 'canvas' | 'kanban' | 'mobile-list' | 'calendar' | 'gantt' | 'table' | 'eisenhower' | 'anydo'; // Optional view mode to display by default when focused
  useExactCoordinates?: boolean; // Special flag to skip radial placement and use click coordinates
  mirrorGroupId?: string; // Optional ID linking mirrored/synchronized tasks
  mirrorParentId?: string; // Optional ID of the original parent task of a mirrored subtask
  mirrorParentText?: string; // Optional text of the original parent task of a mirrored subtask
  savedFilters?: {
    filterStatus?: string;
    filterPriority?: string;
    filterTag?: string;
    filterDueDate?: string;
    filterAttachments?: string;
    filterNotes?: string;
    filterCategoryId?: string | null;
    kanbanGroupBy?: 'status' | 'category' | 'priority' | 'container' | null;
    kanbanContainerFilterId?: string | null;
  };
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

export interface DeletionRecord {
  type: 'folder' | 'project' | 'node' | 'tagCategory';
  id: string;
  deletedAt: string;
}

export interface WorkspaceState {
  folders: Folder[];
  projects: Project[];
  nodes: Record<string, TaskNode[]>; // projectId maps to task nodes
  activeProjectId: string | null;
  tagCategories?: TagCategory[];
  googleSheetsFileId?: string;       // ID of the background sync Google Spreadsheet, synchronized across devices
  taskSheetsSpreadsheetId?: string;  // ID of the manual sync Google Spreadsheet, synchronized across devices
  deletions?: DeletionRecord[];
  activePomodoro?: any;
  globalSettings?: Record<string, any>;
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

export interface WorkspaceBackup {
  id: string;
  timestamp: string;
  state: WorkspaceState;
}

