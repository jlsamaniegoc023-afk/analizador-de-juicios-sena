import * as XLSX from 'xlsx';
import type {
  AprendicesRosterResult,
  AprendizBaseRecord,
  AprendizPerfil,
  AprendizResumen,
  ColumnMapping,
  CompetenciaResumen,
  FichaMatchState,
  FichaMetadata,
  FichaValidationResult,
  GrupoResumen,
  JuicioEstado,
  JuicioRow,
  SheetParseConfig,
  WorkbookAnalysis,
} from '../types/juicios';

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toLocaleDateString('es-CO', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

export function normalizeDocumentId(value: unknown): string {
  const str = cleanCellValue(value);
  return str
    .replace(/^(CC|TI|CE|PEP|PPT|RC|NIT)\s*[:.-]?\s*/i, '')
    .replace(/[\s.,-]/g, '');
}

export function canonicalDocKey(doc: string): string {
  const clean = normalizeDocumentId(doc).toUpperCase();
  const noLeadingZeros = clean.replace(/^0+/, '');
  return noLeadingZeros || clean;
}

const DOC_HEADER_PATTERNS = [
  /NUM.*DOC/,
  /NRO.*DOC/,
  /NO\.?\s*DE?\s*DOC/,
  /N[°º]\.?\s*DE?\s*DOC/,
  /DOC.*IDENT/,
  /DOC.*APRENDIZ/,
  /^DOCUMENTO$/,
  /^DOC$/,
  /IDENTIFICACION/,
  /CEDULA/,
  /^C\.?\s*C\.?$/,
  /^ID$/,
];

export function extractFichaCode(raw: string): string {
  const cleaned = cleanCellValue(raw);
  if (!cleaned) return '';
  // Look for standard SENA Ficha numeric code (4 to 10 digits)
  const digitMatch = cleaned.match(/\b\d{4,10}\b/);
  if (digitMatch) return digitMatch[0];
  return cleaned;
}

export function normalizeFichaId(raw: string): string {
  const code = extractFichaCode(raw);
  return normalizeText(code).replace(/[^A-Z0-9]/g, '');
}

export function classifyJuicio(raw: string): JuicioEstado {
  const norm = normalizeText(raw);
  if (!norm) return 'OTRO';
  if (norm.includes('NO APROBADO') || norm.includes('NO_APROBADO') || norm === 'D') {
    return 'NO_APROBADO';
  }
  if (norm.includes('POR EVALUAR') || norm.includes('PENDIENTE') || norm === 'P') {
    return 'POR_EVALUAR';
  }
  if (norm.includes('APROBADO') || norm === 'A') {
    return 'APROBADO';
  }
  return 'OTRO';
}

export function isEtapaPracticaCompetencia(competencia: string): boolean {
  const norm = normalizeText(competencia)
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!norm) return false;
  return (
    norm.includes('RESULTADOS DE APRENDIZAJE ETAPA PRACTICA') ||
    norm.includes('RESULTADO DE APRENDIZAJE ETAPA PRACTICA') ||
    (norm.includes('RESULTADOS DE APRENDIZAJE') && norm.includes('ETAPA PRACTICA'))
  );
}

function detectHeaderRow(rows: unknown[][]): number {
  let bestIndex = -1;
  let bestScore = 0;

  const maxScan = Math.min(rows.length, 45);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const normalizedCells = row.map((c) => normalizeText(c));
    let score = 0;

    for (const cell of normalizedCells) {
      if (!cell) continue;
      if (DOC_HEADER_PATTERNS.some((p) => p.test(cell)) || cell.includes('DOCUMENTO')) score += 3;
      if (cell.includes('COMPETENCIA')) score += 3;
      if (cell.includes('JUICIO')) score += 3;
      if (cell.includes('RESULTADO') && cell.includes('APRENDIZAJE')) score += 2;
      if (cell === 'NOMBRE' || cell.includes('NOMBRES') || cell.includes('APRENDIZ')) score += 2;
      if (cell.includes('APELLIDO')) score += 2;
      if (cell.includes('DIRECCION') || cell.includes('RESIDENCIA')) score += 2;
      if (cell.includes('TELEFONO') || cell.includes('CELULAR') || cell === 'TEL') score += 2;
      if (cell.includes('CORREO') || cell.includes('EMAIL') || cell.includes('E-MAIL')) score += 2;
      if (cell.includes('MUNICIPIO') || cell.includes('CIUDAD')) score += 2;
      if (cell.includes('GRABACION') || cell.includes('ESPECIALIDAD') || cell.includes('PROGRAMA')) score += 2;
      if (cell === 'ESTADO' || cell.includes('ESTADO')) score += 1;
      if (cell.includes('GRUPO') || cell.includes('FICHA')) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestScore >= 3 && bestIndex >= 0) {
    return bestIndex;
  }

  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const nonEmpty = row.filter((c) => cleanCellValue(c).length > 0).length;
    if (nonEmpty >= 4) return i;
  }

  return 0;
}

function detectColumnMapping(
  headers: string[],
  overrideDocCol: number | null,
  overrideGrupoCol: number | null,
  useSofiaFallbacks = true
): ColumnMapping {
  const normHeaders = headers.map((h) => normalizeText(h));

  const findCol = (patterns: RegExp[], fallback = -1): number => {
    for (const pat of patterns) {
      const idx = normHeaders.findIndex((h) => pat.test(h));
      if (idx !== -1) return idx;
    }
    return fallback;
  };

  const detectedDoc = findCol(DOC_HEADER_PATTERNS, -1);
  const numeroDocumento =
    overrideDocCol !== null && overrideDocCol >= 0
      ? overrideDocCol
      : detectedDoc >= 0
        ? detectedDoc
        : 1;

  const detectedGrupo = findCol([/^GRUPO$/, /FICHA/, /COHORTE/, /JORNADA/], -1);
  const colPIndex =
    useSofiaFallbacks && headers.length > 15 && cleanCellValue(headers[15]).length > 0 ? 15 : -1;
  const grupo =
    overrideGrupoCol !== null
      ? overrideGrupoCol
      : detectedGrupo !== -1
        ? detectedGrupo
        : colPIndex;

  return {
    tipoDocumento: findCol([/TIPO.*DOC/, /^TD$/, /TIPO IDENT/], useSofiaFallbacks ? 0 : -1),
    numeroDocumento,
    nombre: findCol(
      [/^NOMBRE$/, /^NOMBRES$/, /NOMBRE.*APRENDIZ/, /NOMBRE COMPLETO/, /^APRENDIZ$/],
      useSofiaFallbacks ? 2 : -1
    ),
    apellidos: findCol([/^APELLIDO/, /APELLIDOS/], useSofiaFallbacks ? 3 : -1),
    estado: findCol(
      [/^ESTADO$/, /ESTADO.*APRENDIZ/, /ESTADO.*FORMACION/],
      useSofiaFallbacks ? 4 : -1
    ),
    competencia: findCol([/COMPETENCIA/, /NORMA/], useSofiaFallbacks ? 5 : -1),
    resultadoAprendizaje: findCol(
      [/RESULTADO.*APRENDIZAJE/, /^RAP$/, /RESULTADO/],
      useSofiaFallbacks ? 6 : -1
    ),
    juicio: findCol(
      [/JUICIO.*EVALUACION/, /^JUICIO$/, /EVALUACION/, /CONCEPTO/],
      useSofiaFallbacks ? 7 : -1
    ),
    grupo,
    fechaJuicio: findCol([/FECHA.*JUICIO/, /FECHA.*EVAL/], -1),
    funcionario: findCol([/FUNCIONARIO/, /INSTRUCTOR/, /EVALUADOR/], -1),
  };
}

