import React, { useRef, useState, useEffect } from 'react';
import { 
  Plus, 
  PlusCircle,
  Trash2, 
  Edit, 
  CheckCircle2, 
  Circle, 
  Paperclip, 
  FileText, 
  Maximize2, 
  Minimize2,
  ZoomIn, 
  ZoomOut, 
  Move,
  Type,
  ChevronDown,
  ChevronUp,
  FolderMinus,
  FolderPlus,
  Menu,
  Zap,
  Calendar,
  AlertTriangle,
  X,
  Download,
  Eye,
  Link2Off
} from 'lucide-react';
import { TaskNode, Priority, TagCategory } from '../types';
import { getBezierPath, calculateProgress, getDescendants, generateId, formatFileSize } from '../utils';

interface MindMapCanvasProps {
  nodes: TaskNode[];
  darkMode: boolean;
  activeProjectId: string | null;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdateNodeCoordinates: (id: string, x: number, y: number) => void;
  onUpdateNodeParent: (id: string, newParentId: string | null) => void;
  onAddChildNode: (parentId: string) => void;
  onAddFloatingNode: (x: number, y: number, parentId?: string | null) => void;
  onAddContainerNode: (x: number, y: number) => void;
  onDeleteNode: (id: string) => void;
  onToggleNodeCompleted: (id: string) => void;
  onToggleNodeCollapse: (id: string) => void;
  onUpdateNode: (updatedNode: TaskNode) => void;
  panX: number;
  panY: number;
  zoom: number;
  setPanX: (x: number | ((prev: number) => number)) => void;
  setPanY: (y: number | ((prev: number) => number)) => void;
  setZoom: (z: number | ((prev: number) => number)) => void;
  onOpenSidebar: () => void;
  onOpenDrawer: () => void;
  filterStatus?: string;
  filterPriority?: string;
  filterTag?: string;
  filterDueDate?: string;
  filterAttachments?: string;
  filterNotes?: string;
  searchQuery?: string;
  tagCategories?: TagCategory[];
}

// Tree helper: verify if candidate parent contains child, avoiding cyclical mapping bugs
function isDescendantOrSelf(candidateParentId: string, nodeId: string, allNodes: TaskNode[]): boolean {
  if (candidateParentId === nodeId) return true;
  let currentId: string | null = candidateParentId;
  while (currentId !== null) {
    const current = allNodes.find(n => n.id === currentId);
    if (!current) break;
    if (current.parentId === nodeId) return true;
    currentId = current.parentId;
  }
  return false;
}

