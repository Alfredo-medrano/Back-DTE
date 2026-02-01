/**
 * ========================================
 * GENERADOR DE DATOS DE PRUEBA
 * Sistema de Facturación Electrónica - El Salvador
 * ========================================
 * Genera datos aleatorios pero válidos para pruebas de DTEs.
 * Cumple con las especificaciones del Ministerio de Hacienda.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Departamentos y municipios válidos de El Salvador
 * Según catálogos oficiales del MH
 */
const DEPARTAMENTOS_MUNICIPIOS = {
    '06': { nombre: 'San Salvador', municipios: ['01', '02', '03', '04', '05', '06', '14', '15', '16', '17'] },
    '01': { nombre: 'Ahuachapán', municipios: ['01', '02', '03', '04', '05', '12'] },
    '05': { nombre: 'San Miguel', municipios: ['01', '11', '12', '13', '14', '19', '20'] },
    '14': { nombre: 'La Libertad', municipios: ['01', '02', '03', '04', '05', '06', '14', '16', '22'] },
    '07': { nombre: 'Cuscatlán', municipios: ['01', '02', '03', '04', '05', '09', '11', '12', '16'] },
    '03': { nombre: 'Santa Ana', municipios: ['01', '02', '03', '04', '05', '06', '07', '12', '13'] },
};

/**
 * Actividades económicas comunes
 */
const ACTIVIDADES_ECONOMICAS = [
    { codigo: '62020', descripcion: 'CONSULTORIA INFORMATICA' },
    { codigo: '47190', descripcion: 'COMERCIO AL POR MENOR' },
    { codigo: '56101', descripcion: 'RESTAURANTES Y SERVICIOS DE COMIDA' },
    { codigo: '46900', descripcion: 'VENTA AL POR MAYOR NO ESPECIALIZADA' },
    { codigo: '68100', descripcion: 'ACTIVIDADES INMOBILIARIAS' },
    { codigo: '85101', descripcion: 'EDUCACION PREESCOLAR Y PRIMARIA' },
    { codigo: '86201', descripcion: 'SERVICIOS MEDICOS' },
    { codigo: '43110', descripcion: 'DEMOLICION Y PREPARACION DEL TERRENO' },
];

/**
 * Nombres de empresas ficticias
 */
const NOMBRES_EMPRESAS = [
    'COMERCIAL LA UNION S.A. DE C.V.',
    'DISTRIBUIDORA EL PROGRESO',
    'TECNOLOGIA Y SERVICIOS S.A.',
    'ALIMENTOS DELICIOSOS S.A. DE C.V.',
    'CONSTRUCCIONES MODERNAS',
    'FERRETERIA CENTRAL S.A.',
    'CLINICA MEDICA INTEGRAL',
    'AUTOREPUESTOS DEL SUR',
    'PAPELERIA Y SUMINISTROS',
    'TEXTILES Y CONFECCIONES S.A.',
];

/**
 * Nombres de personas ficticias
 */
const NOMBRES_PERSONAS = [
    'JUAN CARLOS MARTINEZ LOPEZ',
    'MARIA ELENA RODRIGUEZ GARCIA',
    'CARLOS ALBERTO HERNANDEZ CRUZ',
    'ANA PATRICIA GOMEZ FLORES',
    'JOSE ROBERTO MORALES SANTOS',
    'ROSA MARIA RAMIREZ ORTIZ',
    'FRANCISCO JAVIER TORRES MENDEZ',
    'SILVIA BEATRIZ CASTILLO RIVAS',
    'ALBERTO ENRIQUE GUTIERREZ RUIZ',
    'CLAUDIA PATRICIA DIAZ MOLINA',
];

/**
 * Productos y servicios de prueba
 */
const PRODUCTOS_SERVICIOS = [
    { tipo: 1, descripcion: 'LAPTOP DELL INSPIRON 15', precio: 650.00 },
    { tipo: 1, descripcion: 'ESCRITORIO DE OFICINA', precio: 250.00 },
    { tipo: 1, descripcion: 'SILLA ERGONOMICA', precio: 180.00 },
    { tipo: 2, descripcion: 'SERVICIO DE CONSULTORIA', precio: 500.00 },
    { tipo: 2, descripcion: 'SERVICIO DE MANTENIMIENTO', precio: 150.00 },
    { tipo: 1, descripcion: 'CABLES HDMI 2M', precio: 12.50 },
    { tipo: 1, descripcion: 'TECLADO MECANICO RGB', precio: 85.00 },
    { tipo: 1, descripcion: 'MONITOR LED 24 PULGADAS', precio: 220.00 },
    { tipo: 2, descripcion: 'SERVICIO DE INSTALACION', precio: 75.00 },
    { tipo: 1, descripcion: 'MOUSE INALAMBRICO', precio: 25.00 },
];

/**
 * Genera un NIT válido de 14 dígitos para pruebas
 */
const generarNITPrueba = () => {
    // Genera un NIT ficticio de 14 dígitos
    const parte1 = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const parte2 = Math.floor(Math.random() * 100000).toString().padStart(6, '0');
    const parte3 = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const verificador = Math.floor(Math.random() * 10);

    return `${parte1}${parte2}${parte3}${verificador}`;
};

/**
 * Genera un DUI válido de prueba
 */
const generarDUIPrueba = () => {
    const parte1 = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    const verificador = Math.floor(Math.random() * 10);

    return `${parte1}-${verificador}`;
};

/**
 * Obtiene un departamento y municipio aleatorio
 */
