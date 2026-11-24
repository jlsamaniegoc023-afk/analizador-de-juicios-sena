import { useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  AprendizResumen,
  CompetenciaResumen,
  GrupoResumen,
  JuicioRow,
} from '../types/juicios';

interface CompetencyMatrixProps {
  competencias: CompetenciaResumen[];
  grupos: GrupoResumen[];
  aprendices: AprendizResumen[];
}

interface InstructorEvalSummary {
  nombre: string;
  aprobados: number;
  noAprobados: number;
}

interface CompetenciaConInstructores extends CompetenciaResumen {
  avancePct: number;
  instructores: InstructorEvalSummary[];
  detalleJuicios: Array<{
    aprendizNombre: string;
    aprendizDoc: string;
    resultadoAprendizaje: string;
    juicio: JuicioRow;
  }>;
}

function cleanInstructorName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '--' || trimmed.toUpperCase() === 'N/A') {
    return '';
  }
  return trimmed;
}

function matchesSelectedGrupo(apr: AprendizResumen, targetGrupo: string): boolean {
  if (apr.grupo === targetGrupo) return true;
  if (apr.ficha && !apr.grupo.includes(apr.ficha)) {
    if (`${apr.grupo} (Ficha ${apr.ficha})` === targetGrupo) return true;
  }
  return false;
}

function aggregateInstructors(juicios: JuicioRow[]): InstructorEvalSummary[] {
  const map = new Map<string, InstructorEvalSummary>();

  for (const j of juicios) {
    if (j.juicioEstado !== 'APROBADO' && j.juicioEstado !== 'NO_APROBADO') continue;
    const nombre = cleanInstructorName(j.funcionario) || 'Instructor sin registrar';
    const current = map.get(nombre) || { nombre, aprobados: 0, noAprobados: 0 };
    if (j.juicioEstado === 'APROBADO') current.aprobados++;
    else if (j.juicioEstado === 'NO_APROBADO') current.noAprobados++;
    map.set(nombre, current);
  }

  return Array.from(map.values()).sort(
    (a, b) => b.aprobados + b.noAprobados - (a.aprobados + a.noAprobados)
  );
}

interface CompetenciaPorAprendizItem {
  competencia: string;
  esEtapaPractica: boolean;
  porEvaluar: number;
  instructores: InstructorEvalSummary[];
}

function groupCompetenciasConInstructores(juicios: JuicioRow[]): CompetenciaPorAprendizItem[] {
  const map = new Map<
    string,
    {
      competencia: string;
      esEtapaPractica: boolean;
      porEvaluar: number;
      juicios: JuicioRow[];
    }
  >();

  for (const j of juicios) {
    const key = j.competencia || 'Sin competencia especificada';
    const current = map.get(key) || {
      competencia: key,
      esEtapaPractica: j.esEtapaPractica,
      porEvaluar: 0,
      juicios: [],
    };
    if (j.juicioEstado === 'POR_EVALUAR') current.porEvaluar++;
    current.juicios.push(j);
    map.set(key, current);
  }

  return Array.from(map.values())
    .map((item) => ({
      competencia: item.competencia,
      esEtapaPractica: item.esEtapaPractica,
      porEvaluar: item.porEvaluar,
      instructores: aggregateInstructors(item.juicios),
    }))
    .sort((a, b) => {
      if (a.esEtapaPractica !== b.esEtapaPractica) return a.esEtapaPractica ? 1 : -1;
      return a.competencia.localeCompare(b.competencia, 'es', { numeric: true });
    });
}

