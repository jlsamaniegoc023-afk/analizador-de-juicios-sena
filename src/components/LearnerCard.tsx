import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import type { AprendizResumen } from '../types/juicios';

interface LearnerCardProps {
  aprendiz: AprendizResumen;
  onSelect: (aprendiz: AprendizResumen) => void;
}

export function LearnerCard({ aprendiz, onSelect }: LearnerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const total = Math.max(aprendiz.totalJuicios, 1);
  const pctAprobados = (aprendiz.aprobados / total) * 100;
  const pctPorEvaluar = (aprendiz.porEvaluar / total) * 100;
  const pctNoAprobados = (aprendiz.noAprobados / total) * 100;

  const { perfil } = aprendiz;
  const programaLabel = aprendiz.programaFormacion || perfil.especialidad || '';

  return (
    <article className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors duration-150 hover:border-slate-300">
      <div className="space-y-3">
        {/* Top identity: title + clean unboxed metadata line */}
        <div>
          <h3 className="text-base font-semibold text-slate-900 leading-snug truncate">
            {aprendiz.nombreCompleto}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span className="font-mono tabular-nums text-slate-700 font-medium">
              {aprendiz.tipoDocumento ? `${aprendiz.tipoDocumento} ` : ''}
              {aprendiz.numeroDocumento}
            </span>
            <span aria-hidden="true">·</span>
            <span>{aprendiz.estadoAprendiz}</span>
            {aprendiz.ficha && !aprendiz.grupo.includes(aprendiz.ficha) && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Ficha {aprendiz.ficha}</span>
              </>
            )}
            {aprendiz.grupo && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[180px]" title={aprendiz.grupo}>
                  {aprendiz.grupo}
                </span>
              </>
            )}
          </div>
          {(programaLabel || aprendiz.modalidadFormacion) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              {programaLabel && (
                <span className="font-medium text-slate-700 leading-snug" title={programaLabel}>
                  {programaLabel}
                </span>
              )}
              {aprendiz.modalidadFormacion && (
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
                    aprendiz.modalidadFormacion.toUpperCase().includes('VIRTUAL')
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {aprendiz.modalidadFormacion}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Judgment counts (Aprobados, No Aprobados, Por Evaluar) */}
        {aprendiz.juiciosVerificados ? (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[11px] text-slate-500">Aprobados</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                  {aprendiz.aprobados}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">No Aprobados</div>
                <div
                  className={`text-lg font-semibold font-mono tabular-nums ${
                    aprendiz.noAprobados > 0 ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {aprendiz.noAprobados}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Por Evaluar</div>
                <div
                  className={`text-lg font-semibold font-mono tabular-nums ${
                    aprendiz.porEvaluar > 0 ? 'text-amber-600' : 'text-slate-900'
                  }`}
                >
                  {aprendiz.porEvaluar}
                </div>
              </div>
            </div>

            {/* Stacked proportional judgment bar */}
            <div
              className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex"
              aria-label={`Aprobados ${aprendiz.aprobados}, Por evaluar ${aprendiz.porEvaluar}, No aprobados ${aprendiz.noAprobados}`}
            >
              {pctAprobados > 0 && (
                <div className="bg-emerald-600 h-full" style={{ width: `${pctAprobados}%` }} />
              )}
              {pctPorEvaluar > 0 && (
                <div className="bg-amber-500 h-full" style={{ width: `${pctPorEvaluar}%` }} />
              )}
              {pctNoAprobados > 0 && (
                <div className="bg-red-600 h-full" style={{ width: `${pctNoAprobados}%` }} />
              )}
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
            Juicios de evaluación sin verificar (requiere Reporte de Juicios coincidente).
          </div>
        )}

        {/* Verification rationale */}
        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
          {aprendiz.razonDisponibilidad}
        </p>

        {/* Collapsible Details Tab ("Pestaña Desplegable") for Disponible & Learner Data */}
        {isExpanded && (
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900">
                Información del aprendiz
              </span>
              {aprendiz.juiciosVerificados && (
                <button
                  type="button"
                  onClick={() => onSelect(aprendiz)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:underline whitespace-nowrap cursor-pointer"
                >
                  <span>Ver juicios completos</span>
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <dl className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-400 shrink-0">Dirección</dt>
                <dd className="text-slate-800 text-right break-words">
                  {perfil.direccion || 'No registrada'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-400 shrink-0">Teléfono</dt>
                <dd className="text-slate-800 font-mono tabular-nums text-right">
                  {perfil.telefono || 'No registrado'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-400 shrink-0">Correo Electrónico</dt>
                <dd className="text-slate-800 text-right break-all">
                  {perfil.correoElectronico || 'No registrado'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-400 shrink-0">Municipio</dt>
                <dd className="text-slate-800 text-right">
                  {perfil.municipio || 'No registrado'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-400 shrink-0">Fecha Grabación</dt>
                <dd className="text-slate-800 font-mono tabular-nums text-right">
                  {perfil.fechaGrabacion || 'No registrada'}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 pt-1 border-t border-slate-100">
                <dt className="text-slate-400">Especialidad (Programa de Formación)</dt>
                <dd className="text-slate-900 font-medium leading-snug">
                  {perfil.especialidad || 'No especificada'}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {/* Action footer: Green Button ONLY when Disponible */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
        <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-mono tabular-nums">
          <span className="whitespace-nowrap">
            {aprendiz.juiciosVerificados ? `${aprendiz.totalJuicios} juicios` : 'Sin reporte'}
          </span>
          {(aprendiz.fechaInicioFicha || aprendiz.fechaFinFicha) && (
            <>
              <span aria-hidden="true">·</span>
              <span
                className="whitespace-nowrap"
                title="Fecha Inicio - Fecha Fin de la Ficha"
              >
                {aprendiz.fechaInicioFicha && aprendiz.fechaFinFicha
                  ? `${aprendiz.fechaInicioFicha} - ${aprendiz.fechaFinFicha}`
                  : aprendiz.fechaInicioFicha
                    ? `Inicio: ${aprendiz.fechaInicioFicha}`
                    : `Fin: ${aprendiz.fechaFinFicha}`}
              </span>
            </>
          )}
        </div>

        {aprendiz.esDisponible ? (
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Disponible</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{isExpanded ? 'Ocultar datos' : 'Datos'}</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onSelect(aprendiz)}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <span>Juicios</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
