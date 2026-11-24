import * as XLSX from 'xlsx';

const COMPETENCIAS_LECTIVAS = [
  {
    competencia: '220501093 - EVALUAR REQUISITOS DE LA SOLUCIÓN DE SOFTWARE DE ACUERDO CON METODOLOGÍAS DE ANÁLISIS Y ESTÁNDARES.',
    raps: [
      'RAP 1: CARACTERIZAR LOS PROCESOS DE LA ORGANIZACIÓN DE ACUERDO CON EL SOFTWARE A CONSTRUIR.',
      'RAP 2: RECOLECTAR INFORMACIÓN DEL SOFTWARE A CONSTRUIR DE ACUERDO CON LAS NECESIDADES DEL CLIENTE.',
    ],
  },
  {
    competencia: '220501096 - DESARROLLAR LA SOLUCIÓN DE SOFTWARE DE ACUERDO CON EL DISEÑO Y METODOLOGÍAS DE DESARROLLO.',
    raps: [
      'RAP 3: PLANEAR ACTIVIDADES DE CONSTRUCCIÓN DEL SOFTWARE DE ACUERDO CON EL DISEÑO ESTABLECIDO.',
      'RAP 4: CONSTRUIR EL SOFTWARE A PARTIR DE LA INTEGRACIÓN DE SUS MÓDULOS COMPONENTES.',
      'RAP 5: REALIZAR LA CODIFICACIÓN DE LOS MÓDULOS DEL SISTEMA DE ACUERDO CON EL DISEÑO.',
    ],
  },
  {
    competencia: '240201526 - ENRIQUECER PROCESOS COMUNICATIVOS EN CONTEXTOS SOCIALES Y PRODUCTIVOS.',
    raps: [
      'RAP 6: ANALIZAR LOS COMPONENTES DE LA COMUNICACIÓN SEGÚN SUS CARACTERÍSTICAS Y CONTEXTO.',
      'RAP 7: ARGUMENTAR EN FORMA ORAL Y ESCRITA ATENDIENDO LAS EXIGENCIAS DEL CONTEXTO.',
    ],
  },
];

const COMPETENCIA_PRACTICA = {
  competencia: '999999999 - RESULTADOS DE APRENDIZAJE ETAPA PRACTICA',
  raps: [
    'RAP 8: APLICAR EN LA RESOLUCIÓN DE PROBLEMAS REALES DEL SECTOR PRODUCTIVO LOS CONOCIMIENTOS, HABILIDADES Y DESTREZAS PERTINENTES A LAS COMPETENCIAS DEL PROGRAMA.',
  ],
};

interface SampleLearner {
  tipoDoc: string;
  numDoc: string;
  nombre: string;
  apellidos: string;
  estado: string;
  grupo: string;
  direccion: string;
  municipio: string;
  correo: string;
  telefono: string;
  fechaGrabacion: string;
  pattern: 'DISPONIBLE' | 'PENDIENTE_LECTIVA' | 'NO_APROBADO' | 'YA_CERTIFICADO';
}

