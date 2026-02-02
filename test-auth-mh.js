/**
 * Script de prueba de autenticación directa con MH
 */

const axios = require('axios');

const testAuth = async () => {
    try {
        console.log('🔐 Probando autenticación con MH...');
        console.log('   NIT: 070048272');
        console.log('   URL: https://apitest.dtes.mh.gob.sv/seguridad/auth');

        const params = new URLSearchParams();
        params.append('user', '070048272');
        params.append('pwd', 'AlzeTech2005@26');

        const response = await axios.post(
            'https://apitest.dtes.mh.gob.sv/seguridad/auth',
            params,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        console.log('\n✅ Respuesta MH:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.status === 'OK') {
            console.log('\n✅ AUTENTICACIÓN EXITOSA');
        } else {
            console.log('\n❌ AUTENTICACIÓN FALLIDA');
        }

    } catch (error) {
        console.error('\n❌ Error de autenticación:');
        console.error('   Status:', error.response?.status);
        console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
        console.error('   Message:', error.message);
    }
};

testAuth();
