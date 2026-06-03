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
  dueDate?: string; // Optional due date string (YYYY-MM-DD)
  progress?: number; // Optional progress percentage (0 to 100)
}

export interface Project {
  id: string;
  name: string;
  folderId: string | null; // null means root directory
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // supports nested folders
}

export interface WorkspaceState {
  folders: Folder[];
  projects: Project[];
  nodes: Record<string, TaskNode[]>; // projectId maps to task nodes
  activeProjectId: string | null;
}