const SAMPLE_LEARNERS: SampleLearner[] = [
  {
    tipoDoc: 'CC',
    numDoc: '1004829310',
    nombre: 'VALENTINA',
    apellidos: 'MENDOZA RÍOS',
    estado: 'EN FORMACIÓN',
    grupo: 'Grupo A · Ficha 2894512',
    direccion: 'Cra 45 # 52-18 Apto 301',
    municipio: 'Medellín',
    correo: 'valentina.mendoza@soy.sena.edu.co',
    telefono: '3114582910',
    fechaGrabacion: '18/02/2025',
    pattern: 'DISPONIBLE',
  },
  {
    tipoDoc: 'CC',
    numDoc: '1023948112',
    nombre: 'SANTIAGO',
    apellidos: 'CARDONA VELÁSQUEZ',
    estado: 'EN FORMACIÓN',
    grupo: 'Grupo A · Ficha 2894512',
    direccion: 'Cl 33 Sur # 28-14',
    municipio: 'Envigado',
    correo: 'santiago.cardona@soy.sena.edu.co',
    telefono: '3159023341',
    fechaGrabacion: '18/02/2025',
    pattern: 'DISPONIBLE',
  },
  {
    tipoDoc: 'TI',
    numDoc: '1098745120',
    nombre: 'CAMILA ANDREA',
    apellidos: 'RESTREPO GÓMEZ',
    estado: 'EN FORMACIÓN',
    grupo: 'Grupo B · Ficha 2894512',
    direccion: 'Cra 70 # 12-45',
    municipio: 'Bello',
    correo: 'camila.restrepo@soy.sena.edu.co',
    telefono: '3204418273',
    fechaGrabacion: '19/02/2025',
    pattern: 'PENDIENTE_LECTIVA',
  },
  {
    tipoDoc: 'CC',
    numDoc: '1014289543',
    nombre: 'MATEO',
    apellidos: 'LÓPEZ QUINTERO',
    estado: 'EN FORMACIÓN',
    grupo: 'Grupo A · Ficha 2894512',
    direccion: 'Cl 80 # 65-22',
    municipio: 'Itagüí',
    correo: 'mateo.lopez@soy.sena.edu.co',
    telefono: '3008912234',
    fechaGrabacion: '18/02/2025',
    pattern: 'NO_APROBADO',
  },
  {
    tipoDoc: 'CC',
    numDoc: '1032498761',
    nombre: 'LAURA SOFÍA',
    apellidos: 'MARTÍNEZ PARRA',
    estado: 'EN FORMACIÓN',
    grupo: 'Grupo B · Ficha 2894512',
    direccion: 'Av Poblado # 14-89',
    municipio: 'Medellín',
    correo: 'laura.martinez@soy.sena.edu.co',
    telefono: '3187729011',
    fechaGrabacion: '19/02/2025',
    pattern: 'DISPONIBLE',
  },
  {
    tipoDoc: 'CC',
    numDoc: '1007654321',
    nombre: 'JUAN SEBASTIÁN',
    apellidos: 'TORRES HERRERA',
    estado: 'EN FORMACIÓN',
    grupo: 'Grupo B · Ficha 2894512',
    direccion: 'Cra 52 # 40-10',
    municipio: 'Sabaneta',
    correo: 'juan.torres@soy.sena.edu.co',
    telefono: '3126645109',
    fechaGrabacion: '20/02/2025',
    pattern: 'PENDIENTE_LECTIVA',
  },
  {
    tipoDoc: 'CC',
    numDoc: '1045678912',
    nombre: 'ISABELLA',
    apellidos: 'RODRÍGUEZ SILVA',
    estado: 'POR CERTIFICAR',
    grupo: 'Grupo A · Ficha 2894512',
    direccion: 'Cl 10 # 32-54',
    municipio: 'Medellín',
    correo: 'isabella.rodriguez@soy.sena.edu.co',
    telefono: '3143301928',
    fechaGrabacion: '18/02/2025',
    pattern: 'YA_CERTIFICADO',
  },
  {
    tipoDoc: 'CC',
    numDoc: '1053829104',
    nombre: 'DANIEL FELIPE',
    apellidos: 'VARGAS CASTRO',
    estado: 'EN FORMACIÓN',
    grupo: 'Grupo B · Ficha 2894512',
    direccion: 'Cra 81 # 48B-12',
    municipio: 'La Estrella',
    correo: 'daniel.vargas@soy.sena.edu.co',
    telefono: '3179941280',
    fechaGrabacion: '19/02/2025',
    pattern: 'DISPONIBLE',
  },
  {
    tipoDoc: 'CC',
    numDoc: '1019082734',
    nombre: 'MARIANA',
    apellidos: 'OSPINA SALAZAR',
    estado: 'EN FORMACIÓN',
    grupo: 'Grupo A · Ficha 2894512',
    direccion: 'Cl 50 # 49-30',
    municipio: 'Rionegro',
    correo: 'mariana.ospina@soy.sena.edu.co',
    telefono: '3014429182',
    fechaGrabacion: '20/02/2025',
    pattern: 'NO_APROBADO',
  },
  {
    tipoDoc: 'TI',
    numDoc: '1088341290',
    nombre: 'NICOLÁS',
    apellidos: 'RAMÍREZ BENÍTEZ',
    estado: 'EN FORMACIÓN',
    grupo: 'Grupo B · Ficha 2894512',
    direccion: 'Cra 64 # 96-11',
    municipio: 'Copacabana',
    correo: 'nicolas.ramirez@soy.sena.edu.co',
    telefono: '3162209844',
    fechaGrabacion: '20/02/2025',
    pattern: 'PENDIENTE_LECTIVA',
  },
];

