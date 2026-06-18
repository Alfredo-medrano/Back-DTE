# Sistema de Facturación Electrónica - El Salvador (DTE)

Middleware de integración con la API del Ministerio de Hacienda de El Salvador para la emisión de Documentos Tributarios Electrónicos (DTE).

## 📋 Descripción

Este proyecto implementa un middleware completo para la generación, firma y transmisión de Documentos Tributarios Electrónicos según las especificaciones técnicas del Ministerio de Hacienda de El Salvador.

### Características Principales

- ✅ Autenticación con API del Ministerio de Hacienda
- ✅ Firma electrónica de documentos mediante Docker (SVFE Firmador)
- ✅ Soporte para múltiples tipos de DTE
- ✅ Sistema de pruebas automatizadas
- ✅ Generación automática de códigos de control
- ✅ Cálculo automático de IVA y totales
- ✅ Manejo de contingencias e invalidaciones

## 🏛️ Tipos de DTE Soportados

Según los requisitos del Ministerio de Hacienda, este sistema soporta:

| Código | Tipo de Documento | Pruebas Requeridas |
|--------|-------------------|-------------------|
| 01 | Factura Electrónica | 90 |
| 03 | Comprobante de Crédito Fiscal (CCF) | 75 |
| 04 | Nota de Remisión | 25 |
| 05 | Nota de Crédito | 50 |
| 06 | Nota de Débito | 25 |
| 11 | Factura de Exportación | 25 |
| 14 | Factura de Sujeto Excluido | 25 |

Además, se requieren:
- **5+ pruebas** de Invalidación de documentos
- **Pruebas** de Contingencia

## 🚀 Requisitos Previos

### Software Necesario

1. **Node.js** v14 o superior
2. **Docker** Desktop (para el firmador SVFE)
3. **npm** (incluido con Node.js)

### Credenciales del Ministerio de Hacienda

Debes tener:
- NIT del emisor
- Clave API (proporcionada por MH)
- Clave Pública
- Clave Privada
- Acceso al ambiente de pruebas del MH

## 📦 Instalación

### 1. Clonar o descargar el proyecto

```bash
cd d:\TU\RUTA
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Edita el archivo `.env` con tus credenciales:

```env
# Puerto del servidor Node.js
PORT=3000

# URL del Firmador Docker (interno)
DOCKER_FIRMADOR_URL=http://localhost:8113

# URLs API Ministerio de Hacienda
MH_API_URL=https://apitest.dtes.mh.gob.sv
MH_AUTH_URL=https://apitest.dtes.mh.gob.sv/seguridad/auth

# Credenciales de Hacienda
CLAVE_API=TuClaveAPI
CLAVE_PUBLICA=TuClavePublica
CLAVE_PRIVADA=TuClavePrivada

# NIT del emisor (sin guiones)
NIT_EMISOR=070048272

