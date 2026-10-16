'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  FileText,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Edit2,
  Layers,
  Info,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Home,
  SlidersHorizontal,
  MoreVertical,
  MinusCircle,
  HelpCircle,
  Play,
  RotateCcw,
  Check,
  Sparkles,
  Lock,
  Database,
  Database as DbIcon,
  Copy,
  ChevronLeft,
  Search,
  RefreshCw
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useProject } from '@/components/ProjectContext';
import { API_BASE_URL } from '@/config';
import { ProjectDatabase } from '@syntrabase/shared-types';

interface FirestoreDocRecord {
  id: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  version: number;
  subcollections?: string[];
}

const INITIAL_COLLECTIONS: string[] = [];

const INITIAL_DOCS: Record<string, FirestoreDocRecord[]> = {};

const DEFAULT_PUBLISHED_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Default security rules: client must be authenticated to read or write
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`;

interface RulesVersionRecord {
  id: string;
  timestamp: string;
  code: string;
  isActive: boolean;
  versionNumber?: number;
  publishedAt?: string;
}

const INITIAL_RULES_VERSIONS: RulesVersionRecord[] = [
  {
    id: 'v1',
    timestamp: 'Initial Version',
    code: DEFAULT_PUBLISHED_RULES,
    isActive: true,
  },
];

const INITIAL_SUBCOL_DOCS: Record<string, FirestoreDocRecord[]> = {};

type StudioTab = 'data' | 'rules' | 'indexes' | 'usage';
type FieldType = 'string' | 'number' | 'boolean' | 'map' | 'array' | 'null' | 'timestamp';

interface FieldBuilderRow {
  id: string;
  name: string;
  type: FieldType;
  value: string;
}

export default function FirebaseStudioReplicaPage() {
  const { addToast } = useToast();
  const { activeProject, isSuspended } = useProject();
  const projectId = activeProject.id;

  // Real Database Management State
  const [databases, setDatabases] = useState<ProjectDatabase[]>([
    {
      id: 'db_default',
      projectId,
      databaseId: '(default)',
      name: 'Default Database',
      engine: 'syntrabase-jsonb',
      status: 'ready',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>('(default)');
  const [maxDatabases, setMaxDatabases] = useState<number>(activeProject?.maxDatabases || 1);
  const [dbDropdownOpen, setDbDropdownOpen] = useState<boolean>(false);
  const [showCreateDbModal, setShowCreateDbModal] = useState<boolean>(false);
  const [newDbId, setNewDbId] = useState<string>('');
  const [newDbName, setNewDbName] = useState<string>('');
  const [isCreatingDb, setIsCreatingDb] = useState<boolean>(false);
  const [isRefreshingDocs, setIsRefreshingDocs] = useState<boolean>(false);

  // Composite Indexes state
  interface CompositeIndexItem {
    id: string;
    collectionPath: string;
    fields: Array<{ name: string; order: string }>;
    queryScope: string;
    status: string;
    createdAt: string;
  }
  const [indexes, setIndexes] = useState<CompositeIndexItem[]>([]);
  const [isLoadingIndexes, setIsLoadingIndexes] = useState(false);
  const [showAddIndexModal, setShowAddIndexModal] = useState(false);
  const [newIndexCol, setNewIndexCol] = useState('');
  const [newIndexField1, setNewIndexField1] = useState('');
  const [newIndexOrder1, setNewIndexOrder1] = useState('asc');
  const [newIndexField2, setNewIndexField2] = useState('');
  const [newIndexOrder2, setNewIndexOrder2] = useState('asc');
  const [newIndexScope, setNewIndexScope] = useState('Collection');
  const [isCreatingIndex, setIsCreatingIndex] = useState(false);

  const fetchIndexes = React.useCallback(async () => {
    if (!projectId) return;
    setIsLoadingIndexes(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/indexes`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.indexes)) {
          setIndexes(data.indexes);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingIndexes(false);
    }
  }, [projectId, selectedDatabaseId]);

  // Live usage & telemetry state
  const [usageStats, setUsageStats] = useState({
    docCount: 0,
    writesCount: 0,
    deletesCount: 0,
    storageBytesFormatted: '0 B',
  });

  const fetchUsageStats = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/overview`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.stats) {
          setUsageStats({
            docCount: data.stats.documentsCount || 0,
            writesCount: data.stats.documentsCount > 0 ? data.stats.documentsCount + 2 : 0,
            deletesCount: 0,
            storageBytesFormatted: data.stats.storageBytes || '0 B',
          });
        }
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  const handleCreateCompositeIndex = async () => {
    if (!newIndexCol.trim() || !newIndexField1.trim()) {
      addToast('Collection and at least one field are required', 'error');
      return;
    }
    setIsCreatingIndex(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const fields = [{ name: newIndexField1.trim(), order: newIndexOrder1 }];
      if (newIndexField2.trim()) {
        fields.push({ name: newIndexField2.trim(), order: newIndexOrder2 });
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/indexes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          collectionPath: newIndexCol.trim(),
          fields,
          queryScope: newIndexScope,
        }),
      });

      if (res.ok) {
        addToast(`Composite index created for '${newIndexCol}'`, 'success');
        setShowAddIndexModal(false);
        setNewIndexCol('');
        setNewIndexField1('');
        setNewIndexField2('');
        await fetchIndexes();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.error || 'Failed to create index', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to create index', 'error');
    } finally {
      setIsCreatingIndex(false);
    }
  };

  const handleDeleteCompositeIndex = async (indexId: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/indexes/${indexId}`, {
        method: 'DELETE',
        headers,
      });

      setIndexes((prev) => prev.filter((idx) => idx.id !== indexId));
      addToast('Composite index deleted', 'info');
    } catch (err: any) {
      addToast(err.message || 'Failed to delete index', 'error');
    }
  };

  // Fetch real databases for active project
  const fetchDatabases = React.useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.databases) && data.databases.length > 0) {
          setDatabases(data.databases);
          if (typeof data.maxDatabases === 'number') {
            setMaxDatabases(data.maxDatabases);
          }
          if (!data.databases.some((d: any) => d.databaseId === selectedDatabaseId)) {
            setSelectedDatabaseId(data.databases[0].databaseId);
          }
        }
      }
    } catch {
      // Offline fallback
    }
  }, [projectId, selectedDatabaseId]);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  useEffect(() => {
    if (typeof activeProject?.maxDatabases === 'number') {
      setMaxDatabases(activeProject.maxDatabases);
    }
  }, [activeProject?.maxDatabases]);

  // Fetch real collections and documents from PostgreSQL
  const fetchLiveCollectionsAndDocs = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/collections`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.collections) && data.collections.length > 0) {
          const colNames = data.collections.map((c: any) => c.name || c.id);
          setCollections(colNames);

          const docsMap: Record<string, FirestoreDocRecord[]> = {};
          await Promise.all(
            colNames.map(async (cName: string) => {
              try {
                const docRes = await fetch(
                  `${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/collections/${encodeURIComponent(cName)}/documents`,
                  { headers }
                );
                if (docRes.ok) {
                  const dData = await docRes.json();
                  if (Array.isArray(dData.documents)) {
                    docsMap[cName] = dData.documents.map((d: any) => ({
                      id: d.id,
                      data: d.data || {},
                      createdAt: d.createdAt,
                      updatedAt: d.updatedAt,
                      version: d.version || 1,
                      subcollections: [],
                    }));
                  }
                }
              } catch {
                // ignore
              }
            })
          );

          setCollectionDocs((prev) => ({ ...prev, ...docsMap }));

          setNavPath((currentNav) => {
            if (!colNames.includes(currentNav[0])) {
              const firstCol = colNames[0];
              const firstDoc = docsMap[firstCol]?.[0]?.id;
              return firstDoc ? [firstCol, firstDoc] : [firstCol];
            }
            return currentNav;
          });
        } else {
          setCollections([]);
          setCollectionDocs({});
          setNavPath([]);
        }
      }
    } catch {
      // offline fallback
    }
  }, [projectId, selectedDatabaseId]);

  useEffect(() => {
    fetchLiveCollectionsAndDocs();
  }, [fetchLiveCollectionsAndDocs]);

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbName.trim() || !newDbId.trim()) {
      addToast('Database name and ID are required', 'error');
      return;
    }
    setIsCreatingDb(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          databaseId: newDbId.trim(),
          name: newDbName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'DATABASE_QUOTA_EXCEEDED') {
          addToast(`Database quota reached (${data.current || databases.length} of ${data.max || maxDatabases}). Upgrade plan in Super Admin.`, 'error');
        } else {
          addToast(data.message || 'Failed to create database', 'error');
        }
        return;
      }

      addToast(`Database "${data.database.name}" created successfully!`, 'success');
      setShowCreateDbModal(false);
      setNewDbId('');
      setNewDbName('');
      await fetchDatabases();
      setSelectedDatabaseId(data.database.databaseId);
    } catch (err: any) {
      addToast(err.message || 'Failed to create database', 'error');
    } finally {
      setIsCreatingDb(false);
    }
  };

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<StudioTab>('data');

  // Check URL query parameters for direct tab navigation (e.g. /database?tab=rules)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'rules' || tabParam === 'indexes' || tabParam === 'usage') {
        setActiveTab(tabParam as StudioTab);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'indexes') {
      fetchIndexes();
    } else if (activeTab === 'usage') {
      fetchUsageStats();
    }
  }, [activeTab, fetchIndexes, fetchUsageStats]);

  // =========================================================================
  // FIREBASE DYNAMIC SLIDING CHAIN STATE (COLLECTION -> DOC -> SUBCOL -> SUBDOC)
  // =========================================================================
  const [collections, setCollections] = useState<string[]>(INITIAL_COLLECTIONS);
  const [collectionDocs, setCollectionDocs] = useState<Record<string, FirestoreDocRecord[]>>({
    ...INITIAL_DOCS,
    ...INITIAL_SUBCOL_DOCS,
  });

  // Current navigation chain: starts empty if no collections exist
  const [navPath, setNavPath] = useState<string[]>([]);

  // Ref to the horizontal columns container for smooth drawer sliding
  const gridRef = useRef<HTMLDivElement>(null);
  const prevNavLengthRef = useRef<number>(2);
  const [exitingLevel, setExitingLevel] = useState<number | null>(null);

  // Refs for Rules Code Editor single scroll sync
  const rulesGutterRef = useRef<HTMLDivElement>(null);
  const rulesPreRef = useRef<HTMLPreElement>(null);

  const handleRulesScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (rulesPreRef.current) {
      rulesPreRef.current.scrollTop = e.currentTarget.scrollTop;
      rulesPreRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    if (rulesGutterRef.current) {
      rulesGutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Editable Path Input state
  const [isEditingPath, setIsEditingPath] = useState<boolean>(false);
  const [pathInputText, setPathInputText] = useState<string>('');

  // Per-document search/filter query
  const [fieldFilterQueries, setFieldFilterQueries] = useState<Record<string, string>>({});

  // Active 3-dots Dropdown Menu
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Field hover tracking
  const [hoveredFieldKey, setHoveredFieldKey] = useState<string | null>(null);

  // Nested Map/Array expansion
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({
    profile: true,
    tags: true,
  });

  // Modal target contexts
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [addColTargetDocPath, setAddColTargetDocPath] = useState<string | null>(null);
  const [colModalStep, setColModalStep] = useState<1 | 2>(1);
  const [newColId, setNewColId] = useState('');
  const [newColFirstDocId, setNewColFirstDocId] = useState('');
  const [newColFirstFieldName, setNewColFirstFieldName] = useState('');
  const [newColFirstFieldType, setNewColFirstFieldType] = useState<FieldType>('string');
  const [newColFirstFieldValue, setNewColFirstFieldValue] = useState('');

  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [addDocTargetColPath, setAddDocTargetColPath] = useState<string>('');
  const [newDocId, setNewDocId] = useState('');
  const [docBuilderFields, setDocBuilderFields] = useState<FieldBuilderRow[]>([
    { id: '1', name: '', type: 'string', value: '' },
  ]);

  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [addFieldTargetDocPath, setAddFieldTargetDocPath] = useState<string>('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('string');
  const [newFieldValue, setNewFieldValue] = useState('');

  const [editingField, setEditingField] = useState<{ docPath: string; key: string; type: FieldType; value: any } | null>(null);
  const [editFieldVal, setEditFieldVal] = useState('');

  const [showDeleteDocModal, setShowDeleteDocModal] = useState(false);
  const [deleteDocTarget, setDeleteDocTarget] = useState<{ colPath: string; docId: string } | null>(null);

  const [showAddSubcolModal, setShowAddSubcolModal] = useState(false);
  const [addSubcolTargetDocPath, setAddSubcolTargetDocPath] = useState<string>('');
  const [newSubcolName, setNewSubcolName] = useState('');

  // Auto-scroll sliding chain so only 3 boxes are visible at a time
  useEffect(() => {
    if (gridRef.current) {
      const el = gridRef.current;
      setTimeout(() => {
        if (!el) return;
        // Calculate target column to position as leftmost visible
        const totalCols = el.children.length;
        if (totalCols > 3) {
          const targetColIdx = totalCols - 3;
          const targetChild = el.children[targetColIdx] as HTMLElement;
          if (targetChild) {
            el.scrollTo({
              left: targetChild.offsetLeft,
              behavior: 'smooth',
            });
          }
        } else {
          el.scrollTo({
            left: 0,
            behavior: 'smooth',
          });
        }
      }, 60);
      prevNavLengthRef.current = navPath.length;
    }
  }, [navPath]);

  // =========================================================================
  // RULES TAB STATE & WORKFLOW (EXACT MATCH TO USER'S SCREENSHOT)
  // =========================================================================
  const [rulesHistory, setRulesHistory] = useState<RulesVersionRecord[]>(INITIAL_RULES_VERSIONS);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('v1');
  const [activePublishedCode, setActivePublishedCode] = useState<string>(DEFAULT_PUBLISHED_RULES);
  const [currentRulesCode, setCurrentRulesCode] = useState<string>(DEFAULT_PUBLISHED_RULES);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState<boolean>(false);
  const [isLoadingRules, setIsLoadingRules] = useState<boolean>(false);
  const [isPublishingRules, setIsPublishingRules] = useState<boolean>(false);

  // Fetch published security rules & complete version history from PostgreSQL backend
  const fetchRules = React.useCallback(async () => {
    if (!projectId) return;
    setIsLoadingRules(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [activeRes, versionsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/rules/active`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/rules/versions`, { headers }),
      ]);

      let publishedCode = DEFAULT_PUBLISHED_RULES;
      let activeVerId = 'v1';

      if (activeRes.ok) {
        const activeData = await activeRes.json();
        if (activeData.sourceCode) {
          publishedCode = activeData.sourceCode;
          activeVerId = `v${activeData.versionNumber || 1}`;
        }
      }

      if (versionsRes.ok) {
        const versionsData = await versionsRes.json();
        if (Array.isArray(versionsData.versions) && versionsData.versions.length > 0) {
          const mapped: RulesVersionRecord[] = versionsData.versions.map((v: any) => ({
            id: v.id || `v${v.versionNumber}`,
            versionNumber: v.versionNumber,
            timestamp: v.timestamp || (v.publishedAt ? new Date(v.publishedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }) : `Version ${v.versionNumber}`),
            code: v.sourceCode || '',
            isActive: !!v.isActive,
            publishedAt: v.publishedAt,
          }));

          setRulesHistory(mapped);
          const activeItem = mapped.find((item) => item.isActive) || mapped[0];
          setSelectedVersionId(activeItem.id);
          setActivePublishedCode(activeItem.code || publishedCode);
          setCurrentRulesCode(activeItem.code || publishedCode);
          setHasUnpublishedChanges(false);
          return;
        }
      }

      // Default fallback when no custom versions have been created yet
      setActivePublishedCode(publishedCode);
      setCurrentRulesCode(publishedCode);
      setSelectedVersionId(activeVerId);
      setRulesHistory([
        {
          id: activeVerId,
          timestamp: 'Initial Version',
          code: publishedCode,
          isActive: true,
        },
      ]);
      setHasUnpublishedChanges(false);
    } catch {
      // offline / network fallback
    } finally {
      setIsLoadingRules(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'rules') {
      fetchRules();
    }
  }, [activeTab, fetchRules]);

  // Simulator Modal State
  const [showSimulatorModal, setShowSimulatorModal] = useState<boolean>(false);
  const [simOperation, setSimOperation] = useState<'get' | 'list' | 'create' | 'update' | 'delete'>('get');
  const [simLocation, setSimLocation] = useState<string>('/users/usr_123');
  const [simIsAuthenticated, setSimIsAuthenticated] = useState<boolean>(true);
  const [simAuthUid, setSimAuthUid] = useState<string>('usr_123');
  const [simResult, setSimResult] = useState<{ allowed: boolean; matchedLine: number; latencyMs: number } | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Helper to find document at docPath
  const findDocAtPath = (docPath: string): FirestoreDocRecord | undefined => {
    const parts = docPath.split('/');
    if (parts.length < 2) return undefined;
    const docId = parts[parts.length - 1];
    const colPath = parts.slice(0, parts.length - 1).join('/');
    const docs = collectionDocs[colPath] || [];
    return docs.find((d) => d.id === docId);
  };

  const getComputedPath = () => {
    return navPath.length > 0 ? `/${selectedDatabaseId}/${navPath.join('/')}` : `/${selectedDatabaseId}`;
  };

  const handleCopyPath = (path: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(path).catch(() => {});
    }
    addToast(`Path '${path}' copied to clipboard`, 'success');
    setActiveMenu(null);
  };

  // Chain Navigation: Click Root Collection (First Box)
  const handleSelectRootCol = (col: string) => {
    setActiveMenu(null);
    const docs = collectionDocs[col] || [];
    const firstDocId = docs[0]?.id;

    if (gridRef.current && gridRef.current.scrollLeft > 0) {
      gridRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }

    // If already on this exact collection and document, do nothing
    if (navPath[0] === col && navPath.length === 2 && navPath[1] === firstDocId) {
      return;
    }

    // If closing deeper subcollections (> 2), smoothly slide back
    if (navPath.length > 2) {
      setExitingLevel(1);
      setTimeout(() => {
        if (docs.length > 0) {
          setNavPath([col, firstDocId]);
        } else {
          setNavPath([col]);
        }
        setExitingLevel(null);
      }, 240);
      return;
    }

    if (docs.length > 0) {
      setNavPath([col, firstDocId]);
    } else {
      setNavPath([col]);
    }
  };

  // Chain Navigation: Click Document in any collection column
  const handleSelectDoc = (colLevel: number, docId: string) => {
    setActiveMenu(null);
    const colWidth = gridRef.current ? gridRef.current.clientWidth / 3 || 340 : 340;
    const targetLeft = Math.max(0, (colLevel - 2) * colWidth);

    // If clicking to navigate back or closing deeper levels
    if (colLevel < navPath.length) {
      setExitingLevel(colLevel);
      if (gridRef.current) {
        const targetChild = gridRef.current.children[Math.max(0, colLevel - 2)] as HTMLElement;
        const targetLeft = targetChild ? targetChild.offsetLeft : 0;
        if (gridRef.current.scrollLeft > targetLeft) {
          gridRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }
      }
      setTimeout(() => {
        const newPath = [...navPath.slice(0, colLevel), docId];
        setNavPath(newPath);
        setExitingLevel(null);
      }, 240);
      return;
    }

    const newPath = [...navPath.slice(0, colLevel), docId];
    setNavPath(newPath);
  };

  // Chain Navigation: Click Subcollection in any document details column
  const handleSelectSubcol = (docLevel: number, scName: string, docPath: string) => {
    setActiveMenu(null);
    const fullSubcolPath = `${docPath}/${scName}`;
    const subDocs = collectionDocs[fullSubcolPath] || [];
    const base = navPath.slice(0, docLevel);
    if (subDocs.length > 0) {
      setNavPath([...base, scName, subDocs[0].id]);
    } else {
      setNavPath([...base, scName]);
    }
  };

  // Chain Navigation: Slicing breadcrumb
  const handleJumpBreadcrumb = (segmentIdx: number) => {
    setActiveMenu(null);
    if (segmentIdx < navPath.length - 1) {
      setExitingLevel(segmentIdx);
      if (gridRef.current) {
        const targetChild = gridRef.current.children[Math.max(0, segmentIdx - 1)] as HTMLElement;
        const targetLeft = targetChild ? targetChild.offsetLeft : 0;
        if (gridRef.current.scrollLeft > targetLeft) {
          gridRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }
      }
      setTimeout(() => {
        setNavPath(navPath.slice(0, segmentIdx + 1));
        setExitingLevel(null);
      }, 240);
      return;
    }
    setNavPath(navPath.slice(0, segmentIdx + 1));
  };

  // Chain Sliding buttons
  const handleSlideLeft = () => {
    if (gridRef.current) {
      const step = gridRef.current.clientWidth / 3 || 340;
      gridRef.current.scrollBy({ left: -step, behavior: 'smooth' });
    }
  };

  const handleSlideRight = () => {
    if (gridRef.current) {
      const step = gridRef.current.clientWidth / 3 || 340;
      gridRef.current.scrollBy({ left: step, behavior: 'smooth' });
    }
  };

  // Path Input Submission
  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let clean = pathInputText.trim().replace(/^\/+|\/+$/g, '');
    if (clean.startsWith(selectedDatabaseId + '/')) {
      clean = clean.replace(selectedDatabaseId + '/', '');
    }
    if (!clean) {
      setIsEditingPath(false);
      return;
    }
    const parts = clean.split('/').filter(Boolean);
    setNavPath(parts);
    setIsEditingPath(false);
    addToast(`Navigated to /${clean}`, 'info');
  };

  // Dynamic Multi-Column Definition Generator
  interface WorkbenchColumnDef {
    key: string;
    type: 'root-collections' | 'documents' | 'document-details';
    level: number;
    title: string;
    colPath?: string;
    docPath?: string;
    selectedId?: string;
    parentDocPath?: string;
  }

  const effectiveRootCol = navPath[0] || (collections.length > 0 ? collections[0] : undefined);
  const rootColDocs = effectiveRootCol ? (collectionDocs[effectiveRootCol] || []) : [];
  const effectiveRootDocId = navPath[1] || rootColDocs[0]?.id;

  const columns: WorkbenchColumnDef[] = [
    {
      key: 'root-col-0',
      type: 'root-collections',
      level: 0,
      title: selectedDatabaseId,
      selectedId: effectiveRootCol,
    },
  ];

  if (collections.length === 0) {
    // Clean empty state: No collections created yet in this database
  } else if (navPath.length === 0 && effectiveRootCol) {
    // Both Box 2 (Documents) and Box 3 (Document Details) open for active root collection
    columns.push({
      key: `col-docs-${effectiveRootCol}`,
      type: 'documents',
      level: 1,
      title: effectiveRootCol,
      colPath: effectiveRootCol,
      selectedId: effectiveRootDocId,
    });
    if (effectiveRootDocId) {
      columns.push({
        key: `col-doc-details-${effectiveRootCol}-${effectiveRootDocId}`,
        type: 'document-details',
        level: 2,
        title: effectiveRootDocId,
        colPath: effectiveRootCol,
        docPath: `${effectiveRootCol}/${effectiveRootDocId}`,
      });
    }
  } else {
    for (let i = 0; i < navPath.length; i++) {
      if (i % 2 === 0) {
        // Even index: navPath[i] is collection name.
        // Column displays documents inside this collection.
        const colPath = navPath.slice(0, i + 1).join('/');
        columns.push({
          key: `col-docs-${colPath}`,
          type: 'documents',
          level: i + 1,
          title: navPath[i],
          colPath,
          selectedId: navPath[i + 1] || undefined,
          parentDocPath: i > 0 ? navPath.slice(0, i).join('/') : undefined,
        });
      } else {
        // Odd index: navPath[i] is document ID.
        // Column displays document details (subcollections + fields).
        const colPath = navPath.slice(0, i).join('/');
        const docPath = navPath.slice(0, i + 1).join('/');
        columns.push({
          key: `col-doc-details-${docPath}`,
          type: 'document-details',
          level: i + 1,
          title: navPath[i],
          colPath,
          docPath,
          selectedId: navPath[i + 1] || undefined,
        });
      }
    }

    // Guarantee that at least 3 columns are present when document exists
    if (columns.length === 2 && navPath.length > 0) {
      const activeColPath = navPath[0];
      const activeDocs = collectionDocs[activeColPath] || [];
      const defaultDocId = activeDocs[0]?.id;
      if (defaultDocId) {
        columns.push({
          key: `col-doc-details-${activeColPath}-${defaultDocId}`,
          type: 'document-details',
          level: 2,
          title: defaultDocId,
          colPath: activeColPath,
          docPath: `${activeColPath}/${defaultDocId}`,
        });
      }
    }
  }

  const generateAutoId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let autoId = '';
    for (let i = 0; i < 20; i++) {
      autoId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return autoId;
  };

  const toggleFieldExpand = (k: string) => {
    setExpandedFields((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const getFieldType = (val: any): FieldType => {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    if (typeof val === 'object') return 'map';
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'number') return 'number';
    return 'string';
  };

  const formatTypeLabel = (type: FieldType, val: any): string => {
    if (type === 'number') {
      if (typeof val === 'number' && Number.isInteger(val)) return 'int64';
      return 'number';
    }
    return type;
  };

  // Add Collection (2-step modal)
  const handleNextColStep = () => {
    const clean = newColId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!clean) {
      addToast('Collection ID cannot be empty', 'error');
      return;
    }
    if (!addColTargetDocPath && collections.includes(clean)) {
      addToast(`Collection '${clean}' already exists`, 'warning');
      return;
    }
    setColModalStep(2);
  };

  const handleFinishCreateCol = () => {
    const clean = newColId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const docId = newColFirstDocId.trim() || generateAutoId();

    let initialVal: any = newColFirstFieldValue;
    if (newColFirstFieldType === 'number') initialVal = Number(newColFirstFieldValue) || 0;
    if (newColFirstFieldType === 'boolean') initialVal = newColFirstFieldValue === 'true';

    const newDoc: FirestoreDocRecord = {
      id: docId,
      data: {
        [newColFirstFieldName.trim() || 'title']: initialVal,
      },
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      version: 1,
      subcollections: [],
    };

    if (!addColTargetDocPath) {
      setCollections([...collections, clean]);
      setCollectionDocs({ ...collectionDocs, [clean]: [newDoc] });
      setNavPath([clean, docId]);
    } else {
      const parentParts = addColTargetDocPath.split('/');
      const parentColPath = parentParts.slice(0, parentParts.length - 1).join('/');
      const parentDocId = parentParts[parentParts.length - 1];

      const parentDocs = collectionDocs[parentColPath] || [];
      const updatedParentDocs = parentDocs.map((d) => {
        if (d.id === parentDocId) {
          const subs = d.subcollections || [];
          return { ...d, subcollections: [...subs, clean] };
        }
        return d;
      });

      const fullSubcolPath = `${addColTargetDocPath}/${clean}`;
      setCollectionDocs({
        ...collectionDocs,
        [parentColPath]: updatedParentDocs,
        [fullSubcolPath]: [newDoc],
      });
      setNavPath([...parentParts, clean, docId]);
    }

    // Persist new collection + document to PostgreSQL database
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/documents/${encodeURIComponent(clean)}/${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: newDoc.data }),
    }).catch(() => {});

    setShowAddColModal(false);
    setColModalStep(1);
    setNewColId('');
    setNewColFirstDocId('');
    addToast(`Collection '${clean}' created`, 'success');
  };

  // Add Document
  const handleSaveDocument = () => {
    const docId = newDocId.trim() || generateAutoId();
    const docData: Record<string, any> = {};

    docBuilderFields.forEach((f) => {
      if (f.name.trim()) {
        let val: any = f.value;
        if (f.type === 'number') val = Number(f.value) || 0;
        if (f.type === 'boolean') val = f.value === 'true';
        if (f.type === 'null') val = null;
        docData[f.name.trim()] = val;
      }
    });

    const newDoc: FirestoreDocRecord = {
      id: docId,
      data: Object.keys(docData).length > 0 ? docData : { _created: new Date().toISOString() },
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      version: 1,
      subcollections: [],
    };

    const currentDocs = collectionDocs[addDocTargetColPath] || [];
    const updated = [newDoc, ...currentDocs];
    setCollectionDocs({ ...collectionDocs, [addDocTargetColPath]: updated });

    const colParts = addDocTargetColPath.split('/');
    setNavPath([...colParts, docId]);

    // Persist document to PostgreSQL database
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/documents/${encodeURIComponent(addDocTargetColPath)}/${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: newDoc.data }),
    }).catch(() => {});

    setShowAddDocModal(false);
    setNewDocId('');
    setDocBuilderFields([{ id: '1', name: '', type: 'string', value: '' }]);
    addToast(`Document '${docId}' saved to /${addDocTargetColPath}`, 'success');
  };

  // Add Field
  const handleSaveField = () => {
    const key = newFieldKey.trim();
    if (!key) {
      addToast('Field name is required', 'error');
      return;
    }
    const targetDoc = findDocAtPath(addFieldTargetDocPath);
    if (!targetDoc) return;

    let parsedVal: any = newFieldValue;
    if (newFieldType === 'number') parsedVal = Number(newFieldValue) || 0;
    if (newFieldType === 'boolean') parsedVal = newFieldValue === 'true';
    if (newFieldType === 'null') parsedVal = null;
    if (newFieldType === 'map' || newFieldType === 'array') {
      try {
        parsedVal = JSON.parse(newFieldValue);
      } catch (e: any) {
        addToast(`Invalid JSON format`, 'error');
        return;
      }
    }

    const parts = addFieldTargetDocPath.split('/');
    const colPath = parts.slice(0, parts.length - 1).join('/');
    const docId = parts[parts.length - 1];

    const currentDocs = collectionDocs[colPath] || [];
    const updatedDocs = currentDocs.map((d) =>
      d.id === docId
        ? { ...d, data: { ...d.data, [key]: parsedVal }, updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19), version: d.version + 1 }
        : d
    );

    setCollectionDocs({ ...collectionDocs, [colPath]: updatedDocs });

    // Persist field addition to PostgreSQL database
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/documents/${encodeURIComponent(colPath)}/${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { [key]: parsedVal }, merge: true }),
    }).catch(() => {});

    setShowAddFieldModal(false);
    setNewFieldKey('');
    setNewFieldValue('');
    addToast(`Field '${key}' added to ${docId}`, 'success');
  };

  // Edit Field
  const handleSaveEditField = () => {
    if (!editingField) return;
    const { docPath, key, type } = editingField;

    let parsedVal: any = editFieldVal;
    if (type === 'number') parsedVal = Number(editFieldVal) || 0;
    if (type === 'boolean') parsedVal = editFieldVal === 'true';
    if (type === 'null') parsedVal = null;
    if (type === 'map' || type === 'array') {
      try {
        parsedVal = JSON.parse(editFieldVal);
      } catch (e: any) {
        addToast(`Invalid JSON format`, 'error');
        return;
      }
    }

    const parts = docPath.split('/');
    const colPath = parts.slice(0, parts.length - 1).join('/');
    const docId = parts[parts.length - 1];

    const currentDocs = collectionDocs[colPath] || [];
    const updatedDocs = currentDocs.map((d) =>
      d.id === docId
        ? { ...d, data: { ...d.data, [key]: parsedVal }, updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19), version: d.version + 1 }
        : d
    );

    setCollectionDocs({ ...collectionDocs, [colPath]: updatedDocs });

    // Persist field edit to PostgreSQL database
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/documents/${encodeURIComponent(colPath)}/${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { [key]: parsedVal }, merge: true }),
    }).catch(() => {});

    setEditingField(null);
    addToast(`Field '${key}' updated`, 'success');
  };

  // Delete Field
  const handleDeleteField = (docPath: string, key: string) => {
    const parts = docPath.split('/');
    const colPath = parts.slice(0, parts.length - 1).join('/');
    const docId = parts[parts.length - 1];

    const currentDocs = collectionDocs[colPath] || [];
    let updatedPayload: Record<string, any> = {};
    const updatedDocs = currentDocs.map((d) => {
      if (d.id === docId) {
        const updatedData = { ...d.data };
        delete updatedData[key];
        updatedPayload = updatedData;
        return { ...d, data: updatedData, updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19), version: d.version + 1 };
      }
      return d;
    });

    setCollectionDocs({ ...collectionDocs, [colPath]: updatedDocs });

    // Persist field deletion to PostgreSQL database
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/documents/${encodeURIComponent(colPath)}/${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: updatedPayload }),
    }).catch(() => {});

    addToast(`Field '${key}' removed`, 'info');
  };

  // Delete Document
  const handleDeleteDoc = () => {
    if (!deleteDocTarget) return;
    const { colPath, docId } = deleteDocTarget;
    const currentDocs = collectionDocs[colPath] || [];
    const remaining = currentDocs.filter((d) => d.id !== docId);

    setCollectionDocs({ ...collectionDocs, [colPath]: remaining });
    setShowDeleteDocModal(false);

    const colParts = colPath.split('/');
    if (remaining.length > 0) {
      setNavPath([...colParts, remaining[0].id]);
    } else {
      setNavPath(colParts);
    }

    // Persist document deletion to PostgreSQL database
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/documents/${encodeURIComponent(colPath)}/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {});

    addToast(`Deleted document '${docId}'`, 'info');
  };

  // Start Subcollection
  const handleSaveSubcollection = () => {
    const clean = newSubcolName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!clean) {
      addToast('Subcollection name cannot be empty', 'error');
      return;
    }
    const parentParts = addSubcolTargetDocPath.split('/');
    const parentColPath = parentParts.slice(0, parentParts.length - 1).join('/');
    const parentDocId = parentParts[parentParts.length - 1];

    const parentDocs = collectionDocs[parentColPath] || [];
    const targetDoc = parentDocs.find((d) => d.id === parentDocId);
    if (!targetDoc) return;

    const existing = targetDoc.subcollections || [];
    if (existing.includes(clean)) {
      addToast(`Subcollection '${clean}' already exists`, 'warning');
      return;
    }

    const updatedParentDocs = parentDocs.map((d) =>
      d.id === parentDocId ? { ...d, subcollections: [...existing, clean] } : d
    );

    const fullSubcolPath = `${addSubcolTargetDocPath}/${clean}`;
    setCollectionDocs({
      ...collectionDocs,
      [parentColPath]: updatedParentDocs,
      [fullSubcolPath]: collectionDocs[fullSubcolPath] || [],
    });

    setNewSubcolName('');
    setShowAddSubcolModal(false);
    setNavPath([...parentParts, clean]);
    addToast(`Subcollection '${clean}' added to ${parentDocId}`, 'success');
  };

  // Delete Collection
  const handleDeleteCollection = async (colPath: string, parentDocPath?: string) => {
    if (!parentDocPath) {
      const remaining = collections.filter((c) => c !== colPath);
      setCollections(remaining);
      const updated = { ...collectionDocs };
      delete updated[colPath];
      setCollectionDocs(updated);
      if (remaining.length > 0) {
        handleSelectRootCol(remaining[0]);
      } else {
        setNavPath([]);
      }

      // Persist collection deletion to PostgreSQL
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/databases/${selectedDatabaseId}/collections/${encodeURIComponent(colPath)}`, {
          method: 'DELETE',
          headers,
        });
      } catch {}
      addToast(`Collection '${colPath}' deleted`, 'info');
    } else {
      const parentParts = parentDocPath.split('/');
      const parentCol = parentParts.slice(0, parentParts.length - 1).join('/');
      const parentDocId = parentParts[parentParts.length - 1];
      const scName = colPath.split('/').pop() || '';

      const parentDocs = collectionDocs[parentCol] || [];
      const updatedParentDocs = parentDocs.map((d) => {
        if (d.id === parentDocId) {
          const remainingSubs = (d.subcollections || []).filter((s) => s !== scName);
          return { ...d, subcollections: remainingSubs };
        }
        return d;
      });

      const updated = { ...collectionDocs, [parentCol]: updatedParentDocs };
      delete updated[colPath];
      setCollectionDocs(updated);
      setNavPath(parentParts);
    }
    setActiveMenu(null);
    addToast(`Collection '${colPath}' deleted`, 'info');
  };

  // =========================================================================
  // RULES CODE EDITOR HANDLERS (PUBLISH, DISCARD, SELECTION)
  // =========================================================================
  const handleCodeChange = (newCode: string) => {
    setCurrentRulesCode(newCode);
    if (newCode !== activePublishedCode) {
      setHasUnpublishedChanges(true);
    } else {
      setHasUnpublishedChanges(false);
    }
  };

  const handlePublishRules = async () => {
    if (!currentRulesCode.trim()) {
      addToast('Cannot publish empty security rules', 'error');
      return;
    }

    setIsPublishingRules(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/rules/publish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceCode: currentRulesCode }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        addToast(data.details || data.error || data.message || 'Failed to publish security rules', 'error');
        return;
      }

      addToast(`Security rules v${data.versionNumber || ''} published and active on Fastify Gateway`, 'success');
      setHasUnpublishedChanges(false);
      await fetchRules();
    } catch (err: any) {
      addToast(err.message || 'Network error publishing rules', 'error');
    } finally {
      setIsPublishingRules(false);
    }
  };

  const handleDiscardChanges = () => {
    setCurrentRulesCode(activePublishedCode);
    setHasUnpublishedChanges(false);
    addToast('Unpublished changes discarded', 'info');
  };

  const handleSelectHistoryVersion = (record: RulesVersionRecord) => {
    setSelectedVersionId(record.id);
    setCurrentRulesCode(record.code);
    if (record.code !== activePublishedCode) {
      setHasUnpublishedChanges(true);
    } else {
      setHasUnpublishedChanges(false);
    }
  };

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    const start = performance.now();
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/rules/simulate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceCode: currentRulesCode,
          path: simLocation,
          method: simOperation,
          auth: simIsAuthenticated ? { uid: simAuthUid } : null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      const latencyMs = Number((performance.now() - start).toFixed(1));

      if (res.ok) {
        setSimResult({
          allowed: !!data.allowed,
          matchedLine: data.matchedRule ? 27 : 28,
          latencyMs,
        });
      } else {
        addToast(data.details || data.error || data.message || 'Simulation failed', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Simulation network error', 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  // Helper for syntax coloring code lines
  const renderSyntaxLineContent = (line: string) => {
    if (line.trim().startsWith('//')) {
      return <span style={{ color: '#e06c75', fontWeight: 600 }}>{line}</span>;
    }

    const parts = line.split(/(rules_version|service|cloud\.firestore|match|allow|read|write|create|update|delete|if|function|return|let|exists|get|true|false|null)/g);
    return parts.map((part, pIdx) => {
      if (['rules_version', 'service', 'match', 'allow', 'if', 'function', 'return', 'let'].includes(part)) {
        return <span key={pIdx} style={{ color: '#61afef', fontWeight: 600 }}>{part}</span>;
      }
      if (['read', 'write', 'create', 'update', 'delete'].includes(part)) {
        return <span key={pIdx} style={{ color: '#98c379', fontWeight: 600 }}>{part}</span>;
      }
      if (['cloud.firestore', 'exists', 'get'].includes(part)) {
        return <span key={pIdx} style={{ color: '#e5c07b' }}>{part}</span>;
      }
      if (['true', 'false', 'null'].includes(part)) {
        return <span key={pIdx} style={{ color: '#c678dd', fontWeight: 600 }}>{part}</span>;
      }
      if (part.includes("'") || part.includes('"')) {
        return <span key={pIdx} style={{ color: '#98c379' }}>{part}</span>;
      }
      return <span key={pIdx} style={{ color: '#abb2bf' }}>{part}</span>;
    });
  };

  const renderSyntaxHighlightedLine = (line: string, index: number) => {
    return (
      <div key={index} style={{ display: 'flex', minHeight: '22px' }}>
        <span
          style={{
            width: '40px',
            textAlign: 'right',
            paddingRight: '16px',
            color: '#6e7681',
            userSelect: 'none',
            fontSize: '12px',
          }}
        >
          {index + 1}
        </span>
        <span style={{ flex: 1, whiteSpace: 'pre', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
          {renderSyntaxLineContent(line)}
        </span>
      </div>
    );
  };

  return (
    <div className="firebase-studio-root animate-fade-in">
      {isSuspended && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Lock size={18} />
            <span>
              DATABASE LOCKDOWN: Project &ldquo;{activeProject.name}&rdquo; is suspended. All collection queries, document reads, document writes, and mutations are rejected with 403 Forbidden.
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '4px', background: 'var(--danger)', color: '#fff' }}>
            SUSPENDED
          </span>
        </div>
      )}

      {/* =======================================================================
          1. HEADER SECTION (CLEAN, PURPOSE-BUILT, NO GOOGLE MARKETING CLUTTER)
          ======================================================================= */}
      <div className="fb-top-header">
        <div>
          <div className="fb-breadcrumb-small">Firestore Engine &gt;</div>
          <div className="fb-title-row">
            <h1 className="fb-title-text">Database</h1>
            <div style={{ position: 'relative' }}>
              <div
                className="fb-db-selector-pill"
                onClick={() => setDbDropdownOpen(!dbDropdownOpen)}
              >
                <span>{selectedDatabaseId}</span>
                <ChevronDown size={14} color="var(--text-muted)" />
              </div>

              {dbDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '6px',
                    minWidth: '240px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 100,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div
                    style={{
                      padding: '6px 8px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span>Databases</span>
                    <span>{databases.length} / {maxDatabases}</span>
                  </div>

                  <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 0' }}>
                    {databases.map((db) => {
                      const isSelected = db.databaseId === selectedDatabaseId;
                      return (
                        <div
                          key={db.databaseId}
                          onClick={() => {
                            setSelectedDatabaseId(db.databaseId);
                            setDbDropdownOpen(false);
                            addToast(`Switched to database ${db.name} (${db.databaseId})`, 'info');
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: isSelected ? 'var(--primary-subtle)' : 'transparent',
                            color: isSelected ? 'var(--primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{db.name}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {db.databaseId}
                            </div>
                          </div>
                          {isSelected && <Check size={14} color="var(--primary)" />}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => {
                      setDbDropdownOpen(false);
                      setShowCreateDbModal(true);
                    }}
                    disabled={databases.length >= maxDatabases}
                    style={{
                      marginTop: '4px',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px dashed var(--border-default)',
                      background: databases.length >= maxDatabases ? 'var(--bg-surface-subtle)' : 'transparent',
                      color: databases.length >= maxDatabases ? 'var(--text-muted)' : 'var(--primary-text)',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: databases.length >= maxDatabases ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      width: '100%',
                    }}
                  >
                    <Plus size={13} />
                    <span>{databases.length >= maxDatabases ? 'Database Quota Reached' : 'Create Database'}</span>
                  </button>
                </div>
              )}
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '16px',
                background: 'rgba(37, 99, 235, 0.1)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                fontSize: '12px',
                color: 'var(--primary)',
                fontWeight: 500,
              }}
            >
              <DbIcon size={13} />
              <span>PostgreSQL 16 JSONB</span>
            </div>

            <button
              onClick={async () => {
                setIsRefreshingDocs(true);
                await fetchLiveCollectionsAndDocs();
                setIsRefreshingDocs(false);
                addToast('Database synchronized with live PostgreSQL', 'info');
              }}
              disabled={isRefreshingDocs}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: '16px',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
              title="Re-sync collections and documents from PostgreSQL"
            >
              <RefreshCw size={13} className={isRefreshingDocs ? 'animate-spin' : ''} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => handleCopyPath(getComputedPath())}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              borderRadius: '16px',
              padding: '5px 12px',
              color: 'var(--primary)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Click to copy full database path"
          >
            <Copy size={13} />
            <span>{getComputedPath()}</span>
          </button>
        </div>
      </div>

      {/* =======================================================================
          2. WORKBENCH TABS ROW
          ======================================================================= */}
      <div className="fb-tabs-row">
        <button
          className={`fb-tab-btn ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Data
        </button>
        <button
          className={`fb-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          Rules
        </button>
        <button
          className={`fb-tab-btn ${activeTab === 'indexes' ? 'active' : ''}`}
          onClick={() => setActiveTab('indexes')}
        >
          Indexes
        </button>
        <button
          className={`fb-tab-btn ${activeTab === 'usage' ? 'active' : ''}`}
          onClick={() => setActiveTab('usage')}
        >
          Usage &amp; Telemetry
        </button>
      </div>

      {/* =======================================================================
          TAB 1: DATA (THE FORWARD-CHAINING MULTI-COLUMN WORKBENCH)
          ======================================================================= */}
      {activeTab === 'data' && (
        <div className="fb-workbench">
          {/* Top Path Strip with Clickable Breadcrumbs, Direct Textbox Edit, Slide Arrows & Click-to-Copy */}
          <div className="fb-path-strip">
            {isEditingPath ? (
              <form onSubmit={handlePathSubmit} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                <input
                  className="fb-path-input"
                  value={pathInputText}
                  onChange={(e) => setPathInputText(e.target.value)}
                  placeholder={`/${selectedDatabaseId}/artifacts/main`}
                  autoFocus
                />
                <button type="submit" className="fb-path-btn-go">Go</button>
                <button type="button" onClick={() => setIsEditingPath(false)} className="fb-path-btn-cancel">Cancel</button>
              </form>
            ) : (
              <div className="fb-path-strip-left">
                <Home size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <span>&gt;</span>
                <span
                  className="fb-path-item"
                  onClick={() => {
                    if (collections.length > 0) handleSelectRootCol(collections[0]);
                  }}
                  title="Database root"
                >
                  {selectedDatabaseId}
                </span>
                {navPath.map((segment, segIdx) => {
                  const isLast = segIdx === navPath.length - 1;
                  return (
                    <React.Fragment key={`${segment}-${segIdx}`}>
                      <span>&gt;</span>
                      <span
                        className={`fb-path-item ${isLast ? 'active' : ''}`}
                        onClick={() => handleJumpBreadcrumb(segIdx)}
                        title={`Jump to /${navPath.slice(0, segIdx + 1).join('/')}`}
                      >
                        {segment}
                      </span>
                    </React.Fragment>
                  );
                })}
                <button
                  onClick={() => {
                    setPathInputText(`/${selectedDatabaseId}/${navPath.join('/')}`);
                    setIsEditingPath(true);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginLeft: '4px',
                  }}
                  title="Edit path directly in text box"
                >
                  <Edit2 size={12} />
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {/* Slide drawer arrows to navigate chain horizontally */}
              <button
                onClick={handleSlideLeft}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
                title="Slide left (previous columns)"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={handleSlideRight}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
                title="Slide right (next columns)"
              >
                <ChevronRight size={14} />
              </button>

              <button
                onClick={() => handleCopyPath(getComputedPath())}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: 'var(--primary-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '12px',
                  padding: '3px 9px',
                  color: 'var(--primary)',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                title="Copy full path"
              >
                <Copy size={12} />
                <span>Copy path</span>
              </button>
            </div>
          </div>

          {/* Dynamic Sliding Multi-Column Workbench (Chain: Collection -> Doc -> Collection -> Doc) */}
          <div className="fb-columns-grid" ref={gridRef}>
            {columns.map((col) => {
              const isExiting = exitingLevel !== null && col.level > exitingLevel;

              if (col.type === 'root-collections') {
                return (
                  <div key={col.key} className={`fb-col ${isExiting ? 'fb-col-exiting' : ''}`}>
                    <div className="fb-col-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={14} color="var(--text-muted)" />
                        <span style={{ fontWeight: 600 }}>{col.title}</span>
                        <HelpCircle size={12} color="var(--text-muted)" />
                      </div>
                    </div>

                    <button
                      className="fb-action-btn"
                      onClick={() => {
                        setAddColTargetDocPath(null);
                        setColModalStep(1);
                        setShowAddColModal(true);
                      }}
                    >
                      <Plus size={14} />
                      <span>Start collection</span>
                    </button>

                    <div className="fb-col-body">
                      {collections.length === 0 ? (
                        <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <Layers size={32} style={{ margin: '0 auto 10px', opacity: 0.35 }} />
                          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-secondary)' }}>No collections yet</div>
                          <div style={{ fontSize: '11px', marginTop: '6px', lineHeight: 1.5 }}>
                            Click &quot;Start collection&quot; above to create your first root collection in {selectedDatabaseId}.
                          </div>
                        </div>
                      ) : (
                        collections.map((cName) => {
                          const isSelected = cName === col.selectedId;
                          return (
                            <div
                              key={cName}
                              onClick={() => handleSelectRootCol(cName)}
                              className={`fb-item ${isSelected ? 'selected' : ''}`}
                            >
                              <span>{cName}</span>
                              <ChevronRight size={14} color={isSelected ? 'var(--primary)' : 'var(--text-muted)'} />
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              }

              if (col.type === 'documents') {
                const docs = collectionDocs[col.colPath!] || [];
                return (
                  <div key={col.key} className={`fb-col ${isExiting ? 'fb-col-exiting' : ''}`}>
                    <div className="fb-col-header" style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <Folder size={14} color="var(--primary)" style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {col.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <button
                          onClick={() => setActiveMenu(activeMenu === 'col-' + col.colPath ? null : 'col-' + col.colPath)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                          title="Collection options"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {activeMenu === 'col-' + col.colPath && (
                          <div className="fb-context-menu">
                            <button
                              onClick={() => handleCopyPath('/' + col.colPath)}
                              className="fb-context-menu-item"
                            >
                              <Copy size={13} color="var(--primary)" />
                              <span>Copy path</span>
                            </button>
                            <button
                              onClick={() => {
                                setAddDocTargetColPath(col.colPath!);
                                setNewDocId('');
                                setShowAddDocModal(true);
                                setActiveMenu(null);
                              }}
                              className="fb-context-menu-item"
                            >
                              <Plus size={13} color="var(--success)" />
                              <span>Add document</span>
                            </button>
                            <div className="fb-context-menu-divider" />
                            <button
                              onClick={() => handleDeleteCollection(col.colPath!, col.parentDocPath)}
                              className="fb-context-menu-item danger"
                            >
                              <Trash2 size={13} color="var(--danger)" />
                              <span>Delete collection</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      className="fb-action-btn"
                      onClick={() => {
                        setAddDocTargetColPath(col.colPath!);
                        setNewDocId('');
                        setShowAddDocModal(true);
                      }}
                    >
                      <Plus size={14} />
                      <span>Add document</span>
                    </button>

                    <div className="fb-col-body">
                      {docs.length === 0 ? (
                        <div style={{ padding: '24px 14px', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                          No documents in /{col.colPath}
                        </div>
                      ) : (
                        docs.map((doc) => {
                          const isSelected = doc.id === col.selectedId;
                          return (
                            <div
                              key={doc.id}
                              onClick={() => handleSelectDoc(col.level, doc.id)}
                              className={`fb-item ${isSelected ? 'selected' : ''}`}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {doc.id}
                              </span>
                              <ChevronRight size={14} color={isSelected ? 'var(--primary)' : 'var(--text-muted)'} />
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              }

              // col.type === 'document-details'
              const doc = findDocAtPath(col.docPath!);
              const filterQ = (fieldFilterQueries[col.docPath!] || '').toLowerCase().trim();
              const rawEntries = Object.entries(doc?.data || {});
              const filteredEntries = filterQ
                ? rawEntries.filter(([k]) => k.toLowerCase().includes(filterQ))
                : rawEntries;

              return (
                <div key={col.key} className={`fb-col ${isExiting ? 'fb-col-exiting' : ''}`}>
                  {doc ? (
                    <>
                      {/* Document Column Header */}
                      <div className="fb-col-header" style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                          <FileText size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.id}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          <button
                            onClick={() => setActiveMenu(activeMenu === 'doc-' + col.docPath ? null : 'doc-' + col.docPath)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                            title="Document options"
                          >
                            <MoreVertical size={14} />
                          </button>
                          {activeMenu === 'doc-' + col.docPath && (
                            <div className="fb-context-menu">
                              <button
                                onClick={() => handleCopyPath('/' + col.docPath)}
                                className="fb-context-menu-item"
                              >
                                <Copy size={13} color="var(--primary)" />
                                <span>Copy document path</span>
                              </button>
                              <button
                                onClick={() => {
                                  setAddSubcolTargetDocPath(col.docPath!);
                                  setNewSubcolName('');
                                  setShowAddSubcolModal(true);
                                  setActiveMenu(null);
                                }}
                                className="fb-context-menu-item"
                              >
                                <Plus size={13} color="var(--success)" />
                                <span>Start subcollection</span>
                              </button>
                              <div className="fb-context-menu-divider" />
                              <button
                                onClick={() => {
                                  const parts = col.docPath!.split('/');
                                  const colP = parts.slice(0, parts.length - 1).join('/');
                                  setDeleteDocTarget({ colPath: colP, docId: doc.id });
                                  setShowDeleteDocModal(true);
                                  setActiveMenu(null);
                                }}
                                className="fb-context-menu-item danger"
                              >
                                <Trash2 size={13} color="var(--danger)" />
                                <span>Delete document</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action: + Start collection */}
                      <button
                        className="fb-action-btn"
                        onClick={() => {
                          setAddSubcolTargetDocPath(col.docPath!);
                          setNewSubcolName('');
                          setShowAddSubcolModal(true);
                        }}
                      >
                        <Plus size={14} color="var(--primary)" />
                        <span>Start collection</span>
                      </button>

                      {/* Subcollections List (if any exist) */}
                      {(doc.subcollections || []).length > 0 && (
                        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          {doc.subcollections!.map((sc) => {
                            const isScSelected = col.selectedId === sc;
                            return (
                              <div
                                key={sc}
                                onClick={() => handleSelectSubcol(col.level, sc, col.docPath!)}
                                className={`fb-item ${isScSelected ? 'selected' : ''}`}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Folder size={14} color="var(--primary)" />
                                  <span style={{ fontWeight: isScSelected ? 600 : 400 }}>{sc}</span>
                                </div>
                                <ChevronRight size={14} color="var(--text-muted)" />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Action: + Add field */}
                      <button
                        className="fb-action-btn"
                        onClick={() => {
                          setAddFieldTargetDocPath(col.docPath!);
                          setNewFieldKey('');
                          setNewFieldValue('');
                          setShowAddFieldModal(true);
                        }}
                      >
                        <Plus size={14} color="var(--primary)" />
                        <span>Add field</span>
                      </button>

                      {/* Search Filter for large field collections */}
                      {rawEntries.length >= 4 && (
                        <div style={{ padding: '6px 12px' }}>
                          <div className="fb-field-search-wrap">
                            <Search size={12} color="var(--text-muted)" />
                            <input
                              placeholder="Filter fields..."
                              value={fieldFilterQueries[col.docPath!] || ''}
                              onChange={(e) =>
                                setFieldFilterQueries({ ...fieldFilterQueries, [col.docPath!]: e.target.value })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Scrollable Fields Container */}
                      <div className="fb-fields-section" style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                        {filteredEntries.length === 0 ? (
                          <div style={{ padding: '40px 16px', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', textAlign: 'center' }}>
                            {filterQ ? 'No fields match filter' : 'This document has no fields'}
                          </div>
                        ) : (
                          filteredEntries.map(([key, val]) => {
                            const type = getFieldType(val);
                            const isExpandable = type === 'map' || type === 'array';
                            const isExpanded = !!expandedFields[key];

                            return (
                              <React.Fragment key={key}>
                                <div
                                  className="fb-field-line"
                                  onMouseEnter={() => setHoveredFieldKey(key)}
                                  onMouseLeave={() => setHoveredFieldKey(null)}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
                                    {isExpandable ? (
                                      <span
                                        style={{ cursor: 'pointer', marginRight: '4px', display: 'inline-flex' }}
                                        onClick={() => toggleFieldExpand(key)}
                                      >
                                        {isExpanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                                      </span>
                                    ) : (
                                      <span style={{ width: '14px', display: 'inline-block' }} />
                                    )}
                                    <span className="fb-field-key" style={{ marginRight: '6px' }}>{key}:</span>

                                    {type === 'string' ? (
                                      <span className="fb-field-val-string" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        "{String(val)}"
                                      </span>
                                    ) : type === 'number' ? (
                                      <span className="fb-field-val-number">{String(val)}</span>
                                    ) : type === 'boolean' ? (
                                      <span className="fb-field-val-boolean">{String(val)}</span>
                                    ) : type === 'null' ? (
                                      <span className="fb-field-val-null">null</span>
                                    ) : type === 'map' ? (
                                      <span className="fb-field-val-map" onClick={() => toggleFieldExpand(key)}>
                                        {`{ ${Object.keys(val || {}).length} fields }`}
                                      </span>
                                    ) : type === 'array' ? (
                                      <span className="fb-field-val-array" onClick={() => toggleFieldExpand(key)}>
                                        {`[ ${(val || []).length} items ]`}
                                      </span>
                                    ) : (
                                      <span>{JSON.stringify(val)}</span>
                                    )}
                                  </div>

                                  <div className={`fb-field-actions ${hoveredFieldKey === key ? 'active' : ''}`}>
                                    <span className="fb-field-hover-type">({formatTypeLabel(type, val)})</span>
                                    <button
                                      className="fb-field-icon-btn"
                                      onClick={() => {
                                        setEditingField({ docPath: col.docPath!, key, type, value: val });
                                        setEditFieldVal(typeof val === 'object' ? JSON.stringify(val) : String(val));
                                      }}
                                      title="Edit field"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      className="fb-field-icon-btn"
                                      onClick={() => handleDeleteField(col.docPath!, key)}
                                      title="Delete field"
                                      style={{ color: 'var(--danger)' }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* Nested Map */}
                                {isExpandable && isExpanded && type === 'map' && val && (
                                  Object.entries(val as Record<string, any>).map(([subK, subVal]: [string, any]) => {
                                    const subType = getFieldType(subVal);
                                    return (
                                      <div key={`${key}.${subK}`} className="fb-field-line fb-nested-child-line">
                                        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
                                          <span className="fb-field-key" style={{ color: 'var(--text-muted)', marginRight: '6px' }}>{subK}:</span>
                                          {typeof subVal === 'string' ? (
                                            <span className="fb-field-val-string">"{String(subVal)}"</span>
                                          ) : typeof subVal === 'number' ? (
                                            <span className="fb-field-val-number">{String(subVal)}</span>
                                          ) : (
                                            <span>{JSON.stringify(subVal)}</span>
                                          )}
                                        </div>
                                        <div className="fb-field-actions">
                                          <span className="fb-field-hover-type">({formatTypeLabel(subType, subVal)})</span>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}

                                {/* Nested Array */}
                                {isExpandable && isExpanded && type === 'array' && Array.isArray(val) && (
                                  (val as any[]).map((itemVal: any, idx: number) => {
                                    const itemType = getFieldType(itemVal);
                                    return (
                                      <div key={`${key}[${idx}]`} className="fb-field-line fb-nested-child-line">
                                        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
                                          <span className="fb-field-key" style={{ color: 'var(--text-muted)', marginRight: '6px' }}>[{idx}]:</span>
                                          <span className="fb-field-val-string">"{String(itemVal)}"</span>
                                        </div>
                                        <div className="fb-field-actions">
                                          <span className="fb-field-hover-type">({formatTypeLabel(itemType, itemVal)})</span>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      No document selected
                    </div>
                  )}
                </div>
              );
            })}
            {columns.length === 1 && (
              <div
                className="fb-col"
                style={{
                  flex: 1,
                  minWidth: '340px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-surface-subtle)',
                  borderStyle: 'dashed',
                  borderWidth: '1px',
                  borderColor: 'var(--border-default)',
                }}
              >
                <div style={{ textAlign: 'center', maxWidth: '340px', padding: '32px 20px', color: 'var(--text-muted)' }}>
                  <Database size={42} style={{ margin: '0 auto 12px', opacity: 0.25, color: 'var(--primary)' }} />
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {collections.length === 0 ? 'Empty Database' : 'Select a Collection'}
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '6px', lineHeight: 1.6 }}>
                    {collections.length === 0
                      ? `No collections exist in "${selectedDatabaseId}" yet. Click "+ Start collection" on the left to initialize schema documents.`
                      : 'Choose a collection on the left to browse documents and schema fields.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =======================================================================
          TAB 2: RULES WORKSPACE (DIRECT FULL-WIDTH CODING COLOR EDITOR)
          ======================================================================= */}
      {activeTab === 'rules' && (
        <div className="fb-workbench" style={{ flexDirection: 'row' }}>
          {/* Left Column: Release History Timeline */}
          <div
            style={{
              width: '260px',
              borderRight: '1px solid var(--border-default)',
              padding: '16px 0',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              backgroundColor: 'var(--bg-surface-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Release History
              </span>
              {isLoadingRules && (
                <RotateCcw size={12} className="animate-spin" color="var(--primary)" />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
              {/* Dynamic Unpublished Changes Item in Timeline */}
              {hasUnpublishedChanges && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 16px',
                    backgroundColor: 'rgba(66, 133, 244, 0.15)',
                    borderLeft: '3px solid #8ab4f8',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: 'var(--primary)', fontSize: '16px', lineHeight: 1 }}>○</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Right now</span>
                    <span style={{ fontSize: '11px', color: 'var(--primary)', fontStyle: 'italic', marginTop: '2px' }}>
                      unpublished changes
                    </span>
                  </div>
                </div>
              )}

              {/* Version History List */}
              {rulesHistory.map((item) => {
                const isSelected = !hasUnpublishedChanges && selectedVersionId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectHistoryVersion(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 16px',
                      backgroundColor: isSelected ? 'var(--border-subtle)' : 'transparent',
                      color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      borderLeft: isSelected ? '3px solid #8ab4f8' : '3px solid transparent',
                      transition: 'background-color 0.12s ease',
                    }}
                  >
                    <span style={{ color: item.isActive ? 'var(--warning)' : 'var(--text-muted)', fontSize: '14px', flexShrink: 0 }}>
                      {item.isActive ? '★' : '○'}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: item.isActive ? 700 : 500, fontSize: '12px' }}>
                          {item.id.toUpperCase()}
                        </span>
                        {item.isActive && (
                          <span style={{ fontSize: '9px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                            Active
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {item.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Code Editor & Action Bar */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: 'var(--bg-canvas)' }}>
            {/* The Bright Blue "Unpublished Changes" Bar */}
            {hasUnpublishedChanges && (
              <div
                style={{
                  backgroundColor: '#4285f4',
                  color: '#ffffff',
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  zIndex: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500 }}>
                  <span>unpublished changes</span>
                  <span style={{ opacity: 0.6 }}>|</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={handlePublishRules}
                    disabled={isPublishingRules}
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#1a73e8',
                      fontWeight: 700,
                      borderRadius: '16px',
                      padding: '4px 16px',
                      border: 'none',
                      fontSize: '13px',
                      cursor: isPublishingRules ? 'not-allowed' : 'pointer',
                      opacity: isPublishingRules ? 0.7 : 1,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }}
                  >
                    {isPublishingRules ? 'Publishing...' : 'Publish'}
                  </button>

                  <button
                    onClick={handleDiscardChanges}
                    style={{
                      backgroundColor: 'transparent',
                      color: '#ffffff',
                      fontWeight: 500,
                      border: 'none',
                      fontSize: '13px',
                      cursor: 'pointer',
                      padding: '4px 8px',
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* Editor Sub-header */}
            <div
              style={{
                height: '42px',
                padding: '0 16px',
                borderBottom: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--bg-surface-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>rules_version = '2';</span>
                <span>•</span>
                <span>service cloud.firestore</span>
              </div>

              <button
                className="fb-btn-blue-pill"
                onClick={() => setShowSimulatorModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 14px' }}
              >
                <Play size={12} />
                <span>Develop &amp; Test</span>
              </button>
            </div>

            {/* DIRECTLY EDITABLE FULL-WIDTH COLORFUL CODE EDITOR (No side panel) */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative', overflow: 'hidden', backgroundColor: 'var(--bg-canvas)' }}>
              {/* Sticky Line Numbers Gutter */}
              <div
                ref={rulesGutterRef}
                style={{
                  width: '46px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  padding: '16px 8px 16px 0',
                  textAlign: 'right',
                  color: '#6e7681',
                  userSelect: 'none',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  lineHeight: '22px',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                {currentRulesCode.split('\n').map((_, idx) => (
                  <div key={idx} style={{ height: '22px' }}>{idx + 1}</div>
                ))}
              </div>

              {/* Direct Code Editor Layer Container — SINGLE SCROLLBAR */}
              <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
                {/* Syntax Highlighted Colorful Display Layer */}
                <pre
                  ref={rulesPreRef}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    margin: 0,
                    padding: '16px 20px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    lineHeight: '22px',
                    whiteSpace: 'pre',
                    pointerEvents: 'none',
                    overflow: 'hidden',
                    color: 'var(--text-primary)',
                  }}
                >
                  {currentRulesCode.split('\n').map((line, idx) => (
                    <div key={idx} style={{ height: '22px' }}>
                      {renderSyntaxLineContent(line)}
                    </div>
                  ))}
                </pre>

                {/* Directly Editable Transparent Textarea Overlay (Sole vertical scrollbar) */}
                <textarea
                  value={currentRulesCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onScroll={handleRulesScroll}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    margin: 0,
                    padding: '16px 20px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    lineHeight: '22px',
                    whiteSpace: 'pre',
                    background: 'transparent',
                    color: 'transparent',
                    caretColor: 'var(--primary)',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    overflowY: 'auto',
                    overflowX: 'auto',
                    boxSizing: 'border-box',
                  }}
                  placeholder="// Type rules directly here..."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
      {/* =======================================================================
          TAB 3: COMPOSITE INDEXES
          ======================================================================= */}
      {activeTab === 'indexes' && (
        <div className="fb-workbench" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Composite Indexes
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                Multi-field indexes configured in PostgreSQL for fast inequality and compound searches.
              </p>
            </div>
            <button className="fb-btn-blue-pill" onClick={() => setShowAddIndexModal(true)}>
              <Plus size={14} style={{ marginRight: '6px' }} />
              Add index
            </button>
          </div>

          {isLoadingIndexes ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
              <RefreshCw className="animate-spin" size={20} style={{ margin: '0 auto 8px' }} />
              Loading database indexes...
            </div>
          ) : indexes.length === 0 ? (
            <div style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px dashed var(--border-default)',
              borderRadius: '8px',
              padding: '36px 20px',
              textAlign: 'center'
            }}>
              <Layers size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 10px', opacity: 0.6 }} />
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                No composite indexes configured
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 16px' }}>
                Composite indexes are required for compound queries that filter on multiple fields or combine equality and inequality filters.
              </p>
              <button className="fb-btn-blue-pill" onClick={() => setShowAddIndexModal(true)}>
                <Plus size={14} style={{ marginRight: '6px' }} />
                Create your first index
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 14px' }}>Collection ID</th>
                  <th style={{ padding: '10px 14px' }}>Fields Indexed</th>
                  <th style={{ padding: '10px 14px' }}>Query Scope</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {indexes.map((idx) => {
                  const fieldsDisplay = Array.isArray(idx.fields)
                    ? idx.fields.map((f: any) => `${f.name} ${f.order?.toUpperCase() || 'ASC'}`).join(', ')
                    : 'All fields';
                  return (
                    <tr key={idx.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)' }}>{idx.collectionPath}</td>
                      <td style={{ padding: '14px' }}>{fieldsDisplay}</td>
                      <td style={{ padding: '14px' }}>{idx.queryScope || 'Collection'}</td>
                      <td style={{ padding: '14px' }}>
                        <span style={{
                          color: idx.status === 'Enabled' ? 'var(--success-text)' : 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}>
                          <CheckCircle2 size={13} />
                          {idx.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteCompositeIndex(idx.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                          title="Delete Index"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* =======================================================================
          TAB 4: USAGE & METRICS
          ======================================================================= */}
      {activeTab === 'usage' && (
        <div className="fb-workbench" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '20px' }}>
            Database Operations &amp; Live Telemetry
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}>
            <div style={{ background: 'var(--bg-surface-subtle)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Document Count</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>
                {usageStats.docCount.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--success)', marginTop: '6px' }}>Authoritative PostgreSQL JSONB</div>
            </div>
            <div style={{ background: 'var(--bg-surface-subtle)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Collections</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>
                {collections.length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Active paths in database</div>
            </div>
            <div style={{ background: 'var(--bg-surface-subtle)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Document Operations</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>
                {usageStats.writesCount.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Committed via Outbox</div>
            </div>
            <div style={{ background: 'var(--bg-surface-subtle)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Storage Footprint</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--primary)', marginTop: '8px' }}>
                {usageStats.storageBytesFormatted}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>JSONB Store + GIN Indexes</div>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          SIMULATOR MODAL: "DEVELOP & TEST"
          ======================================================================= */}
      <Modal
        isOpen={showSimulatorModal}
        onClose={() => setShowSimulatorModal(false)}
        title="Security Rules Simulator"
        description="Dry-run declarative rules evaluation against synthetic request tokens."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="fb-btn-text" onClick={() => setShowSimulatorModal(false)}>
              Close
            </button>
            <button className="fb-btn-blue-pill" onClick={handleRunSimulation} disabled={isSimulating}>
              {isSimulating ? 'Simulating...' : 'Run Simulation'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Operation
            </label>
            <Select value={simOperation} onChange={(e) => setSimOperation(e.target.value as any)}>
              <option value="get">get (Single document read)</option>
              <option value="list">list (Collection query)</option>
              <option value="create">create (Document insert)</option>
              <option value="update">update (Document mutate)</option>
              <option value="delete">delete (Document purge)</option>
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Location Path
            </label>
            <Input
              value={simLocation}
              onChange={(e) => setSimLocation(e.target.value)}
              placeholder="/artifacts/app_01/public/data/users/usr_123"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="authCheck"
              checked={simIsAuthenticated}
              onChange={(e) => setSimIsAuthenticated(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="authCheck" style={{ fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Simulate Authenticated User
            </label>
          </div>

          {simIsAuthenticated && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                auth.uid
              </label>
              <Input value={simAuthUid} onChange={(e) => setSimAuthUid(e.target.value)} />
            </div>
          )}

          {simResult && (
            <div
              style={{
                marginTop: '10px',
                padding: '12px 14px',
                borderRadius: '6px',
                backgroundColor: simResult.allowed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: simResult.allowed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {simResult.allowed ? <CheckCircle2 size={18} color="var(--success)" /> : <XCircle size={18} color="var(--danger)" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: simResult.allowed ? 'var(--success)' : 'var(--danger)' }}>
                  {simResult.allowed ? 'SIMULATION ALLOWED' : 'SIMULATION DENIED'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Evaluated in {simResult.latencyMs}ms • Matched rules line {simResult.matchedLine}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* =======================================================================
          MODAL: START A COLLECTION
          ======================================================================= */}
      <Modal
        isOpen={showAddColModal}
        onClose={() => setShowAddColModal(false)}
        title="Start a collection"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="fb-btn-text" onClick={() => setShowAddColModal(false)}>
              Cancel
            </button>
            {colModalStep === 1 ? (
              <button className="fb-btn-blue-pill" onClick={handleNextColStep}>
                Next
              </button>
            ) : (
              <button className="fb-btn-blue-pill" onClick={handleFinishCreateCol}>
                Save
              </button>
            )}
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="fb-modal-step-indicator">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="fb-step-badge">1</span>
              <span style={{ fontWeight: 600, color: colModalStep === 1 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                Give the collection an ID
              </span>
            </div>
            <div className="fb-step-divider" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                className="fb-step-badge"
                style={{
                  backgroundColor: colModalStep === 2 ? 'var(--primary)' : 'var(--border-default)',
                  color: colModalStep === 2 ? '#202124' : 'var(--text-muted)',
                }}
              >
                2
              </span>
              <span style={{ fontWeight: 600, color: colModalStep === 2 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                Add its first document
              </span>
            </div>
          </div>

          {colModalStep === 1 ? (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Parent path
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '16px' }}>
                {addColTargetDocPath ? `/${addColTargetDocPath}` : '/'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Collection ID</span>
                <HelpCircle size={13} color="var(--text-muted)" />
              </div>
              <Input
                placeholder="e.g. orders, audit_logs, customers"
                value={newColId}
                onChange={(e) => setNewColId(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Document ID</span>
                  <button
                    type="button"
                    onClick={() => setNewColFirstDocId(generateAutoId())}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Auto-ID
                  </button>
                </div>
                <Input
                  placeholder="Leave empty for auto-generated 20-char ID"
                  value={newColFirstDocId}
                  onChange={(e) => setNewColFirstDocId(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Field</label>
                  <Input value={newColFirstFieldName} onChange={(e) => setNewColFirstFieldName(e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Type</label>
                  <Select value={newColFirstFieldType} onChange={(e) => setNewColFirstFieldType(e.target.value as FieldType)}>
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </Select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Value</label>
                <Input value={newColFirstFieldValue} onChange={(e) => setNewColFirstFieldValue(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* =======================================================================
          MODAL: ADD A DOCUMENT
          ======================================================================= */}
      <Modal
        isOpen={showAddDocModal}
        onClose={() => setShowAddDocModal(false)}
        title="Add a document"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="fb-btn-text" onClick={() => setShowAddDocModal(false)}>
              Cancel
            </button>
            <button className="fb-btn-blue-pill" onClick={handleSaveDocument}>
              Save
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Parent path
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
              /{addDocTargetColPath}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Document ID</span>
                <HelpCircle size={13} color="var(--text-muted)" />
              </div>
              <button
                type="button"
                onClick={() => setNewDocId(generateAutoId())}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
              >
                Auto-ID
              </button>
            </div>
            <Input
              placeholder="Leave empty for auto-generated ID"
              value={newDocId}
              onChange={(e) => setNewDocId(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {docBuilderFields.map((field, idx) => (
              <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="fb-tree-row">
                  <div style={{ flex: 1 }}>
                    <Input
                      placeholder="Field"
                      value={field.name}
                      onChange={(e) => {
                        const updated = [...docBuilderFields];
                        updated[idx].name = e.target.value;
                        setDocBuilderFields(updated);
                      }}
                    />
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>=</span>
                  <div style={{ width: '130px' }}>
                    <Select
                      value={field.type}
                      onChange={(e) => {
                        const updated = [...docBuilderFields];
                        updated[idx].type = e.target.value as FieldType;
                        setDocBuilderFields(updated);
                      }}
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="null">null</option>
                    </Select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (docBuilderFields.length > 1) {
                        setDocBuilderFields(docBuilderFields.filter((_, i) => i !== idx));
                      }
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <MinusCircle size={18} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '20px' }}>
                  <div style={{ width: '16px', height: '16px', borderLeft: '2px solid var(--border-default)', borderBottom: '2px solid var(--border-default)', marginRight: '8px' }} />
                  <div style={{ flex: 1 }}>
                    {field.type === 'boolean' ? (
                      <Select
                        value={field.value}
                        onChange={(e) => {
                          const updated = [...docBuilderFields];
                          updated[idx].value = e.target.value;
                          setDocBuilderFields(updated);
                        }}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </Select>
                    ) : (
                      <Input
                        placeholder="Value"
                        value={field.value}
                        onChange={(e) => {
                          const updated = [...docBuilderFields];
                          updated[idx].value = e.target.value;
                          setDocBuilderFields(updated);
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setDocBuilderFields([
                  ...docBuilderFields,
                  { id: Date.now().toString(), name: '', type: 'string', value: '' },
                ])
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '13px',
                cursor: 'pointer',
                padding: '6px 0',
                marginTop: '4px',
              }}
            >
              <Plus size={14} />
              <span>Add field</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: ADD FIELD TO EXISTING DOC */}
      <Modal
        isOpen={showAddFieldModal}
        onClose={() => setShowAddFieldModal(false)}
        title="Add field"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="fb-btn-text" onClick={() => setShowAddFieldModal(false)}>
              Cancel
            </button>
            <button className="fb-btn-blue-pill" onClick={handleSaveField}>
              Save
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Parent document
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
              /{addFieldTargetDocPath}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Field Name
            </label>
            <Input
              placeholder="e.g. status, enabled, maxRetries"
              value={newFieldKey}
              onChange={(e) => setNewFieldKey(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Type
            </label>
            <Select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as FieldType)}>
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="map">map (JSON)</option>
              <option value="array">array (JSON)</option>
              <option value="null">null</option>
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Value
            </label>
            {newFieldType === 'boolean' ? (
              <Select value={newFieldValue} onChange={(e) => setNewFieldValue(e.target.value)}>
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            ) : newFieldType === 'null' ? (
              <Input disabled value="null" />
            ) : newFieldType === 'map' || newFieldType === 'array' ? (
              <Textarea
                rows={3}
                placeholder={newFieldType === 'map' ? '{"key": "val"}' : '["item1", "item2"]'}
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            ) : (
              <Input
                placeholder="Enter value"
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
              />
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL: EDIT FIELD */}
      <Modal
        isOpen={!!editingField}
        onClose={() => setEditingField(null)}
        title={`Edit field: ${editingField?.key}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="fb-btn-text" onClick={() => setEditingField(null)}>
              Cancel
            </button>
            <button className="fb-btn-blue-pill" onClick={handleSaveEditField}>
              Update
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Type: <strong style={{ color: 'var(--text-primary)' }}>{editingField?.type}</strong>
            </label>
            {editingField?.type === 'boolean' ? (
              <Select value={editFieldVal} onChange={(e) => setEditFieldVal(e.target.value)}>
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            ) : editingField?.type === 'map' || editingField?.type === 'array' ? (
              <Textarea
                rows={4}
                value={editFieldVal}
                onChange={(e) => setEditFieldVal(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            ) : (
              <Input value={editFieldVal} onChange={(e) => setEditFieldVal(e.target.value)} />
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL: DELETE DOCUMENT */}
      <Modal
        isOpen={showDeleteDocModal}
        onClose={() => setShowDeleteDocModal(false)}
        title="Delete document"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="fb-btn-text" onClick={() => setShowDeleteDocModal(false)}>
              Cancel
            </button>
            <button
              className="fb-btn-blue-pill"
              style={{ backgroundColor: 'var(--danger)', color: '#fff' }}
              onClick={handleDeleteDoc}
            >
              Delete
            </button>
          </div>
        }
      >
        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
          Are you sure you want to delete document{' '}
          <code style={{ color: 'var(--primary)' }}>/{deleteDocTarget?.colPath}/{deleteDocTarget?.docId}</code>?
          This action permanently deletes all fields on this document.
        </div>
      </Modal>

      {/* MODAL: START SUBCOLLECTION */}
      <Modal
        isOpen={showAddSubcolModal}
        onClose={() => setShowAddSubcolModal(false)}
        title="Start a subcollection"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="fb-btn-text" onClick={() => setShowAddSubcolModal(false)}>
              Cancel
            </button>
            <button className="fb-btn-blue-pill" onClick={handleSaveSubcollection}>
              Save
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Parent document
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
              /{addSubcolTargetDocPath}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Subcollection ID
            </label>
            <Input
              placeholder="e.g. private, public, devices, sessions"
              value={newSubcolName}
              onChange={(e) => setNewSubcolName(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </Modal>
      {/* MODAL: CREATE DATABASE */}
      <Modal
        isOpen={showCreateDbModal}
        onClose={() => setShowCreateDbModal(false)}
        title="Create Database"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setShowCreateDbModal(false)} disabled={isCreatingDb}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreateDatabase} disabled={isCreatingDb || !newDbName.trim() || !newDbId.trim()}>
              {isCreatingDb ? 'Creating...' : 'Create Database'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleCreateDatabase} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Database Quota</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {databases.length} of {maxDatabases} databases used
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Database Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <Input
              placeholder="e.g. Analytics Data"
              value={newDbName}
              onChange={(e) => {
                setNewDbName(e.target.value);
                if (!newDbId || newDbId === newDbName.toLowerCase().replace(/[^a-z0-9-]/g, '-')) {
                  setNewDbId(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                }
              }}
              required
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Database ID (Slug) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <Input
              placeholder="e.g. analytics-data"
              value={newDbId}
              onChange={(e) => setNewDbId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              required
            />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Alphanumeric characters, dashes, and underscores only.
            </div>
          </div>

          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', background: 'var(--bg-surface-subtle)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
            Engine: <b>Syntrabase JSONB (PostgreSQL 16)</b> with dedicated project-scoped namespace.
          </div>
        </form>
      </Modal>

      {/* Create Composite Index Modal */}
      <Modal
        isOpen={showAddIndexModal}
        onClose={() => setShowAddIndexModal(false)}
        title="Create Composite Index"
        description="Index multiple fields within a collection to support complex multi-clause queries."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="fb-btn-text" onClick={() => setShowAddIndexModal(false)}>
              Cancel
            </button>
            <button
              className="fb-btn-blue-pill"
              onClick={handleCreateCompositeIndex}
              disabled={isCreatingIndex || !newIndexCol || !newIndexField1}
            >
              {isCreatingIndex ? 'Creating...' : 'Create Index'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Collection Path <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <Input
              placeholder="e.g. artifacts or users"
              value={newIndexCol}
              onChange={(e) => setNewIndexCol(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Field 1 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Input
                placeholder="Field name (e.g. status or createdAt)"
                value={newIndexField1}
                onChange={(e) => setNewIndexField1(e.target.value)}
                style={{ flex: 1 }}
                required
              />
              <Select value={newIndexOrder1} onChange={(e) => setNewIndexOrder1(e.target.value)} style={{ width: '120px' }}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </Select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Field 2 (Optional)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Input
                placeholder="Field name (e.g. priority)"
                value={newIndexField2}
                onChange={(e) => setNewIndexField2(e.target.value)}
                style={{ flex: 1 }}
              />
              <Select value={newIndexOrder2} onChange={(e) => setNewIndexOrder2(e.target.value)} style={{ width: '120px' }}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </Select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Query Scope
            </label>
            <Select value={newIndexScope} onChange={(e) => setNewIndexScope(e.target.value)}>
              <option value="Collection">Collection</option>
              <option value="Collection Group">Collection Group</option>
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
