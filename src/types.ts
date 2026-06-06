export type Priority = 'low' | 'medium' | 'high' | 'urgent' | 'none';

export interface AttachmentFile {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string; // Base64 data url
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
  progress?: number; // Optional progress percentage (0 to 100)
  isFloating?: boolean; // Optional flag for independent floating nodes
  isContainer?: boolean; // Optional flag for a container box node
  width?: number; // Optional custom width (for containers)
  height?: number; // Optional custom height (for containers)
  updatedAt?: string; // ISO string for conflict resolution sync
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