function extractTopMetadata(
  rows: unknown[][],
  headerRowIndex: number,
  fileName: string,
  sheetName: string
): FichaMetadata {
  let ficha = '';
  let programa = '';
  let denominacion = '';
  let modalidadFormacion = '';
  let estadoFicha = '';
  let fechaInicio = '';
  let fechaFin = '';
  let fechaReporte = '';
  let fechaGrabacion = '';
  let regional = '';
  let centro = '';
  let grupoGeneral = '';
  const extraMetadata: Array<{ label: string; value: string }> = [];

  let fechaReporteExact = false;
  const scanLimit = Math.min(Math.max(headerRowIndex, 15), rows.length);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = cleanCellValue(row[c]);
      if (!cell) continue;
      const norm = normalizeText(cell);

      const nextValue = (() => {
        for (let nc = c + 1; nc < Math.min(row.length, c + 6); nc++) {
          const v = cleanCellValue(row[nc]);
          if (v) return v;
        }
        return '';
      })();

      if (
        norm.includes('FICHA DE CARACTERIZACION') ||
        norm.startsWith('FICHA:') ||
        norm === 'FICHA' ||
        norm.includes('NUMERO DE FICHA') ||
        norm.includes('CODIGO FICHA')
      ) {
        const inlineVal = cell.includes(':') ? cell.split(':').slice(1).join(':').trim() : '';
        const rawVal = inlineVal || nextValue;
        const code = extractFichaCode(rawVal);
        if (code && !ficha) ficha = code;
      } else if (
        norm.includes('PROGRAMA') ||
        norm.includes('DENOMINACION') ||
        norm.includes('ESPECIALIDAD')
      ) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) {
          if (!programa) programa = val;
          if (norm.includes('DENOMINACION') && !denominacion) denominacion = val;
        }
      } else if (norm.includes('MODALIDAD') && !modalidadFormacion && r < headerRowIndex) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) modalidadFormacion = val;
      } else if (norm.includes('ESTADO') && !estadoFicha && r < headerRowIndex) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) estadoFicha = val;
      } else if (norm.includes('GRABACION') && !fechaGrabacion && r < headerRowIndex) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) fechaGrabacion = val;
      } else if (
        (norm.includes('FECHA INICIO') || norm.includes('FECHA DE INICIO')) &&
        !fechaInicio &&
        r < headerRowIndex
      ) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) fechaInicio = val;
      } else if (
        (norm.includes('FECHA FIN') ||
          norm.includes('FECHA DE FIN') ||
          norm.includes('FECHA TERMINACION')) &&
        !fechaFin &&
        r < headerRowIndex
      ) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) fechaFin = val;
      } else if (
        (norm.includes('FECHA DEL REPORTE') ||
          norm.includes('FECHA REPORTE') ||
          norm.includes('FECHA DE REPORTE') ||
          norm.includes('FECHA GENERACION')) &&
        !fechaReporteExact &&
        r < headerRowIndex
      ) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) {
          fechaReporte = val;
          fechaReporteExact = true;
        }
      } else if (norm.includes('FECHA') && !fechaReporte && r < headerRowIndex) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) fechaReporte = val;
      } else if (norm.includes('REGIONAL') && !regional) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) regional = val;
      } else if (norm.includes('CENTRO') && !centro) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) centro = val;
      } else if (norm.includes('GRUPO') && !grupoGeneral && r < headerRowIndex) {
        const val = cell.includes(':')
          ? cell.split(':').slice(1).join(':').trim() || nextValue
          : nextValue;
        if (val) grupoGeneral = val;
      } else if (cell.includes(':') && nextValue === '' && r < headerRowIndex) {
        const [k, ...rest] = cell.split(':');
        const v = rest.join(':').trim();
        if (k && v && extraMetadata.length < 6) {
          extraMetadata.push({ label: k.trim(), value: v });
        }
      }
    }
  }

  return {
    fileName,
    sheetName,
    headerRowNumber: headerRowIndex + 1,
    ficha,
    programa,
    denominacion: denominacion || programa,
    modalidadFormacion,
    estadoFicha,
    fechaInicio,
    fechaFin,
    fechaReporte,
    fechaGrabacion,
    regional,
    centro,
    grupoGeneral,
    extraMetadata,
  };
}

function findProfileField(
  records: Array<Record<string, string>>,
  patterns: RegExp[]
): string {
  for (const pat of patterns) {
    for (const record of records) {
      for (const [key, val] of Object.entries(record)) {
        if (!val) continue;
        if (pat.test(normalizeText(key))) {
          return val;
        }
      }
    }
  }
  return '';
}

function buildAprendizPerfil(
  records: Array<Record<string, string>>,
  fallbackPrograma: string,
  fallbackFechaGrabacion: string
): AprendizPerfil {
  return {
    direccion: findProfileField(records, [
      /DIRECCION/,
      /\bDIR\.?\b/,
      /RESIDENCIA/,
      /DOMICILIO/,
    ]),
    telefono: findProfileField(records, [
      /TELEFONO/,
      /CELULAR/,
      /MOVIL/,
      /\bTEL\b/,
      /NUMERO.*CONTACTO/,
      /CONTACTO/,
    ]),
    correoElectronico: findProfileField(records, [/CORREO/, /E.?MAIL/, /MAIL/]),
    municipio: findProfileField(records, [
      /MUNICIPIO/,
      /CIUDAD/,
      /LOCALIDAD/,
      /UBICACION/,
    ]),
    fechaGrabacion:
      findProfileField(records, [
        /FECHA.*GRAB/,
        /F\.?\s*GRAB/,
        /GRABACION/,
        /FECHA.*REGISTRO/,
        /FECHA.*MATRICULA/,
        /FECHA.*INGRESO/,
      ]) || fallbackFechaGrabacion,
    especialidad:
      findProfileField(records, [
        /ESPECIALIDAD/,
        /PROGRAMA.*FORMACION/,
        /DENOMINACION.*PROGRAMA/,
        /^PROGRAMA$/,
        /PROGRAMA/,
        /TITULACION/,
      ]) || fallbackPrograma,
  };
}

function chooseBestSheet(workbook: XLSX.WorkBook): string {
  if (workbook.SheetNames.length === 1) return workbook.SheetNames[0];

  let bestName = workbook.SheetNames[0];
  let bestScore = -1;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    let score = 0;
    const normName = normalizeText(name);
    if (normName.includes('JUICIO')) score += 10;
    if (normName.includes('REPORTE')) score += 5;

    const maxScan = Math.min(rows.length, 30);
    for (let i = 0; i < maxScan; i++) {
      const text = (rows[i] || []).map((c) => normalizeText(c)).join(' ');
      if (text.includes('JUICIO')) score += 4;
      if (text.includes('COMPETENCIA')) score += 4;
      if (text.includes('DOCUMENTO')) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }

  return bestName;
}

function chooseBestRosterSheet(workbook: XLSX.WorkBook): string {
  if (workbook.SheetNames.length === 1) return workbook.SheetNames[0];

  let bestName = workbook.SheetNames[0];
  let bestScore = -1;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    let score = 0;
    const normName = normalizeText(name);
    if (normName.includes('APRENDIZ') || normName.includes('DISPONIBLE')) score += 8;
    if (normName.includes('JUICIO')) score -= 4;

    const maxScan = Math.min(rows.length, 30);
    for (let i = 0; i < maxScan; i++) {
      const text = (rows[i] || []).map((c) => normalizeText(c)).join(' ');
      if (text.includes('DIRECCION')) score += 4;
      if (text.includes('TELEFONO') || text.includes('CELULAR')) score += 4;
      if (text.includes('CORREO') || text.includes('EMAIL')) score += 4;
      if (text.includes('MUNICIPIO')) score += 4;
      if (text.includes('DOCUMENTO')) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }

  return bestName;
}

function extractSecondaryRoster(
  workbook: XLSX.WorkBook,
  primarySheetName: string
): {
  byDoc: Map<string, Record<string, string>>;
  programa: string;
  fechaGrabacion: string;
} {
  const byDoc = new Map<string, Record<string, string>>();
  let programa = '';
  let fechaGrabacion = '';
  if (workbook.SheetNames.length <= 1) return { byDoc, programa, fechaGrabacion };

  for (const name of workbook.SheetNames) {
    if (name === primarySheetName) continue;
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const headerIdx = detectHeaderRow(rows);
    const meta = extractTopMetadata(rows, headerIdx, '', name);
    if (!programa && meta.programa) programa = meta.programa;
    if (!fechaGrabacion && (meta.fechaGrabacion || meta.fechaReporte)) {
      fechaGrabacion = meta.fechaGrabacion || meta.fechaReporte;
    }

    const rawHeaders = rows[headerIdx] || [];
    const maxCols = Math.max(
      rawHeaders.length,
      ...rows.slice(headerIdx, headerIdx + 15).map((r) => (r ? r.length : 0))
    );
    const headers: string[] = [];
    for (let c = 0; c < maxCols; c++) {
      headers.push(cleanCellValue(rawHeaders[c]) || `Columna ${XLSX.utils.encode_col(c)}`);
    }

    const normHeaders = headers.map((h) => normalizeText(h));
    const docIdx = normHeaders.findIndex((h) => DOC_HEADER_PATTERNS.some((p) => p.test(h)));
    const effectiveDocIdx = docIdx !== -1 ? docIdx : 1;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const docRaw = normalizeDocumentId(row[effectiveDocIdx]);
      if (!docRaw) continue;
      const key = canonicalDocKey(docRaw);

      const info: Record<string, string> = byDoc.get(key) || {};
      headers.forEach((header, idx) => {
        if (idx === effectiveDocIdx) return;
        const val = cleanCellValue(row[idx]);
        if (val) {
          info[header] = val;
        }
      });
      byDoc.set(key, info);
    }
  }

  return { byDoc, programa, fechaGrabacion };
}

