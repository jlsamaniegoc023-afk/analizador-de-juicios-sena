import { useMemo, useState } from 'react';
import { CheckCircle2, X, AlertCircle, Clock } from 'lucide-react';
import type { AprendizResumen, JuicioEstado } from '../types/juicios';

interface LearnerDetailModalProps {
  aprendiz: AprendizResumen | null;
  onClose: () => void;
}

export function LearnerDetailModal({ aprendiz, onClose }: LearnerDetailModalProps) {
  const [estadoFilter, setEstadoFilter] = useState<'ALL' | JuicioEstado>('ALL');

  const filteredJuicios = useMemo(() => {
    if (!aprendiz) return [];
    if (estadoFilter === 'ALL') return aprendiz.juicios;
    return aprendiz.juicios.filter((j) => j.juicioEstado === estadoFilter);
  }, [aprendiz, estadoFilter]);

  if (!aprendiz) return null;

  const extraEntries = Object.entries(aprendiz.extraInfo);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="learner-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-full bg-white border-l border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="learner-modal-title"
              className="text-xl font-semibold text-slate-900 truncate"
            >
              {aprendiz.nombreCompleto}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-mono tabular-nums text-slate-700 font-medium">
                Columna B: {aprendiz.tipoDocumento ? `${aprendiz.tipoDocumento} ` : ''}
                {aprendiz.numeroDocumento}
              </span>
              <span aria-hidden="true">·</span>
              <span>{aprendiz.estadoAprendiz}</span>
              {aprendiz.grupo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{aprendiz.grupo}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle del aprendiz"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Availability verification summary */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">
                Verificación de Disponibilidad (Etapa Práctica)
              </div>
              <p className="text-sm text-slate-800">{aprendiz.razonDisponibilidad}</p>
            </div>
            {aprendiz.esDisponible ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg whitespace-nowrap shrink-0">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>Disponible</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg whitespace-nowrap shrink-0">
                <span>No disponible</span>
              </span>
            )}
          </div>

          {/* Judgment Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-200">
            <div>
              <div className="text-xs text-slate-500">Total Juicios</div>
              <div className="mt-0.5 text-xl font-semibold font-mono tabular-nums text-slate-900">
                {aprendiz.totalJuicios}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Aprobados</div>
              <div className="mt-0.5 text-xl font-semibold font-mono tabular-nums text-emerald-700">
                {aprendiz.aprobados}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">No Aprobados</div>
              <div className="mt-0.5 text-xl font-semibold font-mono tabular-nums text-red-600">
                {aprendiz.noAprobados}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Por Evaluar</div>
              <div className="mt-0.5 text-xl font-semibold font-mono tabular-nums text-amber-600">
                {aprendiz.porEvaluar}
              </div>
            </div>
          </div>

          {/* Structured available profile data */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Información disponible del aprendiz
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs border border-slate-200 rounded-xl p-4 bg-white">
              <div className="flex flex-col">
                <dt className="text-slate-400">Dirección</dt>
                <dd className="text-slate-800 font-medium break-words">
                  {aprendiz.perfil.direccion || 'No registrada'}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-slate-400">Teléfono</dt>
                <dd className="text-slate-800 font-medium font-mono tabular-nums">
                  {aprendiz.perfil.telefono || 'No registrado'}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-slate-400">Correo Electrónico</dt>
                <dd className="text-slate-800 font-medium break-all">
                  {aprendiz.perfil.correoElectronico || 'No registrado'}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-slate-400">Municipio</dt>
                <dd className="text-slate-800 font-medium">
                  {aprendiz.perfil.municipio || 'No registrado'}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-slate-400">Fecha Grabación</dt>
                <dd className="text-slate-800 font-medium font-mono tabular-nums">
                  {aprendiz.perfil.fechaGrabacion || 'No registrada'}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-slate-400">Especialidad (Programa de Formación)</dt>
                <dd className="text-slate-900 font-semibold break-words">
                  {aprendiz.perfil.especialidad || 'No especificada'}
                </dd>
              </div>
            </dl>

            {extraEntries.length > 0 && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs border border-slate-200 rounded-xl p-4 bg-white">
                {extraEntries.map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <dt className="text-slate-400">{key}</dt>
                    <dd className="text-slate-800 font-medium break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {/* Detailed Judgment Rows */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Detalle de Juicios Evaluativos
              </h3>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'ALL', label: `Todos (${aprendiz.totalJuicios})` },
                    { id: 'POR_EVALUAR', label: `Por Evaluar (${aprendiz.porEvaluar})` },
                    { id: 'NO_APROBADO', label: `No Aprobados (${aprendiz.noAprobados})` },
                    { id: 'APROBADO', label: `Aprobados (${aprendiz.aprobados})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEstadoFilter(tab.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      estadoFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
              {filteredJuicios.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No hay juicios con el filtro seleccionado.
                </div>
              ) : (
                filteredJuicios.map((j) => (
                  <div key={`${j.rowNumber}-${j.resultadoAprendizaje}`} className="p-4 bg-white space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-900">
                        {j.competencia || 'Competencia no especificada'}
                        {j.esEtapaPractica && (
                          <span className="ml-2 text-[11px] font-medium text-emerald-700">
                            · Competencia Etapa Práctica
                          </span>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap shrink-0 ${
                          j.juicioEstado === 'APROBADO'
                            ? 'text-emerald-700'
                            : j.juicioEstado === 'NO_APROBADO'
                              ? 'text-red-600'
                              : j.juicioEstado === 'POR_EVALUAR'
                                ? 'text-amber-600'
                                : 'text-slate-600'
                        }`}
                      >
                        {j.juicioEstado === 'APROBADO' && (
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {j.juicioEstado === 'NO_APROBADO' && (
                          <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {j.juicioEstado === 'POR_EVALUAR' && (
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{j.juicioRaw || j.juicioEstado}</span>
                      </span>
                    </div>

                    {j.resultadoAprendizaje && (
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {j.resultadoAprendizaje}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                      <span className="font-mono tabular-nums">Fila {j.rowNumber}</span>
                      {j.fechaJuicio && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Fecha: {j.fechaJuicio}</span>
                        </>
                      )}
                      {j.funcionario && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Evaluador: {j.funcionario}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