const obtenerDireccionAleatoria = () => {
    const departamentos = Object.keys(DEPARTAMENTOS_MUNICIPIOS);
    const deptoKey = departamentos[Math.floor(Math.random() * departamentos.length)];
    const depto = DEPARTAMENTOS_MUNICIPIOS[deptoKey];
    const municipio = depto.municipios[Math.floor(Math.random() * depto.municipios.length)];

    const calles = ['CALLE PRINCIPAL', 'AVENIDA LIMA', 'BOULEVARD CONSTITUCION', 'PASAJE LAS FLORES', 'COLONIA ESCALON'];
    const complemento = calles[Math.floor(Math.random() * calles.length)];

    return {
        departamento: deptoKey,
        municipio: municipio,
        complemento: complemento,
    };
};

/**
 * Genera datos de emisor de prueba
 */
const generarEmisor = (nitReal = null) => {
    const actividad = ACTIVIDADES_ECONOMICAS[Math.floor(Math.random() * ACTIVIDADES_ECONOMICAS.length)];
    const nombre = NOMBRES_EMPRESAS[Math.floor(Math.random() * NOMBRES_EMPRESAS.length)];

    return {
        nit: nitReal || generarNITPrueba(),
        nrc: Math.floor(Math.random() * 1000000).toString().padStart(6, '0'),
        nombre: nombre,
        codActividad: actividad.codigo,
        descActividad: actividad.descripcion,
        nombreComercial: nombre,
        tipoEstablecimiento: '01',
        direccion: obtenerDireccionAleatoria(),
        telefono: `2${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
        correo: `${nombre.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10)}@prueba.com`,
    };
};

/**
 * Genera datos de receptor (cliente) de prueba
 */
const generarReceptor = (tipoDocumento = '36') => {
    const esPersona = Math.random() > 0.5;

    const datos = {
        tipoDocumento: tipoDocumento, // 36=NIT, 13=DUI, 37=Otro
        numDocumento: tipoDocumento === '36' ? generarNITPrueba() : generarDUIPrueba(),
        nombre: esPersona
            ? NOMBRES_PERSONAS[Math.floor(Math.random() * NOMBRES_PERSONAS.length)]
            : NOMBRES_EMPRESAS[Math.floor(Math.random() * NOMBRES_EMPRESAS.length)],
        direccion: obtenerDireccionAleatoria(),
        telefono: `2${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
        correo: `cliente${Math.floor(Math.random() * 1000)}@test.com`,
    };

    // NRC solo para empresas con NIT
    if (tipoDocumento === '36' && !esPersona) {
        datos.nrc = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    }

    return datos;
};

/**
 * Genera items/productos aleatorios
 */
const generarItems = (cantidad = null) => {
    const numItems = cantidad || Math.floor(Math.random() * 5) + 1; // 1-5 items
    const items = [];

    for (let i = 0; i < numItems; i++) {
        const producto = PRODUCTOS_SERVICIOS[Math.floor(Math.random() * PRODUCTOS_SERVICIOS.length)];
        const cant = Math.floor(Math.random() * 10) + 1; // 1-10 unidades

        items.push({
            numItem: i + 1,
            tipoItem: producto.tipo, // 1=Bien, 2=Servicio
            cantidad: cant,
            codigo: `PROD-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
            descripcion: producto.descripcion,
            precioUni: producto.precio,
            montoDescu: 0,
            ventaNoSuj: 0,
            ventaExenta: 0,
            ventaGravada: producto.precio * cant,
            uniMedida: producto.tipo === 1 ? 59 : 99, // 59=Unidad, 99=Servicio
        });
    }

    return items;
};

/**
 * Genera un correo electrónico aleatorio válido
 */
const generarCorreo = () => {
    const prefijos = ['prueba', 'test', 'cliente', 'empresa', 'contacto', 'info'];
    const dominios = ['test.com', 'prueba.com', 'ejemplo.com', 'demo.sv'];

    const prefijo = prefijos[Math.floor(Math.random() * prefijos.length)];
    const numero = Math.floor(Math.random() * 1000);
    const dominio = dominios[Math.floor(Math.random() * dominios.length)];

    return `${prefijo}${numero}@${dominio}`;
};

/**
 * Genera un teléfono válido de El Salvador
 */
const generarTelefono = () => {
    // El Salvador: 2XXX-XXXX (fijo) o 6XXX-XXXX / 7XXX-XXXX (móvil)
    const prefijo = Math.random() > 0.5 ? '2' : (Math.random() > 0.5 ? '6' : '7');
    const numero = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');

    return `${prefijo}${numero}`;
};

/**
 * Obtiene una actividad económica aleatoria
 */
const obtenerActividadAleatoria = () => {
    return ACTIVIDADES_ECONOMICAS[Math.floor(Math.random() * ACTIVIDADES_ECONOMICAS.length)];
};

/**
 * Genera un número de control único para pruebas
 */
const generarNumeroControlPrueba = (tipoDte, correlativo) => {
    const ambiente = '00'; // Pruebas
    const anio = new Date().getFullYear().toString().slice(-2);
    const serie = 'TEST';
    const numero = correlativo.toString().padStart(15, '0');

    return `DTE-${tipoDte}-${ambiente}-${anio}-${numero}`;
};

module.exports = {
    generarNITPrueba,
    generarDUIPrueba,
    obtenerDireccionAleatoria,
    generarEmisor,
    generarReceptor,
    generarItems,
    generarCorreo,
    generarTelefono,
    obtenerActividadAleatoria,
    generarNumeroControlPrueba,

    // Exportar catálogos para uso directo
    DEPARTAMENTOS_MUNICIPIOS,
    ACTIVIDADES_ECONOMICAS,
    NOMBRES_EMPRESAS,
    NOMBRES_PERSONAS,
    PRODUCTOS_SERVICIOS,
};