function computeAprendizFromJuicios(
  doc: string,
  jRows: JuicioRow[],
  baseRecord?: AprendizBaseRecord,
  extraRosterInfo?: Record<string, string>,
  fallbackPrograma = '',
  fallbackFechaGrabacion = ''
): AprendizResumen {
  const first = jRows[0];
  const tipoDocumento =
    baseRecord?.tipoDocumento || jRows.find((r) => r.tipoDocumento)?.tipoDocumento || '';
  const nombre = baseRecord?.nombre || jRows.find((r) => r.nombre)?.nombre || '';
  const apellidos = baseRecord?.apellidos || jRows.find((r) => r.apellidos)?.apellidos || '';
  const estadoAprendiz =
    baseRecord?.estadoAprendiz ||
    jRows.find((r) => r.estadoAprendiz)?.estadoAprendiz ||
    'Sin estado';
  const grupo =
    baseRecord?.grupo ||
    jRows.find((r) => r.grupo && r.grupo !== 'Sin grupo asignado')?.grupo ||
    first?.grupo ||
    'Sin grupo asignado';

  const extraInfo: Record<string, string> = {
    ...(baseRecord?.extraInfo || {}),
    ...(extraRosterInfo || {}),
  };
  for (const jr of jRows) {
    for (const [k, v] of Object.entries(jr.extraFields)) {
      if (v && !extraInfo[k]) {
        extraInfo[k] = v;
      }
    }
  }

  const derivedPerfil = buildAprendizPerfil(
    [extraInfo],
    fallbackPrograma,
    fallbackFechaGrabacion
  );
  const perfil: AprendizPerfil = {
    direccion: baseRecord?.perfil.direccion || derivedPerfil.direccion,
    telefono: baseRecord?.perfil.telefono || derivedPerfil.telefono,
    correoElectronico: baseRecord?.perfil.correoElectronico || derivedPerfil.correoElectronico,
    municipio: baseRecord?.perfil.municipio || derivedPerfil.municipio,
    fechaGrabacion: baseRecord?.perfil.fechaGrabacion || derivedPerfil.fechaGrabacion,
    especialidad: baseRecord?.perfil.especialidad || derivedPerfil.especialidad,
  };

  let aprobados = 0;
  let noAprobados = 0;
  let porEvaluar = 0;
  let otros = 0;
  let etapaPracticaTotal = 0;
  let etapaPracticaPorEvaluar = 0;
  let etapaPracticaAprobados = 0;
  let lectivaPorEvaluar = 0;

  for (const jr of jRows) {
    if (jr.esEtapaPractica) etapaPracticaTotal++;

    if (jr.juicioEstado === 'APROBADO') {
      aprobados++;
      if (jr.esEtapaPractica) etapaPracticaAprobados++;
    } else if (jr.juicioEstado === 'NO_APROBADO') {
      noAprobados++;
    } else if (jr.juicioEstado === 'POR_EVALUAR') {
      porEvaluar++;
      if (jr.esEtapaPractica) {
        etapaPracticaPorEvaluar++;
      } else {
        lectivaPorEvaluar++;
      }
    } else {
      otros++;
    }
  }

  const encontradoEnJuicios = jRows.length > 0;
  const esDisponible =
    encontradoEnJuicios &&
    porEvaluar > 0 &&
    noAprobados === 0 &&
    etapaPracticaPorEvaluar === porEvaluar &&
    lectivaPorEvaluar === 0;

  let razonDisponibilidad = '';
  if (!encontradoEnJuicios) {
    razonDisponibilidad =
      'Documento (Columna B) no encontrado en el Reporte de Juicios de la Ficha.';
  } else if (esDisponible) {
    razonDisponibilidad =
      'Únicamente está Por Evaluar el juicio de RESULTADOS DE APRENDIZAJE ETAPA PRACTICA.';
  } else if (noAprobados > 0 && lectivaPorEvaluar > 0) {
    razonDisponibilidad = `Tiene ${noAprobados} juicio(s) No Aprobado(s) y ${lectivaPorEvaluar} lectivo(s) Por Evaluar.`;
  } else if (noAprobados > 0) {
    razonDisponibilidad = `Tiene ${noAprobados} juicio(s) No Aprobado(s) pendiente(s) de plan de mejoramiento.`;
  } else if (lectivaPorEvaluar > 0) {
    razonDisponibilidad = `Tiene ${lectivaPorEvaluar} juicio(s) Por Evaluar fuera de Etapa Práctica.`;
  } else if (porEvaluar === 0 && etapaPracticaAprobados > 0) {
    razonDisponibilidad =
      'Etapa Práctica ya cuenta con juicio Aprobado (todos los juicios evaluados).';
  } else if (porEvaluar === 0) {
    razonDisponibilidad = 'No registra juicios Por Evaluar en Etapa Práctica.';
  } else {
    razonDisponibilidad = 'No cumple con la condición única de Etapa Práctica Por Evaluar.';
  }

  const nombreCompleto =
    baseRecord?.nombreCompleto ||
    [nombre, apellidos].filter(Boolean).join(' ') ||
    `Aprendiz ${doc}`;

  return {
    numeroDocumento: doc,
    tipoDocumento,
    nombre,
    apellidos,
    nombreCompleto,
    estadoAprendiz,
    grupo,
    perfil,
    extraInfo,
    totalJuicios: jRows.length,
    aprobados,
    noAprobados,
    porEvaluar,
    otros,
    etapaPracticaTotal,
    etapaPracticaPorEvaluar,
    etapaPracticaAprobados,
    lectivaPorEvaluar,
    juiciosVerificados: true,
    encontradoEnJuicios,
    esDisponible,
    razonDisponibilidad,
    juicios: jRows,
  };
}

export function parseAprendicesRosterBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  partialConfig?: {
    sheetName?: string;
    headerRowIndex?: number | null;
    documentoColIndex?: number | null;
  }
): AprendicesRosterResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const availableSheets = workbook.SheetNames;
  if (availableSheets.length === 0) {
    throw new Error('El archivo Excel de aprendices no contiene hojas.');
  }

  const sheetName =
    partialConfig?.sheetName && availableSheets.includes(partialConfig.sheetName)
      ? partialConfig.sheetName
      : chooseBestRosterSheet(workbook);
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (rows.length === 0) {
    throw new Error(`La hoja "${sheetName}" está vacía.`);
  }

  const detectedHeaderRow = detectHeaderRow(rows);
  const headerRowIndex =
    partialConfig?.headerRowIndex !== undefined && partialConfig?.headerRowIndex !== null
      ? Math.max(0, Math.min(partialConfig.headerRowIndex, rows.length - 1))
      : detectedHeaderRow;

  const rawHeaders = rows[headerRowIndex] || [];
  const maxCols = Math.max(
    rawHeaders.length,
    ...rows.slice(headerRowIndex, headerRowIndex + 15).map((r) => (r ? r.length : 0))
  );
  const headers: string[] = [];
  for (let c = 0; c < maxCols; c++) {
    headers.push(cleanCellValue(rawHeaders[c]) || `Columna ${XLSX.utils.encode_col(c)}`);
  }

  const overrideDocCol =
    partialConfig?.documentoColIndex !== undefined ? partialConfig.documentoColIndex : null;
  const mapping = detectColumnMapping(headers, overrideDocCol, null, false);
  const topMeta = extractTopMetadata(rows, headerRowIndex, fileName, sheetName);

  const normHeaders = headers.map((h) => normalizeText(h));
  const fichaColIdx = normHeaders.findIndex((h) => /^FICHA/.test(h) || h.includes('CARACTERIZACION'));

  const standardIndices = new Set<number>([
    mapping.tipoDocumento,
    mapping.numeroDocumento,
    mapping.nombre,
    mapping.apellidos,
    mapping.estado,
    mapping.grupo,
    fichaColIdx,
  ]);

  const byDoc = new Map<string, AprendizBaseRecord>();
  let firstRowFicha = '';

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const doc = normalizeDocumentId(row[mapping.numeroDocumento]);
    if (!doc) continue;
    if (normalizeText(doc).includes('DOCUMENTO')) continue;

    const nombre = mapping.nombre >= 0 ? cleanCellValue(row[mapping.nombre]) : '';
    const apellidos = mapping.apellidos >= 0 ? cleanCellValue(row[mapping.apellidos]) : '';
    const fichaCell = fichaColIdx >= 0 ? extractFichaCode(cleanCellValue(row[fichaColIdx])) : '';
    if (fichaCell && !firstRowFicha) firstRowFicha = fichaCell;

    const extraInfo: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (standardIndices.has(c)) continue;
      const val = cleanCellValue(row[c]);
      if (val) extraInfo[headers[c]] = val;
    }

    const key = canonicalDocKey(doc);
    if (!byDoc.has(key)) {
      const perfil = buildAprendizPerfil(
        [extraInfo],
        topMeta.programa,
        topMeta.fechaGrabacion || topMeta.fechaReporte
      );
      byDoc.set(key, {
        numeroDocumento: doc,
        tipoDocumento: mapping.tipoDocumento >= 0 ? cleanCellValue(row[mapping.tipoDocumento]) : '',
        nombre,
        apellidos,
        nombreCompleto: [nombre, apellidos].filter(Boolean).join(' ') || `Aprendiz ${doc}`,
        estadoAprendiz:
          mapping.estado >= 0 ? cleanCellValue(row[mapping.estado]) || 'Sin estado' : 'Sin estado',
        grupo: mapping.grupo >= 0 ? cleanCellValue(row[mapping.grupo]) : topMeta.grupoGeneral,
        ficha: fichaCell || topMeta.ficha,
        perfil,
        extraInfo,
      });
    }
  }

  const warnings: string[] = [];
  if (byDoc.size === 0) {
    warnings.push(
      'No se encontraron aprendices con Número de Documento válido en el archivo de aprendices.'
    );
  }

  return {
    fileName,
    sheetName,
    headerRowNumber: headerRowIndex + 1,
    fichaDetectada: topMeta.ficha || firstRowFicha,
    programa: topMeta.programa,
    fechaGrabacion: topMeta.fechaGrabacion || topMeta.fechaReporte,
    aprendices: Array.from(byDoc.values()),
    availableSheets,
    headers,
    documentoColIndex: mapping.numeroDocumento,
    configUsed: {
      sheetName,
      headerRowIndex: partialConfig?.headerRowIndex ?? null,
      documentoColIndex: overrideDocCol,
    },
    warnings,
  };
}

