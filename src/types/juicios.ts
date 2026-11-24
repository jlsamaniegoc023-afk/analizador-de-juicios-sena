export type JuicioEstado = 'APROBADO' | 'NO_APROBADO' | 'POR_EVALUAR' | 'OTRO';

export type FichaMatchState =
  | 'MATCHED'
  | 'MISSING_JUICIOS'
  | 'MISMATCH'
  | 'MISSING_FICHA_IN_JUICIOS';

export interface JuicioRow {
  rowNumber: number;
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  apellidos: string;
  estadoAprendiz: string;
  competencia: string;
  resultadoAprendizaje: string;
  juicioRaw: string;
  juicioEstado: JuicioEstado;
  fechaJuicio: string;
  funcionario: string;
  grupo: string;
  esEtapaPractica: boolean;
  extraFields: Record<string, string>;
}

export interface AprendizPerfil {
  direccion: string;
  telefono: string;
  correoElectronico: string;
  municipio: string;
  fechaGrabacion: string;
  especialidad: string;
}

export interface AprendizBaseRecord {
  numeroDocumento: string;
  tipoDocumento: string;
  nombre: string;
  apellidos: string;
  nombreCompleto: string;
  estadoAprendiz: string;
  grupo: string;
  ficha: string;
  perfil: AprendizPerfil;
  extraInfo: Record<string, string>;
}

export interface AprendicesRosterResult {
  fileName: string;
  sheetName: string;
  headerRowNumber: number;
  fichaDetectada: string;
  programa: string;
  fechaGrabacion: string;
  aprendices: AprendizBaseRecord[];
  availableSheets: string[];
  headers: string[];
  documentoColIndex: number;
  configUsed: {
    sheetName: string;
    headerRowIndex: number | null;
    documentoColIndex: number | null;
  };
  warnings: string[];
}

export interface AprendizResumen {
  numeroDocumento: string;
  tipoDocumento: string;
  nombre: string;
  apellidos: string;
  nombreCompleto: string;
  estadoAprendiz: string;
  grupo: string;
  ficha?: string;
  archivoOrigen?: string;
  programaFormacion?: string;
  modalidadFormacion?: string;
  fechaInicioFicha?: string;
  fechaFinFicha?: string;
  perfil: AprendizPerfil;
  extraInfo: Record<string, string>;
  totalJuicios: number;
  aprobados: number;
  noAprobados: number;
  porEvaluar: number;
  otros: number;
  etapaPracticaTotal: number;
  etapaPracticaPorEvaluar: number;
  etapaPracticaAprobados: number;
  lectivaPorEvaluar: number;
  juiciosVerificados: boolean;
  encontradoEnJuicios: boolean;
  esDisponible: boolean;
  razonDisponibilidad: string;
  juicios: JuicioRow[];
}

export interface CompetenciaResumen {
  competencia: string;
  esEtapaPractica: boolean;
  totalJuicios: number;
  aprobados: number;
  noAprobados: number;
  porEvaluar: number;
}

export interface GrupoResumen {
  grupo: string;
  denominacion?: string;
  modalidadFormacion?: string;
  fechaInicio?: string;
  fechaFin?: string;
  fechaReporte?: string;
  totalAprendices: number;
  disponibles: number;
  aprobados: number;
  noAprobados: number;
  porEvaluar: number;
  totalJuicios: number;
}

export interface FichaMetadata {
  fileName: string;
  sheetName: string;
  headerRowNumber: number;
  ficha: string;
  programa: string;
  denominacion?: string;
  modalidadFormacion?: string;
  estadoFicha: string;
  fechaInicio?: string;
  fechaFin?: string;
  fechaReporte: string;
  fechaGrabacion: string;
  regional: string;
  centro: string;
  grupoGeneral: string;
  extraMetadata: Array<{ label: string; value: string }>;
}

export interface ColumnMapping {
  tipoDocumento: number;
  numeroDocumento: number;
  nombre: number;
  apellidos: number;
  estado: number;
  competencia: number;
  resultadoAprendizaje: number;
  juicio: number;
  grupo: number;
  fechaJuicio: number;
  funcionario: number;
}

export interface SheetParseConfig {
  sheetName: string;
  headerRowIndex: number | null;
  documentoColIndex: number;
  grupoColIndex: number | null;
}

export interface WorkbookAnalysis {
  metadata: FichaMetadata;
  aprendices: AprendizResumen[];
  competencias: CompetenciaResumen[];
  grupos: GrupoResumen[];
  totalesFicha: {
    totalAprendices: number;
    totalDisponibles: number;
    totalJuicios: number;
    aprobados: number;
    noAprobados: number;
    porEvaluar: number;
    otros: number;
  };
  availableSheets: string[];
  headers: string[];
  columnMapping: ColumnMapping;
  configUsed: SheetParseConfig;
  warnings: string[];
}

export interface FichaValidationResult {
  matchState: FichaMatchState;
  canShowResumen: boolean;
  expectedFicha: string;
  juiciosFicha: string;
  mensajeValidacion: string;
  aprendices: AprendizResumen[];
  competencias: CompetenciaResumen[];
  grupos: GrupoResumen[];
  totalesFicha: {
    totalAprendices: number;
    totalDisponibles: number;
    totalJuicios: number;
    aprobados: number;
    noAprobados: number;
    porEvaluar: number;
    otros: number;
  };
}