# Ambiente: 00 = Pruebas, 01 = Producción
AMBIENTE=00
```

### 4. Levantar el contenedor Docker del Firmador

El firmador SVFE debe estar corriendo antes de ejecutar pruebas:

```bash
docker-compose up -d
```

Verificar que esté corriendo:

```bash
docker ps
```

Deberías ver el contenedor `svfe-api-firmador` activo en el puerto 8113.

### 5. Verificar el entorno

```bash
npm run test:env
```

Este comando verifica:
- ✓ Node.js instalado
- ✓ Dependencias npm instaladas
- ✓ Docker corriendo
- ✓ Contenedor firmador activo
- ✓ Variables de entorno configuradas
- ✓ Conectividad con API del MH

## 🧪 Ejecutar Pruebas

### Prueba Básica (Factura Electrónica)

```bash
npm test
```

Ejecuta la prueba básica que:
1. Verifica conectividad con el firmador Docker
2. Autentica con el Ministerio de Hacienda
3. Genera una Factura Electrónica (DTE-01)
4. Firma el documento
5. Envía a la API del MH
6. Valida respuesta y guarda logs

### Suite Completa de Pruebas

```bash
npm run test:all
```

Ejecuta todas las pruebas para todos los tipos de DTE, invalidaciones y contingencias.

### Pruebas Individuales por Tipo de DTE

```bash
npm run test:factura        # DTE-01 Factura
npm run test:ccf            # DTE-03 Comprobante Crédito Fiscal
npm run test:remision       # DTE-04 Nota de Remisión
npm run test:credito        # DTE-05 Nota de Crédito
npm run test:debito         # DTE-06 Nota de Débito
npm run test:exportacion    # DTE-11 Factura Exportación
npm run test:excluido       # DTE-14 Factura Sujeto Excluido
```

### Pruebas Especiales

```bash
npm run test:invalidacion   # Pruebas de anulación
npm run test:contingencia   # Pruebas de contingencia
npm run test:consulta       # Consulta de estado de DTEs
```

## 📁 Estructura del Proyecto

```
FAC-ELECTRONICA/
├── src/
│   ├── app.js                    # Servidor Express
│   ├── config/
│   │   └── env.js                # Configuración de variables de entorno
│   ├── controllers/
│   │   └── facturaController.js  # Controladores de endpoints
│   ├── routes/
│   │   └── facturaRoutes.js      # Rutas del API
│   ├── services/
│   │   ├── servicioDocker.js     # Comunicación con firmador
│   │   └── servicioMH.js         # Comunicación con MH
│   └── utils/
│       ├── calculadorIVA.js      # Cálculos de IVA y totales
│       └── generadorUUID.js      # Generación de códigos
├── tests/
│   ├── run_tests.js              # Suite principal de pruebas
│   ├── test_utils.js             # Utilidades de testing
│   ├── test_invalidacion.js      # Pruebas de anulación
│   ├── test_contingencia.js      # Pruebas de contingencia
│   ├── test_consulta.js          # Pruebas de consulta
│   └── data_generator.js         # Generador de datos de prueba
├── scripts/
│   ├── verificar_entorno.js      # Verificación de requisitos
│   └── ejecutar_suite_completa.js # Script maestro de pruebas
├── logs/                         # Logs de pruebas (generado)
├── temp/                         # Archivos temporales
├── .env                          # Variables de entorno (NO SUBIR A GIT)
├── compose.yml                   # Configuración Docker
├── package.json                  # Dependencias del proyecto
└── README.md                     # Este archivo
```

## 🔍 Logs y Resultados

Los resultados de las pruebas se guardan automáticamente en el directorio `logs/`:

- `exito_[codigoGeneracion].json` - DTEs procesados exitosamente
- `error_[codigoGeneracion].json` - DTEs rechazados con detalles
- `reporte_[fecha].json` - Reportes consolidados de pruebas

## 🛠️ Desarrollo

### Iniciar servidor en modo desarrollo

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

### Endpoints Disponibles

- `POST /api/factura/generar` - Genera y envía una factura
- `GET /api/factura/estado/:codigo` - Consulta estado de un DTE
- `POST /api/factura/invalidar` - Invalida un DTE

## 📚 Documentación Oficial

- [Portal Factura Electrónica MH](https://www.mh.gob.sv/pmh/es/Servicios/Servicios_en_Linea/Factura-Electronica.html)
- [Lineamientos Técnicos DTE](https://www.mh.gob.sv/downloads/pdf/factura-electronica/Documentos_Tecnicos/)
- [Portal de Emisores (Pruebas)](https://factel.gob.sv)

## ⚠️ Notas Importantes

1. **Ambiente de Pruebas**: Este proyecto está configurado por defecto para el ambiente de pruebas (`AMBIENTE=00`). Para producción, cambiar a `AMBIENTE=01` y actualizar las URLs del MH.

2. **Certificado Digital**: El firmador Docker debe tener configurado el certificado digital válido del emisor.

3. **Token de Autenticación**: El token del MH tiene validez de 24 horas. El sistema lo cachea automáticamente.

4. **Rate Limiting**: La API del MH puede tener límites de tasa. Espaciar las pruebas si se encuentran errores 429.

5. **Validación Estricta**: El MH valida estrictamente la estructura JSON. Cualquier campo faltante o inválido resultará en rechazo.

## 🐛 Solución de Problemas

### Error: "Docker Firmador no responde"

```bash
# Verificar que Docker esté corriendo
docker ps

# Reiniciar el contenedor
docker-compose restart

# Ver logs del firmador
docker logs svfe-api-firmador
```

### Error: "Fallo de autenticación MH"

- Verificar credenciales en `.env`
- Confirmar que el NIT sea correcto
- Validar que `CLAVE_API` sea la correcta

### Error: "Fallo al firmar"

- Verificar que el NIT tenga 14 dígitos (se rellena automáticamente)
- Confirmar que `CLAVE_PRIVADA` sea correcta
- Revisar logs del Docker: `docker logs svfe-api-firmador`

## 📞 Soporte

Para más información sobre el proceso de certificación ante el Ministerio de Hacienda:
- Sitio web: https://www.mh.gob.sv
- Correo soporte DTE: factura.electronica@mh.gob.sv

## 📄 Licencia

ISC

---

**Desarrollado para cumplir con los requisitos del Ministerio de Hacienda de El Salvador**