export function analyzeExcelBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  partialConfig?: Partial<SheetParseConfig>
): WorkbookAnalysis {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const availableSheets = workbook.SheetNames;

  if (availableSheets.length === 0) {
    throw new Error('El archivo Excel no contiene hojas de cálculo.');
  }

  const sheetName =
    partialConfig?.sheetName && availableSheets.includes(partialConfig.sheetName)
      ? partialConfig.sheetName
      : chooseBestSheet(workbook);

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  if (rows.length === 0) {
    throw new Error(`La hoja "${sheetName}" está vacía.`);
  }

  const detectedHeaderRow = detectHeaderRow(rows);
  const headerRowIndex =
    partialConfig?.headerRowIndex !== undefined && partialConfig?.headerRowIndex !== null
      ? Math.max(0, Math.min(partialConfig.headerRowIndex, rows.length - 1))
      : detectedHeaderRow;

  const rawHeaders = rows[headerRowIndex] || [];
  const maxCols = Math.max(
    rawHeaders.length,
    ...rows.slice(headerRowIndex, headerRowIndex + 10).map((r) => (r ? r.length : 0))
  );
  const headers: string[] = [];
  for (let c = 0; c < maxCols; c++) {
    headers.push(cleanCellValue(rawHeaders[c]) || `Columna ${XLSX.utils.encode_col(c)}`);
  }

  const documentoColIndex =
    partialConfig?.documentoColIndex !== undefined ? partialConfig.documentoColIndex : 1;
  const grupoColIndex =
    partialConfig?.grupoColIndex !== undefined ? partialConfig.grupoColIndex : null;

  const mapping = detectColumnMapping(headers, documentoColIndex, grupoColIndex);
  const metadata = extractTopMetadata(rows, headerRowIndex, fileName, sheetName);
  const secondaryRoster = extractSecondaryRoster(workbook, sheetName);

  // Also check if a Ficha column exists in table headers when metadata.ficha wasn't in top rows
  if (!metadata.ficha) {
    const normHeaders = headers.map((h) => normalizeText(h));
    const fichaColIdx = normHeaders.findIndex(
      (h) => /^FICHA$/.test(h) || h.includes('FICHA DE CARACTERIZACION')
    );
    if (fichaColIdx >= 0) {
      for (let r = headerRowIndex + 1; r < Math.min(rows.length, headerRowIndex + 15); r++) {
        const val = extractFichaCode(cleanCellValue((rows[r] || [])[fichaColIdx]));
        if (val) {
          metadata.ficha = val;
          break;
        }
      }
    }
  }

  const warnings: string[] = [];
  if (mapping.competencia === -1) {
    warnings.push(
      'No se detectó automáticamente la columna "Competencia". Verifica la fila de encabezados.'
    );
  }
  if (mapping.juicio === -1) {
    warnings.push(
      'No se detectó automáticamente la columna "Juicio de Evaluación". Verifica la fila de encabezados.'
    );
  }

  const standardMappedIndices = new Set<number>([
    mapping.tipoDocumento,
    mapping.numeroDocumento,
    mapping.nombre,
    mapping.apellidos,
    mapping.estado,
    mapping.competencia,
    mapping.resultadoAprendizaje,
    mapping.juicio,
    mapping.grupo,
    mapping.fechaJuicio,
    mapping.funcionario,
  ]);

  const parsedRows: JuicioRow[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const docRaw = cleanCellValue(row[mapping.numeroDocumento]);
    const docNormalized = normalizeDocumentId(docRaw);
    const nombre = mapping.nombre >= 0 ? cleanCellValue(row[mapping.nombre]) : '';
    const apellidos = mapping.apellidos >= 0 ? cleanCellValue(row[mapping.apellidos]) : '';
    const competencia = mapping.competencia >= 0 ? cleanCellValue(row[mapping.competencia]) : '';
    const juicioRaw = mapping.juicio >= 0 ? cleanCellValue(row[mapping.juicio]) : '';

    if (!docNormalized || (!competencia && !juicioRaw && !nombre)) continue;

    if (normalizeText(docRaw).includes('DOCUMENTO') && normalizeText(juicioRaw).includes('JUICIO')) {
      continue;
    }

    const extraFields: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (standardMappedIndices.has(c)) continue;
      const val = cleanCellValue(row[c]);
      if (val) {
        extraFields[headers[c]] = val;
      }
    }

    const juicioEstado = classifyJuicio(juicioRaw);
    const esEtapaPractica = isEtapaPracticaCompetencia(competencia);
    const grupoVal =
      mapping.grupo >= 0
        ? cleanCellValue(row[mapping.grupo])
        : metadata.grupoGeneral || metadata.ficha;

    parsedRows.push({
      rowNumber: r + 1,
      tipoDocumento: mapping.tipoDocumento >= 0 ? cleanCellValue(row[mapping.tipoDocumento]) : '',
      numeroDocumento: docNormalized,
      nombre,
      apellidos,
      estadoAprendiz: mapping.estado >= 0 ? cleanCellValue(row[mapping.estado]) : '',
      competencia,
      resultadoAprendizaje:
        mapping.resultadoAprendizaje >= 0 ? cleanCellValue(row[mapping.resultadoAprendizaje]) : '',
      juicioRaw,
      juicioEstado,
      fechaJuicio: mapping.fechaJuicio >= 0 ? cleanCellValue(row[mapping.fechaJuicio]) : '',
      funcionario: mapping.funcionario >= 0 ? cleanCellValue(row[mapping.funcionario]) : '',
      grupo: grupoVal || 'Sin grupo asignado',
      esEtapaPractica,
      extraFields,
    });
  }

  if (parsedRows.length === 0) {
    warnings.push(
      'No se encontraron filas válidas con Número de Documento en la Columna B después de la fila de encabezados.'
    );
  }

  const aprendizMap = new Map<string, JuicioRow[]>();
  for (const row of parsedRows) {
    const existing = aprendizMap.get(row.numeroDocumento);
    if (existing) {
      existing.push(row);
    } else {
      aprendizMap.set(row.numeroDocumento, [row]);
    }
  }

  const aprendices: AprendizResumen[] = [];
  const programaMeta = metadata.denominacion || metadata.programa || secondaryRoster.programa || '';
  for (const [doc, jRows] of aprendizMap.entries()) {
    const cKey = canonicalDocKey(doc);
    aprendices.push({
      ...computeAprendizFromJuicios(
        doc,
        jRows,
        undefined,
        secondaryRoster.byDoc.get(cKey),
        programaMeta,
        metadata.fechaGrabacion || secondaryRoster.fechaGrabacion || metadata.fechaReporte
      ),
      ficha: metadata.ficha || undefined,
      programaFormacion: programaMeta || undefined,
      modalidadFormacion: metadata.modalidadFormacion || undefined,
      fechaInicioFicha: metadata.fechaInicio || undefined,
      fechaFinFicha: metadata.fechaFin || undefined,
    });
  }

  aprendices.sort((a, b) => {
    if (a.esDisponible !== b.esDisponible) return a.esDisponible ? -1 : 1;
    return a.nombreCompleto.localeCompare(b.nombreCompleto, 'es');
  });

  const compMap = new Map<string, CompetenciaResumen>();
  for (const row of parsedRows) {
    const key = row.competencia || 'Sin competencia especificada';
    const current = compMap.get(key) || {
      competencia: key,
      esEtapaPractica: row.esEtapaPractica,
      totalJuicios: 0,
      aprobados: 0,
      noAprobados: 0,
      porEvaluar: 0,
    };
    current.totalJuicios++;
    if (row.juicioEstado === 'APROBADO') current.aprobados++;
    else if (row.juicioEstado === 'NO_APROBADO') current.noAprobados++;
    else if (row.juicioEstado === 'POR_EVALUAR') current.porEvaluar++;
    compMap.set(key, current);
  }
  const competencias = Array.from(compMap.values()).sort((a, b) => {
    if (a.esEtapaPractica !== b.esEtapaPractica) return a.esEtapaPractica ? 1 : -1;
    return b.porEvaluar + b.noAprobados - (a.porEvaluar + a.noAprobados);
  });

  const grupoMap = new Map<string, GrupoResumen>();
  for (const apr of aprendices) {
    const key = apr.grupo || 'Sin grupo asignado';
    const current = grupoMap.get(key) || {
      grupo: key,
      denominacion: metadata.denominacion || metadata.programa || '',
      modalidadFormacion: metadata.modalidadFormacion || '',
      fechaInicio: metadata.fechaInicio || '',
      fechaFin: metadata.fechaFin || '',
      fechaReporte: metadata.fechaReporte || '',
      totalAprendices: 0,
      disponibles: 0,
      aprobados: 0,
      noAprobados: 0,
      porEvaluar: 0,
      totalJuicios: 0,
    };
    current.totalAprendices++;
    if (apr.esDisponible) current.disponibles++;
    current.aprobados += apr.aprobados;
    current.noAprobados += apr.noAprobados;
    current.porEvaluar += apr.porEvaluar;
    current.totalJuicios += apr.totalJuicios;
    grupoMap.set(key, current);
  }
  const grupos = Array.from(grupoMap.values()).sort((a, b) =>
    a.grupo.localeCompare(b.grupo, 'es')
  );

  const totalesFicha = {
    totalAprendices: aprendices.length,
    totalDisponibles: aprendices.filter((a) => a.esDisponible).length,
    totalJuicios: parsedRows.length,
    aprobados: parsedRows.filter((r) => r.juicioEstado === 'APROBADO').length,
    noAprobados: parsedRows.filter((r) => r.juicioEstado === 'NO_APROBADO').length,
    porEvaluar: parsedRows.filter((r) => r.juicioEstado === 'POR_EVALUAR').length,
    otros: parsedRows.filter((r) => r.juicioEstado === 'OTRO').length,
  };

  return {
    metadata,
    aprendices,
    competencias,
    grupos,
    totalesFicha,
    availableSheets,
    headers,
    columnMapping: mapping,
    configUsed: {
      sheetName,
      headerRowIndex,
      documentoColIndex: mapping.numeroDocumento,
      grupoColIndex: mapping.grupo >= 0 ? mapping.grupo : null,
    },
    warnings,
  };
}

