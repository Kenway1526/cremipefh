import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';
import { NotificacionService } from 'src/app/services/notificacion.service';

export interface EmpleadoCompleto {
  id?: string;
  foto_drive_url?: string;
  nombre_completo: string;
  puesto_titulo?: string;
  correo_laboral?: string;
  celular?: string;
  estatus: 'activo' | 'baja' | 'incapacidad' | 'permiso';
  plantel_alta: string;
  fecha_ingreso?: string;
  alta_nomina?: string;
  expediente_digital_url?: string;
  interplanteles: boolean;

  departamento?: string;
  puesto?: string;
  gerente_id?: string | null;
  horario_lunes?: string;
  horario_martes?: string;
  horario_miercoles?: string;
  horario_jueves?: string;
  horario_viernes?: string;
  notas_trabajo?: string;

  correo_privado?: string;
  cuenta_bancaria?: string;
  clabe_interbancaria?: string;
  usuario_plataforma?: string;
  password_plataforma?: string;
  nip_checador?: string;
  checador_asignado?: string;      // En interplantel se guardan separados por coma
  fecha_nacimiento?: string;
  lugar_nacimiento_ciudad?: string;
  lugar_nacimiento_pais?: string;
  sexo?: string;
  nacionalidad?: string;
  curp?: string;
  rfc?: string;
  nss?: string;
  numero_pasaporte?: string;
  estado_civil?: string;

  emergencia1_nombre?: string;
  emergencia1_parentesco?: string;
  emergencia1_telefono?: string;
  emergencia1_correo?: string;
  emergencia2_nombre?: string;
  emergencia2_parentesco?: string;
  emergencia2_telefono?: string;
  emergencia2_correo?: string;

  domicilio_calle?: string;
  domicilio_colonia?: string;
  domicilio_municipio?: string;
  domicilio_cp?: string;
  domicilio_estado?: string;
  domicilio_pais?: string;

  estudio_tecnica_nombre?: string;
  estudio_licenciatura_nombre?: string;
  estudio_maestria_nombre?: string;
  estudio_doctorado_nombre?: string;

  tipo_puesto_nomina?: string;
  modalidad_contrato?: string;
  horas_semanales?: number;
  salario_base?: number;
  salario_complemento?: number;
  horas_frente_grupo?: number;
}

@Component({
  selector: 'app-empleados-view',
  templateUrl: './empleados-view.component.html',
  styleUrls: ['./empleados-view.component.css']
})
export class EmpleadosViewComponent implements OnInit {

  public plantelActual: string = 'toluca';
  public vistaActiva: 'kanban' | 'lista' | 'organigrama' = 'kanban';
  public tabActiva: 'trabajo' | 'personal' | 'nomina' = 'trabajo';

  public empleados: EmpleadoCompleto[] = [];
  public terminoBusqueda: string = '';
  public modoFormulario: boolean = false;
  public empleadoForm: EmpleadoCompleto = this.modeloInicial();

  // Catálogos de checadores por plantel
  public catalogoChecadores: Record<string, { id: string; label: string }[]> = {
    'toluca': [
      { id: 'secundaria', label: 'Secundaria Toluca' },
      { id: 'oficinas', label: 'Oficinas Toluca' }
    ],
    'aeropuerto': [
      { id: 'hacienda', label: 'Aero Hacienda' },
      { id: 'esquina', label: 'Aero Esquina' }
    ],
    'calimaya': [
      { id: 'calimaya', label: 'Plantel Calimaya' }
    ]
  };

  // Estado para el Calendario Desplegable
  public showDatePicker: boolean = false;
  public campoFechaActivo: 'ingreso' | 'alta' | 'nacimiento' | null = null;
  public anioActual: number = new Date().getFullYear();
  public mesActual: number = new Date().getMonth(); // 0-11
  public aniosDisponibles: number[] = [];
  public mesesDisponibles = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  public diasCalendario: (number | null)[] = [];

