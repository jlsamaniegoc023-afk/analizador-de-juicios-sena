import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  RefreshCw,
  Search,
  Upload,
  Users,
} from 'lucide-react';
import { CompetencyMatrix } from './components/CompetencyMatrix';
import { DriveRepositoryPanel, type AnalyzedDriveEntry } from './components/DriveRepositoryPanel';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { LearnerCard } from './components/LearnerCard';
import { LearnerDetailModal } from './components/LearnerDetailModal';
import type {
  AprendicesRosterResult,
  AprendizResumen,
  SheetParseConfig,
  WorkbookAnalysis,
} from './types/juicios';
import {
  analyzeExcelBuffer,
  consolidateDriveSync,
  crossRostersWithDriveJuicios,
  exportAnalysisToExcel,
  extractFichaCode,
  parseAprendicesRosterBuffer,
  validateFichaAndMerge,
} from './utils/excelParser';
import {
  clearCachedAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
} from './utils/googleAuth';
import {
  DEFAULT_DRIVE_FOLDER_URL,
  downloadDriveExcelAsBuffer,
  DriveAuthError,
  extractDriveFolderId,
  listExcelFilesInDriveFolder,
  type DriveFileItem,
} from './utils/googleDrive';
import {
  buildSampleRosterWorkbookBuffer,
  buildSampleWorkbookBuffer,
} from './utils/sampleExcel';

type ActiveTab = 'drive' | 'fichas' | 'tarjetas' | 'matriz';
type StatusFilter = 'todos' | 'disponibles' | 'no_aprobados' | 'pendientes_lectiva';
type DataSource = 'local' | 'drive';