export function validateFichaAndMerge(params: {
  roster: AprendicesRosterResult | null;
  juicios: WorkbookAnalysis | null;
  targetFichaManual: string;
}): FichaValidationResult {
  const { roster, juicios, targetFichaManual } = params;

  const expectedFicha =
    extractFichaCode(targetFichaManual) ||
    roster?.fichaDetectada ||
    juicios?.metadata.ficha ||
    '';
  const expectedNorm = normalizeFichaId(expectedFicha);

  const juiciosFicha = juicios?.metadata.ficha || '';
  const juiciosNorm = normalizeFichaId(juiciosFicha);

  let matchState: FichaMatchState;
  let mensajeValidacion = '';

  if (!juicios) {
    matchState = 'MISSING_JUICIOS';
    mensajeValidacion = expectedFicha
      ? `Se debe subir el Reporte de Juicios de la Ficha ${expectedFicha} para poder analizar.`
      : 'Se debe subir el Reporte de Juicios de la Ficha para poder analizar.';
  } else if (!juiciosNorm) {
    matchState = 'MISSING_FICHA_IN_JUICIOS';
    mensajeValidacion = expectedFicha
      ? `El archivo subido no indica el número de Ficha de Caracterización. Se debe subir el Reporte de Juicios de la Ficha ${expectedFicha} para poder analizar.`
      : 'El archivo subido no contiene el campo "Ficha de Caracterización:". Se debe subir el Reporte de Juicios de la Ficha para poder analizar.';
  } else if (expectedNorm && expectedNorm !== juiciosNorm) {
    matchState = 'MISMATCH';
    mensajeValidacion = `El número de Ficha de Caracterización no coincide (Ficha esperada: ${expectedFicha} · Ficha en el reporte: ${juiciosFicha}). Se debe subir el Reporte de Juicios de la Ficha ${expectedFicha} para poder analizar.`;
  } else {
    matchState = 'MATCHED';
    mensajeValidacion = `Ficha de Caracterización ${juiciosFicha} verificada correctamente.`;
  }

  const canShowResumen = matchState === 'MATCHED' && juicios !== null;

  if (!canShowResumen) {
    // Only return roster cards (without judgment counts / green button) if roster exists
    const rosterOnlyCards: AprendizResumen[] = (roster?.aprendices || []).map((b) => ({
      numeroDocumento: b.numeroDocumento,
      tipoDocumento: b.tipoDocumento,
      nombre: b.nombre,
      apellidos: b.apellidos,
      nombreCompleto: b.nombreCompleto,
      estadoAprendiz: b.estadoAprendiz,
      grupo: b.grupo || (expectedFicha ? `Ficha ${expectedFicha}` : 'Sin grupo'),
      ficha: b.ficha || expectedFicha || undefined,
      programaFormacion: b.perfil.especialidad || roster?.programa || undefined,
      perfil: b.perfil,
      extraInfo: b.extraInfo,
      totalJuicios: 0,
      aprobados: 0,
      noAprobados: 0,
      porEvaluar: 0,
      otros: 0,
      etapaPracticaTotal: 0,
      etapaPracticaPorEvaluar: 0,
      etapaPracticaAprobados: 0,
      lectivaPorEvaluar: 0,
      juiciosVerificados: false,
      encontradoEnJuicios: false,
      esDisponible: false,
      razonDisponibilidad: expectedFicha
        ? `Pendiente: subir Reporte de Juicios de la Ficha ${expectedFicha} para analizar.`
        : 'Pendiente: subir Reporte de Juicios de la Ficha para analizar.',
      juicios: [],
    }));

    return {
      matchState,
      canShowResumen: false,
      expectedFicha,
      juiciosFicha,
      mensajeValidacion,
      aprendices: rosterOnlyCards,
      competencias: [],
      grupos: [],
      totalesFicha: {
        totalAprendices: rosterOnlyCards.length,
        totalDisponibles: 0,
        totalJuicios: 0,
        aprobados: 0,
        noAprobados: 0,
        porEvaluar: 0,
        otros: 0,
      },
    };
  }

  // Matched: merge roster (if present) with juicios by Columna B (numeroDocumento)
  if (!roster || roster.aprendices.length === 0) {
    return {
      matchState,
      canShowResumen: true,
      expectedFicha: expectedFicha || juiciosFicha,
      juiciosFicha,
      mensajeValidacion,
      aprendices: juicios.aprendices,
      competencias: juicios.competencias,
      grupos: juicios.grupos,
      totalesFicha: juicios.totalesFicha,
    };
  }

  const juiciosByDoc = new Map<string, AprendizResumen>();
  for (const apr of juicios.aprendices) {
    juiciosByDoc.set(canonicalDocKey(apr.numeroDocumento), apr);
  }

  const fallbackProg = roster.programa || juicios.metadata.programa;
  const fallbackFechaGrab =
    roster.fechaGrabacion ||
    juicios.metadata.fechaGrabacion ||
    juicios.metadata.fechaReporte;

  const mergedAprendices: AprendizResumen[] = [];
  const seenDocs = new Set<string>();

  const programaMerged =
    juicios.metadata.denominacion || juicios.metadata.programa || fallbackProg || '';

  for (const base of roster.aprendices) {
    const cKey = canonicalDocKey(base.numeroDocumento);
    seenDocs.add(cKey);
    const matched = juiciosByDoc.get(cKey);
    mergedAprendices.push({
      ...computeAprendizFromJuicios(
        base.numeroDocumento,
        matched?.juicios || [],
        base,
        undefined,
        fallbackProg,
        fallbackFechaGrab
      ),
      ficha: juicios.metadata.ficha || base.ficha || expectedFicha || undefined,
      programaFormacion: programaMerged || base.perfil.especialidad || undefined,
      modalidadFormacion: juicios.metadata.modalidadFormacion || undefined,
      fechaInicioFicha: juicios.metadata.fechaInicio || undefined,
      fechaFinFicha: juicios.metadata.fechaFin || undefined,
    });
  }

  mergedAprendices.sort((a, b) => {
    if (a.esDisponible !== b.esDisponible) return a.esDisponible ? -1 : 1;
    return a.nombreCompleto.localeCompare(b.nombreCompleto, 'es');
  });

  const grupoMap = new Map<string, GrupoResumen>();
  for (const apr of mergedAprendices) {
    const key = apr.grupo || 'Sin grupo asignado';
    const current = grupoMap.get(key) || {
      grupo: key,
      denominacion: juicios.metadata.denominacion || juicios.metadata.programa || '',
      modalidadFormacion: juicios.metadata.modalidadFormacion || '',
      fechaInicio: juicios.metadata.fechaInicio || '',
      fechaFin: juicios.metadata.fechaFin || '',
      fechaReporte: juicios.metadata.fechaReporte || '',
      totalAprendices: 0,
      disponibles: 0,
      aprobados: 0,
      noAprobados: 0,
      porEvaluar: 0,
      totalJuicios: 0,
    };
    current.totalAprendices++;
    if (apr.esDisponible) current.disponibles++;
    current.aprobados += apr.aprobados;
    current.noAprobados += apr.noAprobados;
    current.porEvaluar += apr.porEvaluar;
    current.totalJuicios += apr.totalJuicios;
    grupoMap.set(key, current);
  }

  return {
    matchState,
    canShowResumen: true,
    expectedFicha: expectedFicha || juiciosFicha,
    juiciosFicha,
    mensajeValidacion,
    aprendices: mergedAprendices,
    competencias: juicios.competencias,
    grupos: Array.from(grupoMap.values()).sort((a, b) => a.grupo.localeCompare(b.grupo, 'es')),
    totalesFicha: {
      ...juicios.totalesFicha,
      totalAprendices: mergedAprendices.length,
      totalDisponibles: mergedAprendices.filter((a) => a.esDisponible).length,
    },
  };
}