  // Estado para el Time Picker de Horarios
  public showTimePicker: boolean = false;
  public campoDiaActivo: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | null = null;
  public horaEntrada: string = '07:00';
  public horaSalida: string = '15:00';
  public horasLista: string[] = [];
  public minutosLista: string[] = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  private supabase: SupabaseClient;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private notificacion: NotificacionService
  ) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.generarAniosDisponibles();
    this.generarHorasLista();
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.plantelActual = (params['plantelId'] || 'toluca').toLowerCase();
      this.cargarEmpleados();
    });
  }

  private generarAniosDisponibles(): void {
    const tope = new Date().getFullYear() + 2;
    for (let y = tope; y >= 1950; y--) {
      this.aniosDisponibles.push(y);
    }
  }

  private generarHorasLista(): void {
    for (let h = 6; h <= 22; h++) {
      this.horasLista.push(h.toString().padStart(2, '0'));
    }
  }

  public async cargarEmpleados(): Promise<void> {
    try {
      // Regla: Carga empleados del plantel O cualquiera marcado como interplantel
      const { data, error } = await this.supabase
        .from('empleados')
        .select('*')
        .or(`plantel_alta.eq.${this.plantelActual},interplanteles.eq.true`)
        .order('nombre_completo', { ascending: true });

      if (error) throw error;
      this.empleados = data || [];
    } catch (err: any) {
      this.notificacion.mostrar('Error al cargar directorio: ' + err.message, 'error');
    }
  }

  public get checadoresDisponibles(): { id: string; label: string }[] {
    if (this.empleadoForm?.interplanteles) {
      return Object.values(this.catalogoChecadores).flat();
    }
    const plantel = (this.empleadoForm?.plantel_alta || this.plantelActual || 'toluca').toLowerCase();
    return this.catalogoChecadores[plantel] || [];
  }

  public checadorEstaSeleccionado(id: string): boolean {
    if (!id || !this.empleadoForm?.checador_asignado) return false;
    const array = this.empleadoForm.checador_asignado.split(',').map(s => s.trim());
    return array.includes(id);
  }

  public toggleChecador(id: string): void {
    if (!this.empleadoForm.interplanteles) {
      this.empleadoForm.checador_asignado = id;
      return;
    }
    let lista = this.empleadoForm.checador_asignado 
      ? this.empleadoForm.checador_asignado.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    if (lista.includes(id)) {
      lista = lista.filter(x => x !== id);
    } else {
      lista.push(id);
    }
    this.empleadoForm.checador_asignado = lista.join(', ');
  }

  // --- CALENDARIO PERSONALIZADO ---
  public abrirCalendario(campo: 'ingreso' | 'alta' | 'nacimiento'): void {
    this.campoFechaActivo = campo;
    let fechaBase = new Date();
    const val = campo === 'ingreso' ? this.empleadoForm.fecha_ingreso :
                campo === 'alta' ? this.empleadoForm.alta_nomina :
                this.empleadoForm.fecha_nacimiento;

    if (val) {
      const parts = val.split('-');
      if (parts.length === 3) {
        fechaBase = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
    }
    this.anioActual = fechaBase.getFullYear();
    this.mesActual = fechaBase.getMonth();
    this.construirMatrizMes();
    this.showDatePicker = true;
  }

  public construirMatrizMes(): void {
    this.diasCalendario = [];
    const primerDiaSemana = new Date(this.anioActual, this.mesActual, 1).getDay();
    // Ajustar para iniciar en lunes: 0 (domingo) -> 6, 1 (lunes) -> 0
    const desfase = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1;

    for (let i = 0; i < desfase; i++) {
      this.diasCalendario.push(null);
    }

    const totalDias = new Date(this.anioActual, this.mesActual + 1, 0).getDate();
    for (let d = 1; d <= totalDias; d++) {
      this.diasCalendario.push(d);
    }
  }

  public seleccionarDia(dia: number | null): void {
    if (!dia || !this.campoFechaActivo) return;
    const m = (this.mesActual + 1).toString().padStart(2, '0');
    const d = dia.toString().padStart(2, '0');
    const formatted = `${this.anioActual}-${m}-${d}`;

    if (this.campoFechaActivo === 'ingreso') this.empleadoForm.fecha_ingreso = formatted;
    if (this.campoFechaActivo === 'alta') this.empleadoForm.alta_nomina = formatted;
    if (this.campoFechaActivo === 'nacimiento') this.empleadoForm.fecha_nacimiento = formatted;

    this.showDatePicker = false;
  }

  // --- TIME PICKER PERSONALIZADO ---
  public abrirTimePicker(dia: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes'): void {
    this.campoDiaActivo = dia;
    const valor = this.empleadoForm[`horario_${dia}`];
    if (valor && valor.includes(' - ')) {
      const parts = valor.split(' - ');
      this.horaEntrada = parts[0];
      this.horaSalida = parts[1];
    } else {
      this.horaEntrada = '07:00';
      this.horaSalida = '15:00';
    }
    this.showTimePicker = true;
  }

  public guardarHorario(): void {
    if (this.campoDiaActivo) {
      this.empleadoForm[`horario_${this.campoDiaActivo}`] = `${this.horaEntrada} - ${this.horaSalida}`;
    }
    this.showTimePicker = false;
  }

  // --- FORMULARIO Y VALIDACIONES ---
  public get empleadosFiltrados(): EmpleadoCompleto[] {
    if (!this.terminoBusqueda.trim()) return this.empleados;
    const q = this.terminoBusqueda.toLowerCase();
    return this.empleados.filter(e =>
      e.nombre_completo?.toLowerCase().includes(q) ||
      e.departamento?.toLowerCase().includes(q) ||
      e.puesto_titulo?.toLowerCase().includes(q) ||
      e.curp?.toLowerCase().includes(q)
    );
  }

  public get empleadosDisponiblesParaJefe(): EmpleadoCompleto[] {
    return this.empleados.filter(e => e.id !== this.empleadoForm.id);
  }

  public getJefes(): EmpleadoCompleto[] {
    return this.empleados.filter(e => !e.gerente_id);
  }

  public getSubordinados(jefeId?: string): EmpleadoCompleto[] {
    if (!jefeId) return [];
    return this.empleados.filter(e => e.gerente_id === jefeId);
  }

  public abrirFormularioNuevo(): void {
    this.empleadoForm = this.modeloInicial();
    this.tabActiva = 'trabajo';
    this.modoFormulario = true;
  }

  public editarEmpleado(emp: EmpleadoCompleto): void {
    this.empleadoForm = { ...emp };
    this.tabActiva = 'trabajo';
    this.modoFormulario = true;
  }

  public cerrarFormulario(): void {
    this.modoFormulario = false;
    this.showDatePicker = false;
    this.showTimePicker = false;
  }

  public async guardarEmpleado(): Promise<void> {
    const f = this.empleadoForm;

    // 1. Textos alfabéticos
    const regexSoloTexto = /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]+$/;
    if (!f.nombre_completo?.trim() || !regexSoloTexto.test(f.nombre_completo.trim())) {
      this.notificacion.mostrar('El nombre completo es obligatorio y no debe contener números.', 'error');
      return;
    }
    if (f.puesto_titulo && !regexSoloTexto.test(f.puesto_titulo.trim())) {
      this.notificacion.mostrar('El puesto de trabajo no debe contener números ni símbolos.', 'error');
      return;
    }

    // 2. Celular y contactos
    const regex10Dig = /^[0-9]{10}$/;
    if (f.celular && !regex10Dig.test(f.celular.trim())) {
      this.notificacion.mostrar('El celular debe tener exactamente 10 dígitos numéricos.', 'error');
      return;
    }
    if (f.emergencia1_telefono && !regex10Dig.test(f.emergencia1_telefono.trim())) {
      this.notificacion.mostrar('El teléfono del contacto de emergencia 1 debe ser de 10 dígitos.', 'error');
      return;
    }
    if (f.emergencia2_telefono && !regex10Dig.test(f.emergencia2_telefono.trim())) {
      this.notificacion.mostrar('El teléfono del contacto de emergencia 2 debe ser de 10 dígitos.', 'error');
      return;
    }

    // 3. Correos
    const regexEmailDominio = /^[a-zA-Z0-9._%+-]+@ipefh\.edu\.mx$/i;
    const regexEmailGral = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i;

    if (f.correo_laboral && !regexEmailDominio.test(f.correo_laboral.trim())) {
      this.notificacion.mostrar('El correo laboral debe pertenecer al dominio @ipefh.edu.mx', 'error');
      return;
    }

    if (f.correo_privado && !regexEmailGral.test(f.correo_privado.trim())) {
      this.notificacion.mostrar('El formato del correo privado no es válido.', 'error');
      return;
    }

    // 4. Bancarios y NIP
    const regexCuenta = /^[0-9]{10,16}$/;
    if (f.cuenta_bancaria && !regexCuenta.test(f.cuenta_bancaria.trim())) {
      this.notificacion.mostrar('La cuenta bancaria debe contener entre 10 y 16 dígitos numéricos.', 'error');
      return;
    }
    const regexClabe = /^[0-9]{18}$/;
    if (f.clabe_interbancaria && !regexClabe.test(f.clabe_interbancaria.trim())) {
      this.notificacion.mostrar('La CLABE interbancaria debe contener exactamente 18 dígitos.', 'error');
      return;
    }
    const regexNip = /^[0-9]{4,6}$/;
    if (f.nip_checador && !regexNip.test(f.nip_checador.trim())) {
      this.notificacion.mostrar('El NIP del checador debe ser de 4 a 6 dígitos.', 'error');
      return;
    }

    // 5. Identificaciones oficiales
    const regexCurp = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
    if (f.curp && !regexCurp.test(f.curp.trim().toUpperCase())) {
      this.notificacion.mostrar('La CURP no cumple con la estructura oficial de 18 caracteres.', 'error');
      return;
    }
    const regexRfc = /^[A-ZÑ&]{3,4}\d{6}[A-V1-9][A-Z1-9][0-9A]$/;
    if (f.rfc && !regexRfc.test(f.rfc.trim().toUpperCase())) {
      this.notificacion.mostrar('El RFC ingresado no tiene la estructura oficial válida.', 'error');
      return;
    }
    const regexNss = /^[0-9]{11}$/;
    if (f.nss && !regexNss.test(f.nss.trim())) {
      this.notificacion.mostrar('El NSS debe componerse exactamente de 11 dígitos.', 'error');
      return;
    }

    // 6. Validaciones Numéricas (No negativos, límites lógicos)
    if ((f.salario_base ?? 0) < 0 || (f.salario_complemento ?? 0) < 0) {
      this.notificacion.mostrar('Los salarios no pueden ser montos negativos.', 'error');
      return;
    }
    if ((f.salario_base ?? 0) > 999999) {
      this.notificacion.mostrar('El salario base excede el límite permitido.', 'error');
      return;
    }
    if ((f.horas_semanales ?? 0) < 0 || (f.horas_semanales ?? 0) > 60) {
      this.notificacion.mostrar('Las horas laboradas semanales deben estar entre 0 y 60.', 'error');
      return;
    }
    if ((f.horas_frente_grupo ?? 0) < 0 || (f.horas_frente_grupo ?? 0) > 50) {
      this.notificacion.mostrar('Las horas frente a grupo no pueden exceder 50 horas semanales.', 'error');
      return;
    }

    // Normalización de mayúsculas
    f.nombre_completo = f.nombre_completo.trim().toUpperCase();
    if (f.puesto_titulo) f.puesto_titulo = f.puesto_titulo.trim().toUpperCase();
    if (f.curp) f.curp = f.curp.trim().toUpperCase();
    if (f.rfc) f.rfc = f.rfc.trim().toUpperCase();

    try {
      if (f.id) {
        const { error } = await this.supabase
          .from('empleados')
          .update(f)
          .eq('id', f.id);
        if (error) throw error;
        this.notificacion.mostrar('Ficha actualizada correctamente.', 'exito');
      } else {
        const { error } = await this.supabase
          .from('empleados')
          .insert([f]);
        if (error) throw error;
        this.notificacion.mostrar('Colaborador registrado con éxito.', 'exito');
      }

      this.cerrarFormulario();
      await this.cargarEmpleados();
    } catch (err: any) {
      this.notificacion.mostrar('Error al guardar: ' + err.message, 'error');
    }
  }

  public regresarAlHub(): void {
    this.router.navigate(['/hub']);
  }

  private modeloInicial(): EmpleadoCompleto {
    return {
      nombre_completo: '',
      puesto_titulo: '',
      estatus: 'activo',
      plantel_alta: this.plantelActual || 'toluca',
      interplanteles: false,
      checador_asignado: this.catalogoChecadores?.[this.plantelActual]?.[0]?.id || 'secundaria',
      estado_civil: 'soltero',
      tipo_puesto_nomina: 'docente',
      modalidad_contrato: 'tiempo_completo',
      salario_base: 0,
      salario_complemento: 0,
      horas_semanales: 40,
      horas_frente_grupo: 0,
      gerente_id: null
    };
  }
}