export default function MindMapCanvas({
  nodes,
  darkMode,
  activeProjectId,
  selectedNodeId,
  onSelectNode,
  onUpdateNodeCoordinates,
  onUpdateNodeParent,
  onAddChildNode,
  onAddFloatingNode,
  onAddContainerNode,
  onDeleteNode,
  onToggleNodeCompleted,
  onToggleNodeCollapse,
  onUpdateNode,
  panX,
  panY,
  zoom,
  setPanX,
  setPanY,
  setZoom,
  onOpenSidebar,
  onOpenDrawer,
  filterStatus = 'all',
  filterPriority = 'all',
  filterTag = 'all',
  filterDueDate = 'all',
  filterAttachments = 'all',
  filterNotes = 'all',
  searchQuery = '',
  tagCategories = []
}: MindMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // States for Notes and file upload handling
  const [notesModalNodeId, setNotesModalNodeId] = useState<string | null>(null);
  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploadNodeId, setFileUploadNodeId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleCardFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    const targetNodeId = fileUploadNodeId;
    if (!filesList || filesList.length === 0 || !targetNodeId) return;
    
    setFileError(null);
    const file = filesList[0];
    const MAX_BYTES = 1.5 * 1024 * 1024;
    
    if (file.size > MAX_BYTES) {
      setFileError('Размер файла превышает 1.5 МБ. Выберите файл меньшего размера.');
      setTimeout(() => setFileError(null), 4000);
      return;
    }

    const node = nodes.find(n => n.id === targetNodeId);
    if (!node) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      const newAttachment = {
        id: generateId(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: base64Data,
      };

      const updatedFiles = node.files ? [...node.files, newAttachment] : [newAttachment];
      onUpdateNode({
        ...node,
        files: updatedFiles
      });
    };
    reader.readAsDataURL(file);
    
    // Reset file input value
    e.target.value = '';
  };

  // Drag states for panning the background
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Wheel zoom smoothness state and ref
  const [isWheeling, setIsWheeling] = useState(false);
  const wheelTimeoutRef = useRef<any>(null);

  // Drag states for dragging a specific card
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodeOffsetStart, setNodeOffsetStart] = useState({ x: 0, y: 0 });
  const [hasDraggedNode, setHasDraggedNode] = useState(false);
  const [priorityViewActive, setPriorityViewActive] = useState<boolean>(false);

  // Focus mode states for container fullscreen focus
  const [focusedContainerId, setFocusedContainerId] = useState<string | null>(null);

  // Reset focus mode if the focused container is deleted or project is switched
  useEffect(() => {
    if (focusedContainerId && !nodes.some(n => n.id === focusedContainerId)) {
      setFocusedContainerId(null);
    }
  }, [nodes, focusedContainerId]);

  // Resize states for containers
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
  const [resizeDirection, setResizeDirection] = useState<string | null>(null);
  const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
  const [resizeStartSize, setResizeStartSize] = useState({ width: 520, height: 400 });
  const [resizeStartCenter, setResizeStartCenter] = useState({ x: 0, y: 0 });

  // Pinch-to-zoom tracking refs
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const pinchStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Target node being hovered during a drag operation
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const hoverTimerRef = useRef<any>(null);

  // Long press refs & state for touch devices
  const [isLongPressDragging, setIsLongPressDragging] = useState<boolean>(false);
  const longPressTimeoutRef = useRef<any>(null);
  const potentialDragNodeIdRef = useRef<string | null>(null);
  const potentialDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const potentialNodeOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Prevent parent canvas mouse down actions when clicking cards or buttons
  const isButtonOrCardInput = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    return (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('[data-drag-ignore]')
    );
  };

  // Convert screen coordinates to canvas space coordinates
  const getCanvasCoordinates = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = clientX - rect.left - cx;
    const ry = clientY - rect.top - cy;
    const x = (rx - panX) / zoom;
    const y = (ry - panY) / zoom;
    return { x: Math.round(x), y: Math.round(y) };
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isButtonOrCardInput(e)) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-id]')) return; // ignore nodes double clicks

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    onAddFloatingNode(coords.x, coords.y, focusedContainerId);
  };

  // Zoom limits
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 2.5;

  // Check if a node matches the active filter settings
  const isNodeMatched = (node: TaskNode): boolean => {
    // 1. Text search (text, tags, notes)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const textMatches = node.text.toLowerCase().includes(q);
      const tagMatches = (node.tags || []).some(t => t.toLowerCase().includes(q));
      const notesMatches = (node.notes || "").toLowerCase().includes(q);
      if (!textMatches && !tagMatches && !notesMatches) {
        return false;
      }
    }

    // 2. Status filter
    if (filterStatus === "completed" && !node.completed) return false;
    if (filterStatus === "active" && node.completed) return false;

    // 3. Priority filter
    if (filterPriority !== "all" && node.priority !== filterPriority) return false;

    // 4. Tag filter
    if (filterTag !== "all" && !(node.tags || []).includes(filterTag)) return false;

    // 5. Due date filter
    if (filterDueDate !== "all") {
      const hasDue = !!node.dueDate;
      if (filterDueDate === "has_due_date" && !hasDue) return false;
      if (filterDueDate === "no_due_date" && hasDue) return false;

      if (filterDueDate === "overdue" || filterDueDate === "today" || filterDueDate === "this_week") {
        if (!hasDue) return false;
        
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const nodeDate = new Date(node.dueDate!);
        nodeDate.setHours(0, 0, 0, 0);
        
        const diffTime = nodeDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (filterDueDate === "overdue") {
          const isOverdue = diffDays < 0 && !node.completed;
          if (!isOverdue) return false;
        } else if (filterDueDate === "today") {
          if (diffDays !== 0) return false;
        } else if (filterDueDate === "this_week") {
          if (diffDays < 0 || diffDays > 7) return false;
        }
      }
    }

    // 6. Attachments filter
    if (filterAttachments === "has_files" && (!node.files || node.files.length === 0)) return false;
    if (filterAttachments === "no_files" && (node.files && node.files.length > 0)) return false;

    // 7. Notes filter
    if (filterNotes === "has_notes" && (!node.notes || node.notes.trim() === "")) return false;
    if (filterNotes === "no_notes" && (node.notes && node.notes.trim() !== "")) return false;

    return true;
  };

  const isAnyFilterActive = 
    filterStatus !== "all" || 
    filterPriority !== "all" || 
    filterTag !== "all" || 
    filterDueDate !== "all" || 
    filterAttachments !== "all" || 
    filterNotes !== "all" || 
    searchQuery.trim() !== "";

  // Dynamic ref to allow native listeners to access current coordinates safely
  const latestStateRef = useRef({
    zoom,
    panX,
    panY,
  });

  useEffect(() => {
    latestStateRef.current = {
      zoom,
      panX,
      panY,
    };
  }); // updates every render to always have the latest coordinates

  // Native wheel and touch event registration to bypass passive listener limits and prevent browser page zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('select') ||
        target.closest('.overflow-y-auto')
      ) {
        return;
      }

      // Block standard browser-level page scaling (pinch zoom / ctrl+scroll)
      e.preventDefault();

      const { zoom: curZoom, panX: curPanX, panY: curPanY } = latestStateRef.current;
      const rect = container.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const canvasMouseX = (cursorX - centerX - curPanX) / curZoom;
      const canvasMouseY = (cursorY - centerY - curPanY) / curZoom;

      const zoomIntensity = 0.055;
      const factor = Math.exp(-e.deltaY * zoomIntensity * 0.01);
      
      let newZoom = curZoom * factor;
      newZoom = Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);

      const newPanX = cursorX - centerX - canvasMouseX * newZoom;
      const newPanY = cursorY - centerY - canvasMouseY * newZoom;

      setIsWheeling(true);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => {
        setIsWheeling(false);
      }, 150);

      setZoom(newZoom);
      setPanX(newPanX);
      setPanY(newPanY);
    };

    const handleNativeTouchMove = (e: TouchEvent) => {
      // Prevent browser level pinch-to-zoom scaling the whole app layout
      if (e.touches.length === 2) {
        e.preventDefault();
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    container.addEventListener('touchmove', handleNativeTouchMove, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
      container.removeEventListener('touchmove', handleNativeTouchMove);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    };
  }, [MIN_ZOOM, MAX_ZOOM]);

  const isTransitioningTransform = !isPanning && !draggingNodeId && pinchStartDistRef.current === null && !isLongPressDragging && !isWheeling;

  const getOverlapParent = (draggingId: string, newX: number, newY: number): TaskNode | undefined => {
    const draggingNode = nodes.find(n => n.id === draggingId);
    if (!draggingNode) return undefined;

    // First attempt: Check for hover/overlap with regular non-container task nodes (containers can also overlap and snap here)
    const normalNodeOverlap = visibleNodes.find(otherNode => {
      if (otherNode.id === draggingId) return false;
      if (isDescendantOrSelf(otherNode.id, draggingId, nodes)) return false;
      if (otherNode.isContainer) return false;

      const dx = Math.abs(newX - otherNode.x);
      const dy = Math.abs(newY - otherNode.y);
      return dx < 120 && dy < 75;
    });

    if (normalNodeOverlap) return normalNodeOverlap;

    // Second attempt: Check for containment inside container nodes
    const containerOverlap = visibleNodes.find(otherNode => {
      if (otherNode.id === draggingId) return false;
      if (isDescendantOrSelf(otherNode.id, draggingId, nodes)) return false;
      if (!otherNode.isContainer || otherNode.collapsed) return false;

      if (draggingNode.isContainer) return false; // Containers cannot go inside other containers
      if (focusedContainerId === otherNode.id) return false; // Do not overlap with the focused container itself in focus mode

      // Do not instantly snap to container during active drag if currently nested under a standard task parent
      if (draggingNode.parentId) {
        const currentParent = nodes.find(p => p.id === draggingNode.parentId);
        if (currentParent && !currentParent.isContainer) {
          return false;
        }
      }

      const dx = Math.abs(newX - otherNode.x);
      const dy = Math.abs(newY - otherNode.y);
      const halfW = (otherNode.width || 520) / 2;
      const halfH = (otherNode.height || 400) / 2;
      return dx < halfW && dy < halfH;
    });

    return containerOverlap;
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.15, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.15, MIN_ZOOM));
  };

  const handleRecenter = () => {
    setPanX(0);
    setPanY(0);
    setZoom(1);
  };

  // Background Canvas Drag/Panning Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isButtonOrCardInput(e)) return;
    
    // Deselect selected node when clicking on an empty space
    onSelectNode(null);

    setIsPanning(true);
    setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // 0. Resize container operation
    if (resizingNodeId) {
      const node = nodes.find(n => n.id === resizingNodeId);
      if (!node) return;

      const deltaX = (e.clientX - resizeStartPos.x) / zoom;
      const deltaY = (e.clientY - resizeStartPos.y) / zoom;

      const startLeft = resizeStartCenter.x - resizeStartSize.width / 2;
      const startRight = resizeStartCenter.x + resizeStartSize.width / 2;
      const startTop = resizeStartCenter.y - resizeStartSize.height / 2;
      const startBottom = resizeStartCenter.y + resizeStartSize.height / 2;

      let newLeft = startLeft;
      let newRight = startRight;
      let newTop = startTop;
      let newBottom = startBottom;

      const dir = resizeDirection || 'se';

      // Horizontal updates
      if (dir.includes('e')) {
        newRight = startRight + deltaX;
      } else if (dir.includes('w')) {
        newLeft = startLeft + deltaX;
      }

      // Vertical updates
      if (dir.includes('s')) {
        newBottom = startBottom + deltaY;
      } else if (dir.includes('n')) {
        newTop = startTop + deltaY;
      }

      // Constraints
      const newWidth = Math.max(300, newRight - newLeft);
      const newHeight = Math.max(200, newBottom - newTop);

      if (dir.includes('w')) {
        newLeft = newRight - newWidth;
      } else if (dir.includes('e')) {
        newRight = newLeft + newWidth;
      }

      if (dir.includes('n')) {
        newTop = newBottom - newHeight;
      } else if (dir.includes('s')) {
        newBottom = newTop + newHeight;
      }

      const newCenterX = newLeft + newWidth / 2;
      const newCenterY = newTop + newHeight / 2;

      onUpdateNode({
        ...node,
        x: newCenterX,
        y: newCenterY,
        width: newWidth,
        height: newHeight
      });
      return;
    }

    // 1. Pan the board
    if (isPanning && !draggingNodeId) {
      setPanX(e.clientX - panStart.x);
      setPanY(e.clientY - panStart.y);
      return;
    }

    // 2. Drag a specific node
    if (draggingNodeId) {
      const node = nodes.find(n => n.id === draggingNodeId);
      if (!node) return;

      const deltaX = (e.clientX - dragStart.x) / zoom;
      const deltaY = (e.clientY - dragStart.y) / zoom;
      
      const newX = Math.round(nodeOffsetStart.x + deltaX);
      const newY = Math.round(nodeOffsetStart.y + deltaY);

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        setHasDraggedNode(true);
      }

      onUpdateNodeCoordinates(draggingNodeId, newX, newY);

      // Auto-expand container if children are pushed close to or outside the container bounds (only in focus mode)
      const parentContainer = (node.parentId && node.parentId === focusedContainerId) ? nodes.find(p => p.id === node.parentId && p.isContainer) : null;
      if (parentContainer) {
        const W = parentContainer.width || 520;
        const H = parentContainer.height || 400;

        const cardW = 210;
        const cardH = 110;

        const nodeLeft = newX - cardW / 2;
        const nodeRight = newX + cardW / 2;
        const nodeTop = newY - cardH / 2;
        const nodeBottom = newY + cardH / 2;

        const currentLeft = parentContainer.x - W / 2;
        const currentRight = parentContainer.x + W / 2;
        const currentTop = parentContainer.y - H / 2;
        const currentBottom = parentContainer.y + H / 2;

        const padding = 35;

        let needsResize = false;
        let nextLeft = currentLeft;
        let nextRight = currentRight;
        let nextTop = currentTop;
        let nextBottom = currentBottom;

        if (nodeLeft - padding < currentLeft) {
          nextLeft = nodeLeft - padding;
          needsResize = true;
        }
        if (nodeRight + padding > currentRight) {
          nextRight = nodeRight + padding;
          needsResize = true;
        }
        if (nodeTop - padding < currentTop) {
          nextTop = nodeTop - padding;
          needsResize = true;
        }
        if (nodeBottom + padding > currentBottom) {
          nextBottom = nodeBottom + padding;
          needsResize = true;
        }

        if (needsResize) {
          const newW = Math.round(nextRight - nextLeft);
          const newH = Math.round(nextBottom - nextTop);
          const newCX = Math.round(nextLeft + newW / 2);
          const newCY = Math.round(nextTop + newH / 2);

          onUpdateNode({
            ...parentContainer,
            width: newW,
            height: newH,
            x: newCX,
            y: newCY
          });
        }
      }

      // Check support for re-parenting by hovering over another task card or container
      const overlapNode = getOverlapParent(draggingNodeId, newX, newY);

      if (overlapNode) {
        const node = nodes.find(n => n.id === draggingNodeId);
        if (node && node.parentId !== overlapNode.id) {
          if (overlapNode.isContainer) {
            // Instant parenting for containers! No loop, no delay, no "bounce" back.
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            onUpdateNodeParent(draggingNodeId, overlapNode.id);
            setHoverTargetId(null);
          } else {
            // For regular branches, keep the 450ms delay to prevent accidental parenting while passing by
            if (hoverTargetId !== overlapNode.id) {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
              setHoverTargetId(overlapNode.id);
              hoverTimerRef.current = setTimeout(() => {
                onUpdateNodeParent(draggingNodeId, overlapNode.id);
                if (navigator.vibrate) {
                  try { navigator.vibrate([60, 40, 60]); } catch (err) {}
                }
                setHoverTargetId(null);
              }, 450);
            }
          }
        } else {
          if (hoverTargetId !== null) {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            setHoverTargetId(null);
          }
        }
      } else {
        if (hoverTargetId !== null) {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          setHoverTargetId(null);
        }
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setResizingNodeId(null);
    setResizeDirection(null);

    if (draggingNodeId && hasDraggedNode) {
      const node = nodes.find(n => n.id === draggingNodeId);
      if (node) {
        const overlap = getOverlapParent(draggingNodeId, node.x, node.y);
        const currentParent = nodes.find(p => p.id === node.parentId);
        
        if (overlap) {
          // Snap directly on release
          onUpdateNodeParent(node.id, overlap.id);
        } else if (currentParent) {
          if (currentParent.isContainer) {
            const dx = Math.abs(node.x - currentParent.x);
            const dy = Math.abs(node.y - currentParent.y);
            let shouldDetach = false;

            if (focusedContainerId) {
              const maxW = (currentParent.width || 520) / 2 + 400;
              const maxH = (currentParent.height || 400) / 2 + 400;
              shouldDetach = dx > maxW || dy > maxH;
            } else {
              const maxW = (currentParent.width || 520) / 2;
              const maxH = (currentParent.height || 400) / 2;
              shouldDetach = dx > maxW || dy > maxH;
            }

            if (shouldDetach) {
              if (focusedContainerId) {
                if (node.parentId !== focusedContainerId) {
                  onUpdateNodeParent(node.id, focusedContainerId);
                }
              } else {
                onUpdateNodeParent(node.id, null);
              }
            }
          } else {
            // Dragged away from standard parent by more than 330px on empty space -> auto detach!
            const dx = node.x - currentParent.x;
            const dy = node.y - currentParent.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 330) {
              if (focusedContainerId) {
                onUpdateNodeParent(node.id, focusedContainerId);
              } else {
                // Check if release position is inside any container
                const container = visibleNodes.find(otherNode => {
                  if (otherNode.id === node.id) return false;
                  if (!otherNode.isContainer || otherNode.collapsed) return false;
                  const cdx = Math.abs(node.x - otherNode.x);
                  const cdy = Math.abs(node.y - otherNode.y);
                  const halfW = (otherNode.width || 520) / 2;
                  const halfH = (otherNode.height || 400) / 2;
                  return cdx < halfW && cdy < halfH;
                });
                if (container) {
                  onUpdateNodeParent(node.id, container.id);
                } else {
                  onUpdateNodeParent(node.id, null);
                }
              }
            }
          }
        }
      }
    }

    setDraggingNodeId(null);
    if (hasDraggedNode) {
      onSelectNode(null);
    }
    setHasDraggedNode(false);
    
    // Clear hover timing
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverTargetId(null);
  };

  // Touch Handlers for Mobile Devices
  const handleTouchStart = (e: React.TouchEvent) => {
    // Check if we have two touches for pinching
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      pinchStartDistRef.current = distance;
      pinchStartZoomRef.current = zoom;
      pinchStartPanRef.current = { x: panX, y: panY };
      pinchStartCenterRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      
      setIsPanning(false);
      setDraggingNodeId(null);
      setHasDraggedNode(false);
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      setIsLongPressDragging(false);
      return;
    }

    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    
    // Ignore canvas pan if interacting with buttons
    if (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('[data-drag-ignore]')
    ) return;

    // Is touch on a task card?
    const cardElement = target.closest('[data-node-id]');
    if (cardElement) {
      const nodeId = cardElement.getAttribute('data-node-id');
      if (nodeId && nodeId !== focusedContainerId) {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);

          potentialDragNodeIdRef.current = nodeId;
          potentialDragStartRef.current = { x: touch.clientX, y: touch.clientY };
          potentialNodeOffsetRef.current = { x: node.x, y: node.y };
          setIsLongPressDragging(false);

          // Start the 500ms long press timer to activate drag
          longPressTimeoutRef.current = setTimeout(() => {
            setIsLongPressDragging(true);
            setDraggingNodeId(nodeId);
            setDragStart(potentialDragStartRef.current);
            setNodeOffsetStart(potentialNodeOffsetRef.current);
            setHasDraggedNode(true);
            onSelectNode(nodeId);

            if (navigator.vibrate) {
              try { navigator.vibrate(60); } catch (err) {}
            }
          }, 500);

          e.stopPropagation();
          return;
        }
      }
    }

    // Otherwise pan canvas
    onSelectNode(null);
    setIsPanning(true);
    setPanStart({ x: touch.clientX - panX, y: touch.clientY - panY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      if (pinchStartDistRef.current !== null) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        const factor = currentDistance / pinchStartDistRef.current;
        let newZoom = pinchStartZoomRef.current * factor;
        newZoom = Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);
        
        // Midpoint of current fingers
        const currentCenterX = (t1.clientX + t2.clientX) / 2;
        const currentCenterY = (t1.clientY + t2.clientY) / 2;
        
        // Focus client coordinates
        const rect = containerRef.current?.getBoundingClientRect();
        const containerCenterX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const containerCenterY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
        
        // Pinned zoom focal point pan adjustment based on original center of fingers
        const focalX = pinchStartCenterRef.current.x - containerCenterX;
        const focalY = pinchStartCenterRef.current.y - containerCenterY;
        
        const ratio = newZoom / pinchStartZoomRef.current;
        
        // Calculate new pan base so anchor point remains visually in the same place
        let newPanX = focalX - (focalX - pinchStartPanRef.current.x) * ratio;
        let newPanY = focalY - (focalY - pinchStartPanRef.current.y) * ratio;
        
        // Also support moving/shifting while pinching (2-finger panning)
        const panDeltaX = currentCenterX - pinchStartCenterRef.current.x;
        const panDeltaY = currentCenterY - pinchStartCenterRef.current.y;
        newPanX += panDeltaX;
        newPanY += panDeltaY;
        
        setZoom(newZoom);
        setPanX(newPanX);
        setPanY(newPanY);
        
        e.preventDefault(); // prevent zoom and native scroll
      }
      return;
    }

    if (e.touches.length === 0) return;
    const touch = e.touches[0];

    // 0. Resize container operation for touch devices
    if (resizingNodeId && pinchStartDistRef.current === null && e.touches.length === 1) {
      const node = nodes.find(n => n.id === resizingNodeId);
      if (!node) return;

      const deltaX = (touch.clientX - resizeStartPos.x) / zoom;
      const deltaY = (touch.clientY - resizeStartPos.y) / zoom;

      const startLeft = resizeStartCenter.x - resizeStartSize.width / 2;
      const startRight = resizeStartCenter.x + resizeStartSize.width / 2;
      const startTop = resizeStartCenter.y - resizeStartSize.height / 2;
      const startBottom = resizeStartCenter.y + resizeStartSize.height / 2;

      let newLeft = startLeft;
      let newRight = startRight;
      let newTop = startTop;
      let newBottom = startBottom;

      const dir = resizeDirection || 'se';

      // Horizontal updates
      if (dir.includes('e')) {
        newRight = startRight + deltaX;
      } else if (dir.includes('w')) {
        newLeft = startLeft + deltaX;
      }

      // Vertical updates
      if (dir.includes('s')) {
        newBottom = startBottom + deltaY;
      } else if (dir.includes('n')) {
        newTop = startTop + deltaY;
      }

      // Constraints
      const newWidth = Math.max(300, newRight - newLeft);
      const newHeight = Math.max(200, newBottom - newTop);

      if (dir.includes('w')) {
        newLeft = newRight - newWidth;
      } else if (dir.includes('e')) {
        newRight = newLeft + newWidth;
      }

      if (dir.includes('n')) {
        newTop = newBottom - newHeight;
      } else if (dir.includes('s')) {
        newBottom = newTop + newHeight;
      }

      const newCenterX = newLeft + newWidth / 2;
      const newCenterY = newTop + newHeight / 2;

      onUpdateNode({
        ...node,
        x: newCenterX,
        y: newCenterY,
        width: newWidth,
        height: newHeight
      });
      e.preventDefault();
      return;
    }

    // If we have a pending long press but they moved their finger significantly, cancel long press
    if (!isLongPressDragging && potentialDragNodeIdRef.current && longPressTimeoutRef.current) {
      const dx = touch.clientX - potentialDragStartRef.current.x;
      const dy = touch.clientY - potentialDragStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
        potentialDragNodeIdRef.current = null;
        
        // Treat as normal background panning!
        setIsPanning(true);
        setPanStart({ x: touch.clientX - panX, y: touch.clientY - panY });
      }
    }

    // Only pan if we aren't currently pinching
    if (isPanning && !draggingNodeId && pinchStartDistRef.current === null) {
      setPanX(touch.clientX - panStart.x);
      setPanY(touch.clientY - panStart.y);
      e.preventDefault(); // prevent native rubber banding
      return;
    }

    if (draggingNodeId && pinchStartDistRef.current === null) {
      const node = nodes.find(n => n.id === draggingNodeId);
      if (!node) return;

      const deltaX = (touch.clientX - dragStart.x) / zoom;
      const deltaY = (touch.clientY - dragStart.y) / zoom;
      
      const newX = Math.round(nodeOffsetStart.x + deltaX);
      const newY = Math.round(nodeOffsetStart.y + deltaY);

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        setHasDraggedNode(true);
      }

      onUpdateNodeCoordinates(draggingNodeId, newX, newY);

      // Auto-expand container if children are pushed close to or outside the container bounds (only in focus mode)
      const parentContainer = (node.parentId && node.parentId === focusedContainerId) ? nodes.find(p => p.id === node.parentId && p.isContainer) : null;
      if (parentContainer) {
        const W = parentContainer.width || 520;
        const H = parentContainer.height || 400;

        const cardW = 210;
        const cardH = 110;

        const nodeLeft = newX - cardW / 2;
        const nodeRight = newX + cardW / 2;
        const nodeTop = newY - cardH / 2;
        const nodeBottom = newY + cardH / 2;

        const currentLeft = parentContainer.x - W / 2;
        const currentRight = parentContainer.x + W / 2;
        const currentTop = parentContainer.y - H / 2;
        const currentBottom = parentContainer.y + H / 2;

        const padding = 35;

        let needsResize = false;
        let nextLeft = currentLeft;
        let nextRight = currentRight;
        let nextTop = currentTop;
        let nextBottom = currentBottom;

        if (nodeLeft - padding < currentLeft) {
          nextLeft = nodeLeft - padding;
          needsResize = true;
        }
        if (nodeRight + padding > currentRight) {
          nextRight = nodeRight + padding;
          needsResize = true;
        }
        if (nodeTop - padding < currentTop) {
          nextTop = nodeTop - padding;
          needsResize = true;
        }
        if (nodeBottom + padding > currentBottom) {
          nextBottom = nodeBottom + padding;
          needsResize = true;
        }

        if (needsResize) {
          const newW = Math.round(nextRight - nextLeft);
          const newH = Math.round(nextBottom - nextTop);
          const newCX = Math.round(nextLeft + newW / 2);
          const newCY = Math.round(nextTop + newH / 2);

          onUpdateNode({
            ...parentContainer,
            width: newW,
            height: newH,
            x: newCX,
            y: newCY
          });
        }
      }

      // Check support for re-parenting by hovering over another task card or container
      const overlapNode = getOverlapParent(draggingNodeId, newX, newY);

      if (overlapNode) {
        const node = nodes.find(n => n.id === draggingNodeId);
        if (node && node.parentId !== overlapNode.id) {
          if (overlapNode.isContainer) {
            // Instant parenting for containers! No loop, no delay, no "bounce" back.
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            onUpdateNodeParent(draggingNodeId, overlapNode.id);
            setHoverTargetId(null);
          } else {
            // For regular branches, keep the 450ms delay to prevent accidental parenting while passing by
            if (hoverTargetId !== overlapNode.id) {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
              setHoverTargetId(overlapNode.id);
              hoverTimerRef.current = setTimeout(() => {
                onUpdateNodeParent(draggingNodeId, overlapNode.id);
                if (navigator.vibrate) {
                  try { navigator.vibrate([60, 40, 60]); } catch (err) {}
                }
                setHoverTargetId(null);
              }, 450);
            }
          }
        } else {
          if (hoverTargetId !== null) {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            setHoverTargetId(null);
          }
        }
      } else {
        if (hoverTargetId !== null) {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          setHoverTargetId(null);
        }
      }

      e.preventDefault(); // prevent scroll
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setResizingNodeId(null);
    setResizeDirection(null);
    // If fewer than 2 touches, clean up the pinch distance tracker
    if (e.touches.length < 2) {
      pinchStartDistRef.current = null;
    }

    // If panning and one finger remains active, reset panning starting reference point to avoid jumps
    if (e.touches.length === 1 && isPanning) {
      const touch = e.touches[0];
      setPanStart({ x: touch.clientX - panX, y: touch.clientY - panY });
    }

    // Clear long press if active
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    // Clear hover timing
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverTargetId(null);

    if (e.touches.length === 0) {
      if (draggingNodeId && hasDraggedNode) {
        const node = nodes.find(n => n.id === draggingNodeId);
        if (node) {
          const overlap = getOverlapParent(draggingNodeId, node.x, node.y);
          const currentParent = nodes.find(p => p.id === node.parentId);
          
          if (overlap) {
            // Snap inside container or parent directly on drop
            onUpdateNodeParent(node.id, overlap.id);
          } else if (currentParent) {
            if (currentParent.isContainer) {
              const dx = Math.abs(node.x - currentParent.x);
              const dy = Math.abs(node.y - currentParent.y);
              let shouldDetach = false;

              if (focusedContainerId) {
                const maxW = (currentParent.width || 520) / 2 + 400;
                const maxH = (currentParent.height || 400) / 2 + 400;
                shouldDetach = dx > maxW || dy > maxH;
              } else {
                const maxW = (currentParent.width || 520) / 2;
                const maxH = (currentParent.height || 400) / 2;
                shouldDetach = dx > maxW || dy > maxH;
              }

              if (shouldDetach) {
                if (focusedContainerId) {
                  if (node.parentId !== focusedContainerId) {
                    onUpdateNodeParent(node.id, focusedContainerId);
                  }
                } else {
                  onUpdateNodeParent(node.id, null);
                }
              }
            } else {
              // Dragged away from standard parent by more than 330px on empty space -> auto detach!
              const dx = node.x - currentParent.x;
              const dy = node.y - currentParent.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 330) {
                if (focusedContainerId) {
                  onUpdateNodeParent(node.id, focusedContainerId);
                } else {
                  // Check if release position is inside any container
                  const container = visibleNodes.find(otherNode => {
                    if (otherNode.id === node.id) return false;
                    if (!otherNode.isContainer || otherNode.collapsed) return false;
                    const cdx = Math.abs(node.x - otherNode.x);
                    const cdy = Math.abs(node.y - otherNode.y);
                    const halfW = (otherNode.width || 520) / 2;
                    const halfH = (otherNode.height || 400) / 2;
                    return cdx < halfW && cdy < halfH;
                  });
                  if (container) {
                    onUpdateNodeParent(node.id, container.id);
                  } else {
                    onUpdateNodeParent(node.id, null);
                  }
                }
              }
            }
          }
        }
      }

      if (!isLongPressDragging && potentialDragNodeIdRef.current) {
        onSelectNode(potentialDragNodeIdRef.current);
      } else if (hasDraggedNode || isLongPressDragging) {
        onSelectNode(null);
      }
      setIsPanning(false);
      setDraggingNodeId(null);
      setHasDraggedNode(false);
      setIsLongPressDragging(false);
      potentialDragNodeIdRef.current = null;
    }
  };

  // Start dragging a node from Mouse Down
  const startDragNode = (e: React.MouseEvent, node: TaskNode) => {
    if (isButtonOrCardInput(e)) return;
    if (node.id === focusedContainerId) return; // Disable dragging the container if it's currently focused in fullscreen
    
    e.stopPropagation();
    onSelectNode(node.id);
    setDraggingNodeId(node.id);
    setDragStart({ x: e.clientX, y: e.clientY });
    setNodeOffsetStart({ x: node.x, y: node.y });
    setHasDraggedNode(false);
  };

  // Start container resizing from Mouse Down
  const startResize = (e: React.MouseEvent, node: TaskNode, direction: string = 'se') => {
    e.stopPropagation();
    e.preventDefault();
    onSelectNode(node.id);
    setResizingNodeId(node.id);
    setResizeDirection(direction);
    setResizeStartPos({ x: e.clientX, y: e.clientY });
    setResizeStartSize({
      width: node.width || 520,
      height: node.height || 400
    });
    setResizeStartCenter({ x: node.x, y: node.y });
  };

  // Start container resizing from Touch Start
  const startResizeTouch = (e: React.TouchEvent, node: TaskNode, direction: string = 'se') => {
    if (e.touches.length === 0) return;
    e.stopPropagation();
    onSelectNode(node.id);
    setResizingNodeId(node.id);
    setResizeDirection(direction);
    const touch = e.touches[0];
    setResizeStartPos({ x: touch.clientX, y: touch.clientY });
    setResizeStartSize({
      width: node.width || 520,
      height: node.height || 400
    });
    setResizeStartCenter({ x: node.x, y: node.y });
  };

  // Auto-fit container around its child nodes
  const autoFitContainer = (containerId: string) => {
    const containerNode = nodes.find(n => n.id === containerId);
    if (!containerNode) return;

    const directChildren = nodes.filter(n => n.parentId === containerId);
    if (directChildren.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    directChildren.forEach(child => {
      // Child card size is approx 210x120. Half-bounds: 105px X, 60px Y
      const left = child.x - 105;
      const right = child.x + 105;
      const top = child.y - 60;
      const bottom = child.y + 110;

      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
      if (top < minY) minY = top;
      if (bottom > maxY) maxY = bottom;
    });

    // Padding wrapper
    const padX = 65;
    const padY = 85;

    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padX;

    const newWidth = Math.round(Math.max(520, maxX - minX));
    const newHeight = Math.round(Math.max(400, maxY - minY));
    const newCenterX = Math.round(minX + newWidth / 2);
    const newCenterY = Math.round(minY + newHeight / 2);

    onUpdateNode({
      ...containerNode,
      x: newCenterX,
      y: newCenterY,
      width: newWidth,
      height: newHeight
    });
  };

  // Node styles
  const getPriorityInfo = (p: Priority) => {
    switch (p) {
      case 'urgent':
        return {
          bg: 'bg-rose-50 dark:bg-rose-950/45 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60',
          dot: 'bg-rose-600 animate-pulse',
          label: '⚡ URGENT',
          color: '#f43f5e'
        };
      case 'high':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60',
          dot: 'bg-amber-500',
          label: 'HIGH',
          color: '#f59e0b'
        };
      case 'medium':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/60',
          dot: 'bg-blue-500',
          label: 'MEDIUM',
          color: '#3b82f6'
        };
      case 'low':
        return {
          bg: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900',
          dot: 'bg-teal-500',
          label: 'LOW',
          color: '#14b8a6'
        };
      default:
        return {
          bg: 'bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800',
          dot: 'bg-slate-300',
          label: 'NONE',
          color: '#94a3b8'
        };
    }
  };

  const getPriorityCardStyles = (priority: Priority, isSelected: boolean) => {
    switch (priority) {
      case 'urgent':
        return isSelected 
          ? 'border-rose-500 dark:border-rose-400 ring-4 ring-rose-200 dark:ring-rose-950 shadow-[0_0_20px_rgba(244,63,94,0.65)] font-bold'
          : 'border-rose-500 dark:border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.45)]';
      case 'high':
        return isSelected
          ? 'border-amber-500 dark:border-amber-400 ring-4 ring-amber-200 dark:ring-amber-950 shadow-[0_0_16px_rgba(245,158,11,0.55)]'
          : 'border-amber-500 dark:border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.35)]';
      case 'medium':
        return isSelected
          ? 'border-blue-500 dark:border-blue-400 ring-4 ring-blue-200 dark:ring-blue-950 shadow-[0_0_12px_rgba(59,130,246,0.4)]'
          : 'border-blue-400 dark:border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.2)]';
      case 'low':
        return isSelected
          ? 'border-teal-500 dark:border-teal-400 ring-4 ring-teal-100 dark:ring-teal-950 shadow-[0_0_10px_rgba(20,184,166,0.3)]'
          : 'border-teal-400 dark:border-teal-500 shadow-[0_0_6px_rgba(20,184,166,0.15)]';
      default:
        // Softly fade non-prioritized cards to make prioritized ones pop
        return isSelected 
          ? 'border-slate-400 dark:border-slate-500 ring-4 ring-slate-100 dark:ring-slate-900 opacity-60' 
          : 'border-slate-200 dark:border-slate-800 opacity-50 saturate-50 hover:opacity-85';
    }
  };

  const isOverdue = (dueDateStr?: string) => {
    if (!dueDateStr) return false;
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    return dueDateStr < todayStr;
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-');
      if (!year || !month || !day) return dateStr;
      return `${day}.${month}.${year.slice(-2)}`;
    } catch {
      return dateStr;
    }
  };

  // Trace parent nodes back to root to determine if any ancestor is collapsed, or filtered by focus mode
  const visibleNodes = nodes.filter(node => {
    if (focusedContainerId) {
      // In focus mode, we only show the container itself or its descendants
      if (node.id === focusedContainerId) return true;
      
      // Check if it's a descendant of focused container
      let isDescendantOfFocused = false;
      let currentParentId = node.parentId;
      while (currentParentId !== null) {
        if (currentParentId === focusedContainerId) {
          isDescendantOfFocused = true;
          break;
        }
        const findParent = nodes.find(n => n.id === currentParentId);
        if (!findParent) break;
        currentParentId = findParent.parentId;
      }
      
      if (!isDescendantOfFocused) return false;
      
      // Since it is a descendant, it must not have collapsed ancestors *between* itself and the focused container
      currentParentId = node.parentId;
      while (currentParentId !== null && currentParentId !== focusedContainerId) {
        const parent = nodes.find(n => n.id === currentParentId);
        if (!parent) break;
        if (parent.collapsed) {
          return false; // Hidden because some ancestor inside the container is collapsed
        }
        currentParentId = parent.parentId;
      }
      return true;
    }

    // Normal mode: trace all the way to the root
    let currentParentId = node.parentId;
    while (currentParentId !== null) {
      const parent = nodes.find(n => n.id === currentParentId);
      if (!parent) break;
      if (parent.collapsed) {
        return false; // Hidden because parent or higher ancestor is collapsed
      }
      currentParentId = parent.parentId;
    }
    return true; // Visible because no ancestor is collapsed
  });

  // Calculate total descendants recursively for collapsed indicator
  const countDescendants = (parentId: string, allNodes: TaskNode[]): number => {
    let count = 0;
    const children = allNodes.filter(n => n.parentId === parentId);
    count += children.length;
    children.forEach(child => {
      count += countDescendants(child.id, allNodes);
    });
    return count;
  };

  // Return connections: map of nodeId to parent connection, only for visible nodes
  const connections = visibleNodes
    .filter(node => node.parentId !== null)
    .map(node => {
      const parent = visibleNodes.find(p => p.id === node.parentId);
      return { child: node, parent };
    })
    .filter(conn => conn.parent !== undefined && !conn.parent.isContainer) as { child: TaskNode; parent: TaskNode }[];

  return (
    <div 
      ref={containerRef}
      className={`relative flex-1 h-full select-none overflow-hidden bg-white dark:bg-slate-950 outline-none transition-all duration-300 ${focusedContainerId ? 'ring-4 ring-amber-500/15 ring-inset shadow-[inset_0_0_80px_rgba(245,158,11,0.05)]' : ''}`}
      style={{
        backgroundImage: `radial-gradient(${darkMode ? '#334155' : '#cbd5e1'} 1.2px, transparent 1.2px)`,
        backgroundSize: '24px 24px',
        backgroundPosition: `${panX}px ${panY}px`,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      {/* Immersive Focused Container Top Stats Bar */}
      {focusedContainerId && (() => {
        const focusedContainer = nodes.find(n => n.id === focusedContainerId);
        if (!focusedContainer) return null;
        
        const containerChildren = nodes.filter(n => n.parentId === focusedContainerId);
        const totalChildren = containerChildren.length;
        const completedChildren = containerChildren.filter(n => n.completed).length;
        const progress = totalChildren > 0 ? Math.round((completedChildren / totalChildren) * 100) : 0;
        
        return (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-5 py-3 border border-amber-300 dark:border-amber-900/60 rounded-2xl shadow-xl flex items-center gap-4 transition-all duration-350 animate-in fade-in slide-in-from-top-4 max-w-[95vw] sm:max-w-xl">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl shrink-0">📦</span>
              <div className="min-w-0">
                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold tracking-wider uppercase font-sans">Режим фокусировки</div>
                <input
                  type="text"
                  value={focusedContainer.text}
                  onChange={(e) => {
                    onUpdateNode({
                      ...focusedContainer,
                      text: e.target.value
                    });
                  }}
                  className="text-sm font-sans font-extrabold text-slate-800 dark:text-slate-100 bg-transparent border-b border-dashed border-amber-300 dark:border-amber-800 focus:border-amber-500 focus:outline-none focus:ring-0 px-0.5 py-0 min-w-0 max-w-[130px] sm:max-w-[200px]"
                  placeholder="Имя контейнера"
                />
              </div>
            </div>
            
            <div className="w-[1px] h-8 bg-slate-200 dark:bg-slate-800 shrink-0" />
            
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {completedChildren}/{totalChildren} Выполнено
                </span>
                <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              
              <button
                onClick={() => {
                  autoFitContainer(focusedContainerId);
                  // Focus the camera on the container instead of resetting to central task coordinate (0,0)
                  const targetZoom = 0.85;
                  setZoom(targetZoom);
                  setPanX(-focusedContainer.x * targetZoom);
                  setPanY(-focusedContainer.y * targetZoom);
                  onSelectNode(focusedContainer.id);
                  setFocusedContainerId(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg text-[11px] font-extrabold transition-all duration-200 cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
              >
                <Minimize2 className="w-3.5 h-3.5 text-rose-500" />
                Вернуться
              </button>
            </div>
          </div>
        );
      })()}
      {/* Floating Canvas UI Controls */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={onOpenSidebar}
          title="Открыть боковую панель"
          className="lg:hidden p-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden lg:flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
          <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
            Перемещение: ЛКМ / Жест. Масштаб:
          </span>
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-1 bg-indigo-50 dark:bg-indigo-950/40 rounded">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      <div className="absolute bottom-4 left-2 right-2 sm:right-auto sm:left-4 z-10 flex flex-wrap items-center justify-center sm:justify-start gap-1 sm:gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 sm:p-2 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md max-w-[calc(100vw-16px)] sm:max-w-none">
        <button
          onClick={handleZoomIn}
          title="Приблизить"
          className="p-1.5 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          title="Отдалить"
          className="p-1.5 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />
        <button
          onClick={handleRecenter}
          title="По центру"
          className="p-1.5 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer shrink-0"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="hidden sm:inline">Сбросить</span>
        </button>

        <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />
        <button
          onClick={() => {
            let cx = 0;
            let cy = 0;
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              cx = rect.width / 2;
              cy = rect.height / 2;
            }
            const x = Math.round(-panX / zoom);
            const y = Math.round(-panY / zoom);
            onAddFloatingNode(x, y, focusedContainerId);
          }}
          title={focusedContainerId ? "Создать новую задачу внутри текущего контейнера" : "Создать независимую плавующую задачу по центру холста (или дважды кликните на пустом месте)"}
          className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 text-xs font-semibold select-none cursor-pointer border text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-350 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-transparent hover:border-emerald-200 dark:hover:border-emerald-900/40 shrink-0"
        >
          <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
          <span className="hidden sm:inline">{focusedContainerId ? 'Создать задачу' : 'Плавающая задача'}</span>
          <span className="sm:hidden">{focusedContainerId ? 'Задача' : 'Плавающая'}</span>
        </button>

        {!focusedContainerId && (
          <>
            <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />
            <button
              onClick={() => {
                const x = Math.round(-panX / zoom);
                const y = Math.round(-panY / zoom);
                onAddContainerNode(x, y);
              }}
              title="Создать контейнер. В него можно вкладывать другие задачи для совместного перемещения и свертывания"
              className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 text-xs font-semibold select-none cursor-pointer border text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-350 hover:bg-amber-50 dark:hover:bg-amber-950/20 border-transparent hover:border-amber-200 dark:hover:border-amber-900/40 shrink-0"
            >
              <span>📦</span>
              <span className="hidden sm:inline">Создать контейнер</span>
              <span className="sm:hidden">Контейнер</span>
            </button>
          </>
        )}
      </div>

      {/* Origin coordinates center dot (0, 0) */}
      <div 
        className="absolute left-1/2 top-1/2 transform pointer-events-none select-none"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transition: isTransitioningTransform ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
        }}
      >
        <div className="w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-slate-300 dark:bg-slate-800 flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-white dark:bg-slate-950" />
        </div>
      </div>

      {/* Infinite Canvas transform container */}
      <div 
        className="absolute left-1/2 top-1/2 h-0 w-0 overflow-visible origin-center"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transition: isTransitioningTransform ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
        }}
      >
        {/* SVG connection lines render */}
        <svg className="absolute inset-0 pointer-events-none overflow-visible w-1 h-1">
          {connections.map(({ child, parent }) => {
            const pathColor = child.color || parent.color || '#818cf8';
            const isSelected = selectedNodeId === child.id || selectedNodeId === parent.id;
            const isConnectionDimmed = isAnyFilterActive && (!isNodeMatched(child) || !isNodeMatched(parent));
            return (
              <g 
                key={`conn-${child.id}`}
                style={{ opacity: isConnectionDimmed ? 0.15 : 1 }}
                className="transition-opacity duration-300"
              >
                {/* Thick glow under the connection when selected */}
                {isSelected && (
                  <path
                    d={getBezierPath(parent.x, parent.y, child.x, child.y)}
                    fill="none"
                    stroke={pathColor}
                    strokeWidth={6}
                    strokeLinecap="round"
                    className="opacity-20 blur-[1px] transition-all duration-200"
                  />
                )}
                
                {/* Regular connection path */}
                <path
                  d={getBezierPath(parent.x, parent.y, child.x, child.y)}
                  fill="none"
                  stroke={pathColor}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeLinecap="round"
                  className="transition-all duration-200"
                />
                
                {/* Fancy connector indicator arrow / circle */}
                <circle
                  cx={child.x}
                  cy={child.y}
                  r={4}
                  fill={pathColor}
                  className="transition-all"
                />
              </g>
            );
          })}
        </svg>

        {/* Task Nodes Render */}
        {visibleNodes.map((node) => {
          const isSelected = selectedNodeId === node.id;

          if (node.isContainer) {
            const isSelfFocused = focusedContainerId === node.id;
            if (isSelfFocused) return null; // Hide the container visual boundaries entirely to let it replace the canvas!

            const containerChildren = nodes.filter(n => n.parentId === node.id);
            const totalChildren = containerChildren.length;
            const completedChildren = containerChildren.filter(n => n.completed).length;
            const containerProgress = totalChildren > 0 ? Math.round((completedChildren / totalChildren) * 100) : 0;
            const isContainerSelected = isSelected;
            const isContainerCollapsed = !!node.collapsed;
            const isDraggingThisNode = draggingNodeId === node.id || (isLongPressDragging && potentialDragNodeIdRef.current === node.id);
            const matches = isNodeMatched(node);
            const isDimmed = isAnyFilterActive && !matches;

            return (
              <div
                key={node.id}
                data-node-id={node.id}
                style={{
                  left: node.x,
                  top: node.y,
                  transform: 'translate(-50%, -50%)',
                  zIndex: isContainerSelected ? 30 : 2, 
                  width: isContainerCollapsed ? '220px' : `${node.width || 520}px`,
                  height: isContainerCollapsed ? '100px' : `${node.height || 400}px`,
                }}
                className={`absolute rounded-2xl border-2 ${(isDraggingThisNode || resizingNodeId === node.id) ? '' : 'transition-all duration-150'} ${
                  isDimmed ? 'opacity-20 dark:opacity-15 grayscale-[50%] scale-95 duration-300' : ''
                } ${
                  hoverTargetId === node.id
                    ? 'bg-amber-50/20 dark:bg-amber-950/20 border-amber-500 ring-4 ring-amber-500/30 scale-[1.015]'
                    : isContainerSelected
                      ? 'bg-slate-50/40 dark:bg-slate-900/40 border-amber-500 shadow-lg ring-4 ring-amber-500/20'
                      : 'bg-slate-50/10 dark:bg-slate-900/15 border-slate-300 dark:border-slate-800 shadow-sm hover:border-slate-400 dark:hover:border-slate-700'
                } flex flex-col`}
                onMouseDown={(e) => startDragNode(e, node)}
                onClick={(e) => {
                  if (hasDraggedNode) return;
                  e.stopPropagation();
                  onSelectNode(node.id);
                }}
              >
                {/* Header of Container Canvas */}
                <div className={`p-3 flex items-center justify-between border-b ${isContainerSelected ? 'border-amber-200 dark:border-amber-900/50' : 'border-slate-200/80 dark:border-slate-800'} rounded-t-2xl bg-white/40 dark:bg-slate-950/40 select-none pb-2.5`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-amber-500 dark:text-amber-400 shrink-0 text-sm">
                      📦
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate font-sans tracking-wide">
                      {node.text || 'Новый холст-контейнер'}
                    </span>
                  </div>
                  
                  {/* Container Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* Add child task/branch inside container */}
                    {!node.collapsed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddChildNode(node.id);
                        }}
                        title="Добавить задачу внутрь контейнера"
                        className="p-1 rounded-md text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-350 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Focus Mode toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (focusedContainerId === node.id) {
                          setFocusedContainerId(null);
                        } else {
                          setFocusedContainerId(node.id);
                          // pan and zoom to center it nicely
                          const centerZoom = 0.85;
                          setZoom(centerZoom);
                          setPanX(-node.x * centerZoom);
                          setPanY(-node.y * centerZoom);
                          onSelectNode(node.id);
                        }
                      }}
                      title={focusedContainerId === node.id ? "Выйти из режима фокусировки" : "Раскрыть на весь экран (режим фокусировки)"}
                      className={`p-1 rounded-md transition-all cursor-pointer ${
                        focusedContainerId === node.id
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/60 ring-2 ring-amber-500/20'
                          : 'text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {focusedContainerId === node.id ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                    {/* Expand/Collapse Container */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleNodeCollapse(node.id);
                      }}
                      title={node.collapsed ? "Развернуть контейнер" : "Свернуть контейнер"}
                      className="p-1 rounded-md text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${node.collapsed ? '-rotate-90' : 'rotate-0'}`} />
                    </button>
                    {/* Delete Container */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNode(node.id);
                      }}
                      title="Удалить контейнер"
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-850 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Body / Workspace Area */}
                <div className="relative flex-1 p-3 flex flex-col justify-between min-h-0 bg-transparent rounded-b-2xl">
                  {isContainerCollapsed ? (
                    <div className="flex-1 flex flex-col items-center justify-center select-none">
                      <span className="text-[10px] bg-amber-100/85 dark:bg-amber-950 text-amber-800 dark:text-amber-400 px-2.5 py-1 rounded-full font-bold">
                        📦 Свернуто: {totalChildren} задач ({containerProgress}%)
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Removed empty container guide labels */}

                      {/* Small dynamic status overview bar at the bottom */}
                      <div className="mt-auto pt-2 border-t border-slate-100/40 dark:border-slate-800/40 flex items-center justify-between select-none bg-white/20 dark:bg-slate-950/20 px-2 py-1.5 rounded-lg z-10">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setNotesModalNodeId(node.id);
                            }}
                            className="text-[9px] text-slate-500 dark:text-slate-400 hover:text-amber-600 shadow-sm flex items-center gap-1 py-0.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-all font-semibold cursor-pointer border border-slate-205 dark:border-slate-750 bg-white/50 dark:bg-slate-900/50"
                          >
                            <FileText className="w-3 h-3 text-amber-500" /> Описание
                          </button>

                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 font-sans">
                            {totalChildren} задач ({completedChildren} выполнено)
                          </span>
                        </div>
                        
                        <div className="w-24 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-amber-500 transition-all duration-300"
                            style={{ width: `${containerProgress}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Resize Handles for container from all sides */}
                {!isContainerCollapsed && (
                  <>
                    {/* Top border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'n')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'n')}
                      className="absolute -top-1 left-2 right-2 h-2 cursor-ns-resize z-30 select-none hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-colors duration-150"
                      title="Изменить высоту (вверх)"
                    />
                    {/* Bottom border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 's')}
                      onTouchStart={(e) => startResizeTouch(e, node, 's')}
                      className="absolute -bottom-1 left-2 right-2 h-2 cursor-ns-resize z-30 select-none hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-colors duration-150"
                      title="Изменить высоту (вниз)"
                    />
                    {/* Left border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'w')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'w')}
                      className="absolute top-2 bottom-2 -left-1 w-2 cursor-ew-resize z-30 select-none hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-colors duration-150"
                      title="Изменить ширину (влево)"
                    />
                    {/* Right border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'e')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'e')}
                      className="absolute top-2 bottom-2 -right-1 w-2 cursor-ew-resize z-30 select-none hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-colors duration-150"
                      title="Изменить ширину (вправо)"
                    />

                    {/* Top-Left corner resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'nw')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'nw')}
                      className="absolute -top-1.5 -left-1.5 w-4 h-4 cursor-nwse-resize z-40 select-none hover:bg-amber-500/40 active:bg-amber-500/60 rounded-full border border-amber-500/20 transition-colors duration-150"
                      title="Изменить размер (сверху-слева)"
                    />
                    {/* Top-Right corner resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'ne')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'ne')}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 cursor-nesw-resize z-40 select-none hover:bg-amber-500/40 active:bg-amber-500/60 rounded-full border border-amber-500/20 transition-colors duration-150"
                      title="Изменить размер (сверху-справа)"
                    />
                    {/* Bottom-Left corner resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'sw')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'sw')}
                      className="absolute -bottom-1.5 -left-1.5 w-4 h-4 cursor-nesw-resize z-40 select-none hover:bg-amber-500/40 active:bg-amber-500/60 rounded-full border border-amber-500/20 transition-colors duration-150"
                      title="Изменить размер (снизу-слева)"
                    />
                    {/* Bottom-Right corner resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'se')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'se')}
                      className="absolute -bottom-1.5 -right-1.5 w-4 h-4 cursor-nwse-resize z-40 select-none hover:bg-amber-500/40 active:bg-amber-500/60 rounded-full border border-amber-500/20 transition-colors duration-150 flex items-center justify-center p-0.5"
                      title="Изменить размер (снизу-справа)"
                    >
                      <svg width="6" height="6" viewBox="0 0 6 6" className="text-amber-600 dark:text-amber-400 opacity-60">
                        <line x1="6" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                        <line x1="6" y1="3" x2="3" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                      </svg>
                    </div>
                  </>
                )}

                {/* Hover reparent highlight notification */}
                {hoverTargetId === node.id && (
                  <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-amber-600 text-white px-3 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase animate-bounce shadow-md whitespace-nowrap z-50">
                    Поместить на холст-контейнер
                  </div>
                )}
              </div>
            );
          }
const pInfo = getPriorityInfo(node.priority);
          const hasNotes = node.notes.trim().length > 0;
          const hasFiles = node.files.length > 0;
          const isRoot = node.parentId === null && !node.isFloating;
          const hasChildren = nodes.some(n => n.parentId === node.id);
          const isLeftBranch = !isRoot && node.x < 0;
          const isDraggingThisNode = draggingNodeId === node.id || (isLongPressDragging && potentialDragNodeIdRef.current === node.id);
          const matches = isNodeMatched(node);
          const isDimmed = isAnyFilterActive && !matches;

          const currentParentForNode = node.parentId ? nodes.find(p => p.id === node.parentId) : null;
          const showDetachHint = isDraggingThisNode && currentParentForNode && (() => {
            const dx = Math.abs(node.x - currentParentForNode.x);
            const dy = Math.abs(node.y - currentParentForNode.y);
            
            if (currentParentForNode.isContainer) {
              if (focusedContainerId) {
                const maxW = (currentParentForNode.width || 520) / 2 + 400;
                const maxH = (currentParentForNode.height || 400) / 2 + 400;
                return dx > maxW || dy > maxH;
              } else {
                const maxW = (currentParentForNode.width || 520) / 2;
                const maxH = (currentParentForNode.height || 400) / 2;
                return dx > maxW || dy > maxH;
              }
            } else {
              const dist = Math.sqrt(dx * dx + dy * dy);
              return dist > 330;
            }
          })();

          return (
            <div
              key={node.id}
              data-node-id={node.id}
              style={{
                left: node.x,
                top: node.y,
                transform: 'translate(-50%, -50%)',
                zIndex: isSelected ? 30 : 10,
              }}
              className={`absolute group cursor-grab active:cursor-grabbing w-[210px] rounded-xl border ${isDraggingThisNode ? '' : 'transition-all duration-150'} ${
                isDimmed 
                  ? 'opacity-20 dark:opacity-15 grayscale-[50%] scale-95 hover:opacity-90 hover:grayscale-0 hover:scale-100 duration-300' 
                  : ''
              } ${
                hoverTargetId === node.id
                  ? 'bg-indigo-50/10 dark:bg-indigo-950/20 border-indigo-500 ring-4 ring-indigo-500 scale-[1.03] shadow-[0_0_15px_rgba(99,102,241,0.4)] animate-pulse'
                  : isRoot
                    ? isSelected
                      ? 'bg-indigo-600 dark:bg-indigo-800 text-white border-transparent ring-4 ring-indigo-250 dark:ring-indigo-900 shadow-xl'
                      : 'bg-indigo-600 dark:bg-indigo-800 text-white border-transparent shadow-md hover:shadow-lg hover:scale-[1.02]'
                    : priorityViewActive
                      ? `bg-white dark:bg-slate-900 ${getPriorityCardStyles(node.priority, isSelected)}`
                      : isSelected 
                        ? 'bg-white dark:bg-slate-900 border-indigo-600 dark:border-indigo-500 ring-4 ring-indigo-50 dark:ring-indigo-950/40 shadow-lg' 
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-650 shadow-sm'
              } ${node.completed ? 'opacity-85' : isOverdue(node.dueDate) ? 'border-red-400 dark:border-red-900/60 shadow-[0_0_10px_rgba(239,68,68,0.25)] bg-red-50/10 dark:bg-red-950/5' : ''}`}
              onMouseDown={(e) => startDragNode(e, node)}
              onClick={(e) => {
                if (hasDraggedNode) return; // ignore click if dragged
                e.stopPropagation();
                onSelectNode(node.id);
              }}
            >
              {showDetachHint && (
                <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-rose-600 text-white px-3 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase animate-bounce shadow-md whitespace-nowrap z-50 flex items-center gap-1">
                  <span>Отпустите для отсоединения</span>
                  <span>✂️</span>
                </div>
              )}
              {hoverTargetId === node.id && (
                <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase animate-bounce shadow-md whitespace-nowrap z-50">
                  Сделать родительской
                </div>
              )}

              {/* Optional colored status line - only on child nodes */}
              {!isRoot && node.color && (
                <div 
                  className="h-1 rounded-t-[10px] w-full"
                  style={{ backgroundColor: node.color }}
                />
              )}

              {/* Card Title & Checkbox */}
              <div className="p-3">
                {isRoot && (
                  <p className="text-[8px] font-bold text-indigo-200 uppercase tracking-widest mb-1">
                    Главная цель / Идея
                  </p>
                )}
                <div className="flex items-start gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleNodeCompleted(node.id);
                    }}
                    title={node.completed ? "Отметить невыполненной" : "Отметить выполненной"}
                    className={`mt-0.5 cursor-pointer transition-colors ${
                      isRoot 
                        ? 'text-indigo-300 hover:text-white' 
                        : 'text-slate-400 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400'
                    }`}
                  >
                    {node.completed ? (
                      isRoot ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-300 fill-indigo-800/50" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-emerald-50 dark:fill-emerald-950/30" />
                      )
                    ) : (
                      isRoot ? (
                        <Circle className="w-4 h-4 text-indigo-400 grayscale contrast-125" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 dark:text-slate-705" />
                      )
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold leading-snug font-sans break-words ${
                      isRoot 
                        ? 'text-white' 
                        : 'text-slate-800 dark:text-slate-100'
                    } ${node.completed ? 'line-through opacity-60 italic' : ''}`}>
                      {node.text || 'Без названия'}
                    </p>
                  </div>
                </div>

                {!node.isCardCollapsed ? (
                  <>
                    {/* Priority & Badge Stats Row */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      {!isRoot && (
                        <span className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${pInfo.bg}`}>
                          <span className={`w-1 h-1 rounded-full ${pInfo.dot}`} />
                          {pInfo.label}
                        </span>
                      )}

                      {node.dueDate && (
                        <span 
                          className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                            node.completed
                              ? isRoot
                                ? 'bg-indigo-700/50 text-indigo-200 border-indigo-500/30'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-505 border-slate-200 dark:border-slate-800'
                              : isOverdue(node.dueDate)
                                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-900/60 animate-pulse font-extrabold shadow-[0_0_6px_rgba(244,63,94,0.3)]'
                                : isRoot
                                  ? 'bg-indigo-500/20 text-indigo-100 border-indigo-400/30'
                                  : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-250 dark:border-emerald-900'
                          }`}
                          title={
                            node.completed 
                              ? `Срок выполнения: ${formatDisplayDate(node.dueDate)} (Выполнено)`
                              : isOverdue(node.dueDate)
                                ? `Внимание! Срок выполнения истек: ${formatDisplayDate(node.dueDate)}`
                                : `Срок выполнения: ${formatDisplayDate(node.dueDate)}`
                          }
                        >
                          {isOverdue(node.dueDate) && !node.completed ? (
                            <AlertTriangle className="w-2.5 h-2.5 text-rose-500 animate-bounce" />
                          ) : (
                            <Calendar className="w-2.5 h-2.5 text-indigo-500 dark:text-indigo-400" />
                          )}
                          <span>{formatDisplayDate(node.dueDate)}</span>
                        </span>
                      )}

                      {hasNotes && (
                        <span 
                          className={`inline-flex items-center text-[9px] px-1 py-0.5 ${
                            isRoot ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'
                          }`} 
                          title="Есть описание"
                        >
                          <FileText className="w-3 h-3 opacity-80" />
                        </span>
                      )}

                      {hasFiles && (
                        <span 
                          className={`inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            isRoot 
                              ? 'bg-indigo-700/60 text-indigo-100 border-indigo-500/30' 
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-405 border-slate-200 dark:border-slate-755'
                          }`}
                          title={`${node.files.length} прикрепленных файла(ов)`}
                        >
                          <Paperclip className="w-2.5 h-2.5" />
                          {node.files.length}
                        </span>
                      )}
                    </div>

                    {/* Subtask Progress Bar for nodes with children */}
                    {hasChildren && (() => {
                      const progressPercent = calculateProgress(node.id, nodes) || 0;
                      return (
                        <div className="mt-2.5 mb-1 space-y-1" title={`Прогресс подзадач: ${progressPercent}%`}>
                          <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                            <span>Прогресс</span>
                            <span className="font-mono">{progressPercent}%</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-300 ${isRoot ? 'bg-indigo-300' : 'bg-indigo-600 dark:bg-indigo-500'}`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Tags block */}
                    {node.tags && node.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {node.tags.map((tag) => {
                          const matchedCategory = tagCategories.find(cat => cat.tags && cat.tags.includes(tag));
                          const color = matchedCategory?.color;
                          
                          // Style based on whether a category is found with this tag
                          const style = color && !isRoot ? {
                            backgroundColor: `${color}18`,
                            color: color,
                            border: `1px solid ${color}35`
                          } : undefined;

                          return (
                            <span 
                              key={tag}
                              style={style}
                              className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-md select-none transition-all ${
                                isRoot 
                                  ? 'bg-indigo-700 text-indigo-100 opacity-90' 
                                  : color 
                                    ? '' 
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-transparent'
                              }`}
                            >
                              #{tag}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 mt-2 text-[9px] text-slate-400 dark:text-slate-500 font-medium select-none">
                    <span className="px-1 text-[8px] font-extrabold uppercase bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-550 rounded border border-slate-250 dark:border-slate-750">
                      Свернуто
                    </span>
                    {hasChildren && (
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        • {countDescendants(node.id, nodes)} подзадач
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons appearing on task selection/click - "Добавить дочернюю задачу", "Заметки", "добавить файл", "Удалить" */}
              {isSelected && draggingNodeId === null && potentialDragNodeIdRef.current === null && (
                <div 
                  data-drag-ignore
                  className="absolute -bottom-11 left-1/2 transform -translate-x-1/2 flex items-center gap-1 px-1.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-[0_8px_25px_-4px_rgba(99,102,241,0.25)] dark:shadow-[0_8px_25px_-4px_rgba(0,0,0,0.6)] z-50 pointer-events-auto whitespace-nowrap animate-fade-in"
                >
                  {/* Button 1: Добавить дочернюю задачу */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChildNode(node.id);
                    }}
                    title="Добавить дочернюю задачу"
                    className="flex items-center justify-center w-7 h-7 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 1.2: Свернуть / Развернуть детали карточки */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateNode({
                        ...node,
                        isCardCollapsed: !node.isCardCollapsed
                      });
                    }}
                    title={node.isCardCollapsed ? "Развернуть детали карточки" : "Свернуть детали карточки"}
                    className="flex items-center justify-center w-7 h-7 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    {node.isCardCollapsed ? (
                      <FolderPlus className="w-4 h-4 text-indigo-500" />
                    ) : (
                      <FolderMinus className="w-4 h-4 text-slate-500" />
                    )}
                  </button>

                  {node.parentId !== null && (
                    <>
                      <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
                      {/* Button 1.5: Отсоединить задачу */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNodeParent(node.id, null);
                        }}
                        title="Отсоединить задачу от родительской (сделать свободной)"
                        className="flex items-center justify-center w-7 h-7 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                      >
                        <Link2Off className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 2: Заметки */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotesModalNodeId(node.id);
                    }}
                    title="Открыть заметки"
                    className="flex items-center justify-center w-7 h-7 text-emerald-600 dark:text-emerald-450 hover:bg-emerald-55 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 2.5: Открыть всю задачу (Eye) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDrawer();
                    }}
                    title="Открыть всю задачу"
                    className="flex items-center justify-center w-7 h-7 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 3: Добавить файл */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFileUploadNodeId(node.id);
                      setTimeout(() => {
                        if (cardFileInputRef.current) {
                          cardFileInputRef.current.click();
                        }
                      }, 50);
                    }}
                    title="Прикрепить файл"
                    className="flex items-center justify-center w-7 h-7 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {!isRoot && (
                    <>
                      <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                      {/* Button 4: Удалить */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNode(node.id);
                        }}
                        title="Удалить ветвь"
                        className="flex items-center justify-center w-7 h-7 text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Collapse/Expand sub-branch trigger overlay */}
              {hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleNodeCollapse(node.id);
                  }}
                  title={node.collapsed ? "Развернуть ветвь подзадач" : "Свернуть ветвь подзадач"}
                  className={`absolute top-1/2 -translate-y-1/2 z-40 flex items-center justify-center rounded-full border shadow-md transition-all duration-300 hover:scale-115 cursor-pointer ${
                    node.collapsed
                      ? 'px-1.5 h-6 text-[10px] font-bold bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:border-indigo-900 dark:text-indigo-400'
                      : 'w-5 h-5 bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-350 hover:text-indigo-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                  } ${
                    isLeftBranch ? '-left-2.5' : '-right-2.5'
                  }`}
                >
                  {node.collapsed ? (
                    <span className="flex items-center gap-0.5 pointer-events-none">
                      <Plus className="w-2.5 h-2.5 stroke-[3px]" />
                      <span>{countDescendants(node.id, nodes)}</span>
                    </span>
                  ) : (
                    <ChevronDown className={`w-3.5 h-3.5 pointer-events-none transition-transform ${isLeftBranch ? 'rotate-90' : '-rotate-90'}`} />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {priorityViewActive && (
        <div className="absolute bottom-4 right-4 z-10 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg select-none pointer-events-auto">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Цвета приоритетов
          </p>
          <div className="space-y-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
              <span>Критический (Urgent)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
              <span>Высокий (High)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.4)]" />
              <span>Средний (Medium)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-[0_0_6px_rgba(20,184,166,0.3)]" />
              <span>Низкий (Low)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="text-slate-400 dark:text-slate-500">Без приоритета</span>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for file uploading in nodes */}
      <input 
        type="file"
        ref={cardFileInputRef}
        onChange={handleCardFileUpload}
        className="hidden pointer-events-none"
      />

      {/* Edit Notes & Properties Modal */}
      {notesModalNodeId && (() => {
        const node = nodes.find(n => n.id === notesModalNodeId);
        if (!node) return null;

        const isRootNode = node.parentId === null && !node.isFloating;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in pointer-events-auto">
            <div 
              data-drag-ignore
              className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest font-sans flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" /> Заметки и файлы задачи
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-sans mt-0.5">
                    {isRootNode ? 'Основная ветвь проекта' : node.isFloating ? 'Независимая плавающая задача' : 'Второстепенная цель'}
                  </p>
                </div>
                <button 
                  onClick={() => setNotesModalNodeId(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-705 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Title renaming field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">
                    Название ветви / задачи
                  </label>
                  <input
                    type="text"
                    value={node.text}
                    onChange={(e) => onUpdateNode({ ...node, text: e.target.value })}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
                    placeholder="Введите текст..."
                  />
                </div>

                {/* Priority Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">
                    Приоритет задачи
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => {
                      const isActive = node.priority === p;
                      const label = p === 'urgent' ? 'Крит.' : p === 'high' ? 'Высок.' : p === 'medium' ? 'Средн.' : 'Низк.';
                      const colorClass = p === 'urgent' ? 'border-rose-350 text-rose-600 bg-rose-50 dark:bg-rose-950/20' : 
                                         p === 'high' ? 'border-amber-350 text-amber-600 bg-amber-50 dark:bg-amber-950/20' :
                                         p === 'medium' ? 'border-blue-350 text-blue-600 bg-blue-50 dark:bg-blue-950/20' :
                                         'border-teal-350 text-teal-600 bg-teal-50 dark:bg-teal-950/20';
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => onUpdateNode({ ...node, priority: p })}
                          className={`px-2 py-1.5 border rounded-lg text-xs font-bold text-center transition-all cursor-pointer ${
                            isActive ? `${colorClass} ring-2 ring-indigo-500` : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes textarea */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">
                    Заметки и описание
                  </label>
                  <textarea
                    value={node.notes || ''}
                    onChange={(e) => onUpdateNode({ ...node, notes: e.target.value })}
                    rows={5}
                    className="w-full text-xs font-medium px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 font-sans leading-relaxed"
                    placeholder="Здесь можно записать любые идеи, подзадачи, шаги, ссылки или текстовую справку к этой задаче..."
                  />
                </div>

                {/* Attachments & Upload list */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">
                      Прикрепленные файлы
                    </label>
                    
                    {/* Add file button in modal */}
                    <button
                      onClick={() => {
                        setFileUploadNodeId(node.id);
                        setTimeout(() => {
                          if (cardFileInputRef.current) {
                            cardFileInputRef.current.click();
                          }
                        }, 50);
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Прикрепить файл</span>
                    </button>
                  </div>

                  {fileError && (
                    <div className="text-xs text-rose-500 border border-rose-250 bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded-lg animate-pulse">
                      {fileError}
                    </div>
                  )}

                  {node.files && node.files.length > 0 ? (
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                      {node.files.map((file) => (
                        <div 
                          key={file.id} 
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-750 text-xs text-slate-700 dark:text-slate-300"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                            <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate font-medium">{file.name}</span>
                            <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 flex-shrink-0">
                              ({formatFileSize(file.size)})
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Download */}
                            <a
                              href={file.dataUrl}
                              download={file.name}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                              title="Скачать файл"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>

                            {/* Remove */}
                            <button
                              onClick={() => {
                                const updatedFiles = node.files.filter(f => f.id !== file.id);
                                onUpdateNode({ ...node, files: updatedFiles });
                              }}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-rose-500 hover:text-rose-600"
                              title="Удалить файл"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-xs text-slate-400 dark:text-slate-500 italic font-sans animate-fade-in">
                      Нет прикрепленных файлов.
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-150 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setNotesModalNodeId(null)}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Готово
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
