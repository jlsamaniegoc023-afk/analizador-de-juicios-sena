import * as XLSX from 'xlsx';
import type {
  AprendicesRosterResult,
  SheetParseConfig,
  WorkbookAnalysis,
} from '../types/juicios';

interface RosterConfigInput {
  sheetName?: string;
  headerRowIndex?: number | null;
  documentoColIndex?: number | null;
}

interface ParserConfigPanelProps {
  analysis: WorkbookAnalysis | null;
  roster: AprendicesRosterResult | null;
  onApplyConfig: (config: SheetParseConfig) => void;
  onApplyRosterConfig: (config: RosterConfigInput) => void;
}

export function ParserConfigPanel({
  analysis,
  roster,
  onApplyConfig,
  onApplyRosterConfig,
}: ParserConfigPanelProps) {
  const colLetter = (idx: number) => (idx >= 0 ? XLSX.utils.encode_col(idx) : '—');

  const sampleAprendiz = roster?.aprendices[0];

  return (
    <div className="space-y-6">
      {/* Configuration for Excel de Aprendices Disponibles */}
      {roster && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Configuración: Excel de Aprendices ({roster.fileName})
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Verifica la hoja, la fila de encabezados y la columna de Número de Documento usada para cruzar Dirección, Teléfono, Correo, Municipio, Fecha Grabación y Especialidad.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Hoja de Aprendices</span>
              <select
                value={roster.sheetName}
                onChange={(e) =>
                  onApplyRosterConfig({
                    ...roster.configUsed,
                    sheetName: e.target.value,
                    headerRowIndex: null,
                  })
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
              >
                {roster.availableSheets.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5">
              <label
                htmlFor="roster-header-row-input"
                className="block text-xs font-medium text-slate-700"
              >
                Fila de Encabezados (actual: Fila {roster.headerRowNumber})
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="roster-header-row-input"
                  type="number"
                  min={1}
                  max={100}
                  value={(roster.configUsed.headerRowIndex ?? roster.headerRowNumber - 1) + 1}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!Number.isNaN(val) && val >= 1) {
                      onApplyRosterConfig({
                        ...roster.configUsed,
                        headerRowIndex: val - 1,
                      });
                    }
                  }}
                  className="w-24 px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                />
                <button
                  type="button"
                  onClick={() =>
                    onApplyRosterConfig({ ...roster.configUsed, headerRowIndex: null })
                  }
                  className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Auto
                </button>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">
                Columna Documento (para cruzar con Reporte)
              </span>
              <select
                value={roster.documentoColIndex}
                onChange={(e) =>
                  onApplyRosterConfig({
                    ...roster.configUsed,
                    documentoColIndex: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
              >
                {roster.headers.map((h, idx) => (
                  <option key={`${idx}-${h}`} value={idx}>
                    Col {XLSX.utils.encode_col(idx)} · {h}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h3 className="text-xs font-semibold text-slate-700">
              Vista previa de campos detectados ({roster.aprendices.length} aprendices en fila{' '}
              {roster.headerRowNumber})
            </h3>
            {sampleAprendiz ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                {[
                  { label: 'Documento', val: sampleAprendiz.numeroDocumento },
                  { label: 'Dirección', val: sampleAprendiz.perfil.direccion || 'No detectada' },
                  { label: 'Teléfono', val: sampleAprendiz.perfil.telefono || 'No detectado' },
                  {
                    label: 'Correo',
                    val: sampleAprendiz.perfil.correoElectronico || 'No detectado',
                  },
                  { label: 'Municipio', val: sampleAprendiz.perfil.municipio || 'No detectado' },
                  {
                    label: 'Fecha Grabación',
                    val: sampleAprendiz.perfil.fechaGrabacion || 'No detectada',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <div className="text-slate-500">{item.label}</div>
                    <div className="mt-0.5 font-medium text-slate-900 truncate" title={item.val}>
                      {item.val}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-700">
                No se leyeron aprendices con la configuración actual. Prueba cambiar la fila de encabezados o la columna de documento.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Configuration for Reporte de Juicios */}
      {analysis && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Configuración: Reporte de Juicios ({analysis.metadata.fileName})
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Ajusta la hoja, la fila de inicio de encabezados (por ejemplo Fila 16 / P o Fila 13 de SOFIA Plus) y la verificación de columnas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Hoja del Reporte</span>
              <select
                value={analysis.configUsed.sheetName}
                onChange={(e) =>
                  onApplyConfig({
                    ...analysis.configUsed,
                    sheetName: e.target.value,
                    headerRowIndex: null,
                  })
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
              >
                {analysis.availableSheets.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5">
              <label htmlFor="header-row-input" className="block text-xs font-medium text-slate-700">
                Fila de Encabezados (actual: Fila {analysis.metadata.headerRowNumber})
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="header-row-input"
                  type="number"
                  min={1}
                  max={100}
                  value={
                    (analysis.configUsed.headerRowIndex ?? analysis.metadata.headerRowNumber - 1) +
                    1
                  }
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!Number.isNaN(val) && val >= 1) {
                      onApplyConfig({
                        ...analysis.configUsed,
                        headerRowIndex: val - 1,
                      });
                    }
                  }}
                  className="w-24 px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                />
                <button
                  type="button"
                  onClick={() => onApplyConfig({ ...analysis.configUsed, headerRowIndex: 15 })}
                  className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Fila 16 (P)
                </button>
                <button
                  type="button"
                  onClick={() => onApplyConfig({ ...analysis.configUsed, headerRowIndex: null })}
                  className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Auto
                </button>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">
                Columna Documento (Por defecto Col B)
              </span>
              <select
                value={analysis.configUsed.documentoColIndex}
                onChange={(e) =>
                  onApplyConfig({
                    ...analysis.configUsed,
                    documentoColIndex: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
              >
                {analysis.headers.map((h, idx) => (
                  <option key={`${idx}-${h}`} value={idx}>
                    Col {XLSX.utils.encode_col(idx)} · {h}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Columna Grupo / Ficha</span>
              <select
                value={analysis.configUsed.grupoColIndex ?? -1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onApplyConfig({
                    ...analysis.configUsed,
                    grupoColIndex: v < 0 ? null : v,
                  });
                }}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
              >
                <option value={-1}>Detección automática (incluye Col P)</option>
                {analysis.headers.map((h, idx) => (
                  <option key={`${idx}-${h}`} value={idx}>
                    Col {XLSX.utils.encode_col(idx)} · {h}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h3 className="text-xs font-semibold text-slate-700">
              Columnas detectadas en la fila {analysis.metadata.headerRowNumber}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              {[
                { label: 'Tipo Doc', idx: analysis.columnMapping.tipoDocumento },
                { label: 'Núm. Documento', idx: analysis.columnMapping.numeroDocumento },
                { label: 'Nombre', idx: analysis.columnMapping.nombre },
                { label: 'Apellidos', idx: analysis.columnMapping.apellidos },
                { label: 'Estado', idx: analysis.columnMapping.estado },
                { label: 'Competencia', idx: analysis.columnMapping.competencia },
                { label: 'Resultado Apr.', idx: analysis.columnMapping.resultadoAprendizaje },
                { label: 'Juicio Eval.', idx: analysis.columnMapping.juicio },
                { label: 'Grupo / Ficha', idx: analysis.columnMapping.grupo },
                { label: 'Fecha Juicio', idx: analysis.columnMapping.fechaJuicio },
                { label: 'Evaluador', idx: analysis.columnMapping.funcionario },
              ].map((item) => (
                <div
                  key={item.label}
                  className="p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                >
                  <div className="text-slate-500">{item.label}</div>
                  <div className="mt-0.5 font-mono font-medium text-slate-900 truncate">
                    {item.idx >= 0 ? `Col ${colLetter(item.idx)}` : 'No detectada'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