export function CompetencyMatrix({
  competencias,
  grupos,
  aprendices,
}: CompetencyMatrixProps) {
  const [selectedGrupoKey, setSelectedGrupoKey] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<'competencias' | 'aprendices'>('competencias');
  const [expandedCompetencia, setExpandedCompetencia] = useState<string | null>(null);
  const [expandedAprendizDoc, setExpandedAprendizDoc] = useState<string | null>(null);
  const [aprendizSearch, setAprendizSearch] = useState('');
  const [aprendizFilter, setAprendizFilter] = useState<
    'todos' | 'disponibles' | 'no_aprobados' | 'por_evaluar'
  >('todos');
  const [estadoAprendizFilter, setEstadoAprendizFilter] = useState<string>('ALL');
  const aprendicesSectionRef = useRef<HTMLDivElement | null>(null);

  const selectedGrupo = useMemo(
    () => (selectedGrupoKey ? grupos.find((g) => g.grupo === selectedGrupoKey) ?? null : null),
    [grupos, selectedGrupoKey]
  );

  const selectedAprendices = useMemo(() => {
    if (!selectedGrupo) return [];
    return aprendices.filter((apr) => matchesSelectedGrupo(apr, selectedGrupo.grupo));
  }, [aprendices, selectedGrupo]);

  const selectedCompetencias = useMemo<CompetenciaConInstructores[]>(() => {
    if (!selectedGrupo) return [];

    const compMap = new Map<
      string,
      {
        competencia: string;
        esEtapaPractica: boolean;
        totalJuicios: number;
        aprobados: number;
        noAprobados: number;
        porEvaluar: number;
        juicios: JuicioRow[];
        detalleJuicios: CompetenciaConInstructores['detalleJuicios'];
      }
    >();

    for (const apr of selectedAprendices) {
      for (const jr of apr.juicios) {
        const key = jr.competencia || 'Sin competencia especificada';
        const current = compMap.get(key) || {
          competencia: key,
          esEtapaPractica: jr.esEtapaPractica,
          totalJuicios: 0,
          aprobados: 0,
          noAprobados: 0,
          porEvaluar: 0,
          juicios: [],
          detalleJuicios: [],
        };
        current.totalJuicios++;
        if (jr.juicioEstado === 'APROBADO') current.aprobados++;
        else if (jr.juicioEstado === 'NO_APROBADO') current.noAprobados++;
        else if (jr.juicioEstado === 'POR_EVALUAR') current.porEvaluar++;
        current.juicios.push(jr);
        current.detalleJuicios.push({
          aprendizNombre: apr.nombreCompleto,
          aprendizDoc: apr.numeroDocumento,
          resultadoAprendizaje: jr.resultadoAprendizaje,
          juicio: jr,
        });
        compMap.set(key, current);
      }
    }

    return Array.from(compMap.values())
      .map((item) => ({
        competencia: item.competencia,
        esEtapaPractica: item.esEtapaPractica,
        totalJuicios: item.totalJuicios,
        aprobados: item.aprobados,
        noAprobados: item.noAprobados,
        porEvaluar: item.porEvaluar,
        avancePct: Math.round((item.aprobados / Math.max(item.totalJuicios, 1)) * 100),
        instructores: aggregateInstructors(item.juicios),
        detalleJuicios: item.detalleJuicios,
      }))
      .sort((a, b) => {
        if (a.esEtapaPractica !== b.esEtapaPractica) return a.esEtapaPractica ? 1 : -1;
        return b.porEvaluar + b.noAprobados - (a.porEvaluar + a.noAprobados);
      });
  }, [selectedGrupo, selectedAprendices]);

  const estadoCounts = useMemo(() => {
    if (!selectedGrupo) return [];
    const map = new Map<string, number>();
    for (const apr of selectedAprendices) {
      const estado = (apr.estadoAprendiz || 'Sin estado').trim() || 'Sin estado';
      map.set(estado, (map.get(estado) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([estado, count]) => ({ estado, count }))
      .sort((a, b) => b.count - a.count || a.estado.localeCompare(b.estado, 'es'));
  }, [selectedGrupo, selectedAprendices]);

  const filteredSelectedAprendices = useMemo(() => {
    const q = aprendizSearch.trim().toLowerCase();
    return selectedAprendices.filter((apr) => {
      if (aprendizFilter === 'disponibles' && !apr.esDisponible) return false;
      if (aprendizFilter === 'no_aprobados' && apr.noAprobados === 0) return false;
      if (aprendizFilter === 'por_evaluar' && apr.porEvaluar === 0) return false;
      if (
        estadoAprendizFilter !== 'ALL' &&
        ((apr.estadoAprendiz || 'Sin estado').trim() || 'Sin estado') !== estadoAprendizFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        apr.nombreCompleto.toLowerCase().includes(q) ||
        apr.numeroDocumento.toLowerCase().includes(q)
      );
    });
  }, [selectedAprendices, aprendizSearch, aprendizFilter, estadoAprendizFilter]);

  const handleSelectFicha = (grupoKey: string) => {
    setSelectedGrupoKey((prev) => (prev === grupoKey ? null : grupoKey));
    setExpandedCompetencia(null);
    setExpandedAprendizDoc(null);
    setAprendizSearch('');
    setAprendizFilter('todos');
    setEstadoAprendizFilter('ALL');
  };

  const handleSelectEstado = (estado: string) => {
    const isAlreadyActive = detailMode === 'aprendices' && estadoAprendizFilter === estado;
    setEstadoAprendizFilter(isAlreadyActive ? 'ALL' : estado);
    setDetailMode('aprendices');
    setExpandedAprendizDoc(null);
    requestAnimationFrame(() => {
      aprendicesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const consolidatedDates = useMemo(() => {
    const inicios = Array.from(
      new Set(grupos.map((g) => g.fechaInicio).filter(Boolean))
    ) as string[];
    const fines = Array.from(
      new Set(grupos.map((g) => g.fechaFin).filter(Boolean))
    ) as string[];
    const reportes = Array.from(
      new Set(grupos.map((g) => g.fechaReporte).filter(Boolean))
    ) as string[];

    return {
      fechaInicio:
        inicios.length === 1
          ? inicios[0]
          : inicios.length > 1
            ? 'Según ficha seleccionada'
            : 'No registrada',
      fechaFin:
        fines.length === 1
          ? fines[0]
          : fines.length > 1
            ? 'Según ficha seleccionada'
            : 'No registrada',
      fechaReporte:
        reportes.length === 1
          ? reportes[0]
          : reportes.length > 1
            ? reportes.join(', ')
            : 'No registrada',
    };
  }, [grupos]);

  const activeFechaInicio = selectedGrupo
    ? selectedGrupo.fechaInicio || 'No registrada'
    : consolidatedDates.fechaInicio;
  const activeFechaFin = selectedGrupo
    ? selectedGrupo.fechaFin || 'No registrada'
    : consolidatedDates.fechaFin;
  const activeFechaReporte = selectedGrupo
    ? selectedGrupo.fechaReporte || 'No registrada'
    : consolidatedDates.fechaReporte;

  return (
    <div className="space-y-8">
      {/* Group / Ficha Breakdown */}
      {grupos.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Recuento por Grupo / Ficha
              </h2>
              <p className="text-xs text-slate-500">
                Consolidado de aprendices disponibles y juicios de evaluación agrupados según el reporte. Haz clic en el número de Ficha para ver su avance por competencias y por aprendiz.
              </p>
            </div>
            {selectedGrupo && (
              <button
                type="button"
                onClick={() => setSelectedGrupoKey(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>Ver todas las fichas</span>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-auto max-h-[460px]">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="text-xs font-medium text-slate-600">
                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-3 px-4 whitespace-nowrap">
                    Grupo / Ficha
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-3 px-4 whitespace-nowrap">
                    Denominación
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-3 px-4 whitespace-nowrap">
                    Modalidad de Formación
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-3 px-4 text-right whitespace-nowrap">
                    Aprendices
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-3 px-4 text-right whitespace-nowrap">
                    Disponibles
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-3 px-4 text-right whitespace-nowrap">
                    Aprobados
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-3 px-4 text-right whitespace-nowrap">
                    No Aprobados
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-3 px-4 text-right whitespace-nowrap">
                    Por Evaluar
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 py-3 px-4 text-right whitespace-nowrap">
                    Total Juicios
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {grupos.map((g, idx) => {
                  const rowBorder = idx < grupos.length - 1 ? 'border-b border-slate-100' : '';
                  const isSelected = selectedGrupo?.grupo === g.grupo;
                  const rowBg = isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50/80';

                  return (
                    <tr key={g.grupo} className={`${rowBg} transition-colors`}>
                      <td className={`py-2.5 px-4 font-medium whitespace-nowrap ${rowBorder}`}>
                        <button
                          type="button"
                          onClick={() => handleSelectFicha(g.grupo)}
                          aria-pressed={isSelected}
                          title={
                            isSelected
                              ? `Quitar filtro de la Ficha ${g.grupo}`
                              : `Ver detalle por competencias y aprendices de la Ficha ${g.grupo}`
                          }
                          className={
                            isSelected
                              ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold tabular-nums bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer'
                              : 'inline-flex items-center gap-1 font-mono font-semibold tabular-nums text-emerald-700 hover:text-emerald-900 underline decoration-emerald-600/40 underline-offset-4 hover:decoration-emerald-700 transition-colors cursor-pointer'
                          }
                        >
                          {g.grupo}
                        </button>
                      </td>
                      <td
                        className={`py-2.5 px-4 text-xs text-slate-700 max-w-[260px] truncate ${rowBorder}`}
                        title={g.denominacion || 'No registrada'}
                      >
                        {g.denominacion || 'No registrada'}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap ${rowBorder}`}
                      >
                        {g.modalidadFormacion || 'No registrada'}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 ${rowBorder}`}>
                        {g.totalAprendices}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 ${rowBorder}`}>
                        {g.disponibles}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 ${rowBorder}`}>
                        {g.aprobados}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono tabular-nums ${rowBorder} ${
                          g.noAprobados > 0 ? 'text-red-600 font-semibold' : 'text-slate-700'
                        }`}
                      >
                        {g.noAprobados}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono tabular-nums ${rowBorder} ${
                          g.porEvaluar > 0 ? 'text-amber-600 font-semibold' : 'text-slate-700'
                        }`}
                      >
                        {g.porEvaluar}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 font-medium ${rowBorder}`}>
                        {g.totalJuicios}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Competency / Learner Breakdown */}
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">
              {selectedGrupo
                ? `Recuento por Competencia de la Ficha · ${selectedGrupo.grupo}`
                : 'Recuento por Competencia de la Ficha'}
            </h2>
            {selectedGrupo ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                {selectedGrupo.denominacion && (
                  <span className="font-medium text-slate-800">{selectedGrupo.denominacion}</span>
                )}
                {selectedGrupo.modalidadFormacion && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{selectedGrupo.modalidadFormacion}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {selectedAprendices.length} aprendiz(ces) ({selectedGrupo.disponibles} disponibles)
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Distribución de juicios Aprobados, No Aprobados y Por Evaluar en cada competencia del reporte. Haz clic en cualquier número de Ficha arriba para filtrarla por competencias o por aprendiz e inspeccionar el instructor evaluador.
              </p>
            )}
          </div>

          {selectedGrupo && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setDetailMode('competencias')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    detailMode === 'competencias'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Por Competencias ({selectedCompetencias.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailMode('aprendices')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    detailMode === 'aprendices'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Por Aprendiz ({selectedAprendices.length})</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Additional Date Information: Fecha Inicio, Fecha Fin, Fecha del Reporte (SOFIA Plus) */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="text-slate-500">Fecha Inicio:</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {activeFechaInicio}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="text-slate-500">Fecha Fin:</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {activeFechaFin}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
            <span className="text-slate-500">Fecha del Reporte:</span>
            <span className="font-mono tabular-nums font-semibold text-emerald-700">
              {activeFechaReporte}
            </span>
            <span className="text-[11px] text-slate-400">(descarga SOFIA Plus)</span>
          </div>
        </div>

        {/* Apprentice Status Breakdown (Estado) for selected Ficha */}
        {selectedGrupo && estadoCounts.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-800">
                Estado de los aprendices ({selectedAprendices.length})
              </div>
              {estadoAprendizFilter !== 'ALL' && detailMode === 'aprendices' && (
                <button
                  type="button"
                  onClick={() => setEstadoAprendizFilter('ALL')}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2 cursor-pointer"
                >
                  Mostrar todos los estados
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {estadoCounts.map((item) => {
                const isActive =
                  detailMode === 'aprendices' && estadoAprendizFilter === item.estado;
                return (
                  <button
                    key={item.estado}
                    type="button"
                    onClick={() => handleSelectEstado(item.estado)}
                    aria-pressed={isActive}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-emerald-700 border-emerald-700 text-white font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 font-medium'
                    }`}
                  >
                    <span>{item.estado}</span>
                    <span
                      className={`font-mono tabular-nums px-1.5 py-0.5 rounded text-[11px] ${
                        isActive
                          ? 'bg-emerald-800 text-white'
                          : 'bg-white text-slate-900 border border-slate-200'
                      }`}
                    >
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Ficha: View by Competencies */}
        {selectedGrupo && detailMode === 'competencias' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            {selectedCompetencias.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No se encontraron competencias con juicios registrados para la Ficha {selectedGrupo.grupo}.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                    <th className="py-3 px-4">Competencia</th>
                    <th className="py-3 px-4">Instructor que evaluó (Aprobado / No Aprobado)</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Aprobados</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">No Aprobados</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Por Evaluar</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Total</th>
                    <th className="py-3 px-4 w-44">Avance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {selectedCompetencias.map((comp) => {
                    const total = Math.max(comp.totalJuicios, 1);
                    const pctA = (comp.aprobados / total) * 100;
                    const pctP = (comp.porEvaluar / total) * 100;
                    const pctN = (comp.noAprobados / total) * 100;
                    const isExpanded = expandedCompetencia === comp.competencia;

                    return (
                      <CompetencySelectedRow
                        key={comp.competencia}
                        comp={comp}
                        pctA={pctA}
                        pctP={pctP}
                        pctN={pctN}
                        isExpanded={isExpanded}
                        onToggle={() =>
                          setExpandedCompetencia((prev) =>
                            prev === comp.competencia ? null : comp.competencia
                          )
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Selected Ficha: View by Apprentice */}
        {selectedGrupo && detailMode === 'aprendices' && (
          <div ref={aprendicesSectionRef} className="space-y-4 scroll-mt-20">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={aprendizSearch}
                    onChange={(e) => setAprendizSearch(e.target.value)}
                    placeholder="Buscar aprendiz de esta ficha por nombre o documento..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900"
                  />
                </div>

                {estadoCounts.length > 0 && (
                  <select
                    aria-label="Filtrar por estado del aprendiz"
                    value={estadoAprendizFilter}
                    onChange={(e) => setEstadoAprendizFilter(e.target.value)}
                    className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-900"
                  >
                    <option value="ALL">
                      Todos los estados ({selectedAprendices.length})
                    </option>
                    {estadoCounts.map((item) => (
                      <option key={item.estado} value={item.estado}>
                        {item.estado} ({item.count})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto shrink-0">
                {(
                  [
                    { id: 'todos', label: `Todos (${selectedAprendices.length})` },
                    {
                      id: 'disponibles',
                      label: `Disponibles (${selectedAprendices.filter((a) => a.esDisponible).length})`,
                    },
                    {
                      id: 'no_aprobados',
                      label: `No Aprobados (${selectedAprendices.filter((a) => a.noAprobados > 0).length})`,
                    },
                    {
                      id: 'por_evaluar',
                      label: `Por Evaluar (${selectedAprendices.filter((a) => a.porEvaluar > 0).length})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAprendizFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      aprendizFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredSelectedAprendices.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                No hay aprendices que coincidan con el filtro en la Ficha {selectedGrupo.grupo}.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                      <th className="py-3 px-4">Aprendiz</th>
                      <th className="py-3 px-4">Instructores que evaluaron (Aprobado / No Aprobado)</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Aprobados</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">No Aprobados</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Por Evaluar</th>
                      <th className="py-3 px-4 w-44">Avance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredSelectedAprendices.map((apr) => {
                      const rowKey = `${apr.numeroDocumento}-${apr.grupo}`;
                      const isExpanded = expandedAprendizDoc === rowKey;
                      const competenciasConInstructores = groupCompetenciasConInstructores(apr.juicios);
                      const total = Math.max(apr.totalJuicios, 1);
                      const pctA = (apr.aprobados / total) * 100;
                      const pctP = (apr.porEvaluar / total) * 100;
                      const pctN = (apr.noAprobados / total) * 100;
                      const avancePct = Math.round((apr.aprobados / total) * 100);

                      return (
                        <AprendizSelectedRow
                          key={rowKey}
                          apr={apr}
                          competenciasConInstructores={competenciasConInstructores}
                          pctA={pctA}
                          pctP={pctP}
                          pctN={pctN}
                          avancePct={avancePct}
                          isExpanded={isExpanded}
                          onToggle={() =>
                            setExpandedAprendizDoc((prev) => (prev === rowKey ? null : rowKey))
                          }
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Default Consolidated Competencies View (when no Ficha is selected) */}
        {!selectedGrupo && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                  <th className="py-3 px-4">Competencia</th>
                  <th className="py-3 px-4 text-right">Aprobados</th>
                  <th className="py-3 px-4 text-right">No Aprobados</th>
                  <th className="py-3 px-4 text-right">Por Evaluar</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 w-44">Progreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {competencias.map((comp) => {
                  const total = Math.max(comp.totalJuicios, 1);
                  const pctA = (comp.aprobados / total) * 100;
                  const pctP = (comp.porEvaluar / total) * 100;
                  const pctN = (comp.noAprobados / total) * 100;

                  return (
                    <tr key={comp.competencia} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-slate-900 max-w-xl">
                        <div className="font-medium leading-snug">{comp.competencia}</div>
                        {comp.esEtapaPractica && (
                          <div className="mt-0.5 text-xs text-emerald-700 font-medium">
                            Competencia clave de verificación para Disponibilidad
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {comp.aprobados}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          comp.noAprobados > 0 ? 'text-red-600 font-semibold' : 'text-slate-700'
                        }`}
                      >
                        {comp.noAprobados}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          comp.porEvaluar > 0 ? 'text-amber-600 font-semibold' : 'text-slate-700'
                        }`}
                      >
                        {comp.porEvaluar}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 font-medium">
                        {comp.totalJuicios}
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                          {pctA > 0 && <div className="bg-emerald-600 h-full" style={{ width: `${pctA}%` }} />}
                          {pctP > 0 && <div className="bg-amber-500 h-full" style={{ width: `${pctP}%` }} />}
                          {pctN > 0 && <div className="bg-red-600 h-full" style={{ width: `${pctN}%` }} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function InstructorBadges({ instructores }: { instructores: InstructorEvalSummary[] }) {
  if (instructores.length === 0) {
    return (
      <span className="text-xs text-slate-400">
        Sin evaluaciones registradas (Por evaluar)
      </span>
    );
  }

  return (
    <div className="space-y-1">
      {instructores.map((inst) => (
        <div key={inst.nombre} className="text-xs leading-snug flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-slate-800">{inst.nombre}</span>
          <span className="font-mono tabular-nums text-[11px]">
            {inst.aprobados > 0 && (
              <span className="text-emerald-700 font-semibold">
                {inst.aprobados} Aprob.
              </span>
            )}
            {inst.aprobados > 0 && inst.noAprobados > 0 && (
              <span className="text-slate-300 mx-1">·</span>
            )}
            {inst.noAprobados > 0 && (
              <span className="text-red-600 font-semibold">
                {inst.noAprobados} No Aprob.
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function CompetencySelectedRow({
  comp,
  pctA,
  pctP,
  pctN,
  isExpanded,
  onToggle,
}: {
  comp: CompetenciaConInstructores;
  pctA: number;
  pctP: number;
  pctN: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-slate-50/80 transition-colors align-top">
        <td className="py-3 px-4 text-slate-900 max-w-md">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            className="flex items-start gap-2 text-left group cursor-pointer"
          >
            <span className="mt-0.5 text-slate-400 group-hover:text-slate-700 shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              )}
            </span>
            <div>
              <div className="font-medium leading-snug group-hover:text-emerald-800 transition-colors">
                {comp.competencia}
              </div>
              {comp.esEtapaPractica && (
                <div className="mt-0.5 text-xs text-emerald-700 font-medium">
                  Competencia clave de verificación para Disponibilidad
                </div>
              )}
              <div className="mt-0.5 text-[11px] text-slate-400">
                {isExpanded ? 'Ocultar detalle por aprendiz' : 'Ver detalle por aprendiz e instructor'}
              </div>
            </div>
          </button>
        </td>
        <td className="py-3 px-4 max-w-sm">
          <InstructorBadges instructores={comp.instructores} />
        </td>
        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
          {comp.aprobados}
        </td>
        <td
          className={`py-3 px-4 text-right font-mono tabular-nums ${
            comp.noAprobados > 0 ? 'text-red-600 font-semibold' : 'text-slate-700'
          }`}
        >
          {comp.noAprobados}
        </td>
        <td
          className={`py-3 px-4 text-right font-mono tabular-nums ${
            comp.porEvaluar > 0 ? 'text-amber-600 font-semibold' : 'text-slate-700'
          }`}
        >
          {comp.porEvaluar}
        </td>
        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 font-medium">
          {comp.totalJuicios}
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden flex">
              {pctA > 0 && <div className="bg-emerald-600 h-full" style={{ width: `${pctA}%` }} />}
              {pctP > 0 && <div className="bg-amber-500 h-full" style={{ width: `${pctP}%` }} />}
              {pctN > 0 && <div className="bg-red-600 h-full" style={{ width: `${pctN}%` }} />}
            </div>
            <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 w-9 text-right">
              {comp.avancePct}%
            </span>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-50/70">
          <td colSpan={7} className="px-4 py-3 border-t border-slate-100">
            <div className="border border-slate-200 rounded-lg bg-white overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="text-slate-500 font-medium">
                    <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3">
                      Aprendiz
                    </th>
                    <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3">
                      Resultado de Aprendizaje
                    </th>
                    <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3 whitespace-nowrap">
                      Juicio
                    </th>
                    <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3">
                      Instructor que evaluó
                    </th>
                    <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3 whitespace-nowrap">
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comp.detalleJuicios.map((item, idx) => {
                    const instName = cleanInstructorName(item.juicio.funcionario);
                    return (
                      <tr key={`${item.aprendizDoc}-${item.juicio.rowNumber}-${idx}`}>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{item.aprendizNombre}</div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500">
                            {item.aprendizDoc}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-slate-700 max-w-md">
                          {item.resultadoAprendizaje || '—'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <JuicioLabel estado={item.juicio.juicioEstado} raw={item.juicio.juicioRaw} />
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {item.juicio.juicioEstado === 'POR_EVALUAR'
                            ? 'Pendiente por evaluar'
                            : instName || 'Instructor sin registrar'}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {item.juicio.fechaJuicio || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AprendizSelectedRow({
  apr,
  competenciasConInstructores,
  pctA,
  pctP,
  pctN,
  avancePct,
  isExpanded,
  onToggle,
}: {
  apr: AprendizResumen;
  competenciasConInstructores: CompetenciaPorAprendizItem[];
  pctA: number;
  pctP: number;
  pctN: number;
  avancePct: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const orderedJuicios = [...apr.juicios].sort((a, b) => {
    if (a.esEtapaPractica !== b.esEtapaPractica) return a.esEtapaPractica ? 1 : -1;
    return a.competencia.localeCompare(b.competencia, 'es', { numeric: true });
  });

  return (
    <>
      <tr className="hover:bg-slate-50/80 transition-colors align-top">
        <td className="py-3 px-4">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            className="flex items-start gap-2 text-left group cursor-pointer"
          >
            <span className="mt-0.5 text-slate-400 group-hover:text-slate-700 shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              )}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900 group-hover:text-emerald-800 transition-colors">
                  {apr.nombreCompleto}
                </span>
                {apr.esDisponible && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-white bg-emerald-600 rounded">
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                    <span>Disponible</span>
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-2">
                <span className="font-mono tabular-nums">
                  {apr.tipoDocumento ? `${apr.tipoDocumento} ` : ''}
                  {apr.numeroDocumento}
                </span>
                <span aria-hidden="true">·</span>
                <span>{apr.estadoAprendiz}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {isExpanded ? 'Ocultar competencias y juicios' : 'Ver competencias y evaluadores'}
              </div>
            </div>
          </button>
        </td>
        <td className="py-3 px-4 max-w-md">
          {competenciasConInstructores.length === 0 ? (
            <span className="text-xs text-slate-400">
              Sin competencias registradas
            </span>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-2">
              {competenciasConInstructores.map((item) => (
                <div key={item.competencia} className="text-xs leading-snug">
                  <div className="font-semibold text-slate-800">{item.competencia}</div>
                  <div className="mt-1 pl-2.5 border-l-2 border-slate-200 space-y-0.5">
                    {item.instructores.length > 0 ? (
                      item.instructores.map((inst) => (
                        <div
                          key={inst.nombre}
                          className="text-[11px] flex flex-wrap items-center gap-x-2 gap-y-0.5"
                        >
                          <span className="text-slate-700">{inst.nombre}</span>
                          <span className="font-mono tabular-nums">
                            {inst.aprobados > 0 && (
                              <span className="text-emerald-700 font-semibold">
                                {inst.aprobados} Aprob.
                              </span>
                            )}
                            {inst.aprobados > 0 && inst.noAprobados > 0 && (
                              <span className="text-slate-300 mx-1">·</span>
                            )}
                            {inst.noAprobados > 0 && (
                              <span className="text-red-600 font-semibold">
                                {inst.noAprobados} No Aprob.
                              </span>
                            )}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[11px] text-amber-600 font-medium">
                        Sin instructor evaluador ({item.porEvaluar} Por evaluar)
                      </div>
                    )}
                    {item.instructores.length > 0 && item.porEvaluar > 0 && (
                      <div className="text-[11px] text-amber-600 font-mono tabular-nums">
                        {item.porEvaluar} Por evaluar
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </td>
        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
          {apr.aprobados}
        </td>
        <td
          className={`py-3 px-4 text-right font-mono tabular-nums ${
            apr.noAprobados > 0 ? 'text-red-600 font-semibold' : 'text-slate-700'
          }`}
        >
          {apr.noAprobados}
        </td>
        <td
          className={`py-3 px-4 text-right font-mono tabular-nums ${
            apr.porEvaluar > 0 ? 'text-amber-600 font-semibold' : 'text-slate-700'
          }`}
        >
          {apr.porEvaluar}
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden flex">
              {pctA > 0 && <div className="bg-emerald-600 h-full" style={{ width: `${pctA}%` }} />}
              {pctP > 0 && <div className="bg-amber-500 h-full" style={{ width: `${pctP}%` }} />}
              {pctN > 0 && <div className="bg-red-600 h-full" style={{ width: `${pctN}%` }} />}
            </div>
            <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 w-9 text-right">
              {avancePct}%
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400 font-mono tabular-nums text-right">
            {apr.aprobados}/{apr.totalJuicios} juicios
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-50/70">
          <td colSpan={6} className="px-4 py-3 border-t border-slate-100">
            {orderedJuicios.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">
                {apr.razonDisponibilidad || 'Sin juicios de evaluación registrados.'}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg bg-white overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs border-separate border-spacing-0">
                  <thead>
                    <tr className="text-slate-500 font-medium">
                      <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3">
                        Competencia
                      </th>
                      <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3">
                        Resultado de Aprendizaje
                      </th>
                      <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3 whitespace-nowrap">
                        Juicio
                      </th>
                      <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3">
                        Instructor que evaluó
                      </th>
                      <th className="sticky top-0 bg-slate-50 border-b border-slate-200 py-2 px-3 whitespace-nowrap">
                        Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orderedJuicios.map((j, idx) => {
                      const instName = cleanInstructorName(j.funcionario);
                      return (
                        <tr key={`${j.rowNumber}-${idx}`}>
                          <td className="py-2 px-3 font-medium text-slate-800 max-w-xs">
                            {j.competencia || '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-600 max-w-sm">
                            {j.resultadoAprendizaje || '—'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <JuicioLabel estado={j.juicioEstado} raw={j.juicioRaw} />
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {j.juicioEstado === 'POR_EVALUAR'
                              ? 'Pendiente por evaluar'
                              : instName || 'Instructor sin registrar'}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                            {j.fechaJuicio || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function JuicioLabel({ estado, raw }: { estado: JuicioRow['juicioEstado']; raw: string }) {
  if (estado === 'APROBADO') {
    return (
      <span className="text-xs font-semibold text-emerald-700">
        {raw || 'APROBADO'}
      </span>
    );
  }
  if (estado === 'NO_APROBADO') {
    return (
      <span className="text-xs font-semibold text-red-600">
        {raw || 'NO APROBADO'}
      </span>
    );
  }
  if (estado === 'POR_EVALUAR') {
    return (
      <span className="text-xs font-semibold text-amber-600">
        {raw || 'POR EVALUAR'}
      </span>
    );
  }
  return <span className="text-xs font-medium text-slate-600">{raw || 'OTRO'}</span>;
}