export function buildSampleWorkbookBuffer(): ArrayBuffer {
  const sheetRows: unknown[][] = [
    ['REPORTE DE JUICIOS DE EVALUACIÓN', '', '', '', '', '', '', ''],
    ['Fecha del Reporte:', '19/11/2026', '', 'Estado:', 'EN EJECUCIÓN', '', '', ''],
    ['Ficha de Caracterización:', '2894512', '', 'Regional:', 'ANTIOQUIA', '', '', ''],
    ['Programa:', 'ANÁLISIS Y DESARROLLO DE SOFTWARE (228118)', '', 'Centro:', 'CENTRO DE SERVICIOS Y GESTIÓN EMPRESARIAL', '', '', ''],
    ['Modalidad:', 'PRESENCIAL', '', 'Grupo:', 'Ficha 2894512 - Jornada Diurna', '', '', ''],
    [],
    ['Información consolidada de juicios evaluativos por aprendiz y competencia.'],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    // Row 16 ("Fila P" = index 15): Header row with Col B = Número de Documento and Col P = Grupo
    [
      'Tipo de Documento',
      'Número de Documento',
      'Nombre',
      'Apellidos',
      'Estado',
      'Competencia',
      'Resultado de Aprendizaje',
      'Juicio de Evaluación',
      'Fecha y Hora del Juicio',
      'Funcionario que registro el juicio evaluativo',
      'Correo Electrónico',
      'Teléfono',
      'Dirección',
      'Municipio',
      'Fecha Grabación',
      'Grupo',
    ],
  ];

  for (const learner of SAMPLE_LEARNERS) {
    let rapIndex = 0;
    for (const comp of COMPETENCIAS_LECTIVAS) {
      for (const rap of comp.raps) {
        rapIndex++;
        let juicio = 'APROBADO';
        let fecha = '14/10/2026';
        let funcionario = 'CARLOS ALBERTO PÉREZ';

        if (learner.pattern === 'PENDIENTE_LECTIVA' && rapIndex >= 6) {
          juicio = 'POR EVALUAR';
          fecha = '';
          funcionario = '';
        } else if (learner.pattern === 'NO_APROBADO' && rapIndex === 4) {
          juicio = 'NO APROBADO';
          fecha = '02/11/2026';
          funcionario = 'MARÍA FERNANDA DÍAZ';
        } else if (learner.pattern === 'NO_APROBADO' && rapIndex === 7) {
          juicio = 'POR EVALUAR';
          fecha = '';
          funcionario = '';
        }

        sheetRows.push([
          learner.tipoDoc,
          learner.numDoc,
          learner.nombre,
          learner.apellidos,
          learner.estado,
          comp.competencia,
          rap,
          juicio,
          fecha,
          funcionario,
          learner.correo,
          learner.telefono,
          learner.direccion,
          learner.municipio,
          learner.fechaGrabacion,
          learner.grupo,
        ]);
      }
    }

    // Etapa Práctica row
    const practicaJuicio = learner.pattern === 'YA_CERTIFICADO' ? 'APROBADO' : 'POR EVALUAR';
    sheetRows.push([
      learner.tipoDoc,
      learner.numDoc,
      learner.nombre,
      learner.apellidos,
      learner.estado,
      COMPETENCIA_PRACTICA.competencia,
      COMPETENCIA_PRACTICA.raps[0],
      practicaJuicio,
      practicaJuicio === 'APROBADO' ? '15/11/2026' : '',
      practicaJuicio === 'APROBADO' ? 'COORDINACIÓN ACADÉMICA' : '',
      learner.correo,
      learner.telefono,
      learner.direccion,
      learner.municipio,
      learner.fechaGrabacion,
      learner.grupo,
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte Juicios');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out as ArrayBuffer;
}

export function buildSampleRosterWorkbookBuffer(): ArrayBuffer {
  const rows: unknown[][] = [
    ['LISTADO DE APRENDICES POR FICHA'],
    ['Ficha de Caracterización:', '2894512'],
    ['Programa:', 'ANÁLISIS Y DESARROLLO DE SOFTWARE (228118)'],
    [],
    [
      'Tipo de Documento',
      'Número de Documento',
      'Nombre',
      'Apellidos',
      'Estado',
      'Grupo',
      'Dirección',
      'Teléfono',
      'Correo Electrónico',
      'Municipio',
      'Fecha Grabación',
    ],
    ...SAMPLE_LEARNERS.map((l) => [
      l.tipoDoc,
      l.numDoc,
      l.nombre,
      l.apellidos,
      l.estado,
      l.grupo,
      l.direccion,
      l.telefono,
      l.correo,
      l.municipio,
      l.fechaGrabacion,
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Aprendices');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out as ArrayBuffer;
}

export function downloadSampleWorkbook(): void {
  const buffer = buildSampleWorkbookBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Reporte_Juicios_Ficha_2894512_Ejemplo.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
