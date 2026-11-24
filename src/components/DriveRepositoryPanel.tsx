import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import type { AprendicesRosterResult, WorkbookAnalysis } from '../types/juicios';
import type { DriveFileItem } from '../utils/googleDrive';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface AnalyzedDriveEntry {
  file: DriveFileItem;
  buffer?: ArrayBuffer;
  kind: 'PENDING' | 'JUICIOS' | 'ROSTER' | 'ERROR';
  juicios?: WorkbookAnalysis;
  roster?: AprendicesRosterResult;
  errorMessage?: string;
}

interface DriveRepositoryPanelProps {
  folderUrl: string;
  onChangeFolderUrl: (url: string) => void;
  requiresPrivateAuth: boolean;
  isSyncing: boolean;
  syncStatusText: string | null;
  batchProgress: { current: number; total: number } | null;
  driveError: string | null;
  entries: AnalyzedDriveEntry[];
  selectedDriveKey: string;
  onSync: () => void;
  onSelectFileView: (fileKey: string) => void;
}

export function DriveRepositoryPanel({
  folderUrl,
  onChangeFolderUrl,
  requiresPrivateAuth,
  isSyncing,
  syncStatusText,
  batchProgress,
  driveError,
  entries,
  selectedDriveKey,
  onSync,
  onSelectFileView,
}: DriveRepositoryPanelProps) {
  const analyzedJuicios = entries.filter((e) => e.kind === 'JUICIOS' && e.juicios);
  const totalAprendicesRepo = analyzedJuicios.reduce(
    (sum, e) => sum + (e.juicios?.totalesFicha.totalAprendices || 0),
    0
  );
  const totalDisponiblesRepo = analyzedJuicios.reduce(
    (sum, e) => sum + (e.juicios?.totalesFicha.totalDisponibles || 0),
    0
  );
  const totalAprobadosRepo = analyzedJuicios.reduce(
    (sum, e) => sum + (e.juicios?.totalesFicha.aprobados || 0),
    0
  );
  const totalNoAprobadosRepo = analyzedJuicios.reduce(
    (sum, e) => sum + (e.juicios?.totalesFicha.noAprobados || 0),
    0
  );
  const totalPorEvaluarRepo = analyzedJuicios.reduce(
    (sum, e) => sum + (e.juicios?.totalesFicha.porEvaluar || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Folder URL & Direct Sync Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <label className="flex-1 block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">
              Enlace de la carpeta de Google Drive
            </span>
            <div className="relative">
              <FolderOpen
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="url"
                value={folderUrl}
                onChange={(e) => onChangeFolderUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
              />
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <span>Abrir carpeta</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            </a>

            {requiresPrivateAuth ? (
              <GoogleSignInButton
                onClick={onSync}
                disabled={isSyncing}
                label={isSyncing ? 'Sincronizando...' : 'Sincronizar con Google'}
              />
            ) : (
              <button
                type="button"
                onClick={onSync}
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

        {/* Live progress bar */}
        {isSyncing && (
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-800 truncate">
                {syncStatusText || 'Leyendo archivos de Google Drive...'}
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
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{driveError}</span>
          </div>
        )}
      </section>

      {/* Consolidated Batch Summary */}
      {analyzedJuicios.length > 0 && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">
              Reportes Analizados (Drive)
            </div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {analyzedJuicios.length}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total Aprendices</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {totalAprendicesRepo}
              </span>
              <span className="text-xs font-semibold text-emerald-700 font-mono tabular-nums">
                {totalDisponiblesRepo} disponibles
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total Aprobados</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700">
              {totalAprobadosRepo}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total No Aprobados</div>
            <div
              className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                totalNoAprobadosRepo > 0 ? 'text-red-600' : 'text-slate-900'
              }`}
            >
              {totalNoAprobadosRepo}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total Por Evaluar</div>
            <div
              className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                totalPorEvaluarRepo > 0 ? 'text-amber-600' : 'text-slate-900'
              }`}
            >
              {totalPorEvaluarRepo}
            </div>
          </div>
        </section>
      )}

      {/* Drive Files Table */}
      {entries.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Archivos Excel leídos de la carpeta ({entries.length})
              </h3>
              <p className="text-xs text-slate-500">
                Cada reporte se procesa automáticamente al sincronizar y muestra su Ficha, Fecha del Reporte y juicios evaluativos.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                  <th className="py-3 px-4">Archivo Excel</th>
                  <th className="py-3 px-4">Tipo / Ficha</th>
                  <th className="py-3 px-4">Fecha del Reporte</th>
                  <th className="py-3 px-4 text-right">Aprendices</th>
                  <th className="py-3 px-4 text-right">Disponibles</th>
                  <th className="py-3 px-4 text-right">Aprobados</th>
                  <th className="py-3 px-4 text-right">No Aprob.</th>
                  <th className="py-3 px-4 text-right">Por Evaluar</th>
                  <th className="py-3 px-4 text-right">Vista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {entries.map((entry) => {
                  const jTotals = entry.juicios?.totalesFicha;
                  const fichaLabel =
                    entry.juicios?.metadata.ficha || entry.roster?.fichaDetectada || '';
                  const isSelected = selectedDriveKey === entry.file.name;

                  return (
                    <tr key={entry.file.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet
                            className="w-4 h-4 text-slate-400 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="font-medium text-slate-900 truncate" title={entry.file.name}>
                            {entry.file.name}
                          </span>
                        </div>
                        {(entry.file.modifiedTime || entry.file.modifiedLabel) && (
                          <div className="mt-0.5 pl-6 text-[11px] text-slate-400 font-mono tabular-nums">
                            Modificado:{' '}
                            {entry.file.modifiedTime
                              ? new Date(entry.file.modifiedTime).toLocaleDateString('es-CO')
                              : entry.file.modifiedLabel}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {entry.kind === 'PENDING' && (
                          <span className="text-slate-400">En cola de lectura...</span>
                        )}
                        {entry.kind === 'ERROR' && (
                          <span className="text-red-600 font-medium" title={entry.errorMessage}>
                            Error: {entry.errorMessage}
                          </span>
                        )}
                        {entry.kind === 'JUICIOS' && (
                          <div>
                            <span className="font-semibold text-slate-900">
                              Reporte de Juicios
                            </span>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {fichaLabel ? `Ficha ${fichaLabel}` : 'Sin número de ficha'}
                            </div>
                          </div>
                        )}
                        {entry.kind === 'ROSTER' && (
                          <div>
                            <span className="font-semibold text-slate-900">
                              Excel Aprendices
                            </span>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {fichaLabel ? `Ficha ${fichaLabel}` : 'Datos generales'}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {entry.kind === 'JUICIOS'
                          ? entry.juicios?.metadata.fechaReporte || 'No registrada'
                          : entry.kind === 'ROSTER'
                            ? entry.roster?.fechaGrabacion || '—'
                            : '—'}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {entry.kind === 'JUICIOS' && jTotals
                          ? jTotals.totalAprendices
                          : entry.kind === 'ROSTER' && entry.roster
                            ? entry.roster.aprendices.length
                            : '—'}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {entry.kind === 'JUICIOS' && jTotals ? jTotals.totalDisponibles : '—'}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {entry.kind === 'JUICIOS' && jTotals ? jTotals.aprobados : '—'}
                      </td>

                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          jTotals && jTotals.noAprobados > 0
                            ? 'text-red-600 font-semibold'
                            : 'text-slate-700'
                        }`}
                      >
                        {entry.kind === 'JUICIOS' && jTotals ? jTotals.noAprobados : '—'}
                      </td>

                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          jTotals && jTotals.porEvaluar > 0
                            ? 'text-amber-600 font-semibold'
                            : 'text-slate-700'
                        }`}
                      >
                        {entry.kind === 'JUICIOS' && jTotals ? jTotals.porEvaluar : '—'}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {entry.kind === 'JUICIOS' ? (
                          <button
                            type="button"
                            onClick={() => onSelectFileView(entry.file.name)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            {isSelected && (
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>{isSelected ? 'Mostrando' : 'Ver Ficha'}</span>
                          </button>
                        ) : entry.kind === 'ROSTER' ? (
                          <span className="text-[11px] font-medium text-emerald-700">
                            Vinculado por Doc.
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