export default function App() {
  const juiciosInputRef = useRef<HTMLInputElement | null>(null);
  const rosterInputRef = useRef<HTMLInputElement | null>(null);
  const hasAutoSyncedRef = useRef(false);
  const userChangedTabRef = useRef(false);
  const syncRunIdRef = useRef(0);

  const [dataSource, setDataSource] = useState<DataSource>('local');

  // Local upload state
  const [rosterFileName, setRosterFileName] = useState<string>('');
  const [roster, setRoster] = useState<AprendicesRosterResult | null>(null);
  const [juiciosFileName, setJuiciosFileName] = useState<string>('');
  const [juiciosAnalysis, setJuiciosAnalysis] = useState<WorkbookAnalysis | null>(null);

  const [targetFichaManual, setTargetFichaManual] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('tarjetas');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [grupoFilter, setGrupoFilter] = useState<string>('ALL');
  const [selectedAprendiz, setSelectedAprendiz] = useState<AprendizResumen | null>(null);
  const [visibleCardLimit, setVisibleCardLimit] = useState<number>(60);

  // Google Drive & Auto-Sync state (link-shared public mode by default, OAuth fallback for private folders)
  const [requiresPrivateAuth, setRequiresPrivateAuth] = useState<boolean>(false);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string>(DEFAULT_DRIVE_FOLDER_URL);
  const [driveEntries, setDriveEntries] = useState<AnalyzedDriveEntry[]>([]);
  const [selectedDriveKey, setSelectedDriveKey] = useState<string>('ALL');
  const [fichaSearchQuery, setFichaSearchQuery] = useState<string>('');
  const [showNoAprobadosPanel, setShowNoAprobadosPanel] = useState<boolean>(false);
  const [noAprobadosSearch, setNoAprobadosSearch] = useState<string>('');
  const [noAprobadosEstadoFilter, setNoAprobadosEstadoFilter] = useState<string>('ALL');
  const [noAprobadosLimit, setNoAprobadosLimit] = useState<number>(100);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [driveError, setDriveError] = useState<string | null>(null);

  const processJuiciosBuffer = useCallback(
    (buffer: ArrayBuffer, fileName: string, config?: Partial<SheetParseConfig>) => {
      try {
        setParseError(null);
        const result = analyzeExcelBuffer(buffer, fileName, config);
        setJuiciosFileName(fileName);
        setJuiciosAnalysis(result);
        setDataSource('local');
        setGrupoFilter('ALL');
        setSelectedAprendiz(null);
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : 'No se pudo procesar el Reporte de Juicios.'
        );
      }
    },
    []
  );

  const selectTab = useCallback((tab: ActiveTab) => {
    userChangedTabRef.current = true;
    setActiveTab(tab);
  }, []);

  const processRosterBuffer = useCallback(
    (
      buffer: ArrayBuffer,
      fileName: string,
      config?: {
        sheetName?: string;
        headerRowIndex?: number | null;
        documentoColIndex?: number | null;
      }
    ) => {
      try {
        setParseError(null);
        const parsedRoster = parseAprendicesRosterBuffer(buffer, fileName, config);
        setRosterFileName(fileName);
        setRoster(parsedRoster);
        if (parsedRoster.fichaDetectada && !config) {
          setTargetFichaManual(parsedRoster.fichaDetectada);
        }
        setGrupoFilter('ALL');
        setSelectedAprendiz(null);
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : 'No se pudo procesar el listado de aprendices.'
        );
      }
    },
    []
  );

  const handleJuiciosFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
        setParseError('Formato no compatible. Selecciona un archivo .xlsx, .xls o .csv.');
        return;
      }
      const buffer = await file.arrayBuffer();
      processJuiciosBuffer(buffer, file.name);
      selectTab('fichas');
    },
    [processJuiciosBuffer, selectTab]
  );

  const handleRosterFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
        setParseError('Formato no compatible. Selecciona un archivo .xlsx, .xls o .csv.');
        return;
      }
      const buffer = await file.arrayBuffer();
      processRosterBuffer(buffer, file.name);
      selectTab('tarjetas');
    },
    [processRosterBuffer, selectTab]
  );

  const handleDropRoster = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      void handleRosterFile(file);
    },
    [handleRosterFile]
  );

  const handleDropJuicios = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      void handleJuiciosFile(file);
    },
    [handleJuiciosFile]
  );

  const handleLoadSample = useCallback(() => {
    const rosterBuf = buildSampleRosterWorkbookBuffer();
    const juiciosBuf = buildSampleWorkbookBuffer();
    processRosterBuffer(rosterBuf, 'Aprendices_Ficha_2894512_Ejemplo.xlsx');
    processJuiciosBuffer(juiciosBuf, 'Reporte_Juicios_Ficha_2894512_Ejemplo.xlsx');
    selectTab('tarjetas');
  }, [processRosterBuffer, processJuiciosBuffer, selectTab]);

  const classifyAndAnalyzeBuffer = useCallback(
    (file: DriveFileItem, buffer: ArrayBuffer): AnalyzedDriveEntry => {
      try {
        const analysis = analyzeExcelBuffer(buffer, file.name);
        if (
          analysis.columnMapping.competencia >= 0 &&
          analysis.columnMapping.juicio >= 0 &&
          analysis.totalesFicha.totalJuicios > 0
        ) {
          return {
            file,
            kind: 'JUICIOS',
            juicios: analysis,
          };
        }

        const parsedRoster = parseAprendicesRosterBuffer(buffer, file.name);
        return {
          file,
          buffer,
          kind: 'ROSTER',
          roster: parsedRoster,
        };
      } catch (err) {
        return {
          file,
          kind: 'ERROR',
          errorMessage: err instanceof Error ? err.message : 'Formato de Excel no reconocido.',
        };
      }
    },
    []
  );

  const runDriveSyncPipeline = useCallback(
    async (
      accessToken: string | null,
      options?: { folderUrlOverride?: string; silentAuthError?: boolean }
    ) => {
      const runId = ++syncRunIdRef.current;
      setIsSyncing(true);
      setDriveError(null);
      setBatchProgress(null);
      setRequiresPrivateAuth(false);
      setSyncStatusText('Consultando archivos Excel en la carpeta de Google Drive...');

      try {
        const folderId = extractDriveFolderId(options?.folderUrlOverride ?? driveFolderUrl);
        const files = await listExcelFilesInDriveFolder(folderId, accessToken);
        if (syncRunIdRef.current !== runId) return;

        if (files.length === 0) {
          setDriveEntries([]);
          setSyncStatusText(null);
          setDriveError(
            'No se encontraron archivos Excel (.xlsx, .xls, .csv) u hojas de cálculo en la carpeta de Drive.'
          );
          return;
        }

        const workingEntries: AnalyzedDriveEntry[] = files.map((file) => ({
          file,
          kind: 'PENDING',
        }));
        setDriveEntries(workingEntries);
        setBatchProgress({ current: 0, total: files.length });

        let nextIndex = 0;
        let completedCount = 0;
        let hasAnySuccess = false;
        let firstSuccessSwitched = false;
        let authFailed = false;
        let lastFlushAt = Date.now();
        const CONCURRENCY = Math.min(5, files.length);

        const flushProgress = (latestFileName?: string, force = false) => {
          if (syncRunIdRef.current !== runId) return;
          const now = Date.now();
          if (!force && now - lastFlushAt < 350 && completedCount % 5 !== 0) {
            return;
          }
          lastFlushAt = now;
          setDriveEntries([...workingEntries]);
          setBatchProgress({ current: completedCount, total: files.length });
          if (latestFileName) {
            setSyncStatusText(
              `Leyendo archivos (${completedCount} de ${files.length}): ${latestFileName}`
            );
          }
        };

        const worker = async () => {
          while (!authFailed && syncRunIdRef.current === runId) {
            const idx = nextIndex++;
            if (idx >= files.length) break;

            const currentFile = files[idx];
            let analyzed: AnalyzedDriveEntry;
            try {
              const buffer = await downloadDriveExcelAsBuffer(currentFile, accessToken);
              analyzed = classifyAndAnalyzeBuffer(currentFile, buffer);
              if (analyzed.kind === 'JUICIOS' || analyzed.kind === 'ROSTER') {
                hasAnySuccess = true;
              }
            } catch (err) {
              if (err instanceof DriveAuthError) {
                authFailed = true;
                clearCachedAccessToken();
                if (syncRunIdRef.current === runId) {
                  setRequiresPrivateAuth(true);
                  if (!options?.silentAuthError) {
                    setDriveError(err.message);
                  }
                }
                break;
              }
              analyzed = {
                file: currentFile,
                kind: 'ERROR',
                errorMessage:
                  err instanceof Error ? err.message : 'Error descargando o leyendo el Excel.',
              };
            }

            if (syncRunIdRef.current !== runId) break;
            workingEntries[idx] = analyzed;
            completedCount += 1;

            if (!firstSuccessSwitched && hasAnySuccess) {
              firstSuccessSwitched = true;
              setDataSource('drive');
              setSelectedDriveKey('ALL');
              setGrupoFilter('ALL');
              setSelectedAprendiz(null);
              if (!userChangedTabRef.current) {
                setActiveTab('fichas');
              }
              flushProgress(currentFile.name, true);
            } else {
              flushProgress(currentFile.name, completedCount === files.length);
            }
          }
        };

        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
        if (syncRunIdRef.current !== runId) return;

        setDriveEntries([...workingEntries]);
        setBatchProgress({ current: completedCount, total: files.length });
      } catch (err) {
        if (syncRunIdRef.current !== runId) return;
        if (err instanceof DriveAuthError) {
          clearCachedAccessToken();
          setRequiresPrivateAuth(true);
          if (!options?.silentAuthError) {
            setDriveError(err.message);
          }
        } else {
          setDriveError(
            err instanceof Error
              ? err.message
              : 'No se pudo sincronizar la carpeta de Google Drive.'
          );
        }
      } finally {
        if (syncRunIdRef.current === runId) {
          setIsSyncing(false);
          setSyncStatusText(null);
          setBatchProgress(null);
        }
      }
    },
    [driveFolderUrl, classifyAndAnalyzeBuffer]
  );

  useEffect(() => {
    const unsubscribe = initAuth();

    if (!hasAutoSyncedRef.current) {
      hasAutoSyncedRef.current = true;
      void runDriveSyncPipeline(null);
    }

    return () => unsubscribe();
  }, [runDriveSyncPipeline]);

  const handleSyncDrive = useCallback(async () => {
    if (isSyncing) return;

    setDriveError(null);
    let token = getAccessToken();

    if (requiresPrivateAuth && !token) {
      setIsSyncing(true);
      setSyncStatusText('Conectando con Google Drive...');
      try {
        const result = await googleSignIn(true);
        setRequiresPrivateAuth(false);
        token = result.accessToken;
      } catch (err) {
        setIsSyncing(false);
        setSyncStatusText(null);
        setDriveError(
          err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google Drive.'
        );
        return;
      }
    }

    await runDriveSyncPipeline(token);
  }, [isSyncing, requiresPrivateAuth, runDriveSyncPipeline]);

  const syncedJuiciosList = useMemo(
    () =>
      driveEntries
        .filter((e): e is AnalyzedDriveEntry & { juicios: WorkbookAnalysis } =>
          Boolean(e.kind === 'JUICIOS' && e.juicios)
        )
        .map((e) => e.juicios),
    [driveEntries]
  );

  const syncedRostersList = useMemo(
    () =>
      driveEntries
        .filter((e): e is AnalyzedDriveEntry & { roster: AprendicesRosterResult } =>
          Boolean(e.kind === 'ROSTER' && e.roster)
        )
        .map((e) => e.roster),
    [driveEntries]
  );

  const allRosters = useMemo(() => {
    const list: AprendicesRosterResult[] = [];
    if (roster) list.push(roster);
    for (const r of syncedRostersList) {
      if (!roster || r.fileName !== roster.fileName) {
        list.push(r);
      }
    }
    return list;
  }, [roster, syncedRostersList]);

  const hasRosterData = allRosters.length > 0;
  const hasSyncedDriveData = syncedJuiciosList.length > 0 || syncedRostersList.length > 0;
  const hasLocalData = Boolean(roster || juiciosAnalysis);
  const hasAnyData = dataSource === 'drive' ? hasSyncedDriveData : hasLocalData;

  const localValidation = useMemo(
    () =>
      validateFichaAndMerge({
        roster,
        juicios: juiciosAnalysis,
        targetFichaManual,
      }),
    [roster, juiciosAnalysis, targetFichaManual]
  );

  const driveConsolidated = useMemo(
    () =>
      consolidateDriveSync({
        juiciosList: syncedJuiciosList,
        rosters: allRosters,
        selectedKey: selectedDriveKey,
      }),
    [syncedJuiciosList, allRosters, selectedDriveKey]
  );

  const validation =
    dataSource === 'drive' && hasSyncedDriveData ? driveConsolidated.validation : localValidation;
  const fichasDisponibles =
    dataSource === 'drive' && hasSyncedDriveData ? driveConsolidated.fichasDisponibles : [];
  const missingRosterFichas =
    dataSource === 'drive' && hasSyncedDriveData ? driveConsolidated.missingRosterFichas : [];

  // Exclusively for "Tarjetas de Aprendices": ONLY apprentices from Excel de Aprendices Disponibles
  const tarjetasValidation = useMemo(() => {
    if (!hasRosterData) return null;
    if (dataSource === 'local' && juiciosAnalysis) {
      return localValidation;
    }
    const juiciosPool =
      syncedJuiciosList.length > 0
        ? syncedJuiciosList
        : juiciosAnalysis
          ? [juiciosAnalysis]
          : [];
    return crossRostersWithDriveJuicios({
      rosters: allRosters,
      juiciosList: juiciosPool,
    });
  }, [hasRosterData, dataSource, juiciosAnalysis, localValidation, syncedJuiciosList, allRosters]);

  const tarjetasAprendices = tarjetasValidation?.aprendices ?? [];
  const tarjetasGrupos = tarjetasValidation?.grupos ?? [];

  const filteredAprendices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return tarjetasAprendices.filter((apr) => {
      if (statusFilter === 'disponibles' && !apr.esDisponible) return false;
      if (statusFilter === 'no_aprobados' && apr.noAprobados === 0) return false;
      if (statusFilter === 'pendientes_lectiva' && apr.lectivaPorEvaluar === 0) return false;
      if (grupoFilter !== 'ALL' && apr.grupo !== grupoFilter) return false;

      if (!q) return true;
      return (
        apr.nombreCompleto.toLowerCase().includes(q) ||
        apr.numeroDocumento.toLowerCase().includes(q) ||
        apr.estadoAprendiz.toLowerCase().includes(q) ||
        apr.grupo.toLowerCase().includes(q) ||
        (apr.ficha && apr.ficha.toLowerCase().includes(q))
      );
    });
  }, [tarjetasAprendices, searchQuery, statusFilter, grupoFilter]);

  useEffect(() => {
    setVisibleCardLimit(60);
  }, [searchQuery, statusFilter, grupoFilter, selectedDriveKey, dataSource, rosterFileName]);

  const filteredFichasDrive = useMemo(() => {
    const q = fichaSearchQuery.trim().toLowerCase();
    if (!q) return fichasDisponibles;
    return fichasDisponibles.filter(
      (item) =>
        item.ficha.toLowerCase().includes(q) ||
        item.fileName.toLowerCase().includes(q) ||
        item.programa.toLowerCase().includes(q) ||
        item.modalidadFormacion.toLowerCase().includes(q) ||
        item.fechaReporte.toLowerCase().includes(q)
    );
  }, [fichasDisponibles, fichaSearchQuery]);

  const noAprobadosList = useMemo(() => {
    if (!validation.canShowResumen) return [];
    const programaByFile = new Map<string, string>();
    const programaByFicha = new Map<string, string>();

    for (const f of fichasDisponibles) {
      if (f.programa) {
        programaByFile.set(f.fileName, f.programa);
        if (f.ficha) programaByFicha.set(f.ficha, f.programa);
      }
    }
    for (const g of validation.grupos) {
      if (g.denominacion && !programaByFicha.has(g.grupo)) {
        programaByFicha.set(g.grupo, g.denominacion);
      }
    }

    const rows: Array<{
      key: string;
      ficha: string;
      programa: string;
      aprendizNombre: string;
      aprendizEstado: string;
      aprendizDoc: string;
      competencia: string;
      resultadoAprendizaje: string;
      instructor: string;
      fechaJuicio: string;
    }> = [];

    for (const apr of validation.aprendices) {
      if (apr.noAprobados === 0) continue;
      const fichaNum = apr.ficha || extractFichaCode(apr.grupo) || apr.grupo || 'Sin ficha';
      const programa =
        (apr.archivoOrigen ? programaByFile.get(apr.archivoOrigen) : '') ||
        programaByFicha.get(fichaNum) ||
        programaByFicha.get(apr.grupo) ||
        apr.perfil.especialidad ||
        (dataSource === 'local'
          ? juiciosAnalysis?.metadata.denominacion || juiciosAnalysis?.metadata.programa || ''
          : '') ||
        'No registrado';
      const aprendizEstado = (apr.estadoAprendiz || 'Sin estado').trim() || 'Sin estado';

      for (const jr of apr.juicios) {
        if (jr.juicioEstado !== 'NO_APROBADO') continue;
        const rawInst = jr.funcionario.trim();
        const instructor =
          !rawInst || rawInst === '-' || rawInst === '--' || rawInst.toUpperCase() === 'N/A'
            ? 'Sin registrar'
            : rawInst;
        rows.push({
          key: `${fichaNum}-${apr.numeroDocumento}-${jr.rowNumber}`,
          ficha: fichaNum,
          programa,
          aprendizNombre: apr.nombreCompleto,
          aprendizEstado,
          aprendizDoc: `${apr.tipoDocumento ? `${apr.tipoDocumento} ` : ''}${apr.numeroDocumento}`,
          competencia: jr.competencia || 'Sin competencia',
          resultadoAprendizaje: jr.resultadoAprendizaje || '',
          instructor,
          fechaJuicio: jr.fechaJuicio || 'Sin registrar',
        });
      }
    }
    return rows;
  }, [validation, fichasDisponibles, dataSource, juiciosAnalysis]);

  const noAprobadosEstadoCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of noAprobadosList) {
      map.set(item.aprendizEstado, (map.get(item.aprendizEstado) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([estado, count]) => ({ estado, count }))
      .sort((a, b) => b.count - a.count || a.estado.localeCompare(b.estado, 'es'));
  }, [noAprobadosList]);

  const effectiveNoAprobadosEstadoFilter =
    noAprobadosEstadoFilter === 'ALL' ||
    noAprobadosEstadoCounts.some((c) => c.estado === noAprobadosEstadoFilter)
      ? noAprobadosEstadoFilter
      : 'ALL';

  const filteredNoAprobadosList = useMemo(() => {
    const q = noAprobadosSearch.trim().toLowerCase();
    return noAprobadosList.filter((item) => {
      if (
        effectiveNoAprobadosEstadoFilter !== 'ALL' &&
        item.aprendizEstado !== effectiveNoAprobadosEstadoFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.ficha.toLowerCase().includes(q) ||
        item.programa.toLowerCase().includes(q) ||
        item.aprendizNombre.toLowerCase().includes(q) ||
        item.aprendizEstado.toLowerCase().includes(q) ||
        item.aprendizDoc.toLowerCase().includes(q) ||
        item.competencia.toLowerCase().includes(q) ||
        item.instructor.toLowerCase().includes(q) ||
        item.fechaJuicio.toLowerCase().includes(q)
      );
    });
  }, [noAprobadosList, noAprobadosSearch, effectiveNoAprobadosEstadoFilter]);

  useEffect(() => {
    setNoAprobadosLimit(100);
  }, [noAprobadosSearch, effectiveNoAprobadosEstadoFilter, selectedDriveKey, dataSource]);

  const countsByFilter = useMemo(() => {
    const list =
      grupoFilter === 'ALL'
        ? tarjetasAprendices
        : tarjetasAprendices.filter((a) => a.grupo === grupoFilter);
    return {
      todos: list.length,
      disponibles: list.filter((a) => a.esDisponible).length,
      noAprobados: list.filter((a) => a.noAprobados > 0).length,
      pendientesLectiva: list.filter((a) => a.lectivaPorEvaluar > 0).length,
    };
  }, [tarjetasAprendices, grupoFilter]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <input
        ref={juiciosInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          void handleJuiciosFile(file);
          e.target.value = '';
        }}
      />

      <input
        ref={rosterInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          void handleRosterFile(file);
          e.target.value = '';
        }}
      />

      {/* Top Bar Contract: Previous Menu preserved */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text wordmark */}
          <button
            type="button"
            onClick={() => selectTab('tarjetas')}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Analizador de Juicios
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Vistas del reporte"
            className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => selectTab('tarjetas')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'tarjetas'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Tarjetas de Aprendices
            </button>
            <button
              type="button"
              onClick={() => selectTab('drive')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'drive'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Repositorio Drive
            </button>
            <button
              type="button"
              onClick={() => selectTab('fichas')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'fichas'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Fichas y Reportes
            </button>
            {(hasAnyData || hasRosterData) && (
              <button
                type="button"
                onClick={() => selectTab('matriz')}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'matriz'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                Matriz de Competencias
              </button>
            )}
          </nav>

          {/* Zone 3: Primary Upload action from previous menu */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => juiciosInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Subir Reporte de Juicios</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {parseError && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold">Error al leer el archivo</div>
              <p className="text-xs text-red-700 mt-0.5">{parseError}</p>
            </div>
          </div>
        )}

        {/* Mobile view tabs */}
        <div className="flex md:hidden items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {(hasAnyData || hasRosterData
            ? [
                { id: 'tarjetas', label: 'Tarjetas' },
                { id: 'drive', label: 'Drive' },
                { id: 'fichas', label: 'Fichas' },
                { id: 'matriz', label: 'Competencias' },
              ]
            : [
                { id: 'tarjetas', label: 'Tarjetas' },
                { id: 'drive', label: 'Repositorio Drive' },
                { id: 'fichas', label: 'Fichas Drive' },
              ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id as ActiveTab)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                activeTab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'drive' && (
          <DriveRepositoryPanel
            folderUrl={driveFolderUrl}
            onChangeFolderUrl={setDriveFolderUrl}
            requiresPrivateAuth={requiresPrivateAuth}
            isSyncing={isSyncing}
            syncStatusText={syncStatusText}
            batchProgress={batchProgress}
            driveError={driveError}
            entries={driveEntries}
            selectedDriveKey={selectedDriveKey}
            onSync={() => void handleSyncDrive()}
            onSelectFileView={(fileKey) => {
              setDataSource('drive');
              setSelectedDriveKey(fileKey);
              setGrupoFilter('ALL');
              selectTab('fichas');
            }}
          />
        )}

        {activeTab === 'fichas' && (
          !hasSyncedDriveData && !juiciosAnalysis ? (
            <section className="max-w-4xl mx-auto py-8 space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                  Fichas y Reportes de Evaluación en Drive
                </h1>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-3xl">
                  Sincroniza los reportes de juicios evaluativos alojados en Google Drive para consultar cada Ficha de Caracterización, su Fecha del Reporte y el consolidado de juicios.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <FolderOpen className="w-4 h-4 text-slate-600" aria-hidden="true" />
                      <span>Sincronizar reportes desde Google Drive</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Enlaza directamente con la carpeta compartida de Drive (sin requerir inicio de sesión en Gmail), lee los Excel alojados y muestra cada Ficha con su Fecha del Reporte.
                    </p>
                  </div>

                  <div className="shrink-0">
                    {requiresPrivateAuth ? (
                      <GoogleSignInButton
                        onClick={() => void handleSyncDrive()}
                        disabled={isSyncing}
                        label={isSyncing ? 'Sincronizando...' : 'Sincronizar con Google'}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSyncDrive()}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span>
                          {isSyncing && batchProgress
                            ? `Sincronizando ${batchProgress.current}/${batchProgress.total}...`
                            : isSyncing
                              ? 'Sincronizando...'
                              : 'Sincronizar'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {isSyncing && (
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-800 truncate">
                        {syncStatusText || 'Conectando con Google Drive...'}
                      </span>
                      {batchProgress && (
                        <span className="font-mono tabular-nums text-slate-500 shrink-0">
                          {batchProgress.current} / {batchProgress.total}
                        </span>
                      )}
                    </div>
                    {batchProgress && batchProgress.total > 0 && (
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-900 transition-all duration-200"
                          style={{
                            width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {driveError && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5"
                  >
                    <AlertTriangle
                      className="w-4 h-4 text-red-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>{driveError}</span>
                  </div>
                )}
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDropJuicios}
                className={`bg-white border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                  isDragging ? 'border-slate-900 bg-slate-50' : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-base font-semibold text-slate-900">
                  Arrastra un Reporte de Juicios aquí o selecciónalo manualmente
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Compatible con formatos .xlsx, .xls y .csv.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => juiciosInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Upload className="w-4 h-4" aria-hidden="true" />
                    <span>Subir Reporte de Juicios</span>
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <div className="space-y-8">
              {isSyncing && (
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-900 truncate">
                      {syncStatusText || 'Sincronizando con Google Drive...'}
                    </span>
                    {batchProgress && (
                      <span className="font-mono tabular-nums text-slate-500 shrink-0">
                        {batchProgress.current} / {batchProgress.total}
                      </span>
                    )}
                  </div>
                  {batchProgress && batchProgress.total > 0 && (
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-900 transition-all duration-200"
                        style={{
                          width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Ficha Context & Drive Actions */}
              <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 truncate">
                    {dataSource === 'drive'
                      ? selectedDriveKey !== 'ALL'
                        ? fichasDisponibles.find((f) => f.key === selectedDriveKey)?.programa ||
                          selectedDriveKey
                        : fichasDisponibles.length === 1
                          ? fichasDisponibles[0].programa || fichasDisponibles[0].fileName
                          : 'Información Consolidada de Google Drive'
                      : juiciosAnalysis?.metadata.programa || juiciosAnalysis?.metadata.fileName}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    {dataSource === 'drive' ? (
                      (() => {
                        const activeFichaInfo =
                          selectedDriveKey !== 'ALL'
                            ? fichasDisponibles.find((f) => f.key === selectedDriveKey)
                            : fichasDisponibles.length === 1
                              ? fichasDisponibles[0]
                              : null;
                        return (
                          <>
                            <span>{driveEntries.length} archivos sincronizados desde Drive</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {syncedJuiciosList.length} reporte(s) de juicios ·{' '}
                              {syncedRostersList.length} archivo(s) de aprendices
                            </span>
                            {activeFichaInfo && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-medium text-slate-800">
                                  Fecha del Reporte:{' '}
                                  <span className="font-mono tabular-nums">
                                    {activeFichaInfo.fechaReporte || 'No registrada'}
                                  </span>
                                </span>
                              </>
                            )}
                          </>
                        );
                      })()
                    ) : (
                      <>
                        {juiciosAnalysis && (
                          <span>
                            Juicios: {juiciosAnalysis.metadata.fileName} (Hoja{' '}
                            {juiciosAnalysis.metadata.sheetName} · Fila{' '}
                            {juiciosAnalysis.metadata.headerRowNumber})
                          </span>
                        )}
                        {juiciosAnalysis?.metadata.fechaReporte && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Fecha del Reporte: {juiciosAnalysis.metadata.fechaReporte}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {dataSource === 'drive' && fichasDisponibles.length > 1 && (
                    <select
                      aria-label="Filtrar por archivo o Ficha de Drive"
                      value={selectedDriveKey}
                      onChange={(e) => {
                        setSelectedDriveKey(e.target.value);
                        setGrupoFilter('ALL');
                      }}
                      className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-900 max-w-xs"
                    >
                      <option value="ALL">
                        Todas las Fichas sincronizadas ({fichasDisponibles.length})
                      </option>
                      {fichasDisponibles.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.ficha ? `Ficha ${item.ficha}` : item.fileName} (
                          {item.totalDisponibles} disp. / {item.totalAprendices})
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleSyncDrive()}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Drive'}</span>
                  </button>

                  <a
                    href={driveFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <span>Abrir Drive</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  </a>

                  {validation.canShowResumen && (
                    <button
                      type="button"
                      onClick={() =>
                        exportAnalysisToExcel(
                          validation,
                          dataSource === 'drive'
                            ? selectedDriveKey !== 'ALL'
                              ? selectedDriveKey
                              : 'Drive_Consolidado'
                            : juiciosFileName || 'Reporte'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                      <span>Exportar Resumen</span>
                    </button>
                  )}
                </div>
              </section>

              {/* Drive / Ficha Sync Validation Banner (Moved here from Tarjetas de Aprendices) */}
              {validation.canShowResumen ? (
                <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                    <span>{validation.mensajeValidacion}</span>
                  </div>
                  {(dataSource !== 'drive' || selectedDriveKey !== 'ALL' || fichasDisponibles.length <= 1) &&
                    validation.juiciosFicha && (
                      <span className="font-mono tabular-nums text-emerald-800">
                        Ficha de Caracterización: {validation.juiciosFicha}
                      </span>
                    )}
                </div>
              ) : (
                <section
                  role="alert"
                  className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-1">
                      <h2 className="text-sm font-semibold text-amber-950">
                        Se debe subir el Reporte de Juicios de la Ficha para poder analizar
                      </h2>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        {validation.mensajeValidacion}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => juiciosInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      Subir Reporte de Juicios
                      {validation.expectedFicha ? ` (Ficha ${validation.expectedFicha})` : ''}
                    </span>
                  </button>
                </section>
              )}

              {missingRosterFichas.length > 0 && validation.canShowResumen && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle
                    className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    En Drive existe un listado de aprendices para la(s) Ficha(s){' '}
                    <strong className="font-mono">{missingRosterFichas.join(', ')}</strong> sin su
                    Reporte de Juicios correspondiente. Se debe subir el Reporte de Juicios de la
                    Ficha para analizarla.
                  </span>
                </div>
              )}

              {dataSource === 'local' && juiciosAnalysis && juiciosAnalysis.warnings.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle
                      className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <ul className="space-y-1">
                      {juiciosAnalysis.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Per-file Drive Ficha & Fecha del Reporte cards with 3x3 (9-card) scrollable viewport */}
              {dataSource === 'drive' && fichasDisponibles.length > 0 && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Fichas y Reportes en Drive ({fichasDisponibles.length})
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      {fichasDisponibles.length > 6 && (
                        <div className="relative">
                          <Search
                            className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                            aria-hidden="true"
                          />
                          <input
                            type="search"
                            value={fichaSearchQuery}
                            onChange={(e) => setFichaSearchQuery(e.target.value)}
                            placeholder="Filtrar Ficha o programa..."
                            className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 w-52"
                          />
                        </div>
                      )}
                      {fichasDisponibles.length > 1 && selectedDriveKey !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDriveKey('ALL');
                            setGrupoFilter('ALL');
                          }}
                          className="text-xs font-medium text-slate-700 hover:text-slate-900 underline cursor-pointer"
                        >
                          Ver todas las Fichas ({fichasDisponibles.length})
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-100/70 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                    {filteredFichasDrive.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-xs text-slate-500">
                        No se encontraron fichas que coincidan con &quot;{fichaSearchQuery}&quot;.
                      </div>
                    ) : (
                      <div
                        className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 max-h-[560px] pr-1.5 ${
                          filteredFichasDrive.length > 9 ? 'overflow-y-scroll' : 'overflow-y-auto'
                        }`}
                      >
                        {filteredFichasDrive.map((item) => {
                          const isSelected =
                            selectedDriveKey === item.key ||
                            (fichasDisponibles.length === 1 && selectedDriveKey === 'ALL');
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                setSelectedDriveKey((prev) =>
                                  prev === item.key && fichasDisponibles.length > 1 ? 'ALL' : item.key
                                );
                                setGrupoFilter('ALL');
                              }}
                              className={`text-left bg-white rounded-xl p-3.5 border transition-colors cursor-pointer space-y-2 flex flex-col justify-between ${
                                isSelected
                                  ? 'border-slate-900 ring-1 ring-slate-900'
                                  : 'border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                                        {item.ficha ? `Ficha ${item.ficha}` : 'Sin número de ficha'}
                                      </span>
                                      {item.modalidadFormacion && (
                                        <span
                                          className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                                            item.modalidadFormacion.toUpperCase().includes('VIRTUAL')
                                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                                              : 'bg-slate-100 text-slate-700 border-slate-200'
                                          }`}
                                        >
                                          {item.modalidadFormacion}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className="text-xs text-slate-500 truncate"
                                      title={item.fileName}
                                    >
                                      {item.fileName}
                                    </div>
                                  </div>
                                  <span className="text-xs font-semibold text-emerald-700 font-mono tabular-nums shrink-0">
                                    {item.totalDisponibles} / {item.totalAprendices} disp.
                                  </span>
                                </div>

                                {item.programa && (
                                  <div
                                    className="text-xs text-slate-700 font-medium truncate"
                                    title={item.programa}
                                  >
                                    {item.programa}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-2">
                                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-slate-600">
                                    Fecha del Reporte:{' '}
                                    <strong className="font-mono tabular-nums text-slate-900">
                                      {item.fechaReporte || 'No registrada'}
                                    </strong>
                                  </span>
                                  <span className="font-mono tabular-nums text-[11px] text-slate-500">
                                    A:{item.aprobados} · NA:{item.noAprobados} · PE:{item.porEvaluar}
                                  </span>
                                </div>

                                {item.estadosAprendices.length > 0 && (
                                  <div className="pt-1.5 border-t border-slate-100 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-600">
                                    <span className="font-medium text-slate-500">Estados:</span>
                                    {item.estadosAprendices.map((est) => (
                                      <span
                                        key={est.estado}
                                        className="inline-flex items-center gap-1 font-mono tabular-nums"
                                      >
                                        <span className="font-sans text-slate-700">
                                          {est.estado}:
                                        </span>
                                        <strong className="text-slate-900">{est.count}</strong>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {filteredFichasDrive.length > 9 && (
                      <div className="pt-1 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          Vista de 3×3 (9 fichas por bloque) · Desplázate con la barra lateral para ver las {filteredFichasDrive.length} fichas
                        </span>
                        <span className="font-mono tabular-nums font-medium text-slate-700">
                          Total: {filteredFichasDrive.length}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* 4-column Ficha Resumen (only Juicios No Aprobados is clickable) */}
              {validation.canShowResumen && (
                <section className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">
                        Aprendices (Columna B)
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                          {validation.totalesFicha.totalAprendices}
                        </span>
                        <span className="text-xs font-semibold text-emerald-700 font-mono tabular-nums">
                          {validation.totalesFicha.totalDisponibles} disponibles
                        </span>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Juicios Aprobados</div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                          {validation.totalesFicha.aprobados}
                        </span>
                        <span className="text-xs text-slate-500 font-mono tabular-nums">
                          {validation.totalesFicha.totalJuicios > 0
                            ? `${Math.round(
                                (validation.totalesFicha.aprobados /
                                  validation.totalesFicha.totalJuicios) *
                                  100
                              )}%`
                            : '0%'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowNoAprobadosPanel((prev) => !prev)}
                      aria-expanded={showNoAprobadosPanel}
                      className={`text-left bg-white rounded-xl p-5 border transition-colors cursor-pointer ${
                        showNoAprobadosPanel
                          ? 'border-red-500 ring-1 ring-red-500'
                          : 'border-slate-200 hover:border-red-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                        <span>Juicios No Aprobados</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600">
                          <span>{showNoAprobadosPanel ? 'Ocultar' : 'Ver detalle'}</span>
                          {showNoAprobadosPanel ? (
                            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span
                          className={`text-2xl font-bold font-mono tabular-nums ${
                            validation.totalesFicha.noAprobados > 0
                              ? 'text-red-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {validation.totalesFicha.noAprobados}
                        </span>
                        <span className="text-xs text-slate-500 font-mono tabular-nums">
                          {validation.totalesFicha.totalJuicios > 0
                            ? `${Math.round(
                                (validation.totalesFicha.noAprobados /
                                  validation.totalesFicha.totalJuicios) *
                                  100
                              )}%`
                            : '0%'}
                        </span>
                      </div>
                    </button>

                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Juicios Por Evaluar</div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span
                          className={`text-2xl font-bold font-mono tabular-nums ${
                            validation.totalesFicha.porEvaluar > 0
                              ? 'text-amber-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {validation.totalesFicha.porEvaluar}
                        </span>
                        <span className="text-xs text-slate-500 font-mono tabular-nums">
                          de {validation.totalesFicha.totalJuicios} totales
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Juicios No Aprobados Detail Drawer */}
                  {showNoAprobadosPanel && (
                    <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-red-50/60 border-b border-red-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            Detalle de Juicios No Aprobados ({filteredNoAprobadosList.length})
                          </h3>
                          <p className="text-xs text-slate-600">
                            Número de Ficha, Programa de Formación, Aprendiz (con su estado en el reporte), Competencia, Instructor y Fecha del Juicio No Aprobado.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <Search
                              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                              aria-hidden="true"
                            />
                            <input
                              type="search"
                              value={noAprobadosSearch}
                              onChange={(e) => setNoAprobadosSearch(e.target.value)}
                              placeholder="Buscar ficha, programa, aprendiz..."
                              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 w-60"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowNoAprobadosPanel(false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                          >
                            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Cerrar</span>
                          </button>
                        </div>
                      </div>

                      {noAprobadosEstadoCounts.length > 0 && (
                        <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
                            Estado:
                          </span>
                          <button
                            type="button"
                            onClick={() => setNoAprobadosEstadoFilter('ALL')}
                            aria-pressed={effectiveNoAprobadosEstadoFilter === 'ALL'}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
                              effectiveNoAprobadosEstadoFilter === 'ALL'
                                ? 'bg-slate-900 border-slate-900 text-white font-semibold'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 font-medium'
                            }`}
                          >
                            <span>Todos</span>
                            <span className="font-mono tabular-nums text-[11px] opacity-80">
                              ({noAprobadosList.length})
                            </span>
                          </button>
                          {noAprobadosEstadoCounts.map((est) => {
                            const isActive = effectiveNoAprobadosEstadoFilter === est.estado;
                            return (
                              <button
                                key={est.estado}
                                type="button"
                                onClick={() =>
                                  setNoAprobadosEstadoFilter((prev) =>
                                    prev === est.estado ? 'ALL' : est.estado
                                  )
                                }
                                aria-pressed={isActive}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
                                  isActive
                                    ? 'bg-red-600 border-red-600 text-white font-semibold'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 font-medium'
                                }`}
                              >
                                <span>{est.estado}</span>
                                <span className="font-mono tabular-nums text-[11px] opacity-85">
                                  ({est.count})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {filteredNoAprobadosList.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-500">
                          No se encontraron juicios No Aprobados con el criterio actual.
                        </div>
                      ) : (
                        <>
                          <div className="overflow-auto max-h-[440px]">
                            <table className="w-full text-left border-separate border-spacing-0">
                              <thead>
                                <tr className="text-xs font-medium text-slate-600">
                                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-2.5 px-4 whitespace-nowrap">
                                    Ficha
                                  </th>
                                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-2.5 px-4 whitespace-nowrap">
                                    Programa de Formación
                                  </th>
                                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-2.5 px-4 whitespace-nowrap">
                                    Aprendiz
                                  </th>
                                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-2.5 px-4">
                                    Competencia
                                  </th>
                                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-2.5 px-4">
                                    Instructor
                                  </th>
                                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-2.5 px-4 whitespace-nowrap">
                                    Fecha del Juicio
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="text-xs">
                                {filteredNoAprobadosList
                                  .slice(0, noAprobadosLimit)
                                  .map((row, idx, arr) => {
                                    const rowBorder =
                                      idx < arr.length - 1 ? 'border-b border-slate-100' : '';
                                    return (
                                      <tr
                                        key={row.key}
                                        className="hover:bg-slate-50/80 transition-colors align-top"
                                      >
                                        <td
                                          className={`py-2.5 px-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap ${rowBorder}`}
                                        >
                                          {row.ficha}
                                        </td>
                                        <td
                                          className={`py-2.5 px-4 text-slate-700 font-medium max-w-xs ${rowBorder}`}
                                        >
                                          {row.programa}
                                        </td>
                                        <td className={`py-2.5 px-4 whitespace-nowrap ${rowBorder}`}>
                                          <div className="font-medium text-slate-900">
                                            {row.aprendizNombre}
                                          </div>
                                          <div className="text-[11px] text-slate-600 mt-0.5">
                                            Estado:{' '}
                                            <span className="font-semibold text-slate-800">
                                              {row.aprendizEstado}
                                            </span>
                                          </div>
                                          <div className="text-[11px] font-mono tabular-nums text-slate-500">
                                            {row.aprendizDoc}
                                          </div>
                                        </td>
                                        <td className={`py-2.5 px-4 max-w-md ${rowBorder}`}>
                                          <div className="font-medium text-slate-800 leading-snug">
                                            {row.competencia}
                                          </div>
                                          {row.resultadoAprendizaje && (
                                            <div className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                                              {row.resultadoAprendizaje}
                                            </div>
                                          )}
                                        </td>
                                        <td className={`py-2.5 px-4 text-slate-700 ${rowBorder}`}>
                                          {row.instructor}
                                        </td>
                                        <td
                                          className={`py-2.5 px-4 font-mono tabular-nums text-red-700 font-medium whitespace-nowrap ${rowBorder}`}
                                        >
                                          {row.fechaJuicio}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>

                          {filteredNoAprobadosList.length > noAprobadosLimit && (
                            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="text-slate-500 font-mono tabular-nums">
                                Mostrando {noAprobadosLimit} de {filteredNoAprobadosList.length}{' '}
                                registros
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setNoAprobadosLimit((prev) => prev + 100)}
                                  className="px-3 py-1.5 font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                                >
                                  Mostrar 100 más
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setNoAprobadosLimit(filteredNoAprobadosList.length)
                                  }
                                  className="px-3 py-1.5 font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                                >
                                  Mostrar todos
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}
            </div>
          )
        )}

        {activeTab === 'tarjetas' && (
          !hasRosterData || !tarjetasValidation ? (
            /* Tarjetas de Aprendices: Upload Excel de Aprendices Disponibles */
            <section className="max-w-4xl mx-auto py-8 space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                  Tarjetas de Aprendices Disponibles
                </h1>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-3xl">
                  En esta sección se muestran únicamente los aprendices del archivo Excel de aprendices disponibles, con su Dirección, Teléfono, Correo Electrónico, Municipio, Fecha Grabación, Especialidad y el cruce de su estado Disponible.
                </p>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDropRoster}
                className={`bg-white border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                  isDragging
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Users className="w-6 h-6" aria-hidden="true" />
                </div>

                <h2 className="mt-4 text-base font-semibold text-slate-900">
                  Arrastra el Excel de aprendices disponibles aquí o selecciona el archivo
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Compatible con formatos .xlsx, .xls y .csv. Se leerá la información de cada aprendiz y se cruzará por Número de Documento (Columna B).
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => rosterInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Users className="w-4 h-4" aria-hidden="true" />
                    <span>Subir Excel de Aprendices</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>Cargar ejemplo (Ficha 2894512)</span>
                  </button>
                </div>

                {syncedJuiciosList.length > 0 && (
                  <p className="mt-4 text-xs text-emerald-700 font-medium">
                    Los reportes sincronizados en &quot;Fichas y Reportes&quot; se cruzarán automáticamente al cargar el Excel de aprendices disponibles.
                  </p>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600">
                <div className="space-y-1.5">
                  <div className="font-semibold text-slate-900 text-sm">
                    1. Datos del Excel de Aprendices Disponibles
                  </div>
                  <p className="leading-relaxed">
                    Muestra exclusivamente los aprendices incluidos en el Excel de aprendices disponibles junto con Dirección, Teléfono, Correo Electrónico, Municipio, Fecha Grabación y Especialidad.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="font-semibold text-slate-900 text-sm">
                    2. Regla del Botón Verde Disponible
                  </div>
                  <p className="leading-relaxed">
                    Al cruzar la Columna B (Número de Documento) con los reportes de juicios, se activa únicamente cuando tiene 0 No Aprobados y su único juicio Por Evaluar es RESULTADOS DE APRENDIZAJE ETAPA PRACTICA.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <div className="space-y-6">
              {/* Header strictly for Excel de Aprendices Disponibles */}
              <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 truncate">
                    Aprendices Disponibles
                    {allRosters[0]?.programa ? ` · ${allRosters[0].programa}` : ''}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>
                      Excel: {allRosters.map((r) => r.fileName).join(', ')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {tarjetasAprendices.length} aprendiz(ces)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-emerald-700 font-mono tabular-nums">
                      {tarjetasValidation.totalesFicha.totalDisponibles} disponibles
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {dataSource === 'local' && juiciosAnalysis && (
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                      <label
                        htmlFor="workspace-ficha-input"
                        className="text-xs font-medium text-slate-500 whitespace-nowrap"
                      >
                        Ficha de Caracterización:
                      </label>
                      <input
                        id="workspace-ficha-input"
                        type="text"
                        value={targetFichaManual}
                        onChange={(e) => setTargetFichaManual(e.target.value)}
                        placeholder={tarjetasValidation.juiciosFicha || 'Ej. 2894512'}
                        className="w-28 text-xs font-mono font-semibold tabular-nums text-slate-900 focus:outline-none"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => rosterInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                    <span>Cambiar Excel Aprendices</span>
                  </button>

                  {tarjetasValidation.aprendices.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        exportAnalysisToExcel(
                          tarjetasValidation,
                          allRosters[0]?.fileName || 'Aprendices_Disponibles'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                      <span>Exportar Resumen</span>
                    </button>
                  )}
                </div>
              </section>

              {dataSource === 'local' &&
                juiciosAnalysis &&
                tarjetasValidation.matchState === 'MISMATCH' && (
                  <div
                    role="alert"
                    className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5"
                  >
                    <AlertTriangle
                      className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>{tarjetasValidation.mensajeValidacion}</span>
                  </div>
                )}

              <section className="space-y-5">
                {tarjetasAprendices.length > 0 && (
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                      <div className="relative flex-1 max-w-md">
                        <Search
                          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Buscar por nombre o documento (Col B)..."
                          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900"
                        />
                      </div>

                      {tarjetasGrupos.length > 1 && (
                        <select
                          aria-label="Filtrar por grupo"
                          value={grupoFilter}
                          onChange={(e) => setGrupoFilter(e.target.value)}
                          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-900"
                        >
                          <option value="ALL">
                            Todos los grupos ({tarjetasGrupos.length})
                          </option>
                          {tarjetasGrupos.map((g) => (
                            <option key={g.grupo} value={g.grupo}>
                              {g.grupo} ({g.totalAprendices})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {tarjetasValidation.canShowResumen && (
                      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto shrink-0">
                        {(
                          [
                            { id: 'todos', label: `Todos (${countsByFilter.todos})` },
                            {
                              id: 'disponibles',
                              label: `Disponibles (${countsByFilter.disponibles})`,
                            },
                            {
                              id: 'no_aprobados',
                              label: `No Aprobados (${countsByFilter.noAprobados})`,
                            },
                            {
                              id: 'pendientes_lectiva',
                              label: `Lectivos Por Evaluar (${countsByFilter.pendientesLectiva})`,
                            },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setStatusFilter(tab.id)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              statusFilter === tab.id
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tarjetasAprendices.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
                    <p className="text-sm font-medium text-slate-700">
                      No se encontraron aprendices en el Excel de aprendices disponibles.
                    </p>
                    <p className="text-xs text-slate-500">
                      Verifica que el archivo Excel incluya la fila de encabezados y la columna de Número de Documento.
                    </p>
                  </div>
                ) : filteredAprendices.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
                    <p className="text-sm font-medium text-slate-700">
                      No se encontraron aprendices que coincidan con el filtro actual.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setStatusFilter('todos');
                        setGrupoFilter('ALL');
                      }}
                      className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Restablecer filtros
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {filteredAprendices.slice(0, visibleCardLimit).map((aprendiz) => (
                        <LearnerCard
                          key={`${aprendiz.archivoOrigen || aprendiz.ficha || 'ficha'}-${aprendiz.numeroDocumento}`}
                          aprendiz={aprendiz}
                          onSelect={setSelectedAprendiz}
                        />
                      ))}
                    </div>

                    {filteredAprendices.length > visibleCardLimit && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setVisibleCardLimit((prev) => prev + 60)}
                          className="px-5 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                        >
                          Mostrar más aprendices (
                          {Math.min(60, filteredAprendices.length - visibleCardLimit)} de{' '}
                          {filteredAprendices.length - visibleCardLimit} restantes)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )
        )}

        {activeTab === 'matriz' && (
          <section>
            {validation.canShowResumen ? (
              <CompetencyMatrix
                competencias={validation.competencias}
                grupos={validation.grupos}
                aprendices={validation.aprendices}
              />
            ) : tarjetasValidation?.canShowResumen ? (
              <CompetencyMatrix
                competencias={tarjetasValidation.competencias}
                grupos={tarjetasValidation.grupos}
                aprendices={tarjetasValidation.aprendices}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  Matriz de competencias bloqueada hasta verificar la Ficha de Caracterización
                </p>
                <p className="text-xs text-slate-500">{validation.mensajeValidacion}</p>
              </div>
            )}
          </section>
        )}

      </main>

      <LearnerDetailModal aprendiz={selectedAprendiz} onClose={() => setSelectedAprendiz(null)} />
    </div>
  );
}