export function exportAnalysisToExcel(
  validation: FichaValidationResult,
  fileName: string
): void {
  const wb = XLSX.utils.book_new();

  const aprendicesRows = validation.aprendices.map((a) => ({
    'Tipo Documento': a.tipoDocumento,
    'Número de Documento (Col B)': a.numeroDocumento,
    Nombre: a.nombre,
    Apellidos: a.apellidos,
    Estado: a.estadoAprendiz,
    'Grupo / Ficha': a.grupo,
    Especialidad: a.perfil.especialidad,
    Dirección: a.perfil.direccion,
    Teléfono: a.perfil.telefono,
    'Correo Electrónico': a.perfil.correoElectronico,
    Municipio: a.perfil.municipio,
    'Fecha Grabación': a.perfil.fechaGrabacion,
    Aprobados: a.aprobados,
    'No Aprobados': a.noAprobados,
    'Por Evaluar': a.porEvaluar,
    'Total Juicios': a.totalJuicios,
    'Disponible Etapa Práctica': a.esDisponible ? 'DISPONIBLE' : 'NO DISPONIBLE',
    'Detalle Verificación': a.razonDisponibilidad,
  }));

  const wsAprendices = XLSX.utils.json_to_sheet(aprendicesRows);
  XLSX.utils.book_append_sheet(wb, wsAprendices, 'Disponibilidad Aprendices');

  const resumenFicha = [
    { Métrica: 'Archivo Origen', Valor: fileName },
    { Métrica: 'Ficha de Caracterización', Valor: validation.juiciosFicha || validation.expectedFicha || 'No especificada' },
    { Métrica: 'Total Aprendices', Valor: validation.totalesFicha.totalAprendices },
    { Métrica: 'Aprendices Disponibles (Botón Verde)', Valor: validation.totalesFicha.totalDisponibles },
    { Métrica: 'Juicios Aprobados', Valor: validation.totalesFicha.aprobados },
    { Métrica: 'Juicios No Aprobados', Valor: validation.totalesFicha.noAprobados },
    { Métrica: 'Juicios Por Evaluar', Valor: validation.totalesFicha.porEvaluar },
    { Métrica: 'Total Juicios Registrados', Valor: validation.totalesFicha.totalJuicios },
  ];
  const wsResumen = XLSX.utils.json_to_sheet(resumenFicha);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Recuento Ficha');

  const compRows = validation.competencias.map((c) => ({
    Competencia: c.competencia,
    'Es Etapa Práctica': c.esEtapaPractica ? 'Sí' : 'No',
    Aprobados: c.aprobados,
    'No Aprobados': c.noAprobados,
    'Por Evaluar': c.porEvaluar,
    'Total Juicios': c.totalJuicios,
  }));
  const wsComp = XLSX.utils.json_to_sheet(compRows);
  XLSX.utils.book_append_sheet(wb, wsComp, 'Competencias');

  const baseName = fileName.replace(/\.(xlsx|xls|csv)$/i, '');
  XLSX.writeFile(wb, `${baseName}_Analisis_Disponibilidad.xlsx`);
}

export interface DriveSyncConsolidatedResult {
  validation: FichaValidationResult;
  fichasDisponibles: Array<{
    key: string;
    ficha: string;
    programa: string;
    modalidadFormacion: string;
    fileName: string;
    fechaReporte: string;
    totalAprendices: number;
    totalDisponibles: number;
    aprobados: number;
    noAprobados: number;
    porEvaluar: number;
    totalJuicios: number;
    estadosAprendices: Array<{ estado: string; count: number }>;
  }>;
  missingRosterFichas: string[];
}

export function consolidateDriveSync(params: {
  juiciosList: WorkbookAnalysis[];
  rosters: AprendicesRosterResult[];
  selectedKey: string; // 'ALL' or specific fileName
}): DriveSyncConsolidatedResult {
  const { juiciosList, rosters, selectedKey } = params;

  // Build global doc -> AprendizBaseRecord lookup across all rosters
  const globalDocMap = new Map<string, AprendizBaseRecord>();
  const rosterByFichaNorm = new Map<string, AprendicesRosterResult>();

  for (const r of rosters) {
    const fNorm = normalizeFichaId(r.fichaDetectada || '');
    if (fNorm && !rosterByFichaNorm.has(fNorm)) {
      rosterByFichaNorm.set(fNorm, r);
    }
    for (const apr of r.aprendices) {
      const cKey = canonicalDocKey(apr.numeroDocumento);
      if (!cKey) continue;
      const existing = globalDocMap.get(cKey);
      if (!existing) {
        globalDocMap.set(cKey, apr);
      } else {
        // Merge non-empty profile fields if an additional roster has richer data
        globalDocMap.set(cKey, {
          ...existing,
          nombre: existing.nombre || apr.nombre,
          apellidos: existing.apellidos || apr.apellidos,
          nombreCompleto:
            existing.nombreCompleto && !existing.nombreCompleto.startsWith('Aprendiz ')
              ? existing.nombreCompleto
              : apr.nombreCompleto,
          estadoAprendiz:
            existing.estadoAprendiz && existing.estadoAprendiz !== 'Sin estado'
              ? existing.estadoAprendiz
              : apr.estadoAprendiz,
          grupo:
            existing.grupo && existing.grupo !== 'Sin grupo asignado' ? existing.grupo : apr.grupo,
          ficha: existing.ficha || apr.ficha,
          perfil: {
            direccion: existing.perfil.direccion || apr.perfil.direccion,
            telefono: existing.perfil.telefono || apr.perfil.telefono,
            correoElectronico:
              existing.perfil.correoElectronico || apr.perfil.correoElectronico,
            municipio: existing.perfil.municipio || apr.perfil.municipio,
            fechaGrabacion: existing.perfil.fechaGrabacion || apr.perfil.fechaGrabacion,
            especialidad: existing.perfil.especialidad || apr.perfil.especialidad,
          },
          extraInfo: { ...apr.extraInfo, ...existing.extraInfo },
        });
      }
    }
  }

  // Track which roster fichas do NOT have a matching Juicios report in Drive
  const juiciosFichaNorms = new Set(
    juiciosList.map((j) => normalizeFichaId(j.metadata.ficha || '')).filter(Boolean)
  );
  const missingRosterFichas: string[] = [];
  for (const r of rosters) {
    const fCode = extractFichaCode(r.fichaDetectada || '');
    const fNorm = normalizeFichaId(fCode);
    if (fNorm && !juiciosFichaNorms.has(fNorm) && !missingRosterFichas.includes(fCode)) {
      missingRosterFichas.push(fCode);
    }
  }

  // No Juicios reports found in Drive at all
  if (juiciosList.length === 0) {
    const firstRoster = rosters[0] || null;
    const mergedValidation = validateFichaAndMerge({
      roster: firstRoster,
      juicios: null,
      targetFichaManual: firstRoster?.fichaDetectada || '',
    });
    return {
      validation: mergedValidation,
      fichasDisponibles: [],
      missingRosterFichas,
    };
  }

  // Enrich each Juicios report with matching Ficha roster + global Doc lookup
  const enrichedByFile = juiciosList.map((juicios) => {
    const ficha = juicios.metadata.ficha || '';
    const fNorm = normalizeFichaId(ficha);
    const matchingFichaRoster = fNorm ? rosterByFichaNorm.get(fNorm) || null : null;

    const baseMerged = validateFichaAndMerge({
      roster: matchingFichaRoster,
      juicios,
      targetFichaManual: ficha,
    });

    const enrichedAprendices = baseMerged.aprendices.map((apr) => {
      const cKey = canonicalDocKey(apr.numeroDocumento);
      const rosterMatch = globalDocMap.get(cKey);
      const progResolved =
        apr.programaFormacion ||
        juicios.metadata.denominacion ||
        juicios.metadata.programa ||
        rosterMatch?.perfil.especialidad ||
        apr.perfil.especialidad ||
        undefined;
      if (!rosterMatch) {
        return {
          ...apr,
          ficha: ficha || undefined,
          archivoOrigen: juicios.metadata.fileName,
          programaFormacion: progResolved,
          modalidadFormacion: apr.modalidadFormacion || juicios.metadata.modalidadFormacion || undefined,
          fechaInicioFicha: apr.fechaInicioFicha || juicios.metadata.fechaInicio || undefined,
          fechaFinFicha: apr.fechaFinFicha || juicios.metadata.fechaFin || undefined,
        };
      }

      return {
        ...apr,
        ficha: ficha || rosterMatch.ficha || undefined,
        archivoOrigen: juicios.metadata.fileName,
        programaFormacion: progResolved,
        modalidadFormacion: apr.modalidadFormacion || juicios.metadata.modalidadFormacion || undefined,
        fechaInicioFicha: apr.fechaInicioFicha || juicios.metadata.fechaInicio || undefined,
        fechaFinFicha: apr.fechaFinFicha || juicios.metadata.fechaFin || undefined,
        nombre: apr.nombre || rosterMatch.nombre,
        apellidos: apr.apellidos || rosterMatch.apellidos,
        nombreCompleto:
          apr.nombreCompleto && !apr.nombreCompleto.startsWith('Aprendiz ')
            ? apr.nombreCompleto
            : rosterMatch.nombreCompleto || apr.nombreCompleto,
        estadoAprendiz:
          apr.estadoAprendiz && apr.estadoAprendiz !== 'Sin estado'
            ? apr.estadoAprendiz
            : rosterMatch.estadoAprendiz || apr.estadoAprendiz,
        grupo:
          apr.grupo && apr.grupo !== 'Sin grupo asignado'
            ? apr.grupo
            : rosterMatch.grupo || apr.grupo,
        perfil: {
          direccion: apr.perfil.direccion || rosterMatch.perfil.direccion,
          telefono: apr.perfil.telefono || rosterMatch.perfil.telefono,
          correoElectronico:
            apr.perfil.correoElectronico || rosterMatch.perfil.correoElectronico,
          municipio: apr.perfil.municipio || rosterMatch.perfil.municipio,
          fechaGrabacion: apr.perfil.fechaGrabacion || rosterMatch.perfil.fechaGrabacion,
          especialidad: apr.perfil.especialidad || rosterMatch.perfil.especialidad,
        },
        extraInfo: { ...rosterMatch.extraInfo, ...apr.extraInfo },
      };
    });

    return {
      juicios,
      validation: {
        ...baseMerged,
        aprendices: enrichedAprendices,
        totalesFicha: {
          ...baseMerged.totalesFicha,
          totalAprendices: enrichedAprendices.length,
          totalDisponibles: enrichedAprendices.filter((a) => a.esDisponible).length,
        },
      },
    };
  });

  const fichasDisponibles = enrichedByFile.map((item) => {
    const estadoMap = new Map<string, number>();
    for (const apr of item.validation.aprendices) {
      const estado = (apr.estadoAprendiz || 'Sin estado').trim() || 'Sin estado';
      estadoMap.set(estado, (estadoMap.get(estado) || 0) + 1);
    }
    const estadosAprendices = Array.from(estadoMap.entries())
      .map(([estado, count]) => ({ estado, count }))
      .sort((a, b) => b.count - a.count || a.estado.localeCompare(b.estado, 'es'));

    return {
      key: item.juicios.metadata.fileName,
      ficha: item.juicios.metadata.ficha,
      programa: item.juicios.metadata.programa,
      modalidadFormacion: item.juicios.metadata.modalidadFormacion || '',
      fileName: item.juicios.metadata.fileName,
      fechaReporte: item.juicios.metadata.fechaReporte,
      totalAprendices: item.validation.totalesFicha.totalAprendices,
      totalDisponibles: item.validation.totalesFicha.totalDisponibles,
      aprobados: item.validation.totalesFicha.aprobados,
      noAprobados: item.validation.totalesFicha.noAprobados,
      porEvaluar: item.validation.totalesFicha.porEvaluar,
      totalJuicios: item.validation.totalesFicha.totalJuicios,
      estadosAprendices,
    };
  });

  if (selectedKey !== 'ALL') {
    const selected = enrichedByFile.find((item) => item.juicios.metadata.fileName === selectedKey);
    if (selected) {
      return {
        validation: selected.validation,
        fichasDisponibles,
        missingRosterFichas,
      };
    }
  }

  if (enrichedByFile.length === 1) {
    return {
      validation: enrichedByFile[0].validation,
      fichasDisponibles,
      missingRosterFichas,
    };
  }

  // Combine all validated Juicios reports into a unified view
  const allAprendices: AprendizResumen[] = [];
  const compMap = new Map<string, CompetenciaResumen>();
  const grupoMap = new Map<string, GrupoResumen>();
  const validFichas = new Set<string>();
  let anyMatched = false;

  const totales = {
    totalAprendices: 0,
    totalDisponibles: 0,
    totalJuicios: 0,
    aprobados: 0,
    noAprobados: 0,
    porEvaluar: 0,
    otros: 0,
  };

  for (const item of enrichedByFile) {
    if (item.validation.canShowResumen) {
      anyMatched = true;
    }
    if (item.juicios.metadata.ficha) {
      validFichas.add(item.juicios.metadata.ficha);
    }

    allAprendices.push(...item.validation.aprendices);
    totales.totalJuicios += item.validation.totalesFicha.totalJuicios;
    totales.aprobados += item.validation.totalesFicha.aprobados;
    totales.noAprobados += item.validation.totalesFicha.noAprobados;
    totales.porEvaluar += item.validation.totalesFicha.porEvaluar;
    totales.otros += item.validation.totalesFicha.otros;

    for (const c of item.validation.competencias) {
      const existing = compMap.get(c.competencia) || {
        competencia: c.competencia,
        esEtapaPractica: c.esEtapaPractica,
        totalJuicios: 0,
        aprobados: 0,
        noAprobados: 0,
        porEvaluar: 0,
      };
      existing.totalJuicios += c.totalJuicios;
      existing.aprobados += c.aprobados;
      existing.noAprobados += c.noAprobados;
      existing.porEvaluar += c.porEvaluar;
      compMap.set(c.competencia, existing);
    }

    for (const g of item.validation.grupos) {
      const gLabel =
        item.juicios.metadata.ficha && !g.grupo.includes(item.juicios.metadata.ficha)
          ? `${g.grupo} (Ficha ${item.juicios.metadata.ficha})`
          : g.grupo;
      const existing = grupoMap.get(gLabel) || {
        grupo: gLabel,
        denominacion:
          g.denominacion || item.juicios.metadata.denominacion || item.juicios.metadata.programa || '',
        modalidadFormacion:
          g.modalidadFormacion || item.juicios.metadata.modalidadFormacion || '',
        fechaInicio: g.fechaInicio || item.juicios.metadata.fechaInicio || '',
        fechaFin: g.fechaFin || item.juicios.metadata.fechaFin || '',
        fechaReporte: g.fechaReporte || item.juicios.metadata.fechaReporte || '',
        totalAprendices: 0,
        disponibles: 0,
        aprobados: 0,
        noAprobados: 0,
        porEvaluar: 0,
        totalJuicios: 0,
      };
      existing.totalAprendices += g.totalAprendices;
      existing.disponibles += g.disponibles;
      existing.aprobados += g.aprobados;
      existing.noAprobados += g.noAprobados;
      existing.porEvaluar += g.porEvaluar;
      existing.totalJuicios += g.totalJuicios;
      grupoMap.set(gLabel, existing);
    }
  }

  allAprendices.sort((a, b) => {
    if (a.esDisponible !== b.esDisponible) return a.esDisponible ? -1 : 1;
    return a.nombreCompleto.localeCompare(b.nombreCompleto, 'es');
  });

  totales.totalAprendices = allAprendices.length;
  totales.totalDisponibles = allAprendices.filter((a) => a.esDisponible).length;

  const fichasLabel = Array.from(validFichas).join(', ');
  const validation: FichaValidationResult = {
    matchState: anyMatched ? 'MATCHED' : enrichedByFile[0].validation.matchState,
    canShowResumen: anyMatched,
    expectedFicha: fichasLabel,
    juiciosFicha: fichasLabel,
    mensajeValidacion: anyMatched
      ? `${enrichedByFile.length} reportes Excel de Google Drive sincronizados y relacionados correctamente.`
      : enrichedByFile[0].validation.mensajeValidacion,
    aprendices: allAprendices,
    competencias: Array.from(compMap.values()).sort((a, b) => {
      if (a.esEtapaPractica !== b.esEtapaPractica) return a.esEtapaPractica ? 1 : -1;
      return b.porEvaluar + b.noAprobados - (a.porEvaluar + a.noAprobados);
    }),
    grupos: Array.from(grupoMap.values()).sort((a, b) => a.grupo.localeCompare(b.grupo, 'es')),
    totalesFicha: totales,
  };

  return {
    validation,
    fichasDisponibles,
    missingRosterFichas,
  };
}

export function crossRostersWithDriveJuicios(params: {
  rosters: AprendicesRosterResult[];
  juiciosList: WorkbookAnalysis[];
}): FichaValidationResult {
  const { rosters, juiciosList } = params;

  if (rosters.length === 0) {
    return {
      matchState: 'MISSING_JUICIOS',
      canShowResumen: false,
      expectedFicha: '',
      juiciosFicha: '',
      mensajeValidacion: 'Sube el Excel de aprendices disponibles para mostrar las tarjetas.',
      aprendices: [],
      competencias: [],
      grupos: [],
      totalesFicha: {
        totalAprendices: 0,
        totalDisponibles: 0,
        totalJuicios: 0,
        aprobados: 0,
        noAprobados: 0,
        porEvaluar: 0,
        otros: 0,
      },
    };
  }

  // Deduplicate apprentices from the Excel(s) de Aprendices Disponibles, merging richest profile fields
  const rosterEntries: Array<{ base: AprendizBaseRecord; roster: AprendicesRosterResult }> = [];
  const docIndexMap = new Map<string, number>();

  for (const r of rosters) {
    for (const apr of r.aprendices) {
      const cKey = canonicalDocKey(apr.numeroDocumento);
      if (!cKey) continue;
      const existingIdx = docIndexMap.get(cKey);
      if (existingIdx === undefined) {
        docIndexMap.set(cKey, rosterEntries.length);
        rosterEntries.push({ base: apr, roster: r });
      } else {
        const prev = rosterEntries[existingIdx].base;
        rosterEntries[existingIdx].base = {
          ...prev,
          nombre: prev.nombre || apr.nombre,
          apellidos: prev.apellidos || apr.apellidos,
          nombreCompleto:
            prev.nombreCompleto && !prev.nombreCompleto.startsWith('Aprendiz ')
              ? prev.nombreCompleto
              : apr.nombreCompleto,
          estadoAprendiz:
            prev.estadoAprendiz && prev.estadoAprendiz !== 'Sin estado'
              ? prev.estadoAprendiz
              : apr.estadoAprendiz,
          grupo: prev.grupo && prev.grupo !== 'Sin grupo asignado' ? prev.grupo : apr.grupo,
          ficha: prev.ficha || apr.ficha,
          perfil: {
            direccion: prev.perfil.direccion || apr.perfil.direccion,
            telefono: prev.perfil.telefono || apr.perfil.telefono,
            correoElectronico: prev.perfil.correoElectronico || apr.perfil.correoElectronico,
            municipio: prev.perfil.municipio || apr.perfil.municipio,
            fechaGrabacion: prev.perfil.fechaGrabacion || apr.perfil.fechaGrabacion,
            especialidad: prev.perfil.especialidad || apr.perfil.especialidad,
          },
          extraInfo: { ...apr.extraInfo, ...prev.extraInfo },
        };
      }
    }
  }

  // Index all synced Juicios reports by Ficha+Doc, by Ficha metadata, and by Doc
  const byFichaAndDoc = new Map<string, { juicios: WorkbookAnalysis; apr: AprendizResumen }>();
  const byFichaMeta = new Map<string, WorkbookAnalysis>();
  const byDoc = new Map<string, Array<{ juicios: WorkbookAnalysis; apr: AprendizResumen }>>();

  for (const j of juiciosList) {
    const fNorm = normalizeFichaId(j.metadata.ficha || '');
    if (fNorm && !byFichaMeta.has(fNorm)) {
      byFichaMeta.set(fNorm, j);
    }
    for (const apr of j.aprendices) {
      const cKey = canonicalDocKey(apr.numeroDocumento);
      if (!cKey) continue;
      if (fNorm) {
        const fKey = `${fNorm}::${cKey}`;
        if (!byFichaAndDoc.has(fKey)) {
          byFichaAndDoc.set(fKey, { juicios: j, apr });
        }
      }
      const list = byDoc.get(cKey) || [];
      list.push({ juicios: j, apr });
      byDoc.set(cKey, list);
    }
  }

  const aprendices: AprendizResumen[] = [];
  const matchedFichas = new Set<string>();
  const compMap = new Map<string, CompetenciaResumen>();
  const grupoMap = new Map<string, GrupoResumen>();

  let totalJuicios = 0;
  let aprobados = 0;
  let noAprobados = 0;
  let porEvaluar = 0;
  let otros = 0;
  let anyMatchedJuicios = false;

  for (const { base, roster } of rosterEntries) {
    const cKey = canonicalDocKey(base.numeroDocumento);
    const baseFicha = base.ficha || roster.fichaDetectada || '';
    const baseFichaNorm = normalizeFichaId(baseFicha);

    const exactMatch = baseFichaNorm ? byFichaAndDoc.get(`${baseFichaNorm}::${cKey}`) : undefined;
    const docMatches = byDoc.get(cKey);
    const match = exactMatch || (docMatches && docMatches.length > 0 ? docMatches[0] : undefined);
    const fichaMetaJuicios = match?.juicios || (baseFichaNorm ? byFichaMeta.get(baseFichaNorm) : undefined);

    const fallbackProg =
      base.perfil.especialidad ||
      roster.programa ||
      fichaMetaJuicios?.metadata.denominacion ||
      fichaMetaJuicios?.metadata.programa ||
      '';
    const programaResolved =
      fichaMetaJuicios?.metadata.denominacion ||
      fichaMetaJuicios?.metadata.programa ||
      fallbackProg ||
      '';
    const fallbackFechaGrab =
      base.perfil.fechaGrabacion ||
      roster.fechaGrabacion ||
      fichaMetaJuicios?.metadata.fechaGrabacion ||
      fichaMetaJuicios?.metadata.fechaReporte ||
      '';

    let item: AprendizResumen;
    if (match) {
      anyMatchedJuicios = true;
      const computed = computeAprendizFromJuicios(
        base.numeroDocumento,
        match.apr.juicios,
        base,
        undefined,
        fallbackProg,
        fallbackFechaGrab
      );
      const fichaResolved = match.juicios.metadata.ficha || baseFicha;
      if (fichaResolved) matchedFichas.add(fichaResolved);
      item = {
        ...computed,
        ficha: fichaResolved || undefined,
        archivoOrigen: match.juicios.metadata.fileName,
        programaFormacion: programaResolved || undefined,
        modalidadFormacion: match.juicios.metadata.modalidadFormacion || undefined,
        fechaInicioFicha: match.juicios.metadata.fechaInicio || undefined,
        fechaFinFicha: match.juicios.metadata.fechaFin || undefined,
      };

      for (const jr of match.apr.juicios) {
        const compKey = jr.competencia || 'Sin competencia especificada';
        const compCurrent = compMap.get(compKey) || {
          competencia: compKey,
          esEtapaPractica: jr.esEtapaPractica,
          totalJuicios: 0,
          aprobados: 0,
          noAprobados: 0,
          porEvaluar: 0,
        };
        compCurrent.totalJuicios++;
        if (jr.juicioEstado === 'APROBADO') compCurrent.aprobados++;
        else if (jr.juicioEstado === 'NO_APROBADO') compCurrent.noAprobados++;
        else if (jr.juicioEstado === 'POR_EVALUAR') compCurrent.porEvaluar++;
        compMap.set(compKey, compCurrent);
      }

      totalJuicios += item.totalJuicios;
      aprobados += item.aprobados;
      noAprobados += item.noAprobados;
      porEvaluar += item.porEvaluar;
      otros += item.otros;
    } else {
      item = {
        numeroDocumento: base.numeroDocumento,
        tipoDocumento: base.tipoDocumento,
        nombre: base.nombre,
        apellidos: base.apellidos,
        nombreCompleto: base.nombreCompleto,
        estadoAprendiz: base.estadoAprendiz,
        grupo: base.grupo || (baseFicha ? `Ficha ${baseFicha}` : 'Sin grupo'),
        ficha: baseFicha || undefined,
        archivoOrigen: roster.fileName,
        programaFormacion: programaResolved || undefined,
        modalidadFormacion: fichaMetaJuicios?.metadata.modalidadFormacion || undefined,
        fechaInicioFicha: fichaMetaJuicios?.metadata.fechaInicio || undefined,
        fechaFinFicha: fichaMetaJuicios?.metadata.fechaFin || undefined,
        perfil: {
          ...base.perfil,
          especialidad: fallbackProg,
          fechaGrabacion: fallbackFechaGrab,
        },
        extraInfo: base.extraInfo,
        totalJuicios: 0,
        aprobados: 0,
        noAprobados: 0,
        porEvaluar: 0,
        otros: 0,
        etapaPracticaTotal: 0,
        etapaPracticaPorEvaluar: 0,
        etapaPracticaAprobados: 0,
        lectivaPorEvaluar: 0,
        juiciosVerificados: false,
        encontradoEnJuicios: false,
        esDisponible: false,
        razonDisponibilidad:
          juiciosList.length > 0
            ? baseFicha
              ? `No se encontró el documento en el Reporte de Juicios de la Ficha ${baseFicha}.`
              : 'Documento no encontrado en los Reportes de Juicios sincronizados.'
            : 'Pendiente: sincronizar o subir Reporte de Juicios para verificar disponibilidad.',
        juicios: [],
      };
    }

    aprendices.push(item);

    const gKey = item.grupo || 'Sin grupo asignado';
    const gCurrent = grupoMap.get(gKey) || {
      grupo: gKey,
      denominacion:
        match?.juicios.metadata.denominacion ||
        match?.juicios.metadata.programa ||
        fallbackProg ||
        '',
      modalidadFormacion: match?.juicios.metadata.modalidadFormacion || '',
      fechaInicio: match?.juicios.metadata.fechaInicio || '',
      fechaFin: match?.juicios.metadata.fechaFin || '',
      fechaReporte: match?.juicios.metadata.fechaReporte || '',
      totalAprendices: 0,
      disponibles: 0,
      aprobados: 0,
      noAprobados: 0,
      porEvaluar: 0,
      totalJuicios: 0,
    };
    if (!gCurrent.denominacion && (match?.juicios.metadata.denominacion || fallbackProg)) {
      gCurrent.denominacion =
        match?.juicios.metadata.denominacion ||
        match?.juicios.metadata.programa ||
        fallbackProg;
    }
    if (!gCurrent.modalidadFormacion && match?.juicios.metadata.modalidadFormacion) {
      gCurrent.modalidadFormacion = match.juicios.metadata.modalidadFormacion;
    }
    if (!gCurrent.fechaInicio && match?.juicios.metadata.fechaInicio) {
      gCurrent.fechaInicio = match.juicios.metadata.fechaInicio;
    }
    if (!gCurrent.fechaFin && match?.juicios.metadata.fechaFin) {
      gCurrent.fechaFin = match.juicios.metadata.fechaFin;
    }
    if (!gCurrent.fechaReporte && match?.juicios.metadata.fechaReporte) {
      gCurrent.fechaReporte = match.juicios.metadata.fechaReporte;
    }
    gCurrent.totalAprendices++;
    if (item.esDisponible) gCurrent.disponibles++;
    gCurrent.aprobados += item.aprobados;
    gCurrent.noAprobados += item.noAprobados;
    gCurrent.porEvaluar += item.porEvaluar;
    gCurrent.totalJuicios += item.totalJuicios;
    grupoMap.set(gKey, gCurrent);
  }

  aprendices.sort((a, b) => {
    if (a.esDisponible !== b.esDisponible) return a.esDisponible ? -1 : 1;
    return a.nombreCompleto.localeCompare(b.nombreCompleto, 'es');
  });

  const fichasLabel = Array.from(matchedFichas).join(', ');
  return {
    matchState: anyMatchedJuicios ? 'MATCHED' : 'MISSING_JUICIOS',
    canShowResumen: anyMatchedJuicios,
    expectedFicha: rosters[0]?.fichaDetectada || fichasLabel,
    juiciosFicha: fichasLabel || rosters[0]?.fichaDetectada || '',
    mensajeValidacion: anyMatchedJuicios
      ? `${aprendices.length} aprendiz(ces) del Excel de aprendices disponibles cruzados con los reportes de juicios.`
      : 'Excel de aprendices disponibles cargado. Pendiente cruzar con reportes de juicios.',
    aprendices,
    competencias: Array.from(compMap.values()).sort((a, b) => {
      if (a.esEtapaPractica !== b.esEtapaPractica) return a.esEtapaPractica ? 1 : -1;
      return b.porEvaluar + b.noAprobados - (a.porEvaluar + a.noAprobados);
    }),
    grupos: Array.from(grupoMap.values()).sort((a, b) => a.grupo.localeCompare(b.grupo, 'es')),
    totalesFicha: {
      totalAprendices: aprendices.length,
      totalDisponibles: aprendices.filter((a) => a.esDisponible).length,
      totalJuicios,
      aprobados,
      noAprobados,
      porEvaluar,
      otros,
    },
  };
}
